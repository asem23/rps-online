// RPS Kickoff - online server: one knockout bracket for everyone. No packages needed, just Node 18+.
const http=require("http"),fs=require("fs"),path=require("path");
const E=process.env,N=(k,d)=>+E[k]||d;
const PORT=N("PORT",3000),EVERY=N("EVERY_MS",3600000),MIN_REG=N("MIN_REG_MS",300000),TURN_MS=N("TURN_MS",7000),WAIT_MS=N("WAIT_MS",5000),MIN=N("MIN_PLAYERS",8),
 FIRST_MS=N("FIRST_MS",20000),OVER_MS=N("OVER_MS",30000),NEED=3;
const BOTN=["NOVA","ROCKY","PAPER","BLADE","PIXEL","ZERO","BYTE","STONE","SNIP","ACE","KING","TURBO","ECHO","MIKA"];
const MV=["rock","paper","scissors"],BEATS={rock:"scissors",paper:"rock",scissors:"paper"};
const rnd=n=>Math.floor(Math.random()*n);
const shuffle=a=>{a=a.slice();for(let i=a.length-1;i>0;i--){const j=rnd(i+1);[a[i],a[j]]=[a[j],a[i]]}return a};
// next start time: a round clock time (every hour on the hour), at least MIN_REG ms away
function nextSlot(from){return Math.ceil((from+MIN_REG)/EVERY)*EVERY}
const clients=new Map(),PRE=new Map();let T;  // PRE = people waiting for the next tournament
function reset(){T={ph:"lobby",startsAt:nextSlot(Date.now()),players:new Map(),names:new Set(),main:null,mOf:{},champ:null,overAt:0,pool:0,nb:0}}
reset();
const isBot=x=>T.players.get(x).bot;
function addBot(){let n;do{n=BOTN[rnd(BOTN.length)]+"_"+(1+rnd(99999))}while(T.names.has(n));const id="bot"+(++T.nb);T.names.add(n);T.players.set(id,{id,name:n,bot:true,num:T.players.size+1,b:null})}
function join(id,name){name=String(name||"").toUpperCase().replace(/[^A-Z0-9_]/g,"").slice(0,12)||"PLAYER";
 if(T.players.has(id))return"ok";
 if(T.ph!=="lobby"){PRE.set(id,name);return"queued"}
 if(T.names.has(name))name=name.slice(0,9)+"_"+(1+rnd(99));
 T.names.add(name);T.players.set(id,{id,name,bot:false,num:T.players.size+1,b:null});
 return"ok"}
// the bracket: everyone who registered plays one knockout tournament
function mkB(kind,idx,ids,startAt){let P=2;while(P<ids.length)P*=2;
 const nulls=P-ids.length,slots=[];let k=0;
 for(let i=0;i<P/2;i++){slots.push(ids[k++]);slots.push(i<nulls?null:ids[k++])}
 const seat={};slots.forEach((x,i)=>{if(x)seat[x]=i+1});
 return{kind,idx,ids,startAt,ph:"sched",rounds:[slots],R:Math.round(Math.log2(P)),ri:0,seat,ms:[],next:[],bye:{},out:{},wu:0,winner:null,alive:0,size:ids.length}}
function startAll(){while(T.players.size<MIN)addBot();
 const ids=shuffle([...T.players.keys()]),n=ids.length;T.pool=n;
 const B=mkB("main",1,ids,Date.now()+FIRST_MS);T.main=B;ids.forEach(x=>T.players.get(x).b=B);
 T.ph="run";pushAll()}
function startRound(B){B.ph="round";const cur=B.rounds[B.ri];B.ms=[];B.next=[];B.bye={};B.alive=cur.filter(Boolean).length;
 for(let i=0;i<cur.length;i+=2){const a=cur[i],b=cur[i+1],ix=i/2;
  if(a===null||b===null){B.next[ix]=a===null?b:a;if(B.next[ix])B.bye[B.next[ix]]=true;continue}
  if(isBot(a)&&isBot(b)){const w=rnd(2)?a:b;B.next[ix]=w;B.out[w===a?b:a]=B.ri+1;continue}
  const m={B,a,b,sa:0,sb:0,th:0,mv:{},dl:0,done:false,ix,last:null};B.ms.push(m);T.mOf[a]=m;T.mOf[b]=m;open(m)}
 if(!B.ms.length)endRound(B);else pushB(B)}
function open(m){m.th++;m.mv={};m.dl=Date.now()+TURN_MS}
function move(id,mv){const m=T.mOf[id];if(!m||m.done||m.B.ph!=="round"||!MV.includes(mv)||m.mv[id])return;
 m.mv[id]=mv;if([m.a,m.b].every(x=>isBot(x)||m.mv[x]))resolve(m);else push2(m)}
