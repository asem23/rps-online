// RPS Kickoff - online server: one knockout bracket for everyone. No packages needed, just Node 18+.
const http=require("http"),fs=require("fs"),path=require("path");
const E=process.env,N=(k,d)=>+E[k]||d;
const PORT=N("PORT",3000),EVERY=N("EVERY_MS",3600000),MIN_REG=N("MIN_REG_MS",300000),TURN_MS=N("TURN_MS",7000),WAIT_MS=N("WAIT_MS",5000),MIN=N("MIN_PLAYERS",8),
 FIRST_MS=N("FIRST_MS",20000),OVER_MS=N("OVER_MS",30000),NEED=3,MAX_CUSTOM=N("MAX_TOURNAMENTS",200),CUP_CAP=N("MAX_CUP_PLAYERS",1000),WIN_BY=N("WIN_BY",2),MAX_PTS=N("MAX_POINTS",11),SHAKE_MS=N("SHAKE_MS",1500),REVEAL_MS=N("REVEAL_MS",1600);
const BOTN=["NOVA","ROCKY","PAPER","BLADE","PIXEL","ZERO","BYTE","STONE","SNIP","ACE","KING","TURBO","ECHO","MIKA"];
const MV=["rock","paper","scissors"],BEATS={rock:"scissors",paper:"rock",scissors:"paper"};
const rnd=n=>Math.floor(Math.random()*n);
const shuffle=a=>{a=a.slice();for(let i=a.length-1;i>0;i--){const j=rnd(i+1);[a[i],a[j]]=[a[j],a[i]]}return a};
// next start time of the official tournament: a round clock time, at least MIN_REG ms away
function nextSlot(from){return Math.ceil((from+MIN_REG)/EVERY)*EVERY}
// where: user id -> the tournament that player is in (a player is in one tournament at a time)
const clients=new Map(),PRE=new Map(),where=new Map(),tours=new Map();   // clients: user id -> open pages {res,mode}; tours: private tournaments by code
const CODE_CHARS="ABCDEFGHJKLMNPQRSTUVWXYZ23456789",BAD_PARTS=["FUCK","SHIT","BITCH","PORN","NAZI","NIGGER","RAPE","CUNT"];
let OFF;
// a tournament: the official one (every hour) or a private one made by a player
function mkT(kind,cfg){return{kind,cfg,ph:"lobby",startsAt:0,created:Date.now(),players:new Map(),names:new Set(),main:null,mOf:{},champ:null,overAt:0,nb:0,owner:null,name:"",code:"",kicked:new Set(),note:"",top:[]}}
function newOfficial(){const old=OFF;
 if(old){for(const id of old.players.keys())if(where.get(id)===old)where.delete(id)}
 OFF=mkT("official",{need:NEED,turn:TURN_MS,wait:WAIT_MS,first:FIRST_MS,over:OVER_MS,fillTo:MIN});
 OFF.startsAt=nextSlot(Date.now())}
newOfficial();
const isBot=(t,x)=>t.players.get(x).bot;
function addBot(t){let n;do{n=BOTN[rnd(BOTN.length)]+"_"+(1+rnd(99999))}while(t.names.has(n));const id="bot"+(++t.nb);t.names.add(n);t.players.set(id,{id,name:n,bot:true,num:t.players.size+1,b:null})}
function addHuman(t,id,name){if(t.names.has(name))name=name.slice(0,9)+"_"+(1+rnd(99));t.names.add(name);t.players.set(id,{id,name,bot:false,num:t.players.size+1,b:null});where.set(id,t)}
function ping(t){if(t.kind==="official")pushAll();else for(const id of t.players.keys())send(id)}
// ---- official tournament: join ----
function join(id,name){name=String(name||"").toUpperCase().replace(/[^A-Z0-9_]/g,"").slice(0,12)||"PLAYER";
 const cur=where.get(id);if(cur===OFF)return"ok";if(cur)return"busy";
 if(OFF.ph!=="lobby"){PRE.set(id,name);return"queued"}
 addHuman(OFF,id,name);return"ok"}
// ---- private tournaments (made by registered players, joined with a code) ----
function tCreate(u,d){
 if(u.guest)return{error:"GUESTS CANNOT CREATE TOURNAMENTS. SIGN UP FIRST."};
 if(where.get(u.id))return{error:"LEAVE YOUR CURRENT TOURNAMENT FIRST"};
 if(tours.size>=MAX_CUSTOM)return{error:"SERVER IS BUSY. TRY LATER."};
 const name=String(d.name||"").toUpperCase().replace(/[^A-Z0-9 _-]/g,"").replace(/\s+/g," ").trim().slice(0,24);
 if(name.length<3)return{error:"NAME: 3-24 LETTERS OR NUMBERS"};
 const flat=name.replace(/[ _-]/g,"");if(BAD_PARTS.some(w=>flat.includes(w)))return{error:"PLEASE CHOOSE ANOTHER NAME"};
 let max=0;   // 0 = no limit
 if(d.max!=="any"){max=Math.floor(+d.max);if(!(max>=2&&max<=CUP_CAP))return{error:"PLAYERS: ENTER A NUMBER FROM 2 TO "+CUP_CAP}}
 const need=[1,2,3,4,5,6,7].includes(+d.need)?+d.need:2,turn=[1.5,3,5,7].includes(+d.turn)?+d.turn:5;
 const mins=[5,15,30,60].includes(+d.start)?+d.start:0;
 let code;do{code=Array.from({length:6},()=>CODE_CHARS[rnd(CODE_CHARS.length)]).join("")}while(tours.has(code));
 const t=mkT("custom",{need,turn:turn*1000,wait:4000,first:5000,over:300000,max,fill:!!d.fill&&max>0});
 t.name=name;t.code=code;t.owner=u.id;t.startsAt=mins?Date.now()+mins*60000:0;
 tours.set(code,t);addHuman(t,u.id,u.name);return{ok:1,code}}
