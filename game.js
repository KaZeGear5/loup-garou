const DUMMY=document.createElement('div');
const $=id=>document.getElementById(id)||DUMMY;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const ROLES={
villageois:{n:'Villageois',i:'🧑‍🌾',t:'Village',d:'Aucun pouvoir. Il écoute, débat et vote pour éliminer les loups.'},
loup:{n:'Loup-garou',i:'🐺',t:'Loups',d:'Chaque nuit, les loups choisissent ensemble une victime. Ils gagnent quand il ne reste que des loups en vie.'},
loupnoir:{n:'Loup noir',i:'🌑',t:'Loups',d:'Un loup-garou spécial. Une seule fois dans la partie, il peut transformer la victime des loups en loup-garou au lieu de la tuer.'},
loupblanc:{n:'Loup blanc',i:'🤍',t:'Solitaire',d:'Il chasse avec les loups mais joue pour lui. Une nuit sur deux (nuits 2, 4, 6…) il dévore un autre loup. Il gagne seul, en dernier survivant.'},
voyante:{n:'Voyante bavarde',i:'🔮',t:'Village',d:'Chaque nuit, elle voit le rôle d’un joueur. Mais elle ne sait pas se taire : à l’aube, le village entend le rôle qu’elle a vu (sans le nom du joueur).'},
cupidon:{n:'Cupidon',i:'💘',t:'Village',d:'La première nuit, il désigne deux amoureux. Si l’un meurt, l’autre meurt de chagrin. Si les amoureux sont de camps opposés, ils gagnent ensemble en restant les deux derniers.'},
flute:{n:'Joueur de flûte',i:'🎶',t:'Solitaire',d:'Chaque nuit, il charme deux joueurs. Il gagne seul quand tous les autres joueurs encore en vie sont charmés.'},
idiot:{n:'Idiot du village',i:'🤪',t:'Village',d:'Si le village le vote, il est gracié et reste en vie, mais il perd définitivement son droit de vote.'},
salvateur:{n:'Salvateur',i:'🛡️',t:'Village',d:'Chaque nuit, il protège un joueur (lui-même compris) contre toutes les attaques de la nuit. Il ne peut pas protéger deux nuits de suite la même personne.'},
assassin:{n:'Assassin',i:'🗡️',t:'Solitaire',d:'Il joue seul. Chaque nuit, il tue un joueur. Les loups ne peuvent pas le tuer. Il gagne s’il est le dernier en vie.'},
ange:{n:'Ange',i:'😇',t:'Solitaire',d:'Il gagne seul s’il est éliminé par le vote du village dès le premier jour. Sinon, il devient un simple villageois.'},
angedechu:{n:'Ange déchu',i:'😈',t:'Solitaire',d:'Il veut tomber. Il gagne seul s’il est éliminé par le vote du village, quel que soit le jour. S’il survit, il joue avec le village.'}
};
const SPECIAL=['loupnoir','loupblanc','voyante','cupidon','flute','idiot','salvateur','assassin','ange','angedechu'];
const WOLF=['loup','loupnoir','loupblanc'];
const camp=r=>r==='loup'||r==='loupnoir'?'loups':r==='loupblanc'?'lb':r==='assassin'?'ass':r==='flute'?'flute':'village';

const me={id:null,name:'',host:false};
let peer=null,hostConn=null,conns={},myStream=null;
let G={phase:'lobby',day:0,players:{},order:[],ring:false,secs:0,label:'',cfg:{}};
let V=G;               // vue publique reçue de l'hôte
let VT=0;              // heure locale de fin de minuterie
let myRole=null,myTeam=[];
const POS={};          // id -> {x,z,ry}
SPECIAL.forEach(k=>G.cfg[k]=true);

function toast(t,cls){const l=$('log');const p=document.createElement('p');p.className=cls||'';p.textContent=t;l.appendChild(p);l.scrollTop=l.scrollHeight;}

function renderRoles(){
  const box=$('roles');box.innerHTML='';
  Object.keys(ROLES).forEach(k=>{
    const r=ROLES[k];const d=document.createElement('div');d.className='role';
    const optional=SPECIAL.includes(k);
    d.innerHTML='<span class="ico">'+r.i+'</span><div><b>'+r.n+'</b><small>'+r.d+'</small></div>';
    const side=document.createElement('div');
    if(optional&&me.host&&V.phase==='lobby'){
      const c=document.createElement('input');c.type='checkbox';c.checked=!!G.cfg[k];c.setAttribute('aria-label','Activer '+r.n);
      c.onchange=()=>{G.cfg[k]=c.checked;pub();};side.appendChild(c);
    }else{const s=document.createElement('span');s.className='tag';s.textContent=optional&&V.cfg&&!V.cfg[k]?'désactivé':r.t;side.appendChild(s);}
    d.appendChild(side);box.appendChild(d);
  });
}
function renderRoom(){
  $('room').hidden=false;$('rcode').textContent=V.code||'';
  const ul=$('plist');ul.innerHTML='';
  V.order.forEach(id=>{const p=V.players[id];const li=document.createElement('li');
    li.innerHTML='<span></span><span class="tag">'+(p.bot?'bot':id===V.hostId?'chef':'joueur')+'</span>';
    li.firstChild.textContent=p.name;ul.appendChild(li);});
  $('bbot').hidden=!me.host;$('bstart').hidden=!me.host;
  $('bstart').disabled=V.order.length<4;
  $('hostnote').textContent=me.host?(V.order.length<4?'Il faut au moins 4 joueurs (ajoutez des bots pour tester).':'Tout le monde est là ? Lancez la partie.'):'En attente du chef de la partie…';
  renderRoles();
}

/* ===== Moteur de jeu (tourne chez le chef de la partie) ===== */
const H={roles:{},lovers:[],charmed:new Set(),prot:null,lastProt:null,noirUsed:false,idiotUsed:false,noVote:new Set(),night:0,wait:{},win:null};
const alive=()=>G.order.filter(i=>G.players[i].alive);
const rn=id=>ROLES[H.roles[id]].n;
const shuffle=a=>a.map(x=>[Math.random(),x]).sort((p,q)=>p[0]-q[0]).map(p=>p[1]);
function send(id,m){if(id===me.id){onMsg(m);return;}const c=conns[id];if(c&&c.open)c.send(m);}
function bcast(m){for(const id of G.order)if(!G.players[id].bot)send(id,m);}
function pub(){G.hostId=me.id;bcast({t:'state',G});}
function say(text,cls,to){const m={t:'log',text,cls:cls||''};to?send(to,m):bcast(m);}
function setPhase(phase,label,secs,ring){G.phase=phase;G.label=label;G.secs=secs||0;G.ring=!!ring;pub();}
async function timer(phase,label,secs,ring){setPhase(phase,label,secs,ring);await sleep(secs*1000);}

