/* ===================================================
   DEMOLITION MASTER — Complete Game Engine
   =================================================== */

// ── AUDIO ──────────────────────────────────────────
var AC = null;
function getAC() {
  if (!AC) { try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch(e){} }
  return AC;
}
function tone(freq, type, dur, vol, delay) {
  vol = vol||.2; delay = delay||0;
  try {
    var ac=getAC(); if(!ac) return;
    var o=ac.createOscillator(), g=ac.createGain();
    o.connect(g); g.connect(ac.destination);
    o.type=type; o.frequency.value=freq;
    g.gain.setValueAtTime(vol, ac.currentTime+delay);
    g.gain.exponentialRampToValueAtTime(.001, ac.currentTime+delay+dur);
    o.start(ac.currentTime+delay); o.stop(ac.currentTime+delay+dur+.05);
  } catch(e) {}
}
function sndExplosion() {
  try {
    var ac=getAC(); if(!ac) return;
    var n=Math.floor(ac.sampleRate*.45), buf=ac.createBuffer(1,n,ac.sampleRate), d=buf.getChannelData(0);
    for(var i=0;i<n;i++) d[i]=(Math.random()*2-1)*Math.pow(1-i/n,1.1);
    var src=ac.createBufferSource(); src.buffer=buf;
    var g=ac.createGain(); g.gain.setValueAtTime(.45,ac.currentTime); g.gain.exponentialRampToValueAtTime(.001,ac.currentTime+.5);
    var f=ac.createBiquadFilter(); f.type='lowpass'; f.frequency.value=650;
    src.connect(f); f.connect(g); g.connect(ac.destination); src.start();
  } catch(e) {}
}
function sndClick()  { tone(440,'square',.08,.12); tone(660,'square',.06,.08,.05); }
function sndPlace()  { tone(320,'sawtooth',.10,.15); tone(480,'sawtooth',.07,.10,.08); }
function sndRemove() { tone(220,'sawtooth',.08,.12); }
function sndWin()    { [440,550,660].forEach(function(f,i){ tone(f,'square',.18,.2,i*.18); }); }
function sndLose()   { tone(200,'sawtooth',.4,.2); tone(150,'sawtooth',.4,.16,.3); }

// ── DATA ───────────────────────────────────────────
var BOMBS = {
  c4:    {name:'C4',    r:88,  pw:5.5, col:'#ff4400', n:3},
  tnt:   {name:'TNT',  r:120, pw:3.2, col:'#ff8800', n:5},
  thermo:{name:'THERM',r:80,  pw:6.5, col:'#00ccff', n:2},
  emp:   {name:'EMP',  r:165, pw:2.2, col:'#9900ee', n:2, chain:true},
  mega:  {name:'MEGA', r:215, pw:9.8, col:'#ffcc00', n:1}
};

var MATS = {
  wood:    {hp:2, c:'#c8883a',s:'#8b5a1e',hi:'#e8b06a',lo:'#664010'},
  brick:   {hp:4, c:'#cc4422',s:'#881800',hi:'#ee7755',lo:'#550d00'},
  concrete:{hp:7, c:'#8899aa',s:'#556677',hi:'#aabbd0',lo:'#334455'},
  steel:   {hp:10,c:'#6688aa',s:'#445566',hi:'#88aacc',lo:'#223344'},
  glass:   {hp:1, c:'#88ddee',s:'#55aabb',hi:'#bbeefc',lo:'#226677'},
  rebar:   {hp:12,c:'#667766',s:'#445544',hi:'#889988',lo:'#223322'},
  yellow:  {hp:4, c:'#eebb22',s:'#aa7700',hi:'#ffdd66',lo:'#885500'}
};

var LEVELS = [
  {id:1,name:'Houten Huis',   target:60,col:'#ff6b35',layout:'house',      diff:1},
  {id:2,name:'Kantoorblok',   target:65,col:'#ff8c00',layout:'office',     diff:2},
  {id:3,name:'Watertoren',    target:70,col:'#aa00ff',layout:'tower',      diff:2},
  {id:4,name:'Fabriek',       target:70,col:'#ff2222',layout:'factory',    diff:3},
  {id:5,name:'Wolkenkrabber', target:55,col:'#ffdd00',layout:'skyscraper', diff:4},
  {id:6,name:'Brug',          target:80,col:'#00cc66',layout:'bridge',     diff:3},
  {id:7,name:'Silo\'s',       target:75,col:'#ff6a00',layout:'silos',      diff:4},
  {id:8,name:'Megastructuur', target:50,col:'#ee0000',layout:'mega',       diff:5}
];

// ── STATE ──────────────────────────────────────────
var GS = {
  canvas:null, ctx:null,
  level:null, blocks:[], placed:[], particles:[], debris:[],
  score:0, running:false, detonating:false, pct:0,
  selected:'c4', counts:{}, raf:null, paused:false, shake:0, cloudT:0
};
var menuRaf = null;
var lastTouch = 0;
var highScores = JSON.parse(localStorage.getItem('dm_hs')||'[]');
var doneLevels = JSON.parse(localStorage.getItem('dm_done')||'[]');

// ── LEVEL BUILDER ──────────────────────────────────
var GND = 70;

