/* ============================================================
   DEMOLITION MASTER  –  script.js
   Full game engine: audio, physics, rendering, levels
   ============================================================ */

'use strict';

/* ── WEB AUDIO ──────────────────────────────────────────── */
var audioCtx = null;
function getAC() {
  if (!audioCtx) {
    try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); }
    catch (e) { }
  }
  return audioCtx;
}
function playTone(freq, type, dur, vol, delay) {
  vol = vol || 0.22; delay = delay || 0;
  try {
    var ac = getAC(); if (!ac) return;
    var o = ac.createOscillator(), g = ac.createGain();
    o.connect(g); g.connect(ac.destination);
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(vol, ac.currentTime + delay);
    g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + delay + dur);
    o.start(ac.currentTime + delay);
    o.stop(ac.currentTime + delay + dur + 0.05);
  } catch (e) { }
}
function playExplosion() {
  try {
    var ac = getAC(); if (!ac) return;
    var len = Math.floor(ac.sampleRate * 0.48);
    var buf = ac.createBuffer(1, len, ac.sampleRate);
    var d   = buf.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 1.1);
    var src = ac.createBufferSource(); src.buffer = buf;
    var g = ac.createGain();
    g.gain.setValueAtTime(0.50, ac.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.55);
    var flt = ac.createBiquadFilter(); flt.type = 'lowpass'; flt.frequency.value = 700;
    src.connect(flt); flt.connect(g); g.connect(ac.destination);
    src.start();
  } catch (e) { }
}
function playClick()  { playTone(440, 'square', .08, .12); playTone(660, 'square', .06, .08, .05); }
function playPlace()  { playTone(320, 'sawtooth', .10, .15); playTone(480, 'sawtooth', .07, .10, .08); }
function playRemove() { playTone(220, 'sawtooth', .08, .12); }
function playWin()    { [440,550,660].forEach(function(f,i){playTone(f,'square',.18,.22,i*.18);}); }
function playLose()   { playTone(200,'sawtooth',.40,.22); playTone(150,'sawtooth',.40,.18,.32); }

/* ── CONSTANTS ───────────────────────────────────────────── */
var GROUND_OFFSET = 72;   // px from canvas bottom

var BOMBS = {
  c4:     { name:'C4',    radius: 88,  power: 5.5, color:'#ff4400', count: 3 },
  tnt:    { name:'TNT',   radius: 122, power: 3.2, color:'#ff8800', count: 5 },
  thermo: { name:'THERM', radius: 80,  power: 6.5, color:'#00ccff', count: 2, heat: true },
  emp:    { name:'EMP',   radius: 168, power: 2.2, color:'#9900ee', count: 2, chain: true },
  mega:   { name:'MEGA',  radius: 218, power: 9.8, color:'#ffcc00', count: 1 }
};

var MATS = {
  wood:     { hp:2,  c:'#c8883a', s:'#8b5a1e', hi:'#e8b06a', lo:'#664010' },
  brick:    { hp:4,  c:'#cc4422', s:'#881800', hi:'#ee7755', lo:'#550d00' },
  concrete: { hp:7,  c:'#8899aa', s:'#556677', hi:'#aabbd0', lo:'#334455' },
  steel:    { hp:10, c:'#6688aa', s:'#445566', hi:'#88aacc', lo:'#223344' },
  glass:    { hp:1,  c:'#88ddee', s:'#55aabb', hi:'#bbeefc', lo:'#226677' },
  rebar:    { hp:12, c:'#667766', s:'#445544', hi:'#889988', lo:'#223322' },
  yellow:   { hp:4,  c:'#eebb22', s:'#aa7700', hi:'#ffdd66', lo:'#885500' }
};

var LEVELS = [
  { id:1, name:'Houten Huis',    target:60, color:'#ff6b35', layout:'house',      diff:1 },
  { id:2, name:'Kantoorblok',    target:65, color:'#ff8c00', layout:'office',     diff:2 },
  { id:3, name:'Watertoren',     target:70, color:'#aa00ff', layout:'tower',      diff:2 },
  { id:4, name:'Fabriek',        target:70, color:'#ff2222', layout:'factory',    diff:3 },
  { id:5, name:'Wolkenkrabber',  target:55, color:'#ffdd00', layout:'skyscraper', diff:4 },
  { id:6, name:'Brug',           target:80, color:'#00cc66', layout:'bridge',     diff:3 },
  { id:7, name:'Silo Complex',   target:75, color:'#ff6a00', layout:'silos',      diff:4 },
  { id:8, name:'Megastructuur',  target:50, color:'#ee0000', layout:'mega',       diff:5 }
];

/* ── STATE ───────────────────────────────────────────────── */
var currentLevel   = null;
var placedBombs    = [];
var blocks         = [];
var particles      = [];
var debris         = [];
var gameScore      = 0;
var gameRunning    = false;
var detonating     = false;
var destructionPct = 0;
var selectedBomb   = 'c4';
var animFrame      = null;
var paused         = false;
var shakeAmt       = 0;
var cloudT         = 0;
var canvas, ctx;
var bombCounts     = {};    // remaining per type this level

var highScores     = JSON.parse(localStorage.getItem('dm3_scores')    || '[]');
var completedLevels= JSON.parse(localStorage.getItem('dm3_completed') || '[]');

