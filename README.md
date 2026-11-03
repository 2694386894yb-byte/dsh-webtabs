# DSH 网页多标签工作台

## 每天怎么用

一、双击一次 `安装开机自启.command`；二、把 `http://127.0.0.1:52353/` 加书签；三、每天点书签，点会话即可。不需要登录，不需要开文件夹。停止用 `停止网页端.command`；取消自启用 `卸载开机自启.command`。

原有 52353 工作台需按下文安装浏览器用户脚本；使用下面的 52354 同源工作台则无需脚本。自启在用户登录 macOS 时启动；停止服务后，可双击 `启动网页端.command` 恢复。

安装器将运行文件复制到 `~/.dsh/webtabs/app/bin/`：macOS TCC 限制 launchd 后台任务读取 Desktop、Documents，所以不能直接运行项目目录中的脚本。更新项目后重新双击安装器即可更新副本。自启日志在 `~/.dsh/webtabs/launchd.log`。

DSH 的持久签名 cookie 不因服务重启失效；每次打开工作台会通过服务端 token 请求转发 Set-Cookie，自动续期 30 天，token 不进入页面。

若重启后网页端读写桌面工作区报 `Operation not permitted`，用 `启动网页端.command` 手动启动一次即可（launchd 与 Terminal 的磁盘授权不同）。

## 这是什么

本机 A+B 验证版：一个常驻网页服务，工作台按工作区列会话，新标签深链减少侧栏滚动。零 npm 依赖。

## 安装

Chrome / Edge：安装 Tampermonkey，开启扩展的用户脚本权限（若提示开发者模式则按浏览器提示开启）。Firefox：安装 Tampermonkey 并启用。Safari：使用 Tampermonkey 或 Userscripts，并授权访问 127.0.0.1。安装扩展后导入 userscript/dsh-webtabs.user.js；也可双击安装入口，若未自动导入，在扩展中新建脚本粘贴。

浏览器扩展的匹配规则不支持在 host 中写端口，因此用户脚本用 `@match http://127.0.0.1/*` 和 `@match http://localhost/*` 匹配这两个地址的全端口，再由脚本正文最前面的 `if (location.port !== '52352') return` 限定只对网页端的 52352 端口生效。若更换网页端口，要同时修改 `bin/web-start.sh` 的 `WEB_PORT` 和用户脚本里的这一行。推荐 Chrome / Edge / Firefox / Arc；Safari 需 Userscripts/Tampermonkey 并确认支持 `document-start`，不生效就换 Chromium 系浏览器验证。

## 日常使用

首次安装浏览器用户脚本扩展并双击「安装.command」，然后按最前面的「每天怎么用」设置自启和书签。手动启动仍可双击「启动网页端.command」；`bin/web-start.sh --quiet` 只启动服务，不打开浏览器或输出登录链接。

浏览器：网页端和工作台默认用 Google Chrome 打开。可在启动前设置 `export DSH_WEBTABS_BROWSER="Safari"` 覆盖；设置 `export DSH_WEBTABS_BROWSER=""` 则使用系统默认浏览器。指定浏览器打开失败（例如未安装 Chrome）时自动退回系统默认浏览器，并在终端明确提示；仍失败则打印手动打开地址，不中断启动。请确认所用浏览器已安装并启用 Tampermonkey 用户脚本。

目录：`安装.command`、`启动网页端.command`、`停止网页端.command`、`安装开机自启.command`、`卸载开机自启.command`、`出门前检查.command`、`合盖保持运行.command` 是入口；bin/board.mjs 是工作台，bin/web-start.sh、web-stop.sh 管进程；userscript/ 是用户脚本；test/ 是测试与假数据。

