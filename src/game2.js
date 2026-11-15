
// ================= CANVAS & VIEW =================
const canvas = $('game'); const ctx = canvas.getContext('2d');
let W = 0, H = 0, DPR = 1, VS = 1, VW = 0, VH = 0;
function resize() {
  DPR = Math.min(2, window.devicePixelRatio || 1); W = window.innerWidth; H = window.innerHeight;
  canvas.width = Math.floor(W * DPR); canvas.height = Math.floor(H * DPR); canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
  VS = clamp(Math.min(W, H) / 720, 0.55, 1.25); VW = W / VS; VH = H / VS;
}
window.addEventListener('resize', resize); resize();

// ================= STATE =================
let state = 'TITLE';   // TITLE | PLAYING | LEVELUP | PAUSED | END
let G = null;          // current run
const cam = { x: 0, y: 0 };
const embers = [];
for (let i = 0; i < 60; i++) embers.push({ x: Math.random(), y: Math.random(), vy: rand(0.015, 0.045), vx: rand(-0.01, 0.01), r: rand(1, 2.6), a: rand(0.2, 0.75) });

// ================= INPUT =================
const keys = {};
const joy = { active: false, id: null, ox: 0, oy: 0, x: 0, y: 0 };
const isTyping = () => document.activeElement && document.activeElement.tagName === 'INPUT';
window.addEventListener('keydown', e => {
  if (isTyping()) { if (e.code === 'Enter' && state === 'LEVELUP') doForge(); if (e.code === 'Escape') document.activeElement.blur(); return; }
  keys[e.code] = true;
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
  if (e.code === 'Escape' || e.code === 'KeyP') { if (state === 'PLAYING') pauseGame(); else if (state === 'PAUSED') resumeGame(); }
  if (e.code === 'KeyM') { save.settings.sound = !save.settings.sound; persist(); SFX.apply(); syncToggles(); toast(save.settings.sound ? 'Sound on' : 'Sound muted'); }
  if (state === 'PLAYING' && e.code === 'KeyE') consultOracle();
  if (state === 'LEVELUP') {
    const n = { Digit1: 0, Digit2: 1, Digit3: 2, Numpad1: 0, Numpad2: 1, Numpad3: 2 }[e.code];
    if (n !== undefined && luChoices[n]) chooseCard(n);
    if (e.code === 'KeyR') doReroll();
  }
  if (state === 'TITLE' && e.code === 'Enter' && !$('titleScreen').classList.contains('hidden')) startRun();
});
window.addEventListener('keyup', e => { keys[e.code] = false; });
function clearInput() { for (const k in keys) keys[k] = false; joy.active = false; joy.id = null; $('joy').style.display = 'none'; }

canvas.addEventListener('pointerdown', e => {
  if (state !== 'PLAYING') return;
  if (joy.active && e.pointerId !== joy.id) return;
  joy.active = true; joy.id = e.pointerId; joy.ox = e.clientX; joy.oy = e.clientY; joy.x = 0; joy.y = 0;
  const j = $('joy'); j.style.display = 'block'; j.style.left = e.clientX + 'px'; j.style.top = e.clientY + 'px';
  $('joyStick').style.transform = 'translate(0px,0px)';
  $('touchHint').classList.add('hidden');
  try { canvas.setPointerCapture(e.pointerId); } catch (_) { }
  e.preventDefault();
});
canvas.addEventListener('pointermove', e => {
  if (!joy.active || e.pointerId !== joy.id) return;
  let dx = e.clientX - joy.ox, dy = e.clientY - joy.oy; const d = Math.hypot(dx, dy); const max = 50;
  if (d > max) { dx = dx / d * max; dy = dy / d * max; }
  joy.x = d < 6 ? 0 : dx / max; joy.y = d < 6 ? 0 : dy / max;
  $('joyStick').style.transform = `translate(${dx}px,${dy}px)`;
});
const endJoy = e => { if (e.pointerId !== joy.id) return; joy.active = false; joy.id = null; joy.x = joy.y = 0; $('joy').style.display = 'none'; };
canvas.addEventListener('pointerup', endJoy); canvas.addEventListener('pointercancel', endJoy);
document.addEventListener('visibilitychange', () => { if (document.hidden && state === 'PLAYING') pauseGame(); });
window.addEventListener('blur', () => { if (state === 'PLAYING') pauseGame(); });
document.addEventListener('contextmenu', e => { if (state === 'PLAYING') e.preventDefault(); });

// ================= RUN SETUP =================
const xpNeed = lv => Math.round(4 + (lv - 1) * 4 + Math.pow(lv - 1, 1.6) * 0.9);
const hpScale = () => 1 + G.t / 80 + Math.pow(G.t / 260, 2) + (G.endless ? Math.pow(Math.max(0, G.t - DAWN) / 120, 2) : 0);

