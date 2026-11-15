'use strict';
const $ = s => document.querySelector(s);
const store = {
  get(k, d) { try { const v = JSON.parse(localStorage.getItem(k)); return v ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }
};
let solves = store.get('cf.solves', []);
let cfg = Object.assign({ inspect: false, hide: false, hold: 300, accent: '#8b7bff' }, store.get('cf.cfg', {}));
const save = () => { store.set('cf.solves', solves); store.set('cf.cfg', cfg); };

/* ---------- Format & statistik ---------- */
const p2 = n => String(n).padStart(2, '0');
function fmt(ms) {
  if (ms === Infinity) return 'DNF';
  const cs = Math.floor(ms / 10), m = Math.floor(cs / 6000), s = Math.floor(cs % 6000 / 100), c = cs % 100;
  return m ? `${m}:${p2(s)}.${p2(c)}` : `${s}.${p2(c)}`;
}
const val = s => s.p === 'DNF' ? Infinity : s.t + (s.p === 2 ? 2000 : 0);
const fmtS = s => s.p === 'DNF' ? 'DNF' : fmt(val(s)) + (s.p === 2 ? '+' : '');
const fmtV = x => x == null ? '—' : fmt(x);
function avg(n) {
  if (solves.length < n) return null;
  const v = solves.slice(-n).map(val).sort((a, b) => a - b);
  if (v.filter(x => !isFinite(x)).length > 1) return Infinity;
  const m = v.slice(1, -1);
  return m.reduce((a, b) => a + b, 0) / m.length;
}

/* ---------- Scramble acak (20 langkah, tanpa langkah sia-sia) ---------- */
const FACES = ['U', 'D', 'R', 'L', 'F', 'B'], AX = { U: 0, D: 0, R: 1, L: 1, F: 2, B: 2 };
function genScramble(n = 20) {
  const m = [];
  while (m.length < n) {
    const f = FACES[Math.random() * 6 | 0];
    const l = m.length ? m[m.length - 1][0] : '', l2 = m.length > 1 ? m[m.length - 2][0] : '';
    if (f === l) continue;
    if (l && l2 && AX[f] === AX[l] && AX[l2] === AX[l]) continue;
    m.push(f + ['', "'", '2'][Math.random() * 3 | 0]);
  }
  return m.join(' ');
}

/* ---------- Simulasi kubus untuk pratinjau ---------- */
const NRM = { U: [0, 1, 0], D: [0, -1, 0], R: [1, 0, 0], L: [-1, 0, 0], F: [0, 0, 1], B: [0, 0, -1] };
const COL = { U: '#f5f5f0', D: '#ffd500', F: '#00b84f', B: '#2a62ff', R: '#ff3b1f', L: '#ff8a00' };
const VIEW = { // [kanan, bawah, offset kolom, offset baris]
  U: [[1, 0, 0], [0, 0, 1], 3, 0], L: [[0, 0, 1], [0, -1, 0], 0, 3], F: [[1, 0, 0], [0, -1, 0], 3, 3],
  R: [[0, 0, -1], [0, -1, 0], 6, 3], B: [[-1, 0, 0], [0, -1, 0], 9, 3], D: [[1, 0, 0], [0, 0, -1], 3, 6]
};
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const rot = (v, k) => { const c = cross(k, v), d = dot(k, v); return [-c[0] + k[0] * d, -c[1] + k[1] * d, -c[2] + k[2] * d]; };
function renderNet(alg) {
  const st = [];
  for (const f in NRM) for (let x = -1; x <= 1; x++) for (let y = -1; y <= 1; y++) for (let z = -1; z <= 1; z++) {
    const p = [x, y, z]; if (dot(p, NRM[f]) === 1) st.push({ p, n: NRM[f], f });
  }
  for (const mv of alg.split(' ')) {
    const k = NRM[mv[0]], times = mv[1] === "'" ? 3 : mv[1] === '2' ? 2 : 1;
    for (const s of st) if (dot(s.p, k) === 1) for (let i = 0; i < times; i++) { s.p = rot(s.p, k); s.n = rot(s.n, k); }
  }
  let out = '';
  for (const s of st) {
    const face = FACES.find(f => dot(NRM[f], s.n) === 1), [r, d, ox, oy] = VIEW[face];
    out += `<rect x="${(ox + dot(s.p, r) + 1) * 20 + 1}" y="${(oy + dot(s.p, d) + 1) * 20 + 1}" width="18" height="18" rx="4" fill="${COL[s.f]}"/>`;
  }
  $('#net').innerHTML = `<svg viewBox="0 0 240 180" aria-label="Pratinjau scramble">${out}</svg>`;
}

let scramble = '';
function newScramble() {
  scramble = genScramble();
  const el = $('#scramble');
  el.textContent = scramble; el.classList.remove('flip'); void el.offsetWidth; el.classList.add('flip');
  renderNet(scramble);
}

/* ---------- Timer (state machine) ---------- */
const pad = $('#pad'), T = $('#time'), H = $('#hint');
let phase = 'idle', hold = null, holdTm = 0, t0 = 0, i0 = 0, raf = 0, lockUntil = 0;
const HINTS = {
  idle: 'Tahan spasi atau sentuh area ini, lepas untuk mulai',
  hold: 'Tahan terus sampai hijau…', ready: 'Lepas sekarang!',
  insp: 'Inspeksi: tahan lalu lepas untuk mulai (Esc untuk batal)', run: 'Tekan tombol apa saja atau sentuh layar untuk berhenti'
};
function sync() {
  const s = hold === 'ready' ? 'ready' : hold === 'wait' ? 'hold' : phase === 'run' ? 'run' : phase === 'inspect' ? 'insp' : 'idle';
  pad.dataset.s = s; H.textContent = HINTS[s];
  document.body.classList.toggle('run', phase === 'run');
}
function tick() {
  const n = performance.now();
  if (phase === 'run') T.textContent = cfg.hide ? '· · ·' : fmt(n - t0);
  else if (phase === 'inspect') { const e = (n - i0) / 1000; T.textContent = e < 15 ? String(Math.ceil(15 - e)) : e < 17 ? '+2' : 'DNF'; }
  raf = requestAnimationFrame(tick);
}
function press() {
  if (phase === 'run') return stop();
  if (hold || performance.now() < lockUntil) return;
  hold = 'wait';
  clearTimeout(holdTm);
  if (cfg.hold === 0) hold = 'ready';
  else holdTm = setTimeout(() => { if (hold === 'wait') { hold = 'ready'; sync(); if (navigator.vibrate) navigator.vibrate(12); } }, cfg.hold);
  sync();
}
function release() {
  if (!hold) return;
  const h = hold; hold = null; clearTimeout(holdTm);
  if (phase === 'idle' && cfg.inspect) { startInspect(); return; }
  if (h === 'ready') startRun(); else sync();
}
function cancelHold() { hold = null; clearTimeout(holdTm); sync(); }
function startInspect() {
  phase = 'inspect'; i0 = performance.now(); cancelAnimationFrame(raf); tick(); sync();
}
function startRun() {
  const now = performance.now();
  inspPen = 0;
  if (phase === 'inspect') { const e = (now - i0) / 1000; inspPen = e > 17 ? 'DNF' : e > 15 ? 2 : 0; }
  phase = 'run'; t0 = now; cancelAnimationFrame(raf); tick(); sync();
}
let inspPen = 0;
function stop() {
  const el = performance.now() - t0;
  cancelAnimationFrame(raf); phase = 'idle'; hold = null; clearTimeout(holdTm);
  lockUntil = performance.now() + 350;
  const s = { id: Date.now() + Math.random(), t: Math.floor(el / 10) * 10, p: inspPen, s: scramble, d: Date.now() };
  solves.push(s); save(); sync(); showLast(true); render(); newScramble();
  if (navigator.vibrate) navigator.vibrate(20);
}
function showLast(pop) {
  const l = solves[solves.length - 1];
  T.textContent = l ? fmtS(l) : '0.00';
  if (pop) { T.classList.remove('pop'); void T.offsetWidth; T.classList.add('pop'); }
}
function cancelInspect() { if (phase === 'inspect') { phase = 'idle'; cancelAnimationFrame(raf); showLast(); sync(); } }

/* ---------- Input: keyboard & pointer ---------- */
const typing = e => /^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName) || $('#dlg').open;
document.addEventListener('keydown', e => {
  if (typing(e)) return;
  if (e.code === 'Space') { e.preventDefault(); if (!e.repeat) press(); return; }
  if (e.key === 'Escape') return cancelInspect();
  if (phase === 'run' && !e.repeat && !['Shift', 'Control', 'Alt', 'Meta'].includes(e.key)) { e.preventDefault(); stop(); }
});
document.addEventListener('keyup', e => { if (e.code === 'Space' && !typing(e)) { e.preventDefault(); release(); } });
pad.addEventListener('pointerdown', e => { e.preventDefault(); try { pad.setPointerCapture(e.pointerId); } catch {} press(); });
pad.addEventListener('pointerup', e => { e.preventDefault(); release(); });
pad.addEventListener('pointercancel', cancelHold);
pad.addEventListener('contextmenu', e => e.preventDefault());
window.addEventListener('blur', () => { if (hold) cancelHold(); });
document.addEventListener('visibilitychange', () => { if (document.hidden && hold) cancelHold(); });

