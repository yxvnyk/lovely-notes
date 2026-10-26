(() => {
  'use strict';

  /* ===== CONFIG — change these if your ZIP has a different name ===== */
  const CONFIG = {
    zipPath: 'downloads/love.zip',   // relative to index.html (never start with "/")
    fileName: 'love.zip'             // name the browser saves it as
  };
  const THANKS = 'a little piece of my heart, just for you 💌';
  const SECRET = '«Для моей Любви»';
  /* ================================================================== */

  const $ = (s) => document.querySelector(s);
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = (arr) => arr[(Math.random() * arr.length) | 0];
  const PINKS = ['#FF9DB5', '#FF7FA0', '#F7B6C8', '#FFC2D4', '#FF5C86', '#F29AB2'];

  const cta = $('#cta'), fx = $('#fx'), thanks = $('#thanks');
  const egg = $('#egg'), eggMsg = $('#eggMsg');

  /* ---------- download link: resolve against document.baseURI ---------- */
  const zipUrl = new URL(CONFIG.zipPath, document.baseURI).href;
  cta.href = zipUrl;
  cta.setAttribute('download', CONFIG.fileName);

  /* ---------- heart helper (Web Animations, auto-cleanup) ---------- */
  const MAX_LIVE = 110;
  let live = 0;
  const tf = (x, y, r, s) => `translate(${x}px,${y}px) rotate(${r}deg) scale(${s})`;
  function heart(size, color, keyframes, duration, easing) {
    if (live >= MAX_LIVE) return;
    const el = document.createElement('span');
    el.className = 'h';
    el.style.width = el.style.height = size + 'px';
    el.style.margin = -size / 2 + 'px 0 0 ' + -size / 2 + 'px';
    el.style.setProperty('--c', color);
    fx.appendChild(el);
    live++;
    const a = el.animate(keyframes, { duration, easing: easing || 'ease-out', fill: 'forwards' });
    const done = () => { el.remove(); live--; };
    a.onfinish = done; a.oncancel = done;
  }

  /* ---------- cursor / finger trail ---------- */
  let lx = -999, ly = -999, lt = 0;
  function trail(x, y) {
    if (reduce.matches) return;
    const now = performance.now();
    if (now - lt < 30 || Math.hypot(x - lx, y - ly) < 22) return;
    lt = now; lx = x; ly = y;
    const r = rand(-35, 35), px = x + rand(-5, 5), py = y + rand(-5, 5);
    heart(rand(11, 20), pick(PINKS), [
      { transform: tf(px, py, r, 0.6), opacity: 0.95 },
      { transform: tf(px + rand(-16, 16), py + rand(14, 36), r + rand(-45, 45), 0.35), opacity: 0 }
    ], rand(550, 850));
  }
  window.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'touch') trail(e.clientX, e.clientY);
  }, { passive: true });
  const touchTrail = (e) => { const t = e.touches[0]; if (t) trail(t.clientX, t.clientY); };
  window.addEventListener('touchstart', touchTrail, { passive: true });
  window.addEventListener('touchmove', touchTrail, { passive: true });


  /* ---------- hearts on every click / tap (one pointerdown = one burst) ---------- */
  let lastPop = 0;
  window.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (e.target.closest && e.target.closest('.game')) return;   // the mini-game has its own feedback
    const now = performance.now();
    if (now - lastPop < 40) return;
    lastPop = now;
    const x = e.clientX, y = e.clientY;
    const n = reduce.matches ? 4 : (innerWidth < 600 ? 8 : 12);
    for (let i = 0; i < n; i++) {
      const a = rand(0, Math.PI * 2), d = rand(40, 120), r = rand(-50, 50);
      const ex = x + Math.cos(a) * d, ey = y + Math.sin(a) * d - rand(10, 50);
      heart(rand(16, 32), pick(PINKS), reduce.matches
        ? [{ transform: tf(x, y, 0, 1), opacity: 0.9 }, { transform: tf(x, y, 0, 1), opacity: 0 }]
        : [{ transform: tf(x, y, 0, 0.3), opacity: 0 },
           { transform: tf(x + (ex - x) * 0.4, y + (ey - y) * 0.4, r * 0.4, 1), opacity: 1, offset: 0.25 },
           { transform: tf(ex, ey + rand(10, 40), r, 0.7), opacity: 0 }],
        rand(800, 1300), 'cubic-bezier(.2,.8,.3,1)');
    }
  }, { passive: true });

  /* ---------- occasional floating hearts ---------- */
  setInterval(() => {
    if (reduce.matches || document.hidden) return;
    const w = innerWidth, h = innerHeight, x = rand(0.05, 0.95) * w, r = rand(-20, 20);
    const rise = rand(0.4, 0.7) * h, sway = rand(-30, 30);
    heart(rand(10, 20), pick(PINKS), [
      { transform: tf(x, h + 20, r, 0.8), opacity: 0 },
      { transform: tf(x + sway, h - rise * 0.2, r, 1), opacity: 0.7, offset: 0.2 },
      { transform: tf(x - sway, h - rise, -r, 1), opacity: 0 }
    ], rand(6500, 9000), 'ease-in-out');
  }, 2600);

  /* ---------- heart explosion ---------- */
  function burst(cx, cy, count) {
    const reach = Math.min(innerWidth, innerHeight) * 0.55;
    for (let i = 0; i < count; i++) {
      const big = Math.random() < 0.35, a = rand(0, Math.PI * 2);
      const d = rand(70, reach) * (big ? 1 : 0.8) + 40;
      const dx = Math.cos(a) * d, dy = Math.sin(a) * d - rand(10, 50), rot = rand(-120, 120);
      const peak = rand(0.65, 1);
      heart(big ? rand(20, 32) : rand(8, 14), pick(PINKS), [
        { transform: tf(cx, cy, 0, 0.2), opacity: 0 },
        { transform: tf(cx + dx * 0.15, cy + dy * 0.15, rot * 0.1, 0.6), opacity: peak, offset: 0.1 },
        { transform: tf(cx + dx, cy + dy, rot * 0.6, 1), opacity: peak, offset: 0.55 },
        { transform: tf(cx + dx * 1.1, cy + dy + rand(50, 100), rot, 0.8), opacity: 0 }
      ], rand(1100, 1700), 'cubic-bezier(.17,.89,.32,1.28)');
    }
  }

  /* ---------- download click ---------- */
  let locked = false;
  cta.addEventListener('click', (e) => {
    if (locked) { e.preventDefault(); return; }       // blocks accidental double downloads
    locked = true; setTimeout(() => { locked = false; }, 1500);
    // The native <a download> navigation starts immediately; effects run independently.
    const r = cta.getBoundingClientRect();
    if (!reduce.matches) burst(r.left + r.width / 2, r.top + r.height / 2, innerWidth < 600 ? 46 : 68);
    thanks.textContent = THANKS;
    requestAnimationFrame(() => thanks.classList.add('in'));
  });
  cta.addEventListener('keydown', (e) => {            // links only react to Enter; add Space
    if (e.key === ' ') { e.preventDefault(); cta.click(); }
  });

  /* ---------- hidden heart ---------- */
  let eggLock = false;
  egg.addEventListener('click', () => {
    if (eggLock) return;
    eggLock = true; setTimeout(() => { eggLock = false; }, 1200);
    eggMsg.textContent = SECRET;
    requestAnimationFrame(() => eggMsg.classList.add('in'));
    if (!reduce.matches) {
      const r = egg.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      for (let i = 0; i < 9; i++) {
        const dx = rand(-50, 50), dy = -rand(30, 90);
        heart(rand(7, 12), pick(PINKS), [
          { transform: tf(cx, cy, 0, 0.4), opacity: 0 },
          { transform: tf(cx + dx * 0.5, cy + dy * 0.5, rand(-30, 30), 1), opacity: 0.9, offset: 0.3 },
          { transform: tf(cx + dx, cy + dy, rand(-60, 60), 0.8), opacity: 0 }
        ], rand(900, 1400));
      }
    }
  });

  /* ---------- marquee ---------- */
  const LANGS = window.LOVE_LANGS || [];
  const ROWS = [
    { f: 2.9, w: 800, ls: '-.01em', v: 34, o: 1 },   { f: 1.5, w: 400, ls: '.12em', v: 52, o: .6 },
    { f: 2.2, w: 600, ls: '0',      v: 26, o: .85 }, { f: 1.2, w: 500, ls: '.2em',  v: 60, o: .5 },
    { f: 3.3, w: 300, ls: '-.02em', v: 20, o: .7 },  { f: 1.7, w: 700, ls: '.04em', v: 44, o: .8 },
    { f: 1.1, w: 400, ls: '.18em',  v: 56, o: .45 }, { f: 2.5, w: 500, ls: '0',     v: 30, o: .9 },
    { f: 1.4, w: 600, ls: '.08em',  v: 40, o: .6 }
  ];
  let builtW = 0;
  function items(list) {
    const frag = document.createDocumentFragment();
    list.forEach((l) => {
      const s = document.createElement('span');
      s.className = 'it'; s.lang = l.code; s.textContent = l.text;
      if (l.rtl) s.dir = 'rtl';
      frag.appendChild(s);
    });
    return frag;
  }
  function buildMarquee() {
    const host = $('#marquee');
    host.textContent = '';
    builtW = innerWidth;
    ROWS.forEach((cfg, r) => {
      const list = LANGS.filter((_, i) => i % ROWS.length === r);   // every language exactly once per cycle
      const row = document.createElement('div'), track = document.createElement('div'), g = document.createElement('div');
      row.className = 'row'; track.className = 'track'; g.className = 'group';
      row.style.cssText = `font-size:calc(var(--u)*${cfg.f});font-weight:${cfg.w};letter-spacing:${cfg.ls};opacity:${cfg.o};--gap:${(1.4 + (r % 3) * 0.6).toFixed(1)}em`;
      g.appendChild(items(list));
      track.appendChild(g); row.appendChild(track); host.appendChild(row);
      // make one group at least as wide as the viewport, so two copies can never leave a gap
      for (let n = 0; n < 8 && g.offsetWidth < innerWidth + 40; n++) g.appendChild(items(list));
      const copy = g.cloneNode(true);
      track.appendChild(copy);
      const dur = Math.max(20, g.offsetWidth / cfg.v);
      track.style.animationDuration = dur.toFixed(1) + 's';
      track.style.animationDelay = (-dur * ((r * 0.37) % 1)).toFixed(1) + 's';
    });
  }
  buildMarquee();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(buildMarquee);
  let rt;
  addEventListener('resize', () => {
    clearTimeout(rt);
    rt = setTimeout(() => { if (Math.abs(innerWidth - builtW) > 40) buildMarquee(); }, 250);
  });

  /* ---------- opening sequence (~3 s) ---------- */
  const stages = [['#greet', 150], ['#marquee', 900], ['#warn', 1700], ['#cta', 2300], ['#play', 2300]];
  stages.forEach(([sel, t]) => {
    const el = $(sel);
    if (reduce.matches) el.classList.add('in'); else setTimeout(() => el.classList.add('in'), t);
  });
})();
