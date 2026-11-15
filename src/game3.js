
// ================= MAIN UPDATE =================
function update(dt, rdt) {
  const p = G.p;
  if (G.dying > 0) {
    G.dying -= rdt; updateFx(dt);
    for (const e of G.enemies) { e.t += dt; }
    if (G.dying <= 0) endRun(false);
    return;
  }
  G.t += dt;
  // omen / blood moon timers
  if (G.omen) { G.omen.t -= dt; if (G.omen.t <= 0) { G.omen = null; recalc(); } }
  if (G.bloodMoon > 0) { G.bloodMoon -= dt; if (G.bloodMoon <= 0) { document.body.classList.remove('bloodmoon'); recalc(); } }
  if (G.oracleCD > 0) G.oracleCD -= dt;
  G.oracleAuto -= dt; if (G.oracleAuto <= 0) oracleAutoLine();
  if (G.xpChainT > 0) G.xpChainT -= dt;

  // --- player movement ---
  let dx = 0, dy = 0;
  if (keys.KeyW || keys.ArrowUp) dy -= 1; if (keys.KeyS || keys.ArrowDown) dy += 1;
  if (keys.KeyA || keys.ArrowLeft) dx -= 1; if (keys.KeyD || keys.ArrowRight) dx += 1;
  if (joy.active && (joy.x || joy.y)) { dx = joy.x; dy = joy.y; }
  if (DEBUG.autopilot) { const v = autopilot(); dx = v[0]; dy = v[1]; }
  const len = Math.hypot(dx, dy); p.moving = len > 0.05;
  if (p.moving) { const m = Math.min(1, len); dx /= len; dy /= len; p.dirX = dx; p.dirY = dy; if (Math.abs(dx) > 0.1) p.facing = Math.sign(dx); p.x += dx * p.S.speed * m * dt; p.y += dy * p.S.speed * m * dt; p.anim += dt * 10; }
  if (p.iframes > 0) p.iframes -= dt;
  if (p.S.regen > 0) heal(p.S.regen * dt);
  cam.x += (p.x - cam.x) * Math.min(1, dt * 8); cam.y += (p.y - cam.y) * Math.min(1, dt * 8);

  buildGrid();
  for (const id of p.order) { const w = p.weapons[id]; const s = WEAPONS[id].stats(w.lv, w.evo); w.s = s; WFN[id](w, s, dt, p.S, p); }
  spawner(dt); events(dt);

  // --- enemies ---
  for (const e of G.enemies) { if (!e.dead) e.update(dt); }
  // separation (cheap, grid-based)
  for (const e of G.enemies) {
    if (e.dead || e.boss) continue;
    query(e.x, e.y, e.r * 0.6, o => { if (o === e) return; const ddx = e.x - o.x, ddy = e.y - o.y; const d2 = ddx * ddx + ddy * ddy; const min = (e.r + o.r) * 0.8; if (d2 < min * min && d2 > 0.01) { const d = Math.sqrt(d2); const push = (min - d) / d * 0.35; e.x += ddx * push; e.y += ddy * push; } });
  }
  G.enemies = G.enemies.filter(e => !e.dead && !e.remove);

  // --- projectiles ---
  for (const b of G.projs) {
    if (b.kind === 'bolt' && b.target) {
      if (b.target.dead) b.target = null;
      else { const want = Math.atan2(b.target.y - b.y, b.target.x - b.x); const cur = Math.atan2(b.vy, b.vx); let da = want - cur; while (da > Math.PI) da -= TAU; while (da < -Math.PI) da += TAU; const na = cur + clamp(da, -b.homing * dt, b.homing * dt); b.vx = Math.cos(na) * b.spd; b.vy = Math.sin(na) * b.spd; }
    }
    b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
    if (Math.random() < 0.5) addParticle(b.x, b.y, 0, 0, 0.18, b.kind === 'bolt' ? 3 : 2, b.kind === 'bolt' ? (b.evo ? '#fb7185' : '#ef4444') : '#cbd5e1', 0, 0);
    query(b.x, b.y, b.r, e => {
      if (b.hit.has(e)) return; b.hit.add(e);
      const sp = Math.hypot(b.vx, b.vy) || 1; damageEnemy(e, b.dmg, b.wid, b.kind === 'dagger' ? 90 : 120, b.vx / sp, b.vy / sp);
      if (b.pierce-- <= 0) { b.life = 0; return true; }
      if (b.kind === 'bolt') { b.target = null; }
    });
    hitProps(b.x, b.y, b.r);
  }
  G.projs = G.projs.filter(b => b.life > 0);

  // --- holy water flasks & pools ---
  for (const f of G.flasks) {
    f.t += dt;
    if (f.t >= f.T) { f.done = true; G.pools.push({ x: f.tx, y: f.ty, r: f.s.radius * f.S.area, dmg: f.s.dmg * f.S.dmg, life: f.s.dur, max: f.s.dur, tick: 0, tickT: f.s.tick, chase: f.s.chase }); SFX.play('splash'); burst(f.tx, f.ty, 12, '#7dd3fc', 160, 0.4, 3); }
  }
  G.flasks = G.flasks.filter(f => !f.done);
  for (const pl of G.pools) {
    pl.life -= dt; pl.tick -= dt;
    if (pl.chase) { const t = nearestEnemies(pl.x, pl.y, 1, 400)[0]; if (t) { const a = Math.atan2(t.y - pl.y, t.x - pl.x); pl.x += Math.cos(a) * 70 * dt; pl.y += Math.sin(a) * 70 * dt; } }
    if (pl.tick <= 0) { pl.tick = pl.tickT; query(pl.x, pl.y, pl.r, e => { damageEnemy(e, pl.dmg, 'water', 0, 0, 0); e.slow = Math.max(e.slow, 0.3); }); hitProps(pl.x, pl.y, pl.r); }
    if (Math.random() < 0.3) addParticle(pl.x + rand(-pl.r, pl.r) * 0.8, pl.y + rand(-pl.r, pl.r) * 0.5, 0, -40, 0.5, 2, '#bae6fd', 0, 0);
  }
  G.pools = G.pools.filter(pl => pl.life > 0);

  // --- enemy bullets ---
  for (const b of G.ebullets) {
    b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
    if ((b.x - p.x) ** 2 + (b.y - p.y) ** 2 < (b.r + p.r * 0.75) ** 2) { hurtPlayer(b.dmg); b.life = 0; }
  }
  G.ebullets = G.ebullets.filter(b => b.life > 0);

  // --- gems ---
  const mag = p.S.magnet, mag2 = mag * mag; const farR2 = (spawnRadius() * 1.3) ** 2;
  for (const g of G.gems) {
    g.t += dt; const ddx = p.x - g.x, ddy = p.y - g.y; const d2 = ddx * ddx + ddy * ddy;
    if (!g.mag && d2 < mag2) g.mag = true;
    if (g.mag) { const d = Math.sqrt(d2) || 1; const sp = 260 + Math.min(600, g.t * 40) + (G.gems.length > 100 ? 200 : 0); g.vx += (ddx / d * sp - g.vx) * Math.min(1, dt * 8); g.vy += (ddy / d * sp - g.vy) * Math.min(1, dt * 8); }
    else { g.vx *= Math.max(0, 1 - 5 * dt); g.vy *= Math.max(0, 1 - 5 * dt); }
    g.x += g.vx * dt; g.y += g.vy * dt;
    if (d2 < (p.r + 8) ** 2) { g.got = true; gainXP(g.v); }
    else if (!g.mag && d2 > farR2) { g.got = true; G.lostXP += g.v; } // left far behind: gathered into a soul crystal
  }
  G.crystalT -= dt;
  if (G.crystalT <= 0) { G.crystalT = 5; if (G.lostXP >= 3) { const a = Math.random() * TAU, d = Math.min(VW, VH) * 0.38; G.gems.push({ x: p.x + Math.cos(a) * d, y: p.y + Math.sin(a) * d, v: G.lostXP, vx: 0, vy: 0, mag: false, t: 0, crystal: true }); G.lostXP = 0; } }
  G.gems = G.gems.filter(g => !g.got);

  // --- pickups ---
  for (const k of G.pickups) {
    k.t += dt; if (k.vy < 0 || k.t < 0.4) { k.vy += 500 * dt; if (k.vy > 0) k.vy = 0; }
    const ddx = p.x - k.x, ddy = p.y - k.y; const d = Math.hypot(ddx, ddy);
    if ((k.type === 'gold' && d < mag) || (k.type !== 'chest' && d < 46)) { k.x += ddx / (d || 1) * 420 * dt; k.y += ddy / (d || 1) * 420 * dt; }
    if (d < p.r + 14) { k.got = true; usePickup(k); }
  }
  G.pickups = G.pickups.filter(k => !k.got);

  // --- breakable braziers ---
  G.propTimer -= dt;
  if (G.propTimer <= 0) {
    G.propTimer = 12;
    G.props = G.props.filter(pr => !pr.dead && Math.hypot(pr.x - p.x, pr.y - p.y) < spawnRadius() * 2);
    if (G.props.length < 3) { const a = Math.random() * TAU, d = Math.min(VW, VH) * rand(0.35, 0.48); G.props.push({ x: p.x + Math.cos(a) * d, y: p.y + Math.sin(a) * d, r: 14, t: 0 }); }
  }
  for (const pr of G.props) { pr.t += dt; if (!pr.dead && Math.hypot(pr.x - p.x, pr.y - p.y) < pr.r + p.r) breakProp(pr); }
  G.props = G.props.filter(pr => !pr.dead);

  updateFx(dt);

  // --- low hp oracle ---
  if (p.hp / p.maxHp < 0.25 && G.t - G.lastLowLine > 25) { G.lastLowLine = G.t; oracleSay(pick(ORACLE.low), 'Warns...'); }

  // --- dawn ---
  if (G.t >= DAWN && !G.won) {
    G.won = true; G.dawnT = 1.8;
    if (G.boss) { const b = G.boss; G.dawnBurn = true; damageEnemy(b, b.hp + 1, 'dawn', 0, 0, 0); }
    for (const e of G.enemies) if (!e.dead && !e.boss) { e.dead = true; burst(e.x, e.y, 4, '#fbbf24', 120, 0.5, 2); }
    G.ebullets.length = 0; flashScreen(); banner('DAWN BREAKS', 'The sun scours the undead', '#fde68a'); SFX.play('victory');
  }
  if (G.dawnT > 0) { G.dawnT -= rdt; if (G.dawnT <= 0) { endRun(true); return; } }

  // --- level ups / chests ---
  if (G.pendingLevels > 0 && G.dawnT <= 0) openUpgrade('level');
  else if (G.chestQueue > 0 && G.dawnT <= 0) openUpgrade('chest');
}
function updateFx(dt) {
  for (const q of G.particles) { q.vx *= Math.max(0, 1 - q.drag * dt); q.vy *= Math.max(0, 1 - q.drag * dt); q.vy += q.grav * dt; q.x += q.vx * dt; q.y += q.vy * dt; q.life -= dt; }
  G.particles = G.particles.filter(q => q.life > 0);
  for (const t of G.texts) { t.life -= dt; t.y -= 34 * dt; }
  G.texts = G.texts.filter(t => t.life > 0);
  for (const f of G.effects) { f.life -= dt; if (f.follow) { f.x = G.p.x; f.y = G.p.y; } }
  G.effects = G.effects.filter(f => f.life > 0);
  if (G.shake > 0) G.shake = Math.max(0, G.shake - dt * 40);
}