/* ---------- Render statistik, riwayat, grafik ---------- */
function render() {
  const v = solves.map(val), ok = v.filter(isFinite);
  const best = ok.length ? Math.min(...ok) : null, mean = ok.length ? ok.reduce((a, b) => a + b, 0) / ok.length : null;
  const chips = [['Terbaik', best], ['Ao5', avg(5)], ['Ao12', avg(12)], ['Rata-rata', mean]];
  $('#stats').innerHTML = chips.map(([k, x]) => `<div class="stat"><small>${k}</small><b class="mono">${fmtV(x)}</b></div>`).join('')
    + `<div class="stat"><small>Total solve</small><b class="mono">${solves.length}</b></div>`;
  const bestSolve = best == null ? null : solves.find(s => val(s) === best);
  const list = $('#list');
  if (!solves.length) { list.innerHTML = '<li class="empty">Belum ada solve. Tahan spasi atau sentuh area timer untuk mulai.</li>'; }
  else list.innerHTML = solves.map((s, i) => [s, i]).reverse().slice(0, 100).map(([s, i]) =>
    `<li class="${bestSolve === s ? 'pb' : ''}"><i>${i + 1}</i><b>${fmtS(s)}</b><span>
    <button data-a="p2" data-id="${s.id}" class="${s.p === 2 ? 'on' : ''}">+2</button>
    <button data-a="dnf" data-id="${s.id}" class="${s.p === 'DNF' ? 'on' : ''}">DNF</button>
    <button data-a="del" data-id="${s.id}" aria-label="Hapus">✕</button></span></li>`).join('');
  chart();
}
function chart() {
  const el = $('#chart'), v = solves.slice(-30).map(val).filter(isFinite);
  if (v.length < 2) { el.innerHTML = ''; return; }
  const mn = Math.min(...v), r = (Math.max(...v) - mn) || 1;
  const d = v.map((x, i) => `${i ? 'L' : 'M'}${(i / (v.length - 1) * 300).toFixed(1)} ${(10 + (x - mn) / r * 60).toFixed(1)}`).join('');
  el.innerHTML = `<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--ac)" stop-opacity=".35"/><stop offset="1" stop-color="var(--ac)" stop-opacity="0"/></linearGradient></defs>
  <path d="${d}L300 80L0 80Z" fill="url(#g)"/><path d="${d}" fill="none" stroke="var(--ac)" stroke-width="2" vector-effect="non-scaling-stroke" stroke-linejoin="round"/>`;
}
$('#list').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  const i = solves.findIndex(s => String(s.id) === b.dataset.id); if (i < 0) return;
  const s = solves[i], a = b.dataset.a;
  if (a === 'del') solves.splice(i, 1);
  else if (a === 'p2') s.p = s.p === 2 ? 0 : 2;
  else s.p = s.p === 'DNF' ? 0 : 'DNF';
  save(); render(); showLast();
});