function tJoinCode(u,code){code=String(code||"").toUpperCase().replace(/[^A-Z0-9]/g,"").slice(0,6);
 const t=tours.get(code);if(!t||t.ph==="cancelled")return{error:"NO TOURNAMENT WITH THAT CODE"};
 const cur=where.get(u.id);if(cur===t)return{ok:1};if(cur)return{error:"LEAVE YOUR CURRENT TOURNAMENT FIRST"};
 if(t.kicked.has(u.id))return{error:"YOU WERE REMOVED FROM THIS TOURNAMENT"};
 if(t.ph!=="lobby")return{error:"THIS TOURNAMENT ALREADY STARTED"};
 if(t.players.size>=(t.cfg.max||CUP_CAP))return{error:"THIS TOURNAMENT IS FULL"};
 addHuman(t,u.id,u.name);ping(t);return{ok:1}}
function ownerT(id){const t=where.get(id);return t&&t.kind==="custom"&&t.owner===id?t:null}
function startCustom(t){if(t.players.size<2&&!t.cfg.fill)return{error:"NEED AT LEAST 2 PLAYERS (OR TURN ON BOTS)"};startAll(t);return{ok:1}}
function tStart(id){const t=ownerT(id);if(!t)return{error:"ONLY THE OWNER CAN DO THIS"};if(t.ph!=="lobby")return{error:"ALREADY STARTED"};return startCustom(t)}
function tCancel(id){const t=ownerT(id);if(!t)return{error:"ONLY THE OWNER CAN DO THIS"};if(t.ph!=="lobby")return{error:"ALREADY STARTED"};
 t.ph="cancelled";t.note="THE OWNER CANCELLED THE TOURNAMENT";t.overAt=Date.now()+60000;ping(t);return{ok:1}}
function tKick(id,name){const t=ownerT(id);if(!t)return{error:"ONLY THE OWNER CAN DO THIS"};if(t.ph!=="lobby")return{error:"ALREADY STARTED"};
 const nm=String(name||"").toUpperCase();
 for(const p of t.players.values())if(!p.bot&&p.name===nm&&p.id!==id){t.kicked.add(p.id);t.names.delete(p.name);t.players.delete(p.id);where.delete(p.id);send(p.id);ping(t);return{ok:1}}
 return{error:"PLAYER NOT FOUND"}}
function tLeave(id){const t=where.get(id);if(!t)return{ok:1};
 if(t.ph==="lobby"){if(t.kind==="custom"&&t.owner===id)return tCancel(id);
  const p=t.players.get(id);if(p){t.names.delete(p.name);t.players.delete(id)}where.delete(id);ping(t);return{ok:1}}
 if(t.ph==="over"||t.ph==="cancelled"){where.delete(id);return{ok:1}}
 return{error:"YOU CANNOT LEAVE WHILE THE TOURNAMENT IS RUNNING"}}
function disposeT(t){tours.delete(t.code);const ids=[...t.players.keys()].filter(x=>where.get(x)===t);ids.forEach(x=>where.delete(x));ids.forEach(send)}
// ---------- player profiles: stats, level, badges (only registered players are saved; guests never are) ----------
const PROF={user:function(){return null},save:function(){}};
const AVATARS=["rock","paper","scissors","heart","diamond","spade","club","crown","star","bolt"];
function pr(u){if(!u.p)u.p={m:0,w:0,l:0,pf:0,pa:0,s:0,bs:0,tp:0,tw:0,br:0,bri:null,pod:[0,0,0],th:[0,0,0],pn:0,pms:0,to:0,xp:0,b:{},h:[],av:"rock",bio:""};return u.p}
function lvlOf(xp){return Math.floor(Math.sqrt(xp/50))+1}
function badges(p){const g=function(id,ok){if(ok&&!p.b[id])p.b[id]=Date.now()};
 g("first_win",p.w>=1);g("wins_10",p.w>=10);g("wins_50",p.w>=50);g("streak_5",p.bs>=5);g("veteran",p.m>=25);g("champion",p.tw>=1);g("podium",p.br>0&&p.br<=3);g("fast",p.pn>=30&&p.pms/p.pn<=1200)}
// every throw: which hand, how fast, missed picks, and how far behind the player was
function profThrow(t,m,A,Bm){const turn=t.cfg.turn;
 [[m.a,A],[m.b,Bm]].forEach(function(x){const u=PROF.user(x[0]);if(!u||u.guest)return;const p=pr(u);
  if(x[1]){p.th[MV.indexOf(x[1])]++;p.pn++;p.pms+=Math.min(turn,(m.pt&&m.pt[x[0]])||turn)}else p.to++;badges(p)});
 m.dm=m.dm||{};m.dm[m.a]=Math.max(m.dm[m.a]||0,m.sb-m.sa);m.dm[m.b]=Math.max(m.dm[m.b]||0,m.sa-m.sb)}
// every finished match
function profMatch(t,m,w){const B=m.B,rd=B.ri+1,R=B.R;
 [[m.a,m.b,m.sa,m.sb],[m.b,m.a,m.sb,m.sa]].forEach(function(x){const u=PROF.user(x[0]);if(!u||u.guest)return;const p=pr(u),won=x[0]===w,opp=t.players.get(x[1]);
  p.m++;if(won)p.w++;else p.l++;p.pf+=x[2];p.pa+=x[3];if(won){p.s++;if(p.s>p.bs)p.bs=p.s}else p.s=0;
  p.xp+=won?20+(x[3]===0&&x[2]>=2?10:0):8;
  p.h.unshift({t:Date.now(),tn:t.kind==="official"?"":t.name,o:opp?opp.name:"?",a:x[2],b:x[3],w:won?1:0,r:rd,R:R});if(p.h.length>20)p.h.length=20;
  if(won&&x[3]===0&&x[2]>=3&&!p.b.flawless)p.b.flawless=Date.now();
  if(won&&((m.dm&&m.dm[x[0]])||0)>=2&&!p.b.comeback)p.b.comeback=Date.now();
  badges(p)});PROF.save()}
// a finished tournament: the final place of every registered player
function profTournament(t){const B=t.main;if(!B)return;const sv=function(id){return id===t.champ?1e9:(B.out[id]||0)},ids=B.ids,vals=ids.map(sv);
 ids.forEach(function(id){const u=PROF.user(id);if(!u||u.guest)return;const p=pr(u),v=sv(id);let rank=1;for(let i=0;i<vals.length;i++)if(vals[i]>v)rank++;
  p.tp++;if(rank===1)p.tw++;if(rank<=3)p.pod[rank-1]++;
  if(!p.br||rank<p.br||(rank===p.br&&ids.length>(p.bri?p.bri.of:0))){p.br=rank;p.bri={of:ids.length,tn:t.kind==="official"?"":t.name,t:Date.now()}}
  p.xp+=15+(rank===1?100:rank===2?50:rank<=4?25:0);badges(p)});PROF.save()}
