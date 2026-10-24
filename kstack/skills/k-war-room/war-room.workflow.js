export const meta = {
  name: 'k-war-room',
  description: 'War room: a moderated panel of mixed-model experts gives openings, chats live with @mentions, votes, and writes a transcript and verdict',
  whenToUse: 'Launched by the k-war-room skill with a panel spec in args; not for direct use',
  phases: [
    { title: 'Openings', detail: 'each panelist studies the brief and posts an opening' },
    { title: 'Live chat', detail: 'one short message at a time; whoever is @mentioned speaks next' },
    { title: 'Votes', detail: 'moderator ballot, then each panelist votes' },
    { title: 'Verdict', detail: 'moderator writes transcript.md and verdict.md' },
  ],
}

// args: see references/args-schema.md beside this file
const A = args || {}
const PANEL = A.panel || []
const MOD = A.moderator || { name: 'Ada', role: 'moderator', stance: 'fair, sharp and decision-oriented' }
const F = Object.assign({ openings: true, openingWords: 350, turns: 20, steerEvery: 7, maxWords: 90, votes: true }, A.format || {})
const SLUG = A.slug || 'war-room'
const OUT = A.outDir
const FIRST = p => p.name.split(' ')[0]
const HANDLES = [...PANEL.map(p => '@' + FIRST(p)), '@' + FIRST(MOD)].join(' ')

const SAFETY = A.readOnly === false
  ? 'You may read anything. Do not change state outside the files a task explicitly names.'
  : 'STRICTLY READ-ONLY: do not create, edit or delete files unless a task below explicitly names the file; no git commits, no submissions, no posting anywhere. Reading files, searching and read-only commands are fine.'

const BRIEF = `WAR ROOM: ${A.topic}
Working directory: ${A.root}. Today is ${A.date}.

${A.brief || ''}

You are on a moderated expert panel deciding this together, in a Slack-style channel. Panel: ${PANEL.map(p => `${p.name} (${p.role})`).join('; ')}. Moderator: ${MOD.name} (${MOD.role}).
${SAFETY}
Be technically rigorous: cite numbers and the file or source you got them from. Disagree concretely and by name, and concede when convinced. Your final output IS your message (nothing else).`

function persona(p) {
  return `${BRIEF}

YOU ARE ${p.name}, ${p.role}.
Your stance: ${p.stance}${p.read ? `\nRead for your expertise: ${p.read}` : ''}`
}

let chatLog = ''
const log_ = []

function withLog(head, task) {
  return `${head}

${chatLog ? 'CHANNEL SO FAR (newest last):' + chatLog + '\n\n' : ''}${task}`
}

let relayN = 0
function relayWrap(p, prompt, tag) {
  if (!p.relay) return prompt
  const dir = `${OUT}/.relay`
  const file = `${dir}/${p.key}-${tag}-${++relayN}.txt`
  const cmd = p.relay.replace(/\{PROMPT_FILE\}/g, file).replace(/\{MAX_TURNS\}/g, String(tag === 'open' ? 40 : 8))
  return `You are a relay agent. The panelist "${p.name}" is played by a DIFFERENT model (${p.badge || 'external model'}) through its CLI. Get that model's message and return it.

Steps:
1. Run: umask 077 && mkdir -p '${dir}' && chmod 700 '${dir}'. Then write the persona prompt below, verbatim, to ${file} with set -o noclobber and a quoted heredoc, so nothing is expanded and no existing file or symlink is overwritten. If that write fails, go to step 4.
2. Run this command with a Bash timeout of ${tag === 'open' ? 600000 : 300000} ms:
   ${cmd}
3. Return ONLY that model's final message, verbatim. Strip CLI banners, tool logs and progress lines, but do not edit its words.
4. If the command fails or returns nothing usable, write the message yourself in ${p.name}'s persona and begin it with "[relay: ${p.badge || 'external model'} unavailable, played by Claude]".

Do not edit any other files.

PERSONA PROMPT (verbatim):
-----
${prompt}
-----`
}

function opts(p, label, phase, effortOverride) {
  const o = { label, phase }
  if (p.relay) { o.model = A.relayModel || 'sonnet'; o.effort = 'low'; return o }
  if (p.model) o.model = p.model
  const e = effortOverride || p.effort
  if (e) o.effort = e
  return o
}

function push(who, name, text) {
  const t = String(text || '').trim()
  if (!t) return null
  log_.push({ who, text: t })
  chatLog += `\n\n**${name}**: ${t}`
  return log_[log_.length - 1]
}

function chatRules(maxWords) {
  return `NOW: write your next message in the live channel. This is a fast group chat between experts, NOT an essay.
- At most ${maxWords} words, 1-4 short lines. No headers, no sign-off, do not start with your own name.
- React to the newest messages and tag who you answer with @Name, using first names: ${HANDLES}.
- Push back with a specific number or source, concede, or propose a concrete action with an owner. Never repeat a point already made.
- If you want a specific person to answer next, end by tagging them.
- At most 2 quick lookups, only to verify something you are about to cite.`
}

const spoken = {}

// An @mention picks the next speaker unless that person is already 2+ messages ahead of the
// quietest panelist; then the quietest (least recent on ties) speaks, so no pair monopolizes.
function pickNext(last) {
  const recent = log_.slice(-2).map(m => m.who)
  const count = p => spoken[p.key] || 0
  const cap = Math.min(...PANEL.map(count)) + 2
  const tagged = PANEL
    .map(p => ({ p, i: last.text.indexOf('@' + FIRST(p)) }))
    .filter(x => x.i >= 0 && x.p.key !== last.who && count(x.p) < cap)
    .sort((a, b) => a.i - b.i)
  const fresh = tagged.find(x => !recent.includes(x.p.key)) || tagged[0]
  if (fresh) return fresh.p
  const lastIdx = p => { for (let i = log_.length - 1; i >= 0; i--) if (log_[i].who === p.key) return i; return -1 }
  return PANEL.filter(p => p.key !== last.who).sort((a, b) => count(a) - count(b) || lastIdx(a) - lastIdx(b))[0]
}