function botPick(kind,opts,n){
  if(kind==='yn')return[Math.random()<.5?'yes':'no'];
  return shuffle(opts).slice(0,n);
}
function ask(id,kind,title,sub,opts,n,secs){
  if(G.players[id].bot)return Promise.resolve(botPick(kind,opts,n));
  return new Promise(res=>{
    H.wait[id]=res;
    send(id,{t:'ask',kind,title,sub,n,secs,opts:opts.map(o=>({id:o,name:o==='yes'?'Oui':o==='no'?'Non':G.players[o].name}))});
    setTimeout(()=>{if(H.wait[id]===res){delete H.wait[id];send(id,{t:'askend'});res([]);}},secs*1000);
  });
}
function onHost(from,m){
  if(m.t==='pos'){POS[from]={x:m.x,z:m.z,ry:m.ry};}
  else if(m.t==='act'&&H.wait[from]){const r=H.wait[from];delete H.wait[from];send(from,{t:'askend'});r(Array.isArray(m.v)?m.v:[]);}
}
async function step(actors,fn){
  if(!actors.length){await sleep(2500+Math.random()*1500);return;}
  const t0=Date.now();await Promise.all(actors.map(fn));
  const w=4000-(Date.now()-t0);if(w>0)await sleep(w);
}
function kill(id,cause){
  const p=G.players[id];if(!p||!p.alive)return;p.alive=false;
  say('💀 '+p.name+' est mort ('+cause+'). C’était : '+rn(id)+'.','d');
  const i=H.lovers.indexOf(id);
  if(i>=0)kill(H.lovers[1-i],'chagrin d’amour');
  pub();
}
function topOf(v){
  const ks=Object.keys(v);if(!ks.length)return null;
  const m=Math.max(...ks.map(k=>v[k]));return shuffle(ks.filter(k=>v[k]===m))[0];
}
function sendTeam(){
  const names=G.order.filter(i=>WOLF.includes(H.roles[i])).map(i=>G.players[i].name);
  G.order.forEach(i=>{if(WOLF.includes(H.roles[i]))send(i,{t:'priv',role:H.roles[i],team:names});});
}
function startGame(){
  const ids=G.order.slice(),n=ids.length;if(n<4)return;
  const k=Math.max(1,Math.floor(n/4));
  const wolves=['loup'];if(G.cfg.loupnoir&&k>1)wolves.push('loupnoir');while(wolves.length<k)wolves.push('loup');
  const sp=shuffle(SPECIAL.filter(r=>G.cfg[r]&&r!=='loupnoir')).slice(0,n-k);
  const list=[...wolves,...sp];while(list.length<n)list.push('villageois');
  shuffle(list).forEach((r,i)=>{H.roles[ids[i]]=r;});
  ids.forEach(i=>{G.players[i].alive=true;send(i,{t:'priv',role:H.roles[i],team:[]});});
  sendTeam();G.day=0;
  say('Les rôles sont distribués. Ouvrez « Mon rôle » pour le lire.','s');
  setPhase('intro','Le village s’installe autour du feu',10,true);
  sleep(10000).then(loop);
}
async function night(){
  H.night++;H.prot=null;
  setPhase('night','Nuit '+H.night,0,true);
  say('— Nuit '+H.night+' : le village s’endort autour du feu —','s');
  const A=()=>alive(),by=r=>A().filter(i=>H.roles[i]===r);
  const deaths=[];let voy=null;
  if(H.night===1)await step(by('cupidon'),async id=>{
    const r=await ask(id,'pick','Cupidon','Désignez deux amoureux (vous pouvez vous choisir).',A(),2,25);
    const p=r.slice();while(p.length<2){const o=A().filter(x=>!p.includes(x));p.push(o[Math.floor(Math.random()*o.length)]);}
    H.lovers=p.slice(0,2);
    H.lovers.forEach(l=>{const o=H.lovers.find(x=>x!==l);say('💘 Vous êtes amoureux de '+G.players[o].name+' ('+rn(o)+'). Si l’un de vous meurt, l’autre aussi.','p',l);});
  });
  await step(by('salvateur'),async id=>{
    const r=await ask(id,'pick','Salvateur','Qui protégez-vous cette nuit ? (pas le même deux nuits de suite)',A().filter(x=>x!==H.lastProt),1,20);
    H.prot=r[0]||null;H.lastProt=H.prot;
  });
  await step(by('voyante'),async id=>{
    const r=await ask(id,'pick','Voyante bavarde','Choisissez un joueur dont vous verrez le rôle.',A().filter(x=>x!==id),1,20);
    if(r[0]){voy=H.roles[r[0]];say('🔮 '+G.players[r[0]].name+' est : '+rn(r[0])+'.','p',id);}
  });
  await step(by('flute'),async id=>{
    const o=A().filter(x=>x!==id&&!H.charmed.has(x));if(!o.length)return;
    const r=await ask(id,'pick','Joueur de flûte','Charmez jusqu’à deux joueurs.',o,2,20);
    r.forEach(x=>{H.charmed.add(x);say('🎶 Une mélodie vous ensorcelle… vous êtes charmé.','p',x);});
    say('🎶 Charmés : '+(r.map(x=>G.players[x].name).join(', ')||'personne')+'.','p',id);
  });
  const wolves=A().filter(i=>WOLF.includes(H.roles[i])),targets=A().filter(i=>!WOLF.includes(H.roles[i]));
  const votes={};let victim=null,infected=false;
  await step(wolves,async id=>{
    const r=await ask(id,'pick','Les loups','Choisissez la victime de la nuit (majorité des loups).',targets,1,30);
    if(r[0])votes[r[0]]=(votes[r[0]]||0)+1;
  });
  victim=topOf(votes);
  if(!victim&&wolves.length&&targets.length)victim=shuffle(targets)[0];
  const noir=by('loupnoir')[0];
  if(victim&&noir&&!H.noirUsed)await step([noir],async id=>{
    const r=await ask(id,'yn','Loup noir','Transformer '+G.players[victim].name+' en loup-garou au lieu de le tuer ? (une seule fois)',['yes','no'],1,20);
    if(r[0]==='yes'){H.noirUsed=true;infected=true;}
  });
  if(victim){
    if(H.prot===victim)infected=false;
    else if(infected){H.roles[victim]='loup';sendTeam();say('🐺 Les loups vous ont mordu : vous devenez loup-garou.','d',victim);}
    else if(H.roles[victim]!=='assassin')deaths.push(victim);
  }
  const lb=by('loupblanc')[0];
  if(lb&&H.night%2===0)await step([lb],async id=>{
    const o=A().filter(x=>x!==id&&['loup','loupnoir'].includes(H.roles[x]));if(!o.length)return;
    const r=await ask(id,'pick','Loup blanc','Dévorez un autre loup ? (Passez si vous préférez.)',o,1,20);
    if(r[0]&&H.prot!==r[0])deaths.push(r[0]);
  });
  await step(by('assassin'),async id=>{
    const r=await ask(id,'pick','Assassin','Qui éliminez-vous cette nuit ?',A().filter(x=>x!==id),1,25);
    if(r[0]&&H.prot!==r[0])deaths.push(r[0]);
  });
  return{deaths:[...new Set(deaths)],voy};
}
async function voteDay(){
  setPhase('vote','Jour '+G.day+' — vote du village',35,true);
  say('🗳️ Le village se rassemble autour du feu pour voter.','s');
  const tally={},all=alive();
  await Promise.all(all.filter(i=>!H.noVote.has(i)).map(async id=>{
    const r=await ask(id,'vote','Vote du village','Qui éliminer ? Vous pouvez aussi vous abstenir.',all.filter(x=>x!==id),1,35);
    if(r[0]){tally[r[0]]=(tally[r[0]]||0)+1;say('🗳️ '+G.players[id].name+' vote contre '+G.players[r[0]].name+'.','s');}
  }));
  await sleep(1500);
  const vals=Object.values(tally),mx=vals.length?Math.max(...vals):0,top=Object.keys(tally).filter(k=>tally[k]===mx);
  if(!mx||top.length!==1){say('Égalité ou abstention : personne n’est éliminé.','s');return;}
  const v=top[0],r=H.roles[v];
  if(r==='idiot'&&!H.idiotUsed){H.idiotUsed=true;H.noVote.add(v);say('🤪 '+G.players[v].name+' est l’idiot du village ! Il est gracié mais perd son droit de vote.','p');return;}
  kill(v,'vote du village');
  if(r==='ange'&&G.day===1)H.win={ids:[v],title:'😇 L’Ange gagne !',text:G.players[v].name+' a été éliminé dès le premier jour. Il a gagné seul.'};
  if(r==='angedechu')H.win={ids:[v],title:'😈 L’Ange déchu gagne !',text:G.players[v].name+' est tombé sous le vote du village. Il a gagné seul.'};
}
function checkWin(){
  if(H.win)return H.win;
  const A=alive(),R=A.map(i=>H.roles[i]);
  if(!A.length)return{title:'Égalité',text:'Plus personne n’est en vie.'};
  if(A.length===2&&H.lovers.length===2&&A.every(i=>H.lovers.includes(i))&&camp(R[0])!==camp(R[1]))return{title:'💘 Les amoureux gagnent !',text:'Deux camps opposés, un seul cœur.'};
  if(R.includes('flute')&&A.filter(i=>H.roles[i]!=='flute').every(i=>H.charmed.has(i)))return{title:'🎶 Le joueur de flûte gagne !',text:'Tout le village danse à sa mélodie.'};
  if(A.length===1&&R[0]==='assassin')return{title:'🗡️ L’Assassin gagne !',text:'Le dernier en vie, seul dans le village.'};
  if(A.length===1&&R[0]==='loupblanc')return{title:'🤍 Le Loup blanc gagne !',text:'Il a dévoré les siens et le village.'};
  if(R.every(r=>camp(r)==='loups'))return{title:'🐺 Les loups gagnent !',text:'Le village est tombé.'};
  if(!R.some(r=>camp(r)!=='village'))return{title:'🧑‍🌾 Le village gagne !',text:'Plus aucun loup, plus aucune menace.'};
  return null;
}
function endCheck(){
  const w=checkWin();if(!w)return false;
  setPhase('end','Fin de partie',0,true);
  bcast({t:'end',title:w.title,text:w.text,roles:G.order.map(i=>G.players[i].name+' : '+rn(i)+(G.players[i].alive?'':' (mort)')).join(' · ')});
  return true;
}
async function loop(){
  while(true){
    const res=await night();G.day++;
    setPhase('day','Jour '+G.day,0,false);say('☀️ Le jour se lève sur le village.','s');
    if(res.voy)say('🔮 La voyante bavarde n’a pas pu se taire : elle a vu un(e) '+ROLES[res.voy].n+'.','p');
    if(!res.deaths.length)say('Personne n’est mort cette nuit.','s');else res.deaths.forEach(d=>kill(d,'tué dans la nuit'));
    if(endCheck())return;
    await timer('day','Jour '+G.day+' — discussion',75,false);
    await voteDay();
    if(endCheck())return;
  }
}

