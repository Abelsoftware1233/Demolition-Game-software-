/* ============================================
   ABEL123 DEMOLITION — GAME ENGINE
   ============================================ */

// ── STATE ─────────────────────────────────────
let currentLevel = null;
let placedBombs = [];
let blocks = [];
let particles = [];
let debris = [];
let gameScore = 0;
let gameRunning = false;
let detonating = false;
let destructionPct = 0;
let selectedBomb = 'c4';
let animFrame = null;
let canvas, ctx;
let camX = 0, camY = 0, camScale = 1;
let touchStart = null;
let highScores = JSON.parse(localStorage.getItem('abel123_scores') || '[]');
let completedLevels = JSON.parse(localStorage.getItem('abel123_completed') || '[]');

// ── BOMB DEFINITIONS ──────────────────────────
const BOMBS = {
  c4:     { name:'C4',      radius:80,  power:5,  color:'#ff2222', glowColor:'rgba(255,34,34,0.6)',    delay:0,   chain:false, heat:false },
  tnt:    { name:'TNT',     radius:110, power:3,  color:'#ff8800', glowColor:'rgba(255,136,0,0.5)',    delay:0,   chain:false, heat:false },
  thermo: { name:'THERMO',  radius:70,  power:6,  color:'#00ccff', glowColor:'rgba(0,200,255,0.6)',    delay:0.3, chain:false, heat:true  },
  emp:    { name:'EMP',     radius:150, power:2,  color:'#aa00ff', glowColor:'rgba(170,0,255,0.5)',    delay:0,   chain:true,  heat:false },
  mega:   { name:'MEGA',    radius:200, power:9,  color:'#ffee00', glowColor:'rgba(255,238,0,0.7)',    delay:0.5, chain:false, heat:true  },
};

// ── LEVEL DEFINITIONS ────────────────────────
const LEVELS = [
  {
    id:1, name:'KLEIN HUISJE',    desc:'Een eenvoudig houten huis',     target:60, difficulty:1,
    color:'#00f5ff', bombLimit:8,
    layout: 'house'
  },
  {
    id:2, name:'KANTOORBLOK',     desc:'5 verdiepingen staal + beton',  target:65, difficulty:2,
    color:'#ff8800', bombLimit:10,
    layout: 'office'
  },
  {
    id:3, name:'WATERTOREN',      desc:'Dunne dragende structuur',       target:70, difficulty:2,
    color:'#aa00ff', bombLimit:6,
    layout: 'tower'
  },
  {
    id:4, name:'FABRIEK',         desc:'Brede industriële hal',          target:70, difficulty:3,
    color:'#ff2222', bombLimit:12,
    layout: 'factory'
  },
  {
    id:5, name:'WOLKENKRABBER',   desc:'20 verdiepingen staal',          target:55, difficulty:4,
    color:'#ffee00', bombLimit:15,
    layout: 'skyscraper'
  },
  {
    id:6, name:'BRUG',            desc:'Lange spanning, delicate balken', target:80, difficulty:3,
    color:'#00ff88', bombLimit:8,
    layout: 'bridge'
  },
  {
    id:7, name:'SILO COMPLEX',    desc:'3 verbonden silo\'s',            target:75, difficulty:4,
    color:'#ff6a00', bombLimit:10,
    layout: 'silos'
  },
  {
    id:8, name:'MEGASTRUCTUUR',   desc:'Het ultieme doelwit',            target:50, difficulty:5,
    color:'#ff2222', bombLimit:20,
    layout: 'mega'
  },
];

// ── BLOCK MATERIALS ──────────────────────────
const MATERIALS = {
  wood:     { hp:2,  color:'#8B6347', stroke:'#6B4527', mass:1.0, name:'HOUT' },
  brick:    { hp:4,  color:'#C4654A', stroke:'#A04530', mass:2.0, name:'STEEN' },
  concrete: { hp:7,  color:'#7A8290', stroke:'#5A6270', mass:3.0, name:'BETON' },
  steel:    { hp:10, color:'#5A7090', stroke:'#3A5070', mass:4.0, name:'STAAL' },
  glass:    { hp:1,  color:'#88ccee', stroke:'#66aacc', mass:0.5, name:'GLAS'  },
  rebar:    { hp:12, color:'#607060', stroke:'#405040', mass:5.0, name:'WAPENING'},
};