// ---------------------------------------------------------------- openings
if (F.openings) {
  phase('Openings')
  const task = `YOUR TASK: Opening statement, at most ${F.openingWords} words, plain Markdown:
(1) your single most important insight on the topic, grounded in evidence;
(2) what the team should actually do, concretely;
(3) the thing others will get wrong, or the biggest risk.`
  const msgs = await parallel(PANEL.map(p => () =>
    agent(relayWrap(p, `${persona(p)}\n\n${task}`, 'open'), opts(p, `${p.name} · opening`, 'Openings'))))
  msgs.forEach((m, i) => { if (!push(PANEL[i].key, FIRST(PANEL[i]), m)) log(`${PANEL[i].name}: no opening`) })
}

// ---------------------------------------------------------------- live chat
phase('Live chat')
const modHead = `${BRIEF}

YOU ARE ${MOD.name}, the moderator: ${MOD.role}. ${MOD.stance || ''}`
const modOpts = (label, phaseName, effort) => opts(MOD, label, phaseName, effort)

let last = push('mod', FIRST(MOD), await agent(withLog(modHead, `YOUR TASK: Open the live chat in at most 110 words:
- name the 2-3 sharpest disagreements or open questions${F.openings ? ' in the openings' : ''};
- ask one pointed question, tagging the 2 panelists who must answer it first.
Fast chat tone, no headers.`), modOpts(`${MOD.name}: kickoff`, 'Live chat', 'medium'))) || { who: 'mod', text: '' }

for (let n = 1; n <= F.turns; n++) {
  if (n > 1 && F.steerEvery && (n - 1) % F.steerEvery === 0) {
    last = push('mod', FIRST(MOD), await agent(withLog(modHead, `YOUR TASK: Steer the chat in at most 90 words:
- pin what is converging (1-2 bullets with names);
- name the most important unresolved question;
- tag the 2 people who must settle it next, preferring voices that have spoken least (${PANEL.map(p => `${FIRST(p)} ${spoken[p.key] || 0}`).join(', ')} messages so far).
No headers.`), modOpts(`${MOD.name}: steer #${n}`, 'Live chat', 'medium'))) || last
  }
  const p = pickNext(last)
  const msg = await agent(relayWrap(p, withLog(persona(p), chatRules(F.maxWords)), `c${n}`),
    opts(p, `${p.name} · #${n}`, 'Live chat', p.relay ? undefined : (p.chatEffort || 'medium')))
  const pushed = push(p.key, FIRST(p), msg)
  if (pushed) { last = pushed; spoken[p.key] = (spoken[p.key] || 0) + 1 }
  else log(`${p.name}: no message at turn ${n}`)
}

// ---------------------------------------------------------------- votes
if (F.votes) {
  phase('Votes')
  push('mod', FIRST(MOD), await agent(withLog(modHead, `YOUR TASK: Close the debate and post the ballot.
- Frame 4-8 numbered decisions, each with 2-4 concrete options (A/B/C...), covering what the channel showed is actually contested and decision-relevant.
- Ask each panelist to reply with their votes, their top action and their biggest risk.
- At most 230 words. No preamble.`), modOpts(`${MOD.name}: ballot`, 'Votes', 'high')))
  for (const p of PANEL) {
    const rules = `NOW: reply to the ballot in the channel, compactly (at most 120 words):
- one line of votes, like "1A 2C 3B ...";
- one line of reasoning on the vote you feel strongest about (tag anyone you disagree with);
- "Action:" your single most important next action, with an exit criterion;
- "Risk:" the biggest risk.`
    push(p.key, FIRST(p), await agent(relayWrap(p, withLog(persona(p), rules), 'vote'), opts(p, `${p.name} · vote`, 'Votes', p.relay ? undefined : 'medium')))
  }
}

// ---------------------------------------------------------------- verdict
phase('Verdict')
const verdict = await agent(withLog(modHead, `YOUR TASK: Close the war room and write exactly two files (you MAY create these two files, nothing else):

1. ${OUT}/transcript.md
   - The full channel above, verbatim, under a short header.
   - The header gives the topic, the date (${A.date}), the panel (name, role, model; external-model seats played through a CLI relay unless a message says relay fallback) and the format.

2. ${OUT}/verdict.md
   - (a) A decision table: each ballot item, the tally per option, the winning option and the deciding argument.
   - (b) The recommended plan as a dated or ordered schedule.
   - (c) A merged, de-duplicated action list, ordered, each item with an owner role and an exit criterion.
   - (d) Dissent worth keeping: minority positions with their strongest argument.
   - (e) Open questions that only evidence or measurement can settle, each mapped to how to settle it.
   - (f) The top risks with mitigations.
   - Be faithful to what panelists actually said. Do not invent votes.

Your final output (your return value) is a closing message for the channel: at most 300 words, with the key decisions and tallies and the first 5 actions.`),
  // verdictModel exists so a failed verdict can be retried on another model without invalidating the cached chat.
  Object.assign(modOpts(`${MOD.name}: verdict`, 'Verdict', 'high'), A.verdictModel ? { model: A.verdictModel } : {}))

return { verdict, messages: log_.length, outDir: OUT }
