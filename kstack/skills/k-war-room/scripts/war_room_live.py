"""Live chat view of a war-room workflow run: serves a page that polls the run's journal.

usage: python3 war_room_live.py <workflow_transcript_dir> <panel.json> [port]
panel.json: {"topic", "channel", "outDir", "root", "moderator": {...}, "personas": [{"name", "role", "color", "model", "external"}]}
Reads each running agent's transcript for live activity (files read, commands run).
"""

import html
import json
import os
import re
import secrets
import socket
import sys
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

RUN_DIR = sys.argv[1]
PANEL = json.load(open(sys.argv[2], encoding="utf-8"))
JOURNAL = os.path.join(RUN_DIR, "journal.jsonl")
# The page reloads itself when this changes, so UI edits reach an open tab.
UI_VERSION = "w1"
STAGES = [("Openings", "Openings"), ("Live chat", "Live chat"), ("Votes", "Votes"), ("Verdict", "Verdict")]
def _color(value, default):
    """Only #rgb / #rrggbb(aa) colours reach the page: panel.json is interpolated into HTML."""
    return value if isinstance(value, str) and re.fullmatch(r"#[0-9a-fA-F]{3,8}", value) else default


PALETTE = ["#0f766e", "#b45309", "#be123c", "#1d4ed8", "#15803d", "#c2410c", "#0e7490", "#a16207", "#4d7c0f", "#0369a1", "#b91c1c", "#57534e"]
LEADING_NAME = re.compile(r"^\s*\*\*[^*\n]{2,60}\*\*\s*\n+")
ACTIVE_WINDOW_S = 420
TAIL_BYTES = 400_000


def _initials(name):
    parts = [w for w in re.split(r"[^A-Za-z]+", name) if w]
    return (parts[0][0] + (parts[1][0] if len(parts) > 1 else parts[0][1:2])).upper() if parts else "??"


def _people():
    mod = dict(PANEL.get("moderator") or {"name": "Moderator", "role": "moderator"})
    mod.update(mod=True, color=_color(mod.get("color"), "#334155"))
    out = [mod]
    for i, p in enumerate(PANEL.get("personas") or []):
        q = dict(p)
        q["color"] = _color(q.get("color"), PALETTE[i % len(PALETTE)])
        out.append(q)
    for q in out:
        q.setdefault("initials", _initials(q["name"]))
        q.setdefault("model", "Claude")
        q.setdefault("external", False)
        q.setdefault("mod", False)
    return out


PEOPLE = _people()


def _persona(label):
    best = None
    for p in PEOPLE:
        if (label or "").startswith(p["name"]) and (best is None or len(p["name"]) > len(best["name"])):
            best = p
    if best is None:
        first = re.match(r"[A-Za-z]+", label or "")
        best = next((p for p in PEOPLE if first and p["name"].split()[0] == first.group(0)), None)
    return best or {"name": label or "?", "initials": "??", "role": "", "color": "#334155", "model": "Claude", "external": False, "mod": False}


def _mtime(path):
    try:
        return os.path.getmtime(path)
    except OSError:
        return None

def _short_path(p):
    p = p or ""
    root = (PANEL.get("root") or "").rstrip("/")
    if root and p.startswith(root + "/"):
        return p[len(root) + 1:]
    return "/".join(p.rstrip("/").split("/")[-3:])


def _describe(tool, inp):
    inp = inp or {}
    if tool == "Read":
        rng = f" (from line {inp['offset']})" if inp.get("offset") else ""
        return "📖", f"reading {_short_path(inp.get('file_path'))}{rng}"
    if tool in ("Grep", "Glob"):
        return "🔎", f"searching for “{(inp.get('pattern') or '')[:60]}”"
    if tool == "Bash":
        cmd = inp.get("command", "")
        if "cmd -p" in cmd:
            return "🛰️", "asking DeepSeek V4 Pro (Command Code)…"
        if "okc leaderboard" in cmd:
            return "🏁", "checking the live leaderboard"
        if cmd.lstrip().startswith("python3"):
            return "🧮", inp.get("description") or "running the numbers in Python"
        return "💻", inp.get("description") or cmd.strip().splitlines()[0][:80]
    if tool == "WebSearch":
        return "🌐", f"searching the web: {(inp.get('query') or '')[:60]}"
    if tool == "WebFetch":
        return "🌐", f"reading {(inp.get('url') or '')[:70]}"
    if tool == "Write":
        return "✍️", f"writing {_short_path(inp.get('file_path'))}"
    return "⚙️", tool