function resolve(m){const pick=x=>isBot(x)?MV[rnd(3)]:m.mv[x];const A=pick(m.a),Bm=pick(m.b);let r;
 if(A&&Bm)r=A===Bm?0:BEATS[A]===Bm?1:-1;else if(A||Bm)r=A?1:-1;else r=0; // no pick = lose the point
 if(r===1)m.sa++;else if(r===-1)m.sb++;
 m.last={a:A||null,b:Bm||null,r};
 if(m.sa>=NEED||m.sb>=NEED)endMatch(m,m.sa>=NEED?m.a:m.b);else{open(m);push2(m)}}
function endMatch(m,w){m.done=true;const l=w===m.a?m.b:m.a,B=m.B;B.next[m.ix]=w;B.out[l]=B.ri+1;push2(m);
 if(B.ms.every(x=>x.done))endRound(B)}
function endRound(B){B.rounds.push(B.next);
 if(B.next.length===1){B.winner=B.next[0];B.ph="done";done(B)}
 else if(!B.ms.length){B.ri++;startRound(B)}   // nobody to wait for: go on at once
 else{B.ph="wait";B.wu=Date.now()+WAIT_MS;pushB(B)}}
function done(B){finish(B.winner)}
function finish(id){T.ph="over";T.champ=id;T.overAt=Date.now()+OVER_MS;pushAll()}
function view(id){const p=T.players.get(id),v={ph:T.ph,now:Date.now(),startsAt:T.startsAt,count:T.players.size,pool:T.pool||T.players.size,min:MIN,tm:TURN_MS,left:T.main?T.main.alive:0,ev:EVERY,q:PRE.has(id)};
 if(p){v.me={name:p.name,num:p.num,seat:0,out:0,won:false};const B=p.b;
  if(B){v.b={kind:B.kind,idx:B.idx,ph:B.ph,sa:B.startAt,ri:B.ri,R:B.R,wu:B.wu,left:B.alive,size:B.size};
   v.me.seat=B.seat[id]||0;v.me.out=B.out[id]||0;v.me.won=B.winner===id;
   const m=T.mOf[id];
   if(B.ph==="round"&&m&&m.B===B&&!m.done){const mine=m.a===id,o=T.players.get(mine?m.b:m.a),L=m.last;
    v.m={opp:o.name,os:B.seat[o.id],ys:mine?m.sa:m.sb,ops:mine?m.sb:m.sa,dl:m.dl,th:m.th,moved:!!m.mv[id],
     last:L&&{me:mine?L.a:L.b,op:mine?L.b:L.a,r:mine?L.r:-L.r}}}
   else if(B.ph==="round"&&B.bye[id])v.bye=true}}
 if(T.champ){v.champ=T.players.get(T.champ).name;v.champMe=T.champ===id}
 return v}
function send(id){const r=clients.get(id);if(r)r.write("data: "+JSON.stringify(view(id))+"\n\n")}
function pushAll(){for(const id of clients.keys())send(id)}
function push2(m){send(m.a);send(m.b)}
function pushB(B){for(const x of B.ids)send(x)}
function active(id){if(T.ph==="lobby")return true;const p=T.players.get(id),B=p&&p.b;return!!B&&(B.ph==="round"||B.ph==="wait")&&!B.out[id]}
let l1=0,l5=0;
setInterval(()=>{const n=Date.now();
 if(T.ph==="lobby"){if(n>=T.startsAt){if(T.players.size)startAll();else T.startsAt=nextSlot(n)}}  // nobody registered: skip this slot
 else if(T.ph==="run"){const bs=T.main&&T.main.ph!=="done"?[T.main]:[];
  for(const B of bs){
   if(B.ph==="sched"){if(n>=B.startAt)startRound(B)}
   else if(B.ph==="round"){for(const m of B.ms)if(!m.done&&n>=m.dl)resolve(m)}
   else if(B.ph==="wait"&&n>=B.wu){B.ri++;startRound(B)}}}
 else if(T.ph==="over"&&n>=T.overAt){reset();for(const[i,nm]of PRE)join(i,nm);PRE.clear();pushAll()}
 if(n-l1>=1000){l1=n;const all=n-l5>=5000;if(all)l5=n;for(const id of clients.keys())if(all||active(id))send(id)}},200);
