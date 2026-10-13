#!/usr/bin/env node
/**
 * k-tokens: show and apply token-saving Claude Code settings.
 *
 *   k-tokens.js status                       current values next to the recommended ones
 *   k-tokens.js apply [choices] [--dry-run]  merge only the chosen keys into settings.json
 *
 * Choices (leave one out to leave that setting alone):
 *   --ttl <1h|default>                      subagentPromptCacheTtl
 *   --compact <250000|200000|300000|default>  autoCompactWindow, in tokens
 *   --subagent-model <sonnet|inherit>       env.CLAUDE_CODE_SUBAGENT_MODEL
 *   --effort <high|default>                 modelSettings.<model-id>.effortLevel for Sonnet and Opus
 *   --rules <on|off>                        managed kstack-tokens block in CLAUDE.md
 *
 * Options: --settings <file>  --claude-md <file>  --backup-dir <dir>  --models <id,id>
 *
 * Only the chosen top-level keys are rewritten. Every other byte of settings.json stays as it
 * was. The file is backed up first and parsed again after the write. User errors print
 * "k-tokens error: ..." and exit 0, like the other K-stack scripts.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const CLAUDE_DIR = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
const BEGIN = '<!-- kstack-tokens: begin -->';
const END = '<!-- kstack-tokens: end -->';
// Model ids that get a saved effort level. Edit the list, or pass --models, when new models ship.
// modelSettings is keyed by full model id; a top-level effortLevel does not apply to Opus 5.5.
const EFFORT_MODELS = ['claude-sonnet-5-5', 'claude-opus-5-5'];
const COMPACT_MIN = 100000;
const COMPACT_MAX = 1000000;
const RECOMMENDED = { ttl: '1h', compact: 250000, subagentModel: 'sonnet', effort: 'high' };
// Environment variables that override the settings keys above (Claude Code settings docs).
const OVERRIDES = [
  ['CLAUDE_CODE_SUBAGENT_PROMPT_CACHE_TTL', 'subagent cache TTL'],
  ['FORCE_PROMPT_CACHING_5M', 'subagent cache TTL'],
  ['CLAUDE_CODE_AUTO_COMPACT_WINDOW', 'auto-compact window'],
  ['CLAUDE_CODE_SUBAGENT_MODEL_FORCE', 'default subagent model'],
  ['CLAUDE_CODE_EFFORT_LEVEL', 'effort'],
];

const RULES = [
  '## Token-efficient agent rules (written by /kstack:k-tokens apply; re-run to change)',
  '- Batch independent steps into fewer, bigger tool calls. Trim command output (head, tail, grep, summary flags) before it enters the context.',
  '- Crop and downscale images before reading them. An image stays in the context for every later request.',
  '- On slow builds and tests, use one long, quiet blocking wait. Do not poll: every wake-up re-reads the whole context.',
  '- Keep a HANDOVER.md current (state, decisions, next steps) so a fresh agent can take over instead of resuming a huge transcript.',
  '- One agent per job: build, test, self-review and fix in the same session.',
  '- Send log and test summaries to Haiku or another cheap headless model.',
  '- Prefer subagents for long jobs. Use workflows only for short, fixed fan-outs. An agent team costs a full instance per teammate.',
];

class UserError extends Error {}

// ---- Arguments ------------------------------------------------------------------------

function parseArgs(argv) {
  const o = {
    cmd: '',
    dryRun: false,
    settings: path.join(CLAUDE_DIR, 'settings.json'),
    claudeMd: path.join(CLAUDE_DIR, 'CLAUDE.md'),
    backupDir: path.join(CLAUDE_DIR, 'backups'),
    models: EFFORT_MODELS,
    choice: {},
  };
  const val = (i) => {
    if (i >= argv.length) throw new UserError(`${argv[i - 1]} needs a value`);
    return String(argv[i]).trim().toLowerCase();
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') o.dryRun = true;
    else if (a === '--settings') o.settings = argv[++i];
    else if (a === '--claude-md') o.claudeMd = argv[++i];
    else if (a === '--backup-dir') o.backupDir = argv[++i];
    else if (a === '--models') o.models = String(argv[++i]).split(',').map((s) => s.trim()).filter(Boolean);
    else if (a === '--ttl') o.choice.ttl = val(++i);
    else if (a === '--compact') o.choice.compact = val(++i);
    else if (a === '--subagent-model') o.choice.subagentModel = val(++i);
    else if (a === '--effort') o.choice.effort = val(++i);
    else if (a === '--rules') o.choice.rules = val(++i);
    else if (a.trim() === '') continue;
    else if (!o.cmd && !a.startsWith('-')) o.cmd = a.trim().toLowerCase();
    else throw new UserError(`unknown argument "${a}"`);
  }
  if (!o.cmd) o.cmd = 'status';
  return o;
}

function normalizeChoice(c) {
  const out = {};
  if (c.ttl !== undefined) {
    if (!['1h', 'default'].includes(c.ttl)) throw new UserError('--ttl takes 1h or default');
    out.ttl = c.ttl;
  }
  if (c.compact !== undefined) {
    if (c.compact === 'default') out.compact = 'default';
    else {
      const m = /^(\d+)(k?)$/.exec(c.compact);
      const n = m ? Number(m[1]) * (m[2] ? 1000 : 1) : NaN;
      if (!(n >= COMPACT_MIN && n <= COMPACT_MAX)) throw new UserError(`--compact takes a token count from ${COMPACT_MIN} to ${COMPACT_MAX}, or default`);
      out.compact = n;
    }
  }
  if (c.subagentModel !== undefined) {
    if (!['sonnet', 'haiku', 'opus', 'inherit'].includes(c.subagentModel)) throw new UserError('--subagent-model takes sonnet, haiku, opus or inherit');
    out.subagentModel = c.subagentModel;
  }
  if (c.effort !== undefined) {
    if (!['low', 'medium', 'high', 'xhigh'].includes(c.effort)) throw new UserError('--effort takes low, medium, high or xhigh');
    out.effort = c.effort;
  }
  if (c.rules !== undefined) {
    if (!['on', 'off'].includes(c.rules)) throw new UserError('--rules takes on or off');
    out.rules = c.rules;
  }
  return out;
}

// ---- Minimal JSON text patcher --------------------------------------------------------
// Finds the span of each top-level property so one key can be replaced, added or removed
// without re-serializing the rest of the file.

function skipWs(t, i) {
  while (i < t.length && /\s/.test(t[i])) i++;
  return i;
}

function skipString(t, i) {
  i++;
  while (i < t.length && t[i] !== '"') i += t[i] === '\\' ? 2 : 1;
  if (i >= t.length) throw new UserError('settings file is not valid JSON (unterminated string)');
  return i + 1;
}

function skipValue(t, i) {
  const c = t[i];
  if (c === '"') return skipString(t, i);
  if (c === '{' || c === '[') {
    let depth = 0;
    for (; i < t.length; i++) {
      const ch = t[i];
      if (ch === '"') i = skipString(t, i) - 1;
      else if (ch === '{' || ch === '[') depth++;
      else if (ch === '}' || ch === ']') {
        depth--;
        if (depth === 0) return i + 1;
      }
    }
    throw new UserError('settings file is not valid JSON (unbalanced brackets)');
  }
  while (i < t.length && !/[,}\]\s]/.test(t[i])) i++;
  return i;
}

function topLevel(t) {
  let i = skipWs(t, t.charCodeAt(0) === 0xfeff ? 1 : 0);
  if (t[i] !== '{') throw new UserError('settings file is not a JSON object');
  const open = i++;
  const props = [];
  for (;;) {
    i = skipWs(t, i);
    if (i >= t.length) throw new UserError('settings file is not valid JSON (no closing brace)');
    if (t[i] === '}') return { open, close: i, props };
    if (t[i] === ',') {
      i++;
      continue;
    }
    if (t[i] !== '"') throw new UserError('settings file is not valid JSON (expected a key)');
    const ks = i;
    const ke = skipString(t, i);
    i = skipWs(t, ke);
    if (t[i] !== ':') throw new UserError('settings file is not valid JSON (expected a colon)');
    i = skipWs(t, i + 1);
    const vs = i;
    const ve = skipValue(t, i);
    props.push({ key: JSON.parse(t.slice(ks, ke)), ks, vs, ve });
    i = ve;
  }
}

function indentOf(t, props) {
  if (!props.length) return '  ';
  const ks = props[0].ks;
  const nl = t.lastIndexOf('\n', ks);
  const lead = nl >= 0 ? t.slice(nl + 1, ks) : '';
  return /^\s+$/.test(lead) ? lead : '  ';
}

function render(value, unit) {
  return JSON.stringify(value, null, unit).split('\n').join(`\n${unit}`);
}

function setKey(t, key, value) {
  const { open, close, props } = topLevel(t);
  const unit = indentOf(t, props);
  const hit = props.find((p) => p.key === key);
  if (hit) return t.slice(0, hit.vs) + render(value, unit) + t.slice(hit.ve);
  const entry = `${JSON.stringify(key)}: ${render(value, unit)}`;
  if (!props.length) return `${t.slice(0, open + 1)}\n${unit}${entry}\n${t.slice(close)}`;
  const last = props[props.length - 1];
  return `${t.slice(0, last.ve)},\n${unit}${entry}${t.slice(last.ve)}`;
}

function removeKey(t, key) {
  const { open, close, props } = topLevel(t);
  const idx = props.findIndex((p) => p.key === key);
  if (idx < 0) return t;
  if (props.length === 1) return `${t.slice(0, open + 1)}${t.slice(close)}`;
  if (idx === props.length - 1) return t.slice(0, props[idx - 1].ve) + t.slice(props[idx].ve);
  return t.slice(0, props[idx].ks) + t.slice(props[idx + 1].ks);
}

// ---- Planning -------------------------------------------------------------------------

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// Returns the desired top-level values: { key: value | undefined (remove) } and a change list.
function plan(settings, choice, models) {
  const want = {};
  const changes = [];
  const note = (name, from, to) => {
    if (!same(from, to)) changes.push({ name, from, to });
  };

  if (choice.ttl) {
    const to = choice.ttl === 'default' ? undefined : choice.ttl;
    want.subagentPromptCacheTtl = to;
    note('subagentPromptCacheTtl', settings.subagentPromptCacheTtl, to);
  }
  if (choice.compact !== undefined) {
    const to = choice.compact === 'default' ? undefined : choice.compact;
    want.autoCompactWindow = to;
    note('autoCompactWindow', settings.autoCompactWindow, to);
  }
  if (choice.subagentModel) {
    const env = { ...(isObject(settings.env) ? settings.env : {}) };
    const from = env.CLAUDE_CODE_SUBAGENT_MODEL;
    const to = choice.subagentModel === 'inherit' ? undefined : choice.subagentModel;
    if (to === undefined) delete env.CLAUDE_CODE_SUBAGENT_MODEL;
    else env.CLAUDE_CODE_SUBAGENT_MODEL = to;
    if (!same(from, to)) {
      want.env = env;
      note('env.CLAUDE_CODE_SUBAGENT_MODEL', from, to);
    }
  }
  if (choice.effort) {
    const ms = { ...(isObject(settings.modelSettings) ? settings.modelSettings : {}) };
    let touched = false;
    for (const id of models) {
      const cur = isObject(ms[id]) ? ms[id] : {};
      note(`modelSettings.${id}.effortLevel`, cur.effortLevel, choice.effort);
      if (cur.effortLevel !== choice.effort) {
        ms[id] = { ...cur, effortLevel: choice.effort };
        touched = true;
      }
    }
    if (touched) want.modelSettings = ms;
  }
  return { want, changes };
}

function isObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function patchSettings(text, want) {
  let next = text;
  for (const [key, value] of Object.entries(want)) next = value === undefined ? removeKey(next, key) : setKey(next, key, value);
  return next;
}

// ---- Files ----------------------------------------------------------------------------

const tilde = (p) => {
  const h = os.homedir().replace(/\\/g, '/');
  const q = String(p).replace(/\\/g, '/');
  return q.startsWith(h) ? `~${q.slice(h.length)}` : q;
};

function readText(file) {
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
}

function parseSettings(text) {
  if (text.trim() === '') return {};
  let v;
  try {
    v = JSON.parse(text.replace(/^﻿/, ''));
  } catch (e) {
    throw new UserError(`settings file is not valid JSON: ${e.message}`);
  }
  if (!isObject(v)) throw new UserError('settings file is not a JSON object');
  return v;
}

function atomicWrite(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.k-tokens.${process.pid}.tmp`;
  fs.writeFileSync(tmp, text);
  fs.renameSync(tmp, file);
}

function backup(file, dir) {
  if (!fs.existsSync(file)) return null;
  fs.mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..*/, '').replace('T', '-');
  let dest = path.join(dir, `${path.basename(file)}.${stamp}.bak`);
  for (let n = 1; fs.existsSync(dest); n++) dest = path.join(dir, `${path.basename(file)}.${stamp}-${n}.bak`);
  fs.copyFileSync(file, dest);
  return dest;
}