function buildLevel(layout, W, H) {
  var g=H-GND, blks=[], bw=30, bh=22, id=0;
  function add(x,y,w,h,mat,str) {
    blks.push({x:x,y:y,w:w,h:h,mat:mat,str:!!str,
      hp:MATS[mat].hp,max:MATS[mat].hp,
      vx:0,vy:0,ang:0,av:0,dead:false,fall:false,id:id++});
  }
  if (layout==='house') {
    var ox=W/2-4*bw;
    for(var i=0;i<8;i++) add(ox+i*bw,g-bh,bw,bh,'brick',1);
    for(var r=1;r<=5;r++){add(ox,g-bh*(r+1),bw,bh,r<=2?'brick':'wood',r<=2);add(ox+7*bw,g-bh*(r+1),bw,bh,r<=2?'brick':'wood',r<=2);}
    for(var r=1;r<=3;r++) for(var i=1;i<7;i++) add(ox+i*bw,g-bh*(r+1),bw,bh,'wood');
    for(var i=0;i<8;i++) add(ox+i*bw,g-bh*6,bw,10,'yellow');
    for(var r=0;r<3;r++) add(ox+6*bw,g-bh*6-bh*(r+1),bw,bh,'brick');
    for(var r=0;r<2;r++) for(var i=1;i<3;i++) add(ox+i*bw,g-bh*(r+4),bw,bh,'glass');
  }
  else if (layout==='office') {
    var ox=W/2-5*bw;
    for(var f=0;f<5;f++){
      for(var c=0;c<=9;c++){var m=(c===0||c===9)?'concrete':(f%2===0?'yellow':'glass');add(ox+c*bw,g-bh*(f*3+1),bw,bh,m,c===0||c===9);if(c<9)add(ox+c*bw,g-bh*(f*3+2),bw,bh,'glass');}
      for(var c=0;c<9;c++) add(ox+c*bw,g-bh*(f*3+3),bw,9,'concrete',1);
    }
  }
  else if (layout==='tower') {
    var cx=W/2;
    for(var i=0;i<6;i++) add(cx-3*bw+i*bw,g-bh,bw,bh,'concrete',1);
    for(var r=1;r<=12;r++){var sh=Math.min(r*3,24);add(cx-3*bw+sh,g-bh*(r+1),bw,bh*2,'steel',1);add(cx+2*bw-sh,g-bh*(r+1),bw,bh*2,'steel',1);if(r<=4)add(cx-bw,g-bh*(r+1),bw*2,9,'concrete');}
    for(var i=0;i<4;i++) add(cx-2*bw+i*bw,g-bh*15,bw,bh*3,'steel');
  }
  else if (layout==='factory') {
    var ox=W/2-5*bw;
    for(var i=0;i<10;i++) add(ox+i*bw,g-bh,bw,bh,'concrete',1);
    for(var f=0;f<3;f++){
      for(var i=0;i<10;i++){var m=(i===0||i===9)?'rebar':(f===1?'brick':'steel');add(ox+i*bw,g-bh*(f*3+2),bw,bh,m,i===0||i===9);}
      for(var i=0;i<10;i++) add(ox+i*bw,g-bh*(f*3+3),bw,9,'concrete',1);
    }
    for(var c=0;c<3;c++) for(var r=0;r<5;r++) add(ox+(c*3+1)*bw,g-bh*(11+r),bw,bh,'brick');
  }
  else if (layout==='skyscraper') {
    var cx=W/2;
    for(var f=0;f<14;f++){
      var ww=Math.max(3,5-Math.floor(f/4));
      for(var i=0;i<ww*2;i++) add(cx-ww*bw+i*bw,g-bh*(f*3+1),bw,bh,(i===0||i===ww*2-1)?'steel':(f%3===0?'concrete':'glass'),i===0||i===ww*2-1);
      for(var i=0;i<ww*2;i++) add(cx-ww*bw+i*bw,g-bh*(f*3+3),bw,7,'concrete',1);
    }
  }
  else if (layout==='bridge') {
    var ox=W/2-130;
    for(var i=0;i<13;i++) add(ox+i*20,g-bh*4,20,9,'steel',1);
    [2,10].forEach(function(p){for(var r=0;r<6;r++) add(ox+p*20,g-bh*(r+1),bw,bh,'concrete',1);});
    for(var i=0;i<5;i++){add(ox+60+i*20,g-bh*5,20,8,'steel');add(ox+160-i*20,g-bh*5,20,8,'steel');}
    for(var i=0;i<13;i++){add(ox+i*20,g-bh*5,20,9,'brick');add(ox+i*20,g-bh*3,20,9,'brick');}
  }
  else if (layout==='silos') {
    for(var s=0;s<3;s++){var cx=W/2+(s-1)*100;for(var r=0;r<10;r++) for(var i=0;i<4;i++) add(cx-2*bw+i*bw,g-bh*(r+1),bw,bh,'concrete',r<3);for(var i=0;i<4;i++) add(cx-2*bw+i*bw,g-bh*11,bw,9,'steel');}
    for(var s=0;s<2;s++){var cx=W/2+(s-.5)*100;for(var hh=3;hh<6;hh++) add(cx-10,g-bh*hh,20,9,'steel');}
  }
  else if (layout==='mega') {
    var ox=W/2-7*bw, hs=[8,12,10,9];
    for(var t=0;t<4;t++){var tx=ox+t*3.5*bw;for(var f=0;f<hs[t];f++){for(var i=0;i<3;i++){add(tx+i*bw*2,g-bh*(f*2+1),bw*2,bh,f%3===0?'rebar':'steel',i===0||i===2);add(tx+i*bw*2,g-bh*(f*2+2),bw*2,9,'concrete',1);}}}
    for(var i=0;i<13;i++) add(ox+i*bw,g-bh,bw,bh,'rebar',1);
  }
  return blks;
}

// ── SCREENS ────────────────────────────────────────
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(function(s){s.classList.remove('active');});
  document.getElementById('screen-'+id).classList.add('active');
}
function showMenu() {
  stopGame(); stopMenuAnim();
  showScreen('menu'); startMenuAnim();
}
function showLevelSelect() {
  stopMenuAnim(); stopGame();
  showScreen('levels'); renderLevels();
}
function showHowTo()      { stopMenuAnim(); stopGame(); showScreen('howto'); }
function showHighScores() { stopMenuAnim(); stopGame(); showScreen('scores'); renderScores(); }

