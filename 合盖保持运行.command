#!/bin/bash
set -u
finish(){ if [ -t 0 ]; then read -r -p '按回车关闭窗口…' _; fi; }
trap finish EXIT
[ "$(uname -s)" = Darwin ] || { echo '失败：仅支持 macOS，未修改设置。'; exit 1; }
state=$(/usr/bin/pmset -g 2>&1) || { echo "失败：无法读取 pmset：$state"; exit 1; }
current=$(printf '%s\n' "$state" | awk 'tolower($1)=="sleepdisabled" {print $2; exit}')
case "$current" in 0) target=1;; 1) target=0;; *) echo '失败：pmset 未返回有效 SleepDisabled 状态，未修改设置。'; exit 1;; esac
if ! /usr/bin/osascript -e "do shell script \"/usr/bin/pmset -a disablesleep $target\" with administrator privileges"; then
 echo '失败：管理员授权取消或 pmset 被拒绝；未确认设置成功。'; exit 1
fi
state=$(/usr/bin/pmset -g 2>&1) || { echo "失败：修改后无法复查 pmset：$state"; exit 1; }
actual=$(printf '%s\n' "$state" | awk 'tolower($1)=="sleepdisabled" {print $2; exit}')
[ "$actual" = "$target" ] || { echo "失败：复查未生效，期望 SleepDisabled=$target，实际=${actual:-未知}。"; exit 1; }
if [ "$target" = 1 ]; then echo '已开启：合盖不睡（电池/电源都生效）'; else echo '已恢复：合盖会正常睡眠'; fi
echo '合盖后屏幕黑、系统继续跑；耗电发热正常，放硬壳/别压在被子里。'
echo '重启 Mac 后该设置会失效，出门前重开一次，并运行出门前检查确认。'
echo '合盖时依赖屏幕的技能（微信读屏、截图）不可用，其他文字类正常。'