function newRun(hunterId) {
  const h = HUNTERS.find(x => x.id === hunterId) || HUNTERS[0];
  const m = id => save.meta[id] || 0;
  const p = {
    x: 0, y: 0, r: 14, hunter: h,
    maxHp: 100 + m('vitality') * 10 + (h.stats.maxHp || 0), hp: 0,
    speed: 165 * (1 + m('swift') * 0.05) * (h.stats.speed || 1),
    baseDmg: (1 + m('might') * 0.05) * (h.stats.dmg || 1), armor: m('armor'), magnet: 100 * (1 + m('magnet') * 0.1),
    cdMult: 1 - m('cooldown') * 0.03, area: h.stats.area || 1, regen: h.stats.regen || 0,
    xpMult: 1 + m('growth') * 0.05, goldMult: 1 + m('greed') * 0.1,
    level: 1, xp: 0, next: xpNeed(1), facing: 1, dirX: 1, dirY: 0, iframes: 0, anim: 0, moving: false,
    revives: m('revival'), rerolls: 1 + m('reroll'),
    weapons: {}, passives: {}, order: [], porder: [],
    bless: { dmg: 1, speed: 1, magnet: 1, cd: 1, area: 1, regen: 0, xp: 1 }, S: {}
  };
  p.hp = p.maxHp;
  G = {
    p, t: 0, kills: 0, gold: 0, banked: 0, enemies: [], projs: [], flasks: [], pools: [], ebullets: [], gems: [], pickups: [], props: [], particles: [], texts: [], effects: [], decals: [],
    spawnAcc: 0, nextEvent: 42, eventIdx: 0, bossIdx: 0, nextBossT: BOSS_TIMES[0], boss: null, pendingLevels: 0, chestQueue: 0,
    timeScale: 1, slowT: 0, shake: 0, dmgBy: {}, omen: null, oracleCD: 0, oracleAuto: 16, propTimer: 4, bloodMoon: 0,
    won: false, endless: false, lostXP: 0, crystalT: 5, dying: 0, dawnT: 0, xpChain: 0, xpChainT: 0, lastLowLine: -99, saidDawn: false, arsenalDirty: true,
    stats: { bosses: 0, chests: 0, taken: 0 }
  };
  cam.x = 0; cam.y = 0;
  addWeapon(h.weapon);
  recalc();
}
function recalc() {
  const p = G.p, pv = id => p.passives[id] || 0, b = p.bless, om = G.omen ? G.omen.id : '';
  p.S = {
    dmg: p.baseDmg * (1 + 0.1 * pv('might')) * b.dmg * (om === 'fury' ? 1.5 : 1),
    speed: p.speed * (1 + 0.08 * pv('speed')) * b.speed * (om === 'wind' ? 1.3 : 1),
    magnet: p.magnet * (1 + 0.3 * pv('magnet')) * b.magnet * (om === 'greed' ? 4 : 1),
    cd: Math.max(0.35, p.cdMult * (1 - 0.07 * pv('tome')) * b.cd),
    area: p.area * (1 + 0.1 * pv('area')) * b.area,
    regen: p.regen + 0.3 * pv('regen') + b.regen + (om === 'blood' ? 3 : 0),
    armor: p.armor + pv('armor'),
    xp: p.xpMult * (1 + 0.08 * pv('crown')) * b.xp * (om === 'hunt' ? 2 : 1) * (G.bloodMoon > 0 ? 1.5 : 1),
  };
  G.arsenalDirty = true;
}
function addWeapon(id) { const p = G.p; p.weapons[id] = { lv: 1, evo: false, timer: 0.3, angle: 0 }; p.order.push(id); G.arsenalDirty = true; }
function heal(v, show) {
  const p = G.p; const before = p.hp; p.hp = Math.min(p.maxHp, p.hp + v);
  if (show && p.hp - before >= 1) addText('+' + Math.round(p.hp - before), p.x, p.y - 30, '#4ade80', 1.2);
}

// ================= FX HELPERS =================
function addText(text, x, y, color, scale) {
  if (G.texts.length > 110) G.texts.shift();
  G.texts.push({ text: String(text), x, y, color, scale: scale || 1, life: 0.75, max: 0.75 });
}
function addParticle(x, y, vx, vy, life, r, color, grav, drag) {
  if (G.particles.length > 700) return;
  G.particles.push({ x, y, vx, vy, life, max: life, r, color, grav: grav || 0, drag: drag === undefined ? 3 : drag });
}
function burst(x, y, n, color, spd, life, r) { for (let i = 0; i < n; i++) { const a = Math.random() * TAU, s = rand(0.3, 1) * (spd || 140); addParticle(x, y, Math.cos(a) * s, Math.sin(a) * s, rand(0.6, 1) * (life || 0.5), rand(0.6, 1.2) * (r || 3), color); } }
function addShake(v) { if (save.settings.shake) G.shake = Math.min(18, Math.max(G.shake, v)); }
function addDecal(x, y, r, color) { if (G.decals.length > 140) G.decals.shift(); G.decals.push({ x, y, r, color, rot: Math.random() * TAU, sx: rand(0.6, 1.2) }); }
function flashScreen() { const f = $('fx-flash'); f.classList.add('on'); setTimeout(() => f.classList.remove('on'), 60); }
let hurtTO = null;
function flashHurt() { const f = $('fx-hurt'); f.classList.add('on'); clearTimeout(hurtTO); hurtTO = setTimeout(() => f.classList.remove('on'), 70); }
let bannerTO = null;
function banner(title, sub, color) {
  const b = $('banner'); $('bannerT').textContent = title; $('bannerS').textContent = sub || ''; $('bannerT').style.color = color || '#ef4444';
  b.classList.remove('show'); void b.offsetWidth; b.classList.add('show'); clearTimeout(bannerTO); bannerTO = setTimeout(() => b.classList.remove('show'), 2900);
}
function toast(msg) { if (state === 'PLAYING' && G) addText(msg, G.p.x, G.p.y - 50, '#e9d5ff', 1.1); }