// ── TOAST ──────────────────────────────────────────
var toastT = null;
function toast(msg) {
  var el=document.getElementById('toast');
  el.textContent=msg; el.classList.add('show');
  clearTimeout(toastT);
  toastT = setTimeout(function(){el.classList.remove('show');},1800);
}

// ── RENDER LEVELS ──────────────────────────────────
function renderLevels() {
  var g=document.getElementById('levels-grid'); g.innerHTML='';
  LEVELS.forEach(function(lvl,i){
    var unlocked=(i===0)||(doneLevels.indexOf(lvl.id-1)>=0);
    var done=doneLevels.indexOf(lvl.id)>=0;
    var d=document.createElement('div');
    d.className='lcard'+(done?' done':''); if(!unlocked) d.classList.add('locked');
    d.style.setProperty('--lc',lvl.col);
    var dots=''; for(var j=0;j<5;j++) dots+='<span class="'+(j<lvl.diff?'on':'')+'"></span>';
    d.innerHTML='<div class="lcard-num">'+lvl.id+'</div><div class="lcard-name">'+lvl.name+'</div><div class="lcard-target">DOEL: '+lvl.target+'%</div><div class="lcard-diff">'+dots+'</div>';
    if(unlocked){ (function(l){d.onclick=function(){sndClick();startLevel(l);};})(lvl); }
    g.appendChild(d);
  });
}
function renderScores() {
  var el=document.getElementById('scores-list');
  if(!highScores.length){el.innerHTML='<div style="text-align:center;padding:40px;color:#889;font-size:14px">Nog geen scores!<br/>Speel een level!</div>';return;}
  el.innerHTML=highScores.slice().sort(function(a,b){return b.score-a.score;}).slice(0,10).map(function(s,i){
    return '<div class="srow"><div class="srank '+(i===0?'r1':i===1?'r2':i===2?'r3':'')+'">'+(i+1)+'</div><div class="sinfo"><div class="slevel">Level '+s.level+' — '+s.name+'</div><div class="spts">'+s.score.toLocaleString()+'</div></div></div>';
  }).join('');
}

// ── GAME START/STOP ────────────────────────────────
function startLevel(lvl) {
  GS.level=lvl; GS.placed=[]; GS.particles=[]; GS.debris=[];
  GS.score=0; GS.detonating=false; GS.pct=0; GS.running=true; GS.paused=false; GS.shake=0;
  GS.counts={}; Object.keys(BOMBS).forEach(function(k){GS.counts[k]=BOMBS[k].n;});
  GS.selected='c4';
  showScreen('game');
  GS.canvas=document.getElementById('game-canvas');
  GS.ctx=GS.canvas.getContext('2d');
  resizeCv();
  GS.blocks=buildLevel(lvl.layout,GS.canvas.width,GS.canvas.height);
  document.getElementById('hud-lvl-num').textContent='LEVEL '+lvl.id;
  document.getElementById('hud-lvl-name').textContent=lvl.name;
  document.getElementById('dest-target').style.left=lvl.target+'%';
  buildToolbar(); updateHUD(); updateDetBtn();
  GS.canvas.removeEventListener('click',onCvClick);
  GS.canvas.removeEventListener('touchend',onCvTouch);
  GS.canvas.addEventListener('click',onCvClick);
  GS.canvas.addEventListener('touchend',onCvTouch,{passive:false});
  if(GS.raf) cancelAnimationFrame(GS.raf);
  gameLoop();
}
function stopGame() {
  GS.running=false; GS.paused=false;
  if(GS.raf){cancelAnimationFrame(GS.raf);GS.raf=null;}
  var c=document.getElementById('game-canvas');
  if(c){c.removeEventListener('click',onCvClick);c.removeEventListener('touchend',onCvTouch);}
}
function resizeCv() {
  if(!GS.canvas) return;
  GS.canvas.width=GS.canvas.parentElement.clientWidth||window.innerWidth;
  GS.canvas.height=GS.canvas.parentElement.clientHeight||(window.innerHeight-200);
}
function togglePause() {
  if(!GS.running) return;
  GS.paused=!GS.paused;
  document.getElementById('pause-modal').classList.toggle('show',GS.paused);
  if(!GS.paused) gameLoop();
}
function closePause() {
  GS.paused=false;
  document.getElementById('pause-modal').classList.remove('show');
}

// ── TOOLBAR ────────────────────────────────────────
function buildToolbar() {
  var el=document.getElementById('bomb-slots'); el.innerHTML='';
  Object.keys(BOMBS).forEach(function(key){
    var def=BOMBS[key];
    var wrap=document.createElement('div'); wrap.className='crate'; wrap.dataset.type=key;
    var box=document.createElement('div'); box.className='crate-box'+(key===GS.selected?' sel':'');
    var iw=document.createElement('div'); iw.className='crate-icon';
    var mc=document.createElement('canvas'); mc.width=36; mc.height=38; iw.appendChild(mc);
    var cnt=document.createElement('div'); cnt.className='crate-cnt'; cnt.id='cnt-'+key; cnt.textContent='x'+GS.counts[key];
    var lbl=document.createElement('div'); lbl.className='crate-lbl'; lbl.textContent=def.name;
    box.appendChild(iw); box.appendChild(cnt); box.appendChild(lbl);
    wrap.appendChild(box);
    (function(k){wrap.onclick=function(){pickBomb(k);};})(key);
    el.appendChild(wrap);
    (function(m2,k){requestAnimationFrame(function(){drawBombIcon(m2.getContext('2d'),18,20,k);});})(mc,key);
  });
}
function pickBomb(type) {
  if(GS.counts[type]<=0){toast('Geen '+BOMBS[type].name+' meer!');return;}
  GS.selected=type; sndClick();
  document.querySelectorAll('.crate').forEach(function(c){c.querySelector('.crate-box').classList.toggle('sel',c.dataset.type===type);});
}
function refreshCounts() {
  Object.keys(BOMBS).forEach(function(k){
    var el=document.getElementById('cnt-'+k); if(el) el.textContent='x'+GS.counts[k];
    var cr=document.querySelector('.crate[data-type="'+k+'"]');
    if(cr) cr.querySelector('.crate-box').classList.toggle('empty',GS.counts[k]<=0);
  });
}