// The managed CLAUDE.md block follows the k-effort pattern: replace in place, else append.
function readBlock(text) {
  const b = text.indexOf(BEGIN);
  const e = text.indexOf(END);
  return b < 0 || e < b ? null : { b, e };
}

function withBlock(text, on) {
  const hit = readBlock(text);
  if (!on) {
    if (!hit) return text;
    const before = text.slice(0, hit.b).replace(/\n+$/, '');
    const after = text.slice(hit.e + END.length).replace(/^\n+/, '');
    const joined = before && after ? `${before}\n\n${after}` : `${before}${after}`;
    return joined === '' ? '' : `${joined.replace(/\n*$/, '')}\n`;
  }
  const rendered = [BEGIN, ...RULES, END].join('\n');
  if (hit) return text.slice(0, hit.b) + rendered + text.slice(hit.e + END.length);
  return text + (text === '' || text.endsWith('\n\n') ? '' : text.endsWith('\n') ? '\n' : '\n\n') + rendered + '\n';
}

// ---- Diff for dry runs ----------------------------------------------------------------

// Line diff by longest common subsequence. Settings files are small, so this stays cheap.
function miniDiff(a, b) {
  if (a === b) return '(no text change)';
  const x = a.replace(/\n$/, '').split('\n');
  const y = b.replace(/\n$/, '').split('\n');
  const t = Array.from({ length: x.length + 1 }, () => new Uint32Array(y.length + 1));
  for (let i = x.length - 1; i >= 0; i--) for (let j = y.length - 1; j >= 0; j--) t[i][j] = x[i] === y[j] ? t[i + 1][j + 1] + 1 : Math.max(t[i + 1][j], t[i][j + 1]);
  const out = [];
  let i = 0;
  let j = 0;
  while (i < x.length || j < y.length) {
    if (i < x.length && j < y.length && x[i] === y[j]) {
      i++;
      j++;
    } else if (j < y.length && (i === x.length || t[i][j + 1] >= t[i + 1][j])) out.push(`+ ${y[j++]}`);
    else out.push(`- ${x[i++]}`);
  }
  return out.join('\n');
}

