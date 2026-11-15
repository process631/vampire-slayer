'use strict';
(function(){
// ================= UTILITIES =================
const $ = id => document.getElementById(id);
const rand = (a, b) => a + Math.random() * (b - a);
const randi = (a, b) => Math.floor(rand(a, b + 1));
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const TAU = Math.PI * 2;
const fmtTime = t => { t = Math.max(0, Math.floor(t)); return String(Math.floor(t / 60)).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0'); };
const pct = v => Math.round(v * 100) + '%';
function hash(x, y) { let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return (h ^ (h >>> 16)) >>> 0; }
function hexA(hex, a) { const n = parseInt(hex.slice(1), 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`; }
function weightedPick(list) { let tot = 0; for (const o of list) tot += o.w; let r = Math.random() * tot; for (const o of list) { r -= o.w; if (r <= 0) return o; } return list[list.length - 1]; }
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const DAWN = 600;            // seconds until victory
const BOSS_TIMES = [180, 360, 540];

// ================= SAVE DATA (localStorage) =================
const SAVE_KEY = 'crimson_night_save_v2';
const DEFAULT_SAVE = { gold: 0, best: 0, bestKills: 0, bestLevel: 0, runs: 0, wins: 0, totalKills: 0, meta: {}, settings: { sound: true, music: true, numbers: true, shake: true }, hunter: 'slayer' };
function loadSave() {
  const fresh = JSON.parse(JSON.stringify(DEFAULT_SAVE));
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) {
      const d = JSON.parse(raw) || {};
      return Object.assign(fresh, d, { meta: Object.assign({}, d.meta || {}), settings: Object.assign(fresh.settings, d.settings || {}) });
    }
    const old = parseFloat(localStorage.getItem('vampire_slayer_highscore'));
    if (old > 0) fresh.best = old;
  } catch (e) { /* storage unavailable */ }
  return fresh;
}
let save = loadSave();
function persist() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) { } }

// ================= AUDIO (generated with Web Audio, no files) =================
const SFX = {
  ctx: null, master: null, sfxGain: null, musicGain: null, noiseBuf: null, last: {},
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {}); return; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    try {
      this.ctx = new AC();
      const comp = this.ctx.createDynamicsCompressor(); comp.connect(this.ctx.destination);
      this.master = this.ctx.createGain(); this.master.connect(comp);
      this.sfxGain = this.ctx.createGain(); this.sfxGain.gain.value = 0.55; this.sfxGain.connect(this.master);
      this.musicGain = this.ctx.createGain(); this.musicGain.connect(this.master);
      const len = this.ctx.sampleRate;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0); for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.apply();
    } catch (e) { this.ctx = null; }
  },
  apply() { if (!this.ctx) return; this.master.gain.value = save.settings.sound ? 0.7 : 0; this.musicGain.gain.value = save.settings.music ? 0.15 : 0; },
  ok(name, gap) { if (!this.ctx || !save.settings.sound) return false; const t = performance.now(); if (this.last[name] && t - this.last[name] < gap) return false; this.last[name] = t; return true; },
  tone(f, dur, type, vol, f2, delay, dest) {
    const c = this.ctx; const t = c.currentTime + (delay || 0);
    const o = c.createOscillator(), g = c.createGain();
    o.type = type || 'square'; o.frequency.setValueAtTime(f, t);
    if (f2) o.frequency.exponentialRampToValueAtTime(Math.max(20, f2), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol || 0.2, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(dest || this.sfxGain); o.start(t); o.stop(t + dur + 0.05);
  },
  noise(dur, vol, freq, delay, type) {
    const c = this.ctx; const t = c.currentTime + (delay || 0);
    const s = c.createBufferSource(); s.buffer = this.noiseBuf;
    const f = c.createBiquadFilter(); f.type = type || 'lowpass'; f.frequency.value = freq || 1000;
    const g = c.createGain(); g.gain.setValueAtTime(vol || 0.2, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(this.sfxGain); s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.05);
  },
  play(name, p) {
    try {
      switch (name) {
        case 'shoot': if (this.ok(name, 70)) this.tone(rand(620, 760), 0.09, 'square', 0.035, 260); break;
        case 'dagger': if (this.ok(name, 70)) { this.noise(0.07, 0.07, 5000, 0, 'highpass'); this.tone(1400, 0.05, 'triangle', 0.03, 900); } break;
        case 'hit': if (this.ok(name, 50)) this.noise(0.05, 0.07, 1600); break;
        case 'kill': if (this.ok(name, 45)) this.tone(rand(170, 240), 0.13, 'triangle', 0.08, 55); break;
        case 'xp': if (this.ok(name, 30)) { const k = Math.min(p || 0, 24); this.tone(800 + k * 32, 0.07, 'sine', 0.05, 1150 + k * 32); } break;
        case 'level': if (this.ok(name, 300)) [523, 659, 784, 1047, 1319].forEach((f, i) => this.tone(f, 0.3, 'triangle', 0.11, null, i * 0.06)); break;
        case 'chest': if (this.ok(name, 300)) { [392, 494, 587, 784, 988, 1175].forEach((f, i) => this.tone(f, 0.35, 'sine', 0.12, null, i * 0.07)); this.noise(0.6, 0.06, 6000, 0.1, 'highpass'); } break;
        case 'evo': if (this.ok(name, 300)) { [262, 330, 392, 523, 659, 784, 1047].forEach((f, i) => { this.tone(f, 0.5, 'triangle', 0.1, null, i * 0.05); this.tone(f * 1.5, 0.5, 'sine', 0.05, null, i * 0.05 + 0.02); }); } break;
        case 'nova': if (this.ok(name, 120)) { this.tone(240, 0.5, 'sine', 0.18, 60); this.noise(0.35, 0.1, 900); } break;
        case 'hurt': if (this.ok(name, 120)) { this.tone(170, 0.2, 'sawtooth', 0.11, 70); this.noise(0.12, 0.1, 700); } break;
        case 'zap': if (this.ok(name, 90)) { this.noise(0.2, 0.14, 2500, 0, 'bandpass'); this.tone(1500, 0.12, 'sawtooth', 0.04, 150); } break;
        case 'splash': if (this.ok(name, 120)) { this.noise(0.28, 0.1, 1400, 0, 'bandpass'); this.tone(500, 0.15, 'sine', 0.05, 200); } break;
        case 'pickup': if (this.ok(name, 90)) [660, 990].forEach((f, i) => this.tone(f, 0.14, 'sine', 0.1, null, i * 0.06)); break;
        case 'heal': if (this.ok(name, 150)) [523, 659, 880].forEach((f, i) => this.tone(f, 0.25, 'sine', 0.09, null, i * 0.07)); break;
        case 'gold': if (this.ok(name, 60)) { this.tone(1320, 0.08, 'square', 0.03); this.tone(1760, 0.12, 'square', 0.03, null, 0.05); } break;
        case 'bomb': if (this.ok(name, 200)) { this.noise(1.0, 0.35, 500); this.tone(110, 0.9, 'sine', 0.3, 30); } break;
        case 'boss': if (this.ok(name, 500)) { this.tone(80, 1.6, 'sawtooth', 0.16, 40); this.tone(84, 1.6, 'sawtooth', 0.12, 38); this.noise(1.4, 0.14, 400); } break;
        case 'bossdie': if (this.ok(name, 500)) { this.noise(1.6, 0.3, 700); this.tone(200, 1.5, 'sawtooth', 0.12, 30); [392, 523, 659, 784].forEach((f, i) => this.tone(f, 0.5, 'triangle', 0.09, null, 0.5 + i * 0.1)); } break;
        case 'bullet': if (this.ok(name, 90)) this.tone(320, 0.12, 'sine', 0.04, 180); break;
        case 'dash': if (this.ok(name, 200)) this.noise(0.3, 0.12, 1200, 0, 'bandpass'); break;
        case 'break': if (this.ok(name, 100)) { this.noise(0.18, 0.15, 3000); this.tone(300, 0.1, 'square', 0.04, 100); } break;
        case 'omen': if (this.ok(name, 400)) [220, 277, 330, 415, 554].forEach((f, i) => this.tone(f, 0.8, 'sine', 0.07, null, i * 0.09)); break;
        case 'click': if (this.ok(name, 40)) this.tone(500, 0.05, 'triangle', 0.05); break;
        case 'death': if (this.ok(name, 500)) [330, 277, 220, 165, 110].forEach((f, i) => this.tone(f, 0.5, 'sawtooth', 0.08, f * 0.8, i * 0.16)); break;
        case 'victory': if (this.ok(name, 500)) [523, 659, 784, 1047, 784, 1047, 1319].forEach((f, i) => this.tone(f, 0.5, 'triangle', 0.1, null, i * 0.13)); break;
        case 'event': if (this.ok(name, 400)) { this.tone(147, 0.9, 'sawtooth', 0.07, 140); this.tone(220, 0.9, 'sawtooth', 0.05, 210); } break;
      }
    } catch (e) { }
  }
};

// Small procedural gothic music loop (D minor), scheduled ahead with the audio clock.
const Music = {
  on: false, step: 0, next: 0, timer: null, intense: false,
  // chord roots per bar: Dm, Bb, Gm, A
  bars: [[73.42, [293.7, 349.2, 440.0]], [58.27, [233.1, 293.7, 349.2]], [49.0, [196.0, 233.1, 293.7]], [55.0, [220.0, 277.2, 329.6]]],
  start() { if (!SFX.ctx) return; this.on = true; this.next = SFX.ctx.currentTime + 0.1; if (!this.timer) this.timer = setInterval(() => this.tick(), 60); },
  stop() { this.on = false; },
  tick() {
    if (!this.on || !SFX.ctx || !save.settings.music) return;
    const c = SFX.ctx; const spb = this.intense ? 0.125 : 0.16;
    if (this.next < c.currentTime - 0.1) this.next = c.currentTime + 0.05;
    while (this.next < c.currentTime + 0.25) { this.playStep(this.step, this.next - c.currentTime); this.next += spb; this.step++; }
  },
  playStep(s, d) {
    const bar = this.bars[Math.floor(s / 16) % 4]; const i = s % 16; const g = SFX.musicGain;
    try {
      if (i % 4 === 0) SFX.tone(bar[0], 0.55, 'sawtooth', 0.22, null, d, g);
      if (i === 8 && this.intense) SFX.tone(bar[0] * 2, 0.3, 'square', 0.1, null, d, g);
      const arp = [0, 1, 2, 1, 0, 2, 1, 2];
      if (i % 2 === 0) SFX.tone(bar[1][arp[(i / 2) % 8]] * (this.intense ? 2 : 1), 0.22, 'triangle', 0.09, null, d, g);
      if (this.intense && i % 4 === 2) { const c = SFX.ctx; const t = c.currentTime + d; const src = c.createBufferSource(); src.buffer = SFX.noiseBuf; const f = c.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 7000; const gg = c.createGain(); gg.gain.setValueAtTime(0.12, t); gg.gain.exponentialRampToValueAtTime(0.0001, t + 0.05); src.connect(f); f.connect(gg); gg.connect(g); src.start(t, Math.random() * 0.5); src.stop(t + 0.08); }
      if (i === 0 && Math.floor(s / 16) % 2 === 0) SFX.tone(bar[1][0] / 2, 2.4, 'sine', 0.12, null, d, g); // organ pad
    } catch (e) { }
  }
};

// ================= GAME DATA =================
const HUNTERS = [
  { id: 'slayer', name: 'Vael', title: 'the Slayer', weapon: 'bolt', desc: 'Balanced hunter of the old order.', stats: {}, col: { cloak: '#450a0a', body: '#1e1b4b', scarf: '#dc2626', hair: '#e2e8f0', eye: '#38bdf8' } },
  { id: 'nun', name: 'Seraphine', title: 'the Sister', weapon: 'water', desc: '+15% area, +10 HP, -5% speed.', stats: { area: 1.15, maxHp: 10, speed: 0.95 }, col: { cloak: '#1e293b', body: '#e2e8f0', scarf: '#fbbf24', hair: '#0f172a', eye: '#fde68a' } },
  { id: 'dhampir', name: 'Lucan', title: 'the Dhampir', weapon: 'drain', desc: '+20 HP, regenerates 0.4 HP/s.', stats: { maxHp: 20, regen: 0.4 }, col: { cloak: '#3b0764', body: '#18181b', scarf: '#9f1239', hair: '#fafafa', eye: '#ef4444' } },
  { id: 'rogue', name: 'Mira', title: 'Nightblade', weapon: 'dagger', desc: '+12% speed, +10% damage, -20 HP.', stats: { speed: 1.12, dmg: 1.1, maxHp: -20 }, col: { cloak: '#14532d', body: '#1c1917', scarf: '#a3a3a3', hair: '#9a3412', eye: '#86efac' } },
];

const WEAPONS = {
  bolt: {
    name: 'Crimson Bolts', icon: '✦', color: '#f87171', max: 6, pair: 'tome', evo: 'Sanguine Storm',
    desc: 'Fires seeking blood bolts at the nearest foes.', evoDesc: 'A storm of homing bolts that pierce through crowds.',
    up: ['', '', '+1 bolt.', '+40% damage.', '+1 bolt. Bolts pierce 1 foe.', '-20% cooldown.', '+1 bolt, +40% damage.'],
    stats(lv, evo) { const s = { dmg: 20, cd: 0.8, count: 1, pierce: 0, speed: 520 }; if (lv >= 2) s.count++; if (lv >= 3) s.dmg *= 1.4; if (lv >= 4) { s.count++; s.pierce++; } if (lv >= 5) s.cd *= 0.8; if (lv >= 6) { s.count++; s.dmg *= 1.4; } if (evo) { s.count += 2; s.pierce += 2; s.cd *= 0.6; s.dmg *= 1.3; } return s; }
  },
  blade: {
    name: 'Shadow Blades', icon: '⚔', color: '#c084fc', max: 6, pair: 'area', evo: 'Eclipse Reapers',
    desc: 'Dark blades orbit you, slicing anything they touch.', evoDesc: 'Six huge reaping blades in a wide, fast orbit.',
    up: ['', '', '+1 blade.', '+30% damage, +15% orbit size.', '+1 blade.', '+30% spin speed and damage.', '+1 blade.'],
    stats(lv, evo) { const s = { dmg: 13, count: 2, radius: 72, rot: 3.0, hitcd: 0.45, size: 1 }; if (lv >= 2) s.count++; if (lv >= 3) { s.dmg *= 1.3; s.radius *= 1.15; } if (lv >= 4) s.count++; if (lv >= 5) { s.rot *= 1.3; s.dmg *= 1.3; } if (lv >= 6) s.count++; if (evo) { s.count += 1; s.dmg *= 1.7; s.radius *= 1.3; s.rot *= 1.25; s.size = 1.5; s.hitcd = 0.35; } return s; }
  },
  nova: {
    name: 'Holy Nova', icon: '✺', color: '#fde047', max: 6, pair: 'heart', evo: 'Judgement Day',
    desc: 'A blast of holy light that hurls enemies back.', evoDesc: 'Double holy blasts that also heal you.',
    up: ['', '', '+30% damage.', '+20% radius.', '-20% cooldown.', '+40% damage.', '+25% radius, -15% cooldown.'],
    stats(lv, evo) { const s = { dmg: 38, cd: 3.4, radius: 125, knock: 320, heal: 0 }; if (lv >= 2) s.dmg *= 1.3; if (lv >= 3) s.radius *= 1.2; if (lv >= 4) s.cd *= 0.8; if (lv >= 5) s.dmg *= 1.4; if (lv >= 6) { s.radius *= 1.25; s.cd *= 0.85; } if (evo) { s.dmg *= 1.5; s.heal = 4; s.radius *= 1.1; } return s; }
  },
  drain: {
    name: 'Blood Drain Aura', icon: '❂', color: '#ef4444', max: 6, pair: 'regen', evo: 'Crimson Abyss',
    desc: 'A red aura that leeches life from nearby foes and heals you.', evoDesc: 'A vast abyss that slows and devours enemies.',
    up: ['', '', '+20% radius.', '+40% damage.', '+20% radius.', '+40% damage, faster pulses.', '+25% radius, more healing.'],
    stats(lv, evo) { const s = { dmg: 6, tick: 0.5, radius: 72, heal: 0.25 + lv * 0.08, slow: false }; if (lv >= 2) s.radius *= 1.2; if (lv >= 3) s.dmg *= 1.4; if (lv >= 4) s.radius *= 1.2; if (lv >= 5) { s.dmg *= 1.4; s.tick = 0.4; } if (lv >= 6) { s.radius *= 1.25; s.heal += 0.2; } if (evo) { s.radius *= 1.4; s.dmg *= 1.7; s.slow = true; s.heal += 0.4; } return s; }
  },
  dagger: {
    name: 'Silver Daggers', icon: '†', color: '#e2e8f0', max: 6, pair: 'speed', evo: 'Thousand Edges',
    desc: 'Throws piercing silver daggers where you are heading.', evoDesc: 'An unending torrent of silver.',
    up: ['', '', '+1 dagger.', '+40% damage.', '+1 dagger, +1 pierce.', '-25% cooldown.', '+2 daggers.'],
    stats(lv, evo) { const s = { dmg: 15, cd: 0.55, count: 1, pierce: 1, speed: 740 }; if (lv >= 2) s.count++; if (lv >= 3) s.dmg *= 1.4; if (lv >= 4) { s.count++; s.pierce++; } if (lv >= 5) s.cd *= 0.75; if (lv >= 6) s.count += 2; if (evo) { s.cd *= 0.4; s.pierce += 3; s.dmg *= 1.2; } return s; }
  },
  water: {
    name: 'Holy Water', icon: '⚱', color: '#7dd3fc', max: 6, pair: 'magnet', evo: 'Sacred Deluge',
    desc: 'Hurls flasks that leave burning pools of holy water.', evoDesc: 'Huge pools that chase down the unholy.',
    up: ['', '', '+1 flask.', '+20% pool size, +30% damage.', '+1 flask, pools last longer.', '+40% damage.', '+1 flask, +20% pool size.'],
    stats(lv, evo) { const s = { dmg: 10, cd: 2.7, count: 1, radius: 48, dur: 2.6, tick: 0.33, chase: false }; if (lv >= 2) s.count++; if (lv >= 3) { s.radius *= 1.2; s.dmg *= 1.3; } if (lv >= 4) { s.count++; s.dur += 0.8; } if (lv >= 5) s.dmg *= 1.4; if (lv >= 6) { s.count++; s.radius *= 1.2; } if (evo) { s.radius *= 1.3; s.dmg *= 1.5; s.dur += 1.2; s.chase = true; } return s; }
  },
  bell: {
    name: 'Storm Bell', icon: 'ϟ', color: '#93c5fd', max: 6, pair: 'armor', evo: 'Wrath of Heaven',
    desc: 'A cursed bell calls lightning onto random foes.', evoDesc: 'Lightning that chains between the damned.',
    up: ['', '', '+1 strike.', '+40% damage.', '+1 strike, -15% cooldown.', '+1 strike, bigger blasts.', '+2 strikes, +40% damage.'],
    stats(lv, evo) { const s = { dmg: 34, cd: 2.4, count: 1, aoe: 34, chain: 0 }; if (lv >= 2) s.count++; if (lv >= 3) s.dmg *= 1.4; if (lv >= 4) { s.count++; s.cd *= 0.85; } if (lv >= 5) { s.count++; s.aoe *= 1.4; } if (lv >= 6) { s.count += 2; s.dmg *= 1.4; } if (evo) { s.chain = 3; s.count += 2; s.cd *= 0.8; } return s; }
  },
};

const PASSIVES = {
  might: { name: 'Dark Might', icon: '♠', desc: '+10% damage.', max: 5 },
  armor: { name: 'Iron Ward', icon: '⛨', desc: '-1 damage from every hit.', max: 5 },
  heart: { name: 'Vampiric Heart', icon: '♥', desc: '+20 max HP, heals 20.', max: 5 },
  regen: { name: 'Bloodstone', icon: '◆', desc: '+0.3 HP regenerated per second.', max: 5 },
  speed: { name: 'Boots of Haste', icon: '»', desc: '+8% movement speed.', max: 5 },
  magnet: { name: 'Soul Magnet', icon: '◎', desc: '+30% pickup radius.', max: 5 },
  tome: { name: 'Grimoire of Haste', icon: '⌛', desc: '-7% weapon cooldowns.', max: 5 },
  area: { name: 'Candelabrum', icon: '♆', desc: '+10% weapon area.', max: 5 },
  crown: { name: 'Crown of Thorns', icon: '♛', desc: '+8% experience gained.', max: 5 },
};

const META = [
  { id: 'might', name: 'Might', desc: '+5% damage per rank', max: 5, base: 80 },
  { id: 'vitality', name: 'Vitality', desc: '+10 max HP per rank', max: 5, base: 60 },
  { id: 'armor', name: 'Plate', desc: '+1 armor per rank', max: 3, base: 120 },
  { id: 'swift', name: 'Swiftness', desc: '+5% move speed per rank', max: 3, base: 80 },
  { id: 'cooldown', name: 'Haste', desc: '-3% cooldowns per rank', max: 3, base: 150 },
  { id: 'magnet', name: 'Attraction', desc: '+10% pickup radius per rank', max: 3, base: 50 },
  { id: 'growth', name: 'Growth', desc: '+5% experience per rank', max: 5, base: 90 },
  { id: 'greed', name: 'Greed', desc: '+10% gold per rank', max: 5, base: 70 },
  { id: 'reroll', name: 'Fate', desc: '+1 card reroll per hunt', max: 3, base: 120 },
  { id: 'revival', name: 'Revival', desc: 'Rise once per hunt at 50% HP', max: 1, base: 600 },
];
const metaCost = (m, lv) => Math.round(m.base * Math.pow(1.6, lv));

const ENEMIES = {
  skull: { hp: 10, spd: 64, r: 11, dmg: 6, xp: 1, color: '#e7e5e4' },
  bat: { hp: 6, spd: 118, r: 9, dmg: 4, xp: 1, color: '#a855f7' },
  ghoul: { hp: 38, spd: 46, r: 15, dmg: 9, xp: 3, color: '#84cc16' },
  wraith: { hp: 26, spd: 58, r: 12, dmg: 6, xp: 3, color: '#67e8f9' },
  noble: { hp: 70, spd: 72, r: 15, dmg: 12, xp: 5, color: '#ef4444' },
  wolf: { hp: 120, spd: 104, r: 17, dmg: 14, xp: 8, color: '#a8a29e' },
};
const BOSSES = [
  { id: 'lord', name: 'Vladislav, the Vampire Lord', hp: 1500, spd: 74, r: 34, dmg: 18, color: '#be123c', attacks: ['charge', 'ring', 'bats', 'charge', 'ring'] },
  { id: 'lich', name: 'Morwen, the Bone Lich', hp: 2900, spd: 56, r: 32, dmg: 16, color: '#a3e635', attacks: ['spiral', 'skullring', 'ring', 'spiral', 'bats'] },
  { id: 'count', name: 'Count Dracul, Lord of the Night', hp: 5400, spd: 82, r: 40, dmg: 24, color: '#dc2626', attacks: ['charge', 'spiral', 'bats', 'ring', 'charge', 'skullring'] },
];

// ================= THE SHADOW ORACLE (local, offline text generation) =================
const ORACLE = {
  intro: ['The blood moon rises. Ten minutes until dawn, slayer. Ten minutes is an eternity here.', 'The crypts are open. Every grave in this valley is emptying toward you.', 'I have watched a thousand hunters walk into this night. Show me something new.'],
  idle: ['The blood moon whispers of your impending doom...', 'Something ancient stirs beneath the graves.', 'Count the dead, slayer. They are counting you.', 'Bells toll in a chapel that burned three centuries ago.', 'The mist remembers every hunter who fell here.', 'Your shadow moves a heartbeat after you. Curious.', 'The ravens have stopped singing. They are waiting.', 'Even the moon bleeds tonight.', 'Keep moving. The swarm loves a hunter who stands still.'],
  strong: ['Even the shadows recoil from your {weapon}.', '{kills} souls returned to the dark. The crypt grows restless.', 'Level {level}... the night begins to fear you.', 'Your {weapon} sings a hymn the dead cannot bear.', 'They whisper your name in the catacombs now.'],
  low: ['Your blood runs thin... the swarm can smell it.', 'Death leans close and whispers your name.', 'Find a heart, slayer, or become one of them.', 'Your pulse falters. I can hear it from here.'],
  level: ['Power curdles in your veins.', 'The old gods grant you another breath.', 'Stronger... but the night grows with you.'],
  evo: ['{evo}! The old gods remember that name.', 'The relic awakens: {evo}. The dead will not forget this night.', '{evo}... I have not seen that power in a thousand years.'],
  bossDead: ['{boss} crumbles into ash. Something worse has noticed.', 'The {boss} falls! The night itself shudders.', 'Ashes and silence. {boss} is no more.'],
  dawnNear: ['The horizon pales... hold on, slayer!', 'I can taste the dawn. Do not fall now.'],
  events: {
    swarm: ['A black cloud of wings descends upon you!', 'The bats come, a thousand screaming mouths.'],
    ring: ['The dead encircle you. Break the ring!', 'They close in from every side...'],
    elite: ['A champion of the dead hunts you. It carries a relic.', 'Something larger wades through the horde. Kill it, and claim its treasure.'],
    moon: ['The BLOOD MOON swells! More of them, but richer souls.', 'The moon turns crimson. The horde doubles, and so does its reward.'],
  },
  taunts: {
    lord: ['Your blood will be my vintage, hunter!', 'I have drained kings. You are a mere sip.', 'Kneel, and I will make it quick.'],
    lich: ['Your bones will join my choir.', 'Death is not the end. I am proof of that.', 'I will raise you before your body is cold.'],
    count: ['I AM the night. You cannot outlast me.', 'Centuries of hunters... and you think YOU will be the last?', 'Dawn will not save you, child.'],
  },
};
const OMENS = [
  { id: 'fury', name: 'Omen of Fury', text: 'Your strikes burn hotter.', eff: '+50% damage', dur: 15 },
  { id: 'wind', name: 'Omen of the Wind', text: 'The night wind carries you.', eff: '+30% speed', dur: 15 },
  { id: 'greed', name: 'Omen of Greed', text: 'Souls flock to you like moths.', eff: 'huge pickup radius', dur: 15 },
  { id: 'blood', name: 'Omen of Blood', text: 'The moon feeds you.', eff: '+3 HP/s', dur: 15 },
  { id: 'hunt', name: 'Omen of the Hunt', text: 'I summon a horde... but its souls are doubled.', eff: '2x XP, more enemies', dur: 20 },
];
function fillTpl(s, o) { return s.replace(/\{(\w+)\}/g, (m, k) => o[k] !== undefined ? o[k] : m); }

// Forge: turns a typed wish into a blessing using keyword matching (no network needed).
const FORGE = [
  { stat: 'speed', words: ['swift', 'speed', 'wing', 'fast', 'wind', 'haste', 'run', 'quick', 'fly', 'feather', 'step', 'dash', 'raven', 'agile', 'mist'], names: ['Wings of the Night', "Mistwalker's Gait", "Raven's Swiftness"], eff: m => `+${pct(0.08 * m)} speed`, apply: (p, m) => p.bless.speed *= 1 + 0.08 * m },
  { stat: 'dmg', words: ['fire', 'flame', 'holy', 'power', 'might', 'strength', 'strong', 'rage', 'fury', 'burn', 'kill', 'destroy', 'smite', 'sword', 'wrath', 'death', 'pain', 'blade', 'sharp', 'hell'], names: ['Hellfire Covenant', 'Wrath of the Saints', "Executioner's Oath"], eff: m => `+${pct(0.08 * m)} damage`, apply: (p, m) => p.bless.dmg *= 1 + 0.08 * m },
  { stat: 'hp', words: ['life', 'heal', 'vital', 'heart', 'health', 'tough', 'iron', 'stone', 'shield', 'armor', 'immortal', 'endure', 'body', 'wall', 'protect'], names: ['Heart of the Gargoyle', 'Iron Sacrament', 'Unbroken Vow'], eff: m => `+${Math.round(16 * m)} max HP`, apply: (p, m) => { const v = Math.round(16 * m); p.maxHp += v; p.hp += v; } },
  { stat: 'magnet', words: ['soul', 'magnet', 'greed', 'gold', 'gem', 'pull', 'gather', 'treasure', 'wealth', 'rich', 'coin', 'collect'], names: ["Soul-Eater's Hunger", 'Covenant of Greed', 'Lodestone of Souls'], eff: m => `+${pct(0.2 * m)} pickup radius`, apply: (p, m) => p.bless.magnet *= 1 + 0.2 * m },
  { stat: 'cd', words: ['time', 'hour', 'rapid', 'storm', 'lightning', 'thunder', 'frenzy', 'chaos', 'arcane', 'magic', 'spell', 'faster', 'clock'], names: ['Clockwork Heresy', 'Storm-Touched Mind', 'Frenzied Litany'], eff: m => `-${pct(0.05 * m)} cooldowns`, apply: (p, m) => p.bless.cd *= 1 - 0.05 * m },
  { stat: 'area', words: ['moon', 'vast', 'giant', 'huge', 'big', 'light', 'nova', 'aura', 'ocean', 'sea', 'darkness', 'eclipse', 'wide', 'flood', 'shadow'], names: ['Eclipse Mantle', 'Reach of the Abyss', 'Moonlit Expanse'], eff: m => `+${pct(0.08 * m)} area`, apply: (p, m) => p.bless.area *= 1 + 0.08 * m },
  { stat: 'regen', words: ['blood', 'regen', 'ritual', 'vampire', 'vampiric', 'drain', 'leech', 'feast', 'undying', 'drink', 'fang', 'bite'], names: ['Rite of the Red Chalice', 'Undying Thirst', 'Blood Communion'], eff: m => `+${(0.4 * m).toFixed(1)} HP/s regen`, apply: (p, m) => p.bless.regen += 0.4 * m },
  { stat: 'xp', words: ['wisdom', 'learn', 'grow', 'knowledge', 'level', 'sage', 'mind', 'study', 'experience'], names: ["Lich's Insight", 'Forbidden Scripture', 'Whispering Codex'], eff: m => `+${pct(0.1 * m)} experience`, apply: (p, m) => p.bless.xp *= 1 + 0.1 * m },
];