// ── INPUT ──────────────────────────────────────────
function onCvClick(e) {
  if(Date.now()-lastTouch<400) return;
  if(GS.detonating||GS.paused) return;
  var r=GS.canvas.getBoundingClientRect();
  doPlace(e.clientX-r.left,e.clientY-r.top);
}
function onCvTouch(e) {
  e.preventDefault(); lastTouch=Date.now();
  if(GS.detonating||GS.paused) return;
  var r=GS.canvas.getBoundingClientRect(), t=e.changedTouches[0];
  doPlace(t.clientX-r.left,t.clientY-r.top);
}
function doPlace(px,py) {
  var hit=blockAt(px,py); if(!hit||hit.dead) return;
  // toggle: remove if already placed
  for(var i=0;i<GS.placed.length;i++) {
    if(GS.placed[i].bid===hit.id) {
      var rem=GS.placed.splice(i,1)[0];
      GS.counts[rem.type]++; refreshCounts(); updateDetBtn(); sndRemove(); return;
    }
  }
  if(GS.counts[GS.selected]<=0){toast('Geen '+BOMBS[GS.selected].name+' meer!');return;}
  GS.placed.push({x:hit.x+hit.w/2,y:hit.y+hit.h/2,bid:hit.id,type:GS.selected,done:false});
  GS.counts[GS.selected]--; refreshCounts(); updateDetBtn(); sndPlace(); fxClick(px,py);
}
function blockAt(px,py) {
  for(var i=0;i<GS.blocks.length;i++){var b=GS.blocks[i];if(b.dead||b.fall)continue;if(px>=b.x&&px<=b.x+b.w&&py>=b.y&&py<=b.y+b.h)return b;}
  return null;
}

// ── DETONATE ───────────────────────────────────────
function detonate() {
  if(!GS.placed.length||GS.detonating) return;
  GS.detonating=true;
  var fl=document.createElement('div'); fl.className='flash'; document.body.appendChild(fl);
  setTimeout(function(){if(fl.parentNode)fl.parentNode.removeChild(fl);},600);
  var maxD=0;
  GS.placed.forEach(function(bomb,i){
    var d=i*160; maxD=Math.max(maxD,d);
    (function(b){setTimeout(function(){explode(b);},d);})(bomb);
  });
  setTimeout(function(){
    calcPct(); GS.detonating=false; GS.placed=[];
    // auto-pick first available bomb
    if(GS.counts[GS.selected]<=0){var ks=Object.keys(BOMBS);for(var i=0;i<ks.length;i++){if(GS.counts[ks[i]]>0){GS.selected=ks[i];break;}}}
    refreshCounts(); updateDetBtn(); checkWin();
  }, maxD+1800);
}
function explode(bomb) {
  if(bomb.done) return; bomb.done=true;
  var def=BOMBS[bomb.type], bx=bomb.x, by=bomb.y;
  GS.shake=Math.max(GS.shake,def.pw*4.5);
  fxExplode(bx,by,def); sndExplosion();
  GS.blocks.forEach(function(b){
    if(b.dead) return;
    var cx=b.x+b.w/2, cy=b.y+b.h/2, dist=Math.hypot(cx-bx,cy-by);
    if(dist<def.r){
      var dmg=def.pw*(1-dist/def.r); b.hp-=dmg;
      if(b.hp<=0){b.dead=true;b.hp=0;fxDebris(b);GS.score+=Math.floor(MATS[b.mat].hp*88+55);}
      else{var a=Math.atan2(cy-by,cx-bx),f=def.pw*(1-dist/def.r)*10;b.vx+=Math.cos(a)*f;b.vy+=Math.sin(a)*f-3;b.fall=true;b.av=(Math.random()-.5)*.28*def.pw;}
    }
  });
  if(def.chain){
    GS.placed.forEach(function(o){
      if(o!==bomb&&!o.done&&Math.hypot(o.x-bx,o.y-by)<def.r*1.5)
        setTimeout(function(){explode(o);},230);
    });
  }
}
function calcPct() {
  var d=0; GS.blocks.forEach(function(b){if(b.dead)d++;});
  GS.pct=Math.round(d/GS.blocks.length*100); updateHUD();
}