/* ===== Carte 2D façon Among Us : village à l’ouest, forêt autour, étang, feu au centre ===== */
const cv=$('c'),cx=cv.getContext('2d'),mini=$('mini'),mx=mini.getContext?mini.getContext('2d'):null;
const WX=58,WZ=40;                       // demi-dimensions du monde
let W=0,Hh=0,DPR=1,S=20;
const dk=document.createElement('canvas'),dx=dk.getContext('2d');
function resize(){DPR=Math.min(devicePixelRatio||1,2);W=innerWidth;Hh=innerHeight;cv.width=dk.width=Math.round(W*DPR);cv.height=dk.height=Math.round(Hh*DPR);S=Math.max(14,Math.min(W,Hh)/24);}
addEventListener('resize',resize);resize();
const camYaw=0;let dayF=0,tAnim=0;
const rnd=(s=>()=>{s|=0;s=s+0x6D2B79F5|0;let t=Math.imul(s^s>>>15,1|s);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;})(20261117);
/* obstacles */
const RECTS=[],CIRCS=[],HOUSES=[],TREES=[],BUSH=[];
const POND={x:30,z:22,r:7.5};
[[-46,-12],[-34,-12],[-22,-12],[-46,12],[-34,12],[-22,12],[-40,-30],[-40,30]].forEach(([x,z],i)=>{
  const h={x,z,w:9,h:7,south:z<0,c:[[181,154,118],[168,139,104],[194,171,138]][i%3],r:i%2?[150,56,44]:[104,66,48]};
  HOUSES.push(h);RECTS.push({x0:x-4.5,x1:x+4.5,z0:z-3.5,z1:z+3.5});
});
CIRCS.push({x:-30,z:0,r:1.3},{x:0,z:0,r:1.7},{x:POND.x,z:POND.z,r:POND.r-.6});   // puits, feu, étang
[[-12,-9],[14,-14],[22,8],[-8,16],[44,-4]].forEach(([x,z])=>CIRCS.push({x,z,r:1.3}));      // rochers
const onPath=(x,z)=>Math.abs(z)<4.5||Math.abs(x)<4.5;
const nearHouse=(x,z)=>HOUSES.some(h=>Math.abs(x-h.x)<h.w/2+3&&Math.abs(z-h.z)<h.h/2+3);
for(let i=0;i<900&&TREES.length<150;i++){
  const x=(rnd()*2-1)*(WX-2),z=(rnd()*2-1)*(WZ-2);
  if(x<-12||Math.hypot(x,z)<14||onPath(x,z)||Math.hypot(x-POND.x,z-POND.z)<POND.r+2.5)continue;
  if(TREES.some(t=>Math.hypot(t.x-x,t.z-z)<4))continue;
  TREES.push({x,z,s:.8+rnd()*.7});
}
for(let x=-WX;x<=WX;x+=4.5)for(const z of[-WZ-1,WZ+1])TREES.push({x,z,s:1.2});
for(let z=-WZ;z<=WZ;z+=4.5)for(const x of[-WX-1,WX+1])TREES.push({x,z,s:1.2});
TREES.forEach(t=>CIRCS.push({x:t.x,z:t.z,r:.9*t.s}));
for(let i=0;i<60;i++){const x=(rnd()*2-1)*WX,z=(rnd()*2-1)*WZ;if(!onPath(x,z)&&Math.hypot(x,z)>11&&!nearHouse(x,z)&&Math.hypot(x-POND.x,z-POND.z)>POND.r+1)BUSH.push({x,z,s:.5+rnd()*.5});}
function collide(p,r){
  for(const c of CIRCS){const ex=p.x-c.x,ez=p.z-c.z,d=Math.hypot(ex,ez),m=r+c.r;if(d<m){const k=d>.001?m/d:1;p.x=d>.001?c.x+ex*k:c.x+m;p.z=d>.001?c.z+ez*k:c.z;}}
  for(const q of RECTS){
    const nx=Math.max(q.x0,Math.min(p.x,q.x1)),nz=Math.max(q.z0,Math.min(p.z,q.z1)),ex=p.x-nx,ez=p.z-nz,d=Math.hypot(ex,ez);
    if(d<r){if(d>.001){p.x=nx+ex/d*r;p.z=nz+ez/d*r;}else{const l=p.x-q.x0,rr=q.x1-p.x,t=p.z-q.z0,b=q.z1-p.z,m=Math.min(l,rr,t,b);if(m===l)p.x=q.x0-r;else if(m===rr)p.x=q.x1+r;else if(m===t)p.z=q.z0-r;else p.z=q.z1+r;}}
  }
  p.x=Math.max(-WX+1,Math.min(WX-1,p.x));p.z=Math.max(-WZ+1,Math.min(WZ-1,p.z));
}
function freeSpot(rr){for(let i=0;i<60;i++){const a=Math.random()*6.28,r=rr[0]+Math.random()*(rr[1]-rr[0]);const p={x:Math.cos(a)*r,z:Math.sin(a)*r},q={x:p.x,z:p.z};collide(q,.8);if(Math.hypot(q.x-p.x,q.z-p.z)<.01)return p;}return{x:6,z:6};}

