#!/usr/bin/env node
/**
 * Kill Before Open - PreToolUse Hook for Bash
 * When opening a .app, auto-kills any existing running instance first.
 * Approves the action after cleanup, no user interaction needed.
 * macOS only: no-ops silently on other platforms.
 */

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const LOG_DIR = path.join(process.env.HOME || '', '.claude', 'hooks-logs');

function log(data) {
  try {
    if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
    const file = path.join(LOG_DIR, `${new Date().toISOString().slice(0, 10)}.jsonl`);
    fs.appendFileSync(file, JSON.stringify({ ts: new Date().toISOString(), hook: 'kill-before-open', ...data }) + '\n');
  } catch {}
}

function tryKill(appName) {
  try {
    execFileSync('pkill', ['-f', `${appName}.app/Contents/MacOS`], { timeout: 5000, stdio: 'ignore' });
  } catch {}
  try {
    execFileSync('killall', [appName], { timeout: 5000, stdio: 'ignore' });
  } catch {}
}

async function main() {
  let input = '';
  for await (const chunk of process.stdin) input += chunk;

  try {
    const data = JSON.parse(input);
    if (data.tool_name !== 'Bash') return console.log('{}');
    if (process.platform !== 'darwin') return console.log('{}');

    const cmd = data.tool_input?.command || '';

    // Match: open "Something.app" or open /Applications/Something.app
    const appMatch = cmd.match(/\bopen\s+(?:-[a-zA-Z]\s+)*["']?([^"'\s]*\.app)["']?/);
    if (appMatch) {
      const appPath = appMatch[1];
      const appName = path.basename(appPath, '.app').replace(/['"]/g, '');

      if (appName) {
        tryKill(appName);
        log({ level: 'KILL', app: appName, cmd: cmd.slice(0, 200) });
        // Brief pause for process cleanup
        execFileSync('sleep', ['0.5'], { timeout: 3000 });
      }
    }

    // Always approve; this hook is side-effect only
    console.log('{}');
  } catch (e) {
    log({ level: 'ERROR', error: e.message });
    console.log('{}');
  }
}

main();
