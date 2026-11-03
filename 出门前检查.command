#!/bin/bash
set -u
cd "$(dirname "$0")" || exit 1
bash bin/travel-check.sh
result=$?
if [ "${DSH_WEBTABS_DRY_RUN:-0}" != 1 ] && [ -t 0 ]; then read -r -p '按回车关闭窗口…' _; fi
exit "$result"
