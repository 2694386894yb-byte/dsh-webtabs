#!/bin/bash
set -u
PLIST="$HOME/Library/LaunchAgents/com.example.dshwebtabs.plist"
launchctl bootout "gui/$UID/com.example.dshwebtabs" 2>/dev/null || true
if ! rm -f "$PLIST"; then
 echo "取消自启失败：无法删除 $PLIST，请检查权限。"
 exit 1
fi
echo '已取消开机自启（服务本次仍在跑，可用停止脚本停）'