const AV={};
function hue(id){let h=0;for(const ch of id)h=(h*31+ch.charCodeAt(0))%360;return h;}
function syncAvatars(){
  for(const id of V.order)if(!AV[id])AV[id]={x:0,z:0,fx:1,alive:true,init:false,col:'hsl('+hue(id)+',60%,52%)'};
  for(const id in AV)if(!V.players[id])delete AV[id];
  for(const id in AV)AV[id].alive=V.players[id].alive;
}
function seatOf(id){
  const al=V.order.filter(i=>V.players[i].alive),dead=V.order.filter(i=>!V.players[i].alive);
  let i=al.indexOf(id),n=al.length,r=4.6;
  if(i<0){i=dead.indexOf(id);n=Math.max(dead.length,1);r=7.4;}
  const a=i/Math.max(n,1)*Math.PI*2-Math.PI/2;
  return{x:Math.cos(a)*r,z:Math.sin(a)*r};
}
/* contrôles : ZQSD / flèches, ou clic / toucher maintenu pour marcher */
const LP=Object.assign(freeSpot([6,10]),{ry:0});let keys={},tgt=null,press=false;
const cam={x:LP.x,z:LP.z};
addEventListener('keydown',e=>{if(e.target.tagName==='INPUT')return;keys[e.code]=true;tgt=null;});
addEventListener('keyup',e=>{keys[e.code]=false;});
const setTgt=e=>{tgt={x:cam.x+(e.clientX-W/2)/S,z:cam.z+(e.clientY-Hh/2)/S};};
cv.addEventListener('pointerdown',e=>{press=true;setTgt(e);});
addEventListener('pointerup',()=>press=false);
addEventListener('pointermove',e=>{if(press)setTgt(e);});

