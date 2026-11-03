#!/bin/bash
set -u
cd "$(dirname "$0")" || exit 1
chmod +x ./*.command bin/*.sh
echo '1. 先装 Tampermonkey（Chrome/Edge/Firefox/Arc）；Safari 用 Userscripts App，再跑本脚本。'
open userscript/dsh-webtabs.user.js
echo '2. 已请求打开用户脚本安装页 → 点安装；若打开编辑器，请在扩展中新建脚本并粘贴文件内容。'
echo '3. 然后双击 启动网页端.command'
echo '4. 把 http://127.0.0.1:52353/ 加入书签'