/* ── LEVEL BUILDER ───────────────────────────────────────── */
function buildLevel(layout, W, H) {
  var ground = H - GROUND_OFFSET;
  var blocks = [], bw = 30, bh = 22, idc = 0;

  function add(x, y, w, h, mat, structural) {
    blocks.push({
      x:x, y:y, w:w, h:h, mat:mat, structural:!!structural,
      hp: MATS[mat].hp, maxHp: MATS[mat].hp,
      vx:0, vy:0, angle:0, angV:0,
      destroyed:false, falling:false, id:idc++
    });
  }

  if (layout === 'house') {
    var ox = W/2 - 4*bw;
    for (var i=0;i<8;i++) add(ox+i*bw, ground-bh, bw, bh, 'brick', true);
    for (var r=1;r<=5;r++) {
      add(ox,        ground-bh*(r+1), bw, bh, r<=2?'brick':'wood', r<=2);
      add(ox+7*bw,   ground-bh*(r+1), bw, bh, r<=2?'brick':'wood', r<=2);
    }
    for (var r=1;r<=3;r++)
      for (var i=1;i<7;i++) add(ox+i*bw, ground-bh*(r+1), bw, bh, 'wood');
    for (var i=0;i<8;i++) add(ox+i*bw, ground-bh*6, bw, 10, 'yellow');
    for (var r=0;r<3;r++) add(ox+6*bw, ground-bh*6-bh*(r+1), bw, bh, 'brick');
    for (var r=0;r<2;r++)
      for (var i=1;i<3;i++) add(ox+i*bw, ground-bh*(r+4), bw, bh, 'glass');

  } else if (layout === 'office') {
    var ox = W/2 - 5*bw;
    for (var f=0;f<5;f++) {
      for (var c=0;c<=9;c++) {
        var m = (c===0||c===9)?'concrete':(f%2===0?'yellow':'glass');
        add(ox+c*bw, ground-bh*(f*3+1), bw, bh, m, c===0||c===9||f===0);
        if (c<9) add(ox+c*bw, ground-bh*(f*3+2), bw, bh, 'glass');
      }
      for (var c=0;c<9;c++) add(ox+c*bw, ground-bh*(f*3+3), bw, 9, 'concrete', true);
    }

  } else if (layout === 'tower') {
    var cx = W/2;
    for (var i=0;i<6;i++) add(cx-3*bw+i*bw, ground-bh, bw, bh, 'concrete', true);
    for (var r=1;r<=12;r++) {
      var sh = Math.min(r*3, 24);
      add(cx-3*bw+sh, ground-bh*(r+1), bw, bh*2, 'steel', true);
      add(cx+2*bw-sh, ground-bh*(r+1), bw, bh*2, 'steel', true);
      if (r<=4) add(cx-bw, ground-bh*(r+1), bw*2, 9, 'concrete');
    }
    for (var i=0;i<4;i++) add(cx-2*bw+i*bw, ground-bh*15, bw, bh*3, 'steel');

  } else if (layout === 'factory') {
    var ox = W/2 - 5*bw;
    for (var i=0;i<10;i++) add(ox+i*bw, ground-bh, bw, bh, 'concrete', true);
    for (var f=0;f<3;f++) {
      for (var i=0;i<10;i++) {
        var m = (i===0||i===9)?'rebar':(f===1?'brick':'steel');
        add(ox+i*bw, ground-bh*(f*3+2), bw, bh, m, i===0||i===9);
      }
      for (var i=0;i<10;i++) add(ox+i*bw, ground-bh*(f*3+3), bw, 9, 'concrete', true);
    }
    for (var c=0;c<3;c++)
      for (var r=0;r<5;r++) add(ox+(c*3+1)*bw, ground-bh*(11+r), bw, bh, 'brick');

  } else if (layout === 'skyscraper') {
    var cx = W/2;
    for (var f=0;f<14;f++) {
      var w = Math.max(3, 5 - Math.floor(f/4));
      for (var i=0;i<w*2;i++)
        add(cx-w*bw+i*bw, ground-bh*(f*3+1), bw, bh,
            (i===0||i===w*2-1)?'steel':(f%3===0?'concrete':'glass'),
            i===0||i===w*2-1);
      for (var i=0;i<w*2;i++) add(cx-w*bw+i*bw, ground-bh*(f*3+3), bw, 7, 'concrete', true);
    }

  } else if (layout === 'bridge') {
    var ox = W/2 - 130;
    for (var i=0;i<13;i++) add(ox+i*20, ground-bh*4, 20, 9, 'steel', true);
    var pylons = [2,10];
    for (var p=0;p<pylons.length;p++)
      for (var r=0;r<6;r++) add(ox+pylons[p]*20, ground-bh*(r+1), bw, bh, 'concrete', true);
    for (var i=0;i<5;i++) {
      add(ox+3*20+i*20, ground-bh*5, 20, 8, 'steel');
      add(ox+8*20-i*20, ground-bh*5, 20, 8, 'steel');
    }
    for (var i=0;i<13;i++) {
      add(ox+i*20, ground-bh*5, 20, 9, 'brick');
      add(ox+i*20, ground-bh*3, 20, 9, 'brick');
    }

  } else if (layout === 'silos') {
    for (var s=0;s<3;s++) {
      var cx = W/2 + (s-1)*100;
      for (var r=0;r<10;r++)
        for (var i=0;i<4;i++) add(cx-2*bw+i*bw, ground-bh*(r+1), bw, bh, 'concrete', r<3);
      for (var i=0;i<4;i++) add(cx-2*bw+i*bw, ground-bh*11, bw, 9, 'steel');
    }
    for (var s=0;s<2;s++) {
      var cx = W/2 + (s-.5)*100;
      for (var h=3;h<6;h++) add(cx-10, ground-bh*h, 20, 9, 'steel');
    }

  } else if (layout === 'mega') {
    var ox = W/2 - 7*bw;
    var heights = [8,12,10,9];
    for (var t=0;t<4;t++) {
      var tx = ox + t*3.5*bw;
      for (var f=0;f<heights[t];f++) {
        for (var i=0;i<3;i++) {
          add(tx+i*bw*2, ground-bh*(f*2+1), bw*2, bh, f%3===0?'rebar':'steel', i===0||i===2);
          add(tx+i*bw*2, ground-bh*(f*2+2), bw*2, 9,  'concrete', true);
        }
      }
    }
    for (var i=0;i<13;i++) add(ox+i*bw, ground-bh, bw, bh, 'rebar', true);
  }

  return blocks;
}

/* ── SCREENS ─────────────────────────────────────────────── */
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(function(s){ s.classList.remove('active'); });
  document.getElementById('screen-' + id).classList.add('active');
}
function showMenu()        { stopGame(); showScreen('menu'); startMenuAnim(); }
function showLevelSelect() { showScreen('levels'); renderLevels(); }
function showHowTo()       { showScreen('howto'); }
function showHighScores()  { showScreen('scores'); renderScores(); }

/* ── TOAST ───────────────────────────────────────────────── */
var toastTimer = null;
function showToast(msg) {
  var el = document.getElementById('toast');
  el.textContent = msg; el.classList.add('show');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(function(){ el.classList.remove('show'); }, 1800);
}

