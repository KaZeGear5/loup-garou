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

renderRoles();