// ── LEVEL BUILDERS ───────────────────────────
function buildLevel(layout, W, H) {
  const ground = H - 60;
  const blocks = [];
  const bw = 28, bh = 20;

  function addBlock(x, y, w, h, mat, structural=false) {
    blocks.push({ x, y, w, h, mat, structural,
      hp: MATERIALS[mat].hp, maxHp: MATERIALS[mat].hp,
      vx:0, vy:0, angle:0, angularV:0,
      destroyed:false, falling:false,
      id: blocks.length
    });
  }

  if (layout === 'house') {
    // Foundation
    for (let i=0;i<8;i++) addBlock(W/2-112+i*28, ground-bh, bw, bh, 'brick', true);
    // Walls
    for (let r=1;r<=5;r++) {
      addBlock(W/2-112, ground-bh*(r+1), bw, bh, 'wood', r<=2);
      addBlock(W/2-112+7*bw, ground-bh*(r+1), bw, bh, 'wood', r<=2);
    }
    // Fill wall
    for (let r=1;r<=3;r++) for (let i=1;i<7;i++) addBlock(W/2-112+i*bw, ground-bh*(r+1), bw, bh, 'wood');
    // Roof
    for (let i=0;i<8;i++) addBlock(W/2-112+i*bw, ground-bh*7, bw, bh/2, 'wood');
    // Chimney
    for (let r=0;r<3;r++) addBlock(W/2-112+6*bw, ground-bh*(7+r)-bh/2, bw, bh, 'brick');
  }

  else if (layout === 'office') {
    const ox = W/2 - 4*bw*2;
    for (let floor=0; floor<5; floor++) {
      for (let col=0; col<=8; col++) {
        const mat = (col===0||col===8) ? 'concrete' : (floor%2===0 ? 'brick' : 'glass');
        const struct = col===0||col===8||floor===0;
        addBlock(ox+col*bw*2, ground-bh*(floor*3+1), bw*2, bh, mat, struct);
        if (col<8) addBlock(ox+col*bw*2, ground-bh*(floor*3+2), bw*2, bh, 'glass');
      }
      // Floor slabs
      for (let col=0;col<8;col++)
        addBlock(ox+col*bw*2, ground-bh*(floor*3+3), bw*2, bh/2, 'concrete', true);
    }
  }

  else if (layout === 'tower') {
    const cx = W/2;
    // Base
    for (let i=0;i<6;i++) addBlock(cx-3*bw+i*bw, ground-bh, bw, bh, 'concrete', true);
    // Narrowing tower
    for (let r=1;r<=12;r++) {
      const shrink = Math.min(r*2, 10);
      addBlock(cx-3*bw+shrink, ground-bh*(r+1), bw, bh*2, 'steel', true);
      addBlock(cx+2*bw-shrink, ground-bh*(r+1), bw, bh*2, 'steel', true);
      if (r<=4) addBlock(cx-bw, ground-bh*(r+1), bw*2, bh/2, 'concrete');
    }
    // Top tank
    for (let i=0;i<4;i++) addBlock(cx-2*bw+i*bw, ground-bh*15, bw, bh*3, 'steel');
  }

  else if (layout === 'factory') {
    const ox = W/2 - 5*bw*2;
    // Wide base
    for (let i=0;i<10;i++) addBlock(ox+i*bw*2, ground-bh, bw*2, bh, 'concrete', true);
    for (let floor=0;floor<3;floor++) {
      for (let i=0;i<10;i++) {
        const mat = i===0||i===9 ? 'rebar' : (floor===1 ? 'brick' : 'steel');
        addBlock(ox+i*bw*2, ground-bh*(floor*3+2), bw*2, bh, mat, i===0||i===9);
      }
      for (let i=0;i<10;i++)
        addBlock(ox+i*bw*2, ground-bh*(floor*3+3), bw*2, bh/2, 'concrete', true);
    }
    // Chimneys
    for (let c=0;c<3;c++) {
      for (let r=0;r<5;r++) addBlock(ox+(c*3+1)*bw*2, ground-bh*(11+r), bw, bh, 'brick');
    }
  }

  else if (layout === 'skyscraper') {
    const cx = W/2;
    const floors = 14;
    for (let f=0;f<floors;f++) {
      const w = Math.max(3, 5-Math.floor(f/4));
      for (let i=0;i<w*2;i++) {
        const mat = (i===0||i===w*2-1) ? 'steel' : (f%3===0?'concrete':'glass');
        addBlock(cx-(w)*bw+i*bw, ground-bh*(f*3+1), bw, bh, mat, i===0||i===w*2-1);
      }
      for (let i=0;i<w*2;i++)
        addBlock(cx-(w)*bw+i*bw, ground-bh*(f*3+3), bw, bh/3, 'concrete', true);
    }
  }

  else if (layout === 'bridge') {
    const ox = W/2 - 120;
    // Deck
    for (let i=0;i<12;i++) addBlock(ox+i*20, ground-bh*4, 20, bh/2, 'steel', true);
    // Pylons
    for (let p of [2,9]) {
      for (let r=0;r<6;r++) addBlock(ox+p*20, ground-bh*(r+1), bw, bh, 'concrete', true);
    }
    // Cables (represented as thin steel)
    for (let i=0;i<4;i++) {
      addBlock(ox+3*20+i*20, ground-bh*5, 20, bh/4, 'steel');
      addBlock(ox+7*20-i*20, ground-bh*5, 20, bh/4, 'steel');
    }
    // Side walls of bridge
    for (let i=0;i<12;i++) {
      addBlock(ox+i*20, ground-bh*5, 20, bh/3, 'brick');
      addBlock(ox+i*20, ground-bh*3, 20, bh/3, 'brick');
    }
  }

  else if (layout === 'silos') {
    for (let s=0;s<3;s++) {
      const cx = W/2 + (s-1)*90;
      for (let r=0;r<10;r++) {
        for (let i=0;i<4;i++) addBlock(cx-2*bw+i*bw, ground-bh*(r+1), bw, bh, 'concrete', r<3);
      }
      // Top dome
      for (let i=0;i<4;i++) addBlock(cx-2*bw+i*bw, ground-bh*11, bw, bh/2, 'steel');
    }
    // Connecting bridges
    for (let s=0;s<2;s++) {
      const cx = W/2 + (s-0.5)*90;
      for (let h=3;h<6;h++) {
        addBlock(cx-10, ground-bh*h, 20, bh/2, 'steel');
      }
    }
  }

  else if (layout === 'mega') {
    // Massive complex
    const ox = W/2 - 6*bw*2;
    for (let tower=0;tower<4;tower++) {
      const tx = ox + tower*3*bw*2;
      const height = [8,12,10,9][tower];
      for (let f=0;f<height;f++) {
        for (let i=0;i<3;i++) {
          addBlock(tx+i*bw*2, ground-bh*(f*2+1), bw*2, bh, f%3===0?'rebar':'steel', i===0||i===2);
          addBlock(tx+i*bw*2, ground-bh*(f*2+2), bw*2, bh/2, 'concrete', true);
        }
      }
    }
    // Connecting bases
    for (let i=0;i<11;i++) addBlock(ox+i*bw*2, ground-bh, bw*2, bh, 'rebar', true);
  }

  return blocks;
}