/* ── RENDER LEVELS ───────────────────────────────────────── */
function renderLevels() {
  var g = document.getElementById('levels-grid'); g.innerHTML = '';
  LEVELS.forEach(function(lvl, i) {
    var unlocked  = (i === 0) || (completedLevels.indexOf(lvl.id - 1) >= 0);
    var completed = completedLevels.indexOf(lvl.id) >= 0;
    var d = document.createElement('div');
    d.className = 'level-card' + (completed ? ' completed' : '');
    if (!unlocked) d.classList.add('locked');
    d.style.setProperty('--lc', lvl.color);
    var dots = '';
    for (var j = 0; j < 5; j++) dots += '<span class="' + (j < lvl.diff ? 'on' : '') + '"></span>';
    d.innerHTML = '<div class="lc-num">' + lvl.id + '</div>'
                + '<div class="lc-name">' + lvl.name + '</div>'
                + '<div class="lc-target">DOEL: ' + lvl.target + '%</div>'
                + '<div class="lc-diff">' + dots + '</div>';
    if (unlocked) {
      (function(l){ d.onclick = function(){ playClick(); startLevel(l); }; })(lvl);
    }
    g.appendChild(d);
  });
}

function renderScores() {
  var el = document.getElementById('scores-list');
  if (!highScores.length) {
    el.innerHTML = '<div style="text-align:center;padding:40px;color:#889;font-size:15px;font-family:Fredoka One,cursive">Nog geen scores!<br/>Speel een level! &#127918;</div>';
    return;
  }
  var sorted = highScores.slice().sort(function(a,b){ return b.score - a.score; }).slice(0, 10);
  el.innerHTML = sorted.map(function(sc, i){
    return '<div class="score-row">'
         + '<div class="score-rank ' + (i===0?'r1':i===1?'r2':i===2?'r3':'') + '">' + (i+1) + '</div>'
         + '<div class="score-info">'
         + '<div class="score-level">Level ' + sc.level + ' &mdash; ' + sc.name + '</div>'
         + '<div class="score-pts">' + sc.score.toLocaleString() + '</div>'
         + '</div></div>';
  }).join('');
}

/* ── GAME START / STOP ───────────────────────────────────── */
function startLevel(lvl) {
  currentLevel = lvl;
  placedBombs = []; particles = []; debris = [];
  gameScore = 0; detonating = false; destructionPct = 0;
  gameRunning = true; paused = false; shakeAmt = 0;

  // Reset bomb counts for this level
  bombCounts = {};
  Object.keys(BOMBS).forEach(function(k){ bombCounts[k] = BOMBS[k].count; });

  showScreen('game');
  canvas = document.getElementById('game-canvas');
  ctx    = canvas.getContext('2d');
  resizeCanvas();
  blocks = buildLevel(lvl.layout, canvas.width, canvas.height);

  document.getElementById('hud-lvl-num').textContent  = 'LEVEL ' + lvl.id;
  document.getElementById('hud-lvl-name').textContent = lvl.name;
  document.getElementById('dest-target').style.left   = lvl.target + '%';

  buildToolbar();
  updateHUD();
  updateDetBtn();

  canvas.addEventListener('click',    onCanvasClick);
  canvas.addEventListener('touchend', onTouchEnd, { passive: false });

  if (animFrame) cancelAnimationFrame(animFrame);
  gameLoop();
}

function stopGame() {
  gameRunning = false; paused = false;
  if (animFrame) cancelAnimationFrame(animFrame);
  var c = document.getElementById('game-canvas');
  if (c) {
    c.removeEventListener('click',    onCanvasClick);
    c.removeEventListener('touchend', onTouchEnd);
  }
}

function resizeCanvas() {
  if (!canvas) return;
  canvas.width  = canvas.parentElement.clientWidth  || window.innerWidth;
  canvas.height = canvas.parentElement.clientHeight || (window.innerHeight - 210);
}

function togglePause() {
  if (!gameRunning) return;
  paused = !paused;
  document.getElementById('pause-modal').classList.toggle('show', paused);
  if (!paused) gameLoop();
}
function closePause() {
  paused = false;
  document.getElementById('pause-modal').classList.remove('show');
}

/* ── TOOLBAR ─────────────────────────────────────────────── */
function buildToolbar() {
  var el = document.getElementById('bomb-slots');
  el.innerHTML = '';
  Object.keys(BOMBS).forEach(function(key) {
    var def = BOMBS[key];
    var btn = document.createElement('div');
    btn.className    = 'bomb-crate';
    btn.dataset.type = key;

    var box = document.createElement('div');
    box.className = 'crate-box' + (key === selectedBomb ? ' selected' : '');

    var iconW = document.createElement('div');
    iconW.className = 'crate-icon';
    var mc = document.createElement('canvas');
    mc.width = 38; mc.height = 40;
    iconW.appendChild(mc);

    var amt = document.createElement('div');
    amt.className       = 'crate-amount';
    amt.id              = 'crate-amt-' + key;
    amt.textContent     = 'x' + bombCounts[key];

    var lbl = document.createElement('div');
    lbl.className   = 'crate-label';
    lbl.textContent = def.name;

    box.appendChild(iconW);
    box.appendChild(amt);
    box.appendChild(lbl);
    btn.appendChild(box);

    (function(k){ btn.onclick = function(){ selectBomb(k); }; })(key);
    el.appendChild(btn);

    (function(mc2, k){ requestAnimationFrame(function(){ if (mc2) drawBombIcon(mc2.getContext('2d'), 19, 22, k); }); })(mc, key);
  });
  selectedBomb = 'c4';
}

function selectBomb(type) {
  if (bombCounts[type] <= 0) { showToast('Geen ' + BOMBS[type].name + ' meer!'); return; }
  selectedBomb = type; playClick();
  document.querySelectorAll('.bomb-crate').forEach(function(b){
    b.querySelector('.crate-box').classList.toggle('selected', b.dataset.type === type);
  });
}

