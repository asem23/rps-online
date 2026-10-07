// RPS Kickoff - online server. No packages needed, just Node 18+.
const http=require("http"),fs=require("fs"),path=require("path");
const E=process.env,PORT=E.PORT||3000,LOBBY_MS=+E.LOBBY_MS||60000,TURN_MS=+E.TURN_MS||7000,WAIT_MS=+E.WAIT_MS||5000,MIN=+E.MIN_PLAYERS||8,NEED=3;
const BOTN=["NOVA","ROCKY","PAPER","BLADE","PIXEL","ZERO","BYTE","STONE","SNIP","ACE","KING","TURBO","ECHO","MIKA"];
const MV=["rock","paper","scissors"],BEATS={rock:"scissors",paper:"rock",scissors:"paper"};
const rnd=n=>Math.floor(Math.random()*n);
const shuffle=a=>{a=a.slice();for(let i=a.length-1;i>0;i--){const j=rnd(i+1);[a[i],a[j]]=[a[j],a[i]]}return a};
const clients=new Map();let T,lastAll=0;
function reset(){T={ph:"lobby",startsAt:0,players:new Map(),names:new Set(),ri:0,R:0,rounds:[],seat:{},ms:[],mOf:{},next:[],out:{},bye:{},champ:null,waitUntil:0,overAt:0,pool:0,nb:0}}
reset();
function addBot(){let n;do{n=BOTN[rnd(BOTN.length)]+"_"+(1+rnd(9999))}while(T.names.has(n));const id="bot"+(++T.nb);T.names.add(n);T.players.set(id,{id,name:n,bot:true,num:T.players.size+1})}
function join(id,name){if(T.ph!=="lobby"||T.players.has(id))return;
 name=String(name||"").toUpperCase().replace(/[^A-Z0-9_]/g,"").slice(0,12)||"PLAYER";
 if(T.names.has(name))name=name.slice(0,9)+"_"+(1+rnd(99));
 T.names.add(name);T.players.set(id,{id,name,bot:false,num:T.players.size+1});
 if(!T.startsAt)T.startsAt=Date.now()+LOBBY_MS}
function start(){while(T.players.size<MIN)addBot();
 const arr=shuffle([...T.players.keys()]);let P=1;while(P<arr.length)P*=2;
 const nulls=P-arr.length,slots=[];let k=0;
 for(let i=0;i<P/2;i++){slots.push(arr[k++]);slots.push(i<nulls?null:arr[k++])}
 slots.forEach((x,i)=>{if(x)T.seat[x]=i+1});
 T.R=Math.round(Math.log2(P));T.rounds=[slots];T.ri=0;T.pool=arr.length;startRound()}
function startRound(){T.ph="round";const cur=T.rounds[T.ri];T.ms=[];T.mOf={};T.next=[];T.bye={};
 for(let i=0;i<cur.length;i+=2){const a=cur[i],b=cur[i+1],ix=i/2;
  if(a===null||b===null){T.next[ix]=a===null?b:a;if(T.next[ix])T.bye[T.next[ix]]=true;continue}
  if(T.players.get(a).bot&&T.players.get(b).bot){const w=rnd(2)?a:b;T.next[ix]=w;T.out[w===a?b:a]=T.ri+1;continue}
  const m={a,b,sa:0,sb:0,th:0,mv:{},dl:0,done:false,ix,last:null};T.ms.push(m);T.mOf[a]=m;T.mOf[b]=m;open(m)}
 if(!T.ms.length)endRound();pushAll()}
function open(m){m.th++;m.mv={};m.dl=Date.now()+TURN_MS}
function ready(m){return[m.a,m.b].every(x=>T.players.get(x).bot||m.mv[x])}
function move(id,mv){const m=T.mOf[id];if(T.ph!=="round"||!m||m.done||!MV.includes(mv)||m.mv[id])return;
 m.mv[id]=mv;if(ready(m))resolve(m);else push2(m)}
