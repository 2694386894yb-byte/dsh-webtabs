#!/bin/bash
set -u
QUIET=0
case "${1:-}" in --quiet) QUIET=1;; "") ;; *) echo "不支持的参数：$1"; exit 1;; esac
BROWSER_APP="${DSH_WEBTABS_BROWSER:-Google Chrome}"
# 显式留空表示系统默认；:- 本身会把空值也替换成 Chrome。
if [ "${DSH_WEBTABS_BROWSER+x}" = x ]; then BROWSER_APP="$DSH_WEBTABS_BROWSER"; fi
DSH="/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh"
DSH_HOME="${HOME}/.dsh"
WEB_PORT=52352
BOARD_PORT=52353
GATEWAY_PORT="${DSH_WEBTABS_GATEWAY_PORT:-52354}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
STATE="$DSH_HOME/webtabs"
umask 077
mkdir -p "$STATE" || { echo '无法创建状态目录，请检查权限'; exit 1; }
mkdir "$STATE/start.lock" 2>/dev/null || { echo '另一次启动正在进行；若上次异常退出，请删除 ~/.dsh/webtabs/start.lock 后重试'; exit 1; }
trap 'rmdir "$STATE/start.lock"' EXIT
fail(){ echo "$1；请双击停止后重试。"; exit 1; }
if ! curl -s -o /dev/null -m 2 "http://127.0.0.1:$WEB_PORT/"; then
 [ -x "$DSH" ] || fail 'CLI 不存在或无执行权限，请检查 DSH 安装'
 nohup "$DSH" web --no-open --port "$WEB_PORT" > "$STATE/web.log" 2>&1 &
 echo $! > "$STATE/web.pid"
 disown
 token=''
 for ((i=0;i<60;i++)); do
 token=$(grep -o 'token=[A-Za-z0-9_-]*' "$STATE/web.log" | head -1)
 [ -n "$token" ] && break
 sleep 0.5
 done
 if [ -z "$token" ]; then fail '未取得登录链接，检查端口占用或日志中的权限错误'; fi
 printf 'http://127.0.0.1:%s/?%s\n' "$WEB_PORT" "$token" > "$STATE/login-url.txt"
 chmod 600 "$STATE/login-url.txt"
fi
[ -s "$STATE/login-url.txt" ] || fail '网页端已运行但缺登录链接，请先双击停止再启动'
if ! curl -fsS -o /dev/null -m 2 "http://127.0.0.1:$BOARD_PORT/health"; then
 NODE="${NODE:-$(command -v node || true)}"
 [ -x "$NODE" ] || NODE=$(command -v node || true)
 [ -x "$NODE" ] || fail '找不到 Node，请检查 DSH runtime'
 nohup "$NODE" "$ROOT/bin/board.mjs" > "$STATE/board.log" 2>&1 &
 echo $! > "$STATE/board.pid"
 disown
 ok=0
 for ((i=0;i<20;i++)); do
 if curl -fsS -o /dev/null -m 1 "http://127.0.0.1:$BOARD_PORT/health" 2>/dev/null; then ok=1; break; fi
 sleep 0.5
 done
 [ "$ok" = 1 ] || { tail -40 "$STATE/board.log"; fail '工作台启动失败，请检查 52353 端口占用'; }
fi
if ! curl -fsS -o /dev/null -m 3 "http://127.0.0.1:$GATEWAY_PORT/__board" 2>/dev/null; then
 NODE="${NODE:-$(command -v node || true)}"
 [ -x "$NODE" ] || NODE=$(command -v node || true)
 [ -x "$NODE" ] || fail '找不到 Node，请检查 DSH runtime'
 nohup "$NODE" "$ROOT/bin/gateway.mjs" > "$STATE/gateway.log" 2>&1 &
 echo $! > "$STATE/gateway.pid"
 disown
 ok=0
 for ((i=0;i<20;i++)); do
  if curl -fsS -o /dev/null -m 3 "http://127.0.0.1:$GATEWAY_PORT/__board" 2>/dev/null; then ok=1; break; fi
  sleep 0.5
 done
 [ "$ok" = 1 ] || fail '网关启动失败，请检查 gateway.log 和端口占用'
fi
TS='/Applications/Tailscale.app/Contents/MacOS/Tailscale'
TS_HOST="${DSH_WEBTABS_TS_HOST:-your-host.tailnet-name.ts.net}"
ts_status=''
if [ -x "$TS" ]; then ts_status=$("$TS" status --json 2>/dev/null || true); fi
# status 的 JSON 格式允许空格或换行；不依赖 jq。
NODE="${NODE:-$(command -v node || true)}"
[ -x "$NODE" ] || NODE=$(command -v node || true)
ts_info=''
if [ -x "$NODE" ]; then
 ts_info=$(printf '%s' "$ts_status" | "$NODE" -e 'let s="";process.stdin.on("data",b=>s+=b);process.stdin.on("end",()=>{try{const d=JSON.parse(s);if(d.BackendState==="Running")console.log((d.Self?.DNSName||"connected").replace(/\.$/,""));}catch{}})')
fi
if [ -n "$ts_info" ]; then
 if [ -z "${DSH_WEBTABS_TS_HOST:-}" ] && [ "$ts_info" != connected ]; then TS_HOST="$ts_info"; fi
 if "$TS" serve --bg --http=80 "http://127.0.0.1:$GATEWAY_PORT" > "$STATE/tailscale-serve.log" 2>&1; then
  [ "$QUIET" = 1 ] || echo "手机/平板：http://$TS_HOST/__board"
 else
  [ "$QUIET" = 1 ] || echo 'Tailscale 发布失败，请查看 tailscale-serve.log 后重跑本脚本'
 fi
else
 [ "$QUIET" = 1 ] || echo 'Tailscale 未连接，手机/平板暂不可用；打开 Tailscale 后重跑本脚本'
fi
if [ "$QUIET" = 1 ]; then exit 0; fi
URL=$(cat "$STATE/login-url.txt")
code=$(curl -s -m 10 -c "$STATE/cookie.txt" -L -o /dev/null -w '%{http_code}' "$URL")
case "$code" in 2??|3??) ;; *) echo 'cookie 或端口异常，请检查登录链接与日志（继续启动）';; esac
open_browser(){
 if [ -n "$BROWSER_APP" ]; then
  if open -a "$BROWSER_APP" "$1"; then return 0; fi
  echo "浏览器：$BROWSER_APP 打开失败，已退回系统默认浏览器（$1）"
 fi
 if open "$1"; then return 0; fi
 echo "请手动打开：$1"
}
if [ -n "$BROWSER_APP" ]; then
 echo "浏览器：$BROWSER_APP（改：DSH_WEBTABS_BROWSER=\"Safari\"）"
else
 echo '浏览器：系统默认浏览器（DSH_WEBTABS_BROWSER 为空）'
fi
open_browser "$URL"
echo "登录链接：$URL"
open_browser "http://127.0.0.1:$BOARD_PORT/"
echo "工作台：http://127.0.0.1:$BOARD_PORT/"
echo '把工作台加入书签/主页；点会话就在新标签打开'
echo '请确认用「装了 Tampermonkey 用户脚本」的浏览器打开；改浏览器：设置 DSH_WEBTABS_BROWSER="Safari" 后重试。'