function refreshCrateCounts() {
  Object.keys(BOMBS).forEach(function(k){
    var el = document.getElementById('crate-amt-' + k);
    if (el) el.textContent = 'x' + bombCounts[k];
    var crate = document.querySelector('.bomb-crate[data-type="' + k + '"]');
    if (crate) crate.classList.toggle('crate-empty', bombCounts[k] <= 0);
  });
}

/* ── INPUT ───────────────────────────────────────────────── */
function onCanvasClick(e) {
  if (detonating || paused) return;
  var r = canvas.getBoundingClientRect();
  handlePlace(e.clientX - r.left, e.clientY - r.top);
}
function onTouchEnd(e) {
  e.preventDefault();
  if (detonating || paused) return;
  var r = canvas.getBoundingClientRect();
  var t = e.changedTouches[0];
  handlePlace(t.clientX - r.left, t.clientY - r.top);
}
function handlePlace(px, py) {
  var hit = blockAt(px, py);
  if (!hit || hit.destroyed) return;

  // Check if already placed on this block → remove
  var ei = -1;
  for (var i = 0; i < placedBombs.length; i++) {
    if (placedBombs[i].blockId === hit.id) { ei = i; break; }
  }
  if (ei >= 0) {
    var removed = placedBombs.splice(ei, 1)[0];
    bombCounts[removed.type]++;
    refreshCrateCounts();
    updateDetBtn();
    playRemove();
    return;
  }

  // Place new bomb
  if (bombCounts[selectedBomb] <= 0) {
    showToast('Geen ' + BOMBS[selectedBomb].name + ' meer!');
    return;
  }
  placedBombs.push({ x: hit.x + hit.w/2, y: hit.y + hit.h/2, blockId: hit.id, type: selectedBomb, exploded: false });
  bombCounts[selectedBomb]--;
  refreshCrateCounts();
  updateDetBtn();
  playPlace();
  spawnClickFX(px, py);
}

function blockAt(px, py) {
  for (var i = 0; i < blocks.length; i++) {
    var b = blocks[i];
    if (b.destroyed || b.falling) continue;
    if (px >= b.x && px <= b.x+b.w && py >= b.y && py <= b.y+b.h) return b;
  }
  return null;
}

/* ── DETONATE ────────────────────────────────────────────── */
function detonate() {
  if (!placedBombs.length || detonating) return;
  detonating = true;

  // Screen flash
  var fl = document.createElement('div');
  fl.className = 'expl-flash';
  document.body.appendChild(fl);
  setTimeout(function(){ fl.remove(); }, 700);

  var maxDelay = 0;
  placedBombs.forEach(function(bomb, i) {
    var delay = i * 165;
    maxDelay  = Math.max(maxDelay, delay);
    (function(b){ setTimeout(function(){ explodeBomb(b); }, delay); })(bomb);
  });

  setTimeout(function() {
    calcDestruction();
    detonating    = false;
    placedBombs   = [];
    updateDetBtn();
    checkWin();
  }, maxDelay + 1900);
}

function explodeBomb(bomb) {
  if (bomb.exploded) return;
  bomb.exploded = true;
  var def = BOMBS[bomb.type];
  var bx  = bomb.x, by = bomb.y;
  shakeAmt = Math.max(shakeAmt, def.power * 4.5);
  spawnExplosionFX(bx, by, def);
  playExplosion();

  for (var i = 0; i < blocks.length; i++) {
    var b  = blocks[i]; if (b.destroyed) continue;
    var cx = b.x + b.w/2, cy = b.y + b.h/2;
    var dist = Math.hypot(cx - bx, cy - by);
    if (dist < def.radius) {
      var dmg = def.power * (1 - dist / def.radius);
      b.hp -= dmg;
      if (b.hp <= 0) {
        b.destroyed = true; b.hp = 0;
        spawnDebrisFX(b);
        gameScore += Math.floor(MATS[b.mat].hp * 88 + 55);
      } else {
        var a = Math.atan2(cy - by, cx - bx);
        var f = (def.power * (1 - dist / def.radius)) * 10;
        b.vx  += Math.cos(a) * f;
        b.vy  += Math.sin(a) * f - 3;
        b.falling = true;
        b.angV    = (Math.random() - .5) * .28 * def.power;
      }
    }
  }
  // Chain reaction for EMP
  if (def.chain) {
    placedBombs.forEach(function(o) {
      if (o !== bomb && !o.exploded && Math.hypot(o.x - bx, o.y - by) < def.radius * 1.5) {
        setTimeout(function(){ explodeBomb(o); }, 235);
      }
    });
  }
}

function calcDestruction() {
  var destroyed = 0;
  for (var i = 0; i < blocks.length; i++) if (blocks[i].destroyed) destroyed++;
  destructionPct = Math.round((destroyed / blocks.length) * 100);
  updateHUD();
}

/* ── PHYSICS ─────────────────────────────────────────────── */
function spawnDebrisFX(b) {
  for (var i = 0; i < 8 + Math.floor(Math.random() * 6); i++) {
    debris.push({
      x: b.x + Math.random() * b.w, y: b.y + Math.random() * b.h,
      vx: (Math.random() - .5) * 12, vy: -Math.random() * 14,
      w: 5 + Math.random() * 14, h: 4 + Math.random() * 10,
      angle: Math.random() * Math.PI * 2, angV: (Math.random() - .5) * .40,
      c: MATS[b.mat].c, hi: MATS[b.mat].hi, alpha: 1, life: 1
    });
  }
}

function updateDebris() {
  var g = canvas.height - GROUND_OFFSET;
  for (var i = 0; i < debris.length; i++) {
    var d = debris[i];
    d.vy += 0.47; d.x += d.vx; d.y += d.vy;
    d.angle += d.angV; d.vx *= .97;
    if (d.y >= g) { d.y = g; d.vy *= -.28; d.vx *= .80; }
    d.life  -= .0048;
    d.alpha  = d.life;
  }
  debris = debris.filter(function(d){ return d.life > 0; });
  if (debris.length > 420) debris.length = 300;
}

function updateBlocks() {
  var g = canvas.height - GROUND_OFFSET;
  for (var i = 0; i < blocks.length; i++) {
    var b = blocks[i]; if (!b.falling || b.destroyed) continue;
    b.vy += 0.52; b.x += b.vx; b.y += b.vy;
    b.angle += b.angV; b.vx *= .97; b.angV *= .97;
    if (b.y + b.h >= g) {
      b.y = g - b.h; b.vy *= -.20; b.vx *= .70; b.angV *= .50;
      if (Math.abs(b.vy) < 1) { b.vy = 0; b.falling = false; }
    }
  }
}

