#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

function commandSegments(source) {
  const redirection = "\u0000REDIRECTION\u0000";
  const segments = [];
  let words = [];
  let word = "";
  let quote = null;

  const flushWord = () => {
    if (word.length) words.push(word);
    word = "";
  };
  const flushSegment = () => {
    flushWord();
    if (words.length) segments.push(words);
    words = [];
  };

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (quote === "'") {
      if (char === "'") quote = null;
      else word += char;
      continue;
    }
    if (quote === '"') {
      if (char === '"') quote = null;
      else if (char === "\\" && index + 1 < source.length) word += source[++index];
      else word += char;
      continue;
    }
    if (char === "'" || char === '"') {
      quote = char;
      continue;
    }
    if (char === "\\" && index + 1 < source.length) {
      word += source[++index];
      continue;
    }
    if (/\s/.test(char)) {
      if (char === "\n") flushSegment();
      else flushWord();
      continue;
    }
    if (";&|(){}".includes(char)) {
      flushSegment();
      continue;
    }
    if (char === "<" || char === ">") {
      flushWord();
      if (/^[0-9]+$/.test(words.at(-1) || "")) words.pop();
      words.push(redirection);
      while (index + 1 < source.length && (source[index + 1] === char || source[index + 1] === "&")) index += 1;
      continue;
    }
    word += char;
  }
  flushSegment();
  return segments;
}

const assignment = /^[A-Za-z_][A-Za-z0-9_]*=/;
const redirection = "\u0000REDIRECTION\u0000";
const optionTakesValue = new Map([
  ["sudo", new Set(["-C", "-D", "-g", "-h", "-p", "-R", "-r", "-t", "-T", "-u", "-U", "--chdir", "--chroot", "--close-from", "--group", "--host", "--other-user", "--prompt", "--role", "--type", "--user"])],
  ["doas", new Set(["-C", "-u"])],
  ["nice", new Set(["-n", "--adjustment"])],
  ["time", new Set(["-f", "--format", "-o", "--output"])],
  ["env", new Set(["-a", "--argv0", "-C", "--chdir", "-S", "--split-string", "-u", "--unset"])],
  ["xargs", new Set(["-a", "--arg-file", "-d", "--delimiter", "-E", "-e", "--eof", "-I", "-i", "--replace", "-L", "-l", "--max-lines", "-n", "--max-args", "-P", "--max-procs", "-s", "--max-chars"])],
]);

function skipOptions(words, start, executable) {
  const valueOptions = optionTakesValue.get(executable) || new Set();
  let index = start;
  while (index < words.length) {
    const token = words[index];
    if (executable === "env" && assignment.test(token)) { index += 1; continue; }
    if (token === "--") return index + 1;
    if (!token.startsWith("-") || token === "-") return index;
    if (valueOptions.has(token) && !token.includes("=")) index += 2;
    else index += 1;
  }
  return index;
}

function gitOperation(words, start) {
  const valueOptions = new Set(["-C", "-c", "--exec-path", "--git-dir", "--work-tree", "--namespace", "--config-env", "--super-prefix"]);
  let index = start;
  while (index < words.length) {
    const token = words[index];
    if (token === "--") { index += 1; continue; }
    if (valueOptions.has(token)) { index += 2; continue; }
    if (/^-C.+/.test(token) || /^-c.+/.test(token) || /^--(?:exec-path|git-dir|work-tree|namespace|config-env|super-prefix)=/.test(token)) { index += 1; continue; }
    if (token.startsWith("-")) { index += 1; continue; }
    return new Set(["commit", "commit-tree", "push"]).has(token) ? `git ${token}` : null;
  }
  return null;
}

function inspectWords(words, depth = 0) {
  if (!words.length || depth > 8) return null;
  let index = 0;
  while (index < words.length) {
    if (assignment.test(words[index])) { index += 1; continue; }
    if (words[index] === redirection) { index += 2; continue; }
    if (["!", "if", "then", "elif", "else", "while", "until", "do"].includes(words[index])) { index += 1; continue; }
    break;
  }
  if (index >= words.length) return null;

  const executable = path.basename(words[index]);
  if (executable === "rm") return "rm";
  if (executable === "git") return gitOperation(words, index + 1);

  if (["command", "builtin", "exec", "nohup"].includes(executable)) {
    return inspectWords(words.slice(skipOptions(words, index + 1, executable)), depth + 1);
  }
  if (["env", "sudo", "doas", "nice", "time"].includes(executable)) {
    return inspectWords(words.slice(skipOptions(words, index + 1, executable)), depth + 1);
  }
  if (executable === "xargs") {
    return inspectWords(words.slice(skipOptions(words, index + 1, executable)), depth + 1);
  }
  if (["bash", "dash", "ksh", "sh", "zsh"].includes(executable)) {
    for (let cursor = index + 1; cursor + 1 < words.length; cursor += 1) {
      if (/^-[A-Za-z]*c[A-Za-z]*$/.test(words[cursor])) return inspectCommand(words[cursor + 1], depth + 1);
    }
  }
  if (executable === "eval" && index + 1 < words.length) return inspectCommand(words.slice(index + 1).join(" "), depth + 1);

  for (let cursor = index + 1; cursor < words.length; cursor += 1) {
    if ((words[cursor] === "-exec" || words[cursor] === "-execdir") && cursor + 1 < words.length) {
      const result = inspectWords(words.slice(cursor + 1), depth + 1);
      if (result) return result;
    }
  }
  return null;
}

function inspectCommand(command, depth = 0) {
  if (depth > 8) return null;
  for (const words of commandSegments(command)) {
    const result = inspectWords(words, depth);
    if (result) return result;
  }

  // Quoted command substitutions remain inside a word during the first pass.
  for (const pattern of [/\$\(([^()]*)\)/gs, /`([^`]*)`/gs]) {
    for (const match of command.matchAll(pattern)) {
      const result = inspectCommand(match[1], depth + 1);
      if (result) return result;
    }
  }
  return null;
}

let payload;
try { payload = JSON.parse(fs.readFileSync(0, "utf8")); }
catch { process.exit(0); }

if (payload.hook_event_name !== "PreToolUse" || payload.tool_name !== "Bash" || typeof payload.tool_input?.command !== "string") process.exit(0);

// Asking is pointless when nobody is there to answer. In bypassPermissions the
// operator has already decided, for this session, that no prompt should stop
// the run -- an unconditional "ask" here turns an unattended overnight session
// into one parked forever on a dialog. Every other mode is unchanged.
const permissionMode = payload.permission_mode ?? payload.permissionMode;
if (permissionMode === "bypassPermissions") process.exit(0);
const command = payload.tool_input.command.trim();
const operation = command ? inspectCommand(command) : null;
if (!operation) process.exit(0);

process.stdout.write(JSON.stringify({
  hookSpecificOutput: {
    hookEventName: "PreToolUse",
    permissionDecision: "ask",
    permissionDecisionReason: `Claude wants to run ${operation}, which always requires your approval:\n${command.slice(0, 2_000)}`
  }
}) + "\n");