// test-only helper: a simple kiting bot used for automated balance checks
const DEBUG = { autopilot: false, turbo: 1 };
function autopilot() {
  const p = G.p; let ax = 0, ay = 0;
  for (const e of G.enemies) { const dx = p.x - e.x, dy = p.y - e.y; const d2 = dx * dx + dy * dy + 1; if (d2 < 260 * 260) { const w = (e.boss ? 6 : 1) / d2; ax += dx * w; ay += dy * w; } }
  for (const b of G.ebullets) { const dx = p.x - b.x, dy = p.y - b.y; const d2 = dx * dx + dy * dy + 1; if (d2 < 150 * 150) { ax += dx * 3 / d2; ay += dy * 3 / d2; } }
  let tx = 0, ty = 0, best = 1e12; for (const g of G.gems.concat(G.pickups, G.props)) { const d = (g.x - p.x) ** 2 + (g.y - p.y) ** 2; if (d < best) { best = d; tx = g.x - p.x; ty = g.y - p.y; } }
  const tl = Math.hypot(tx, ty) || 1; const al = Math.hypot(ax, ay);
  let vx = ax / (al || 1) * Math.min(1, al * 900) + tx / tl * 0.5, vy = ay / (al || 1) * Math.min(1, al * 900) + ty / tl * 0.5;
  return [vx, vy];
}

// ================= RENDERING =================
const glowCache = {};
function glowSprite(color) {
  if (glowCache[color]) return glowCache[color];
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, hexA(color, 0.9)); gr.addColorStop(0.35, hexA(color, 0.35)); gr.addColorStop(1, hexA(color, 0));
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return glowCache[color] = c;
}
function glow(x, y, r, color, a) { ctx.globalAlpha = a === undefined ? 1 : a; ctx.drawImage(glowSprite(color), x - r, y - r, r * 2, r * 2); ctx.globalAlpha = 1; }