// ── PHYSICS ────────────────────────────────────────
function fxDebris(b) {
  for(var i=0;i<8+Math.floor(Math.random()*6);i++)
    GS.debris.push({x:b.x+Math.random()*b.w,y:b.y+Math.random()*b.h,vx:(Math.random()-.5)*12,vy:-Math.random()*14,w:5+Math.random()*13,h:4+Math.random()*9,ang:Math.random()*Math.PI*2,av:(Math.random()-.5)*.38,c:MATS[b.mat].c,hi:MATS[b.mat].hi,a:1,life:1});
}
function updDebris() {
  var g=GS.canvas.height-GND;
  GS.debris.forEach(function(d){d.vy+=.47;d.x+=d.vx;d.y+=d.vy;d.ang+=d.av;d.vx*=.97;if(d.y>=g){d.y=g;d.vy*=-.28;d.vx*=.8;}d.life-=.005;d.a=d.life;});
  GS.debris=GS.debris.filter(function(d){return d.life>0;}); if(GS.debris.length>400)GS.debris.length=300;
}
function updBlocks() {
  var g=GS.canvas.height-GND;
  GS.blocks.forEach(function(b){
    if(!b.fall||b.dead)return;
    b.vy+=.52;b.x+=b.vx;b.y+=b.vy;b.ang+=b.av;b.vx*=.97;b.av*=.97;
    if(b.y+b.h>=g){b.y=g-b.h;b.vy*=-.2;b.vx*=.7;b.av*=.5;if(Math.abs(b.vy)<1){b.vy=0;b.fall=false;}}
  });
}
function fxExplode(x,y,def) {
  var cols=[def.col,'#ffdd00','#ff8800','#fff','#ffaa44','#ff4400'];
  for(var i=0;i<80+def.pw*14;i++){var a=Math.random()*Math.PI*2,s=3+Math.random()*def.pw*2.8;GS.particles.push({x:x,y:y,vx:Math.cos(a)*s,vy:Math.sin(a)*s-Math.random()*6,sz:3+Math.random()*10,col:cols[Math.floor(Math.random()*cols.length)],a:1,life:1,dec:.013+Math.random()*.022,type:'e',glow:def.col});}
  for(var i=0;i<28;i++) GS.particles.push({x:x+(Math.random()-.5)*28,y:y+(Math.random()-.5)*28,vx:(Math.random()-.5)*2,vy:-1.8-Math.random()*3.5,sz:22+Math.random()*36,col:'smoke',a:.5,life:1,dec:.006,type:'s',glow:null});
  for(var i=0;i<24;i++){var a=(i/24)*Math.PI*2;GS.particles.push({x:x,y:y,vx:Math.cos(a)*3.5,vy:Math.sin(a)*3.5,sz:10+Math.random()*15,col:'fire',a:.95,life:1,dec:.02,type:'f',glow:'#ff6600'});}
}
function fxClick(x,y) {
  var def=BOMBS[GS.selected];
  for(var i=0;i<14;i++){var a=Math.random()*Math.PI*2;GS.particles.push({x:x,y:y,vx:Math.cos(a)*4.5,vy:Math.sin(a)*4.5,sz:3+Math.random()*5,col:def.col,a:1,life:1,dec:.05,type:'e',glow:def.col});}
}
function updParticles() {
  GS.particles.forEach(function(p){p.x+=p.vx;p.y+=p.vy;if(p.type!=='s')p.vy+=.23;p.vx*=.97;p.life-=p.dec;p.a=p.life;if(p.type==='s'){p.sz+=.4;p.a=p.life*.3;}});
  GS.particles=GS.particles.filter(function(p){return p.life>0;}); if(GS.particles.length>1000)GS.particles.length=900;
}

// ── HUD ────────────────────────────────────────────
function updateHUD() {
  document.getElementById('hud-score').textContent=GS.score.toLocaleString();
  document.getElementById('dest-fill').style.width=Math.min(GS.pct,100)+'%';
  document.getElementById('dest-pct').textContent=GS.pct+'%';
}
function updateDetBtn() {
  var n=GS.placed.length;
  document.getElementById('det-btn').disabled=n===0;
  document.getElementById('det-count').textContent=n+' bom'+(n===1?'':'men');
}

// ── WIN CHECK ──────────────────────────────────────
function checkWin() {
  var won=GS.pct>=GS.level.target, extra=GS.pct-GS.level.target;
  var stars=won?(extra>=20?3:extra>=10?2:1):0;
  if(won){
    if(doneLevels.indexOf(GS.level.id)<0) doneLevels.push(GS.level.id);
    localStorage.setItem('dm_done',JSON.stringify(doneLevels));
    highScores.push({level:GS.level.id,name:GS.level.name,score:GS.score});
    localStorage.setItem('dm_hs',JSON.stringify(highScores));
    sndWin();
  } else { sndLose(); }
  var sh=''; for(var i=0;i<stars;i++) sh+='&#11088;'; for(var i=0;i<3-stars;i++) sh+='&#9734;';
  var nxt=GS.level.id; // 1-based; LEVELS[nxt] = next level (0-based array)
  setTimeout(function(){
    var box=document.getElementById('res-box');
    box.innerHTML=
      '<div class="res-title '+(won?'win':'lose')+'">'+(won?'GESLOOPT! &#127881;':'MISLUKT &#128165;')+'</div>'+
      '<div class="res-stars">'+sh+'</div>'+
      '<div class="res-stats">'+
        '<div class="res-stat"><span class="res-stat-lbl">VERNIELING</span><span class="res-stat-val">'+GS.pct+'%</span></div>'+
        '<div class="res-stat"><span class="res-stat-lbl">DOEL</span><span class="res-stat-val">'+GS.level.target+'%</span></div>'+
        '<div class="res-stat"><span class="res-stat-lbl">SCORE</span><span class="res-stat-val">'+GS.score.toLocaleString()+'</span></div>'+
      '</div>'+
      '<div class="res-btns">'+
        (won&&nxt<LEVELS.length?'<button class="rbtn rbtn-p" onclick="startLevel(LEVELS['+nxt+'])">VOLGENDE &#9654;</button>':'')+
        '<button class="rbtn rbtn-p" onclick="startLevel(GS.level)">OPNIEUW &#8634;</button>'+
        '<button class="rbtn rbtn-s" onclick="showLevelSelect()">LEVELS &#128203;</button>'+
        '<button class="rbtn rbtn-s" onclick="showMenu()">MENU &#127968;</button>'+
      '</div>';
    showScreen('result');
  },900);
}