// ================= accounts (email + password), saved in a file =================
const crypto=require("crypto");
const DATA_DIR=E.DATA_DIR||path.join(__dirname,"data"),DB_FILE=path.join(DATA_DIR,"db.json");
let DB={users:{},sessions:{}};
try{DB=JSON.parse(fs.readFileSync(DB_FILE,"utf8"))}catch(e){}
DB.users=DB.users||{};DB.sessions=DB.sessions||{};
const byEmail=new Map(),byName=new Map();
for(const u of Object.values(DB.users)){if(u.email)byEmail.set(u.email,u);byName.set(u.name,u)}
for(const k of Object.keys(DB.sessions))if(DB.sessions[k].exp<Date.now())delete DB.sessions[k];
let saveT=null;
function flush(){try{fs.mkdirSync(DATA_DIR,{recursive:true});const tmp=DB_FILE+".tmp";fs.writeFileSync(tmp,JSON.stringify(DB));fs.renameSync(tmp,DB_FILE)}catch(e){console.log("could not save data:",e.message)}}
function save(){if(saveT)return;saveT=setTimeout(()=>{saveT=null;flush()},1000)}
for(const sig of["SIGTERM","SIGINT"])process.on(sig,()=>{flush();process.exit(0)});
const scrypt=(pw,salt)=>new Promise((ok,no)=>crypto.scrypt(pw,salt,64,(e,k)=>e?no(e):ok(k)));
async function hashPw(pw){const salt=crypto.randomBytes(16);return salt.toString("hex")+":"+(await scrypt(pw,salt)).toString("hex")}
async function checkPw(pw,stored){const[sl,h]=stored.split(":");const k=await scrypt(pw,Buffer.from(sl,"hex")),hb=Buffer.from(h,"hex");return k.length===hb.length&&crypto.timingSafeEqual(k,hb)}
const FAKE_HASH="0".repeat(32)+":"+"0".repeat(128);   // used so unknown emails take as long as real ones
const sha=t=>crypto.createHash("sha256").update(t).digest("hex");
function newSession(uid){const t=crypto.randomBytes(32).toString("hex");DB.sessions[sha(t)]={uid,exp:Date.now()+30*864e5};save();return t}
function tokenOf(q){const m=/(?:^|;\s*)rps_session=([a-f0-9]{64})/.exec(q.headers.cookie||"");return m&&m[1]}
function authUser(q){const t=tokenOf(q);if(!t)return null;const s=DB.sessions[sha(t)];if(!s)return null;
 if(s.exp<Date.now()){delete DB.sessions[sha(t)];return null}return DB.users[s.uid]||null}
function setCookie(r,q,val,maxAge){const secure=q.socket.encrypted||q.headers["x-forwarded-proto"]==="https";
 r.setHeader("Set-Cookie","rps_session="+val+"; Path=/; HttpOnly; SameSite=Lax; Max-Age="+maxAge+(secure?"; Secure":""))}
const hits=new Map();
function limited(key,max,win){const n=Date.now(),h=hits.get(key);if(!h||n>h.t){hits.set(key,{c:1,t:n+win});return false}return++h.c>max}
setInterval(()=>{const n=Date.now();for(const[k,h]of hits)if(n>h.t)hits.delete(k)},60000);
const ipOf=q=>String((q.headers["x-forwarded-for"]||"").split(",")[0].trim()||q.socket.remoteAddress);
const J=(r,code,obj)=>{r.writeHead(code,{"Content-Type":"application/json","Cache-Control":"no-store"}).end(JSON.stringify(obj))};
function body(q,cb){let b="",bad=false;q.on("data",c=>{b+=c;if(b.length>2000){bad=true;q.destroy()}});
 q.on("end",()=>{if(bad)return;let d=null;try{d=JSON.parse(b||"{}")}catch(e){}cb(d&&typeof d==="object"?d:null)})}
const pub=u=>({id:u.id,name:u.name,email:u.email||null,guest:!!u.guest});
const GUESTS_PER_HOUR=N("GUESTS_PER_HOUR",30);
// forget expired sessions and guests that have no live session (runs at start and every hour)
function sweep(){const n=Date.now(),live=new Set();
 for(const k of Object.keys(DB.sessions)){if(DB.sessions[k].exp<n)delete DB.sessions[k];else live.add(DB.sessions[k].uid)}
 for(const u of Object.values(DB.users))if(u.guest&&!live.has(u.id)){delete DB.users[u.id];byName.delete(u.name)}
 save()}