// ---- Commands -------------------------------------------------------------------------

const show = (v) => (v === undefined ? '(unset)' : typeof v === 'string' ? v : JSON.stringify(v));

function status(o) {
  const text = readText(o.settings);
  const s = parseSettings(text);
  const env = isObject(s.env) ? s.env : {};
  const ms = isObject(s.modelSettings) ? s.modelSettings : {};
  const rows = [
    ['Subagent cache TTL', s.subagentPromptCacheTtl, RECOMMENDED.ttl, 'subagentPromptCacheTtl'],
    ['Auto-compact window', s.autoCompactWindow, RECOMMENDED.compact, 'autoCompactWindow'],
    ['Default subagent model', env.CLAUDE_CODE_SUBAGENT_MODEL, RECOMMENDED.subagentModel, 'env.CLAUDE_CODE_SUBAGENT_MODEL'],
    ...o.models.map((id) => [`Effort, ${id.replace(/^claude-/, '')}`, isObject(ms[id]) ? ms[id].effortLevel : undefined, RECOMMENDED.effort, `modelSettings.${id}.effortLevel`]),
  ];
  const block = readBlock(readText(o.claudeMd)) ? 'present' : 'missing';
  const w = 26;
  const L = [`K-stack token settings (${tilde(o.settings)})`, `${'setting'.padEnd(w)}${'current'.padEnd(14)}${'recommended'.padEnd(13)}key`];
  for (const [name, cur, rec, key] of rows) L.push(`${name.padEnd(w)}${show(cur).padEnd(14)}${show(rec).padEnd(13)}${key}${same(cur, rec) ? '  (ok)' : ''}`);
  L.push(`${'Agent rules block'.padEnd(w)}${block.padEnd(14)}${'present'.padEnd(13)}${tilde(o.claudeMd)}${block === 'present' ? '  (ok)' : ''}`);
  const active = OVERRIDES.filter(([n]) => process.env[n] !== undefined || env[n] !== undefined);
  for (const [n, what] of active) L.push(`Note: ${n} is set and overrides the ${what} setting.`);
  if (s.effortLevel !== undefined) L.push(`Note: top-level effortLevel is "${s.effortLevel}". It does not apply to Opus 5.5, so apply writes per-model levels.`);
  return L.join('\n');
}