function drawGround(time) {
  const T = 64; const hw = VW / 2 + T, hh = VH / 2 + T;
  const x0 = Math.floor((cam.x - hw) / T), x1 = Math.floor((cam.x + hw) / T), y0 = Math.floor((cam.y - hh) / T), y1 = Math.floor((cam.y + hh) / T);
  const moon = G && G.bloodMoon > 0;
  ctx.fillStyle = moon ? '#13060b' : '#0a0710'; ctx.fillRect(cam.x - hw, cam.y - hh, hw * 2, hh * 2);
  for (let tx = x0; tx <= x1; tx++) for (let ty = y0; ty <= y1; ty++) {
    const h = hash(tx, ty); const s = h & 7;
    if (s < 4) { ctx.fillStyle = moon ? ['#1a070d', '#16060b', '#0f0408', '#1d0a10'][s] : ['#0e0a16', '#0c0813', '#08060c', '#100b18'][s]; ctx.fillRect(tx * T + 1, ty * T + 1, T - 2, T - 2); }
    if ((h >>> 5) % 9 === 0) { ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 1; ctx.beginPath(); const cx = tx * T + ((h >>> 8) & 31) + 16, cy = ty * T + ((h >>> 13) & 31) + 16; ctx.moveTo(cx, cy); ctx.lineTo(cx + 12, cy + 7); ctx.lineTo(cx + 18, cy + 4); ctx.stroke(); }
  }
  ctx.strokeStyle = moon ? 'rgba(244,63,94,0.07)' : 'rgba(220,38,38,0.05)'; ctx.lineWidth = 1; ctx.beginPath();
  for (let tx = x0; tx <= x1 + 1; tx++) { ctx.moveTo(tx * T, y0 * T); ctx.lineTo(tx * T, (y1 + 1) * T); }
  for (let ty = y0; ty <= y1 + 1; ty++) { ctx.moveTo(x0 * T, ty * T); ctx.lineTo((x1 + 1) * T, ty * T); }
  ctx.stroke();
  // decorations
  for (let tx = x0; tx <= x1; tx++) for (let ty = y0; ty <= y1; ty++) {
    const h = hash(tx * 7 + 3, ty * 13 + 5); const k = h % 83; if (k > 5) continue;
    const x = tx * T + 14 + ((h >>> 8) % 36), y = ty * T + 14 + ((h >>> 16) % 36);
    drawDecor(k, x, y, h, time);
  }
}
function drawDecor(k, x, y, h, time) {
  ctx.save(); ctx.translate(x, y);
  if (k === 0 || k === 5) { // gravestone
    ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.beginPath(); ctx.ellipse(0, 12, 14, 5, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#27242e'; ctx.beginPath(); ctx.moveTo(-10, 12); ctx.lineTo(-10, -6); ctx.arc(0, -6, 10, Math.PI, 0); ctx.lineTo(10, 12); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#35313d'; ctx.fillRect(-10, -6, 3, 18);
    ctx.fillStyle = '#16141a'; ctx.fillRect(-1.5, -10, 3, 12); ctx.fillRect(-5, -6, 10, 3);
  } else if (k === 1) { // stone cross
    ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.beginPath(); ctx.ellipse(0, 14, 10, 4, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#2b2733'; ctx.fillRect(-3, -14, 6, 28); ctx.fillRect(-10, -7, 20, 6);
  } else if (k === 2) { // old blood
    ctx.fillStyle = 'rgba(127,29,29,0.22)'; ctx.beginPath(); ctx.ellipse(0, 0, 18, 9, (h % 7) / 2, 0, TAU); ctx.fill(); ctx.beginPath(); ctx.arc(14, 6, 4, 0, TAU); ctx.fill();
  } else if (k === 3) { // bones
    ctx.strokeStyle = 'rgba(214,211,209,0.35)'; ctx.lineWidth = 2.5; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(-8, -3); ctx.lineTo(8, 3); ctx.moveTo(-6, 5); ctx.lineTo(6, -5); ctx.stroke();
    ctx.fillStyle = 'rgba(214,211,209,0.3)'; ctx.beginPath(); ctx.arc(12, -2, 4, 0, TAU); ctx.fill();
  } else if (k === 4) { // candle
    const f = 0.75 + Math.sin(time * 9 + h) * 0.15 + Math.sin(time * 23 + h) * 0.1;
    ctx.fillStyle = '#d6d3d1'; ctx.fillRect(-2, -6, 4, 10); ctx.fillStyle = '#fbbf24'; ctx.beginPath(); ctx.ellipse(0, -9, 2, 3.5 * f, 0, 0, TAU); ctx.fill();
    ctx.globalCompositeOperation = 'lighter'; glow(0, -9, 26 * f, '#f97316', 0.35); ctx.globalCompositeOperation = 'source-over';
  }
  ctx.restore();
}

function drawHunter(c, col, facing, anim, moving, flashWhite) {
  const F = v => flashWhite ? '#ffffff' : v;
  const bob = moving ? Math.abs(Math.sin(anim)) * 2 : Math.sin(anim * 0.3) * 0.6;
  c.save(); c.scale(facing, 1);
  const leg = moving ? Math.sin(anim) * 4 : 0;
  c.fillStyle = F('#0f0a1a'); c.fillRect(-6 + leg * 0.5, 6, 4, 9); c.fillRect(2 - leg * 0.5, 6, 4, 9);
  c.translate(0, -bob);
  c.fillStyle = F(col.cloak); c.beginPath(); c.moveTo(-10, -6); c.quadraticCurveTo(-22 - (moving ? 4 : 0), 6, -17 - (moving ? Math.sin(anim * 1.3) * 3 : 0), 15); c.lineTo(8, 13); c.closePath(); c.fill();
  c.fillStyle = F(col.body); c.beginPath(); c.arc(0, -2, 11.5, 0, TAU); c.fill();
  c.fillStyle = F(col.scarf); c.beginPath(); c.ellipse(0, -8, 10, 4.5, 0, 0, TAU); c.fill();
  c.fillStyle = F(col.scarf); c.beginPath(); c.moveTo(-8, -8); c.lineTo(-16, -4 + (moving ? Math.sin(anim * 1.5) * 2 : 0)); c.lineTo(-8, -5); c.fill();
  c.fillStyle = F(col.hair); c.beginPath(); c.arc(0, -15, 8, 0, TAU); c.fill();
  c.fillStyle = F('#f5d0c5'); c.fillRect(1, -16, 6, 5);
  c.fillStyle = F(col.eye); c.fillRect(3, -15, 3, 2);
  c.fillStyle = F('#94a3b8'); c.fillRect(8, -4, 9, 2); c.fillStyle = F('#78350f'); c.fillRect(6, -5, 3, 4); // weapon
  c.restore();
}

function F(e, c) { return e.flash > 0 ? '#ffffff' : c; }
function drawEnemy(e, time) {
  if (!inView(e.x, e.y, e.r + 60)) return;
  const p = G.p; const face = p.x < e.x ? -1 : 1;
  ctx.save(); ctx.translate(e.x, e.y);
  ctx.fillStyle = 'rgba(0,0,0,0.38)'; ctx.beginPath(); ctx.ellipse(0, e.r * 0.85, e.r * 0.9, e.r * 0.35, 0, 0, TAU); ctx.fill();
  if (e.elite) { ctx.globalCompositeOperation = 'lighter'; glow(0, 0, e.r * 2.4, '#f59e0b', 0.45 + Math.sin(time * 6) * 0.15); ctx.globalCompositeOperation = 'source-over'; }
  if (e.slow > 0) { ctx.fillStyle = 'rgba(125,211,252,0.18)'; ctx.beginPath(); ctx.arc(0, 0, e.r + 3, 0, TAU); ctx.fill(); }
  if (e.boss) { drawBoss(e, time); ctx.restore(); return; }
  ctx.scale(e.scale * face, e.scale);
  const t = e.t + e.phase;
  switch (e.type) {
    case 'skull': {
      const b = Math.sin(t * 5) * 2; ctx.translate(0, b);
      ctx.fillStyle = F(e, '#e7e5e4'); ctx.beginPath(); ctx.arc(0, -3, 10, 0, TAU); ctx.fill(); ctx.fillRect(-6, 3, 12, 6);
      ctx.fillStyle = '#0c0a09'; ctx.beginPath(); ctx.arc(-4, -3, 3, 0, TAU); ctx.arc(4, -3, 3, 0, TAU); ctx.fill(); ctx.fillRect(-4, 6, 2, 3); ctx.fillRect(0, 6, 2, 3); ctx.fillRect(4, 6, 1, 3);
      ctx.fillStyle = '#ef4444'; ctx.fillRect(-4.5, -3.5, 1.5, 1.5); ctx.fillRect(3.5, -3.5, 1.5, 1.5);
      break;
    }
    case 'bat': {
      const fl = Math.sin(t * 20) * 6;
      ctx.fillStyle = F(e, '#581c87'); ctx.beginPath(); ctx.moveTo(-4, -1); ctx.lineTo(-17, -6 - fl); ctx.lineTo(-13, 2); ctx.lineTo(-8, 0); ctx.lineTo(-5, 4); ctx.moveTo(4, -1); ctx.lineTo(17, -6 - fl); ctx.lineTo(13, 2); ctx.lineTo(8, 0); ctx.lineTo(5, 4); ctx.fill();
      ctx.fillStyle = F(e, '#7e22ce'); ctx.beginPath(); ctx.arc(0, 0, 6.5, 0, TAU); ctx.fill(); ctx.beginPath(); ctx.moveTo(-5, -4); ctx.lineTo(-3, -10); ctx.lineTo(-1, -5); ctx.moveTo(5, -4); ctx.lineTo(3, -10); ctx.lineTo(1, -5); ctx.fill();
      ctx.fillStyle = '#fde047'; ctx.fillRect(1, -2, 2, 2); ctx.fillRect(-3, -2, 2, 2);
      break;
    }
    case 'ghoul': {
      const w = Math.sin(t * 4) * 2;
      ctx.fillStyle = F(e, '#3f6212'); ctx.beginPath(); ctx.ellipse(0, 2, 12, 13, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = F(e, '#4d7c0f'); ctx.fillRect(6, -2 + w, 12, 4); ctx.fillRect(4, 4 - w, 12, 4);
      ctx.fillStyle = F(e, '#65a30d'); ctx.beginPath(); ctx.arc(3, -10, 8, 0, TAU); ctx.fill();
      ctx.fillStyle = '#fef08a'; ctx.fillRect(4, -12, 3, 2); ctx.fillRect(8, -12, 2, 2); ctx.fillStyle = '#1a2e05'; ctx.fillRect(4, -7, 6, 2);
      break;
    }
    case 'wraith': {
      ctx.globalAlpha = 0.85; const w = Math.sin(t * 3);
      ctx.fillStyle = F(e, '#155e75'); ctx.beginPath(); ctx.moveTo(-10, -2); ctx.quadraticCurveTo(-12, 12, -6 + w * 3, 18); ctx.lineTo(0, 12); ctx.lineTo(5 - w * 3, 18); ctx.quadraticCurveTo(12, 12, 10, -2); ctx.closePath(); ctx.fill();
      ctx.fillStyle = F(e, '#67e8f9'); ctx.beginPath(); ctx.arc(0, -6, 9, 0, TAU); ctx.fill();
      ctx.fillStyle = '#083344'; ctx.beginPath(); ctx.ellipse(-3, -6, 2, 3, 0, 0, TAU); ctx.ellipse(3, -6, 2, 3, 0, 0, TAU); ctx.fill(); ctx.beginPath(); ctx.ellipse(0, 0, 2, 3, 0, 0, TAU); ctx.fill();
      ctx.globalAlpha = 1;
      break;
    }
    case 'noble': {
      if (e.mode === 1) { ctx.restore(); ctx.save(); ctx.strokeStyle = 'rgba(239,68,68,0.5)'; ctx.setLineDash([8, 8]); ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.lineTo(e.x + e.ddx * 300, e.y + e.ddy * 300); ctx.stroke(); ctx.restore(); ctx.save(); ctx.translate(e.x, e.y); ctx.scale(e.scale * face, e.scale); }
      const w = Math.sin(t * 4) * 2;
      ctx.fillStyle = F(e, '#450a0a'); ctx.beginPath(); ctx.moveTo(-6, -8); ctx.lineTo(-16 - w, 14); ctx.lineTo(14 + w, 14); ctx.lineTo(6, -8); ctx.fill();
      ctx.fillStyle = F(e, '#991b1b'); ctx.beginPath(); ctx.moveTo(-9, -10); ctx.lineTo(-13, -18); ctx.lineTo(-3, -12); ctx.moveTo(9, -10); ctx.lineTo(13, -18); ctx.lineTo(3, -12); ctx.fill();
      ctx.fillStyle = F(e, '#18181b'); ctx.beginPath(); ctx.arc(0, 0, 9, 0, TAU); ctx.fill();
      ctx.fillStyle = F(e, '#fecaca'); ctx.beginPath(); ctx.arc(1, -10, 6.5, 0, TAU); ctx.fill();
      ctx.fillStyle = '#18181b'; ctx.beginPath(); ctx.arc(1, -13, 6.5, Math.PI, 0); ctx.fill();
      ctx.fillStyle = '#dc2626'; ctx.fillRect(1, -11, 2, 2); ctx.fillRect(5, -11, 2, 2); ctx.fillStyle = '#fff'; ctx.fillRect(2, -6, 1, 2); ctx.fillRect(5, -6, 1, 2);
      break;
    }
    case 'wolf': {
      const r = Math.sin(t * 10) * 3;
      ctx.fillStyle = F(e, '#44403c'); ctx.beginPath(); ctx.ellipse(-2, 2, 15, 10, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = F(e, '#57534e'); ctx.fillRect(-12, 8, 4, 8 + r); ctx.fillRect(6, 8, 4, 8 - r); ctx.beginPath(); ctx.moveTo(-15, 0); ctx.lineTo(-24, -6 + r); ctx.lineTo(-15, 4); ctx.fill();
      ctx.fillStyle = F(e, '#78716c'); ctx.beginPath(); ctx.arc(11, -6, 8, 0, TAU); ctx.fill(); ctx.beginPath(); ctx.moveTo(15, -6); ctx.lineTo(24, -2); ctx.lineTo(15, 0); ctx.fill();
      ctx.beginPath(); ctx.moveTo(6, -11); ctx.lineTo(8, -20); ctx.lineTo(12, -12); ctx.fill();
      ctx.fillStyle = '#facc15'; ctx.fillRect(13, -9, 3, 2);
      break;
    }
  }
  ctx.restore();
  if (e.elite || (e.hp < e.maxHp && e.maxHp > 60)) { const w = e.r * 2; ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillRect(e.x - w / 2, e.y - e.r - 12, w, 4); ctx.fillStyle = e.elite ? '#f59e0b' : '#dc2626'; ctx.fillRect(e.x - w / 2, e.y - e.r - 12, w * Math.max(0, e.hp / e.maxHp), 4); }
}
function drawBoss(e, time) {
  const def = e.boss; const t = e.t; const p = G.p; const face = p.x < e.x ? -1 : 1;
  if (e.mode === 'tele') { ctx.save(); ctx.strokeStyle = `rgba(239,68,68,${0.35 + Math.sin(time * 30) * 0.25})`; ctx.lineWidth = e.r * 1.6; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(e.cdx * 520, e.cdy * 520); ctx.stroke(); ctx.restore(); }
  ctx.globalCompositeOperation = 'lighter'; glow(0, 0, e.r * 2.6, def.color, 0.5 + Math.sin(time * 4) * 0.12); ctx.globalCompositeOperation = 'source-over';
  ctx.save(); ctx.scale(face, 1); const s = e.r / 34; ctx.scale(s, s);
  const fl = Math.sin(t * 6) * 6;
  if (def.id === 'lich') {
    ctx.fillStyle = F(e, '#1a2e05'); ctx.beginPath(); ctx.moveTo(-20, -10); ctx.lineTo(-30, 34); ctx.lineTo(30, 34); ctx.lineTo(20, -10); ctx.fill();
    ctx.fillStyle = F(e, '#365314'); ctx.beginPath(); ctx.arc(0, -6, 22, Math.PI, 0); ctx.lineTo(20, 10); ctx.lineTo(-20, 10); ctx.fill();
    ctx.fillStyle = F(e, '#e7e5e4'); ctx.beginPath(); ctx.arc(0, -12, 13, 0, TAU); ctx.fill(); ctx.fillRect(-7, -2, 14, 7);
    ctx.fillStyle = '#a3e635'; ctx.beginPath(); ctx.arc(-5, -13, 3.5, 0, TAU); ctx.arc(5, -13, 3.5, 0, TAU); ctx.fill();
    ctx.fillStyle = F(e, '#fde047'); ctx.beginPath(); ctx.moveTo(-12, -24); ctx.lineTo(-8, -34); ctx.lineTo(-3, -25); ctx.lineTo(0, -36); ctx.lineTo(3, -25); ctx.lineTo(8, -34); ctx.lineTo(12, -24); ctx.fill();
    ctx.strokeStyle = F(e, '#78350f'); ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(28, 34); ctx.lineTo(30, -30); ctx.stroke();
    ctx.globalCompositeOperation = 'lighter'; glow(30, -34, 18 + fl, '#a3e635', 0.9); ctx.globalCompositeOperation = 'source-over';
  } else {
    const big = def.id === 'count';
    ctx.fillStyle = F(e, big ? '#2a0508' : '#1e0a25'); ctx.beginPath(); ctx.moveTo(-8, -14); ctx.lineTo(-50, -26 - fl); ctx.lineTo(-44, -4); ctx.lineTo(-56, 6 - fl * 0.5); ctx.lineTo(-38, 16); ctx.lineTo(-30, 34); ctx.lineTo(30, 34); ctx.lineTo(38, 16); ctx.lineTo(56, 6 - fl * 0.5); ctx.lineTo(44, -4); ctx.lineTo(50, -26 - fl); ctx.lineTo(8, -14); ctx.closePath(); ctx.fill();
    ctx.fillStyle = F(e, big ? '#991b1b' : '#4c0519'); ctx.beginPath(); ctx.moveTo(-18, -8); ctx.lineTo(-24, 34); ctx.lineTo(24, 34); ctx.lineTo(18, -8); ctx.fill();
    ctx.fillStyle = F(e, '#0c0a09'); ctx.beginPath(); ctx.arc(0, 4, 17, 0, TAU); ctx.fill();
    ctx.fillStyle = F(e, '#fecaca'); ctx.beginPath(); ctx.arc(0, -14, 13, 0, TAU); ctx.fill();
    ctx.fillStyle = F(e, '#0c0a09'); ctx.beginPath(); ctx.moveTo(-13, -16); ctx.quadraticCurveTo(0, -36, 13, -16); ctx.lineTo(0, -22); ctx.closePath(); ctx.fill();
    if (big) { ctx.fillStyle = F(e, '#3f3f46'); ctx.beginPath(); ctx.moveTo(-10, -24); ctx.quadraticCurveTo(-22, -34, -18, -46); ctx.quadraticCurveTo(-14, -34, -5, -27); ctx.moveTo(10, -24); ctx.quadraticCurveTo(22, -34, 18, -46); ctx.quadraticCurveTo(14, -34, 5, -27); ctx.fill(); }
    else { ctx.fillStyle = F(e, '#fbbf24'); ctx.fillRect(-9, -30, 18, 4); ctx.beginPath(); ctx.moveTo(-9, -30); ctx.lineTo(-7, -36); ctx.lineTo(-3, -30); ctx.lineTo(0, -37); ctx.lineTo(3, -30); ctx.lineTo(7, -36); ctx.lineTo(9, -30); ctx.fill(); }
    ctx.fillStyle = '#ef4444'; ctx.fillRect(-7, -16, 4, 3); ctx.fillRect(3, -16, 4, 3);
    ctx.fillStyle = '#fff'; ctx.fillRect(-4, -8, 2, 4); ctx.fillRect(2, -8, 2, 4);
  }
  ctx.restore();
}

function drawPlayer(time) {
  const p = G.p; if (G.dying > 0) return;
  const dr = p.weapons.drain;
  if (dr && dr.s) { const R = dr.s.radius * p.S.area; ctx.fillStyle = dr.evo ? 'rgba(127,29,29,0.16)' : 'rgba(220,38,38,0.07)'; ctx.strokeStyle = `rgba(239,68,68,${0.25 + Math.sin(time * 5) * 0.1})`; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(p.x, p.y, R, 0, TAU); ctx.fill(); ctx.stroke(); }
  ctx.globalCompositeOperation = 'lighter'; glow(p.x, p.y, 60, '#7c3aed', 0.18); ctx.globalCompositeOperation = 'source-over';
  ctx.save(); ctx.translate(p.x, p.y);
  ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.beginPath(); ctx.ellipse(0, 15, 13, 5, 0, 0, TAU); ctx.fill();
  if (!(p.iframes > 0 && Math.floor(time * 20) % 2 === 0)) drawHunter(ctx, p.hunter.col, p.facing, p.anim, p.moving, false);
  ctx.restore();
  // small hp bar
  ctx.fillStyle = 'rgba(0,0,0,0.75)'; ctx.fillRect(p.x - 16, p.y + 22, 32, 4); ctx.fillStyle = p.hp / p.maxHp < 0.3 ? '#f43f5e' : '#dc2626'; ctx.fillRect(p.x - 16, p.y + 22, 32 * Math.max(0, p.hp / p.maxHp), 4);
}
function drawBlades() {
  const w = G.p.weapons.blade; if (!w || !w.pos) return;
  for (const [bx, by, a] of w.pos) {
    ctx.globalCompositeOperation = 'lighter'; glow(bx, by, w.br * 2.2, w.evo ? '#f0abfc' : '#9333ea', 0.6); ctx.globalCompositeOperation = 'source-over';
    ctx.save(); ctx.translate(bx, by); ctx.rotate(a + Math.PI / 2); const s = w.br / 13; ctx.scale(s, s);
    ctx.fillStyle = w.evo ? '#fde68a' : '#c084fc'; ctx.beginPath(); ctx.moveTo(0, -15); ctx.quadraticCurveTo(9, -2, 4, 13); ctx.lineTo(0, 9); ctx.lineTo(-4, 13); ctx.quadraticCurveTo(-9, -2, 0, -15); ctx.fill();
    ctx.fillStyle = '#faf5ff'; ctx.fillRect(-1, -11, 2, 16);
    ctx.restore();
  }
}
function drawProjectiles() {
  ctx.globalCompositeOperation = 'lighter';
  for (const b of G.projs) { if (b.kind === 'bolt') glow(b.x, b.y, b.r * 3.2, b.evo ? '#fb7185' : '#ef4444', 0.9); else glow(b.x, b.y, 14, '#e2e8f0', 0.35); }
  ctx.globalCompositeOperation = 'source-over';
  for (const b of G.projs) {
    if (b.kind === 'bolt') { ctx.fillStyle = '#fee2e2'; ctx.beginPath(); ctx.arc(b.x, b.y, b.r * 0.55, 0, TAU); ctx.fill(); }
    else { ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(b.a); ctx.fillStyle = b.evo ? '#fde68a' : '#e2e8f0'; ctx.beginPath(); ctx.moveTo(12, 0); ctx.lineTo(-2, -3); ctx.lineTo(-2, 3); ctx.closePath(); ctx.fill(); ctx.fillStyle = '#78350f'; ctx.fillRect(-8, -1.5, 6, 3); ctx.restore(); }
  }
  for (const f of G.flasks) {
    const k = f.t / f.T; const x = f.sx + (f.tx - f.sx) * k, y = f.sy + (f.ty - f.sy) * k - Math.sin(k * Math.PI) * 80;
    ctx.save(); ctx.translate(x, y); ctx.rotate(k * 12); ctx.fillStyle = '#7dd3fc'; ctx.beginPath(); ctx.arc(0, 2, 5, 0, TAU); ctx.fill(); ctx.fillStyle = '#e0f2fe'; ctx.fillRect(-2, -6, 4, 5); ctx.restore();
  }
}
function drawPools(time) {
  for (const pl of G.pools) {
    const a = Math.min(1, pl.life / 0.4, (pl.max - pl.life) / 0.15 + 0.2);
    ctx.globalAlpha = 0.55 * a; ctx.fillStyle = '#0c4a6e'; ctx.beginPath(); ctx.ellipse(pl.x, pl.y, pl.r, pl.r * 0.7, 0, 0, TAU); ctx.fill();
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'lighter'; glow(pl.x, pl.y, pl.r * 1.3, '#38bdf8', 0.45 * a); ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = `rgba(186,230,253,${0.5 * a})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(pl.x, pl.y, pl.r * (0.9 + Math.sin(time * 6) * 0.05), pl.r * 0.65, 0, 0, TAU); ctx.stroke();
  }
}
const GEM_COL = ['#34d399', '#60a5fa', '#c084fc', '#f43f5e'];
function drawGems(time) {
  ctx.globalCompositeOperation = 'lighter';
  for (const g of G.gems) { if (!inView(g.x, g.y, 20)) continue; const tier = g.v >= 25 ? 3 : g.v >= 8 ? 2 : g.v >= 3 ? 1 : 0; glow(g.x, g.y, 12 + tier * 3, GEM_COL[tier], 0.5); }
  ctx.globalCompositeOperation = 'source-over';
  for (const g of G.gems) {
    if (!inView(g.x, g.y, 20)) continue; const tier = g.v >= 25 ? 3 : g.v >= 8 ? 2 : g.v >= 3 ? 1 : 0; const r = 4 + tier * 1.5; const b = Math.sin(g.t * 4) * 1.5;
    ctx.fillStyle = GEM_COL[tier]; ctx.beginPath(); ctx.moveTo(g.x, g.y - r * 1.3 + b); ctx.lineTo(g.x + r, g.y + b); ctx.lineTo(g.x, g.y + r * 1.3 + b); ctx.lineTo(g.x - r, g.y + b); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.fillRect(g.x - 1, g.y - r * 0.8 + b, 2, r * 0.7);
  }
}
function heartPath(c, s) { c.beginPath(); c.moveTo(0, s * 0.35); c.bezierCurveTo(-s * 1.2, -s * 0.4, -s * 0.5, -s * 1.1, 0, -s * 0.45); c.bezierCurveTo(s * 0.5, -s * 1.1, s * 1.2, -s * 0.4, 0, s * 0.35); c.closePath(); }
function drawPickups(time) {
  for (const k of G.pickups) {
    if (!inView(k.x, k.y, 30)) continue;
    const b = Math.sin(time * 4 + k.x) * 2.5 + k.vy * 0.05;
    ctx.save(); ctx.translate(k.x, k.y + b);
    ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.beginPath(); ctx.ellipse(0, 12 - b, 9, 3, 0, 0, TAU); ctx.fill();
    ctx.globalCompositeOperation = 'lighter';
    const gc = { heart: '#ef4444', magnet: '#60a5fa', bomb: '#fde047', gold: '#f59e0b', chest: '#fbbf24' }[k.type];
    glow(0, 0, k.type === 'chest' ? 46 : 24, gc, k.type === 'chest' ? 0.6 + Math.sin(time * 5) * 0.2 : 0.45);
    ctx.globalCompositeOperation = 'source-over';
    if (k.type === 'heart') { ctx.fillStyle = '#ef4444'; heartPath(ctx, 11); ctx.fill(); ctx.fillStyle = '#fecaca'; ctx.fillRect(-5, -6, 3, 3); }
    else if (k.type === 'magnet') { ctx.lineWidth = 5; ctx.strokeStyle = '#3b82f6'; ctx.beginPath(); ctx.arc(0, -1, 7, Math.PI, 0); ctx.stroke(); ctx.fillStyle = '#ef4444'; ctx.fillRect(-9.5, -1, 5, 7); ctx.fillRect(4.5, -1, 5, 7); ctx.fillStyle = '#e5e7eb'; ctx.fillRect(-9.5, 4, 5, 3); ctx.fillRect(4.5, 4, 5, 3); }
    else if (k.type === 'bomb') { ctx.fillStyle = '#1e1b4b'; ctx.beginPath(); ctx.arc(0, 0, 9, 0, TAU); ctx.fill(); ctx.fillStyle = '#fde047'; ctx.fillRect(-1.5, -7, 3, 14); ctx.fillRect(-5, -3, 10, 3); }
    else if (k.type === 'gold') { const sq = Math.abs(Math.cos(time * 4 + k.x)); ctx.fillStyle = '#f59e0b'; ctx.beginPath(); ctx.ellipse(0, 0, 6 * sq + 1, 6, 0, 0, TAU); ctx.fill(); ctx.fillStyle = '#fde68a'; ctx.beginPath(); ctx.ellipse(0, 0, 3.5 * sq + 0.5, 3.5, 0, 0, TAU); ctx.fill(); if (k.v >= 5) { ctx.fillStyle = '#f59e0b'; ctx.beginPath(); ctx.ellipse(8, 4, 5, 5, 0, 0, TAU); ctx.fill(); } }
    else if (k.type === 'chest') { ctx.fillStyle = '#78350f'; ctx.fillRect(-13, -8, 26, 18); ctx.fillStyle = '#92400e'; ctx.beginPath(); ctx.moveTo(-13, -8); ctx.quadraticCurveTo(0, -18, 13, -8); ctx.fill(); ctx.fillStyle = '#fbbf24'; ctx.fillRect(-13, -2, 26, 3); ctx.fillRect(-2.5, -5, 5, 8); ctx.fillRect(-13, -8, 3, 18); ctx.fillRect(10, -8, 3, 18); }
    ctx.restore();
  }
}
function drawProps(time) {
  for (const pr of G.props) {
    if (!inView(pr.x, pr.y, 40)) continue;
    const f = 0.8 + Math.sin(time * 11 + pr.x) * 0.12 + Math.sin(time * 27) * 0.08;
    ctx.save(); ctx.translate(pr.x, pr.y);
    ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.beginPath(); ctx.ellipse(0, 14, 11, 4, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#3f3f46'; ctx.fillRect(-2, -2, 4, 16); ctx.fillRect(-8, 12, 16, 3);
    ctx.fillStyle = '#52525b'; ctx.beginPath(); ctx.moveTo(-10, -6); ctx.lineTo(10, -6); ctx.lineTo(6, 0); ctx.lineTo(-6, 0); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#f97316'; ctx.beginPath(); ctx.moveTo(-7, -6); ctx.quadraticCurveTo(0, -24 * f, 7, -6); ctx.fill();
    ctx.fillStyle = '#fde047'; ctx.beginPath(); ctx.moveTo(-3, -6); ctx.quadraticCurveTo(0, -15 * f, 3, -6); ctx.fill();
    ctx.globalCompositeOperation = 'lighter'; glow(0, -10, 50 * f, '#f97316', 0.4); ctx.globalCompositeOperation = 'source-over';
    ctx.restore();
  }
}
function drawEffects() {
  for (const f of G.effects) {
    const k = f.life / f.max;
    if (f.type === 'ring') {
      const r = f.r * (1 - k * k * 0.85);
      if (f.fill) { ctx.globalAlpha = 0.18 * k; ctx.fillStyle = f.color; ctx.beginPath(); ctx.arc(f.x, f.y, r, 0, TAU); ctx.fill(); }
      ctx.globalAlpha = k; ctx.strokeStyle = f.color; ctx.lineWidth = 3 + 6 * k; ctx.beginPath(); ctx.arc(f.x, f.y, r, 0, TAU); ctx.stroke(); ctx.globalAlpha = 1;
    } else if (f.type === 'line') {
      const p = G.p; ctx.globalAlpha = k; ctx.strokeStyle = f.color; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(f.x, f.y); ctx.lineTo(p.x, p.y); ctx.stroke(); ctx.globalAlpha = 1;
    } else if (f.type === 'bolt' || f.type === 'chain') {
      ctx.globalAlpha = k; ctx.strokeStyle = f.color; ctx.lineWidth = f.type === 'bolt' ? 4 : 2.5; ctx.lineJoin = 'round';
      ctx.beginPath(); f.segs.forEach((s, i) => i ? ctx.lineTo(s[0], s[1]) : ctx.moveTo(s[0], s[1])); ctx.stroke();
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.2; ctx.stroke();
      if (f.type === 'bolt') { ctx.globalCompositeOperation = 'lighter'; glow(f.x, f.y, f.r * 2, '#93c5fd', k); ctx.globalCompositeOperation = 'source-over'; }
      ctx.globalAlpha = 1;
    }
  }
}
function drawBullets() {
  ctx.globalCompositeOperation = 'lighter';
  for (const b of G.ebullets) glow(b.x, b.y, b.r * 3, b.color, 0.8);
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = '#fff1f2'; for (const b of G.ebullets) { ctx.beginPath(); ctx.arc(b.x, b.y, b.r * 0.55, 0, TAU); ctx.fill(); }
}
function drawParticles() { for (const q of G.particles) { ctx.globalAlpha = Math.max(0, q.life / q.max); ctx.fillStyle = q.color; ctx.fillRect(q.x - q.r / 2, q.y - q.r / 2, q.r, q.r); } ctx.globalAlpha = 1; }
function drawTexts() {
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.85)';
  for (const t of G.texts) {
    const k = t.life / t.max; const pop = k > 0.8 ? 1 + (k - 0.8) * 2.5 : 1;
    ctx.globalAlpha = Math.min(1, k * 2); ctx.font = `800 ${Math.round(13 * t.scale * pop)}px Cinzel, Georgia, serif`;
    ctx.strokeText(t.text, t.x, t.y); ctx.fillStyle = t.color; ctx.fillText(t.text, t.x, t.y);
  }
  ctx.globalAlpha = 1;
}
function drawDecals() { for (const d of G.decals) { if (!inView(d.x, d.y, 40)) continue; ctx.fillStyle = d.color; ctx.beginPath(); ctx.ellipse(d.x, d.y, d.r, d.r * 0.6 * d.sx, d.rot, 0, TAU); ctx.fill(); } }
function drawIndicators(time) {
  const list = [];
  if (G.boss) list.push([G.boss, '#ef4444']);
  for (const k of G.pickups) if (k.type === 'chest') list.push([k, '#fbbf24']);
  for (const [o, col] of list) {
    if (inView(o.x, o.y, -10)) continue;
    const sx = (o.x - cam.x) * VS + W / 2, sy = (o.y - cam.y) * VS + H / 2; const a = Math.atan2(sy - H / 2, sx - W / 2);
    const m = 34; const ex = clamp(sx, m, W - m), ey = clamp(sy, m + 90, H - m);
    ctx.save(); ctx.translate(ex, ey); ctx.rotate(a); ctx.globalAlpha = 0.65 + Math.sin(time * 8) * 0.3; ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(14, 0); ctx.lineTo(-8, -9); ctx.lineTo(-4, 0); ctx.lineTo(-8, 9); ctx.closePath(); ctx.fill(); ctx.restore();
  }
}
function drawEmbers(dt) {
  for (const e of embers) { e.y -= e.vy * dt; e.x += e.vx * dt; if (e.y < -0.02) { e.y = 1.02; e.x = Math.random(); } }
  ctx.globalCompositeOperation = 'lighter';
  const n = Math.min(embers.length, Math.round(W * H / 22000)); for (let i = 0; i < n; i++) { const e = embers[i]; glow(e.x * W, e.y * H, e.r * 2.6, '#f87171', e.a * 0.55); }
  ctx.globalCompositeOperation = 'source-over';
}

let gTime = 0;
function render(rdt) {
  gTime += rdt;
  if (!G) { cam.x += 22 * rdt; cam.y += 9 * rdt; }
  const sh = G && G.shake > 0 ? G.shake : 0;
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.fillStyle = '#050308'; ctx.fillRect(0, 0, W, H);
  ctx.save();
  ctx.translate(W / 2 + (sh ? rand(-sh, sh) : 0), H / 2 + (sh ? rand(-sh, sh) : 0)); ctx.scale(VS, VS); ctx.translate(-cam.x, -cam.y);
  drawGround(gTime);
  if (G) {
    drawDecals(); drawPools(gTime); drawProps(gTime); drawGems(gTime); drawPickups(gTime);
    for (const e of G.enemies) if (!e.boss) drawEnemy(e, gTime);
    if (G.boss) drawEnemy(G.boss, gTime);
    drawPlayer(gTime); drawBlades(); drawProjectiles(); drawBullets(); drawEffects(); drawParticles(); drawTexts();
  }
  ctx.restore();
  drawEmbers(rdt);
  if (G) drawIndicators(gTime);
}

// ================= HUD =================
const hc = {};
function setT(id, v) { if (hc[id] !== v) { hc[id] = v; $(id).textContent = v; } }
function setW(id, f) { const v = (clamp(f, 0, 1) * 100).toFixed(1) + '%'; if (hc[id + '_w'] !== v) { hc[id + '_w'] = v; $(id).style.width = v; } }
function updateHUD() {
  const p = G.p;
  setT('lvlText', 'LV ' + p.level); setW('xpBar', p.xp / p.next);
  setT('hpText', Math.max(0, Math.ceil(p.hp)) + ' / ' + Math.round(p.maxHp)); setW('hpBar', p.hp / p.maxHp); setW('hpLag', p.hp / p.maxHp);
  setT('timer', fmtTime(G.t)); setT('kills', String(G.kills)); setT('goldHud', String(G.gold));
  setT('goal', G.won ? 'Endless night' : 'Dawn at ' + fmtTime(DAWN));
  if (G.boss) setW('bossBar', G.boss.hp / G.boss.maxHp);
  const low = p.hp / p.maxHp < 0.3 && G.dying <= 0; if (hc.low !== low) { hc.low = low; document.body.classList.toggle('lowhp', low); }
  const om = G.omen ? `${G.omen.name} · ${Math.ceil(G.omen.t)}s` : (G.bloodMoon > 0 ? `Blood Moon · ${Math.ceil(G.bloodMoon)}s` : '');
  if (hc.om !== om) { hc.om = om; $('omenBox').textContent = om; $('omenBox').classList.toggle('hidden', !om); }
  const cb = G.oracleCD > 0 ? Math.ceil(G.oracleCD) + 's' : 'Consult';
  if (hc.cb !== cb) { hc.cb = cb; $('consultBtn').textContent = cb; $('consultBtn').disabled = G.oracleCD > 0; }
  if (G.arsenalDirty) { G.arsenalDirty = false; renderArsenal(); }
}
function renderArsenal() {
  const p = G.p;
  $('wSlots').innerHTML = p.order.map(id => { const w = p.weapons[id], d = WEAPONS[id]; return `<div class="slot ${w.evo ? 'evo' : ''}" title="${esc(w.evo ? d.evo : d.name)}" style="${w.evo ? '' : 'color:' + d.color}">${d.icon}<span class="lv">${w.evo ? '★' : w.lv}</span></div>`; }).join('');
  $('pSlots').innerHTML = p.porder.map(id => `<div class="slot p" title="${esc(PASSIVES[id].name)}">${PASSIVES[id].icon}<span class="lv">${p.passives[id]}</span></div>`).join('');
}

// ================= LEVEL-UP / CHEST MODAL =================
let luChoices = [], luMode = 'level', luOpened = 0;
function buildChoices(isChest) {
  const p = G.p; const opts = [];
  const wc = p.order.length, pc = p.porder.length;
  for (const id in WEAPONS) {
    const w = p.weapons[id], d = WEAPONS[id];
    if (w) { if (w.lv < d.max) opts.push({ kind: 'wup', id, w: 10 }); else if (!w.evo && (p.passives[d.pair] || 0) > 0) opts.push({ kind: 'evo', id, w: isChest ? 1000 : 40 }); }
    else if (wc < 6) opts.push({ kind: 'wnew', id, w: wc < 3 ? 8 : 4 });
  }
  for (const id in PASSIVES) {
    const lv = p.passives[id] || 0;
    if (lv > 0) { if (lv < PASSIVES[id].max) opts.push({ kind: 'pup', id, w: 6 }); }
    else if (pc < 6) opts.push({ kind: 'pnew', id, w: 4 + (p.order.some(wid => WEAPONS[wid].pair === id) ? 3 : 0) });
  }
  const out = [];
  while (out.length < 3 && opts.length) { const o = weightedPick(opts); out.push(o); opts.splice(opts.indexOf(o), 1); }
  if (out.length < 3) out.push({ kind: 'heal', id: 'heal' });
  if (out.length < 3) out.push({ kind: 'gold', id: 'gold' });
  return out;
}
function cardInfo(c) {
  const p = G.p;
  if (c.kind === 'wnew') { const d = WEAPONS[c.id]; return { tag: 'New weapon', tc: 'new', icon: d.icon, color: d.color, name: d.name, desc: d.desc, extra: 'Evolves with ' + PASSIVES[d.pair].name }; }
  if (c.kind === 'wup') { const d = WEAPONS[c.id], w = p.weapons[c.id]; return { tag: `Level ${w.lv} → ${w.lv + 1}`, tc: '', icon: d.icon, color: d.color, name: d.name, desc: d.up[w.lv + 1], extra: w.lv + 1 === d.max ? `Max level! Own ${PASSIVES[d.pair].name} to evolve.` : '' }; }
  if (c.kind === 'evo') { const d = WEAPONS[c.id]; return { tag: '★ Evolution', tc: 'evo', icon: d.icon, color: '#fde047', name: d.evo, desc: d.evoDesc, extra: `${d.name} + ${PASSIVES[d.pair].name}`, evo: true }; }
  if (c.kind === 'pnew' || c.kind === 'pup') { const d = PASSIVES[c.id], lv = p.passives[c.id] || 0; const pairs = Object.keys(WEAPONS).filter(k => WEAPONS[k].pair === c.id).map(k => WEAPONS[k].name); return { tag: lv ? `Relic ${lv} → ${lv + 1}` : 'New relic', tc: 'pas', icon: d.icon, color: '#d8b4fe', name: d.name, desc: d.desc, extra: pairs.length ? 'Evolves ' + pairs.join(', ') : '' }; }
  if (c.kind === 'heal') return { tag: 'Feast', tc: '', icon: '♥', color: '#f87171', name: 'Blood Feast', desc: 'Restore 40 HP.', extra: '' };
  return { tag: 'Treasure', tc: '', icon: '●', color: '#fcd34d', name: 'Tithe of Gold', desc: '+30 gold.', extra: '' };
}
function openUpgrade(mode) {
  state = 'LEVELUP'; luMode = mode; luOpened = performance.now(); clearInput();
  if (mode === 'level') { G.pendingLevels--; $('luTitle').textContent = 'LEVEL UP!'; $('luTitle').style.color = '#fbbf24'; $('luSub').textContent = `Level ${G.p.level - G.pendingLevels} · Choose a Dark Blessing`; SFX.play('level'); $('forgeBox').classList.remove('hidden'); }
  else { G.chestQueue--; const g = Math.round(20 * G.p.goldMult); G.gold += g; $('luTitle').textContent = 'RELIC CHEST'; $('luTitle').style.color = '#fde047'; $('luSub').textContent = `+${g} gold · The relic hums with forbidden power. Claim one.`; SFX.play('chest'); $('forgeBox').classList.add('hidden'); }
  luChoices = buildChoices(mode === 'chest'); renderCards();
  $('forgeInput').value = ''; $('levelScreen').classList.remove('hidden'); updateHUD();
}
function renderCards() {
  const box = $('cards'); box.innerHTML = '';
  luChoices.forEach((c, i) => {
    const info = cardInfo(c); const b = document.createElement('button'); b.className = 'card' + (info.evo ? ' evo' : '');
    b.innerHTML = `<span class="key">${i + 1}</span><div class="ic" style="color:${info.color}">${info.icon}</div><div class="tagwrap"><div class="tag ${info.tc} cinzel">${esc(info.tag)}</div><div class="cn gothic">${esc(info.name)}</div></div><div class="cd">${esc(info.desc)}</div>${info.extra ? `<div class="cx cinzel">${esc(info.extra)}</div>` : ''}`;
    b.addEventListener('click', () => chooseCard(i)); box.appendChild(b);
  });
  const rb = $('rerollBtn'); rb.textContent = `↻ Reroll (${G.p.rerolls})`; rb.disabled = G.p.rerolls <= 0;
}
function chooseCard(i) {
  if (state !== 'LEVELUP' || performance.now() - luOpened < 300) return;
  const c = luChoices[i]; if (!c) return; const p = G.p;
  if (c.kind === 'wnew') addWeapon(c.id);
  else if (c.kind === 'wup') p.weapons[c.id].lv++;
  else if (c.kind === 'evo') { p.weapons[c.id].evo = true; const n = WEAPONS[c.id].evo; banner(n.toUpperCase(), 'Weapon evolved', '#fde047'); SFX.play('evo'); oracleSay(fillTpl(pick(ORACLE.evo), { evo: n }), 'Awed...'); SFX.play('click'); return afterUpgrade(true); }
  else if (c.kind === 'pnew' || c.kind === 'pup') { if (!p.passives[c.id]) p.porder.push(c.id); p.passives[c.id] = (p.passives[c.id] || 0) + 1; if (c.id === 'heart') { p.maxHp += 20; heal(20); } }
  else if (c.kind === 'heal') heal(40, true);
  else if (c.kind === 'gold') G.gold += 30;
  SFX.play('click'); afterUpgrade();
}
function afterUpgrade(quiet) {
  recalc();
  const p = G.p; burst(p.x, p.y, 24, '#fbbf24', 200, 0.6, 3); G.effects.push({ type: 'ring', x: p.x, y: p.y, r: 90, life: 0.4, max: 0.4, color: '#fbbf24', follow: true });
  p.iframes = Math.max(p.iframes, 0.6);
  if (!quiet && Math.random() < 0.3) oracleSay(pick(ORACLE.level) + ` Level ${p.level}.`, 'Approves...');
  if (G.pendingLevels > 0) return openUpgrade('level');
  if (G.chestQueue > 0) return openUpgrade('chest');
  $('levelScreen').classList.add('hidden'); state = 'PLAYING'; updateHUD();
}
function doReroll() {
  if (state !== 'LEVELUP' || G.p.rerolls <= 0) return;
  G.p.rerolls--; luChoices = buildChoices(luMode === 'chest'); renderCards(); SFX.play('click');
}
function doForge() {
  if (state !== 'LEVELUP' || luMode !== 'level') return;
  const raw = $('forgeInput').value.trim(); const text = raw.toLowerCase(); $('forgeInput').blur();
  let best = null, bs = 0;
  for (const f of FORGE) { let s = 0; for (const w of f.words) if (text.includes(w)) s++; if (s > bs) { bs = s; best = f; } }
  if (!best) best = pick(FORGE);
  const m = clamp(rand(0.6, 1.35) + (bs > 1 ? 0.15 : 0), 0.5, 1.5);
  const p = G.p; best.apply(p, m);
  let name = pick(best.names);
  if (raw && raw.length <= 30) name = 'Blessing of ' + raw.replace(/\s+/g, ' ').replace(/(^|\s)\S/g, s => s.toUpperCase());
  const strength = m > 1.2 ? 'a mighty' : m < 0.8 ? 'a faint' : 'a true';
  p.blessings = p.blessings || []; p.blessings.push(name + ' (' + best.eff(m) + ')');
  oracleSay(`From your words I forge ${strength} blessing: ${name}. ${best.eff(m)}.`, 'Forges!');
  addText(name.toUpperCase(), p.x, p.y - 50, '#e9d5ff', 1.2); SFX.play('omen'); afterUpgrade(true);
}

// ================= SCREENS & FLOW =================
function show(id) { ['titleScreen', 'shopScreen', 'howScreen', 'levelScreen', 'pauseScreen', 'endScreen'].forEach(s => $(s).classList.toggle('hidden', s !== id)); }
function setHudVisible(v) { ['hud', 'arsenal'].forEach(id => $(id).classList.toggle('hidden', !v)); }
function startRun() {
  SFX.init(); SFX.play('click');
  newRun(save.hunter); for (const k in hc) delete hc[k];
  document.body.classList.remove('bloodmoon', 'lowhp');
  show(null); setHudVisible(true); $('bossWrap').classList.add('hidden');
  state = 'PLAYING'; clearInput(); Music.intense = false; Music.start();
  banner('THE NIGHT BEGINS', 'Survive until dawn', '#ef4444');
  oracleSay(pick(ORACLE.intro), 'Awakens...');
  if (matchMedia('(pointer: coarse)').matches) $('touchHint').classList.remove('hidden');
  updateHUD();
}
function pauseGame() {
  if (state !== 'PLAYING' || !G || G.dying > 0) return;
  state = 'PAUSED'; clearInput(); Music.stop(); show('pauseScreen'); syncToggles();
  const p = G.p;
  $('pauseInfo').textContent = `${p.hunter.name} ${p.hunter.title} · Night ${fmtTime(G.t)} · Level ${p.level} · ${G.kills} slain`;
  const items = p.order.map(id => { const w = p.weapons[id], d = WEAPONS[id]; return `<div class="bi"><div class="bn gothic" style="color:${w.evo ? '#fde047' : d.color}">${d.icon} ${esc(w.evo ? d.evo : d.name)} ${w.evo ? '★' : 'Lv ' + w.lv}</div><div class="bd">${w.evo ? 'Evolved' : 'Evolves at Lv ' + d.max + ' with ' + PASSIVES[d.pair].name}</div></div>`; })
    .concat(p.porder.map(id => `<div class="bi"><div class="bn gothic" style="color:#d8b4fe">${PASSIVES[id].icon} ${esc(PASSIVES[id].name)} Lv ${p.passives[id]}</div><div class="bd">${esc(PASSIVES[id].desc)}</div></div>`))
    .concat((p.blessings || []).map(b => `<div class="bi"><div class="bn gothic" style="color:#c4b5fd">✧ ${esc(b)}</div><div class="bd">Forged blessing</div></div>`));
  $('buildList').innerHTML = items.join('');
}
function resumeGame() { if (state !== 'PAUSED') return; show(null); state = 'PLAYING'; Music.start(); }
function quitToTitle() { state = 'TITLE'; G = null; Music.stop(); setHudVisible(false); document.body.classList.remove('bloodmoon', 'lowhp'); $('touchHint').classList.add('hidden'); clearInput(); renderTitle(); show('titleScreen'); }
function bankGold(won) {
  const earned = Math.floor(G.gold * 1 + G.kills / 20 + G.t / 60 * 6 + G.stats.bosses * 40 + (won ? 150 : 0));
  const delta = Math.max(0, earned - G.banked); G.banked = earned; save.gold += delta; return earned;
}
function epitaph(won) {
  const p = G.p, name = `${p.hunter.name} ${p.hunter.title}`, time = fmtTime(G.t), k = G.kills, w = topWeaponName();
  let pool;
  if (won && G.endless) pool = [`${name} outlived the dawn itself, and still the night came back for more. ${k} souls answered for it.`, `Beyond dawn, beyond reason: ${name} fell at ${time}, ${w} still burning.`];
  else if (won) pool = [`The sun rose on ${name}, standing amid ${k} ashes. The Crimson Night is broken... until the moon returns.`, `${name} met the dawn with ${w} in hand. The crypts will speak of this for a thousand years.`];
  else if (G.t < 60) pool = [`Here lies ${name}, who mistook the night for a gentle thing. It lasted ${time}.`, `${name} entered the night bravely and left it quickly. ${k} foes slain.`];
  else if (G.t < 240) pool = [`${name} fell at ${time}, ${k} souls behind them. The swarm never tires; you do.`, `The ${w} fell silent at ${time}. The dead dragged ${name} beneath the graves.`];
  else pool = [`A worthy death. ${name} held the night for ${time} and sent ${k} creatures back to the dark.`, `Even the Count paused to watch ${name} fall. ${time} of defiance, ${k} slain by ${w}.`];
  return pick(pool);
}
function endRun(won) {
  state = 'END'; Music.stop(); clearInput();
  const p = G.p; const prevBest = save.best;
  const earned = bankGold(won);
  if (!G.countedRun) { save.runs++; G.countedRun = true; }
  if (won && !G.countedWin) { save.wins++; G.countedWin = true; }
  save.totalKills += G.kills - (G.killsCounted || 0); G.killsCounted = G.kills;
  save.best = Math.max(save.best, G.t); save.bestKills = Math.max(save.bestKills, G.kills); save.bestLevel = Math.max(save.bestLevel, p.level); persist();
  $('endTitle').textContent = won && !G.endless ? 'DAWN BREAKS' : 'YOU DIED';
  $('endTitle').style.color = won && !G.endless ? '#fde68a' : '#dc2626';
  $('endSub').textContent = won && !G.endless ? 'You survived the Crimson Night!' : (G.endless ? 'The endless night finally claimed you...' : 'The vampires claimed your blood...');
  $('newBest').classList.toggle('hidden', !(G.t > prevBest && prevBest > 0));
  $('rTime').textContent = fmtTime(G.t); $('rKills').textContent = G.kills; $('rLevel').textContent = p.level; $('rBosses').textContent = G.stats.bosses; $('rGold').textContent = earned + ' (total ' + save.gold + ')'; $('rBest').textContent = fmtTime(save.best);
  const rows = Object.keys(G.dmgBy).filter(k => WEAPONS[k]).map(k => [k, G.dmgBy[k]]).sort((a, b) => b[1] - a[1]); const mx = rows.length ? rows[0][1] : 1;
  $('dmgTable').innerHTML = rows.length ? '<div class="sec" style="margin:4px 0">Damage dealt</div>' + rows.map(([k, v]) => { const w = p.weapons[k]; return `<div class="dmgRow"><span class="dn">${WEAPONS[k].icon} ${esc(w && w.evo ? WEAPONS[k].evo : WEAPONS[k].name)}</span><span class="dbar"><i style="width:${(v / mx * 100).toFixed(1)}%"></i></span><span class="dv">${Math.round(v).toLocaleString()}</span></div>`; }).join('') : '';
  $('epitaph').textContent = '"' + epitaph(won) + '"';
  const canContinue = won && !G.endless;
  $('continueBtn').classList.toggle('hidden', !canContinue);
  $('againBtn').textContent = canContinue ? 'NEW HUNT' : 'RESURRECT';
  show('endScreen'); if (!won) SFX.play('death');
}
function continueEndless() {
  if (!G || !G.won) return; G.endless = true; show(null); state = 'PLAYING'; Music.start();
  banner('ENDLESS NIGHT', 'The moon refuses to set', '#a855f7'); oracleSay('You thought dawn was the end? The moon has returned, and it is hungry.', 'Laughs...');
}

// Title & hunters
function renderTitle() {
  const list = $('hunterList'); list.innerHTML = '';
  HUNTERS.forEach(h => {
    const d = document.createElement('div'); d.className = 'hunter' + (save.hunter === h.id ? ' sel' : '');
    const cv = document.createElement('canvas'); cv.width = 128; cv.height = 128; const c = cv.getContext('2d'); c.scale(2, 2); c.translate(32, 36); c.scale(1.5, 1.5); drawHunter(c, h.col, 1, 0, false, false);
    d.appendChild(cv);
    d.insertAdjacentHTML('beforeend', `<div class="hn gothic">${esc(h.name)}</div><div class="ht cinzel">${esc(h.title)}</div><div class="hd">${WEAPONS[h.weapon].icon} ${esc(WEAPONS[h.weapon].name)}<br>${esc(h.desc)}</div>`);
    d.addEventListener('click', () => { save.hunter = h.id; persist(); SFX.init(); SFX.play('click'); renderTitle(); });
    list.appendChild(d);
  });
  $('titleGold').textContent = save.gold + 'g';
  $('titleStats').innerHTML = save.runs ? `<span>Best night <b>${fmtTime(save.best)}</b></span><span>Most kills <b>${save.bestKills}</b></span><span>Hunts <b>${save.runs}</b></span><span>Dawns seen <b>${save.wins}</b></span>` : (save.best > 0 ? `<span>Best night <b>${fmtTime(save.best)}</b></span>` : '<span>No hunts yet. The night awaits.</span>');
}
function renderShop() {
  $('shopGold').textContent = save.gold;
  $('shopList').innerHTML = META.map(m => { const lv = save.meta[m.id] || 0; const maxed = lv >= m.max; const cost = metaCost(m, lv); return `<div class="meta"><div class="mi"><div class="mn gothic">${esc(m.name)}</div><div class="md">${esc(m.desc)}</div><div class="pips">${Array.from({ length: m.max }, (_, i) => `<span class="pip ${i < lv ? 'on' : ''}"></span>`).join('')}</div></div><button class="btn small" data-buy="${m.id}" ${maxed || save.gold < cost ? 'disabled' : ''}>${maxed ? 'MAX' : cost + 'g'}</button></div>`; }).join('');
  $('shopList').querySelectorAll('[data-buy]').forEach(b => b.addEventListener('click', () => {
    const m = META.find(x => x.id === b.dataset.buy); const lv = save.meta[m.id] || 0; const cost = metaCost(m, lv);
    if (lv >= m.max || save.gold < cost) return; save.gold -= cost; save.meta[m.id] = lv + 1; persist(); SFX.init(); SFX.play('chest'); renderShop();
  }));
}
function refundAll() {
  let back = 0; for (const m of META) { const lv = save.meta[m.id] || 0; for (let i = 0; i < lv; i++) back += metaCost(m, i); }
  if (!back) return; save.gold += back; save.meta = {}; persist(); SFX.play('gold'); renderShop();
}
function syncToggles() {
  const names = { sound: 'Sound', music: 'Music', numbers: 'Damage numbers', shake: 'Screen shake' };
  document.querySelectorAll('[data-set]').forEach(b => { const k = b.dataset.set; b.textContent = `${names[k]}: ${save.settings[k] ? 'On' : 'Off'}`; });
}

// Buttons
$('startBtn').addEventListener('click', startRun);
$('shopBtn').addEventListener('click', () => { SFX.init(); SFX.play('click'); renderShop(); show('shopScreen'); });
$('howBtn').addEventListener('click', () => { SFX.init(); SFX.play('click'); show('howScreen'); });
$('shopBack').addEventListener('click', () => { renderTitle(); show('titleScreen'); });
$('shopRefund').addEventListener('click', refundAll);
$('howBack').addEventListener('click', () => show('titleScreen'));
$('pauseBtn').addEventListener('click', e => { e.stopPropagation(); pauseGame(); });
$('resumeBtn').addEventListener('click', resumeGame);
$('restartBtn').addEventListener('click', () => { if (G && state === 'PAUSED') { bankGold(false); persist(); } startRun(); });
$('quitBtn').addEventListener('click', () => { if (G) { bankGold(false); if (!G.countedRun) save.runs++; G.countedRun = true; save.best = Math.max(save.best, G.t); persist(); } quitToTitle(); });
$('againBtn').addEventListener('click', startRun);
$('menuBtn').addEventListener('click', quitToTitle);
$('continueBtn').addEventListener('click', continueEndless);
$('consultBtn').addEventListener('click', e => { e.stopPropagation(); consultOracle(); });
$('rerollBtn').addEventListener('click', doReroll);
$('forgeBtn').addEventListener('click', doForge);
document.querySelectorAll('[data-set]').forEach(b => b.addEventListener('click', () => { const k = b.dataset.set; save.settings[k] = !save.settings[k]; persist(); SFX.apply(); syncToggles(); if (k === 'music' && save.settings.music && state === 'PLAYING') Music.start(); }));

// ================= LOOP =================
let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const rdt = Math.min(0.05, Math.max(0, (now - last) / 1000)); last = now;
  try {
    if (state === 'PLAYING' && G) {
      if (G.slowT > 0) { G.slowT -= rdt; if (G.slowT <= 0) G.timeScale = 1; }
      for (let i = 0; i < DEBUG.turbo && state === 'PLAYING' && G; i++) update(rdt * G.timeScale, rdt);
      if (G && state !== 'TITLE') updateHUD();
    }
    render(rdt);
  } catch (err) { console.error(err); }
}
renderTitle(); syncToggles(); show('titleScreen');
requestAnimationFrame(frame);

// Small debug/test hook (harmless for players)
window.CrimsonNight = { get state() { return state; }, get run() { return G; }, grantXP(v) { if (G) gainXP(v); }, skipTo(t) { if (G) { G.t = t; G.nextEvent = Math.max(G.nextEvent, t + 5); } }, start: startRun, debug: DEBUG, kill() { if (G) { G.p.revives = 0; G.p.iframes = 0; hurtPlayer(1e6); } } };
})();