sweep();setInterval(sweep,3600000);
http.createServer((q,r)=>{const u=new URL(q.url,"http://x"),P=u.pathname;
 r.setHeader("X-Content-Type-Options","nosniff");r.setHeader("Referrer-Policy","same-origin");
 if(q.method==="POST"){const o=q.headers.origin;let bad=false;if(o){try{bad=new URL(o).host!==q.headers.host}catch(e){bad=true}}
  if(bad){J(r,403,{error:"BLOCKED REQUEST"});return}}
 if(P==="/api/me"&&q.method==="GET"){const a=authUser(q);return a?J(r,200,{user:pub(a)}):J(r,401,{error:"NOT LOGGED IN"})}
 if(P==="/api/logout"&&q.method==="POST"){const t=tokenOf(q);if(t){delete DB.sessions[sha(t)];save()}setCookie(r,q,"",0);return J(r,200,{})}
 if(P==="/api/guest"&&q.method==="POST"){
  if(limited("gu:"+ipOf(q),GUESTS_PER_HOUR,3600000))return J(r,429,{error:"TOO MANY GUESTS FROM HERE. TRY LATER."});
  let name,tries=0;do{name="GUEST_"+(10000+rnd(90000))}while(byName.has(name)&&++tries<50);
  if(byName.has(name))return J(r,503,{error:"TRY AGAIN"});
  const user={id:"g"+crypto.randomBytes(8).toString("hex"),email:null,name,pw:null,guest:true,created:Date.now()};
  DB.users[user.id]=user;byName.set(name,user);
  setCookie(r,q,newSession(user.id),2592000);return J(r,200,{user:pub(user)})}
 if(P==="/api/register"&&q.method==="POST")return body(q,async d=>{
  if(!d)return J(r,400,{error:"BAD REQUEST"});
  if(limited("reg:"+ipOf(q),10,3600000))return J(r,429,{error:"TOO MANY TRIES. WAIT A BIT."});
  const email=String(d.email||"").trim().toLowerCase(),name=String(d.name||"").trim().toUpperCase(),pw=String(d.password||"");
  if(email.length>254||!/^[^@\s]{1,64}@[^@\s]+\.[^@\s]+$/.test(email))return J(r,400,{error:"ENTER A VALID EMAIL"});
  if(!/^[A-Z0-9_]{3,12}$/.test(name))return J(r,400,{error:"NAME: 3-12 LETTERS, NUMBERS OR _"});
  if(pw.length<8||pw.length>200)return J(r,400,{error:"PASSWORD: AT LEAST 8 CHARACTERS"});
  if(byEmail.has(email))return J(r,409,{error:"EMAIL ALREADY REGISTERED"});
  if(byName.has(name))return J(r,409,{error:"NAME ALREADY TAKEN"});
  const user={id:"u"+crypto.randomBytes(8).toString("hex"),email,name,pw:await hashPw(pw),created:Date.now()};
  if(byEmail.has(email)||byName.has(name))return J(r,409,{error:"EMAIL OR NAME ALREADY TAKEN"});
  DB.users[user.id]=user;byEmail.set(email,user);byName.set(name,user);
  setCookie(r,q,newSession(user.id),2592000);J(r,200,{user:pub(user)})});
 if(P==="/api/login"&&q.method==="POST")return body(q,async d=>{
  if(!d)return J(r,400,{error:"BAD REQUEST"});
  const email=String(d.email||"").trim().toLowerCase().slice(0,254),pw=String(d.password||"").slice(0,200);
  if(limited("li:"+ipOf(q),30,600000)||limited("le:"+email,10,600000))return J(r,429,{error:"TOO MANY TRIES. WAIT A BIT."});
  const user=byEmail.get(email),ok=await checkPw(pw,user?user.pw:FAKE_HASH);
  if(!user||!ok)return J(r,401,{error:"WRONG EMAIL OR PASSWORD"});
  setCookie(r,q,newSession(user.id),2592000);J(r,200,{user:pub(user)})});
 if(P==="/events"&&q.method==="GET"){const a=authUser(q);if(!a){J(r,401,{error:"NOT LOGGED IN"});return}
  const old=clients.get(a.id);if(old&&old!==r){try{old.end()}catch(e){}}   // newest tab or device wins
  r.writeHead(200,{"Content-Type":"text/event-stream","Cache-Control":"no-cache","Connection":"keep-alive","X-Accel-Buffering":"no"});
  clients.set(a.id,r);q.on("close",()=>{if(clients.get(a.id)===r)clients.delete(a.id)});send(a.id);return}
 if((P==="/join"||P==="/move")&&q.method==="POST"){const a=authUser(q);if(!a)return J(r,401,{error:"NOT LOGGED IN"});
  return body(q,d=>{if(!d)return J(r,400,{error:"BAD REQUEST"});
   let res="ok";if(P==="/join")res=join(a.id,a.name);else move(a.id,d.move);send(a.id);J(r,200,{result:res})})}
 if(P==="/"){r.writeHead(200,{"Content-Type":"text/html; charset=utf-8","Cache-Control":"no-cache"}).end(fs.readFileSync(path.join(__dirname,"index.html")));return}
 r.writeHead(404).end()}).listen(PORT,()=>console.log("RPS Kickoff running on port "+PORT+" (accounts saved in "+DATA_DIR+")"));