端口：桌面 52351 不触碰；网页 52352；工作台 52353；测试使用临时空闲端口。只监听 127.0.0.1。工作台只读 ~/.dsh/storages/workspace.json、session_projcache/sessions 缓存及 sessions 下的锁文件路径，并通过 /usr/sbin/lsof 查询持有进程。环境变量 DSH_WEBTABS_DSH_HOME、DSH_WEBTABS_PORT 可覆盖工作台数据路径与端口。`DSH_WEBTABS_WEB_PORT` 用于覆盖网页探测和网关上游端口，默认 52352；网关端口由 `DSH_WEBTABS_GATEWAY_PORT` 覆盖，默认 52354。

## 实现原理

深链通过 document-start 把 ?session= 写入 localStorage 的 dsh.sessions.current。每次刷新带参数的页面会重新指定会话；localStorage 本身跨标签共享，运行中跨标签同步是否影响已打开会话仍须人工验证。DSH 升级失效时先检查这个键。

## 限制与注意

普通会话的 subagent.val 为空对象时保留；仅过滤有 identity 的子会话、归档与 blank 会话。health 统计去重后的可见会话，最近使用最多 8 条。

- **被占用的会话可以只读查看历史**：工作台灰色行及「桌面端占用中 · 只读」标签表示桌面端持有写锁，仍可点「只读查看」查看历史，发消息需先退出桌面端；其他进程持锁显示「其他 DSH 占用中 · 只读」。桌面 App 会一直持有它打开过的会话的写锁，所以切会话没用；退出桌面 App（⌘Q）后刷新即可（锁状态缓存 2 秒）。网页端自己持有的锁不标灰。检测失败时工作台正常显示；平时遵守「一个会话只在一个地方写」。
- **新会话 / 新工作区**：工作台只列已有会话；要新建，在网页端侧栏的对应工作区里新建，建完刷新工作台即可看到链接。工作台没有「新会话」按钮。
- **登录失效 / 401**：重新打开 52353 工作台会自动续 cookie。若仍失败，检查网页服务和 login-url.txt；缺少登录链接时先停止再启动。

web 与桌面共用会话库，但 profile 不同，截图、微信导出、Agent Teams 等桌面专属插件在网页端没有；先验证普通对话。

## 排错

cookie 过期时重新打开工作台自动续期，服务重启不使持久 cookie 失效。~/.dsh/webtabs/login-url.txt 含 token，别外传；日志与 PID 同目录。排错查看 web.log、board.log；端口检查用 lsof -nP -iTCP:52352 -sTCP:LISTEN（工作台换 52353）。停止脚本仅处理记录的 PID，不自动杀未知进程。异常启动锁需确认无启动过程后删除 ~/.dsh/webtabs/start.lock。

本地文件不一定触发扩展安装；若打开编辑器，在扩展中新建脚本并粘贴 userscript/dsh-webtabs.user.js。Safari Userscripts 的安装流程按该 App 操作。macOS 拦截 .command 时检查文件权限及系统提示。

## 自检命令

在项目父目录运行，无需浏览器或 dsh web：

```bash
bash dsh-webtabs/bin/selfcheck.sh
```

本机真实数据验收 sessions 应 ≥100。链接行数包含最近使用的重复链接，可能比 sessions 多 8。webReachable 为 false 只表示网页端未运行，不影响只读工作台。

## 已验证 / 未验证

已验证：真实数据 108 会话、自检脚本、静态检查。

未验证：真实 `dsh web` 启动、浏览器 cookie、用户脚本实际注入、跨标签刷新；需要逐项手动点击验证。地址栏带 `?session=` 只说明深链参数已传入，仍需确认实际显示指定会话。

测试可设置 `DSH_WEBTABS_FAKE_LOCKS='{"session-id":"desktop"}'`（也支持 other），设置后跳过 lsof；/health.desktopLocked 统计可见会话中桌面端占用数。

## 手机 / 平板

前置条件：Mac 与 iPhone / iPad 登录同一个 Tailscale 私有网络，Tailscale 已 Connected。

1. Mac 打开 Tailscale，双击「启动网页端.command」。更新过开机自启的用户需重新双击「安装开机自启.command」更新副本。
2. 手机也打开 Tailscale，在浏览器打开 `http://your-host.tailnet-name.ts.net/__board`（以启动脚本打印的地址为准）。
3. 点会话的「打开」，直接进入指定会话；iPad 多标签同理。不需要安装任何用户脚本。