// ── SCREENS ──────────────────────────────────
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById('screen-' + id).classList.add('active');
}
function showMenu() {
  stopGame();
  showScreen('menu');
  startMenuAnimation();
}
function showLevelSelect() {
  showScreen('levels');
  renderLevelGrid();
}
function showHowTo()    { showScreen('howto'); }
function showHighScores() {
  showScreen('scores');
  renderScores();
}

function renderLevelGrid() {
  const grid = document.getElementById('levels-grid');
  grid.innerHTML = '';
  LEVELS.forEach((lvl, i) => {
    const unlocked = i === 0 || completedLevels.includes(i);
    const completed = completedLevels.includes(lvl.id);
    const card = document.createElement('div');
    card.className = 'level-card' + (!unlocked?' locked':'') + (completed?' completed':'');
    card.style.setProperty('--level-color', lvl.color);
    const stars = Array(5).fill('').map((_,j)=>`<span class="${j<lvl.difficulty?'active':''}"></span>`).join('');
    card.innerHTML = `
      <div class="level-num">${String(lvl.id).padStart(2,'0')}</div>
      <div class="level-name">${lvl.name}</div>
      <div class="level-desc">${lvl.desc}</div>
      <div class="level-target">DOEL: ${lvl.target}%</div>
      <div class="level-diff">${stars}</div>
    `;
    if (unlocked) card.onclick = () => startLevel(lvl);
    grid.appendChild(card);
  });
}

function renderScores() {
  const list = document.getElementById('scores-list');
  if (!highScores.length) {
    list.innerHTML = '<div style="text-align:center;color:var(--text-dim);padding:40px;font-family:Orbitron,sans-serif;font-size:12px;letter-spacing:2px;">GEEN SCORES NOG<br/><br/>SPEEL EEN LEVEL!</div>';
    return;
  }
  const sorted = [...highScores].sort((a,b)=>b.score-a.score).slice(0,10);
  list.innerHTML = sorted.map((s,i) => `
    <div class="score-row">
      <div class="score-rank ${i===0?'r1':i===1?'r2':i===2?'r3':''}">${i+1}</div>
      <div class="score-info">
        <div class="score-level">LEVEL ${s.level} — ${s.name}</div>
        <div class="score-pts">${s.score.toLocaleString()}</div>
      </div>
    </div>
  `).join('');
}