function spawnExplosionFX(x, y, def) {
  var cols = [def.color, '#ffdd00', '#ff8800', '#ffffff', '#ffaa44', '#ff4400', '#ff2200'];
  // Embers / sparks
  for (var i = 0; i < 80 + def.power * 15; i++) {
    var a = Math.random() * Math.PI * 2;
    var s = 3 + Math.random() * def.power * 2.8;
    particles.push({
      x:x, y:y, vx:Math.cos(a)*s, vy:Math.sin(a)*s - Math.random()*6,
      size: 3 + Math.random()*10,
      color: cols[Math.floor(Math.random() * cols.length)],
      alpha:1, life:1, decay:.013 + Math.random()*.022,
      type: Math.random() < .28 ? 'spark' : 'ember', glow: def.color
    });
  }
  // Smoke puffs
  for (var i = 0; i < 30; i++) {
    particles.push({
      x: x + (Math.random()-.5)*30, y: y + (Math.random()-.5)*30,
      vx: (Math.random()-.5)*2.4, vy: -1.8 - Math.random()*3.8,
      size: 22 + Math.random()*38,
      color:'smoke', alpha:.5, life:1, decay:.0058, type:'smoke', glow:null
    });
  }
  // Fire ring
  for (var i = 0; i < 24; i++) {
    var a = (i/24) * Math.PI * 2;
    particles.push({
      x:x, y:y, vx:Math.cos(a)*3.8, vy:Math.sin(a)*3.8,
      size: 10 + Math.random()*16,
      color:'fire', alpha:.95, life:1, decay:.020, type:'fire', glow:'#ff6600'
    });
  }
}

function spawnClickFX(x, y) {
  var def = BOMBS[selectedBomb];
  for (var i = 0; i < 16; i++) {
    var a = Math.random() * Math.PI * 2;
    particles.push({
      x:x, y:y, vx:Math.cos(a)*4.5, vy:Math.sin(a)*4.5,
      size: 3 + Math.random()*5,
      color: def.color, alpha:1, life:1, decay:.048, type:'spark', glow:def.color
    });
  }
}

function updateParticles() {
  for (var i = 0; i < particles.length; i++) {
    var p = particles[i];
    p.x  += p.vx; p.y += p.vy;
    if (p.type !== 'smoke') p.vy += .23;
    p.vx  *= .97; p.life  -= p.decay; p.alpha = p.life;
    if (p.type === 'smoke') { p.size += .45; p.alpha = p.life * .32; }
  }
  particles = particles.filter(function(p){ return p.life > 0; });
  if (particles.length > 1200) particles.length = 1000;
}

/* ── HUD ─────────────────────────────────────────────────── */
function updateHUD() {
  document.getElementById('hud-score').textContent     = gameScore.toLocaleString();
  document.getElementById('dest-fill').style.width     = Math.min(destructionPct, 100) + '%';
  document.getElementById('dest-pct').textContent      = destructionPct + '%';
}
function updateDetBtn() {
  var n   = placedBombs.length;
  document.getElementById('detonate-btn').disabled     = (n === 0);
  document.getElementById('det-count').textContent     = n + ' bom' + (n === 1 ? '' : 'men');
}

/* ── WIN / LOSE CHECK ────────────────────────────────────── */
function checkWin() {
  var won   = destructionPct >= currentLevel.target;
  var extra = destructionPct - currentLevel.target;
  var stars = won ? (extra >= 20 ? 3 : extra >= 10 ? 2 : 1) : 0;

  if (won) {
    if (completedLevels.indexOf(currentLevel.id) < 0) completedLevels.push(currentLevel.id);
    localStorage.setItem('dm3_completed', JSON.stringify(completedLevels));
    highScores.push({ level: currentLevel.id, name: currentLevel.name, score: gameScore });
    localStorage.setItem('dm3_scores', JSON.stringify(highScores));
    playWin();
  } else {
    playLose();
  }

  // Star display
  var sh = '';
  for (var i = 0; i < stars; i++)     sh += '&#11088;';
  for (var i = 0; i < 3-stars; i++)  sh += '&#9734;';

  setTimeout(function() {
    var box = document.getElementById('result-box');
    var nxt = currentLevel.id;
    box.innerHTML =
      '<div class="result-title ' + (won ? 'win' : 'lose') + '">'
        + (won ? 'GESLOOPT! &#127881;' : 'MISLUKT &#128165;')
      + '</div>'
      + '<div class="result-stars">' + sh + '</div>'
      + '<div class="result-stats">'
        + '<div class="result-stat"><span class="result-stat-label">VERNIELING</span><span class="result-stat-val">' + destructionPct + '%</span></div>'
        + '<div class="result-stat"><span class="result-stat-label">DOEL</span><span class="result-stat-val">'       + currentLevel.target + '%</span></div>'
        + '<div class="result-stat"><span class="result-stat-label">SCORE</span><span class="result-stat-val">'      + gameScore.toLocaleString() + '</span></div>'
      + '</div>'
      + '<div class="result-btns">'
        + (won && nxt < LEVELS.length ? '<button class="rbtn rbtn-primary" onclick="startLevel(LEVELS[' + nxt + '])">VOLGENDE &#9654;</button>' : '')
        + '<button class="rbtn rbtn-primary"   onclick="startLevel(currentLevel)">OPNIEUW &#8634;</button>'
        + '<button class="rbtn rbtn-secondary" onclick="showLevelSelect()">LEVELS &#128203;</button>'
        + '<button class="rbtn rbtn-secondary" onclick="showMenu()">MENU &#127968;</button>'
      + '</div>';
    showScreen('result');
  }, 950);
}

