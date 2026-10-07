#!/usr/bin/env node
/**
 * k-effort: switch K-stack's routing preset the way /effort switches the session's effort.
 *
 *   k-effort.js [status]                 show the active and saved routing
 *   k-effort.js <lean|balanced|quality>  set it, save it as the default, apply it now
 *   k-effort.js <up|down>                one preset step
 *   k-effort.js <preset|up|down> session apply to this session only, do not save
 *   k-effort.js burn [off]               session-only Burn, never saved
 *   k-effort.js set <preset> [role=tier ...] [--haiku on|off]   k-setup's writer
 *   k-effort.js hook                     SessionStart hook: re-inject session routing
 *
 * Options: --session-id <id>  --data <dir>  --claude-md <file>
 *
 * The presets are parsed from k-mode/references/routing.md so the table there stays
 * the single source of truth. User errors print "k-effort error: ..." and exit 0:
 * a non-zero exit aborts the skill render and hides the message from the user.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const PLUGIN_ROOT = path.resolve(__dirname, '..', '..', '..');
const ROUTING_MD = path.join(PLUGIN_ROOT, 'skills', 'k-mode', 'references', 'routing.md');
const AGENTS_DIR = path.join(PLUGIN_ROOT, 'agents');
const LADDER = ['lean', 'balanced', 'quality'];
const BURN_ROLES = ['build', 'build-hard', 'design', 'review', 'sweep'];
const HAIKU_FALLBACK = 'sonnet-low';
const BEGIN = '<!-- kstack-routing: begin -->';
const END = '<!-- kstack-routing: end -->';
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

class UserError extends Error {}

function loadPresets() {
  const lines = fs.readFileSync(ROUTING_MD, 'utf8').split('\n');
  const start = lines.findIndex((l) => /^\|\s*Role\s*\|/.test(l));
  if (start < 0) throw new Error(`no "| Role |" table in ${ROUTING_MD}`);
  const cells = (l) => l.split('|').slice(1, -1).map((c) => c.replace(/[*`]/g, '').trim());
  const header = cells(lines[start]).map((h) => h.toLowerCase());
  const presets = {};
  for (const p of LADDER) {
    if (header.indexOf(p) < 0) throw new Error(`routing.md Roles table has no "${p}" column`);
    presets[p] = {};
  }
  for (let i = start + 2; i < lines.length && lines[i].startsWith('|'); i++) {
    const row = cells(lines[i]);
    for (const p of LADDER) presets[p][row[0]] = row[header.indexOf(p)];
  }
  return presets;
}

function knownTiers() {
  return new Set(
    fs.readdirSync(AGENTS_DIR)
      .map((f) => f.match(/^k-(.+)\.md$/))
      .filter(Boolean)
      .map((m) => m[1])
  );
}

function readBlock(file) {
  const text = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  const b = text.indexOf(BEGIN);
  const e = text.indexOf(END);
  if (b < 0 || e < b) return { text, block: null };
  const body = text.slice(b + BEGIN.length, e);
  const roles = {};
  for (const m of body.matchAll(/^([a-z][a-z-]*):\s*([a-z][a-z-]*)\s*$/gm)) roles[m[1]] = m[2];
  return {
    text,
    b,
    e,
    block: {
      preset: (body.match(/^# preset:\s*(\S+)/m) || [])[1] || 'custom',
      haiku: !/^# haiku:\s*off\b/m.test(body),
      roles,
    },
  };
}

// Fills roles the block predates (e.g. `scan` before 1.2.0) from the block's own preset column.
function completeRoles(roles, preset, presets) {
  const base = presets[LADDER.includes(preset) ? preset : 'balanced'];
  return { ...base, ...roles };
}

function applyHaiku(roles, haiku) {
  if (haiku) return roles;
  return Object.fromEntries(
    Object.entries(roles).map(([r, t]) => [r, t.startsWith('haiku-') ? HAIKU_FALLBACK : t])
  );
}

function validate(roles, tiers) {
  for (const [role, tier] of Object.entries(roles)) {
    if (tier === 'inherit') continue;
    if (/-max$/.test(tier)) throw new UserError(`${role}: ${tier} is a Max tier; Max is reached only through Burn`);
    if (!tiers.has(tier)) throw new UserError(`${role}: unknown tier "${tier}" (known: ${[...tiers].sort().join(', ')})`);
  }
}

function renderBlock(state) {
  return [
    BEGIN,
    '## K-stack routing (written by /kstack:k-setup or /kstack:k-effort; re-run to change)',
    `# preset: ${state.preset}`,
    ...(state.haiku ? [] : ['# haiku: off']),
    'Delegate by role. Call Agent with subagent_type "kstack:k-<tier>" and omit model. Max tiers only on explicit "burn".',
    ...Object.entries(applyHaiku(state.roles, state.haiku)).map(([r, t]) => `${r}: ${t}`),
    END,
  ].join('\n');
}

function writeBlock(file, state) {
  const { text, block, b, e } = readBlock(file);
  const rendered = renderBlock(state);
  const next = block
    ? text.slice(0, b) + rendered + text.slice(e + END.length)
    : text + (text === '' || text.endsWith('\n\n') ? '' : text.endsWith('\n') ? '\n' : '\n\n') + rendered + '\n';
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.k-effort.${process.pid}.tmp`;
  fs.writeFileSync(tmp, next);
  fs.renameSync(tmp, file);
}

function sessionFile(opts) {
  if (!opts.data || !opts.sessionId) return null;
  return path.join(opts.data, 'k-effort', 'sessions', `${opts.sessionId.replace(/[^\w-]/g, '_')}.json`);
}

function readSession(opts) {
  const f = sessionFile(opts);
  if (!f || !fs.existsSync(f)) return null;
  try {
    return JSON.parse(fs.readFileSync(f, 'utf8'));
  } catch {
    return null;
  }
}

function writeSession(opts, state) {
  const f = sessionFile(opts);
  if (!f) return;
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, JSON.stringify({ ...state, updated: new Date().toISOString() }, null, 2));
  const now = Date.now();
  for (const name of fs.readdirSync(path.dirname(f))) {
    const p = path.join(path.dirname(f), name);
    try {
      if (now - fs.statSync(p).mtimeMs > SESSION_TTL_MS) fs.unlinkSync(p);
    } catch {}
  }
}

function savedState(opts, presets) {
  const { block } = readBlock(opts.claudeMd);
  if (!block) return { preset: 'balanced', haiku: true, roles: { ...presets.balanced }, source: 'default (no block)' };
  return {
    preset: block.preset,
    haiku: block.haiku,
    roles: completeRoles(block.roles, block.preset, presets),
    source: opts.claudeMd,
  };
}

function activeState(opts, presets) {
  const session = readSession(opts);
  if (session) return { ...session, source: `this session (${session.scope})` };
  return { ...savedState(opts, presets), burn: false, scope: 'saved' };
}

/**
 * Steps a custom routing (one not equal to any preset column) one notch up or down.
 *
 * roles:     { role: tier } as currently active, e.g. { build: 'sonnet-xhigh', docs: 'haiku-xhigh', ... }
 * direction: +1 for up, -1 for down
 * presets:   { lean: {...}, balanced: {...}, quality: {...} } parsed from routing.md
 *
 * Return the new { role: tier } map, or null to refuse the step and keep the custom routing.
 */