// ── GAME START ───────────────────────────────
function startLevel(lvl) {
  currentLevel = lvl;
  placedBombs = [];
  particles = [];
  debris = [];
  gameScore = 0;
  detonating = false;
  destructionPct = 0;
  gameRunning = true;

  showScreen('game');

  canvas = document.getElementById('game-canvas');
  ctx = canvas.getContext('2d');

  resizeCanvas();
  blocks = buildLevel(lvl.layout, canvas.width, canvas.height);

  // Set camera to fit building
  camX = 0; camY = 0; camScale = 1;

  updateHUD();
  updateDetonateBtn();

  document.getElementById('hud-level').textContent = `LEVEL ${lvl.id} — ${lvl.name}`;
  document.getElementById('destruction-target').style.left = lvl.target + '%';

  selectBomb('c4');

  canvas.addEventListener('click', onCanvasClick);
  canvas.addEventListener('touchend', onCanvasTouchEnd, {passive:false});

  if (animFrame) cancelAnimationFrame(animFrame);
  gameLoop();
}

function stopGame() {
  gameRunning = false;
  if (animFrame) cancelAnimationFrame(animFrame);
  canvas = document.getElementById('game-canvas');
  if (canvas) {
    canvas.removeEventListener('click', onCanvasClick);
    canvas.removeEventListener('touchend', onCanvasTouchEnd);
  }
}

function resizeCanvas() {
  if (!canvas) return;
  const parent = canvas.parentElement;
  canvas.width  = parent.clientWidth  || window.innerWidth;
  canvas.height = parent.clientHeight || (window.innerHeight - 200);
}

// ── INPUT ────────────────────────────────────
function onCanvasClick(e) {
  if (detonating) return;
  const rect = canvas.getBoundingClientRect();
  handlePlace(e.clientX - rect.left, e.clientY - rect.top);
}
function onCanvasTouchEnd(e) {
  e.preventDefault();
  if (detonating) return;
  const rect = canvas.getBoundingClientRect();
  const t = e.changedTouches[0];
  handlePlace(t.clientX - rect.left, t.clientY - rect.top);
}

function handlePlace(px, py) {
  // Find block under tap
  const hit = getBlockAt(px, py);
  if (!hit) return;
  if (hit.destroyed) return;

  // Check duplicate (remove if exists)
  const existing = placedBombs.findIndex(b=>b.blockId===hit.id);
  if (existing>=0) {
    placedBombs.splice(existing,1);
    updateDetonateBtn();
    return;
  }

  placedBombs.push({
    x: hit.x + hit.w/2,
    y: hit.y + hit.h/2,
    blockId: hit.id,
    type: selectedBomb,
    timer: 0,
    exploded: false,
  });
  updateDetonateBtn();

  // Tap feedback
  spawnClickParticles(px, py);
}

function getBlockAt(px, py) {
  for (let b of blocks) {
    if (b.destroyed) continue;
    if (px>=b.x && px<=b.x+b.w && py>=b.y && py<=b.y+b.h) return b;
  }
  return null;
}

// ── TOOLBAR ──────────────────────────────────
function selectBomb(type) {
  selectedBomb = type;
  document.querySelectorAll('.bomb-opt').forEach(b=>{
    b.classList.toggle('active', b.dataset.type===type);
  });
}

// ── DETONATE ─────────────────────────────────
function detonate() {
  if (!placedBombs.length || detonating) return;
  detonating = true;

  // Flash overlay
  const flash = document.createElement('div');
  flash.className = 'explosion-flash';
  document.body.appendChild(flash);
  setTimeout(()=>flash.remove(), 600);

  // Trigger bombs with delays
  let maxDelay = 0;
  placedBombs.forEach((bomb, i) => {
    const def = BOMBS[bomb.type];
    const delay = i * 150 + def.delay * 1000;
    maxDelay = Math.max(maxDelay, delay);
    setTimeout(() => triggerExplosion(bomb), delay);
  });

  setTimeout(() => {
    calcDestruction();
    detonating = false;
    placedBombs = [];
    updateDetonateBtn();
    checkWinCondition();
  }, maxDelay + 1500);
}

