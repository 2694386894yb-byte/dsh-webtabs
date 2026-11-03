#!/bin/bash
set -u
STATE="$HOME/.dsh/webtabs"
found=0
for name in web board gateway; do
 file="$STATE/$name.pid"
 if [ -f "$file" ]; then
 pid=$(cat "$file")
 if [[ "$pid" =~ ^[0-9]+$ ]] && kill -0 "$pid" 2>/dev/null; then
 commandline=$(ps -p "$pid" -o command=)
 case "$name:$commandline" in
 web:*"web --no-open --port 52352"*|board:*"bin/board.mjs"*|gateway:*"bin/gateway.mjs"*) kill "$pid"; found=1;;
 *) echo "PID $pid 已被其他进程使用，未停止，请人工检查。";;
 esac
 fi
 fi
done
sleep 2
busy=0
for port in 52352 52353 "${DSH_WEBTABS_GATEWAY_PORT:-52354}"; do
 if curl -s -o /dev/null -m 2 "http://127.0.0.1:$port/"; then echo "端口 $port 仍响应，请用 lsof -nP -iTCP:$port -sTCP:LISTEN 检查后手动处理。"; busy=1; fi
done
if [ "$busy" = 0 ]; then
 rm -f "$STATE/web.pid" "$STATE/board.pid" "$STATE/gateway.pid"
 if [ "$found" = 1 ]; then echo '已停止'; else echo '本来就没在跑'; fi
fi