const mixc=(a,b,t)=>'rgb('+Math.round(a[0]+(b[0]-a[0])*t)+','+Math.round(a[1]+(b[1]-a[1])*t)+','+Math.round(a[2]+(b[2]-a[2])*t)+')';
const dim=(c,k)=>[c[0]*k,c[1]*k,c[2]*k];
function drawWorld(){
  const X=x=>W/2+(x-cam.x)*S,Z=z=>Hh/2+(z-cam.z)*S,vis=(x,z,m)=>Math.abs(x-cam.x)<W/2/S+m&&Math.abs(z-cam.z)<Hh/2/S+m;
  const col=(c,k)=>mixc(dim(c,.32*(k||1)),c,dayF);
  cx.fillStyle=col([86,132,72]);cx.fillRect(0,0,W,Hh);
  /* hors du monde */
  cx.fillStyle=col([30,62,38]);cx.fillRect(0,0,W,Hh);
  cx.fillStyle=col([86,132,72]);cx.fillRect(X(-WX),Z(-WZ),2*WX*S,2*WZ*S);
  /* forêt : sol plus sombre à l’est et au nord, village : terre battue */
  cx.fillStyle=col([62,108,60]);cx.fillRect(X(-12),Z(-WZ),(WX+12)*S,2*WZ*S);
  cx.fillStyle=col([150,120,86]);cx.fillRect(X(-WX),Z(-4.5),2*WX*S,9*S);cx.fillRect(X(-4.5),Z(-WZ),9*S,2*WZ*S);
  cx.beginPath();cx.arc(X(0),Z(0),11*S,0,7);cx.fillStyle=col([140,108,76]);cx.fill();
  cx.beginPath();cx.arc(X(0),Z(0),9*S,0,7);cx.fillStyle=col([128,98,68]);cx.fill();
  /* étang */
  cx.beginPath();cx.arc(X(POND.x),Z(POND.z),POND.r*S,0,7);cx.fillStyle=col([40,96,150]);cx.fill();
  cx.beginPath();cx.arc(X(POND.x),Z(POND.z),(POND.r-1.6)*S,0,7);cx.fillStyle=col([60,124,178]);cx.fill();
  /* noms de zones */
  cx.save();cx.globalAlpha=.3*(.4+dayF*.6);cx.fillStyle='#fff';cx.font='800 '+Math.round(2.2*S)+'px Cinzel,serif';cx.textAlign='center';
  cx.fillText('VILLAGE',X(-34),Z(1.2));cx.fillText('FORÊT',X(30),Z(-24));cx.fillText('ÉTANG',X(POND.x),Z(POND.z+.8));cx.restore();
  BUSH.forEach(b=>{if(vis(b.x,b.z,2)){cx.fillStyle=col([44,96,52]);cx.beginPath();cx.arc(X(b.x),Z(b.z),b.s*S,0,7);cx.fill();}});
  [[-30,0,1.3,[120,120,126]],[-12,-9,1.3,[110,110,116]],[14,-14,1.3,[110,110,116]],[22,8,1.3,[110,110,116]],[-8,16,1.3,[110,110,116]],[44,-4,1.3,[110,110,116]]].forEach(([x,z,r,c])=>{if(vis(x,z,3)){cx.fillStyle=col(c);cx.beginPath();cx.arc(X(x),Z(z),r*S,0,7);cx.fill();cx.fillStyle=col([40,70,110]);if(x===-30){cx.beginPath();cx.arc(X(x),Z(z),.7*S,0,7);cx.fill();}}});
  /* maisons */
  HOUSES.forEach(h=>{if(!vis(h.x,h.z,7))return;
    const x0=X(h.x-h.w/2),z0=Z(h.z-h.h/2),w=h.w*S,hh=h.h*S;
    cx.fillStyle='rgba(0,0,0,.25)';cx.fillRect(x0+.5*S,z0+.6*S,w,hh);
    cx.fillStyle=col(h.r);cx.fillRect(x0,z0,w,hh/2);cx.fillStyle=col(dim(h.r,.78));cx.fillRect(x0,z0+hh/2,w,hh/2);
    cx.strokeStyle='rgba(0,0,0,.4)';cx.lineWidth=2;cx.strokeRect(x0,z0,w,hh);cx.beginPath();cx.moveTo(x0,z0+hh/2);cx.lineTo(x0+w,z0+hh/2);cx.stroke();
    cx.fillStyle=col([60,40,28]);cx.fillRect(X(h.x)-.7*S,h.south?z0+hh-.25*S:z0-.1*S,1.4*S,.35*S);
  });
  /* feu */
  const fl=1+Math.sin(tAnim*11)*.08+Math.random()*.05;
  cx.fillStyle='#6b6458';for(let i=0;i<9;i++){const a=i/9*6.28;cx.beginPath();cx.arc(X(Math.cos(a)*1.4),Z(Math.sin(a)*1.4),.38*S,0,7);cx.fill();}
  [['#ff5a1a',1.05],['#ff9a2a',.72],['#ffd36a',.4]].forEach(([c,r])=>{cx.fillStyle=c;cx.beginPath();cx.arc(X(0),Z(0),r*S*fl,0,7);cx.fill();});
  /* arbres */
  TREES.forEach(t=>{if(!vis(t.x,t.z,4))return;
    cx.fillStyle='rgba(0,0,0,.22)';cx.beginPath();cx.arc(X(t.x)+.5*S,Z(t.z)+.6*S,2.1*S*t.s,0,7);cx.fill();
    cx.fillStyle=col([30,84,46]);cx.beginPath();cx.arc(X(t.x),Z(t.z),2.1*S*t.s,0,7);cx.fill();
    cx.fillStyle=col([44,112,62]);cx.beginPath();cx.arc(X(t.x)-.3*S*t.s,Z(t.z)-.3*S*t.s,1.3*S*t.s,0,7);cx.fill();});
}
function drawNight(){
  const dark=(1-dayF)*.9;if(dark<.02)return;
  const X=x=>(W/2+(x-cam.x)*S)*DPR,Z=z=>(Hh/2+(z-cam.z)*S)*DPR;
  dx.setTransform(1,0,0,1,0,0);dx.globalCompositeOperation='source-over';dx.clearRect(0,0,dk.width,dk.height);
  dx.fillStyle='rgba(5,8,24,'+dark+')';dx.fillRect(0,0,dk.width,dk.height);
  dx.globalCompositeOperation='destination-out';
  const hole=(x,z,r0,r1)=>{const g=dx.createRadialGradient(X(x),Z(z),r0*S*DPR,X(x),Z(z),r1*S*DPR);g.addColorStop(0,'rgba(0,0,0,1)');g.addColorStop(1,'rgba(0,0,0,0)');dx.fillStyle=g;dx.fillRect(0,0,dk.width,dk.height);};
  hole(0,0,3,18+Math.sin(tAnim*13)*.4);hole(LP.x,LP.z,1,6.5);
  for(const id in AV)if(id!==me.id)hole(AV[id].x,AV[id].z,.5,3);
  HOUSES.forEach(h=>hole(h.x,h.z+(h.south?3:-3),.3,2.2));
  cx.setTransform(1,0,0,1,0,0);cx.drawImage(dk,0,0);cx.setTransform(DPR,0,0,DPR,0,0);
}
function drawAv(id,a){
  const X=W/2+(a.x-cam.x)*S,Z=Hh/2+(a.z-cam.z)*S,R=.85*S;
  if(X<-60||X>W+60||Z<-60||Z>Hh+60)return;
  cx.save();cx.globalAlpha=a.alive?1:.4;
  cx.fillStyle='rgba(0,0,0,.35)';cx.beginPath();cx.ellipse(X,Z+R*.85,R*.9,R*.4,0,0,7);cx.fill();
  cx.fillStyle=a.alive?a.col:'#8a8f9c';cx.beginPath();cx.roundRect?cx.roundRect(X-R*.8,Z-R,R*1.6,R*2,R*.7):cx.rect(X-R*.8,Z-R,R*1.6,R*2);cx.fill();
  cx.lineWidth=id===me.id?3:1.5;cx.strokeStyle=id===me.id?'#fff':'rgba(0,0,0,.55)';cx.stroke();
  cx.fillStyle='#bfe6ff';cx.beginPath();cx.ellipse(X+a.fx*R*.28,Z-R*.3,R*.55,R*.36,0,0,7);cx.fill();
  if(!a.alive){cx.strokeStyle='#e5574f';cx.lineWidth=3;cx.beginPath();cx.moveTo(X-R*.6,Z-R*.5);cx.lineTo(X+R*.6,Z+R*.5);cx.moveTo(X+R*.6,Z-R*.5);cx.lineTo(X-R*.6,Z+R*.5);cx.stroke();}
  cx.restore();
  const nm=V.players[id].name;cx.font='700 12px Nunito,sans-serif';cx.textAlign='center';
  const tw=cx.measureText(nm).width+10;cx.fillStyle='rgba(8,10,20,.72)';cx.fillRect(X-tw/2,Z-R-21,tw,16);
  cx.fillStyle=a.alive?'#ffe2b8':'#9aa3b8';cx.fillText(nm,X,Z-R-9);
}
function drawMini(){
  if(!mx)return;const w=mini.width,h=mini.height,sx=w/(2*WX),sz=h/(2*WZ),X=x=>(x+WX)*sx,Z=z=>(z+WZ)*sz;
  mx.clearRect(0,0,w,h);mx.fillStyle='rgba(20,40,26,.85)';mx.fillRect(0,0,w,h);
  mx.fillStyle='rgba(150,120,86,.8)';mx.fillRect(0,Z(-4.5),w,9*sz);mx.fillRect(X(-4.5),0,9*sx,h);
  mx.fillStyle='rgba(60,124,178,.9)';mx.beginPath();mx.arc(X(POND.x),Z(POND.z),POND.r*sx,0,7);mx.fill();
  mx.fillStyle='rgba(190,150,110,.95)';HOUSES.forEach(q=>mx.fillRect(X(q.x-q.w/2),Z(q.z-q.h/2),q.w*sx,q.h*sz));
  mx.fillStyle='#ff9a2a';mx.beginPath();mx.arc(X(0),Z(0),3,0,7);mx.fill();
  for(const id in AV){const a=AV[id];mx.fillStyle=a.alive?a.col:'#666';mx.beginPath();mx.arc(X(a.x),Z(a.z),id===me.id?4:3,0,7);mx.fill();if(id===me.id){mx.strokeStyle='#fff';mx.lineWidth=1.5;mx.stroke();}}
}
function update(dt){
  tAnim+=dt;
  const t=V.phase==='night'?0:V.phase==='intro'?.45:V.phase==='lobby'?.6:1;
  dayF+=(t-dayF)*Math.min(1,dt*1.4);
  cx.setTransform(DPR,0,0,DPR,0,0);
  const mine=me.id&&V.players[me.id]?V.players[me.id]:null;
  if(mine){
    syncAvatars();
    if(V.ring){const s=seatOf(me.id),k=Math.min(1,dt*2.2);LP.x+=(s.x-LP.x)*k;LP.z+=(s.z-LP.z)*k;tgt=null;}
    else{
      let ax=(keys.KeyD||keys.ArrowRight?1:0)-(keys.KeyA||keys.ArrowLeft?1:0),az=(keys.KeyS||keys.ArrowDown?1:0)-(keys.KeyW||keys.ArrowUp?1:0);
      if(!ax&&!az&&tgt){const ex=tgt.x-LP.x,ez=tgt.z-LP.z,d=Math.hypot(ex,ez);if(d>.3){ax=ex/d;az=ez/d;}else if(!press)tgt=null;}
      const l=Math.hypot(ax,az);
      if(l){LP.x+=ax/l*7*dt;LP.z+=az/l*7*dt;collide(LP,.8);}
    }
    POS[me.id]={x:LP.x,z:LP.z,ry:0};
    for(const id in AV){
      const a=AV[id],tg=V.ring?seatOf(id):(POS[id]||{x:6,z:6});
      if(!a.init){a.x=tg.x;a.z=tg.z;a.init=true;}
      const k=Math.min(1,dt*(id===me.id?25:8)),ox=a.x;a.x+=(tg.x-a.x)*k;a.z+=(tg.z-a.z)*k;
      if(Math.abs(a.x-ox)>.002)a.fx=a.x>ox?1:-1;
    }
    cam.x+=(LP.x-cam.x)*Math.min(1,dt*6);cam.z+=(LP.z-cam.z)*Math.min(1,dt*6);
  }else{const a=tAnim*.15;cam.x=Math.cos(a)*14;cam.z=Math.sin(a)*8;}
  drawWorld();
  if(mine){const order=Object.keys(AV).sort((p,q)=>AV[p].z-AV[q].z);for(const id of order)drawAv(id,AV[id]);}
  drawNight();
  /* astre du moment */
  cx.fillStyle=dayF>.5?'#fff0b0':'#dfe8ff';cx.beginPath();cx.arc(34,Hh-34,15,0,7);cx.fill();
  if(dayF<=.5){cx.fillStyle='rgba(6,9,26,.85)';cx.beginPath();cx.arc(40,Hh-38,13,0,7);cx.fill();}
  if(mine){drawMini();if(window.updateVoice)updateVoice();}
}
let lastT=performance.now();
(function frame(now){const dt=Math.min(.05,(now-lastT)/1000);lastT=now;update(dt);requestAnimationFrame(frame);})(lastT);