// Oracle speech
let oracleTO = null;
function oracleSay(text, status) {
  $('oracleText').textContent = '"' + text + '"'; $('oracleStatus').textContent = status || 'Speaks...';
  const o = $('oracle'); o.classList.add('speak'); clearTimeout(oracleTO);
  oracleTO = setTimeout(() => { o.classList.remove('speak'); $('oracleStatus').textContent = 'Observing...'; }, 4200);
  if (G) G.oracleAuto = rand(22, 32);
}
function topWeaponName() { const p = G.p; let best = null, bv = -1; for (const id of p.order) { const v = G.dmgBy[id] || 0; if (v > bv) { bv = v; best = id; } } const w = best && p.weapons[best]; return w ? (w.evo ? WEAPONS[best].evo : WEAPONS[best].name) : 'blade'; }
function oracleAutoLine() {
  const p = G.p; const ctxv = { kills: G.kills, level: p.level, weapon: topWeaponName() };
  if (p.hp / p.maxHp < 0.3) return oracleSay(pick(ORACLE.low), 'Warns...');
  if (G.t > DAWN - 45 && G.t < DAWN && !G.saidDawn) { G.saidDawn = true; return oracleSay(pick(ORACLE.dawnNear), 'Hopes...'); }
  if (Math.random() < 0.5 && G.kills > 30) return oracleSay(fillTpl(pick(ORACLE.strong), ctxv), 'Observes...');
  oracleSay(pick(ORACLE.idle), 'Whispers...');
}
function consultOracle() {
  if (!G || state !== 'PLAYING' || G.oracleCD > 0) return;
  const om = pick(OMENS.filter(o => !G.omen || o.id !== G.omen.id));
  G.omen = { id: om.id, name: om.name, t: om.dur, max: om.dur }; G.oracleCD = 60;
  if (om.id === 'hunt') { for (let i = 0; i < 18 + Math.floor(G.t / 20); i++) spawnEnemy(pickType(), true); }
  if (om.id === 'greed') G.gems.forEach(g => g.mag = true);
  recalc(); SFX.play('omen');
  oracleSay(`${om.name}: ${om.text} (${om.eff}, ${om.dur}s)`, 'Divines!');
  burst(G.p.x, G.p.y, 30, '#c084fc', 220, 0.8, 3);
  G.effects.push({ type: 'ring', x: G.p.x, y: G.p.y, r: 140, life: 0.5, max: 0.5, color: '#c084fc', follow: true });
}

// ================= SPATIAL GRID =================
const CELL = 48; const grid = new Map();
const cellKey = (cx, cy) => ((cx & 0xffff) << 16) | (cy & 0xffff);
function buildGrid() {
  grid.clear();
  for (const e of G.enemies) { if (e.dead) continue; const k = cellKey(Math.floor(e.x / CELL), Math.floor(e.y / CELL)); let a = grid.get(k); if (!a) { a = []; grid.set(k, a); } a.push(e); }
}
function query(x, y, r, fn) {
  const x0 = Math.floor((x - r - 40) / CELL), x1 = Math.floor((x + r + 40) / CELL), y0 = Math.floor((y - r - 40) / CELL), y1 = Math.floor((y + r + 40) / CELL);
  for (let cx = x0; cx <= x1; cx++) for (let cy = y0; cy <= y1; cy++) {
    const a = grid.get(cellKey(cx, cy)); if (!a) continue;
    for (let i = 0; i < a.length; i++) { const e = a[i]; if (e.dead) continue; const rr = r + e.r, dx = e.x - x, dy = e.y - y; if (dx * dx + dy * dy <= rr * rr) { if (fn(e) === true) return; } }
  }
}
function nearestEnemies(x, y, k, range) {
  const best = []; const r2 = range * range;
  for (const e of G.enemies) {
    if (e.dead) continue; const d = (e.x - x) ** 2 + (e.y - y) ** 2; if (d > r2) continue;
    if (best.length < k) { best.push([d, e]); best.sort((a, b) => a[0] - b[0]); }
    else if (d < best[k - 1][0]) { best[k - 1] = [d, e]; best.sort((a, b) => a[0] - b[0]); }
  }
  return best.map(b => b[1]);
}
const inView = (x, y, m) => Math.abs(x - cam.x) < VW / 2 + (m || 0) && Math.abs(y - cam.y) < VH / 2 + (m || 0);