// ── DRAW ───────────────────────────────────────────
function drawBombIcon(c,x,y,type) {
  c.save(); c.translate(x,y);
  var r=12;
  var gm={c4:['#ff9966','#dd2200','#880000'],tnt:['#ffee66','#ff8800','#aa4400'],thermo:['#aaf0ff','#00aaee','#003399'],emp:['#ee88ff','#aa00ee','#440088'],mega:['#ffffaa','#ffdd00','#ff4400','#880000']};
  var gc=c.createRadialGradient(-3,-3,1,0,0,r), cs=gm[type];
  for(var i=0;i<cs.length;i++) gc.addColorStop(i/(cs.length-1),cs[i]);
  c.fillStyle=gc; c.beginPath(); c.arc(0,0,r,0,Math.PI*2); c.fill();
  c.strokeStyle='rgba(0,0,0,.3)'; c.lineWidth=1.5; c.stroke();
  c.fillStyle='rgba(255,255,255,.35)'; c.beginPath(); c.ellipse(-3,-4,4,2.5,-.5,0,Math.PI*2); c.fill();
  c.strokeStyle='#aa7700'; c.lineWidth=2; c.lineCap='round';
  c.beginPath(); c.moveTo(2,-r); c.bezierCurveTo(7,-r-6,12,-r-2,10,-r-12); c.stroke();
  c.shadowColor='#ffff00'; c.shadowBlur=7;
  c.fillStyle='#ffe800'; c.beginPath(); c.arc(10,-r-12,3,0,Math.PI*2); c.fill();
  c.fillStyle='#fff'; c.beginPath(); c.arc(10,-r-12,1.5,0,Math.PI*2); c.fill();
  c.shadowBlur=0; c.restore();
}

function drawBlock(ctx,x,y,w,h,mat,ratio) {
  var m=MATS[mat], dmg=1-ratio;
  ctx.fillStyle=lerpc(m.c,'#2a1a0a',dmg*.5); ctx.fillRect(x,y,w,h);
  ctx.fillStyle=lerpc(m.hi,'#2a1a0a',dmg*.4); ctx.fillRect(x,y,w,4);
  ctx.fillStyle='rgba(255,255,255,.18)'; ctx.fillRect(x,y,3,h);
  ctx.fillStyle=lerpc(m.lo,'#000',dmg*.3); ctx.fillRect(x,y+h-4,w,4);
  ctx.fillStyle='rgba(0,0,0,.18)'; ctx.fillRect(x+w-3,y,3,h);
  ctx.strokeStyle=m.s; ctx.lineWidth=1.5; ctx.strokeRect(x,y,w,h);
  if(mat==='brick'||mat==='yellow'){
    ctx.strokeStyle='rgba(0,0,0,.09)'; ctx.lineWidth=.8;
    ctx.beginPath(); ctx.moveTo(x,y+h/2); ctx.lineTo(x+w,y+h/2); ctx.stroke();
    if(w>22){ctx.beginPath();ctx.moveTo(x+w*.33,y);ctx.lineTo(x+w*.33,y+h/2);ctx.stroke();ctx.beginPath();ctx.moveTo(x+w*.66,y+h/2);ctx.lineTo(x+w*.66,y+h);ctx.stroke();}
  }
  if(mat==='glass'){ctx.fillStyle='rgba(180,240,255,.28)';ctx.fillRect(x+3,y+3,w-6,h-6);ctx.strokeStyle='rgba(255,255,255,.5)';ctx.lineWidth=.8;ctx.beginPath();ctx.moveTo(x+5,y+4);ctx.lineTo(x+w-5,y+4);ctx.stroke();}
  if(mat==='steel'||mat==='rebar'){ctx.strokeStyle='rgba(255,255,255,.06)';ctx.lineWidth=.7;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+w,y+h);ctx.stroke();ctx.beginPath();ctx.moveTo(x+w,y);ctx.lineTo(x,y+h);ctx.stroke();}
  if(dmg>.3){ctx.strokeStyle='rgba(0,0,0,.55)';ctx.lineWidth=.8;ctx.beginPath();ctx.moveTo(x+w*.3+Math.sin(x+y)*4,y);ctx.lineTo(x+w*.48,y+h*.55);ctx.lineTo(x+w*.22,y+h);ctx.stroke();if(dmg>.6){ctx.beginPath();ctx.moveTo(x+w*.7,y);ctx.lineTo(x+w*.55,y+h*.45);ctx.lineTo(x+w*.78,y+h);ctx.stroke();}}
}

function lerpc(c1,c2,t) {
  t=Math.max(0,Math.min(1,t));
  var r1=parseInt(c1.slice(1,3),16),g1=parseInt(c1.slice(3,5),16),b1=parseInt(c1.slice(5,7),16);
  var r2=parseInt(c2.slice(1,3),16),g2=parseInt(c2.slice(3,5),16),b2=parseInt(c2.slice(5,7),16);
  return'rgb('+Math.round(r1+(r2-r1)*t)+','+Math.round(g1+(g2-g1)*t)+','+Math.round(b1+(b2-b1)*t)+')';
}