/* ===== Réseau (PeerJS), voix de proximité, interface ===== */
let roomCode='',askM=null,picks=[],seenRole=false;
const calls={},audio={};let actx=null,silentS=null;
const ac=()=>{if(!actx){actx=new(window.AudioContext||window.webkitAudioContext)();}if(actx.state==='suspended')actx.resume();return actx;};
const sendHost=m=>{if(me.host)onHost(me.id,m);else if(hostConn&&hostConn.open)hostConn.send(m);};
const genCode=()=>{const c='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';return Array.from({length:5},()=>c[Math.floor(Math.random()*c.length)]).join('');};
function micBtn(){const b=$('bmic');if(!myStream){b.textContent='Micro : indisponible';return;}const t=myStream.getAudioTracks()[0];b.textContent='Micro : '+(t.enabled?'activé':'coupé');}
$('bmic').onclick=()=>{if(!myStream)return;const t=myStream.getAudioTracks()[0];t.enabled=!t.enabled;micBtn();};
async function getMic(){
  ac();
  try{myStream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true}});}catch(e){myStream=null;}
  micBtn();
}
function wireCall(call){calls[call.peer]=call;call.on('stream',st=>attachStream(call.peer,st));call.on('close',()=>{delete calls[call.peer];});}
function attachStream(id,st){
  if(audio[id])return;
  const a=new Audio();a.srcObject=st;a.muted=true;a.play().catch(()=>{});
  const c=ac(),src=c.createMediaStreamSource(st),pan=c.createPanner(),gain=c.createGain();
  pan.panningModel='HRTF';pan.distanceModel='linear';pan.refDistance=2;pan.maxDistance=16;pan.rolloffFactor=1;
  gain.gain.value=0;src.connect(pan);pan.connect(gain);gain.connect(c.destination);audio[id]={a,pan,gain};
}
function connectVoice(){
  if(!peer||!peer.open)return;
  if(!silentS)silentS=ac().createMediaStreamDestination().stream;
  for(const id of V.order){
    if(id===me.id||V.players[id].bot||calls[id]||me.id>id)continue;
    wireCall(peer.call(id,myStream||silentS));
  }
}
function updateVoice(){
  if(!actx||!V.players[me.id])return;
  const L=actx.listener,fx=-Math.sin(camYaw),fz=-Math.cos(camYaw);
  if(L.positionX){L.positionX.value=LP.x;L.positionY.value=1.5;L.positionZ.value=LP.z;L.forwardX.value=fx;L.forwardY.value=0;L.forwardZ.value=fz;L.upX.value=0;L.upY.value=1;L.upZ.value=0;}
  else{L.setPosition(LP.x,1.5,LP.z);L.setOrientation(fx,0,fz,0,1,0);}
  const mp=V.players[me.id];
  for(const id in audio){
    const rp=V.players[id],A=audio[id],av=AV[id];if(!rp)continue;
    if(av)A.pan.setPosition(av.x,1.5,av.z);
    let g=1;
    if(V.phase==='end'||V.phase==='lobby')g=1;
    else if(!mp.alive)g=1;
    else if(!rp.alive)g=0;
    else if(V.phase==='night')g=(WOLF.includes(myRole)&&myTeam.includes(rp.name))?1:0;
    A.gain.gain.setTargetAtTime(g,actx.currentTime,.1);
  }
}
/* ----- hôte ----- */
function handleConn(c,m){
  if(m.t==='join'){
    if(G.phase!=='lobby'||G.order.length>=16){c.send({t:'err',text:'Partie complète ou déjà commencée.'});return;}
    conns[c.peer]=c;G.players[c.peer]={id:c.peer,name:String(m.name||'Joueur').slice(0,14),bot:false,alive:true};G.order.push(c.peer);pub();
  }else onHost(c.peer,m);
}
function dropPlayer(id){
  const p=G.players[id];if(!p)return;
  if(G.phase==='lobby'){delete G.players[id];G.order=G.order.filter(x=>x!==id);}
  else{p.bot=true;p.name+=' (déconnecté)';if(H.wait[id]){const r=H.wait[id];delete H.wait[id];r([]);}}
  delete conns[id];pub();
}
$('bcreate').onclick=async()=>{
  me.name=$('name').value.trim()||'Chef';$('jstat').textContent='Création de la partie…';await getMic();
  roomCode=genCode();peer=new Peer('lgv-'+roomCode);
  peer.on('open',id=>{me.id=id;me.host=true;G.code=roomCode;G.players[id]={id,name:me.name,bot:false,alive:true};G.order=[id];pub();$('jstat').textContent='';});
  peer.on('connection',c=>{c.on('data',m=>handleConn(c,m));c.on('close',()=>dropPlayer(c.peer));});
  peer.on('call',call=>{call.answer(myStream||silentS||ac().createMediaStreamDestination().stream);wireCall(call);});
  peer.on('error',e=>{$('jstat').textContent='Erreur réseau ('+e.type+'). Réessayez.';});
};
$('bjoin').onclick=async()=>{
  const code=$('code').value.trim().toUpperCase();if(code.length<5){$('jstat').textContent='Entrez le code à 5 caractères.';return;}
  me.name=$('name').value.trim()||'Joueur';$('jstat').textContent='Connexion…';await getMic();
  peer=new Peer();
  peer.on('open',id=>{
    me.id=id;hostConn=peer.connect('lgv-'+code,{reliable:true});
    hostConn.on('open',()=>hostConn.send({t:'join',name:me.name}));
    hostConn.on('data',onMsg);hostConn.on('close',()=>toast('Connexion à la partie perdue.','d'));
  });
  peer.on('call',call=>{call.answer(myStream||silentS||ac().createMediaStreamDestination().stream);wireCall(call);});
  peer.on('error',e=>{$('jstat').textContent=e.type==='peer-unavailable'?'Aucune partie avec ce code.':'Erreur réseau ('+e.type+').';});
};
function addBot(){
  const nm=['Alma','Basile','Colette','Dorian','Éloïse','Faustin','Gaëlle','Hugo','Iris','Jules','Lison','Marius','Nina','Oscar','Pauline','Quentin'];
  const n=G.order.filter(i=>G.players[i].bot).length,id='bot'+n+Math.random().toString(36).slice(2,5);
  G.players[id]={id,name:nm[n%nm.length]+' (bot)',bot:true,alive:true};G.order.push(id);pub();
}
$('bbot').onclick=addBot;
/* mode bots : la partie existe tout de suite, le nombre de bots se règle au curseur */
if(window.MODE==='bots'){
  me.id='solo';me.host=true;G.code='SOLO';G.hostId='solo';
  const rebuild=()=>{const k=+$('nbots').value;me.name=$('name').value.trim()||'Toi';
    G.players={solo:{id:'solo',name:me.name,bot:false,alive:true}};G.order=['solo'];for(let i=0;i<k;i++)addBot();
    $('nlabel').textContent=k+' bots';pub();};
  $('nbots').oninput=rebuild;$('name').oninput=rebuild;rebuild();
}
/* mode en ligne : lien d'invitation */
if(window.MODE==='online'){
  if(location.hash.length>=6)$('code').value=location.hash.slice(1,6).toUpperCase();
  $('binvite').onclick=()=>{const u=location.origin+location.pathname+'#'+V.code;
    (navigator.clipboard?navigator.clipboard.writeText(u):Promise.reject()).then(()=>$('jstat').textContent='Lien copié.',()=>{$('jstat').textContent=u;});};
}
/* les bots parlent pendant la discussion */
const SAY=['Je trouve {x} bien silencieux…','Moi, je soupçonne {x}.','Ce n’est pas moi, regardez plutôt {x} !','{x} a l’air nerveux ce matin.','On devrait voter {x}, non ?','Je suis un simple villageois, croyez-moi.'];
setInterval(()=>{
  if(!me.host||G.phase!=='day')return;
  const al=G.order.filter(i=>G.players[i].alive),bots=al.filter(i=>G.players[i].bot);if(bots.length<1||al.length<2)return;
  const b=bots[Math.floor(Math.random()*bots.length)],o=al.filter(i=>i!==b),x=G.players[o[Math.floor(Math.random()*o.length)]].name;
  say('💬 '+G.players[b].name+' : « '+SAY[Math.floor(Math.random()*SAY.length)].replace('{x}',x)+' »','');
},4000);
$('bstart').onclick=()=>{if(me.host)startGame();};
/* positions + bots (hôte), envoi position (clients) */
const BOT={};
setInterval(()=>{
  if(me.host){
    for(const id of G.order){const p=G.players[id];if(!p.bot)continue;
      const bt=BOT[id]||(BOT[id]=Object.assign(freeSpot([5,12]),{tx:0,tz:0,t:0}));
      bt.t-=.1;
      if(Math.hypot(bt.tx-bt.x,bt.tz-bt.z)<.6||bt.t<=0){
        const near=Math.random()<.55,a=Math.random()*6.28,r=near?6+Math.random()*7:10+Math.random()*34;
        bt.tx=Math.max(-55,Math.min(55,Math.cos(a)*r));bt.tz=Math.max(-37,Math.min(37,Math.sin(a)*r*.7));bt.t=5+Math.random()*6;}
      const dx=bt.tx-bt.x,dz=bt.tz-bt.z,l=Math.hypot(dx,dz)||1;bt.x+=dx/l*.38;bt.z+=dz/l*.38;collide(bt,.8);POS[id]={x:bt.x,z:bt.z,ry:0};}
    bcast({t:'pos',p:POS});
  }else if(hostConn&&hostConn.open&&POS[me.id]){hostConn.send({t:'pos',...POS[me.id]});}
},100);
/* ----- réception (tous) ----- */
function onMsg(m){
  if(m.t==='state'){V=m.G;VT=Date.now()+(V.secs||0)*1000;refreshUI();connectVoice();}
  else if(m.t==='pos'){for(const id in m.p)if(id!==me.id)POS[id]=m.p[id];}
  else if(m.t==='log')toast(m.text,m.cls);
  else if(m.t==='priv'){const prev=myRole;myRole=m.role;myTeam=m.team||[];if(!seenRole){seenRole=true;showRole();}else if(prev!==myRole)showRole();}
  else if(m.t==='ask')showAsk(m);
  else if(m.t==='askend'){$('panel').hidden=true;askM=null;}
  else if(m.t==='err'){$('jstat').textContent=m.text;}
  else if(m.t==='end'){$('endt').textContent=m.title;$('endd').textContent=m.text;$('endr').textContent=m.roles;$('endcard').hidden=false;}
}
function refreshUI(){
  const lob=V.phase==='lobby';$('lobby').hidden=!lob;$('hud').hidden=lob;
  if(lob)renderRoom();
  $('phase').textContent=V.label||'';
  const r=$('roster');r.innerHTML='';
  V.order.forEach(id=>{const p=V.players[id],d=document.createElement('div');if(!p.alive)d.className='dead';
    const dot=document.createElement('span');dot.className='dot'+(p.alive?' on':'');const t=document.createElement('span');t.textContent=p.name+(id===me.id?' (vous)':'');d.append(dot,t);r.appendChild(d);});
}
setInterval(()=>{const s=Math.max(0,Math.round((VT-Date.now())/1000));$('timer').textContent=V.secs?s+' s':'';},250);
/* ----- panneau d’action ----- */
function showAsk(m){
  askM=m;picks=[];$('ptitle').textContent=m.title;$('psub').textContent=m.sub;const box=$('opts');box.innerHTML='';
  m.opts.forEach(o=>{
    const b=document.createElement('button');b.textContent=o.name;
    b.onclick=()=>{
      if(m.kind==='yn'){answer([o.id]);return;}
      const i=picks.indexOf(o.id);if(i>=0)picks.splice(i,1);else{if(picks.length>=m.n)picks.shift();picks.push(o.id);}
      [...box.children].forEach((x,j)=>x.classList.toggle('sel',picks.includes(m.opts[j].id)));
    };box.appendChild(b);
  });
  $('pok').hidden=m.kind==='yn';$('pskip').textContent=m.kind==='yn'?'Passer':'Passer / m’abstenir';$('panel').hidden=false;
}
function answer(v){sendHost({t:'act',v});$('panel').hidden=true;askM=null;}
$('pok').onclick=()=>answer(picks);$('pskip').onclick=()=>answer([]);
/* ----- fiche de rôle ----- */
function showRole(){
  if(!myRole)return;const r=ROLES[myRole];
  $('rci').textContent=r.i;$('rcn').textContent=r.n;$('rcd').textContent=r.d;
  $('rcx').textContent='Camp : '+r.t+(myTeam.length?' · Les loups : '+myTeam.join(', '):'');
  $('rolecard').hidden=false;
}
$('brole').onclick=showRole;$('rcclose').onclick=()=>$('rolecard').hidden=true;
renderRoles();

if('serviceWorker' in navigator&&location.protocol.startsWith('http'))addEventListener('load',()=>navigator.serviceWorker.register('sw.js').catch(()=>{}));