// ================= ENEMIES =================
class Enemy {
  constructor(type, x, y, opts) {
    opts = opts || {}; const d = ENEMIES[type] || ENEMIES.skull; const hm = hpScale();
    this.type = type; this.x = x; this.y = y; this.elite = !!opts.elite; this.boss = null;
    const es = this.elite ? 1.6 : 1;
    this.r = d.r * es; this.scale = es; this.maxHp = this.hp = d.hp * hm * (this.elite ? 14 : 1);
    this.spd = d.spd * rand(0.9, 1.1) * (this.elite ? 1.08 : 1); this.dmg = d.dmg * (1 + G.t / 380) * (this.elite ? 1.5 : 1);
    this.xp = Math.round(d.xp * (1 + G.t / 300) * (this.elite ? 12 : 1) * 10) / 10; this.color = d.color;
    this.flash = 0; this.kx = 0; this.ky = 0; this.hcd = {}; this.phase = Math.random() * TAU; this.t = 0; this.slow = 0;
    this.atk = rand(1, 3); this.st = 0; this.mode = 0; this.dead = false; this.fixed = opts.dir || null; this.life = opts.life || 0;
  }
  update(dt) {
    const p = G.p; this.t += dt; if (this.flash > 0) this.flash -= dt;
    let dx = p.x - this.x, dy = p.y - this.y; const d = Math.hypot(dx, dy) || 1; dx /= d; dy /= d;
    let spd = this.spd * (this.slow > 0 ? 0.55 : 1); if (this.slow > 0) this.slow -= dt;
    let mx = dx, my = dy;
    if (this.boss) { const r = bossUpdate(this, dt, dx, dy, d); mx = r[0]; my = r[1]; spd = r[2]; }
    else if (this.fixed) { mx = this.fixed.x; my = this.fixed.y; spd *= 1.25; this.life -= dt; if (this.life <= 0) this.remove = true; }
    else if (this.type === 'bat') { const w = Math.sin(this.t * 5 + this.phase) * 0.7; mx = dx - dy * w; my = dy + dx * w; }
    else if (this.type === 'wraith') {
      if (d < 220) { mx = -dx; my = -dy; spd *= 0.7; } else if (d < 300) { mx = -dy; my = dx; spd *= 0.5; }
      this.atk -= dt;
      if (this.atk <= 0 && d < 520) { this.atk = rand(2.6, 3.6); shootBullet(this.x, this.y, Math.atan2(dy, dx), 190, 5 + G.t / 60, '#67e8f9'); }
    } else if (this.type === 'noble') {
      this.atk -= dt;
      if (this.mode === 0 && this.atk <= 0 && d < 360) { this.mode = 1; this.st = 0.5; this.ddx = dx; this.ddy = dy; }
      if (this.mode === 1) { spd = 0; this.st -= dt; if (this.st <= 0) { this.mode = 2; this.st = 0.38; SFX.play('dash'); } }
      else if (this.mode === 2) { mx = this.ddx; my = this.ddy; spd = this.spd * 4.6; this.st -= dt; if (Math.random() < 0.5) addParticle(this.x, this.y, 0, 0, 0.3, 5, '#7f1d1d', 0, 0); if (this.st <= 0) { this.mode = 0; this.atk = rand(3, 5); } }
    }
    this.x += (mx * spd + this.kx) * dt; this.y += (my * spd + this.ky) * dt;
    const decay = Math.max(0, 1 - 9 * dt); this.kx *= decay; this.ky *= decay;
    if (d < this.r + p.r - 2) hurtPlayer(this.dmg);
    // recycle stragglers left far behind
    if (!this.boss && !this.fixed && d > spawnRadius() * 1.7) { const a = Math.atan2(p.dirY, p.dirX) + rand(-1, 1); const R = spawnRadius(); this.x = p.x + Math.cos(a) * R; this.y = p.y + Math.sin(a) * R; }
  }
}
function spawnRadius() { return Math.hypot(VW / 2, VH / 2) + 50; }
function shootBullet(x, y, a, spd, dmg, color, r) { G.ebullets.push({ x, y, vx: Math.cos(a) * spd, vy: Math.sin(a) * spd, dmg, color, r: r || 6, life: 6 }); SFX.play('bullet'); }

function pickType() {
  const t = G.t; const L = [{ id: 'skull', w: t < 240 ? 10 : 5 }];
  if (t > 25) L.push({ id: 'bat', w: 6 });
  if (t > 80) L.push({ id: 'ghoul', w: 4 + t / 120 });
  if (t > 120) L.push({ id: 'wraith', w: 2.5 });
  if (t > 170) L.push({ id: 'noble', w: 3 + t / 150 });
  if (t > 320) L.push({ id: 'wolf', w: 2 + t / 200 });
  return weightedPick(L).id;
}
function spawnEnemy(type, aroundAll, opts) {
  const p = G.p; const R = spawnRadius();
  let a = Math.random() * TAU;
  if (!aroundAll && p.moving && Math.random() < 0.45) a = Math.atan2(p.dirY, p.dirX) + rand(-0.9, 0.9);
  const e = new Enemy(type, p.x + Math.cos(a) * R * rand(1, 1.15), p.y + Math.sin(a) * R * rand(1, 1.15), opts);
  G.enemies.push(e); return e;
}
function maxEnemies() { return W * H < 500000 ? 240 : 320; }
function spawner(dt) {
  const t = G.t; if (G.won && !G.endless) return;
  const rate = (1.2 + t / 30 + Math.pow(t / 150, 2)) * (G.bloodMoon > 0 ? 1.8 : 1) * (G.boss ? 0.45 : 1) * (G.omen && G.omen.id === 'hunt' ? 1.4 : 1);
  G.spawnAcc += rate * dt;
  while (G.spawnAcc >= 1) {
    G.spawnAcc -= 1;
    if (G.enemies.length >= maxEnemies()) { G.spawnAcc = 0; break; }
    const type = pickType();
    if (Math.random() < 0.12) { // small pack
      const e0 = spawnEnemy(type); const n = randi(2, 4);
      for (let i = 0; i < n; i++) G.enemies.push(new Enemy(type, e0.x + rand(-40, 40), e0.y + rand(-40, 40)));
    } else spawnEnemy(type);
  }
}