function triggerExplosion(bomb) {
  if (bomb.exploded) return;
  bomb.exploded = true;

  const def = BOMBS[bomb.type];
  const bx = bomb.x, by = bomb.y;

  // Screen shake
  screenShake(def.power * 3);

  // Particles
  spawnExplosion(bx, by, def);

  // Damage blocks
  for (let b of blocks) {
    if (b.destroyed) continue;
    const cx = b.x + b.w/2, cy = b.y + b.h/2;
    const dist = Math.hypot(cx-bx, cy-by);
    if (dist < def.radius) {
      const dmg = def.power * (1 - dist/def.radius);
      b.hp -= dmg;
      if (b.hp <= 0) {
        b.destroyed = true;
        b.hp = 0;
        spawnDebris(b);
        gameScore += Math.floor(MATERIALS[b.mat].mass * 100);
      } else {
        // Push block
        const angle = Math.atan2(cy-by, cx-bx);
        const force = (def.power * (1-dist/def.radius)) * 8;
        b.vx += Math.cos(angle) * force;
        b.vy += Math.sin(angle) * force - 2;
        b.falling = true;
        b.angularV = (Math.random()-0.5) * 0.2 * def.power;
      }
    }
  }

  // EMP chain reaction
  if (def.chain) {
    placedBombs.forEach(other => {
      if (other !== bomb && !other.exploded) {
        const dist = Math.hypot(other.x-bx, other.y-by);
        if (dist < def.radius * 1.5) {
          setTimeout(()=>triggerExplosion(other), 200);
        }
      }
    });
  }
}

function calcDestruction() {
  const total = blocks.length;
  const destroyed = blocks.filter(b=>b.destroyed).length;
  destructionPct = Math.round((destroyed/total)*100);
  updateHUD();
}

// ── DEBRIS PHYSICS ───────────────────────────
function spawnDebris(block) {
  const N = 6 + Math.floor(Math.random()*6);
  for (let i=0;i<N;i++) {
    debris.push({
      x: block.x + Math.random()*block.w,
      y: block.y + Math.random()*block.h,
      vx: (Math.random()-0.5)*8,
      vy: -Math.random()*10,
      w: 4 + Math.random()*10,
      h: 4 + Math.random()*8,
      angle: Math.random()*Math.PI*2,
      angularV: (Math.random()-0.5)*0.3,
      color: MATERIALS[block.mat].color,
      alpha: 1,
      life: 1,
    });
  }
}

function updateDebris() {
  const ground = canvas.height - 60;
  for (let d of debris) {
    d.vy += 0.4;
    d.x += d.vx;
    d.y += d.vy;
    d.angle += d.angularV;
    d.vx *= 0.98;
    if (d.y >= ground) { d.y = ground; d.vy *= -0.3; d.vx *= 0.8; }
    d.life -= 0.004;
    d.alpha = d.life;
  }
  debris = debris.filter(d=>d.life>0 && debris.length<300 ? true : d.life>0.5);
}

function updateBlocks() {
  const ground = canvas.height - 60;
  for (let b of blocks) {
    if (!b.falling || b.destroyed) continue;
    b.vy += 0.5;
    b.x += b.vx;
    b.y += b.vy;
    b.angle += b.angularV;
    b.vx *= 0.97;
    b.angularV *= 0.97;
    if (b.y + b.h >= ground) {
      b.y = ground - b.h;
      b.vy *= -0.2;
      b.vx *= 0.7;
      b.angularV *= 0.5;
      if (Math.abs(b.vy) < 1) { b.vy = 0; b.falling = false; }
    }
  }
}

// ── PARTICLES ────────────────────────────────
function spawnExplosion(x, y, def) {
  const N = 60 + def.power * 10;
  for (let i=0;i<N;i++) {
    const angle = Math.random()*Math.PI*2;
    const speed = 2 + Math.random()*def.power*2;
    const colors = [def.color, '#ffcc00', '#ff6600', '#ffffff', '#ffaa00'];
    particles.push({
      x, y,
      vx: Math.cos(angle)*speed,
      vy: Math.sin(angle)*speed - Math.random()*4,
      size: 2+Math.random()*8,
      color: colors[Math.floor(Math.random()*colors.length)],
      alpha:1, life:1,
      decay: 0.015+Math.random()*0.02,
      type: Math.random()<0.3?'spark':'ember',
      glow: def.glowColor,
    });
  }
  // Smoke
  for (let i=0;i<20;i++) {
    particles.push({
      x: x+(Math.random()-0.5)*20,
      y: y+(Math.random()-0.5)*20,
      vx: (Math.random()-0.5)*1.5,
      vy: -1-Math.random()*2,
      size: 15+Math.random()*25,
      color: '#334',
      alpha:0.6, life:1,
      decay:0.008,
      type:'smoke',
      glow:null,
    });
  }
}