/* ── DRAW HELPERS ────────────────────────────────────────── */
function drawBombIcon(c, x, y, type) {
  c.save(); c.translate(x, y);
  var r = 13;
  var gradMap = {
    c4:     ['#ff9966','#dd2200','#880000'],
    tnt:    ['#ffee66','#ff8800','#aa4400'],
    thermo: ['#aaf0ff','#00aaee','#003399'],
    emp:    ['#ee88ff','#aa00ee','#440088'],
    mega:   ['#ffffaa','#ffdd00','#ff4400','#880000']
  };
  var gc   = c.createRadialGradient(-3,-3,1,0,0,r);
  var cols = gradMap[type];
  for (var i = 0; i < cols.length; i++) gc.addColorStop(i / (cols.length-1), cols[i]);
  c.fillStyle = gc; c.beginPath(); c.arc(0,0,r,0,Math.PI*2); c.fill();
  c.strokeStyle = 'rgba(0,0,0,.35)'; c.lineWidth = 1.5; c.stroke();
  // Shine
  c.fillStyle = 'rgba(255,255,255,.38)'; c.beginPath(); c.ellipse(-3.5,-4.5,4.5,2.5,-.5,0,Math.PI*2); c.fill();
  // Fuse rope
  c.strokeStyle = '#aa7700'; c.lineWidth = 2; c.lineCap = 'round';
  c.beginPath(); c.moveTo(2,-r); c.bezierCurveTo(8,-r-6,13,-r-2,11,-r-13); c.stroke();
  // Fuse spark
  c.shadowColor = '#ffff00'; c.shadowBlur = 7;
  c.fillStyle = '#ffe800'; c.beginPath(); c.arc(11,-r-13,3.2,0,Math.PI*2); c.fill();
  c.fillStyle = '#ffffff'; c.beginPath(); c.arc(11,-r-13,1.6,0,Math.PI*2); c.fill();
  c.shadowBlur = 0;
  c.restore();
}

function drawBlock(ctx, x, y, w, h, mat, hpRatio) {
  var m = MATS[mat], dmg = 1 - hpRatio;
  // Main face
  ctx.fillStyle = lerpColor(m.c, '#2a1a0a', dmg * .5); ctx.fillRect(x,y,w,h);
  // Top highlight
  ctx.fillStyle = lerpColor(m.hi, '#2a1a0a', dmg * .4); ctx.fillRect(x,y,w,4);
  // Left shine
  ctx.fillStyle = 'rgba(255,255,255,.20)'; ctx.fillRect(x,y,3,h);
  // Bottom shadow
  ctx.fillStyle = lerpColor(m.lo, '#000', dmg * .3); ctx.fillRect(x, y+h-4, w, 4);
  // Right shadow
  ctx.fillStyle = 'rgba(0,0,0,.20)'; ctx.fillRect(x+w-3, y, 3, h);
  // Outline
  ctx.strokeStyle = m.s; ctx.lineWidth = 1.5; ctx.strokeRect(x,y,w,h);
  // Brick pattern
  if (mat === 'brick' || mat === 'yellow') {
    ctx.strokeStyle = 'rgba(0,0,0,.10)'; ctx.lineWidth = .8;
    ctx.beginPath(); ctx.moveTo(x,y+h/2); ctx.lineTo(x+w,y+h/2); ctx.stroke();
    if (w > 22) {
      ctx.beginPath(); ctx.moveTo(x+w*.33,y); ctx.lineTo(x+w*.33,y+h/2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x+w*.66,y+h/2); ctx.lineTo(x+w*.66,y+h); ctx.stroke();
    }
  }
  // Glass inner
  if (mat === 'glass') {
    ctx.fillStyle = 'rgba(180,240,255,.30)'; ctx.fillRect(x+3,y+3,w-6,h-6);
    ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = .8;
    ctx.beginPath(); ctx.moveTo(x+5,y+4); ctx.lineTo(x+w-5,y+4); ctx.stroke();
  }
  // Steel cross-hatch
  if (mat === 'steel' || mat === 'rebar') {
    ctx.strokeStyle = 'rgba(255,255,255,.07)'; ctx.lineWidth = .7;
    ctx.beginPath(); ctx.moveTo(x,y); ctx.lineTo(x+w,y+h); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x+w,y); ctx.lineTo(x,y+h); ctx.stroke();
  }
  // Damage cracks
  if (dmg > .30) {
    var seed = x + y;
    ctx.strokeStyle = 'rgba(0,0,0,.60)'; ctx.lineWidth = .8;
    ctx.beginPath();
    ctx.moveTo(x + w*.30 + Math.sin(seed)*4, y);
    ctx.lineTo(x + w*.48, y + h*.55);
    ctx.lineTo(x + w*.22, y + h);
    ctx.stroke();
    if (dmg > .60) {
      ctx.beginPath();
      ctx.moveTo(x + w*.70, y);
      ctx.lineTo(x + w*.55, y + h*.45);
      ctx.lineTo(x + w*.78, y + h);
      ctx.stroke();
    }
  }
}

function lerpColor(c1, c2, t) {
  t = Math.max(0, Math.min(1, t));
  var r1=parseInt(c1.slice(1,3),16), g1=parseInt(c1.slice(3,5),16), b1=parseInt(c1.slice(5,7),16);
  var r2=parseInt(c2.slice(1,3),16), g2=parseInt(c2.slice(3,5),16), b2=parseInt(c2.slice(5,7),16);
  return 'rgb(' + Math.round(r1+(r2-r1)*t) + ',' + Math.round(g1+(g2-g1)*t) + ',' + Math.round(b1+(b2-b1)*t) + ')';
}