def _activity(path):
    """Last few tool actions and the tool-call count from a running agent's transcript."""
    try:
        size = os.path.getsize(path)
        with open(path, "rb") as f:
            f.seek(max(0, size - TAIL_BYTES))
            raw = f.read().decode("utf-8", "ignore")
    except OSError:
        return [], 0
    acts, calls = [], 0
    for line in raw.splitlines():
        if '"tool_use"' not in line:
            continue
        try:
            ev = json.loads(line)
        except ValueError:
            continue
        msg = ev.get("message") or {}
        for block in msg.get("content") or []:
            if isinstance(block, dict) and block.get("type") == "tool_use":
                calls += 1
                acts.append(_describe(block.get("name"), block.get("input")))
    return acts[-4:], calls



def _state():
    started, results, order = {}, {}, []
    try:
        lines = open(JOURNAL, encoding="utf-8").read().splitlines()
    except OSError:
        lines = []
    for line in lines:
        try:
            ev = json.loads(line)
        except ValueError:
            continue
        key = ev.get("key")
        if not key:
            continue
        if ev.get("type") == "started":
            if key not in started:
                order.append(key)
            started[key] = ev
        elif ev.get("type") == "result" and ev.get("result") is not None:
            results[key] = ev.get("result")
    now = time.time()
    msgs, typing = [], []
    for key in order:
        ev = started[key]
        p = _persona(ev.get("label"))
        agent_id = ev.get("agentId", "")
        transcript = os.path.join(RUN_DIR, f"agent-{agent_id}.jsonl")
        if key in results:
            text = results[key]
            if not isinstance(text, str):
                text = json.dumps(text, indent=1)
            text = LEADING_NAME.sub("", text, count=1).strip()
            fallback = text.startswith("[relay:")
            msgs.append({"id": key[-16:], "name": p["name"], "initials": p["initials"], "role": p["role"], "color": p["color"],
                         "model": "Claude (relay fallback)" if fallback else p["model"], "external": p["external"] and not fallback,
                         "mod": p["mod"], "phase": ev.get("phase", ""), "text": text, "ts": _mtime(transcript)})
        else:
            last = _mtime(transcript) or _mtime(transcript.replace(".jsonl", ".meta.json"))
            if last and now - last < ACTIVE_WINDOW_S:
                acts, calls = _activity(transcript)
                typing.append({"name": p["name"], "since": _mtime(transcript.replace(".jsonl", ".meta.json")),
                               "acts": acts, "calls": calls, "phase": ev.get("phase", "")})
    phases = [started[k].get("phase", "") for k in order]
    current = phases[-1] if phases else ""
    done = current == "Verdict" and not typing and any(m["phase"] == "Verdict" for m in msgs)
    stages = [{"key": k, "label": v} for k, v in STAGES if k != "Openings" or PANEL.get("openings", True)]
    return {"ui": UI_VERSION, "messages": msgs, "typing": typing, "stage": current, "done": done, "stages": stages,
            "personas": [{k: p[k] for k in ("name", "initials", "role", "color", "model", "external", "mod")} for p in PEOPLE]}


