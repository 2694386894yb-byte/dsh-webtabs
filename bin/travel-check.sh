#!/bin/bash
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TS='/Applications/Tailscale.app/Contents/MacOS/Tailscale'
if [ "${DSH_WEBTABS_DRY_RUN:-0}" = 1 ]; then
 echo 'DRY_RUN：只打印计划，不执行检查或启动。'
 echo '1. pmset -g batt：电量、AC；低于 30% 警告。'
 echo '2. networksetup：查找 Wi-Fi/AirPort 设备并检查热点连接。'
 echo '3. Tailscale status：确认 Running、读取本机 DNS/IP；连接后计划 serve --bg --http=80 http://127.0.0.1:52354。'
 echo '4. 检查 52352 /、52353 /health、52354 /__board；失败时计划 bash bin/web-start.sh --quiet，最多等待 15 秒复查。'
 echo '5. pmset -g：检查 SleepDisabled；未开启则提示双击合盖保持运行.command。'
 echo '⚠️ 待处理：DRY_RUN 未验证远程可用；手机地址模板 http://<TS_HOST>/__board。'
 exit 0
fi
[ "$(uname -s)" = Darwin ] || { echo '⚠️ 待处理：仅支持 macOS，未启动服务。'; exit 1; }
issues=()
warn(){ issues+=("$1"); echo "⚠️ $1"; }
echo '1. 电量 / 电源'
if batt=$(/usr/bin/pmset -g batt 2>&1); then
 printf '%s\n' "$batt"
 percent=$(printf '%s\n' "$batt" | sed -nE 's/.*[[:space:]]([0-9]+)%.*/\1/p' | head -1)
 if [ -n "$percent" ] && [ "$percent" -lt 30 ]; then echo '⚠️ 电量低于 30%，仍继续；电量耗尽会断线。'; fi
else warn "无法读取电量：$batt"; fi
echo '2. Wi-Fi / iPhone 热点'
ports=$(/usr/sbin/networksetup -listallhardwareports 2>&1)
dev=$(printf '%s\n' "$ports" | awk '/^Hardware Port: (Wi-Fi|AirPort)$/ {found=1;next} found && /^Device:/ {print $2;exit}')
if [ -z "$dev" ]; then warn '未找到 Wi-Fi 设备；先开 iPhone 个人热点并让 Mac 连上。'
else
 wifi=$(/usr/sbin/networksetup -getairportnetwork "$dev" 2>&1); rc=$?
 echo "$wifi"
 if [ "$rc" != 0 ] || ! printf '%s\n' "$wifi" | grep -q '^Current Wi-Fi Network: .'; then warn '未确认 Wi-Fi 连接；先开 iPhone 个人热点并让 Mac 连上（也可在系统设置确认 Wi-Fi 权限）。'; fi
fi
echo '3. Tailscale'
host=''; connected=0
if [ ! -x "$TS" ]; then warn '未安装 Tailscale，请安装并打开 Tailscale。'
else
 if status=$("$TS" status 2>&1); then echo "$status"; else warn "Tailscale 未连接，请打开 Tailscale：$status"; fi
 # JSON 用系统自带 JXA 解析，不依赖 jq / 第三方包。
 json=$("$TS" status --json 2>/dev/null) || json='{}'
 info=$(printf '%s' "$json" | /usr/bin/osascript -l JavaScript -e 'ObjC.import("Foundation"); var s=$.NSString.alloc.initWithDataEncoding($.NSFileHandle.fileHandleWithStandardInput.readDataToEndOfFile, $.NSUTF8StringEncoding).js; var d=JSON.parse(s); if(d.BackendState==="Running" && d.Self && d.Self.Online!==false) { var h=d.Self.DNSName || (d.Self.TailscaleIPs||[]).filter(x=>x.indexOf(":")<0)[0] || ""; if(h) h.replace(/\.$/,""); }' 2>/dev/null) || info=''
 if [ -n "$info" ] && [ "$info" != undefined ]; then
  host="${DSH_WEBTABS_TS_HOST:-$info}"; connected=1
  if ! published=$("$TS" serve --bg --http=80 http://127.0.0.1:52354 2>&1); then warn "Tailscale 发布失败：$published"; fi
  echo "手机地址：http://$host/__board"
 else warn 'Tailscale 未连接 / Stopped 或无法读取本机地址，请打开 Tailscale。'; fi
fi
echo '4. 三个服务'
probe(){
 local code timeout=1
 if [ -n "${deadline:-}" ]; then
  [ "$SECONDS" -lt "$deadline" ] || return 1
 fi
 code=$(curl -s --max-time "$timeout" -o /dev/null -w '%{http_code}' "http://127.0.0.1:$1$2") || return 1
 case "$1:$code" in 52352:2??|52352:3??|52352:401|52352:403|52353:2??|52354:2??) return 0;; *) return 1;; esac
}
all_alive(){ probe 52352 / && probe 52353 /health && probe 52354 /__board; }
if ! all_alive; then
 echo '服务缺失，尝试幂等启动，最多等待 15 秒…'
 # 启动器本身可能等待较久，因此后台运行并在截止时间终止启动器。
 log="$HOME/.dsh/webtabs/travel-start.log"
 mkdir -p "$HOME/.dsh/webtabs"
 bash "$ROOT/bin/web-start.sh" --quiet > "$log" 2>&1 &
 starter=$!; deadline=$((SECONDS + 15))
 while [ "$SECONDS" -lt "$deadline" ]; do
  all_alive && break
  sleep 0.2
 done
 if kill -0 "$starter" 2>/dev/null; then kill -TERM "$starter" 2>/dev/null || true; fi
 wait "$starter" 2>/dev/null || true
 unset deadline
 echo "启动日志：$log"
fi
for entry in '52352 /' '52353 /health' '52354 /__board'; do
 read -r port path <<< "$entry"
 if probe "$port" "$path"; then echo "✅ $port $path 正常"; else warn "$port $path 未就绪；查看 $HOME/.dsh/webtabs/travel-start.log 和 $HOME/.dsh/webtabs/{web,board,gateway,tailscale-serve}.log"; fi
done
echo '5. 合盖睡眠'
state=$(/usr/bin/pmset -g 2>&1) || state=''
value=$(printf '%s\n' "$state" | awk 'tolower($1)=="sleepdisabled" {print $2;exit}')
if [ "$value" = 1 ]; then echo '✅ SleepDisabled=1，合盖不睡已开启。'; else warn '合盖不睡未开启或状态无法读取：双击 合盖保持运行.command 再出门。'; fi
echo '—— 结论 ——'
if [ "${#issues[@]}" = 0 ] && [ "$connected" = 1 ]; then
 echo "✅ 可以出门：手机打开 http://$host/__board"
 echo '请先用已连接 Tailscale 的手机实际打开并发一条文字消息，确认热点链路可用。'
else
 printf '⚠️ 待处理：%s\n' "${issues[@]}"
 [ -z "$host" ] || echo "手机地址：http://$host/__board"
 exit 1
fi
