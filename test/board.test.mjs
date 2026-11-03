import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import net from 'node:net';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function port(){const s=net.createServer();await new Promise((resolve,reject)=>{s.once('error',reject);s.listen(0,'127.0.0.1',resolve)});const p=s.address().port;await new Promise(r=>s.close(r));return p;}
for(const fakeLocks of [undefined,JSON.stringify({'session-11111111-1111-1111-1111-111111111111':'desktop','session-44444444-4444-4444-4444-444444444444':'other'})])
test('fixture HTTP、过滤、转义、排序、路由、占用 '+(fakeLocks?'fake':'无锁'),async()=>{const p=await port();let spawnError;const env={...process.env};delete env.DSH_WEBTABS_FAKE_LOCKS;if(fakeLocks!==undefined)env.DSH_WEBTABS_FAKE_LOCKS=fakeLocks;const c=spawn(process.execPath,[fileURLToPath(new URL('../bin/board.mjs',import.meta.url))],{cwd:root,env:{...env,DSH_WEBTABS_DSH_HOME:fileURLToPath(new URL('./fixtures/home',import.meta.url)),DSH_WEBTABS_PORT:String(p)}});const exited=new Promise(resolve=>{c.once('error',e=>{spawnError=e;resolve();});c.once('exit',resolve);});try{let r;for(let i=0;i<40;i++){if(spawnError)throw spawnError;if(c.exitCode!==null)throw new Error('board 提前退出');try{r=await fetch(`http://127.0.0.1:${p}/health`,{signal:AbortSignal.timeout(500)});break;}catch{await new Promise(r=>setTimeout(r,50));}}const health=await r.json();assert.equal(health.sessions,4);assert.equal(health.desktopLocked,fakeLocks?1:0);const html=await(await fetch(`http://127.0.0.1:${p}/`,{signal:AbortSignal.timeout(500)})).text();assert.ok(html.includes('&lt;script&gt;'));assert.ok(!html.includes('<script>'));assert.ok(html.includes('未命名'));assert.ok(!html.includes('session-77777777'));assert.equal(new Set([...html.matchAll(/\?session=([^"]+)/g)].map(m=>m[1])).size,4);
 const rows=[...html.matchAll(/<li[^>]*>.*?<\/li>/g)].map(m=>m[0]);
 if(fakeLocks){
  for(const label of ['桌面端占用中','其他 DSH 占用中']){
   const locked=rows.filter(row=>row.includes(label));
   assert.equal(locked.length,2,'最近使用和工作区都应标记');
   for(const row of locked){assert.ok(row.includes('class="locked"'));assert.ok(row.includes('title="可以查看历史；发消息需先退出桌面端（⌘Q）后刷新"'));assert.ok(row.includes(label+' · 只读'));assert.ok(row.includes('>只读查看</a>'));assert.match(row,/href="http:\/\/127\.0\.0\.1:52352\/\?session=session-/);}
  }
 }
 for(const row of rows.filter(row=>!row.includes('class="locked"'))){assert.ok(row.includes('>打开</a>'));assert.ok(row.includes('?session='));}
 assert.ok(html.includes('?session=session-55555555-5555-5555-5555-555555555555'));
 assert.ok(html.includes('★ '));assert.ok(html.indexOf('工作区 A')<html.indexOf('工作区 B'));assert.ok(!html.includes('session-22222222'));assert.ok(!html.includes('session-33333333'));assert.equal((await fetch(`http://127.0.0.1:${p}/no`,{signal:AbortSignal.timeout(500)})).status,404);}finally{c.kill('SIGTERM');await Promise.race([exited,delay(1500)]);if(c.exitCode===null&&c.signalCode===null&&!spawnError){c.kill('SIGKILL');await Promise.race([exited,delay(1500)]);}assert.ok(spawnError||c.exitCode!==null||c.signalCode!==null,'子进程必须退出');}});

test('自动续 cookie、health 不续期、token 故障静默降级',async()=>{
 const http=await import('node:http');
 const fs=await import('node:fs/promises');
 const path=await import('node:path');
 const home=await fs.mkdtemp(path.join(root,'test/.cookie-home-'));
 const token='fixture-secret-token-never-in-html';
 const cookie=['dsh_fixture=signed; Path=/; HttpOnly; SameSite=Strict; Max-Age=2592000','extra=value; Path=/'];
 let hits=0;
 const fake=http.createServer((req,res)=>{
  if(req.url.includes(token)){hits++;res.writeHead(303,{'Set-Cookie':cookie,Location:'/'});}
  res.end();
 });
 let child;let logs='';let exited;
 const webPort=await port();
 try{
  await new Promise((resolve,reject)=>{fake.once('error',reject);fake.listen(webPort,'127.0.0.1',resolve);});
  await fs.mkdir(path.join(home,'webtabs'));
  await fs.writeFile(path.join(home,'webtabs/login-url.txt'),`http://127.0.0.1:${webPort}/?token=${token}\n`);
  const p=await port();
  child=spawn(process.execPath,[path.join(root,'bin/board.mjs')],{env:{...process.env,DSH_WEBTABS_DSH_HOME:home,DSH_WEBTABS_PORT:String(p),DSH_WEBTABS_WEB_PORT:String(webPort)}});
  exited=new Promise(resolve=>child.once('exit',resolve));
  child.stdout.on('data',b=>logs+=b);child.stderr.on('data',b=>logs+=b);
  const base=`http://127.0.0.1:${p}`;
  let ready=false;
  for(let i=0;i<40;i++){try{await fetch(base+'/health');ready=true;break;}catch{await delay(50);}}
  assert.ok(ready);assert.equal(hits,0);
  const r=await fetch(base+'/');assert.equal(r.status,200);
  assert.deepEqual(r.headers.getSetCookie(),cookie);
  assert.ok(!(await r.text()).includes(token));assert.equal(hits,1);
  await new Promise(resolve=>fake.close(resolve));
  const down=await fetch(base+'/');assert.equal(down.status,200);assert.equal(down.headers.get('set-cookie'),null);
  // 网页探测可达，但 token URL 不可达。
  await new Promise(resolve=>fake.listen(webPort,'127.0.0.1',resolve));
  const deadPort=await port();
  await fs.writeFile(path.join(home,'webtabs/login-url.txt'),`http://127.0.0.1:${deadPort}/?token=${token}`);
  assert.equal((await fetch(base+'/')).status,200);
  await fs.unlink(path.join(home,'webtabs/login-url.txt'));
  assert.equal((await fetch(base+'/')).status,200);
  assert.ok(!logs.includes(token));
 }finally{
  if(child){child.kill('SIGTERM');await Promise.race([exited,delay(1500)]);if(child.exitCode===null&&child.signalCode===null){child.kill('SIGKILL');await exited;}}
  if(fake.listening)await new Promise(resolve=>fake.close(resolve));
  await fs.rm(home,{recursive:true,force:true});
 }
});
