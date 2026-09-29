#!/bin/bash
# SessionStart hook: capture tab metadata for notification routing
# Reads session_id + cwd from stdin JSON, maps TTY to tab number

set +e  # ensure no early exit on intermediate failures

INPUT=$(cat)
SESSION_ID=$(echo "$INPUT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('session_id',''))" 2>/dev/null)
CWD=$(echo "$INPUT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('cwd',''))" 2>/dev/null)

[ -z "$SESSION_ID" ] && exit 0

# Get TTY of the parent Claude process
TTY=$(ps -o tty= -p $PPID 2>/dev/null | tr -d ' ')
[ -z "$TTY" ] && TTY="unknown"

# Derive tab number: ordinal position among active terminal shells sorted by TTY
TAB_NUM=1
if [ "$TTY" != "unknown" ]; then
    TAB_NUM=$(ps -eo tty=,comm= | grep -E '(zsh|bash|fish)$' | awk '{print $1}' | sort -u | grep -n "^${TTY}$" | cut -d: -f1)
    [ -z "$TAB_NUM" ] && TAB_NUM=1
fi

# Extract project name from working directory
PROJECT=$(basename "$CWD" 2>/dev/null)
[ -z "$PROJECT" ] && PROJECT="unknown"

# Save metadata for other hooks to look up
mkdir -p /tmp/claude-tabs
cat > "/tmp/claude-tabs/${SESSION_ID}.json" <<EOF
{"session_id":"$SESSION_ID","tty":"$TTY","tab_num":$TAB_NUM,"project":"$PROJECT","cwd":"$CWD"}
EOF

# Save main session ID per-TTY (first session on this TTY is the main agent)
TTY_SAFE=$(echo "$TTY" | tr '/' '-')
MAIN_FILE="/tmp/claude-main-session-${TTY_SAFE}"
if [ ! -f "$MAIN_FILE" ]; then
    echo "$SESSION_ID" > "$MAIN_FILE"
else
    # Stored value is a session ID, not a PID; just overwrite
    echo "$SESSION_ID" > "$MAIN_FILE"
fi

exit 0