function apply(o) {
  const choice = normalizeChoice(o.choice);
  if (!Object.keys(choice).length) throw new UserError('nothing chosen. Pass at least one of --ttl, --compact, --subagent-model, --effort, --rules');
  const before = readText(o.settings);
  const parsed = parseSettings(before);
  const { want, changes } = plan(parsed, choice, o.models);
  const L = [];

  // Settings.json
  let after = before;
  if (Object.keys(want).length) {
    after = patchSettings(before.trim() === '' ? '{}\n' : before, want);
    const check = parseSettings(after);
    const expect = { ...parsed };
    for (const [k, v] of Object.entries(want)) {
      if (v === undefined) delete expect[k];
      else expect[k] = v;
    }
    if (!same(sortKeys(check), sortKeys(expect))) throw new UserError('the merge did not reproduce the expected settings. Nothing was written.');
    for (const k of Object.keys(parsed)) if (!(k in want) && !same(parsed[k], check[k])) throw new UserError(`the merge touched "${k}". Nothing was written.`);
  }
  L.push(`${o.dryRun ? 'Dry run: no files written.' : 'Applied.'} Settings file: ${tilde(o.settings)}`);
  if (changes.length) for (const c of changes) L.push(`  ${c.name}: ${show(c.from)} -> ${c.to === undefined ? '(removed)' : show(c.to)}`);
  else L.push('  settings.json: already as chosen, no change');

  // CLAUDE.md block
  const mdBefore = readText(o.claudeMd);
  const mdAfter = choice.rules ? withBlock(mdBefore, choice.rules === 'on') : mdBefore;
  if (choice.rules) {
    const had = readBlock(mdBefore) !== null;
    const verb = mdAfter === mdBefore ? 'already as chosen, no change' : choice.rules === 'on' ? (had ? 'block updated' : 'block added') : 'block removed';
    L.push(`  ${tilde(o.claudeMd)}: ${verb}`);
  }

  if (o.dryRun) {
    if (after !== before) L.push('', `Text change in settings.json:`, miniDiff(before, after));
    if (mdAfter !== mdBefore) L.push('', `Text change in CLAUDE.md:`, miniDiff(mdBefore, mdAfter));
    return L.join('\n');
  }

  const saved = [];
  if (after !== before) {
    const bak = backup(o.settings, o.backupDir);
    atomicWrite(o.settings, after);
    try {
      parseSettings(readText(o.settings));
    } catch (e) {
      if (bak) fs.copyFileSync(bak, o.settings);
      throw new UserError(`the written file did not parse, the backup was restored. ${e.message}`);
    }
    if (bak) saved.push(bak);
  }
  if (mdAfter !== mdBefore) {
    const bak = backup(o.claudeMd, o.backupDir);
    atomicWrite(o.claudeMd, mdAfter);
    if (bak) saved.push(bak);
  }
  for (const b of saved) L.push(`  backup: ${tilde(b)}`);
  if (changes.length || mdAfter !== mdBefore) L.push('Settings are read at session start. Restart open sessions to pick them up.');
  return L.join('\n');
}

function sortKeys(v) {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (isObject(v)) return Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortKeys(v[k])]));
  return v;
}

function main() {
  try {
    const o = parseArgs(process.argv.slice(2));
    if (o.cmd === 'status') console.log(status(o));
    else if (o.cmd === 'apply') console.log(apply(o));
    else throw new UserError(`unknown command "${o.cmd}". Use status or apply`);
  } catch (e) {
    if (e instanceof UserError) console.log(`k-tokens error: ${e.message}`);
    else throw e;
  }
}

if (require.main === module) main();