PAGE = r"""<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>__TITLE__</title>
<script src="__MARKED__" integrity="__SRI__" crossorigin="anonymous"></script>
<script src="__PURIFY__" integrity="__PURIFY_SRI__" crossorigin="anonymous"></script>
<style>
:root{--bg:#eef3f2;--panel:#ffffff;--side:#0b3b38;--side-ink:#d6ece9;--ink:#0f172a;--muted:#64748b;--line:#e2e8f0;
--brand:#0f766e;--brand-soft:#e3f1ef;--code:#f6f8fa;--shadow:0 1px 2px rgba(15,23,42,.06),0 2px 8px rgba(15,23,42,.05)}
@media (prefers-color-scheme:dark){:root{--bg:#0b1414;--panel:#121c1c;--side:#071010;--side-ink:#b9d6d2;--ink:#e2ecea;
--muted:#8aa19e;--line:#203030;--brand:#2dd4bf;--brand-soft:#0f2a28;--code:#0d1717;--shadow:none}}
*{box-sizing:border-box}html,body{height:100%}
body{margin:0;font:15px/1.6 -apple-system,BlinkMacSystemFont,"SF Pro Text","Inter",sans-serif;background:var(--bg);color:var(--ink);
display:grid;grid-template-columns:300px 1fr;grid-template-rows:auto 1fr;grid-template-areas:"side top" "side main";overflow:hidden}
aside{grid-area:side;background:var(--side);color:var(--side-ink);padding:18px 14px;overflow:auto}
aside h1{font-size:15px;margin:0 0 2px;color:#fff}aside .sub{font-size:12px;opacity:.7;margin-bottom:12px}
aside h2{font-size:11px;text-transform:uppercase;letter-spacing:.09em;opacity:.6;margin:18px 6px 8px}
.p{display:flex;gap:10px;align-items:flex-start;padding:7px 8px;border-radius:9px;cursor:pointer;user-select:none}
.p:hover{background:rgba(255,255,255,.06)}.p.on{background:rgba(45,212,191,.16)}
.p .av{width:34px;height:34px;font-size:12.5px;position:relative}
.p .av .st{position:absolute;right:-2px;bottom:-2px;width:11px;height:11px;border-radius:50%;border:2px solid var(--side);background:#475569}
.p .av .st.w{background:#2dd4bf;animation:pulse 1.1s infinite}.p .av .st.d{background:#22c55e}
@keyframes pulse{0%,100%{box-shadow:0 0 0 0 rgba(45,212,191,.6)}50%{box-shadow:0 0 0 5px rgba(45,212,191,0)}}
.p .meta{min-width:0;flex:1}.p .nm{color:#fff;font-weight:600;font-size:13.5px;display:flex;gap:6px;align-items:center}
.p .rl{font-size:11.5px;opacity:.72;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.p .act{font-size:11.5px;color:#5eead4;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.p .ct{font-size:11px;opacity:.7;margin-left:auto;padding-top:2px}
.stats{font-size:12px;opacity:.75;margin:6px 6px 0;line-height:1.7}
.top{grid-area:top;background:var(--panel);border-bottom:1px solid var(--line);padding:11px 22px;display:flex;gap:14px;align-items:center;flex-wrap:wrap}
.top .t{font-weight:700;font-size:15px}.live{font-size:11px;font-weight:800;color:#fff;background:#dc2626;border-radius:5px;padding:1px 7px;letter-spacing:.08em;animation:blink 2s infinite}
.live.end{background:var(--muted);animation:none}@keyframes blink{50%{opacity:.55}}
.stages{display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-left:auto}
.sg{font-size:12px;padding:4px 10px;border-radius:999px;border:1px solid var(--line);color:var(--muted)}
.sg.done{color:var(--brand);border-color:var(--brand);background:var(--brand-soft)}
.sg.cur{color:#fff;background:var(--brand);border-color:var(--brand);box-shadow:0 0 0 3px rgba(15,118,110,.18)}
.arrow{color:var(--muted);font-size:11px}
main{grid-area:main;overflow:auto;position:relative}
#chat{max-width:960px;margin:0 auto;padding:18px 24px 30px}
.divider{display:flex;align-items:center;gap:12px;margin:26px 0 10px;color:var(--brand);font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase}
.divider:before,.divider:after{content:"";flex:1;height:1px;background:var(--line)}
.msg{display:flex;gap:12px;margin:2px 0;animation:in .3s ease-out}.msg.first{margin-top:16px}
@keyframes in{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
.av{border-radius:50%;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;flex:0 0 auto}
.msg>.av{width:40px;height:40px;font-size:13px}.msg:not(.first)>.av{visibility:hidden;height:0}
.col{min-width:0;flex:1}
.hd{display:flex;gap:8px;align-items:baseline;flex-wrap:wrap;margin:0 0 3px 2px}
.who{font-weight:700}.role{color:var(--muted);font-size:12.5px}
.chip{font-size:11px;border-radius:5px;padding:0 6px;border:1px solid var(--line);color:var(--muted)}
.chip.ds{border-color:#c2410c;color:#c2410c}.time{margin-left:auto;color:var(--muted);font-size:12px}
.reply{font-size:12px;color:var(--muted);margin:0 0 3px 2px}
.bubble{background:var(--panel);border-radius:4px 14px 14px 14px;padding:8px 14px;box-shadow:var(--shadow);border:1px solid var(--line);display:inline-block;max-width:100%}
.msg:not(.first) .bubble{border-radius:14px}
.msg.mod .bubble{border:1.5px solid var(--brand)}
.bubble h1,.bubble h2,.bubble h3,.bubble h4{font-size:15px;margin:10px 0 4px}
.bubble p{margin:4px 0}.bubble ul,.bubble ol{margin:4px 0;padding-left:22px}
.bubble pre{background:var(--code);padding:9px 11px;border-radius:8px;overflow:auto;font-size:12.5px}
.bubble code{font:12.5px/1.5 "SF Mono",ui-monospace,Menlo,monospace;background:var(--code);padding:1px 4px;border-radius:4px}
.bubble pre code{padding:0;background:none}
.bubble table{border-collapse:collapse;font-size:13px;margin:6px 0;display:block;overflow:auto}
.bubble th,.bubble td{border:1px solid var(--line);padding:4px 8px;text-align:left}.bubble th{background:var(--code)}
.bubble blockquote{margin:6px 0;padding-left:10px;border-left:3px solid var(--line);color:var(--muted)}
.mention{font-weight:650;border-radius:4px;padding:0 3px}
.caret{display:inline-block;width:7px;height:15px;background:var(--brand);margin-left:2px;vertical-align:-2px;animation:blink 1s steps(1) infinite}
.sys{display:flex;gap:8px;align-items:center;font-size:12.5px;color:var(--muted);margin:3px 0 3px 52px;font-style:italic}
.sys .mini{width:18px;height:18px;font-size:8px;font-style:normal}
#live{position:sticky;bottom:0;padding:10px 24px 14px;background:linear-gradient(transparent,var(--bg) 30%)}
#live .inner{max-width:960px;margin:0 auto}
.typing{display:flex;gap:8px;align-items:center;color:var(--muted);font-size:13px;margin-top:6px}
.tav{display:flex}.tav .av{width:24px;height:24px;font-size:9.5px;margin-right:-6px;border:2px solid var(--bg)}
.dots span{display:inline-block;width:5px;height:5px;border-radius:50%;background:var(--brand);margin:0 1.5px;animation:b 1.2s infinite}
.dots span:nth-child(2){animation-delay:.15s}.dots span:nth-child(3){animation-delay:.3s}
@keyframes b{0%,80%,100%{opacity:.25;transform:translateY(0)}40%{opacity:1;transform:translateY(-3px)}}
#jump{position:fixed;right:28px;bottom:80px;background:var(--brand);color:#fff;border:0;border-radius:999px;padding:8px 14px;font-weight:600;font-size:13px;box-shadow:var(--shadow);cursor:pointer;display:none}
.toggle{font-size:12px;color:var(--muted);display:flex;gap:6px;align-items:center;margin-left:6px}
.empty{color:var(--muted);text-align:center;margin-top:80px}
@media (max-width:820px){body{grid-template-columns:1fr;grid-template-areas:"top" "main"}aside{display:none}}
</style></head><body>
<aside>
  <h1>__TOPIC__</h1><div class="sub">__CHANNEL__ · war room</div>
  <h2>Panel</h2><div id="roster"></div>
  <h2>Session</h2><div class="stats" id="stats"></div>
</aside>
<div class="top"><span class="t">__CHANNEL__</span><span class="live" id="livebadge">LIVE</span>
<label class="toggle"><input type="checkbox" id="anim" checked> typing animation</label><div class="stages" id="stages"></div></div>
<main id="main"><div id="chat"><div class="empty" id="empty">Waiting for the first message…</div></div>
<div id="live"><div class="inner" id="liveinner"></div></div></main>
<button id="jump">↓ New messages</button>
<script nonce="__NONCE__">
const UI="__UI__";let state=null,filter=null,unread=0,primed=false,lastPhase="",lastSpeaker="",busy=false;
const seen=new Set(),queue=[];
const main=document.getElementById('main'),chat=document.getElementById('chat');
const fmt=t=>t?new Date(t*1000).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}):'';
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'})[c]);
const nearBottom=()=>main.scrollTop+main.clientHeight>=main.scrollHeight-140;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function md(t){try{return marked.parse(t)}catch(e){return '<pre>'+esc(t)+'</pre>'}}
const safe=h=>window.DOMPurify?DOMPurify.sanitize(h,{FORBID_TAGS:['style','form','input','button','iframe']}):'<pre>'+esc(h)+'</pre>';
function closeOpen(t){if((t.match(/\*\*/g)||[]).length%2)t+='**';if((t.match(/`/g)||[]).length%2)t+='`';return t}
function mentionize(html){
  if(!state)return html;
  for(const p of state.personas){const f=p.name.split(' ')[0];
    const re=new RegExp('(^|[^\\w>@-])(@?'+f+'(?: '+(p.name.split(' ')[1]||'§')+')?)(?![\\w])','g');
    html=html.replace(re,(m,a,b)=>a+`<span class="mention" style="color:${p.color};background:${p.color}1a">${b.startsWith('@')?b:'@'+b}</span>`)}
  return html}
function chunks(text){
  const blocks=text.split(/\n{2,}/),out=[];
  for(const b of blocks){const prev=out[out.length-1];
    if(prev&&(/^\s*(\||[-*] |\d+\. )/.test(b)&&/^\s*(\||[-*] |\d+\. )/.test(prev.split('\n').pop())||prev.length<80))out[out.length-1]=prev+'\n\n'+b;
    else out.push(b)}
  return out.filter(x=>x.trim())}
function addDivider(phase){if(phase===lastPhase)return;lastPhase=phase;lastSpeaker="";
  const lbl=(state.stages.find(s=>s.key===phase)||{}).label||phase;const d=document.createElement('div');d.className='divider';d.textContent=lbl;chat.appendChild(d)}
function shell(m,first){
  const el=document.createElement('div');el.className='msg'+(first?' first':'')+(m.mod?' mod':'');el.dataset.who=m.name;
  const ds=!!m.external;
  const others=state.personas.filter(p=>p.name!==m.name&&new RegExp('(^|\\W)@?'+p.name.split(' ')[0]+'(\\W|$)').test(m.text)).map(p=>p.name.split(' ')[0]);
  el.innerHTML=`<div class="av" style="background:${m.color}">${esc(m.initials)}</div><div class="col">${first?`
   <div class="hd"><span class="who" style="color:${m.color}">${esc(m.name)}</span><span class="role">${esc(m.role)}</span>
   <span class="chip${ds?' ds':''}">${esc(m.model)}</span><span class="time">${fmt(m.ts)}</span></div>
   ${others.length?`<div class="reply">↪ replying to ${others.map(o=>'@'+esc(o)).join(', ')}</div>`:''}`:''}
   <div class="bubble"></div></div>`;
  if(filter&&filter!==m.name)el.style.display='none';
  chat.appendChild(el);return el.querySelector('.bubble')}
async function post(m,animate){
  addDivider(m.phase);
  const parts=chunks(m.text);
  for(let i=0;i<parts.length;i++){
    const first=i===0&&lastSpeaker!==m.name;const b=shell(m,first||i===0&&lastSpeaker!==m.name);lastSpeaker=m.name;
    if(!animate){b.innerHTML=safe(mentionize(md(parts[i])));continue}
    const words=parts[i].split(/(\s+)/);const step=Math.max(2,Math.ceil(words.length/45));
    for(let w=0;w<words.length;w+=step){b.innerHTML=safe(mentionize(md(closeOpen(words.slice(0,w+step).join('')))))+'<span class="caret"></span>';
      if(stick())main.scrollTop=main.scrollHeight;await sleep(28)}
    b.innerHTML=safe(mentionize(md(parts[i])));if(stick())main.scrollTop=main.scrollHeight;await sleep(350)}
}
let sticky=true;const stick=()=>sticky;
main.addEventListener('scroll',()=>{sticky=nearBottom();if(sticky){unread=0;document.getElementById('jump').style.display='none'}});
async function drain(){if(busy)return;busy=true;
  while(queue.length){const m=queue.shift();const anim=m._anim&&document.getElementById('anim').checked;
    await post(m,anim);if(!sticky&&primed){unread++;const j=document.getElementById('jump');j.textContent=`↓ ${unread} new message${unread>1?'s':''}`;j.style.display='block'}
    if(anim)await sleep(500)}
  busy=false;if(sticky)main.scrollTop=main.scrollHeight}
function roster(){
  const counts={},acts={},writing=new Set(state.typing.map(t=>t.name));
  state.messages.forEach(m=>counts[m.name]=(counts[m.name]||0)+1);state.typing.forEach(t=>acts[t.name]=t.acts.length?t.acts[t.acts.length-1]:['✍️','drafting a reply']);
  document.getElementById('roster').innerHTML=state.personas.map(p=>`<div class="p${filter===p.name?' on':''}" data-n="${esc(p.name)}">
   <div class="av" style="background:${p.color}">${esc(p.initials)}<span class="st ${writing.has(p.name)?'w':(counts[p.name]?'d':'')}"></span></div>
   <div class="meta"><div class="nm">${esc(p.name)}${p.external?` <span class="chip ds" style="background:#fff">${esc(p.model)}</span>`:''}</div>
   <div class="rl">${esc(p.role)}</div>${acts[p.name]?`<div class="act">${acts[p.name][0]} ${esc(acts[p.name][1])}</div>`:''}</div>
   <span class="ct">${counts[p.name]||0}</span></div>`).join('');
  document.querySelectorAll('.p').forEach(e=>e.onclick=()=>{filter=filter===e.dataset.n?null:e.dataset.n;
    document.querySelectorAll('.msg').forEach(m=>m.style.display=(!filter||m.dataset.who===filter)?'':'none');roster()})}
function stages(){const idx=state.stages.findIndex(s=>s.key===state.stage);
  document.getElementById('stages').innerHTML=state.stages.map((s,i)=>`<span class="sg ${state.done||i<idx?'done':(i===idx?'cur':'')}">${esc(s.label)}</span>`).join('<span class="arrow">›</span>');
  const lb=document.getElementById('livebadge');lb.textContent=state.done?'ENDED':'LIVE';lb.classList.toggle('end',state.done)}
function stats(){const words=state.messages.reduce((a,m)=>a+m.text.split(/\s+/).length,0);
  const t0=Math.min(...state.messages.map(m=>m.ts||Infinity),...state.typing.map(t=>t.since||Infinity));
  const mins=isFinite(t0)?Math.round((Date.now()/1000-t0)/60):0;
  const tools=state.typing.reduce((a,t)=>a+t.calls,0);
  document.getElementById('stats').innerHTML=`${state.messages.length} messages · ${words.toLocaleString()} words<br>${mins} min since the first speaker<br>${state.typing.length} drafting now · ${tools} lookups in flight<br><span style="opacity:.8">Click a panelist to filter</span>`}
function livebar(){const el=document.getElementById('liveinner');const t=state.typing;
  if(!t.length){el.innerHTML=`<div class="typing">${state.done?'🏁 War room closed: transcript.md and verdict.md are in __OUTDIR__.':'⏳ The moderator is setting up the next turn…'}</div>`;return}
  const lines=t.map(x=>{const p=state.personas.find(q=>q.name===x.name)||{initials:'?',color:'#334155'};const a=x.acts.length?x.acts[x.acts.length-1]:['✍️','thinking…'];
    return `<div class="sys"><span class="av mini" style="background:${p.color}">${esc(p.initials)}</span>${esc(x.name.split(' ')[0])} · ${a[0]} ${esc(a[1])}</div>`}).join('');
  const ps=t.map(x=>state.personas.find(p=>p.name===x.name)||{initials:'?',color:'#334155'});
  el.innerHTML=lines+`<div class="typing"><span class="tav">${ps.map(p=>`<span class="av" style="background:${p.color}">${esc(p.initials)}</span>`).join('')}</span>
   <span style="margin-left:8px">${esc(t.map(x=>x.name.split(' ')[0]).join(', '))} ${t.length>1?'are':'is'} typing</span><span class="dots"><span></span><span></span><span></span></span></div>`;
  if(sticky)main.scrollTop=main.scrollHeight}
async function tick(){
  try{state=await (await fetch('/data',{cache:'no-store'})).json();
    if(state.ui!==UI){location.reload();return}
    if(state.messages.length)document.getElementById('empty')?.remove();
    for(const m of state.messages)if(!seen.has(m.id)){seen.add(m.id);m._anim=primed;queue.push(m)}
    roster();stages();stats();livebar();drain();primed=true}
  catch(e){document.getElementById('liveinner').innerHTML='<div class="typing">Viewer reconnecting…</div>'}}
document.getElementById('jump').onclick=()=>{main.scrollTo({top:main.scrollHeight,behavior:'smooth'});unread=0;document.getElementById('jump').style.display='none'};
tick();setInterval(tick,2000);
</script></body></html>"""