function stepCustom(roles, direction, presets) {
  // TODO(you): decide what "up" means for a hand-tuned routing.
  return null;
}

function step(current, direction, presets) {
  const i = LADDER.indexOf(current.preset);
  if (i < 0) {
    const roles = stepCustom(current.roles, direction, presets);
    if (!roles) throw new UserError(`the active routing is custom; pick a preset by name (${LADDER.join(', ')}) or re-run /kstack:k-setup`);
    return { preset: 'custom', roles };
  }
  const j = i + direction;
  if (j < 0) throw new UserError('already at lean, the lowest preset');
  if (j >= LADDER.length) throw new UserError('already at quality, the highest preset. The step above is Burn: /kstack:k-effort burn');
  return { preset: LADDER[j], roles: { ...presets[LADDER[j]] } };
}

function effectiveRoles(state) {
  const roles = applyHaiku(state.roles, state.haiku);
  if (!state.burn) return roles;
  return Object.fromEntries(Object.entries(roles).map(([r, t]) => [r, BURN_ROLES.includes(r) ? 'opus-max' : t]));
}

function describe(state, headline) {
  const roles = effectiveRoles(state);
  const width = Math.max(...Object.keys(roles).map((r) => r.length));
  return [
    headline,
    '',
    ...Object.entries(roles).map(([r, t]) => `  ${r.padEnd(width)}  →  kstack:k-${t}`),
    '',
    `burn: ${state.burn ? 'on (session only, never saved)' : 'off'}`,
    ...(state.haiku ? [] : [`haiku: off (haiku tiers run as ${HAIKU_FALLBACK})`]),
  ].join('\n');
}

