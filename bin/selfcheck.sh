#!/bin/bash
set -eu
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
NODE="${NODE:-$HOME/.dsh/dsh-runtimes/dsh-primary-runtime/dependencies/node/bin/node}"
[ -x "$NODE" ] || NODE="$(command -v node || true)"
step='初始化'; pid=''
cleanup(){
 if [ -n "$pid" ]; then
  kill -TERM "$pid" 2>/dev/null || true
  for ((j=0;j<15;j++)); do kill -0 "$pid" 2>/dev/null || break; sleep .1; done
  kill -KILL "$pid" 2>/dev/null || true
  wait "$pid" 2>/dev/null || true
 fi
}
trap cleanup EXIT
trap 'echo "❌ 失败项：$step"; exit 1' ERR
trap 'exit 1' INT TERM
step='board 语法'; "$NODE" --check "$ROOT/bin/board.mjs"
step='gateway 和共享模块语法'; "$NODE" --check "$ROOT/bin/gateway.mjs"; "$NODE" --check "$ROOT/bin/lib/board-core.mjs"
step='gateway 假上游'; "$NODE" --test "$ROOT/test/gateway.test.mjs"
step='userscript 语法'; "$NODE" --check "$ROOT/userscript/dsh-webtabs.user.js"
step='Shell 语法'; for f in "$ROOT"/*.command "$ROOT"/bin/*.sh; do bash -n "$f"; done
step='fixture 测试'; "$NODE" --test "$ROOT/test/board.test.mjs"
step='真实数据检查'
if [ ! -r "$HOME/.dsh/storages/workspace.json" ]; then
 echo '真实数据：跳过（无数据）'
else
 "$NODE" --input-type=module -e 'import net from "node:net"; const s=net.createServer(); s.on("error",()=>process.exit(1)); s.listen(52398,"127.0.0.1",()=>s.close());'
 DSH_WEBTABS_DSH_HOME="$HOME/.dsh" DSH_WEBTABS_PORT=52398 "$NODE" "$ROOT/bin/board.mjs" &
 pid=$!
 health=''
 for ((i=0;i<30;i++)); do
  kill -0 "$pid"
  if health=$(curl -fsS --max-time 1 http://127.0.0.1:52398/health 2>/dev/null); then break; fi
  sleep .1
 done
 "$NODE" -e 'const d=JSON.parse(process.argv[1]); console.log("sessions="+d.sessions); if(d.sessions<100)process.exit(1)' "$health"
 page=$(curl -fsS --max-time 2 http://127.0.0.1:52398/)
 "$NODE" -e 'console.log("一页链接数="+(process.argv[1].match(/\?session=/g)||[]).length)' "$page"
 cleanup; pid=''
fi
echo '✅ 自检通过'
