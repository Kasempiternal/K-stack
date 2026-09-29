#!/usr/bin/env node
/**
 * No Claude Attribution - PreToolUse Hook for Bash
 * Blocks git commit commands that contain Co-Authored-By lines.
 * Claude will retry without the attribution.
 */

const fs = require('fs');
const path = require('path');

const LOG_DIR = path.join(process.env.HOME, '.claude', 'hooks-logs');

function log(data) {
  try {
    if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
    const file = path.join(LOG_DIR, `${new Date().toISOString().slice(0, 10)}.jsonl`);
    fs.appendFileSync(file, JSON.stringify({ ts: new Date().toISOString(), hook: 'no-claude-attribution', ...data }) + '\n');
  } catch {}
}

async function main() {
  let input = '';
  for await (const chunk of process.stdin) input += chunk;

  try {
    const data = JSON.parse(input);
    if (data.tool_name !== 'Bash') return console.log('{}');

    const cmd = data.tool_input?.command || '';

    if (/\bgit\s+commit\b/i.test(cmd) && /co-authored-by/i.test(cmd)) {
      log({ level: 'BLOCK', cmd: cmd.slice(0, 200), session_id: data.session_id });
      return console.log(JSON.stringify({
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'deny',
          permissionDecisionReason: '[no-claude-attribution] Remove the Co-Authored-By line from the commit message. No AI attribution allowed.'
        }
      }));
    }

    console.log('{}');
  } catch (e) {
    log({ level: 'ERROR', error: e.message });
    console.log('{}');
  }
}

main();