function parseArgs(argv) {
  const opts = {
    sessionId: process.env.CLAUDE_SESSION_ID || '',
    data: process.env.CLAUDE_PLUGIN_DATA || '',
    claudeMd: path.join(os.homedir(), '.claude', 'CLAUDE.md'),
    haiku: undefined,
  };
  const pos = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--session-id') opts.sessionId = argv[++i] || '';
    else if (a === '--data') opts.data = argv[++i] || '';
    else if (a === '--claude-md') opts.claudeMd = argv[++i];
    else if (a === '--haiku') opts.haiku = argv[++i] !== 'off';
    else if (a.trim() !== '') pos.push(a.trim().toLowerCase());
  }
  return { opts, pos };
}

async function runHook(opts, presets) {
  let input = '';
  for await (const chunk of process.stdin) input += chunk;
  let data = {};
  try {
    data = JSON.parse(input);
  } catch {}
  const session = readSession({ ...opts, sessionId: data.session_id || '' });
  if (!session) return;
  const text = describe(session, `K-stack routing for this session, set earlier by /kstack:k-effort (${session.scope}). It overrides the kstack-routing block in CLAUDE.md:`);
  console.log(JSON.stringify({ hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: text } }));
}

function run(opts, pos, presets) {
  const tiers = knownTiers();
  const [verb = 'status', ...rest] = pos;
  const sessionOnly = rest.includes('session');
  const current = activeState(opts, presets);

  if (verb === 'status') {
    const saved = savedState(opts, presets);
    const lines = [describe(current, `k-effort: ${current.preset}${current.burn ? ' + burn' : ''} (from ${current.source})`)];
    if (current.scope !== 'saved' || current.burn) lines.push(`saved default: ${saved.preset} (${saved.source})`);
    lines.push('', `levels: ${LADDER.join(' < ')} < burn`);
    return lines.join('\n');
  }

  if (verb === 'burn') {
    const off = rest.includes('off');
    const next = { ...current, burn: !off };
    delete next.source;
    writeSession(opts, next);
    return describe(next, off ? 'k-effort: burn off. Back to the routing below.' : `k-effort: burn on for this session on top of ${current.preset}.`);
  }

  let target;
  if (verb === 'up' || verb === 'down') target = step(current, verb === 'up' ? 1 : -1, presets);
  else if (LADDER.includes(verb)) target = { preset: verb, roles: { ...presets[verb] } };
  else if (verb === 'set') {
    const base = rest[0];
    if (!LADDER.includes(base)) throw new UserError(`set needs a base preset (${LADDER.join(', ')}), got "${base || ''}"`);
    const overrides = Object.fromEntries(rest.slice(1).filter((a) => a.includes('=')).map((a) => a.split('=', 2)));
    const roles = { ...presets[base], ...overrides };
    const custom = Object.entries(overrides).some(([r, t]) => presets[base][r] !== t);
    target = { preset: custom ? 'custom' : base, roles };
  } else throw new UserError(`unknown level "${verb}". Use: ${LADDER.join(', ')}, up, down, burn, status`);

  const haiku = opts.haiku !== undefined ? opts.haiku : current.haiku !== false;
  const next = { preset: target.preset, haiku, roles: target.roles, burn: false, scope: sessionOnly ? 'session only' : 'saved' };
  validate(applyHaiku(next.roles, haiku), tiers);
  if (!sessionOnly) writeBlock(opts.claudeMd, next);
  writeSession(opts, next);
  const where = sessionOnly ? 'this session only, not saved' : `saved as the default in ${opts.claudeMd}, active now`;
  return describe(next, `k-effort: ${next.preset} (${where})`);
}

async function main() {
  const { opts, pos } = parseArgs(process.argv.slice(2));
  try {
    const presets = loadPresets();
    if (pos[0] === 'hook') return await runHook(opts, presets);
    console.log(run(opts, pos, presets));
  } catch (err) {
    if (pos[0] === 'hook') return;
    console.log(`k-effort error: ${err.message}`);
    if (!(err instanceof UserError)) console.log('(internal error; routing was not changed)');
  }
}

if (require.main === module) main();

module.exports = { loadPresets, readBlock, renderBlock, stepCustom };