/* ── SCENE / BACKGROUND ──────────────────────────────────── */
function drawScene(W, H) {
  // Sky gradient
  var sky = ctx.createLinearGradient(0,0,0,H);
  sky.addColorStop(0,   '#4ab0f0');
  sky.addColorStop(.45, '#7ac8ee');
  sky.addColorStop(.72, '#a8dff5');
  sky.addColorStop(.88, '#c0eebb');
  ctx.fillStyle = sky; ctx.fillRect(0,0,W,H);

  // Sun
  ctx.save();
  ctx.shadowColor = 'rgba(255,220,80,.65)'; ctx.shadowBlur = 32;
  ctx.fillStyle = '#ffe870'; ctx.beginPath(); ctx.arc(W*.88,H*.10,28,0,Math.PI*2); ctx.fill();
  ctx.fillStyle = '#fff8aa'; ctx.beginPath(); ctx.arc(W*.88,H*.10,22,0,Math.PI*2); ctx.fill();
  ctx.restore();

  // Animated clouds
  cloudT += .0009;
  drawCloud(ctx, (W*.12 + cloudT*55) % W, H*.09, 148, 56, 'rgba(255,255,255,0.92)');
  drawCloud(ctx, (W*.44 + cloudT*32) % W, H*.16, 108, 43, 'rgba(255,255,255,0.85)');
  drawCloud(ctx, (W*.73 + cloudT*45) % W, H*.07, 128, 50, 'rgba(255,255,255,0.90)');
  drawCloud(ctx, (W*.90 + cloudT*22) % W, H*.20,  82, 33, 'rgba(255,255,255,0.78)');

  drawMountains(ctx, W, H);

  // Background trees (smaller, darker)
  drawTreeRow(ctx, W, H, .73, '#3a7a3a', '#4a9a4a');
  // Foreground trees (bigger, brighter)
  drawTreeRow(ctx, W, H, 1.06, '#2a6a2a', '#3a8a3a');

  // Dashed destruction line
  var tly = H * .52;
  ctx.setLineDash([14,9]);
  ctx.strokeStyle = 'rgba(255,255,255,.72)'; ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.moveTo(0,tly); ctx.lineTo(W,tly); ctx.stroke();
  ctx.setLineDash([]);

  // Ground layers
  var gy = H - GROUND_OFFSET;
  ctx.fillStyle = '#3d9428'; ctx.fillRect(0, gy, W, H-gy);
  ctx.fillStyle = '#4db535'; ctx.fillRect(0, gy, W, 10);
  ctx.fillStyle = '#2a7018'; ctx.fillRect(0, gy+10, W, 8);
  ctx.fillStyle = 'rgba(0,0,0,.07)'; ctx.fillRect(0, gy, W, 4);

  // Flowers along ground
  var flc = ['#ff6699','#ffee44','#ff9933','#bb44ff','#ff5588','#44ddff'];
  for (var i = 0; i < Math.floor(W/30); i++) {
    var fx = (i*31 + 17) % W;
    ctx.fillStyle = '#3a8a20'; ctx.fillRect(fx-1, gy-10, 2, 8);
    ctx.fillStyle = flc[i % flc.length];
    ctx.beginPath(); ctx.arc(fx, gy-11, 3.5, 0, Math.PI*2); ctx.fill();
  }
}

function drawCloud(ctx, x, y, w, h, color) {
  ctx.save(); ctx.fillStyle = color;
  var r = h * .52;
  ctx.beginPath();
  ctx.arc(x,         y,         r,       0, Math.PI*2);
  ctx.arc(x+w*.22,   y-h*.25,   r*.82,   0, Math.PI*2);
  ctx.arc(x+w*.48,   y-h*.12,   r,       0, Math.PI*2);
  ctx.arc(x+w*.72,   y+h*.08,   r*.75,   0, Math.PI*2);
  ctx.arc(x+w,       y,         r*.65,   0, Math.PI*2);
  ctx.fill();
  ctx.fillRect(x-r, y, w + r*2, r);
  ctx.restore();
}

function drawMountains(ctx, W, H) {
  var pts = [.06,.24, .15,.38, .30,.16, .45,.33, .58,.12, .70,.28, .83,.17, .95,.30, 1,.22];
  ctx.fillStyle = '#8ab898';
  ctx.beginPath(); ctx.moveTo(0, H*.5);
  for (var i = 0; i < pts.length; i+=2) ctx.lineTo(W*pts[i], H*pts[i+1]);
  ctx.lineTo(W, H*.5); ctx.closePath(); ctx.fill();
  // Snow caps
  ctx.fillStyle = 'rgba(255,255,255,.75)';
  var caps = [[.30,.16,.09],[.58,.12,.11],[.83,.17,.08]];
  for (var i = 0; i < caps.length; i++) {
    var mx=W*caps[i][0], my=H*caps[i][1], mw=W*caps[i][2];
    ctx.beginPath(); ctx.moveTo(mx,my);
    ctx.lineTo(mx-mw*.4, my+mw*.28); ctx.lineTo(mx+mw*.4, my+mw*.28);
    ctx.closePath(); ctx.fill();
  }
}

function drawTreeRow(ctx, W, H, scl, dark, mid) {
  var gy  = H - GROUND_OFFSET;
  var pos = [.04,.09,.15,.82,.88,.93,.97,.02,.70];
  for (var i = 0; i < pos.length; i++) {
    var tx = pos[i] * W;
    var th = (62 + Math.sin(i*5.3)*20) * scl;
    var tw = (42 + Math.sin(i*2.9)*15) * scl;
    // Trunk
    ctx.fillStyle = '#6b4423';
    ctx.fillRect(tx - 4*scl, gy - th*.28, 8*scl, th*.28 + 2);
    // Three foliage tiers
    var lc = [dark, mid, dark];
    for (var l = 0; l < 3; l++) {
      ctx.fillStyle = lc[l];
      var ly = gy - th*.25 - l*th*.25;
      var lw = tw * (1 - l*.22);
      ctx.beginPath();
      ctx.moveTo(tx,      ly - th*.32);
      ctx.lineTo(tx-lw/2, ly);
      ctx.lineTo(tx+lw/2, ly);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,.10)'; ctx.lineWidth = 1; ctx.stroke();
    }
  }
}