// Timed events: swarms, rings, elites, blood moons and bosses
function events(dt) {
  if (G.t >= G.nextBossT && !G.boss) {
    spawnBoss();
    G.bossIdx++;
    G.nextBossT = G.bossIdx < BOSS_TIMES.length ? BOSS_TIMES[G.bossIdx] : (Math.max(DAWN, G.t) + 120);
  }
  if (G.t >= G.nextEvent) {
    G.nextEvent += 45;
    if (Math.abs(G.t - G.nextBossT) < 12 || G.boss) return;
    const order = G.t > 280 ? ['swarm', 'ring', 'elite', 'moon'] : ['swarm', 'ring', 'elite'];
    const ev = order[G.eventIdx % order.length]; G.eventIdx++;
    const p = G.p, R = spawnRadius();
    SFX.play('event');
    if (ev === 'swarm') {
      const a = Math.random() * TAU; const n = 22 + Math.floor(G.t / 12); const dir = { x: -Math.cos(a), y: -Math.sin(a) };
      const px = -dir.y, py = dir.x;
      for (let i = 0; i < n; i++) { const off = rand(-260, 260), back = rand(0, 220); G.enemies.push(new Enemy('bat', p.x + Math.cos(a) * (R + back) + px * off, p.y + Math.sin(a) * (R + back) + py * off, { dir, life: 14 })); }
      banner('BAT SWARM', 'A black cloud descends', '#c084fc'); oracleSay(pick(ORACLE.events.swarm), 'Warns...');
    } else if (ev === 'ring') {
      const n = 32 + Math.floor(G.t / 9); const type = G.t > 240 ? 'ghoul' : 'skull';
      for (let i = 0; i < n; i++) { const a = i / n * TAU; G.enemies.push(new Enemy(type, p.x + Math.cos(a) * R * 0.85, p.y + Math.sin(a) * R * 0.85)); }
      banner('THE DEAD ENCIRCLE YOU', 'Break the ring', '#e7e5e4'); oracleSay(pick(ORACLE.events.ring), 'Warns...');
    } else if (ev === 'elite') {
      const type = G.t > 320 ? 'wolf' : G.t > 170 ? 'noble' : G.t > 80 ? 'ghoul' : 'skull';
      const n = G.t > 400 ? 2 : 1; for (let i = 0; i < n; i++) spawnEnemy(type, true, { elite: true });
      banner('AN ELITE HUNTS YOU', 'Slay it for a relic chest', '#fbbf24'); oracleSay(pick(ORACLE.events.elite), 'Warns...');
    } else if (ev === 'moon') {
      G.bloodMoon = 20; document.body.classList.add('bloodmoon'); recalc();
      banner('BLOOD MOON', 'More foes, richer souls', '#f43f5e'); oracleSay(pick(ORACLE.events.moon), 'Trembles...');
    }
  }
}

// ================= BOSSES =================
function spawnBoss() {
  const n = G.bossIdx; const def = n < BOSSES.length ? BOSSES[n] : pick(BOSSES);
  const p = G.p; const a = Math.random() * TAU; const R = spawnRadius() * 0.75;
  const e = new Enemy('skull', p.x + Math.cos(a) * R, p.y + Math.sin(a) * R);
  e.boss = def; e.type = 'boss'; e.r = def.r; e.scale = 1; e.color = def.color;
  e.maxHp = e.hp = def.hp * (1 + G.t / 300) * (n < 3 ? 1 : 1 + (n - 2) * 0.8); e.spd = def.spd; e.dmg = def.dmg * (1 + n * 0.15); e.xp = 0;
  e.atkIdx = 0; e.atk = 2.5; e.mode = 'idle'; e.spin = 0;
  G.enemies.push(e); G.boss = e;
  addShake(14); SFX.play('boss'); Music.intense = true;
  $('bossName').textContent = def.name; $('bossWrap').classList.remove('hidden');
  banner(def.name.split(',')[0].toUpperCase(), def.name.split(',')[1] ? def.name.split(',')[1].trim() : 'has risen', '#f87171');
  const taunt = pick(ORACLE.taunts[def.id]);
  oracleSay(`[${def.name.split(',')[0]}] ${taunt}`, 'BOSS!');
  addText('"' + taunt + '"', e.x, e.y - 60, '#fca5a5', 1.2);
}
function bossUpdate(e, dt, dx, dy, d) {
  const def = e.boss; const enr = e.hp < e.maxHp * 0.5; const p = G.p;
  let mx = dx, my = dy, spd = e.spd * (enr ? 1.2 : 1);
  if (e.mode === 'idle') {
    if (def.id === 'lich' && d < 260) { mx = -dy; my = dx; }
    e.atk -= dt * (enr ? 1.5 : 1);
    if (e.atk <= 0) {
      const at = def.attacks[e.atkIdx % def.attacks.length]; e.atkIdx++;
      if (at === 'charge') { e.mode = 'tele'; e.st = 0.75; e.cdx = dx; e.cdy = dy; }
      else if (at === 'ring') { e.mode = 'ring'; e.st = 0; e.shots = enr ? 3 : 2; }
      else if (at === 'spiral') { e.mode = 'spiral'; e.st = 2.6; e.sh = 0; }
      else if (at === 'bats') { for (let i = 0; i < 8 + G.bossIdx * 2; i++) { const a = i / 8 * TAU; G.enemies.push(new Enemy('bat', e.x + Math.cos(a) * 60, e.y + Math.sin(a) * 60)); } burst(e.x, e.y, 30, '#7e22ce', 200, 0.6, 4); e.atk = 2.2; }
      else if (at === 'skullring') { const n = 26; for (let i = 0; i < n; i++) { const a = i / n * TAU; G.enemies.push(new Enemy('skull', p.x + Math.cos(a) * 300, p.y + Math.sin(a) * 300)); } e.atk = 2.6; G.effects.push({ type: 'ring', x: p.x, y: p.y, r: 300, life: 0.6, max: 0.6, color: '#a3e635' }); }
    }
  } else if (e.mode === 'tele') {
    spd = 0; e.st -= dt; const ang = Math.atan2(p.y - e.y, p.x - e.x); if (e.st > 0.25) { e.cdx = Math.cos(ang); e.cdy = Math.sin(ang); }
    if (e.st <= 0) { e.mode = 'dash'; e.st = 0.75; SFX.play('dash'); addShake(5); }
  } else if (e.mode === 'dash') {
    mx = e.cdx; my = e.cdy; spd = e.spd * 6.2; e.st -= dt; addParticle(e.x + rand(-20, 20), e.y + rand(-20, 20), 0, 0, 0.4, 8, '#4c0519', 0, 0);
    if (e.st <= 0) { e.mode = 'idle'; e.atk = 1.6; }
  } else if (e.mode === 'ring') {
    spd *= 0.3; e.st -= dt;
    if (e.st <= 0) { const n = 14 + G.bossIdx * 3; const off = Math.random() * TAU; for (let i = 0; i < n; i++) shootBullet(e.x, e.y, off + i / n * TAU, 165, 9 + G.bossIdx * 2, '#f43f5e', 7); e.shots--; e.st = 0.55; if (e.shots <= 0) { e.mode = 'idle'; e.atk = 2.2; } }
  } else if (e.mode === 'spiral') {
    spd *= 0.25; e.st -= dt; e.sh -= dt; e.spin += dt * 2.6;
    if (e.sh <= 0) { e.sh = enr ? 0.07 : 0.1; for (let k = 0; k < 3; k++) shootBullet(e.x, e.y, e.spin + k * TAU / 3, 150, 8 + G.bossIdx * 2, def.id === 'lich' ? '#a3e635' : '#f43f5e', 6); }
    if (e.st <= 0) { e.mode = 'idle'; e.atk = 2.4; }
  }
  return [mx, my, spd];
}