// Instagram cannot verify anyone, so the username is only a label on the profile. "" = none, null = not a valid username.
function cleanIg(x){const g=String(x==null?"":x).trim().replace(/^@+/,"").toLowerCase();if(!g)return"";return/^[a-z0-9._]{1,30}$/.test(g)?g:null}
function profileView(u){const p=pr(u),l=lvlOf(p.xp);
 return{name:u.name,ig:u.ig||"",av:p.av,bio:p.bio,lvl:l,xp:p.xp,xc:50*(l-1)*(l-1),xn:50*l*l,m:p.m,w:p.w,l:p.l,wr:p.m?Math.round(p.w*100/p.m):0,pf:p.pf,pa:p.pa,s:p.s,bs:p.bs,tp:p.tp,tw:p.tw,br:p.br,bri:p.bri,pod:p.pod,th:p.th,avg:p.pn?Math.round(p.pms/p.pn):0,to:p.to,b:Object.keys(p.b),h:p.h}}
function profileSet(u,d){const p=pr(u);
 if(d.av!==undefined){if(!AVATARS.includes(d.av))return{error:"BAD AVATAR"};p.av=d.av}
 if(d.ig!==undefined){const g=cleanIg(d.ig);if(g===null)return{error:"INSTAGRAM: LETTERS, NUMBERS, . OR _ (MAX 30)"};u.ig=g}
 if(d.bio!==undefined){let b=String(d.bio).replace(/[\u0000-\u001f<>&"'`\\]/g,"").replace(/\s+/g," ").trim();p.bio=Array.from(b).slice(0,60).join("")}
 PROF.save();return{ok:1}}
// ---- the bracket: everyone in the tournament plays one knockout ----
function mkB(kind,idx,ids,startAt){let P=2;while(P<ids.length)P*=2;
 const nulls=P-ids.length,slots=[];let k=0;
 for(let i=0;i<P/2;i++){slots.push(ids[k++]);slots.push(i<nulls?null:ids[k++])}
 const seat={};slots.forEach((x,i)=>{if(x)seat[x]=i+1});
 return{kind,idx,ids,startAt,ph:"sched",rounds:[slots],R:Math.round(Math.log2(P)),ri:0,seat,ms:[],next:[],bye:{},out:{},wu:0,winner:null,alive:0,size:ids.length}}
function startAll(t){
 if(t.kind==="official"){while(t.players.size<t.cfg.fillTo)addBot(t)}
 else if(t.cfg.fill){while(t.players.size<t.cfg.max)addBot(t)}
 const ids=shuffle([...t.players.keys()]);
 const B=mkB("main",1,ids,Date.now()+t.cfg.first);B.t=t;t.main=B;ids.forEach(x=>t.players.get(x).b=B);
 t.ph="run";ping(t)}
function startRound(B){const t=B.t;B.ph="round";const cur=B.rounds[B.ri];B.ms=[];B.next=[];B.bye={};B.alive=cur.filter(Boolean).length;
 for(let i=0;i<cur.length;i+=2){const a=cur[i],b=cur[i+1],ix=i/2;
  if(a===null||b===null){B.next[ix]=a===null?b:a;if(B.next[ix])B.bye[B.next[ix]]=true;continue}
  if(isBot(t,a)&&isBot(t,b)){const w=rnd(2)?a:b;B.next[ix]=w;B.out[w===a?b:a]=B.ri+1;continue}
  const m={B,a,b,sa:0,sb:0,th:0,mv:{},dl:0,done:false,ix,last:null};B.ms.push(m);t.mOf[a]=m;t.mOf[b]=m;open(m)}
 if(!B.ms.length)endRound(B);else pushB(B)}
// every throw ends with a short countdown (the hands shake), then both hands are shown at the same moment
function open(m){m.th++;m.mv={};m.pt={};const n=Date.now(),base=m.th>1?n+REVEAL_MS:n;m.t0=base;m.rv=m.th>1?base:0;m.dl=base+m.B.t.cfg.turn}
function move(id,mv){const t=where.get(id);if(!t)return;const m=t.mOf[id];if(!m||m.done||m.fin||m.B.ph!=="round"||!MV.includes(mv)||m.mv[id]||Date.now()<m.rv)return;
 m.mv[id]=mv;m.pt[id]=Math.max(0,Date.now()-m.t0);
 if([m.a,m.b].every(x=>isBot(t,x)||m.mv[x]))m.dl=Math.min(m.dl,Date.now()+SHAKE_MS);   // both chose: only the countdown is left
 push2(m)}
// a match ends when someone has the needed points AND leads by 2 (or reaches the top score, 11, whatever the lead)
function decided(a,b,need){const hi=Math.max(a,b),lo=Math.min(a,b);return hi>=MAX_PTS||(hi>=need&&hi-lo>=WIN_BY)}
function resolve(m){const t=m.B.t,need=t.cfg.need,pick=x=>isBot(t,x)?MV[rnd(3)]:m.mv[x];const A=pick(m.a),Bm=pick(m.b);let r;
 if(A&&Bm)r=A===Bm?0:BEATS[A]===Bm?1:-1;else if(A||Bm)r=A?1:-1;else r=0; // no pick = lose the point
 if(r===1)m.sa++;else if(r===-1)m.sb++;
 m.last={a:A||null,b:Bm||null,r};profThrow(t,m,A,Bm);
 if(decided(m.sa,m.sb,need)){m.fin=m.sa>m.sb?m.a:m.b;m.dl=Infinity;m.rv=m.finAt=Date.now()+REVEAL_MS;push2(m)}   // show the last throw before the match ends
 else{open(m);push2(m)}}
function endMatch(m,w){m.done=true;profMatch(m.B.t,m,w);const l=w===m.a?m.b:m.a,B=m.B;B.next[m.ix]=w;B.out[l]=B.ri+1;push2(m);
 if(B.ms.every(x=>x.done))endRound(B)}
function endRound(B){B.rounds.push(B.next);
 if(B.next.length===1){B.winner=B.next[0];B.ph="done";finish(B.t,B.winner)}
 else if(!B.ms.length){B.ri++;startRound(B)}   // nobody to wait for: go on at once
 else{B.ph="wait";B.wu=Date.now()+B.t.cfg.wait;pushB(B)}}
function computeTop(t){const B=t.main,list=B.ids.map(id=>({id,o:id===t.champ?1e9:(B.out[id]||0)})).sort((a,b)=>b.o-a.o);
 const top=[];let rank=0,prev=null,i=0;
 for(const e of list){i++;if(e.o!==prev){rank=i;prev=e.o}if(rank>4)break;top.push({n:t.players.get(e.id).name,r:rank})}
 return top}
function finish(t,id){t.ph="over";t.champ=id;t.overAt=Date.now()+t.cfg.over;t.top=computeTop(t);profTournament(t);ping(t)}
function humans(t,k){const out=[];for(const x of t.players.values()){if(!x.bot){out.push(x.name);if(out.length>=k)break}}return out}
function tview(t,id){const p=t.players.get(id);
 const v={ph:t.ph,now:Date.now(),startsAt:t.startsAt,count:t.players.size,min:MIN,tm:t.cfg.turn,sh:SHAKE_MS,need:t.cfg.need,wb:WIN_BY,mx:MAX_PTS,left:t.main?t.main.alive:0,ev:EVERY,q:PRE.has(id)};
 if(t.kind==="custom"){v.c={name:t.name,code:t.code,max:t.cfg.max,need:t.cfg.need,fill:!!t.cfg.fill,owner:t.owner===id,auto:!!t.startsAt,note:t.note,
   names:humans(t,60),n:[...t.players.values()].filter(x=>!x.bot).length};if(t.ph==="over")v.top=t.top}
 if(p){v.me={name:p.name,num:p.num,seat:0,out:0,won:false};const B=p.b;
  if(B){v.b={kind:B.kind,idx:B.idx,ph:B.ph,sa:B.startAt,ri:B.ri,R:B.R,wu:B.wu,left:B.ph==="wait"?B.next.filter(Boolean).length:B.alive,size:B.size};
   v.me.seat=B.seat[id]||0;v.me.out=B.out[id]||0;v.me.won=B.winner===id;
   const m=t.mOf[id];
   if(B.ph==="round"&&m&&m.B===B&&!m.done){const mine=m.a===id,o=t.players.get(mine?m.b:m.a),L=m.last;
    v.m={opp:o.name,os:B.seat[o.id],ys:mine?m.sa:m.sb,ops:mine?m.sb:m.sa,dl:m.dl===Infinity?0:m.dl,rv:m.rv||0,th:m.th,moved:!!m.mv[id],mine:m.mv[id]||null,
     last:L&&{me:mine?L.a:L.b,op:mine?L.b:L.a,r:mine?L.r:-L.r}}}
   else if(B.ph==="round"&&B.bye[id])v.bye=true}}
 if(t.champ){v.champ=t.players.get(t.champ).name;v.champMe=t.champ===id}
 return v}
// each page the player has open sees only its own part: the menu, the official tournament, or the private tournaments
function view(id,mode){const mine=where.get(id);
 if(mode==="home"){const pr=mine&&mine.kind==="custom"?mine:null;
  return{ph:"home",now:Date.now(),off:{ph:OFF.ph,startsAt:OFF.startsAt,count:OFF.players.size,joined:mine===OFF},priv:pr?{name:pr.name,code:pr.code,ph:pr.ph}:null}}
 if(mode==="private"){if(!mine||mine.kind!=="custom")return{ph:"menu",now:Date.now(),other:mine?{kind:"official"}:null};return tview(mine,id)}
 const v=tview(OFF,id);if(mine&&mine.kind==="custom")v.other={kind:"private",name:mine.name};return v}
function send(id){const set=clients.get(id);if(!set)return;for(const c of set){try{c.res.write("data: "+JSON.stringify(view(id,c.mode))+"\n\n")}catch(e){}}}
function pushAll(){for(const id of clients.keys())send(id)}
function push2(m){send(m.a);send(m.b)}
function pushB(B){for(const x of B.ids)send(x)}
function active(id){const t=where.get(id)||OFF;if(t.ph==="lobby"||t.ph==="cancelled")return true;const p=t.players.get(id),B=p&&p.b;return!!B&&(B.ph==="round"||B.ph==="wait")&&!B.out[id]}
function tickT(t,n){
 if(t.ph==="lobby"){
  if(t.kind==="official"){if(n>=t.startsAt){if(t.players.size)startAll(t);else t.startsAt=nextSlot(n)}}  // nobody registered: skip this slot
  else if(t.startsAt&&n>=t.startsAt){const r=startCustom(t);if(r.error){t.ph="cancelled";t.note="NOT ENOUGH PLAYERS TO START";t.overAt=n+60000;ping(t)}}
  else if(n-t.created>3*3600e3){t.ph="cancelled";t.note="THIS TOURNAMENT EXPIRED";t.overAt=n+60000;ping(t)}}
 else if(t.ph==="run"){const B=t.main;
  if(B&&B.ph!=="done"){
   if(B.ph==="sched"){if(n>=B.startAt)startRound(B)}
   else if(B.ph==="round"){for(const m of B.ms)if(!m.done){if(m.fin){if(n>=m.finAt)endMatch(m,m.fin)}else if(n>=m.dl)resolve(m)}}
   else if(B.ph==="wait"&&n>=B.wu){B.ri++;startRound(B)}}}
 else if((t.ph==="over"||t.ph==="cancelled")&&n>=t.overAt){
  if(t.kind==="official"){newOfficial();for(const[i,nm]of PRE)join(i,nm);PRE.clear();pushAll()}else disposeT(t)}}
let l1=0,l5=0;
setInterval(()=>{const n=Date.now();
 try{tickT(OFF,n)}catch(e){console.log("official tournament error:",e&&e.stack||e)}
 for(const t of[...tours.values()]){try{tickT(t,n)}catch(e){console.log("private tournament error:",e&&e.stack||e)}}
 try{if(n-l1>=1000){l1=n;const all=n-l5>=5000;if(all)l5=n;for(const id of clients.keys())if(all||active(id))send(id)}}catch(e){console.log("push error:",e&&e.stack||e)}},200);

// ================= accounts (email + password), saved in a file =================
const crypto=require("crypto");
const DATA_DIR=E.DATA_DIR||path.join(__dirname,"data"),DB_FILE=path.join(DATA_DIR,"db.json");
let DB={users:{},sessions:{}};
try{DB=JSON.parse(fs.readFileSync(DB_FILE,"utf8"))}catch(e){}
DB.users=DB.users||{};DB.sessions=DB.sessions||{};
const byEmail=new Map(),byName=new Map();
for(const u of Object.values(DB.users)){if(u.email)byEmail.set(u.email,u);byName.set(u.name,u)}
const byIdent=new Map();   // "google:<id>" -> the player (people who signed up with Google, Apple or Facebook)
for(const u of Object.values(DB.users))if(u.ids)for(const k of Object.keys(u.ids))byIdent.set(k+":"+u.ids[k],u);
for(const k of Object.keys(DB.sessions))if(DB.sessions[k].exp<Date.now())delete DB.sessions[k];
let saveT=null;
function flush(){try{fs.mkdirSync(DATA_DIR,{recursive:true});const tmp=DB_FILE+".tmp";fs.writeFileSync(tmp,JSON.stringify(DB));fs.renameSync(tmp,DB_FILE)}catch(e){console.log("could not save data:",e.message)}}
function save(){if(saveT)return;saveT=setTimeout(()=>{saveT=null;flush()},1000)}
PROF.user=function(id){return DB.users[id]||null};PROF.save=save;
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
function body(q,cb){q.on("error",()=>{});let b="",bad=false;q.on("data",c=>{b+=c;if(b.length>2000){bad=true;q.destroy()}});
 q.on("end",()=>{if(bad)return;let d=null;try{d=JSON.parse(b||"{}")}catch(e){}cb(d&&typeof d==="object"?d:null)})}
const pub=u=>({id:u.id,name:u.name,email:u.email||null,guest:!!u.guest});
const GUESTS_PER_HOUR=N("GUESTS_PER_HOUR",30),REG_PER_HOUR=N("REGISTER_PER_HOUR",30);
// forget expired sessions and guests that have no live session (runs at start and every hour)
function sweep(){const n=Date.now(),live=new Set();
 for(const k of Object.keys(DB.sessions)){if(DB.sessions[k].exp<n)delete DB.sessions[k];else live.add(DB.sessions[k].uid)}
 for(const u of Object.values(DB.users))if(u.guest&&!live.has(u.id)){delete DB.users[u.id];byName.delete(u.name)}
 save()}
sweep();setInterval(sweep,3600000);
// ================= sign in with Google, Apple or Facebook (OAuth "authorization code" flow, no extra packages) =================
// Each one only appears when its keys are set on the server (see README). Instagram has no sign-in for normal accounts, so it is not included.
const PUBLIC_URL=(E.PUBLIC_URL||"").replace(/\/+$/,"");
const PV={
 google:{name:"Google",id:E.GOOGLE_CLIENT_ID,secret:E.GOOGLE_CLIENT_SECRET,auth:E.OAUTH_GOOGLE_AUTH||"https://accounts.google.com/o/oauth2/v2/auth",token:E.OAUTH_GOOGLE_TOKEN||"https://oauth2.googleapis.com/token",jwks:E.OAUTH_GOOGLE_JWKS||"https://www.googleapis.com/oauth2/v3/certs",iss:["https://accounts.google.com","accounts.google.com"],scope:"openid email profile"},
 apple:{name:"Apple",id:E.APPLE_CLIENT_ID,auth:E.OAUTH_APPLE_AUTH||"https://appleid.apple.com/auth/authorize",token:E.OAUTH_APPLE_TOKEN||"https://appleid.apple.com/auth/token",jwks:E.OAUTH_APPLE_JWKS||"https://appleid.apple.com/auth/keys",iss:["https://appleid.apple.com"],scope:"name email"},
 facebook:{name:"Facebook",id:E.FACEBOOK_APP_ID,secret:E.FACEBOOK_APP_SECRET,auth:E.OAUTH_FACEBOOK_AUTH||"https://www.facebook.com/v19.0/dialog/oauth",token:E.OAUTH_FACEBOOK_TOKEN||"https://graph.facebook.com/v19.0/oauth/access_token",me:E.OAUTH_FACEBOOK_ME||"https://graph.facebook.com/v19.0/me?fields=id,name,email",scope:"public_profile,email"}};
const APPLE_KEY=(E.APPLE_PRIVATE_KEY||"").replace(/\\n/g,"\n");
const pvOn=p=>{const c=PV[p];return!!(c&&c.id&&(p==="apple"?(E.APPLE_TEAM_ID&&E.APPLE_KEY_ID&&APPLE_KEY):c.secret))};
const b64u=b=>Buffer.from(b).toString("base64url");
async function fetchT(url,opt){const ac=new AbortController(),t=setTimeout(()=>ac.abort(),8000);try{return await fetch(url,Object.assign({},opt,{signal:ac.signal}))}finally{clearTimeout(t)}}
// Apple wants a "client secret" that is itself a small signed token (ES256), made fresh for each sign-in
function appleSecret(){const now=Math.floor(Date.now()/1000),h=b64u(JSON.stringify({alg:"ES256",kid:E.APPLE_KEY_ID})),p=b64u(JSON.stringify({iss:E.APPLE_TEAM_ID,iat:now,exp:now+300,aud:E.OAUTH_APPLE_AUD||"https://appleid.apple.com",sub:PV.apple.id}));
 return h+"."+p+"."+b64u(crypto.sign("sha256",Buffer.from(h+"."+p),{key:APPLE_KEY,dsaEncoding:"ieee-p1363"}))}
const JW={};
async function jwks(p,force){const c=JW[p];if(c&&!force&&Date.now()-c.t<3600e3)return c.k;const r=await fetchT(PV[p].jwks);if(!r.ok)throw new Error("keys "+r.status);const d=await r.json();JW[p]={t:Date.now(),k:d.keys||[]};return JW[p].k}
// check the signed "id token" the provider sends back: who signed it, who it is for, that it is fresh and that it belongs to THIS sign-in
async function verifyIdToken(p,tok,nonce){const parts=String(tok||"").split(".");if(parts.length!==3)throw new Error("bad token");
 const h=JSON.parse(Buffer.from(parts[0],"base64url")),c=JSON.parse(Buffer.from(parts[1],"base64url"));if(h.alg!=="RS256")throw new Error("alg");
 let k=(await jwks(p)).find(x=>x.kid===h.kid);if(!k)k=(await jwks(p,true)).find(x=>x.kid===h.kid);if(!k)throw new Error("unknown key");
 if(!crypto.verify("RSA-SHA256",Buffer.from(parts[0]+"."+parts[1]),crypto.createPublicKey({key:k,format:"jwk"}),Buffer.from(parts[2],"base64url")))throw new Error("bad signature");
 if(!PV[p].iss.includes(c.iss))throw new Error("wrong issuer");if(![].concat(c.aud).includes(PV[p].id))throw new Error("wrong audience");
 if(!(c.exp>Date.now()/1000-60))throw new Error("expired");if(c.nonce!==nonce)throw new Error("wrong nonce");if(!c.sub)throw new Error("no subject");return c}
const OA=new Map(),PEND=new Map();   // sign-ins in progress / people who signed in but still have to choose a player name
setInterval(()=>{const n=Date.now();for(const[k,v]of OA)if(n-v.t>6e5)OA.delete(k);for(const[k,v]of PEND)if(n-v.t>9e5)PEND.delete(k)},60000);
const baseUrl=q=>PUBLIC_URL||((q.headers["x-forwarded-proto"]||(q.socket.encrypted?"https":"http"))+"://"+q.headers.host);
const goTo=(r,loc)=>{r.writeHead(302,{Location:loc,"Cache-Control":"no-store"}).end()};
const isHttps=q=>q.socket.encrypted||q.headers["x-forwarded-proto"]==="https";
const cookieStr=(q,name,val,maxAge)=>name+"="+val+"; Path=/; HttpOnly; SameSite=Lax; Max-Age="+maxAge+(isHttps(q)?"; Secure":"");
const pendTok=q=>{const m=/(?:^|;\s*)rps_pending=([a-f0-9]{48})/.exec(q.headers.cookie||"");return m&&m[1]};
function oauthStart(p,q,r){if(!pvOn(p))return goTo(r,"/?auth=unavailable");if(limited("os:"+ipOf(q),40,600000))return goTo(r,"/?auth=failed");
 const c=PV[p],state=crypto.randomBytes(16).toString("hex"),nonce=crypto.randomBytes(16).toString("hex"),verifier=crypto.randomBytes(32).toString("base64url");
 OA.set(state,{p,nonce,verifier,t:Date.now()});
 const u=new URL(c.auth),sp=u.searchParams;sp.set("client_id",c.id);sp.set("redirect_uri",baseUrl(q)+"/auth/"+p+"/callback");sp.set("response_type","code");sp.set("scope",c.scope);sp.set("state",state);
 if(p!=="facebook")sp.set("nonce",nonce);
 if(p==="google"){sp.set("code_challenge",crypto.createHash("sha256").update(verifier).digest("base64url"));sp.set("code_challenge_method","S256")}
 if(p==="apple")sp.set("response_mode","form_post");
 goTo(r,u.toString())}
async function oauthCallback(p,q,r,pr){
 try{const st=OA.get(pr.state);OA.delete(pr.state);if(!st||st.p!==p||pr.error||!pr.code)return goTo(r,"/?auth=failed");   // a state works only once
  const c=PV[p],f=new URLSearchParams({grant_type:"authorization_code",code:pr.code,redirect_uri:baseUrl(q)+"/auth/"+p+"/callback",client_id:c.id});
  f.set("client_secret",p==="apple"?appleSecret():c.secret);if(p==="google")f.set("code_verifier",st.verifier);
  const tr=await fetchT(c.token,{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:f.toString()});if(!tr.ok)throw new Error("token "+tr.status);const t=await tr.json();
  let sub,email=null,ok=false;
  if(p==="facebook"){const mr=await fetchT(c.me+(c.me.includes("?")?"&":"?")+"access_token="+encodeURIComponent(t.access_token));if(!mr.ok)throw new Error("profile "+mr.status);const m=await mr.json();if(!m.id)throw new Error("no id");sub=String(m.id);email=m.email||null;ok=!!m.email}
  else{const id=await verifyIdToken(p,t.id_token,st.nonce);sub=String(id.sub);email=id.email||null;ok=id.email_verified===true||id.email_verified==="true"}
  const u=byIdent.get(p+":"+sub);
  if(u){r.setHeader("Set-Cookie",cookieStr(q,"rps_session",newSession(u.id),2592000));return goTo(r,"/")}          // already has a player: log in
  const tok=crypto.randomBytes(24).toString("hex");PEND.set(tok,{p,sub,email:ok?email:null,t:Date.now()});   // new: choose a player name first
  r.setHeader("Set-Cookie",cookieStr(q,"rps_pending",tok,900));goTo(r,"/?finish=1")
 }catch(e){console.log("sign-in error ("+p+"):",e&&e.message);goTo(r,"/?auth=failed")}}
function formBody(q,cb){q.on("error",()=>{});let b="",bad=false;q.on("data",c=>{b+=c;if(b.length>8000){bad=true;q.destroy()}});q.on("end",()=>{if(bad)return;const o={};try{new URLSearchParams(b).forEach((v,k)=>{o[k]=v})}catch(e){}cb(o)})}
process.on("uncaughtException",e=>console.log("uncaught error (server keeps running):",e&&e.stack||e));
process.on("unhandledRejection",e=>console.log("unhandled error (server keeps running):",e&&e.stack||e));
if(process.env.RENDER&&!E.DATA_DIR)console.log("WARNING: no DATA_DIR set. Accounts are erased every time Render restarts. Add a Persistent Disk and set DATA_DIR (see README).");
const safeAsync=(r,fn)=>async d=>{try{await fn(d)}catch(e){console.log("handler error:",e&&e.stack||e);try{J(r,500,{error:"SERVER ERROR. TRY AGAIN."})}catch(x){}}};
function handle(q,r){let u;try{u=new URL(String(q.url||"/").replace(/^\/{2,}/,"/"),"http://x")}catch(e){r.writeHead(400).end();return}const P=u.pathname;
 r.setHeader("X-Content-Type-Options","nosniff");r.setHeader("Referrer-Policy","same-origin");
 if(q.method==="POST"&&P!=="/auth/apple/callback"){const o=q.headers.origin;let bad=false;if(o){try{bad=new URL(o).host!==q.headers.host}catch(e){bad=true}}
  if(bad){J(r,403,{error:"BLOCKED REQUEST"});return}}
 if(P==="/api/providers"&&q.method==="GET")return J(r,200,{google:pvOn("google"),apple:pvOn("apple"),facebook:pvOn("facebook")});
 {const m=/^\/auth\/(google|apple|facebook)(\/callback)?$/.exec(P);
  if(m){const p=m[1];
   if(!m[2])return q.method==="GET"?oauthStart(p,q,r):goTo(r,"/?auth=failed");
   if(p==="apple"){if(q.method!=="POST")return goTo(r,"/?auth=failed");return formBody(q,o=>{oauthCallback(p,q,r,o)})}
   if(q.method!=="GET")return goTo(r,"/?auth=failed");const o={};u.searchParams.forEach((v,k)=>{o[k]=v});return void oauthCallback(p,q,r,o)}}
 if(P==="/.well-known/apple-developer-domain-association.txt"&&E.APPLE_DOMAIN_ASSOCIATION){r.writeHead(200,{"Content-Type":"text/plain"}).end(E.APPLE_DOMAIN_ASSOCIATION.replace(/\\n/g,"\n"));return}
 if(P==="/api/social/pending"&&q.method==="GET"){const t=pendTok(q),v=t&&PEND.get(t);return v?J(r,200,{provider:PV[v.p].name,p:v.p}):J(r,404,{error:"NO SIGN-IN WAITING"})}
 if(P==="/api/social/finish"&&q.method==="POST")return body(q,d=>{const t=pendTok(q),v=t&&PEND.get(t);if(!v)return J(r,400,{error:"SIGN-IN EXPIRED. TRY AGAIN."});
  if(!d)return J(r,400,{error:"BAD REQUEST"});if(limited("sf:"+ipOf(q),20,3600000))return J(r,429,{error:"TOO MANY TRIES. WAIT A BIT."});
  const name=String((d&&d.name)||"").trim().toUpperCase();
  if(!/^[A-Z0-9_]{3,12}$/.test(name))return J(r,400,{error:"NAME: 3-12 LETTERS, NUMBERS OR _"});
  if(byName.has(name))return J(r,409,{error:"NAME ALREADY TAKEN"});
  let u=byIdent.get(v.p+":"+v.sub);
  if(!u){u={id:"u"+crypto.randomBytes(8).toString("hex"),email:null,name,pw:null,ids:{[v.p]:v.sub},semail:v.email||null,created:Date.now()};
   DB.users[u.id]=u;byName.set(name,u);byIdent.set(v.p+":"+v.sub,u)}
  PEND.delete(t);r.setHeader("Set-Cookie",[cookieStr(q,"rps_session",newSession(u.id),2592000),cookieStr(q,"rps_pending","",0)]);J(r,200,{user:pub(u)})})
 if(P==="/api/me"&&q.method==="GET"){const a=authUser(q);return a?J(r,200,{user:pub(a)}):J(r,401,{error:"NOT LOGGED IN"})}
 if(P==="/api/logout"&&q.method==="POST"){const t=tokenOf(q);if(t){delete DB.sessions[sha(t)];save()}setCookie(r,q,"",0);return J(r,200,{})}
 if(P==="/api/guest"&&q.method==="POST"){
  if(limited("gu:"+ipOf(q),GUESTS_PER_HOUR,3600000))return J(r,429,{error:"TOO MANY GUESTS FROM HERE. TRY LATER."});
  let name,tries=0;do{name="GUEST_"+(10000+rnd(90000))}while(byName.has(name)&&++tries<50);
  if(byName.has(name))return J(r,503,{error:"TRY AGAIN"});
  const user={id:"g"+crypto.randomBytes(8).toString("hex"),email:null,name,pw:null,guest:true,created:Date.now()};
  DB.users[user.id]=user;byName.set(name,user);
  setCookie(r,q,newSession(user.id),2592000);return J(r,200,{user:pub(user)})}
 if(P==="/api/register-ig"&&q.method==="POST")return body(q,safeAsync(r,async d=>{
  if(!d)return J(r,400,{error:"BAD REQUEST"});
  if(limited("reg:"+ipOf(q),REG_PER_HOUR,3600000))return J(r,429,{error:"TOO MANY TRIES. WAIT A BIT."});
  const ig=cleanIg(d.ig),name=String(d.name||"").trim().toUpperCase(),pw=String(d.password||"");
  if(!ig)return J(r,400,{error:"INSTAGRAM: LETTERS, NUMBERS, . OR _ (MAX 30)"});
  if(!/^[A-Z0-9_]{3,12}$/.test(name))return J(r,400,{error:"NAME: 3-12 LETTERS, NUMBERS OR _"});
  if(pw.length<8||pw.length>200)return J(r,400,{error:"PASSWORD: AT LEAST 8 CHARACTERS"});
  if(byName.has(name))return J(r,409,{error:"NAME ALREADY TAKEN"});
  const user={id:"u"+crypto.randomBytes(8).toString("hex"),email:null,name,pw:await hashPw(pw),ig,created:Date.now()};
  if(byName.has(name))return J(r,409,{error:"NAME ALREADY TAKEN"});
  DB.users[user.id]=user;byName.set(name,user);
  setCookie(r,q,newSession(user.id),2592000);J(r,200,{user:pub(user)})}));
 if(P==="/api/register"&&q.method==="POST")return body(q,safeAsync(r,async d=>{
  if(!d)return J(r,400,{error:"BAD REQUEST"});
  if(limited("reg:"+ipOf(q),REG_PER_HOUR,3600000))return J(r,429,{error:"TOO MANY TRIES. WAIT A BIT."});
  const email=String(d.email||"").trim().toLowerCase(),name=String(d.name||"").trim().toUpperCase(),pw=String(d.password||"");
  if(email.length>254||!/^[^@\s]{1,64}@[^@\s]+\.[^@\s]+$/.test(email))return J(r,400,{error:"ENTER A VALID EMAIL"});
  if(!/^[A-Z0-9_]{3,12}$/.test(name))return J(r,400,{error:"NAME: 3-12 LETTERS, NUMBERS OR _"});
  if(pw.length<8||pw.length>200)return J(r,400,{error:"PASSWORD: AT LEAST 8 CHARACTERS"});
  if(byEmail.has(email))return J(r,409,{error:"EMAIL ALREADY REGISTERED"});
  if(byName.has(name))return J(r,409,{error:"NAME ALREADY TAKEN"});
  const user={id:"u"+crypto.randomBytes(8).toString("hex"),email,name,pw:await hashPw(pw),created:Date.now()};
  if(byEmail.has(email)||byName.has(name))return J(r,409,{error:"EMAIL OR NAME ALREADY TAKEN"});
  DB.users[user.id]=user;byEmail.set(email,user);byName.set(name,user);
  setCookie(r,q,newSession(user.id),2592000);J(r,200,{user:pub(user)})}));
 if(P==="/api/login"&&q.method==="POST")return body(q,safeAsync(r,async d=>{
  if(!d)return J(r,400,{error:"BAD REQUEST"});
  const email=String(d.email||"").trim().toLowerCase().slice(0,254),pw=String(d.password||"").slice(0,200);
  if(limited("li:"+ipOf(q),30,600000)||limited("le:"+email,10,600000))return J(r,429,{error:"TOO MANY TRIES. WAIT A BIT."});
  const cand=byEmail.get(email)||byName.get(email.toUpperCase()),user=cand&&cand.pw?cand:undefined,ok=await checkPw(pw,user?user.pw:FAKE_HASH);   // email OR player name
  if(!user||!ok)return J(r,401,{error:"WRONG EMAIL OR PASSWORD"});
  setCookie(r,q,newSession(user.id),2592000);J(r,200,{user:pub(user)})}));
 if(P==="/api/profile"&&q.method==="GET"){const a=authUser(q);if(!a)return J(r,401,{error:"NOT LOGGED IN"});return a.guest?J(r,200,{guest:true,name:a.name}):J(r,200,profileView(a))}
 if(P==="/api/profile"&&q.method==="POST"){const a=authUser(q);if(!a)return J(r,401,{error:"NOT LOGGED IN"});if(a.guest)return J(r,400,{error:"PROFILES ARE FOR REGISTERED PLAYERS"});
  return body(q,d=>{if(!d)return J(r,400,{error:"BAD REQUEST"});if(limited("pf:"+a.id,30,600000))return J(r,429,{error:"TOO MANY TRIES. WAIT A BIT."});const res=profileSet(a,d);J(r,res.error?400:200,res.error?res:profileView(a))})}
 if(P==="/events"&&q.method==="GET"){const a=authUser(q);if(!a){J(r,401,{error:"NOT LOGGED IN"});return}
  const m=u.searchParams.get("mode"),mode=m==="home"||m==="private"?m:"official";
  let set=clients.get(a.id);if(!set)clients.set(a.id,set=new Set());
  while(set.size>=6){const o=set.values().next().value;set.delete(o);try{o.res.end()}catch(e){}}   // at most 6 open pages per player
  r.writeHead(200,{"Content-Type":"text/event-stream","Cache-Control":"no-cache","Connection":"keep-alive","X-Accel-Buffering":"no"});
  r.on("error",()=>{});const c={res:r,mode};set.add(c);q.on("close",()=>{set.delete(c);if(!set.size&&clients.get(a.id)===set)clients.delete(a.id)});
  r.write("data: "+JSON.stringify(view(a.id,mode))+"\n\n");return}
 if((P==="/join"||P==="/move")&&q.method==="POST"){const a=authUser(q);if(!a)return J(r,401,{error:"NOT LOGGED IN"});
  return body(q,d=>{if(!d)return J(r,400,{error:"BAD REQUEST"});
   let res="ok";if(P==="/join")res=join(a.id,a.name);else move(a.id,d.move);send(a.id);
   if(res==="busy")return J(r,409,{error:"LEAVE YOUR OTHER TOURNAMENT FIRST"});J(r,200,{result:res})})}
 if(P.startsWith("/api/t/")&&q.method==="POST"){const a=authUser(q);if(!a)return J(r,401,{error:"NOT LOGGED IN"});
  return body(q,d=>{if(!d)return J(r,400,{error:"BAD REQUEST"});const act=P.slice(7);let res;
   if(act==="create"){res=limited("tc:"+a.id,10,3600000)?{error:"TOO MANY TRIES. WAIT A BIT."}:tCreate(a,d)}
   else if(act==="join"){res=limited("tj:"+a.id,30,600000)?{error:"TOO MANY TRIES. WAIT A BIT."}:tJoinCode(a,d.code)}
   else if(act==="leave")res=tLeave(a.id);else if(act==="start")res=tStart(a.id);else if(act==="cancel")res=tCancel(a.id);
   else if(act==="kick")res=tKick(a.id,d.name);else res={error:"UNKNOWN REQUEST"};
   send(a.id);J(r,res.error?400:200,res)})}
 if(P==="/"||P==="/official"||P==="/private"||P==="/profile"){r.writeHead(200,{"Content-Type":"text/html; charset=utf-8","Cache-Control":"no-cache"}).end(fs.readFileSync(path.join(__dirname,"index.html")));return}
 r.writeHead(404).end()}
http.createServer((q,r)=>{r.on("error",()=>{});try{handle(q,r)}catch(e){console.log("request error:",e&&e.stack||e);try{if(!r.headersSent)r.writeHead(500);r.end()}catch(x){}}}).listen(PORT,()=>console.log("RPS Kickoff running on port "+PORT+" (accounts saved in "+DATA_DIR+")"));