// ── SCENE ──────────────────────────────────────────
function drawScene(ctx,W,H) {
  var sky=ctx.createLinearGradient(0,0,0,H);
  sky.addColorStop(0,'#4ab0f0'); sky.addColorStop(.45,'#7ac8ee'); sky.addColorStop(.72,'#a8dff5'); sky.addColorStop(.88,'#c0eebb');
  ctx.fillStyle=sky; ctx.fillRect(0,0,W,H);
  // sun
  ctx.save(); ctx.shadowColor='rgba(255,220,80,.6)'; ctx.shadowBlur=30;
  ctx.fillStyle='#ffe870'; ctx.beginPath(); ctx.arc(W*.88,H*.1,26,0,Math.PI*2); ctx.fill();
  ctx.fillStyle='#fff8aa'; ctx.beginPath(); ctx.arc(W*.88,H*.1,20,0,Math.PI*2); ctx.fill();
  ctx.restore();
  // clouds
  var t=GS.cloudT||0;
  cloud(ctx,(W*.12+t*55)%W,H*.09,145,54,'rgba(255,255,255,.92)');
  cloud(ctx,(W*.44+t*32)%W,H*.16,105,42,'rgba(255,255,255,.85)');
  cloud(ctx,(W*.73+t*44)%W,H*.07,125,48,'rgba(255,255,255,.9)');
  cloud(ctx,(W*.90+t*22)%W,H*.20, 80,32,'rgba(255,255,255,.78)');
  // mountains
  mtns(ctx,W,H);
  // trees back/front
  trees(ctx,W,H,.72,'#3a7a3a','#4a9a4a');
  trees(ctx,W,H,1.05,'#2a6a2a','#3a8a3a');
  // dashed line
  ctx.setLineDash([13,8]); ctx.strokeStyle='rgba(255,255,255,.7)'; ctx.lineWidth=2.5;
  ctx.beginPath(); ctx.moveTo(0,H*.52); ctx.lineTo(W,H*.52); ctx.stroke(); ctx.setLineDash([]);
  // ground
  var gy=H-GND;
  ctx.fillStyle='#3d9428'; ctx.fillRect(0,gy,W,H-gy);
  ctx.fillStyle='#4db535'; ctx.fillRect(0,gy,W,10);
  ctx.fillStyle='#2a7018'; ctx.fillRect(0,gy+10,W,8);
  ctx.fillStyle='rgba(0,0,0,.07)'; ctx.fillRect(0,gy,W,4);
  // flowers
  var fc=['#ff6699','#ffee44','#ff9933','#bb44ff','#ff5588','#44ddff'];
  for(var i=0;i<Math.floor(W/30);i++){var fx=(i*31+17)%W;ctx.fillStyle='#3a8a20';ctx.fillRect(fx-1,gy-10,2,8);ctx.fillStyle=fc[i%fc.length];ctx.beginPath();ctx.arc(fx,gy-11,3.5,0,Math.PI*2);ctx.fill();}
}
function cloud(ctx,x,y,w,h,col) {
  ctx.save(); ctx.fillStyle=col; var r=h*.52;
  ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.arc(x+w*.22,y-h*.25,r*.82,0,Math.PI*2);ctx.arc(x+w*.48,y-h*.12,r,0,Math.PI*2);ctx.arc(x+w*.72,y+h*.08,r*.75,0,Math.PI*2);ctx.arc(x+w,y,r*.65,0,Math.PI*2);ctx.fill();
  ctx.fillRect(x-r,y,w+r*2,r); ctx.restore();
}
function mtns(ctx,W,H) {
  var pts=[.06,.24,.15,.38,.30,.16,.45,.33,.58,.12,.70,.28,.83,.17,.95,.30,1,.22];
  ctx.fillStyle='#8ab898'; ctx.beginPath(); ctx.moveTo(0,H*.5);
  for(var i=0;i<pts.length;i+=2) ctx.lineTo(W*pts[i],H*pts[i+1]);
  ctx.lineTo(W,H*.5); ctx.closePath(); ctx.fill();
  ctx.fillStyle='rgba(255,255,255,.72)';
  [[.30,.16,.09],[.58,.12,.11],[.83,.17,.08]].forEach(function(c){var mx=W*c[0],my=H*c[1],mw=W*c[2];ctx.beginPath();ctx.moveTo(mx,my);ctx.lineTo(mx-mw*.4,my+mw*.28);ctx.lineTo(mx+mw*.4,my+mw*.28);ctx.closePath();ctx.fill();});
}
function trees(ctx,W,H,scl,dk,md) {
  var gy=H-GND, pos=[.04,.09,.15,.82,.88,.93,.97,.02,.70];
  pos.forEach(function(xf,i){
    var tx=xf*W, th=(62+Math.sin(i*5.3)*20)*scl, tw=(42+Math.sin(i*2.9)*15)*scl;
    ctx.fillStyle='#6b4423'; ctx.fillRect(tx-4*scl,gy-th*.28,8*scl,th*.28+2);
    [dk,md,dk].forEach(function(lc,l){
      ctx.fillStyle=lc; var ly=gy-th*.25-l*th*.25, lw=tw*(1-l*.22);
      ctx.beginPath(); ctx.moveTo(tx,ly-th*.32); ctx.lineTo(tx-lw/2,ly); ctx.lineTo(tx+lw/2,ly); ctx.closePath(); ctx.fill();
    });
  });
}

