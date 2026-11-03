import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {execFile} from 'node:child_process';
const home=process.env.DSH_WEBTABS_DSH_HOME||path.join(os.homedir(),'.dsh');
export const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function data(){
 try{const d=JSON.parse(fs.readFileSync(path.join(home,'storages/workspace.json'))),g=d.global||{}, archived=new Set(g.archivedSessionIds),pinned=new Set(g.pinnedSessionIds);
 const groups=(g.workspaceIds?.length?g.workspaceIds:Object.keys(d.tables.workspaces)).map(id=>{const ws=d.tables.workspaces[id];if(!ws)return null;const sessions=(ws.sessionIds||[]).flatMap(id=>{if(archived.has(id))return [];let title='未命名',time=Number(ws.updatedAt)||0,blank=false;try{const f=path.join(home,'storages/session_projcache/sessions',path.basename(id)+'.json');time=fs.statSync(f).mtimeMs;const r=JSON.parse(fs.readFileSync(f)).record.rows;if(r.subagent?.val?.identity)return [];title=r.title?.val||title;time=r.sessionListMetadata?.lastPromptAt||time;blank=r.sessionListMetadata?.blank===true;if(blank)return [];}catch{}return [{id,title,time,blank,pinned:pinned.has(id)}];}).sort((a,b)=>Number(b.pinned)-Number(a.pinned)||b.time-a.time);return {title:ws.title||ws.path,sessions};}).filter(Boolean);return {groups};}catch{return {groups:[],error:'暂时读不到会话数据，请检查 DSH 数据目录后刷新。'};}}
// Cache the in-flight lookup too, so concurrent refreshes share two lsof calls.
let lockCache,lockCacheUntil=0;
function lsof(args){
 return new Promise(resolve=>execFile('/usr/sbin/lsof',args,{timeout:1500,maxBuffer:8*1024*1024},(_error,stdout)=>resolve(stdout||'')));
}
function holders(output){
 let pid;
 const entries=[];
 for(const line of output.split('\n')){
  if(/^p\d+$/.test(line))pid=Number(line.slice(1));
  else if(line.startsWith('n')&&pid)entries.push([line.slice(1),pid]);
 }
 return entries;
}
export function lockState(sessions=data().groups.flatMap(g=>g.sessions)){
 if(process.env.DSH_WEBTABS_FAKE_LOCKS!==undefined){
  try{return Promise.resolve(new Map(Object.entries(JSON.parse(process.env.DSH_WEBTABS_FAKE_LOCKS)).filter(([,state])=>state==='desktop'||state==='other')));}catch{return Promise.resolve(new Map());}
 }
 if(lockCache&&Date.now()<lockCacheUntil)return lockCache;
 lockCacheUntil=Date.now()+2000;
 lockCache=(async()=>{
  try{
   const root=path.resolve(home,'sessions'),files=new Map();
   const ids=[...new Set(sessions.map(s=>s.id))].filter(id=>typeof id==='string'&&id===path.basename(id)&&id!=='.'&&id!=='..');
   for(const dir of fs.readdirSync(root,{withFileTypes:true})){
    if(!dir.isDirectory())continue;
    for(const id of ids){
     const file=path.join(root,dir.name,id,'session.lock');
     if(fs.existsSync(file))files.set(file,id);
    }
   }
   if(!files.size)return new Map();
   const [locks,listeners]=await Promise.all([
    lsof(['-n','-F','pn',...files.keys()]),
    lsof(['-nP','-sTCP:LISTEN','-iTCP:52351','-iTCP:52352','-F','pn'])
   ]);
   const ports=holders(listeners);
   const desktopPid=ports.find(([name])=>name.endsWith(':52351'))?.[1];
   const webPid=ports.find(([name])=>name.endsWith(':52352'))?.[1];
   const result=new Map();
   for(const [file,pid] of holders(locks)){
    const id=files.get(file);
    if(!id||pid===webPid)continue;
    const state=pid===desktopPid?'desktop':'other';
    if(result.get(id)!=='desktop')result.set(id,state);
   }
   return result;
  }catch{return new Map();}
 })();
 return lockCache;
}
export function relative(t){const n=Math.max(0,(Date.now()-t)/60000);return n<1?'刚刚':n<60?`${Math.floor(n)} 分钟前`:n<1440?`${Math.floor(n/60)} 小时前`:n<43200?`${Math.floor(n/1440)} 天前`:'更早';}
export function probe(){return new Promise(resolve=>{const r=http.get(`http://127.0.0.1:${process.env.DSH_WEBTABS_WEB_PORT||52352}/`,s=>{s.resume();resolve(true)});r.setTimeout(300,()=>{r.destroy();resolve(false)});r.on('error',()=>resolve(false));});}
export async function renewalCookies(){
 try{
  const url=fs.readFileSync(path.join(home,'webtabs/login-url.txt'),'utf8').trim();
  return await new Promise(resolve=>{
   const r=http.get(url,s=>{const cookies=s.headers['set-cookie'];s.resume();resolve(cookies);});
   const timer=setTimeout(()=>{r.destroy();resolve(undefined);},1200);
   r.on('close',()=>clearTimeout(timer));
   r.on('error',()=>{clearTimeout(timer);resolve(undefined);});
  });
 }catch{return undefined;}
}
export function row(s,locks,{sessionHref}){
 const state=locks.get(s.id),locked=state==='desktop'||state==='other';
 return `<li${locked?' class="locked" title="可以查看历史；发消息需先退出桌面端（⌘Q）后刷新"':''}>${s.pinned?'★ ':''}${esc(s.title)}${locked?` <small>${state==='desktop'?'桌面端占用中':'其他 DSH 占用中'} · 只读</small>`:''} · ${relative(s.time)} <a target="_blank" rel="noreferrer" href="${esc(sessionHref(s.id))}">${locked?'只读查看':'打开'}</a></li>\n`;
}
export function renderBoard(d,webReachable,locks,{sessionHref,refreshHref="/"}){
 const all=[...new Map(d.groups.flatMap(g=>g.sessions).map(s=>[s.id,s])).values()];
 return `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>DSH 网页工作台</title><style>body{max-width:960px;margin:40px auto;padding:0 20px;font:16px system-ui;background:#f5f7fa;color:#202936}details,section{background:white;padding:20px;margin:16px 0;border-radius:12px}li{padding:10px;overflow-wrap:anywhere}a{color:#235ac4}summary{cursor:pointer}.locked,.locked a{color:#9aa3ad}.locked small{font-size:12px;border:1px solid currentColor;border-radius:4px;padding:1px 4px}</style><h1>DSH 网页工作台</h1><p>${webReachable?'● 运行中':'○ 未运行 · 双击 启动网页端.command'} · <a href="${esc(refreshHref)}">刷新</a></p><p>灰色 = 被桌面端占用：可以点进去看历史（只读），发消息需先退出桌面 App 后刷新</p><p>${esc(d.error||(!all.length?'暂无会话，到应用里新建。':''))}</p><section><h2>最近使用</h2><ul>${all.filter(s=>!s.blank).sort((a,b)=>b.time-a.time).slice(0,8).map(s=>row(s,locks,{sessionHref})).join('')}</ul></section>${d.groups.map(g=>`<details><summary>${esc(g.title)} · ${g.sessions.length} 个会话</summary>${g.sessions.length?`<ul>${g.sessions.map(s=>row(s,locks,{sessionHref})).join('')}</ul>`:'这个工作区还没有会话，到应用里新建'}</details>`).join('')}</html>`;
}
