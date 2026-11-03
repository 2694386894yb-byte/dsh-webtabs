// ==UserScript==
// @name         DSH 网页工作台深链
// @namespace    local.dsh.webtabs
// @version      0.1.0
// @description  让 ?session=<id> 的链接直接打开指定 DSH 会话
// @match        http://127.0.0.1/*
// @match        http://localhost/*
// @run-at       document-start
// @grant        none
// ==/UserScript==
// 依赖 DSH 前端 localStorage 键；升级改变键名时修改下面这一行。
(()=>{if(location.port !== '52352') return;const key='dsh.sessions.current';try{const sessionId=new URLSearchParams(location.search).get('session');if(sessionId===null)return;if(!/^session-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sessionId)){console.warn('[dsh-webtabs] invalid session');return;}localStorage.setItem(key,JSON.stringify({sessionId}));console.debug('[dsh-webtabs] pinned',sessionId);}catch(e){console.warn('[dsh-webtabs]',e);}})();
