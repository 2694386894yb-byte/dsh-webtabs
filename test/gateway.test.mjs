import {test} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import net from 'node:net';
import fs from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const listen=s=>new Promise(r=>s.listen(0,'127.0.0.1',()=>r(s.address().port)));
const close=s=>new Promise(r=>{s.close(r);s.closeAllConnections?.();});
test('gateway 同源、cookie、HTTP/upgrade 头、502',async()=>{
 const home=await fs.mkdtemp(root+'test/.gateway-');
 const token='secret-fixture-token', cookies=['dsh_fixture=ok; Path=/; HttpOnly','extra=ok; Path=/'];
 let seen,upgradeSeen,hits=0,child,exited,logs='';
 const upstream=http.createServer((req,res)=>{
  if(req.url==='/slow-token')return;
  if(req.url==='/?token='+token){hits++;res.writeHead(303,{'Set-Cookie':cookies,Location:'/should-not-follow'});res.end();return;}
  seen={url:req.url,headers:req.headers};
  const chunks=[];req.on('data',b=>chunks.push(b));req.on('end',()=>{res.writeHead(200,{'Set-Cookie':cookies});res.end(Buffer.concat(chunks).toString()||'upstream');});
 });
 const upgraded=new Set();
 upstream.on('upgrade',(req,socket,head)=>{
  upgraded.add(socket);socket.on('close',()=>upgraded.delete(socket));
  upgradeSeen=req.headers;
  socket.write('HTTP/1.1 101 Switching Protocols\r\nConnection: Upgrade\r\nUpgrade: fixture\r\n\r\n');
  if(head.length)socket.write(head);socket.pipe(socket);
 });
 try{
  const webPort=await listen(upstream);
  const reservation=net.createServer(), port=await listen(reservation);await close(reservation);
  await fs.cp(root+'test/fixtures/home/storages',home+'/storages',{recursive:true});
  await fs.mkdir(home+'/webtabs');await fs.writeFile(home+'/webtabs/login-url.txt','http://127.0.0.1:'+webPort+'/?token='+token);
  child=spawn(process.execPath,[root+'bin/gateway.mjs'],{env:{...process.env,DSH_WEBTABS_DSH_HOME:home,DSH_WEBTABS_GATEWAY_PORT:String(port),DSH_WEBTABS_WEB_PORT:String(webPort),DSH_WEBTABS_FAKE_LOCKS:JSON.stringify({'session-11111111-1111-1111-1111-111111111111':'desktop','session-44444444-4444-4444-4444-444444444444':'other'})}});
  exited=new Promise(r=>child.once('exit',r));child.stdout.on('data',b=>logs+=b);child.stderr.on('data',b=>logs+=b);
  const base='http://127.0.0.1:'+port;let ready;
  for(let i=0;i<40;i++){try{ready=await fetch(base+'/__board');break;}catch{await delay(50);}}
  assert.equal(ready?.status,200);assert.deepEqual(ready.headers.getSetCookie(),cookies);const board=await ready.text();assert.ok(!board.includes(token));assert.ok(board.includes('/__goto?session=session-'));assert.ok(board.includes('href="/__board"'));
  const lockedRows=[...board.matchAll(/<li class="locked"[^>]*>.*?<\/li>/g)].map(m=>m[0]);assert.equal(lockedRows.length,4);
  for(const row of lockedRows){assert.ok(row.includes(' · 只读'));assert.ok(row.includes('>只读查看</a>'));assert.ok(row.includes('href="/__goto?session=session-'));}
  const id='session-11111111-1111-1111-1111-111111111111';
  const r=await fetch(base+'/__goto?session='+id);assert.deepEqual(r.headers.getSetCookie(),cookies);
  const html=await r.text();assert.ok(html.includes("localStorage.setItem('dsh.sessions.current', JSON.stringify({\"sessionId\":\""+id+'\"}))'));assert.ok(html.includes("location.replace('/')"));assert.equal(hits,2);
  for(const invalid of ['', 'session-no','<script>',id.toUpperCase()])assert.equal((await fetch(base+'/__goto?session='+encodeURIComponent(invalid))).status,400);
  const proxied=await fetch(base+'/api/test?q=1',{method:'POST',body:'payload',headers:{Origin:base,Referer:base+'/__board',Cookie:'dsh_fixture=ok'}});
  assert.equal(await proxied.text(),'payload');assert.deepEqual(proxied.headers.getSetCookie(),cookies);
  assert.equal(seen.url,'/api/test?q=1');assert.equal(seen.headers.host,'127.0.0.1:'+webPort);assert.equal(seen.headers.origin,'http://127.0.0.1:'+webPort);assert.equal(seen.headers.referer,'http://127.0.0.1:'+webPort);assert.equal(seen.headers.cookie,'dsh_fixture=ok');
  await new Promise((resolve,reject)=>{
   const socket=net.connect(port,'127.0.0.1',()=>socket.write('GET /socket HTTP/1.1\r\nHost: phone\r\nOrigin: http://phone\r\nCookie: ws=ok\r\nConnection: Upgrade\r\nUpgrade: fixture\r\n\r\nHEAD'));
   let text='';socket.setTimeout(2000,()=>socket.destroy(new Error('upgrade timeout')));socket.on('data',b=>{text+=b;if(text.includes('HEAD')){assert.ok(text.includes('101 Switching'));socket.destroy();resolve();}});socket.on('error',reject);
  });
  assert.equal(upgradeSeen.host,'127.0.0.1:'+webPort);assert.equal(upgradeSeen.origin,'http://127.0.0.1:'+webPort);assert.equal(upgradeSeen.cookie,'ws=ok');
  await fs.writeFile(home+'/webtabs/login-url.txt','http://127.0.0.1:'+webPort+'/slow-token');
  const started=Date.now();const slow=await fetch(base+'/__board',{signal:AbortSignal.timeout(3000)});assert.equal(slow.status,200);assert.equal(slow.headers.get('set-cookie'),null);assert.ok(Date.now()-started<2500);
  for(const socket of upgraded)socket.destroy();await close(upstream);
  const down=await fetch(base+'/');assert.equal(down.status,502);assert.ok((await down.text()).includes('网页端没在跑，先双击启动'));
  assert.equal((await fetch(base+'/__goto?session='+id)).status,200);await fs.unlink(home+'/webtabs/login-url.txt');assert.equal((await fetch(base+'/__board')).status,200);assert.ok(!logs.includes(token));
 }finally{
  if(child){child.kill('SIGTERM');await Promise.race([exited,delay(1500)]);if(child.exitCode===null&&child.signalCode===null){child.kill('SIGKILL');await exited;}}
  for(const socket of upgraded)socket.destroy();if(upstream.listening)await close(upstream);await fs.rm(home,{recursive:true,force:true});
 }
});