/* ---------- Pengaturan, ekspor/impor ---------- */
const dlg = $('#dlg'), ACC = ['#8b7bff', '#22d3ee', '#34f5a0', '#ffb84d', '#ff6b9d'];
function toast(t) { const el = $('#toast'); el.textContent = t; el.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove('show'), 2200); }
function applyCfg() {
  document.documentElement.style.setProperty('--ac', cfg.accent);
  $('#oInsp').checked = cfg.inspect; $('#oHide').checked = cfg.hide; $('#oHold').value = String(cfg.hold);
  $('#sw').innerHTML = ACC.map(c => `<button style="background:${c}" data-c="${c}" class="${c === cfg.accent ? 'on' : ''}" aria-label="Warna ${c}"></button>`).join('');
}
$('#bSet').onclick = () => dlg.showModal();
dlg.addEventListener('click', e => { if (e.target === dlg || e.target.closest('[data-close]')) dlg.close(); });
$('#oInsp').onchange = e => { cfg.inspect = e.target.checked; save(); };
$('#oHide').onchange = e => { cfg.hide = e.target.checked; save(); };
$('#oHold').onchange = e => { cfg.hold = +e.target.value; save(); };
$('#sw').onclick = e => { const b = e.target.closest('button'); if (b) { cfg.accent = b.dataset.c; save(); applyCfg(); } };
$('#bNew').onclick = e => { newScramble(); e.currentTarget.blur(); };
$('#bExp').onclick = () => {
  const blob = new Blob([JSON.stringify({ app: 'cubeflow', solves }, null, 1)], { type: 'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'cubeflow-progress.json'; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000); toast('Data diekspor');
};
$('#bImp').onclick = () => $('#file').click();
$('#file').onchange = async e => {
  const f = e.target.files[0]; if (!f) return;
  try {
    const d = JSON.parse(await f.text());
    const arr = (Array.isArray(d) ? d : d.solves).filter(s => typeof s.t === 'number').map(s => ({ id: s.id ?? Date.now() + Math.random(), t: s.t, p: s.p === 'DNF' ? 'DNF' : s.p === 2 ? 2 : 0, s: s.s || '', d: s.d || Date.now() }));
    solves = solves.concat(arr); save(); render(); showLast(); toast(`${arr.length} solve diimpor`);
  } catch { toast('File tidak valid. Gunakan file hasil ekspor CubeFlow.'); }
  e.target.value = '';
};
$('#bClr').onclick = () => { if (confirm('Hapus semua solve? Tindakan ini tidak bisa dibatalkan.')) { solves = []; save(); render(); showLast(); toast('Semua solve dihapus'); } };

/* Efek riak pada semua tombol */
document.addEventListener('pointerdown', e => {
  const b = e.target.closest('.btn'); if (!b) return;
  const r = b.getBoundingClientRect(), sz = Math.max(r.width, r.height) * 2, sp = document.createElement('span');
  sp.className = 'rip'; sp.style.cssText = `width:${sz}px;height:${sz}px;left:${e.clientX - r.left - sz / 2}px;top:${e.clientY - r.top - sz / 2}px`;
  b.appendChild(sp); sp.addEventListener('animationend', () => sp.remove());
});
document.addEventListener('click', e => { const b = e.target.closest('.btn'); if (b && b.id !== 'bSet') setTimeout(() => b.blur(), 0); });

/* ---------- Mulai ---------- */
applyCfg(); newScramble(); render(); showLast(); sync();
