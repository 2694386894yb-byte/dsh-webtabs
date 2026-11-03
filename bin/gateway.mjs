import http from 'node:http';
import net from 'node:net';
import {data,lockState,probe,renewalCookies,renderBoard} from './lib/board-core.mjs';

const webPort=Number(process.env.DSH_WEBTABS_WEB_PORT||52352);
const authority=`127.0.0.1:${webPort}`, origin=`http://${authority}`;
const validSession=/^session-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
function headers(req){
 const h={...req.headers,host:authority};
 if(h.origin)h.origin=origin;
 if(h.referer)h.referer=origin;
 return h;
}
function unavailable(res){
 if(res.headersSent){res.destroy();return;}
 res.writeHead(502,{'Content-Type':'text/plain; charset=utf-8'});
 res.end('网页端没在跑，先双击启动');
}
const server=http.createServer(async(req,res)=>{
 let url;
 try{url=new URL(req.url,'http://localhost');}catch{res.writeHead(400);res.end('请求地址不合法');return;}
 if(url.pathname==='/__board'||url.pathname==='/__goto'){
  res.setHeader('Cache-Control','no-store');
  res.setHeader('Content-Type','text/html; charset=utf-8');
  const sessionId=url.searchParams.get('session');
  if(url.pathname==='/__goto'&&!validSession.test(sessionId||'')){
   res.writeHead(400);res.end('会话 ID 不合法');return;
  }
  const cookies=await renewalCookies();
  if(cookies)res.setHeader('Set-Cookie',cookies);
  if(url.pathname==='/__goto'){
   // JSON serialization followed by HTML-safe escaping keeps script content inert.
   const value=JSON.stringify({sessionId}).replace(/</g,'\\u003c').replace(/>/g,'\\u003e').replace(/&/g,'\\u0026');
   res.end(`<!doctype html><meta charset="utf-8"><script>localStorage.setItem('dsh.sessions.current', JSON.stringify(${value}));location.replace('/');</script>`);
  }else{
   const d=data();
   const [reachable,locks]=await Promise.all([probe(),lockState(d.groups.flatMap(g=>g.sessions))]);
   res.end(renderBoard(d,reachable,locks,{sessionHref:id=>`/__goto?session=${encodeURIComponent(id)}`,refreshHref:'/__board'}));
  }
  return;
 }
 const upstream=http.request({hostname:'127.0.0.1',port:webPort,path:req.url,method:req.method,headers:headers(req)},response=>{
  res.writeHead(response.statusCode,response.headers);
  response.on('error',()=>res.destroy());
  response.pipe(res);
 });
 upstream.on('error',()=>unavailable(res));
 req.on('aborted',()=>upstream.destroy());
 res.on('close',()=>upstream.destroy());
 req.pipe(upstream);
});
const sockets=new Set();
server.on('connection',socket=>{sockets.add(socket);socket.on('close',()=>sockets.delete(socket));});
server.on('upgrade',(req,socket,head)=>{
 const upstream=net.connect(webPort,'127.0.0.1',()=>{
  const h=headers(req);
  upstream.write(`${req.method} ${req.url} HTTP/${req.httpVersion}\r\n`+
   Object.entries(h).flatMap(([key,value])=>(Array.isArray(value)?value:[value]).map(v=>`${key}: ${v}\r\n`)).join('')+'\r\n');
  if(head.length)upstream.write(head);
  upstream.pipe(socket);socket.pipe(upstream);
 });
 upstream.on('error',()=>{
  if(!socket.destroyed)socket.end('HTTP/1.1 502 Bad Gateway\r\nContent-Type: text/plain; charset=utf-8\r\nConnection: close\r\n\r\n网页端没在跑，先双击启动');
 });
 socket.on('error',()=>upstream.destroy());
 socket.on('close',()=>upstream.destroy());
});
server.listen(Number(process.env.DSH_WEBTABS_GATEWAY_PORT||52354),'127.0.0.1');
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>{
 server.close(()=>process.exit(0));
 for(const socket of sockets)socket.destroy();
});