// ── RENDER ─────────────────────────────────────────
function render() {
  var cv=GS.canvas, ctx=GS.ctx;
  if(!cv||!ctx) return;
  var W=cv.width, H=cv.height;
  ctx.clearRect(0,0,W,H);
  var sx=0,sy=0;
  if(GS.shake>.1){sx=(Math.random()-.5)*GS.shake;sy=(Math.random()-.5)*GS.shake;GS.shake*=.8;}else GS.shake=0;
  ctx.save(); ctx.translate(sx,sy);
  drawScene(ctx,W,H);
  // smoke
  GS.particles.forEach(function(p){
    if(p.type!=='s')return;
    if(p.sz<=0)return;
    ctx.globalAlpha=p.a;
    var sg=ctx.createRadialGradient(p.x,p.y,0,p.x,p.y,p.sz);
    sg.addColorStop(0,'rgba(70,60,50,.52)'); sg.addColorStop(1,'rgba(40,35,25,0)');
    ctx.fillStyle=sg; ctx.beginPath(); ctx.arc(p.x,p.y,p.sz,0,Math.PI*2); ctx.fill();
  });
  ctx.globalAlpha=1;
  // debris
  GS.debris.forEach(function(d){
    ctx.save(); ctx.globalAlpha=d.a; ctx.translate(d.x,d.y); ctx.rotate(d.ang);
    ctx.fillStyle=d.hi||d.c; ctx.fillRect(-d.w/2,-d.h/2,d.w,d.h);
    ctx.strokeStyle=d.c; ctx.lineWidth=1; ctx.strokeRect(-d.w/2,-d.h/2,d.w,d.h);
    ctx.restore();
  });
  // blocks
  GS.blocks.forEach(function(b){
    if(b.dead)return; ctx.save();
    if(b.fall){ctx.translate(b.x+b.w/2,b.y+b.h/2);ctx.rotate(b.ang);ctx.translate(-b.w/2,-b.h/2);}
    else ctx.translate(b.x,b.y);
    drawBlock(ctx,0,0,b.w,b.h,b.mat,b.hp/b.max); ctx.restore();
  });
  // placed bombs
  var t=Date.now();
  GS.placed.forEach(function(bomb){
    if(bomb.done)return;
    var def=BOMBS[bomb.type], pulse=.72+.28*Math.sin(t*.007);
    ctx.beginPath(); ctx.arc(bomb.x,bomb.y,def.r,0,Math.PI*2);
    ctx.fillStyle=def.col+'18'; ctx.fill();
    ctx.setLineDash([6,5]); ctx.strokeStyle=def.col+'99'; ctx.lineWidth=1.8; ctx.stroke(); ctx.setLineDash([]);
    ctx.save(); ctx.translate(bomb.x,bomb.y); ctx.scale(pulse,pulse);
    drawBombIcon(ctx,0,0,bomb.type); ctx.restore();
  });
  // fire/sparks
  GS.particles.forEach(function(p){
    if(p.type==='s')return;
    ctx.save(); ctx.globalAlpha=p.a;
    if(p.type==='f'){
      if(p.sz<=0){ctx.restore();return;}
      ctx.shadowColor='#ff6600'; ctx.shadowBlur=12;
      var fg=ctx.createRadialGradient(p.x,p.y,0,p.x,p.y,p.sz);
      fg.addColorStop(0,'rgba(255,250,200,.95)'); fg.addColorStop(.45,'rgba(255,120,20,.8)'); fg.addColorStop(1,'rgba(200,40,0,0)');
      ctx.fillStyle=fg; ctx.beginPath(); ctx.arc(p.x,p.y,p.sz,0,Math.PI*2); ctx.fill();
    } else {
      if(p.glow){ctx.shadowColor=p.glow;ctx.shadowBlur=9;}
      ctx.fillStyle=p.col; ctx.beginPath(); ctx.arc(p.x,p.y,p.sz/2,0,Math.PI*2); ctx.fill();
    }
    ctx.restore();
  });
  ctx.globalAlpha=1; ctx.restore();
}

// ── GAME LOOP ──────────────────────────────────────
function gameLoop() {
  if(!GS.running||GS.paused) return;
  GS.cloudT+=.0009;
  updParticles(); updDebris(); updBlocks(); render();
  GS.raf=requestAnimationFrame(gameLoop);
}

// ── MENU ANIMATION ─────────────────────────────────
function stopMenuAnim() { menuRaf=null; }
function startMenuAnim() {
  var mc=document.getElementById('bg-canvas');
  if(!mc) return;
  mc.width=window.innerWidth; mc.height=window.innerHeight;
  var mctx=mc.getContext('2d'), t=0;
  function loop() {
    if(menuRaf===null) return;
    t+=.0009;
    var W=mc.width, H=mc.height;
    var sky=mctx.createLinearGradient(0,0,0,H);
    sky.addColorStop(0,'#4ab0f0'); sky.addColorStop(.55,'#7ac8ee'); sky.addColorStop(.88,'#b8e8c8');
    mctx.fillStyle=sky; mctx.fillRect(0,0,W,H);
    mctx.save(); mctx.shadowColor='rgba(255,220,80,.68)'; mctx.shadowBlur=32;
    mctx.fillStyle='#ffe870'; mctx.beginPath(); mctx.arc(W*.86,H*.1,28,0,Math.PI*2); mctx.fill();
    mctx.restore();
    cloud(mctx,(W*.1+t*55)%W,H*.10,155,56,'rgba(255,255,255,.9)');
    cloud(mctx,(W*.5+t*32)%W,H*.17,115,44,'rgba(255,255,255,.85)');
    cloud(mctx,(W*.82+t*44)%W,H*.07,96,39,'rgba(255,255,255,.88)');
    mtns(mctx,W,H); trees(mctx,W,H,.9,'#3a7a3a','#4a9a4a');
    mctx.fillStyle='#3d9428'; mctx.fillRect(0,H-GND,W,GND);
    mctx.fillStyle='#4db535'; mctx.fillRect(0,H-GND,W,10);
    menuRaf=requestAnimationFrame(loop);
  }
  menuRaf=true; // sentinel so first frame runs
  menuRaf=requestAnimationFrame(loop);
}

// ── INIT ───────────────────────────────────────────
window.addEventListener('resize',function(){
  if(GS.running&&GS.canvas) resizeCv();
  var mc=document.getElementById('bg-canvas');
  if(mc){mc.width=window.innerWidth;mc.height=window.innerHeight;}
});
window.addEventListener('load',function(){ showMenu(); });