// ================= DAMAGE / DEATH =================
function damageEnemy(e, amt, wid, kb, kx, ky) {
  if (e.dead) return;
  const crit = Math.random() < 0.08; if (crit) amt *= 2;
  e.hp -= amt; e.flash = 0.09; G.dmgBy[wid] = (G.dmgBy[wid] || 0) + Math.min(amt, Math.max(0, e.hp + amt));
  if (kb && !e.boss) { const k = e.elite ? 0.25 : 1; e.kx += kx * kb * k; e.ky += ky * kb * k; }
  if (save.settings.numbers) addText(Math.round(amt), e.x + rand(-8, 8), e.y - e.r - 4, crit ? '#fbbf24' : '#ffffff', crit ? 1.45 : 1);
  SFX.play('hit');
  if (e.hp <= 0) killEnemy(e);
}
function dropGem(x, y, v) {
  if (G.gems.length >= 260) { const g = G.gems[Math.floor(Math.random() * G.gems.length)]; g.v += v; return; }
  const a = Math.random() * TAU; G.gems.push({ x, y, v, vx: Math.cos(a) * 60, vy: Math.sin(a) * 60, mag: false, t: Math.random() * 6 });
}
function dropPickup(type, x, y, v) { G.pickups.push({ type, x, y, v: v || 0, t: 0, vy: -120 }); }
function killEnemy(e) {
  e.dead = true; G.kills++;
  SFX.play('kill');
  const col = e.type === 'boss' ? e.color : (ENEMIES[e.type] || ENEMIES.skull).color;
  burst(e.x, e.y, e.boss ? 80 : e.elite ? 30 : 8, col, e.boss ? 360 : 160, 0.55, e.boss ? 6 : 3);
  burst(e.x, e.y, e.boss ? 40 : 5, '#991b1b', 120, 0.6, 3);
  if (Math.random() < 0.35 || e.elite || e.boss) addDecal(e.x, e.y, e.r * rand(0.8, 1.4), e.type === 'wraith' ? 'rgba(103,232,249,0.12)' : 'rgba(127,29,29,0.35)');
  if (e.boss) return bossDefeated(e);
  dropGem(e.x, e.y, e.xp);
  const r = Math.random();
  if (e.elite) { dropPickup('chest', e.x, e.y); dropPickup('gold', e.x + 20, e.y, 10); addShake(8); }
  else if (r < 0.0045) dropPickup('heart', e.x, e.y);
  else if (r < 0.006) dropPickup('magnet', e.x, e.y);
  else if (r < 0.0075) dropPickup('bomb', e.x, e.y);
  else if (r < 0.035) dropPickup('gold', e.x, e.y, 1);
}
function bossDefeated(e) {
  G.boss = null; G.stats.bosses++; Music.intense = false; $('bossWrap').classList.add('hidden');
  SFX.play('bossdie'); addShake(18); flashScreen(); G.timeScale = 0.3; G.slowT = 1.1;
  for (let i = 0; i < 26; i++) { const a = Math.random() * TAU, d = rand(10, 90); dropGem(e.x + Math.cos(a) * d, e.y + Math.sin(a) * d, 10 + G.bossIdx * 4); }
  dropPickup('chest', e.x, e.y); dropPickup('heart', e.x + 30, e.y + 10); dropPickup('gold', e.x - 30, e.y, 40);
  G.effects.push({ type: 'ring', x: e.x, y: e.y, r: 320, life: 0.8, max: 0.8, color: '#fde047' });
  banner('BOSS SLAIN', e.boss.name.split(',')[0], '#fde047');
  oracleSay(fillTpl(pick(ORACLE.bossDead), { boss: e.boss.name.split(',')[0] }), 'Exults!');
  if (G.dawnBurn) return;
}