function spawnClickParticles(x, y) {
  const def = BOMBS[selectedBomb];
  for (let i=0;i<12;i++) {
    const angle = Math.random()*Math.PI*2;
    particles.push({
      x, y,
      vx: Math.cos(angle)*3,
      vy: Math.sin(angle)*3,
      size: 3+Math.random()*4,
      color: def.color,
      alpha:1, life:1,
      decay:0.04,
      type:'spark',
      glow: def.glowColor,
    });
  }
}

function updateParticles() {
  for (let p of particles) {
    p.x += p.vx;
    p.y += p.vy;
    if (p.type!=='smoke') p.vy += 0.2;
    p.vx *= 0.97;
    p.life -= p.decay;
    p.alpha = p.life;
    if (p.type==='smoke') { p.size += 0.3; p.alpha = p.life*0.4; }
  }
  particles = particles.filter(p=>p.life>0);
  if (particles.length>800) particles.splice(0, particles.length-800);
}

// ── SCREEN SHAKE ────────────────────────────
let shakeX=0, shakeY=0, shakeAmt=0;
function screenShake(amt) { shakeAmt = Math.max(shakeAmt, amt); }

// ── HUD ──────────────────────────────────────
function updateHUD() {
  document.getElementById('hud-score').textContent = `SCORE: ${gameScore.toLocaleString()}`;
  document.getElementById('destruction-fill').style.width = Math.min(destructionPct,100)+'%';
  document.getElementById('destruction-pct').textContent = destructionPct+'%';
}
function updateDetonateBtn() {
  const btn = document.getElementById('detonate-btn');
  const count = placedBombs.length;
  btn.disabled = count === 0;
  document.getElementById('bomb-count-placed').textContent = count + ' EXPLOSIEVEN';
}

// ── WIN / LOSE ───────────────────────────────
function checkWinCondition() {
  const won = destructionPct >= currentLevel.target;
  const stars = won ? (
    destructionPct >= currentLevel.target+20 ? 3 :
    destructionPct >= currentLevel.target+10 ? 2 : 1
  ) : 0;

  if (won) {
    if (!completedLevels.includes(currentLevel.id)) {
      completedLevels.push(currentLevel.id);
      localStorage.setItem('abel123_completed', JSON.stringify(completedLevels));
    }
    highScores.push({ level: currentLevel.id, name: currentLevel.name, score: gameScore });
    localStorage.setItem('abel123_scores', JSON.stringify(highScores));
  }

  const starsHtml = '⭐'.repeat(stars) + '☆'.repeat(3-stars);

  setTimeout(() => {
    const result = document.getElementById('result-content');
    result.innerHTML = `
      <div class="result-title ${won?'win':'lose'}">${won?'GESLOOPT!':'MISLUKT'}</div>
      <div class="result-stars">${starsHtml}</div>
      <div class="result-stats">
        <div class="result-stat">
          <span class="result-stat-label">VERNIELING</span>
          <span class="result-stat-value">${destructionPct}%</span>
        </div>
        <div class="result-stat">
          <span class="result-stat-label">DOEL</span>
          <span class="result-stat-value">${currentLevel.target}%</span>
        </div>
        <div class="result-stat">
          <span class="result-stat-label">SCORE</span>
          <span class="result-stat-value">${gameScore.toLocaleString()}</span>
        </div>
      </div>
      <div class="result-btns">
        ${won && currentLevel.id < LEVELS.length ? `<button class="result-btn primary" onclick="startLevel(LEVELS[${currentLevel.id}])">VOLGENDE LEVEL ▶</button>` : ''}
        <button class="result-btn primary" onclick="startLevel(currentLevel)">OPNIEUW ↺</button>
        <button class="result-btn secondary" onclick="showLevelSelect()">LEVEL SELECT</button>
        <button class="result-btn secondary" onclick="showMenu()">MENU</button>
      </div>
    `;
    showScreen('result');
  }, 800);
}