本机也可收藏 `http://127.0.0.1:52354/__board`，同源跳转免用户脚本。原有 52353 工作台、用户脚本及占用标记继续可用。

启动脚本从 `tailscale status --json` 自动读取 DNSName，失败时使用默认 `your-host.tailnet-name.ts.net`；可用 `export DSH_WEBTABS_TS_HOST="你的主机名或 Tailscale IP"` 显式覆盖。主机名或 IP 变化后重跑启动脚本，必要时修改该变量。Tailscale 未连接不影响本机使用，连接后重跑脚本即可。quiet 自启同样启动网关及发布，但不打印或打开浏览器。

网关只监听 127.0.0.1:52354，由 Tailscale serve 发布给 tailnet，无额外鉴权。`/__board` 和 `/__goto` 自动续 cookie，其他路径（含 WebSocket）代理到网页端；token 不进入 HTML 或日志。停止脚本同时停止网关；Tailscale serve 配置保留，停服后远端暂不可达。网关日志为 `~/.dsh/webtabs/gateway.log`，发布日志为 `tailscale-serve.log`。

手机、iPad 的真实 Safari cookie、会话跳转、刷新及跨标签行为仍需手动点击验证；localStorage 跨标签共享。

## 离家模式（在校 / 在家当主机，推荐）

适合：出门只带手机，Mac 留在固定位置插电放着。

1. Mac 插电、开盖放着；屏幕可以自动关闭，但系统不要睡眠：
   系统设置 → 电池 → 选项 → 打开「当显示器关闭时防止自动睡眠」（或始终插电时保持）。
2. 确认 Tailscale 已连接（菜单栏 Tailscale 图标显示 Connected）。
3. 出门前双击 `出门前检查.command`，看到「✅ 可以出门」和手机地址即可；
   它会检查电量、Wi-Fi、Tailscale、三个服务，必要时自动把服务拉起来。
4. 手机（连 Tailscale）打开它打印的 `http://<TS_HOST>/__board`，选会话下指令。

不需要合盖保持运行；不需要外接显示器。屏幕关着也能跑文字类任务。

### 极端场景：背着走（可选）

日常不建议；只有确实需要把 Mac 合盖背在身上时用。

1. iPhone 打开个人热点。
2. Mac 连上该热点，并打开 Tailscale。
3. 双击 `出门前检查.command`，确认服务、热点与手机地址。若提示合盖不睡未开启，完成下一步后再检查，直到显示「✅ 可以出门」。
4. 双击 `合盖保持运行.command` 开启，管理员密码只在 macOS 弹窗输入；它是开关，再点一次会恢复。出门前检查本身不会修改睡眠设置。
5. 合盖装包。合盖后屏幕黑、系统继续跑；耗电发热正常，放硬壳、别压在被子里。
6. 手机同样连接 Tailscale，打开检查打印的 `http://<TS_HOST>/__board`，选择会话发送文字指令。最好先用手机实际打开并发一条文字消息，再装包。回家后双击 `合盖保持运行.command` 恢复正常睡眠。

限制：合盖时微信读屏、截图等屏幕类技能不可用，其他文字类正常；重启后需重新开启并检查 SleepDisabled；电量耗尽、热点断开都会断线。低于 30% 只警告，不阻止检查。检查无法自动确认当前 Wi-Fi 就是你的 iPhone 热点，也不能代替手机端实测。

`DSH_WEBTABS_DRY_RUN=1 bash 出门前检查.command` 只打印计划，不探测、不启动服务、不运行 Tailscale serve。实际检查在服务缺失时调用现有启动器，最多等待约 15 秒后复查；日志见 `~/.dsh/webtabs/travel-start.log` 和 `~/.dsh/webtabs/`。检查默认使用固定的 52352/52353/52354 端口。