/* ── MAIN RENDER ─────────────────────────────────────────── */
function render() {
  if (!canvas || !ctx) return;
  var W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);

  // Screen shake
  var sx = 0, sy = 0;
  if (shakeAmt > .1) {
    sx = (Math.random() - .5) * shakeAmt;
    sy = (Math.random() - .5) * shakeAmt;
    shakeAmt *= .80;
  } else { shakeAmt = 0; }
  ctx.save(); ctx.translate(sx, sy);

  // ── Background scene
  drawScene(W, H);

  // ── Smoke (behind everything)
  for (var i = 0; i < particles.length; i++) {
    var p = particles[i]; if (p.type !== 'smoke') continue;
    ctx.globalAlpha = p.alpha;
    var sg = ctx.createRadialGradient(p.x,p.y,0,p.x,p.y,p.size);
    sg.addColorStop(0, 'rgba(70,60,50,.55)');
    sg.addColorStop(1, 'rgba(40,35,25,0)');
    ctx.fillStyle = sg; ctx.beginPath(); ctx.arc(p.x,p.y,p.size,0,Math.PI*2); ctx.fill();
  }
  ctx.globalAlpha = 1;

  // ── Debris chunks
  for (var i = 0; i < debris.length; i++) {
    var d = debris[i];
    ctx.save(); ctx.globalAlpha = d.alpha;
    ctx.translate(d.x, d.y); ctx.rotate(d.angle);
    ctx.fillStyle   = d.hi || d.c;  ctx.fillRect(-d.w/2,-d.h/2,d.w,d.h);
    ctx.strokeStyle = d.c;          ctx.lineWidth = 1; ctx.strokeRect(-d.w/2,-d.h/2,d.w,d.h);
    ctx.restore();
  }

  // ── Building blocks
  for (var i = 0; i < blocks.length; i++) {
    var b = blocks[i]; if (b.destroyed) continue;
    ctx.save();
    if (b.falling) {
      ctx.translate(b.x + b.w/2, b.y + b.h/2);
      ctx.rotate(b.angle);
      ctx.translate(-b.w/2, -b.h/2);
    } else {
      ctx.translate(b.x, b.y);
    }
    drawBlock(ctx, 0, 0, b.w, b.h, b.mat, b.hp / b.maxHp);
    ctx.restore();
  }

  // ── Placed bomb markers (pulsing + radius ring)
  for (var i = 0; i < placedBombs.length; i++) {
    var bomb = placedBombs[i]; if (bomb.exploded) continue;
    var def   = BOMBS[bomb.type];
    var pulse = .72 + .28 * Math.sin(Date.now() * .007);
    // Radius circle
    ctx.beginPath(); ctx.arc(bomb.x, bomb.y, def.radius, 0, Math.PI*2);
    ctx.fillStyle   = def.color + '18'; ctx.fill();
    ctx.setLineDash([6,5]);
    ctx.strokeStyle = def.color + '99'; ctx.lineWidth = 1.8; ctx.stroke();
    ctx.setLineDash([]);
    // Bomb icon (pulsing)
    ctx.save();
    ctx.translate(bomb.x, bomb.y); ctx.scale(pulse, pulse);
    drawBombIcon(ctx, 0, 0, bomb.type);
    ctx.restore();
  }

  // ── Fire, sparks, embers (foreground)
  for (var i = 0; i < particles.length; i++) {
    var p = particles[i]; if (p.type === 'smoke') continue;
    ctx.save(); ctx.globalAlpha = p.alpha;
    if (p.type === 'fire') {
      ctx.shadowColor = '#ff6600'; ctx.shadowBlur = 12;
      var fg = ctx.createRadialGradient(p.x,p.y,0,p.x,p.y,p.size);
      fg.addColorStop(0,   'rgba(255,250,200,.95)');
      fg.addColorStop(.45, 'rgba(255,120,20,.80)');
      fg.addColorStop(1,   'rgba(200,40,0,0)');
      ctx.fillStyle = fg; ctx.beginPath(); ctx.arc(p.x,p.y,p.size,0,Math.PI*2); ctx.fill();
    } else {
      if (p.glow) { ctx.shadowColor = p.glow; ctx.shadowBlur = 9; }
      ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(p.x,p.y,p.size/2,0,Math.PI*2); ctx.fill();
    }
    ctx.restore();
  }

  ctx.globalAlpha = 1;
  ctx.restore();
}

/* ── GAME LOOP ───────────────────────────────────────────── */
function gameLoop() {
  if (!gameRunning || paused) return;
  updateParticles();
  updateDebris();
  updateBlocks();
  render();
  animFrame = requestAnimationFrame(gameLoop);
}

/* ── MENU BACKGROUND ANIMATION ───────────────────────────── */
var menuAnimRunning = false, menuCloudT = 0;
function startMenuAnim() {
  var mc = document.getElementById('bg-canvas'); if (!mc) return;
  mc.width  = window.innerWidth;
  mc.height = window.innerHeight;
  var mctx = mc.getContext('2d');
  menuAnimRunning = true; menuCloudT = 0;

  function loop() {
    if (!menuAnimRunning) return;
    var W = mc.width, H = mc.height;
    menuCloudT += .0009;
    // Sky
    var sky = mctx.createLinearGradient(0,0,0,H);
    sky.addColorStop(0,   '#4ab0f0');
    sky.addColorStop(.55, '#7ac8ee');
    sky.addColorStop(.88, '#b8e8c8');
    mctx.fillStyle = sky; mctx.fillRect(0,0,W,H);
    // Sun
    mctx.save();
    mctx.shadowColor = 'rgba(255,220,80,.70)'; mctx.shadowBlur = 36;
    mctx.fillStyle = '#ffe870'; mctx.beginPath(); mctx.arc(W*.86,H*.10,30,0,Math.PI*2); mctx.fill();
    mctx.restore();
    // Clouds
    drawCloud(mctx, (W*.10 + menuCloudT*55) % W, H*.10, 158, 58, 'rgba(255,255,255,0.90)');
    drawCloud(mctx, (W*.50 + menuCloudT*32) % W, H*.17, 118, 45, 'rgba(255,255,255,0.85)');
    drawCloud(mctx, (W*.82 + menuCloudT*44) % W, H*.07,  98, 40, 'rgba(255,255,255,0.88)');
    drawMountains(mctx, W, H);
    drawTreeRow(mctx, W, H, .90, '#3a7a3a', '#4a9a4a');
    mctx.fillStyle = '#3d9428'; mctx.fillRect(0, H-72, W, 72);
    mctx.fillStyle = '#4db535'; mctx.fillRect(0, H-72, W, 10);
    requestAnimationFrame(loop);
  }
  loop();
}

/* ── WINDOW EVENTS ───────────────────────────────────────── */
window.addEventListener('resize', function() {
  if (gameRunning && canvas) resizeCanvas();
  var mc = document.getElementById('bg-canvas');
  if (mc) { mc.width = window.innerWidth; mc.height = window.innerHeight; }
});

document.addEventListener('DOMContentLoaded', function() {
  showMenu();
});
