#!/bin/bash
set -eu
ROOT="$(cd "$(dirname "$0")" && pwd)"
STATE="$HOME/.dsh/webtabs"
PLIST="$HOME/Library/LaunchAgents/com.example.dshwebtabs.plist"
fail(){ echo "安装开机自启失败：$1"; echo "plist 路径：$PLIST"; exit 1; }
trap 'fail "操作未完成，请检查上方错误原文和目录权限"' ERR
umask 077
mkdir -p "$STATE/app/bin/lib" "$(dirname "$PLIST")"
for file in board.mjs gateway.mjs lib/board-core.mjs web-start.sh web-stop.sh; do
 cp "$ROOT/bin/$file" "$STATE/app/bin/$file"
 chmod +x "$STATE/app/bin/$file"
done
# 用系统 plist 工具写路径，正确处理 HOME 中的空格和 XML 特殊字符。
/usr/bin/plutil -create xml1 "$PLIST"
/usr/bin/plutil -insert Label -string com.example.dshwebtabs "$PLIST"
/usr/bin/plutil -insert ProgramArguments -xml '<array/>' "$PLIST"
/usr/bin/plutil -insert ProgramArguments.0 -string /bin/bash "$PLIST"
/usr/bin/plutil -insert ProgramArguments.1 -string "$STATE/app/bin/web-start.sh" "$PLIST"
/usr/bin/plutil -insert ProgramArguments.2 -string --quiet "$PLIST"
/usr/bin/plutil -insert RunAtLoad -bool true "$PLIST"
/usr/bin/plutil -insert KeepAlive -bool false "$PLIST"
# 启动器退出后保留 nohup 服务；卸载自启也不停止本次服务。
/usr/bin/plutil -insert AbandonProcessGroup -bool true "$PLIST"
/usr/bin/plutil -insert StandardOutPath -string "$STATE/launchd.log" "$PLIST"
/usr/bin/plutil -insert StandardErrorPath -string "$STATE/launchd.log" "$PLIST"
/usr/bin/plutil -insert ProcessType -string Background "$PLIST"
/usr/bin/plutil -insert ThrottleInterval -integer 10 "$PLIST"
launchctl bootout "gui/$UID/com.example.dshwebtabs" 2>/dev/null || true
if ! error=$(launchctl bootstrap "gui/$UID" "$PLIST" 2>&1); then
 echo "$error"
 fail 'launchctl 加载失败，请根据上方原文检查登录会话和 plist'
fi
echo '已设置开机自启。以后只需要收藏并打开 http://127.0.0.1:52353/'
deadline=$((SECONDS + 20))
while [ "$SECONDS" -lt "$deadline" ]; do
 if health=$(curl -fsS --max-time 1 http://127.0.0.1:52353/health 2>/dev/null); then
  case "$health" in *'"webReachable":true'*) echo '运行正常：工作台和网页端均可达。'; exit 0;; esac
 fi
 sleep 0.2
done
echo "已设置自启，但 20 秒内未确认服务就绪。请查看 $STATE/launchd.log、web.log、board.log；plist：$PLIST"
exit 1