// ── RENDER ───────────────────────────────────
function render() {
  if (!canvas || !ctx) return;
  ctx.clearRect(0,0,canvas.width,canvas.height);

  // Shake
  if (shakeAmt > 0.1) {
    shakeX = (Math.random()-0.5)*shakeAmt;
    shakeY = (Math.random()-0.5)*shakeAmt;
    shakeAmt *= 0.85;
  } else { shakeX=0; shakeY=0; shakeAmt=0; }
  ctx.save();
  ctx.translate(shakeX, shakeY);

  // Sky gradient
  const sky = ctx.createLinearGradient(0,0,0,canvas.height);
  sky.addColorStop(0, '#020408');
  sky.addColorStop(0.6, '#050a14');
  sky.addColorStop(1, '#0a0a0a');
  ctx.fillStyle = sky;
  ctx.fillRect(0,0,canvas.width,canvas.height);

  // Grid
  drawGrid();

  // Ground
  drawGround();

  // Smoke (back)
  for (let p of particles) {
    if (p.type!=='smoke') continue;
    ctx.globalAlpha = p.alpha;
    const g = ctx.createRadialGradient(p.x,p.y,0,p.x,p.y,p.size);
    g.addColorStop(0, 'rgba(40,50,60,0.5)');
    g.addColorStop(1, 'rgba(20,25,30,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(p.x,p.y,p.size,0,Math.PI*2); ctx.fill();
  }
  ctx.globalAlpha = 1;

  // Debris
  for (let d of debris) {
    ctx.save();
    ctx.globalAlpha = d.alpha;
    ctx.translate(d.x, d.y);
    ctx.rotate(d.angle);
    ctx.fillStyle = d.color;
    ctx.fillRect(-d.w/2, -d.h/2, d.w, d.h);
    ctx.restore();
  }

  // Blocks
  for (let b of blocks) {
    if (b.destroyed) continue;
    ctx.save();
    if (b.falling) {
      ctx.translate(b.x+b.w/2, b.y+b.h/2);
      ctx.rotate(b.angle);
      ctx.translate(-b.w/2, -b.h/2);
    } else {
      ctx.translate(b.x, b.y);
    }
    const mat = MATERIALS[b.mat];
    const dmgRatio = 1 - b.hp/b.maxHp;
    ctx.fillStyle = lerpColor(mat.color, '#111', dmgRatio*0.5);
    ctx.fillRect(0,0,b.w,b.h);
    ctx.strokeStyle = mat.stroke;
    ctx.lineWidth = 1;
    ctx.strokeRect(0,0,b.w,b.h);
    // Cracks
    if (dmgRatio > 0.3) {
      ctx.strokeStyle = 'rgba(0,0,0,0.6)';
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(Math.random()*b.w, 0);
      ctx.lineTo(Math.random()*b.w, b.h);
      ctx.stroke();
    }
    // Glow for structural
    if (b.structural) {
      ctx.strokeStyle = 'rgba(0,200,255,0.15)';
      ctx.lineWidth = 1;
      ctx.strokeRect(-1,-1,b.w+2,b.h+2);
    }
    ctx.restore();
  }

  // Placed bombs
  for (let bomb of placedBombs) {
    if (bomb.exploded) continue;
    const def = BOMBS[bomb.type];
    const t = Date.now()/1000;
    const pulse = 0.7 + 0.3*Math.sin(t*6);
    // Blast radius preview (faint)
    ctx.beginPath();
    ctx.arc(bomb.x, bomb.y, def.radius, 0, Math.PI*2);
    ctx.fillStyle = def.glowColor.replace('0.6','0.05').replace('0.5','0.05').replace('0.7','0.05');
    ctx.fill();
    ctx.strokeStyle = def.glowColor.replace('0.6','0.3').replace('0.5','0.3').replace('0.7','0.3');
    ctx.lineWidth = 1;
    ctx.setLineDash([4,4]);
    ctx.stroke();
    ctx.setLineDash([]);
    // Bomb icon
    ctx.save();
    ctx.translate(bomb.x, bomb.y);
    ctx.scale(pulse, pulse);
    ctx.beginPath();
    ctx.arc(0, 0, 10, 0, Math.PI*2);
    ctx.fillStyle = def.color;
    ctx.shadowColor = def.color;
    ctx.shadowBlur = 15;
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    // Fuse
    ctx.beginPath();
    ctx.moveTo(0,-10);
    ctx.lineTo(5,-18);
    ctx.strokeStyle = '#ffcc00';
    ctx.lineWidth = 2;
    ctx.stroke();
    // Spark on fuse
    ctx.beginPath();
    ctx.arc(5,-18,2,0,Math.PI*2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.restore();
    // Label
    ctx.font = 'bold 8px Orbitron, monospace';
    ctx.fillStyle = def.color;
    ctx.textAlign = 'center';
    ctx.fillText(def.name, bomb.x, bomb.y+22);
  }

  // Particles (sparks/embers)
  for (let p of particles) {
    if (p.type==='smoke') continue;
    ctx.save();
    ctx.globalAlpha = p.alpha;
    if (p.glow) {
      ctx.shadowColor = p.glow;
      ctx.shadowBlur = 8;
    }
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size/2, 0, Math.PI*2);
    ctx.fill();
    ctx.restore();
  }
  ctx.globalAlpha = 1;

  ctx.restore(); // end shake
}

function drawGrid() {
  ctx.strokeStyle = 'rgba(0,245,255,0.04)';
  ctx.lineWidth = 1;
  const gsize = 40;
  for (let x=0;x<canvas.width;x+=gsize) {
    ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,canvas.height); ctx.stroke();
  }
  for (let y=0;y<canvas.height;y+=gsize) {
    ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(canvas.width,y); ctx.stroke();
  }
}