function resolve(m){const pick=x=>T.players.get(x).bot?MV[rnd(3)]:m.mv[x];const A=pick(m.a),B=pick(m.b);let r;
 if(A&&B)r=A===B?0:BEATS[A]===B?1:-1;else if(A||B)r=A?1:-1;else r=0; // no pick = lose the point
 if(r===1)m.sa++;else if(r===-1)m.sb++;
 m.last={a:A||null,b:B||null,r};
 if(m.sa>=NEED||m.sb>=NEED)finish(m,m.sa>=NEED?m.a:m.b);else{open(m);push2(m)}}
function finish(m,w){m.done=true;const l=w===m.a?m.b:m.a;T.next[m.ix]=w;T.out[l]=T.ri+1;push2(m);
 if(T.ms.every(x=>x.done))endRound()}
function endRound(){T.rounds.push(T.next);
 if(T.next.length===1){T.ph="over";T.champ=T.next[0];T.overAt=Date.now()+20000}
 else{T.ph="wait";T.waitUntil=Date.now()+WAIT_MS}pushAll()}
function view(id){const p=T.players.get(id),cur=T.rounds[T.ri]||[];
 const v={ph:T.ph,now:Date.now(),startsAt:T.startsAt,count:T.players.size,ri:T.ri,R:T.R,left:cur.filter(Boolean).length,wu:T.waitUntil,pool:T.pool||T.players.size,min:MIN,tm:TURN_MS};
 if(p){v.me={name:p.name,num:p.num,seat:T.seat[id]||0,out:T.out[id]||0};
  const m=T.mOf[id];
  if(T.ph==="round"&&m&&!m.done){const mine=m.a===id,o=T.players.get(mine?m.b:m.a),L=m.last;
   v.m={opp:o.name,os:T.seat[o.id],ys:mine?m.sa:m.sb,ops:mine?m.sb:m.sa,dl:m.dl,th:m.th,moved:!!m.mv[id],
    last:L&&{me:mine?L.a:L.b,op:mine?L.b:L.a,r:mine?L.r:-L.r}}}
  else if(T.ph==="round"&&T.bye[id])v.bye=true}
 if(T.champ){v.champ=T.players.get(T.champ).name;v.champMe=T.champ===id}
 return v}
function send(id){const r=clients.get(id);if(r)r.write("data: "+JSON.stringify(view(id))+"\n\n")}
function pushAll(){lastAll=Date.now();for(const id of clients.keys())send(id)}
function push2(m){send(m.a);send(m.b)}
setInterval(()=>{const n=Date.now();
 if(T.ph==="lobby"){if(T.startsAt&&n>=T.startsAt)start()}
 else if(T.ph==="round"){for(const m of T.ms)if(!m.done&&n>=m.dl)resolve(m)}
 else if(T.ph==="wait"){if(n>=T.waitUntil){T.ri++;startRound()}}
 else if(T.ph==="over"&&n>=T.overAt){reset();pushAll()}
 if(n-lastAll>=1000)pushAll()},200);
const okId=s=>/^[a-z0-9]{8,32}$/.test(s||"");
http.createServer((q,r)=>{const u=new URL(q.url,"http://x");
 if(q.method==="GET"&&u.pathname==="/events"){const id=u.searchParams.get("id");if(!okId(id)){r.writeHead(400).end();return}
  r.writeHead(200,{"Content-Type":"text/event-stream","Cache-Control":"no-cache","Connection":"keep-alive","X-Accel-Buffering":"no"});
  clients.set(id,r);q.on("close",()=>{if(clients.get(id)===r)clients.delete(id)});send(id);return}
 if(q.method==="POST"&&(u.pathname==="/join"||u.pathname==="/move")){let b="";
  q.on("data",c=>{b+=c;if(b.length>1000)q.destroy()});
  q.on("end",()=>{try{const d=JSON.parse(b);if(!okId(d.id))throw 0;
   if(u.pathname==="/join")join(d.id,d.name);else move(d.id,d.move);send(d.id);r.writeHead(200).end("ok")}catch(e){r.writeHead(400).end()}});return}
 if(u.pathname==="/"){r.writeHead(200,{"Content-Type":"text/html; charset=utf-8"}).end(fs.readFileSync(path.join(__dirname,"index.html")));return}
 r.writeHead(404).end()}).listen(PORT,()=>console.log("RPS Kickoff running on port "+PORT));