MARKED = "https://cdn.jsdelivr.net/npm/marked@15.0.7/marked.min.js"
MARKED_SRI = "sha384-H+hy9ULve6xfxRkWIh/YOtvDdpXgV2fmAGQkIDTxIgZwNoaoBal14Di2YTMR6MzR"
PURIFY = "https://cdn.jsdelivr.net/npm/dompurify@3.2.6/dist/purify.min.js"
PURIFY_SRI = "sha384-JEyTNhjM6R1ElGoJns4U2Ln4ofPcqzSsynQkmEc/KGy6336qAZl70tDLufbkla+3"
PORT = 0


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        # Loopback only, and only under a loopback Host name: blocks DNS-rebinding reads of /data.
        if self.headers.get("Host", "") not in (f"127.0.0.1:{PORT}", f"localhost:{PORT}"):
            self.send_error(403, "unexpected Host header")
            return
        is_data = self.path.startswith("/data")
        nonce = secrets.token_urlsafe(16)
        if is_data:
            body = json.dumps(_state()).encode()
        else:
            body = (PAGE.replace("__MARKED__", MARKED).replace("__SRI__", MARKED_SRI)
                    .replace("__PURIFY__", PURIFY).replace("__PURIFY_SRI__", PURIFY_SRI)
                    .replace("__NONCE__", nonce).replace("__UI__", UI_VERSION)
                    .replace("__TITLE__", html.escape(PANEL.get("channel", "#war-room") + " · war room"))
                    .replace("__TOPIC__", html.escape(PANEL.get("title") or PANEL.get("topic", "War room")[:80]))
                    .replace("__CHANNEL__", html.escape(PANEL.get("channel", "#war-room")))
                    .replace("__OUTDIR__", html.escape(PANEL.get("outDir", "the output folder")))).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json" if is_data else "text/html; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        if not is_data:
            self.send_header("Content-Security-Policy",
                             f"default-src 'none'; script-src 'nonce-{nonce}' https://cdn.jsdelivr.net; "
                             "style-src 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; "
                             "base-uri 'none'; form-action 'none'; frame-ancestors 'none'")
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *_):
        pass


def _free_port(preferred):
    with socket.socket() as s:
        s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        try:
            s.bind(("127.0.0.1", preferred))
            return preferred
        except OSError:
            s.bind(("127.0.0.1", 0))
            return s.getsockname()[1]


if __name__ == "__main__":
    PORT = _free_port(int(sys.argv[3]) if len(sys.argv) > 3 else 8787)
    print(f"WAR_ROOM_LIVE http://127.0.0.1:{PORT}", flush=True)
    ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