function drawGround() {
  const gy = canvas.height - 60;
  const grad = ctx.createLinearGradient(0,gy,0,canvas.height);
  grad.addColorStop(0,'#1a1a2e');
  grad.addColorStop(0.1,'#0f0f1a');
  grad.addColorStop(1,'#050510');
  ctx.fillStyle = grad;
  ctx.fillRect(0,gy,canvas.width,canvas.height-gy);
  ctx.strokeStyle = 'rgba(0,245,255,0.3)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0,gy); ctx.lineTo(canvas.width,gy); ctx.stroke();
  // Ground glow
  ctx.strokeStyle = 'rgba(0,245,255,0.06)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(0,gy+1); ctx.lineTo(canvas.width,gy+1); ctx.stroke();
}

function lerpColor(c1, c2, t) {
  const p = (c) => parseInt(c.slice(1,3),16);
  const r1=p(c1), g1=parseInt(c1.slice(3,5),16), b1=parseInt(c1.slice(5,7),16);
  const r2=p(c2), g2=parseInt(c2.slice(3,5),16), b2=parseInt(c2.slice(5,7),16);
  const r=Math.round(r1+(r2-r1)*t), g=Math.round(g1+(g2-g1)*t), b=Math.round(b1+(b2-b1)*t);
  return `rgb(${r},${g},${b})`;
}

// ── GAME LOOP ────────────────────────────────
function gameLoop() {
  if (!gameRunning) return;
  updateParticles();
  updateDebris();
  updateBlocks();
  render();
  animFrame = requestAnimationFrame(gameLoop);
}

// ── MENU ANIMATION ───────────────────────────
let menuCanvas, menuCtx, menuParticles=[], menuRunning=false;

function startMenuAnimation() {
  menuCanvas = document.getElementById('bg-canvas');
  if (!menuCanvas) return;
  menuCanvas.width = window.innerWidth;
  menuCanvas.height = window.innerHeight;
  menuCtx = menuCanvas.getContext('2d');
  menuRunning = true;

  menuParticles = [];
  for (let i=0;i<50;i++) spawnMenuParticle();
  menuLoop();
}

function spawnMenuParticle() {
  menuParticles.push({
    x: Math.random()*window.innerWidth,
    y: Math.random()*window.innerHeight,
    vx: (Math.random()-0.5)*0.5,
    vy: -0.3-Math.random()*0.5,
    size: 1+Math.random()*2,
    alpha: Math.random(),
    color: Math.random()<0.5?'#ff2222':Math.random()<0.5?'#ff8800':'#00f5ff',
  });
}

function menuLoop() {
  if (!menuRunning) return;
  menuCtx.fillStyle = 'rgba(0,0,0,0.15)';
  menuCtx.fillRect(0,0,menuCanvas.width,menuCanvas.height);

  for (let p of menuParticles) {
    p.x += p.vx; p.y += p.vy;
    p.alpha -= 0.003;
    menuCtx.globalAlpha = Math.max(0,p.alpha);
    menuCtx.fillStyle = p.color;
    menuCtx.beginPath();
    menuCtx.arc(p.x,p.y,p.size,0,Math.PI*2);
    menuCtx.fill();
  }
  menuCtx.globalAlpha = 1;

  menuParticles = menuParticles.filter(p=>p.alpha>0);
  while (menuParticles.length<50) spawnMenuParticle();

  requestAnimationFrame(menuLoop);
}

// ── INIT ─────────────────────────────────────
window.addEventListener('resize', () => {
  if (gameRunning && canvas) resizeCanvas();
  if (menuCanvas) {
    menuCanvas.width = window.innerWidth;
    menuCanvas.height = window.innerHeight;
  }
});

document.addEventListener('DOMContentLoaded', () => {
  showMenu();
});
