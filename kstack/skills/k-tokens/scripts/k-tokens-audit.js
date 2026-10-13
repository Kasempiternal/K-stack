#!/usr/bin/env node
/**
 * k-tokens-audit: report where Claude Code token use goes, from the local transcripts.
 *
 *   k-tokens-audit.js [--days N] [--project <substring>] [--json] [--projects-dir <dir>]
 *
 * Reads ~/.claude/projects/**\/*.jsonl, including subagent and workflow transcripts.
 * Nothing leaves the machine. The transcript entry format is internal to Claude Code and
 * changes between versions, so every field is read defensively and missing ones are skipped.
 * User errors print "k-tokens error: ..." and exit 0, like the other K-stack scripts.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { StringDecoder } = require('string_decoder');

// ---- Editable settings ----------------------------------------------------------------

// Approximate API list prices in USD per million tokens: [input, output, cache read, 5m write, 1h write].
// Edit these to match the current price list. Keys match the start of the model id after "claude-".
// Plan usage meters are not proportional to list price, so read the cost column as a relative
// weight between models and token kinds, not as a bill.
const PRICE = {
  'opus-5-5': [4, 20, 0.2, 5, 8],
  'opus-5': [5, 25, 0.5, 6.25, 10],
  'opus-4': [5, 25, 0.5, 6.25, 10],
  'sonnet-5-5': [2, 10, 0.2, 2.5, 4],
  'sonnet-5': [2, 10, 0.2, 2.5, 4],
  'sonnet-4': [3, 15, 0.3, 3.75, 6],
  'haiku-5-5': [0.1, 0.5, 0.01, 0.125, 0.2],
  'haiku-4': [1, 5, 0.1, 1.25, 2],
  fable: [10, 50, 0.25, 12.5, 20],
};
// Used when the exact version is not in the table: the newest known price of the family.
const FAMILY_FALLBACK = { opus: 'opus-5-5', sonnet: 'sonnet-5-5', haiku: 'haiku-5-5', fable: 'fable' };

const CACHE_TTL_SHORT_S = 5 * 60;
const CACHE_TTL_LONG_S = 60 * 60;
const IDLE_MIN_WRITE_TOKENS = 20000; // a cache write below this is not worth calling a rewrite
const IDLE_MIN_WRITE_SHARE = 0.5; // "writes most of its context to cache"
const CTX_BUCKETS = [50e3, 100e3, 200e3, 400e3]; // upper edges, tokens
const WAIT_TOOLS = new Set(['Monitor', 'TaskOutput', 'ScheduleWakeup']);
const WAIT_CMD = /\b(sleep|start-sleep|wait|wait-process|poll\w*)\b/i;
const IMAGE_EXT = /\.(png|jpe?g|webp|bmp|gif)$/i;

// Thresholds that turn numbers into advice.
const ADVICE = {
  idleCostShare: 0.05,
  waitRequestShare: 0.05,
  bigContextShare: 0.15, // share of requests above 200k tokens
  opusAgentCostShare: 0.3,
  longAgentRequests: 150,
};

// ---- Helpers --------------------------------------------------------------------------

class UserError extends Error {}

function parseArgs(argv) {
  const opts = {
    days: 0,
    project: '',
    json: false,
    projectsDir: path.join(process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude'), 'projects'),
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--days') opts.days = Number(argv[++i]);
    else if (a === '--project') opts.project = String(argv[++i] || '').toLowerCase();
    else if (a === '--projects-dir') opts.projectsDir = argv[++i];
    else if (a === '--json') opts.json = true;
    else if (a.trim() !== '') throw new UserError(`unknown argument "${a}". Options: --days N, --project <substring>, --json`);
  }
  if (!Number.isFinite(opts.days) || opts.days < 0) throw new UserError('--days needs a positive number');
  return opts;
}

function walk(dir, out) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith('.jsonl')) out.push(p);
  }
  return out;
}

// Reads a file line by line without holding it all in memory.
function forEachLine(file, cb) {
  const fd = fs.openSync(file, 'r');
  const buf = Buffer.allocUnsafe(1 << 20);
  const dec = new StringDecoder('utf8');
  let rest = '';
  try {
    for (;;) {
      const n = fs.readSync(fd, buf, 0, buf.length, null);
      if (n === 0) break;
      const parts = (rest + dec.write(buf.subarray(0, n))).split('\n');
      rest = parts.pop();
      for (const line of parts) cb(line);
    }
    rest += dec.end();
    if (rest) cb(rest);
  } finally {
    fs.closeSync(fd);
  }
}

function priceFor(model) {
  const m = String(model || '').replace(/^claude-/, '');
  let best = null;
  for (const k of Object.keys(PRICE)) if (m.startsWith(k) && (!best || k.length > best.length)) best = k;
  if (best) return { row: PRICE[best], exact: true };
  for (const fam of Object.keys(FAMILY_FALLBACK)) if (m.includes(fam)) return { row: PRICE[FAMILY_FALLBACK[fam]], exact: false };
  return { row: null, exact: false };
}

function family(model) {
  const m = String(model || '');
  for (const fam of Object.keys(FAMILY_FALLBACK)) if (m.includes(fam)) return fam;
  return 'other';
}

function groupOf(file) {
  const p = file.replace(/\\/g, '/');
  if (p.includes('/workflows/')) return 'workflow-agent';
  if (p.includes('/subagents/')) return 'subagent';
  return 'session';
}

function num(v) {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

function seconds(ts) {
  const t = Date.parse(ts);
  return Number.isFinite(t) ? t / 1000 : null;
}

function effortOf(d) {
  const v = d.effort !== undefined ? d.effort : d.perTurnEffort;
  if (typeof v === 'string' && v) return v;
  if (typeof v === 'number') return String(v);
  return null;
}

function readMeta(file) {
  try {
    return JSON.parse(fs.readFileSync(file.replace(/\.jsonl$/, '.meta.json'), 'utf8'));
  } catch {
    return {};
  }
}

// ---- Scanning -------------------------------------------------------------------------

// One transcript file -> its requests. A request is streamed as several assistant lines that
// share a requestId; the line with the most output tokens carries the final usage.
function scanFile(file, sinceS) {
  const reqs = new Map();
  let compactBoundary = 0;
  let compactSummary = 0;
  forEachLine(file, (line) => {
    const isAssistant = line.includes('"type":"assistant"');
    const isCompact = !isAssistant && (line.includes('"compact_boundary"') || line.includes('"isCompactSummary"'));
    if (!isAssistant && !isCompact) return;
    let d;
    try {
      d = JSON.parse(line);
    } catch {
      return;
    }
    if (isCompact) {
      if (d.subtype === 'compact_boundary') compactBoundary++;
      if (d.isCompactSummary === true) compactSummary++;
      return;
    }
    const m = d.message || {};
    const u = m.usage;
    const rid = d.requestId || m.id;
    if (!rid || !u || m.model === '<synthetic>') return;
    const t = seconds(d.timestamp);
    let r = reqs.get(rid);
    if (!r) {
      r = { rid, tFirst: t, tLast: t, model: m.model || '?', usage: u, effort: effortOf(d), tools: [] };
      reqs.set(rid, r);
    } else {
      if (t !== null) {
        r.tFirst = r.tFirst === null ? t : Math.min(r.tFirst, t);
        r.tLast = r.tLast === null ? t : Math.max(r.tLast, t);
      }
      if (num(u.output_tokens) >= num(r.usage.output_tokens)) r.usage = u;
      if (!r.effort) r.effort = effortOf(d);
    }
    for (const b of Array.isArray(m.content) ? m.content : []) {
      if (!b || b.type !== 'tool_use') continue;
      const input = b.input || {};
      r.tools.push({
        name: String(b.name || '?'),
        cmd: typeof input.command === 'string' ? input.command : '',
        file: typeof input.file_path === 'string' ? input.file_path : '',
      });
    }
  });
  let list = [...reqs.values()].sort((a, b) => (a.tFirst || 0) - (b.tFirst || 0));
  // Gaps are computed on the full transcript, then the window filter is applied.
  let prevEnd = null;
  let longTtl = false;
  for (const r of list) {
    r.gap = r.tFirst !== null && prevEnd !== null ? r.tFirst - prevEnd : null;
    if (num((r.usage.cache_creation || {}).ephemeral_1h_input_tokens) > 0) longTtl = true;
    r.longTtl = longTtl;
    if (r.tLast !== null) prevEnd = r.tLast;
  }
  if (sinceS) list = list.filter((r) => (r.tFirst || 0) >= sinceS);
  return { requests: list, compacts: Math.max(compactBoundary, compactSummary) };
}

function tokensOf(r) {
  const u = r.usage;
  const cc = u.cache_creation || {};
  const w1h = num(cc.ephemeral_1h_input_tokens);
  const w5raw = num(cc.ephemeral_5m_input_tokens);
  const cwTotal = num(u.cache_creation_input_tokens);
  // Older entries have only the total; treat it as 5 minute writes.
  const w5 = w5raw || w1h ? w5raw : cwTotal;
  return { input: num(u.input_tokens), output: num(u.output_tokens), cr: num(u.cache_read_input_tokens), w5, w1h, cw: w5 + w1h };
}

function costOf(model, t) {
  const p = priceFor(model);
  if (!p.row) return { cost: 0, priced: false, exact: false };
  const [pi, po, pr, p5, p1] = p.row;
  return { cost: (t.input * pi + t.output * po + t.cr * pr + t.w5 * p5 + t.w1h * p1) / 1e6, priced: true, exact: p.exact };
}

function pct(sorted, q) {
  if (!sorted.length) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
}

function share(a, b) {
  return b > 0 ? a / b : 0;
}

function audit(opts) {
  if (!fs.existsSync(opts.projectsDir)) throw new UserError(`no transcripts found at ${opts.projectsDir}`);
  const sinceS = opts.days ? Date.now() / 1000 - opts.days * 86400 : 0;
  const files = walk(opts.projectsDir, []).filter((f) => {
    if (opts.project && !path.relative(opts.projectsDir, f).toLowerCase().includes(opts.project)) return false;
    if (sinceS) {
      try {
        if (fs.statSync(f).mtimeMs / 1000 < sinceS) return false;
      } catch {
        return false;
      }
    }
    return true;
  });

  const seen = new Set();
  const A = {
    files: 0,
    requests: 0,
    duplicatesSkipped: 0,
    unpricedModels: new Set(),
    approxPriced: new Set(),
    models: {},
    groups: {},
    agentFiles: [],
    agentTypes: {},
    effort: {},
    idle: { count: 0, writeCost: 0, tokens: 0, byGroup: {}, avoidableWithLongTtlCost: 0, avoidableCount: 0 },
    ctx: [],
    ctxBuckets: new Array(CTX_BUCKETS.length + 1).fill(0),
    ctxCostOver200k: 0,
    compacts: 0,
    compactsByGroup: {},
    waits: { count: 0, cost: 0, byGroup: {} },
    imageReads: 0,
    totalCost: 0,
    span: { first: null, last: null },
  };
  const bump = (o, k, init) => (o[k] = o[k] || init());

  for (const file of files) {
    let scanned;
    try {
      scanned = scanFile(file, sinceS);
    } catch {
      continue;
    }
    if (!scanned.requests.length) continue;
    A.files++;
    const group = groupOf(file);
    A.compacts += scanned.compacts;
    A.compactsByGroup[group] = (A.compactsByGroup[group] || 0) + scanned.compacts;
    const meta = group === 'session' ? {} : readMeta(file);
    const fileRec = { group, cost: 0, requests: 0, ctxSum: 0, agentType: meta.agentType || '', description: meta.description || '', models: {} };

    for (const r of scanned.requests) {
      if (seen.has(r.rid)) {
        A.duplicatesSkipped++;
        continue;
      }
      seen.add(r.rid);
      const t = tokensOf(r);
      const c = costOf(r.model, t);
      if (!c.priced) A.unpricedModels.add(String(r.model));
      else if (!c.exact) A.approxPriced.add(String(r.model));
      const ctx = t.input + t.cr + t.cw;

      A.requests++;
      A.totalCost += c.cost;
      if (r.tFirst !== null) {
        A.span.first = A.span.first === null ? r.tFirst : Math.min(A.span.first, r.tFirst);
        A.span.last = A.span.last === null ? r.tFirst : Math.max(A.span.last, r.tFirst);
      }
      const M = bump(A.models, String(r.model), () => ({ requests: 0, input: 0, output: 0, cr: 0, w5: 0, w1h: 0, cost: 0 }));
      M.requests++;
      M.input += t.input;
      M.output += t.output;
      M.cr += t.cr;
      M.w5 += t.w5;
      M.w1h += t.w1h;
      M.cost += c.cost;
      const G = bump(A.groups, group, () => ({ requests: 0, cost: 0, files: new Set() }));
      G.requests++;
      G.cost += c.cost;
      G.files.add(file);
      fileRec.cost += c.cost;
      fileRec.requests++;
      fileRec.ctxSum += ctx;
      fileRec.models[String(r.model)] = (fileRec.models[String(r.model)] || 0) + c.cost;

      if (r.effort) {
        const key = `${family(r.model)}:${r.effort}`;
        A.effort[key] = (A.effort[key] || 0) + 1;
      }

      A.ctx.push(ctx);
      let bi = CTX_BUCKETS.findIndex((edge) => ctx < edge);
      if (bi < 0) bi = CTX_BUCKETS.length;
      A.ctxBuckets[bi]++;
      if (ctx >= 200e3) A.ctxCostOver200k += c.cost;

      // Idle cache rewrite: the previous request is older than the cache lifetime and this one
      // writes most of its context to cache again.
      const ttl = r.longTtl ? CACHE_TTL_LONG_S : CACHE_TTL_SHORT_S;
      if (r.gap !== null && r.gap > ttl && t.cw >= IDLE_MIN_WRITE_TOKENS && t.cw >= IDLE_MIN_WRITE_SHARE * ctx) {
        const p = priceFor(r.model).row;
        const writeCost = p ? (t.w5 * p[3] + t.w1h * p[4]) / 1e6 : 0;
        const I = A.idle;
        I.count++;
        I.tokens += t.cw;
        I.writeCost += writeCost;
        const IG = bump(I.byGroup, group, () => ({ count: 0, writeCost: 0 }));
        IG.count++;
        IG.writeCost += writeCost;
        // With a 1 hour cache the same context would have been read, and only a short tail written.
        if (!r.longTtl && r.gap <= CACHE_TTL_LONG_S && p) {
          I.avoidableCount++;
          I.avoidableWithLongTtlCost += writeCost - (t.cw * p[2]) / 1e6;
        }
      }

      // Waits and polls, by tool call.
      const isWait = r.tools.some((x) => WAIT_TOOLS.has(x.name) || ((x.name === 'Bash' || x.name === 'PowerShell') && WAIT_CMD.test(x.cmd)));
      if (isWait) {
        A.waits.count++;
        A.waits.cost += c.cost;
        const WG = bump(A.waits.byGroup, group, () => ({ count: 0, cost: 0 }));
        WG.count++;
        WG.cost += c.cost;
      }
      for (const x of r.tools) if (x.name === 'Read' && IMAGE_EXT.test(x.file)) A.imageReads++;
    }
    if (fileRec.requests && group !== 'session') A.agentFiles.push(fileRec);
  }

  for (const f of A.agentFiles) {
    const key = f.agentType || '(untyped)';
    const T = bump(A.agentTypes, key, () => ({ agents: 0, requests: 0, cost: 0, models: {} }));
    T.agents++;
    T.requests += f.requests;
    T.cost += f.cost;
    for (const [m, v] of Object.entries(f.models)) T.models[m] = (T.models[m] || 0) + v;
  }
  return A;
}

// ---- Report ---------------------------------------------------------------------------

function summarize(A, opts) {
  const ctxSorted = [...A.ctx].sort((a, b) => a - b);
  const agentCost = (A.groups.subagent ? A.groups.subagent.cost : 0) + (A.groups['workflow-agent'] ? A.groups['workflow-agent'].cost : 0);
  const agentOpus = A.agentFiles.reduce((s, f) => s + Object.entries(f.models).filter(([m]) => family(m) === 'opus').reduce((x, [, v]) => x + v, 0), 0);
  return {
    scope: { days: opts.days || null, project: opts.project || null, files: A.files, requests: A.requests, duplicatesSkipped: A.duplicatesSkipped, from: A.span.first, to: A.span.last },
    totalCost: A.totalCost,
    models: Object.entries(A.models).map(([model, v]) => ({ model, ...v })).sort((a, b) => b.cost - a.cost),
    groups: Object.entries(A.groups).map(([group, v]) => ({ group, requests: v.requests, files: v.files.size, cost: v.cost })).sort((a, b) => b.cost - a.cost),
    agentTypes: Object.entries(A.agentTypes).map(([agentType, v]) => ({ agentType, agents: v.agents, requests: v.requests, cost: v.cost })).sort((a, b) => b.cost - a.cost),
    topAgents: [...A.agentFiles]
      .sort((a, b) => b.cost - a.cost)
      .slice(0, 5)
      .map((f) => ({ group: f.group, agentType: f.agentType, description: String(f.description).slice(0, 48), requests: f.requests, meanContext: Math.round(f.ctxSum / f.requests), cost: f.cost, mainModel: Object.entries(f.models).sort((a, b) => b[1] - a[1])[0][0] })),
    agentOpusCostShare: share(agentOpus, agentCost),
    effort: A.effort,
    idle: { ...A.idle, costShare: share(A.idle.writeCost, A.totalCost) },
    context: {
      p50: pct(ctxSorted, 0.5),
      p90: pct(ctxSorted, 0.9),
      max: ctxSorted.length ? ctxSorted[ctxSorted.length - 1] : 0,
      buckets: A.ctxBuckets,
      bucketEdges: CTX_BUCKETS,
      shareOver200k: share(ctxSorted.filter((x) => x >= 200e3).length, ctxSorted.length),
      costShareOver200k: share(A.ctxCostOver200k, A.totalCost),
      compactions: A.compacts,
      compactionsByGroup: A.compactsByGroup,
    },
    waits: { ...A.waits, requestShare: share(A.waits.count, A.requests), costShare: share(A.waits.cost, A.totalCost) },
    imageReads: A.imageReads,
    unpricedModels: [...A.unpricedModels],
    approxPricedModels: [...A.approxPriced],
  };
}

function advise(S) {
  const out = [];
  const longAgents = S.topAgents.filter((a) => a.requests >= ADVICE.longAgentRequests);
  const agentIdle = (S.idle.byGroup.subagent ? S.idle.byGroup.subagent.writeCost : 0) + (S.idle.byGroup['workflow-agent'] ? S.idle.byGroup['workflow-agent'].writeCost : 0);
  if (S.idle.costShare >= ADVICE.idleCostShare) {
    const parts = [`Idle cache rewrites are ${fmtPct(S.idle.costShare)} of cost (${S.idle.count} requests).`];
    if (agentIdle > S.idle.writeCost / 2) parts.push('Most are in agents: set subagentPromptCacheTtl to "1h" (k-tokens apply).');
    else parts.push('Most are in the main session: ENABLE_PROMPT_CACHING_1H=1 asks for a 1 hour cache there (writes cost more per token, so it pays off only when gaps are 5 to 60 minutes).');
    parts.push('Also give agents a long, quiet wait instead of short polls.');
    out.push(parts.join(' '));
  }
  if (S.context.shareOver200k >= ADVICE.bigContextShare || (S.context.compactions === 0 && S.context.p90 > 250e3)) {
    out.push(`${fmtPct(S.context.shareOver200k)} of requests carry over 200k tokens of context, with ${S.context.compactions} compactions. Set autoCompactWindow to 250000 so long jobs compact once instead of growing, and keep a HANDOVER.md so a fresh agent can take over.`);
  }
  if (S.agentOpusCostShare >= ADVICE.opusAgentCostShare) {
    out.push(`${fmtPct(S.agentOpusCostShare)} of agent cost is on Opus models. Set CLAUDE_CODE_SUBAGENT_MODEL=sonnet so an agent spawned without a model does not inherit Opus. Agents that name a model are not affected.`);
  }
  if (S.waits.requestShare >= ADVICE.waitRequestShare) {
    out.push(`${fmtPct(S.waits.requestShare)} of requests are waits or polls (${fmtPct(S.waits.costShare)} of cost). Each wake-up re-reads the whole context. Use one long blocking wait on slow builds and tests, or have a cheap headless model watch the log.`);
  }
  if (longAgents.length) {
    out.push(`${longAgents.length} of the top agents ran ${ADVICE.longAgentRequests}+ requests. Split long jobs into phases with a HANDOVER.md, and start a fresh agent per phase instead of resuming a huge transcript.`);
  }
  if (S.imageReads > 0 && S.imageReads >= S.scope.requests * 0.01) {
    out.push(`${S.imageReads} image reads. Crop and downscale screenshots before reading them; an image stays in the context for every later request.`);
  }
  if (!out.length) out.push('Nothing crosses a threshold. The defaults are fine for this usage.');
  return out;
}

function fmtPct(x) {
  return `${(x * 100).toFixed(x < 0.1 ? 1 : 0)}%`;
}
function fmtTok(n) {
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(0)}k`;
  return String(Math.round(n));
}
function fmtCost(n) {
  return `$${n >= 100 ? Math.round(n).toLocaleString('en-US') : n.toFixed(2)}`;
}
function pad(s, n, right) {
  s = String(s);
  return right ? s.padStart(n) : s.padEnd(n);
}

function render(S) {
  const L = [];
  const day = (s) => (s ? new Date(s * 1000).toISOString().slice(0, 10) : '?');
  L.push('K-stack token audit');
  L.push(`Scope: ${S.scope.files} transcripts, ${S.scope.requests} requests, ${day(S.scope.from)} to ${day(S.scope.to)}${S.scope.days ? `, last ${S.scope.days} days` : ''}${S.scope.project ? `, project "${S.scope.project}"` : ''}.`);
  L.push('Costs are approximate API list prices (table at the top of the script). Plan usage meters are not proportional to list price, so use them as relative weights.');
  if (S.unpricedModels.length) L.push(`Not priced (add to the table): ${S.unpricedModels.join(', ')}.`);
  if (S.approxPricedModels.length) L.push(`Priced at the family default: ${S.approxPricedModels.join(', ')}.`);

  L.push('', '== Usage per model');
  L.push(`${pad('model', 26)}${pad('requests', 9, 1)}${pad('input', 8, 1)}${pad('output', 8, 1)}${pad('cache rd', 9, 1)}${pad('5m wr', 8, 1)}${pad('1h wr', 8, 1)}${pad('cost', 9, 1)}`);
  for (const m of S.models) L.push(`${pad(m.model.slice(0, 25), 26)}${pad(m.requests, 9, 1)}${pad(fmtTok(m.input), 8, 1)}${pad(fmtTok(m.output), 8, 1)}${pad(fmtTok(m.cr), 9, 1)}${pad(fmtTok(m.w5), 8, 1)}${pad(fmtTok(m.w1h), 8, 1)}${pad(fmtCost(m.cost), 9, 1)}`);
  L.push(`Total approximate cost: ${fmtCost(S.totalCost)}`);

  L.push('', '== Main session vs agents');
  for (const g of S.groups) L.push(`${pad(g.group, 16)}${pad(g.files, 5, 1)} transcripts ${pad(g.requests, 7, 1)} requests ${pad(fmtCost(g.cost), 9, 1)} ${pad(fmtPct(share(g.cost, S.totalCost)), 5, 1)}`);
  if (S.agentTypes.length) {
    L.push('By agent type:');
    for (const a of S.agentTypes.slice(0, 6)) L.push(`  ${pad(a.agentType.slice(0, 28), 29)}${pad(a.agents, 4, 1)} agents ${pad(a.requests, 6, 1)} requests ${pad(fmtCost(a.cost), 9, 1)}`);
  }
  if (S.topAgents.length) {
    L.push('Top agents by cost:');
    for (const a of S.topAgents) L.push(`  ${pad(fmtCost(a.cost), 8, 1)}  ${pad(a.requests, 5, 1)} req  mean ctx ${pad(fmtTok(a.meanContext), 5, 1)}  ${a.mainModel.replace(/^claude-/, '')}  ${a.agentType || '(untyped)'}${a.description ? `  "${a.description}"` : ''}`);
  }

  L.push('', '== Effort levels');
  const eff = Object.entries(S.effort).sort((a, b) => b[1] - a[1]);
  if (eff.length) for (const [k, v] of eff) L.push(`  ${pad(k, 18)}${pad(v, 8, 1)} requests`);
  else L.push('  Not recorded in these transcripts.');

  L.push('', '== Idle cache rewrites');
  L.push('A request whose previous request was older than the cache lifetime (5 minutes, or 1 hour once a transcript uses the 1 hour cache) and which writes most of its context to cache again.');
  L.push(`  ${S.idle.count} requests, ${fmtTok(S.idle.tokens)} tokens written, ${fmtCost(S.idle.writeCost)} = ${fmtPct(S.idle.costShare)} of total cost.`);
  for (const [g, v] of Object.entries(S.idle.byGroup)) L.push(`  ${pad(g, 16)}${pad(v.count, 6, 1)} requests ${pad(fmtCost(v.writeCost), 9, 1)}`);
  if (S.idle.avoidableCount) L.push(`  ${S.idle.avoidableCount} of them had a gap under 1 hour: a 1 hour cache would have avoided about ${fmtCost(S.idle.avoidableWithLongTtlCost)} of write cost.`);

  L.push('', '== Context size and compaction');
  L.push(`  per request: median ${fmtTok(S.context.p50)}, p90 ${fmtTok(S.context.p90)}, max ${fmtTok(S.context.max)} tokens`);
  const edges = S.context.bucketEdges;
  const labels = edges.map((e, i) => `${i ? fmtTok(edges[i - 1]) : '0'}-${fmtTok(e)}`).concat([`${fmtTok(edges[edges.length - 1])}+`]);
  L.push(`  ${labels.map((l, i) => `${l}: ${S.context.buckets[i]}`).join('   ')}`);
  L.push(`  ${fmtPct(S.context.shareOver200k)} of requests are over 200k tokens (${fmtPct(S.context.costShareOver200k)} of cost)`);
  L.push(`  compactions: ${S.context.compactions}`);

  L.push('', '== Waits and polls');
  L.push('Heuristic: requests with a tool call containing sleep, wait or poll, or a Monitor/TaskOutput call.');
  L.push(`  ${S.waits.count} requests = ${fmtPct(S.waits.requestShare)} of requests, ${fmtCost(S.waits.cost)} = ${fmtPct(S.waits.costShare)} of cost`);
  for (const [g, v] of Object.entries(S.waits.byGroup)) L.push(`  ${pad(g, 16)}${pad(v.count, 6, 1)} requests ${pad(fmtCost(v.cost), 9, 1)}`);
  if (S.imageReads) L.push(`  image reads: ${S.imageReads}`);

  L.push('', '== What to change');
  for (const a of advise(S)) L.push(`- ${a}`);
  L.push('', 'Apply the settings with /kstack:k-tokens apply.');
  return L.join('\n');
}

function main() {
  try {
    const opts = parseArgs(process.argv.slice(2));
    const S = summarize(audit(opts), opts);
    console.log(opts.json ? JSON.stringify({ ...S, advice: advise(S) }, null, 2) : render(S));
  } catch (e) {
    if (e instanceof UserError) console.log(`k-tokens error: ${e.message}`);
    else throw e;
  }
}

if (require.main === module) main();
