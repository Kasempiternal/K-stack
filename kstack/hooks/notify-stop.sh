#!/bin/bash
# Stop hook: notify when Claude finishes a task
# Only fires for the main agent (not subagents/teammates)
# macOS only (osascript): no-ops silently elsewhere

[ "$(uname -s)" != "Darwin" ] && exit 0

INPUT=$(cat)
SESSION_ID=$(echo "$INPUT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('session_id',''))" 2>/dev/null)

[ -z "$SESSION_ID" ] && exit 0

# Load tab metadata
META_FILE="/tmp/claude-tabs/${SESSION_ID}.json"
[ ! -f "$META_FILE" ] && exit 0

TTY=$(python3 -c "import json; print(json.load(open('$META_FILE'))['tty'])" 2>/dev/null)
TAB_NUM=$(python3 -c "import json; print(json.load(open('$META_FILE'))['tab_num'])" 2>/dev/null)
PROJECT=$(python3 -c "import json; print(json.load(open('$META_FILE'))['project'])" 2>/dev/null)

# Only notify for the main agent on this TTY
TTY_SAFE=$(echo "$TTY" | tr '/' '-')
MAIN_ID=$(cat "/tmp/claude-main-session-${TTY_SAFE}" 2>/dev/null)
[ "$SESSION_ID" != "$MAIN_ID" ] && exit 0

# Send macOS notification
osascript -e "display notification \"${PROJECT}: Task complete\" with title \"Claude Code - Tab ${TAB_NUM}\"" 2>/dev/null