function hurtPlayer(dmg) {
  const p = G.p; if (p.iframes > 0 || G.dying > 0) return;
  const real = Math.max(1, dmg - p.S.armor);
  p.hp -= real; p.iframes = 0.5; G.stats.taken += real;
  addShake(6); SFX.play('hurt'); flashHurt();
  addText('-' + Math.round(real), p.x, p.y - 26, '#f87171', 1.3);
  burst(p.x, p.y, 8, '#dc2626', 150, 0.4, 3);
  if (p.hp <= 0) {
    if (p.revives > 0) {
      p.revives--; p.hp = p.maxHp * 0.5; p.iframes = 2.5;
      query(p.x, p.y, 280, en => { if (!en.boss) damageEnemy(en, 9999, 'revive', 0, 0, 0); else damageEnemy(en, en.maxHp * 0.05, 'revive', 0, 0, 0); });
      G.ebullets.length = 0;
      G.effects.push({ type: 'ring', x: p.x, y: p.y, r: 300, life: 0.7, max: 0.7, color: '#fde047' });
      flashScreen(); banner('RESURRECTED', 'Death refuses you, for now', '#fde047'); SFX.play('evo');
      oracleSay('Not yet, slayer. Not yet. The night is not finished with you.', 'Intervenes!');
    } else {
      p.hp = 0; G.dying = 1.6; G.timeScale = 0.3; G.slowT = 99; SFX.play('death'); Music.stop();
      burst(p.x, p.y, 70, '#dc2626', 260, 1.1, 4); burst(p.x, p.y, 30, '#e2e8f0', 200, 1, 3); addShake(14);
    }
  }
}

// ================= LEVEL / XP =================
function gainXP(v) {
  const p = G.p; p.xp += v * p.S.xp;
  G.xpChain = G.xpChainT > 0 ? G.xpChain + 1 : 0; G.xpChainT = 0.5; SFX.play('xp', G.xpChain);
  while (p.xp >= p.next) { p.xp -= p.next; p.level++; p.next = xpNeed(p.level); G.pendingLevels++; }
}
function usePickup(k) {
  const p = G.p;
  switch (k.type) {
    case 'heart': heal(30, true); SFX.play('heal'); burst(p.x, p.y, 16, '#4ade80', 120, 0.6, 3); break;
    case 'magnet': G.gems.forEach(g => g.mag = true); SFX.play('pickup'); G.effects.push({ type: 'ring', x: p.x, y: p.y, r: 500, life: 0.6, max: 0.6, color: '#60a5fa', follow: true }); addText('SOUL MAGNET', p.x, p.y - 44, '#93c5fd', 1.2); break;
    case 'bomb':
      SFX.play('bomb'); flashScreen(); addShake(16);
      for (const e of G.enemies) { if (e.dead || !inView(e.x, e.y, 40)) continue; if (e.boss) damageEnemy(e, e.maxHp * 0.06, 'bomb', 0, 0, 0); else damageEnemy(e, e.elite ? e.maxHp * 0.4 : 99999, 'bomb', 0, 0, 0); }
      G.ebullets.length = 0; addText('HOLY SMITE!', p.x, p.y - 44, '#fde047', 1.5); break;
    case 'gold': { const v = Math.max(1, Math.round(k.v * p.goldMult)); G.gold += v; SFX.play('gold'); addText('+' + v + 'g', p.x, p.y - 30, '#fcd34d', 1); break; }
    case 'chest': G.chestQueue++; G.stats.chests++; SFX.play('chest'); burst(k.x, k.y, 40, '#fbbf24', 220, 0.8, 3); break;
  }
}

// ================= WEAPONS =================
const WFN = {
  bolt(w, s, dt, S, p) {
    w.timer -= dt; if (w.timer > 0) return;
    const targets = nearestEnemies(p.x, p.y, s.count, 560);
    if (!targets.length) { w.timer = 0.1; return; }
    w.timer = s.cd * S.cd;
    for (let i = 0; i < s.count; i++) {
      const t = targets[i % targets.length]; const a = Math.atan2(t.y - p.y, t.x - p.x) + (i >= targets.length ? rand(-0.35, 0.35) : 0);
      G.projs.push({ kind: 'bolt', wid: 'bolt', x: p.x, y: p.y - 6, vx: Math.cos(a) * s.speed, vy: Math.sin(a) * s.speed, spd: s.speed, dmg: s.dmg * S.dmg, pierce: s.pierce, life: 1.5, r: (w.evo ? 8 : 6), hit: new Set(), target: t, homing: w.evo ? 7 : 3, evo: w.evo });
    }
    SFX.play('shoot');
  },
  blade(w, s, dt, S, p) {
    w.angle += s.rot * dt; const R = s.radius * S.area; const br = 13 * s.size * Math.sqrt(S.area);
    w.pos = []; w.br = br;
    for (let i = 0; i < s.count; i++) {
      const a = w.angle + i * TAU / s.count; const bx = p.x + Math.cos(a) * R, by = p.y + Math.sin(a) * R; w.pos.push([bx, by, a]);
      query(bx, by, br, e => { if (G.t >= (e.hcd.blade || 0)) { e.hcd.blade = G.t + s.hitcd; const dd = Math.hypot(e.x - p.x, e.y - p.y) || 1; damageEnemy(e, s.dmg * S.dmg, 'blade', 160, (e.x - p.x) / dd, (e.y - p.y) / dd); } });
      hitProps(bx, by, br);
    }
  },
  nova(w, s, dt, S, p) {
    if (w.second > 0) { w.second -= dt; if (w.second <= 0) novaBlast(w, s, S, p, 0.7); }
    w.timer -= dt; if (w.timer > 0) return;
    w.timer = s.cd * S.cd; novaBlast(w, s, S, p, 1); if (w.evo) w.second = 0.35;
  },
  drain(w, s, dt, S, p) {
    w.timer -= dt; if (w.timer > 0) return; w.timer = s.tick;
    const R = s.radius * S.area; let hits = 0;
    query(p.x, p.y, R - 8, e => { hits++; damageEnemy(e, s.dmg * S.dmg, 'drain', 0, 0, 0); if (s.slow) e.slow = 0.6; if (hits <= 5 && Math.random() < 0.6) G.effects.push({ type: 'line', x: e.x, y: e.y, life: 0.2, max: 0.2, color: '#ef4444' }); });
    if (hits) heal(Math.min(hits, 3) * s.heal / 2);
  },
  dagger(w, s, dt, S, p) {
    w.timer -= dt; if (w.timer > 0) return; w.timer = s.cd * S.cd;
    const base = Math.atan2(p.dirY, p.dirX);
    for (let i = 0; i < s.count; i++) {
      const a = base + (i - (s.count - 1) / 2) * 0.13 + rand(-0.03, 0.03);
      G.projs.push({ kind: 'dagger', wid: 'dagger', x: p.x + Math.cos(a) * 10, y: p.y - 4 + Math.sin(a) * 10, vx: Math.cos(a) * s.speed, vy: Math.sin(a) * s.speed, dmg: s.dmg * S.dmg, pierce: s.pierce, life: 0.85, r: 6, hit: new Set(), a, evo: w.evo });
    }
    SFX.play('dagger');
  },
  water(w, s, dt, S, p) {
    w.timer -= dt; if (w.timer > 0) return; w.timer = s.cd * S.cd;
    const near = nearestEnemies(p.x, p.y, 12, 380);
    for (let i = 0; i < s.count; i++) {
      let tx, ty; if (near.length) { const t = pick(near); tx = t.x + rand(-20, 20); ty = t.y + rand(-20, 20); } else { const a = Math.random() * TAU, d = rand(80, 220); tx = p.x + Math.cos(a) * d; ty = p.y + Math.sin(a) * d; }
      G.flasks.push({ sx: p.x, sy: p.y, tx, ty, t: 0, T: 0.45 + i * 0.08, s, S: { dmg: S.dmg, area: S.area }, evo: w.evo });
    }
  },
  bell(w, s, dt, S, p) {
    w.timer -= dt; if (w.timer > 0) return;
    const cands = G.enemies.filter(e => !e.dead && inView(e.x, e.y, -20));
    if (!cands.length) { w.timer = 0.2; return; }
    w.timer = s.cd * S.cd;
    for (let i = 0; i < s.count && cands.length; i++) {
      const idx = Math.floor(Math.random() * cands.length); const t = cands.splice(idx, 1)[0];
      strike(t.x, t.y, s.dmg * S.dmg, s.aoe * S.area);
      if (s.chain) { let from = t; const hitSet = new Set([t]); for (let c = 0; c < s.chain; c++) { const nx = nearestEnemies(from.x, from.y, 4, 190).find(e => !hitSet.has(e)); if (!nx) break; hitSet.add(nx); G.effects.push({ type: 'chain', x: from.x, y: from.y, x2: nx.x, y2: nx.y, life: 0.25, max: 0.25, color: '#bfdbfe', segs: jag(from.x, from.y, nx.x, nx.y, 6, 14) }); damageEnemy(nx, s.dmg * S.dmg * 0.6, 'bell', 0, 0, 0); from = nx; } }
    }
    SFX.play('zap');
  },
};
function novaBlast(w, s, S, p, mult) {
  const R = s.radius * S.area;
  query(p.x, p.y, R, e => { const dd = Math.hypot(e.x - p.x, e.y - p.y) || 1; damageEnemy(e, s.dmg * S.dmg * mult, 'nova', s.knock, (e.x - p.x) / dd, (e.y - p.y) / dd); });
  hitProps(p.x, p.y, R);
  for (const b of G.ebullets) { if ((b.x - p.x) ** 2 + (b.y - p.y) ** 2 < R * R) b.life = 0; }
  if (s.heal) heal(s.heal, true);
  G.effects.push({ type: 'ring', x: p.x, y: p.y, r: R, life: 0.45, max: 0.45, color: w.evo ? '#fbbf24' : '#fef08a', follow: true, fill: true });
  addShake(4); SFX.play('nova');
}
function jag(x1, y1, x2, y2, n, amp) { const pts = [[x1, y1]]; for (let i = 1; i < n; i++) { const t = i / n; pts.push([x1 + (x2 - x1) * t + rand(-amp, amp), y1 + (y2 - y1) * t + rand(-amp, amp)]); } pts.push([x2, y2]); return pts; }
function strike(x, y, dmg, aoe) {
  query(x, y, aoe, e => damageEnemy(e, dmg, 'bell', 60, 0, -1));
  hitProps(x, y, aoe);
  G.effects.push({ type: 'bolt', x, y, life: 0.28, max: 0.28, color: '#bfdbfe', segs: jag(x + rand(-40, 40), y - 520, x, y, 9, 22), r: aoe });
  burst(x, y, 8, '#bfdbfe', 160, 0.35, 2);
}
function hitProps(x, y, r) {
  for (const pr of G.props) { if (pr.dead) continue; if ((pr.x - x) ** 2 + (pr.y - y) ** 2 < (r + pr.r) ** 2) breakProp(pr); }
}
function breakProp(pr) {
  pr.dead = true; SFX.play('break'); burst(pr.x, pr.y, 18, '#f97316', 160, 0.6, 3); burst(pr.x, pr.y, 10, '#57534e', 120, 0.6, 3);
  const r = Math.random(); const p = G.p;
  const type = (p.hp < p.maxHp * 0.6 && r < 0.45) ? 'heart' : r < 0.3 ? 'heart' : r < 0.62 ? 'gold' : r < 0.82 ? 'magnet' : 'bomb';
  dropPickup(type, pr.x, pr.y, type === 'gold' ? randi(5, 12) : 0);
}
