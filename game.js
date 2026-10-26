/* Love Runner — isolated mini-game. Talks to the page only through DOM ids (#play, #cta, #game, .stage).
   Download path lives in script.js (CONFIG.zipPath); this file only reveals #cta after victory. */
(() => {
  'use strict';
  const root = document.getElementById('game'), playBtn = document.getElementById('play'),
        dlBtn = document.getElementById('cta'), stage = document.querySelector('.stage');
  if (!root || !playBtn || !dlBtn || !stage) return;

  /* ================= TUNABLE PARAMETERS ================= */
  const CFG = {
    duration: 45,            // seconds of successful play (finish distance is derived from this)
    speedStart: 300, speedEnd: 600,       // world units / second (before music modulation; portrait phones use portraitSpeed×)
    portraitSpeed: 0.8,
    gravity: 2600, jumpV: 860,            // peak ≈ 142 units, air time ≈ 0.66 s
    enterMs: 1000,                        // entrance animation length
    // obstacle planning (all distances are centre-to-centre, in world units)
    spacingStart: 0.7, spacingEnd: 0.6,   // min spacing = (speed+30)*factor + spacingExtra  (lower = denser)
    spacingExtra: 60,
    firstObstacleSec: 2.2, endClearSec: 1.8,     // quiet lead-in / lead-out
    densityStart: 0.9, densityEnd: 1.0,         // 0..1 chance scale of using a candidate beat
    breakdownI: 0.5, breakdownDensity: 0.45,      // in quiet breakdowns obstacles thin out
    offbeatChance: 0.2, offbeatI: 0.6,           // eighth-note offsets, only in intense parts
    pairFrom: 0.22, pairChance: 0.5, pairGap: 18, pairMaxHitW: 38,     // double obstacles (compact photos only)
    tripleFrom: 0.7, tripleChance: 0.3,                                // triple clusters, only in the finale
    // the drop: the song kicks in at music second 10.0 → faster, denser, a beat hit every beat
    drop: { at: 10.02, speedBoost: 0.14, rampSec: 1.5, grid: null /* null = detected beats (~0.4 s); set e.g. 0.5 for a fixed grid */ },
    doubleJumpV: 800, doubleMinY: 28,      // 2nd press in the air → higher jump (ignored when about to land: then it buffers a normal jump)
    fly: { fromSec: 12, chance: 0.22, lift: 62, gapBefore: 1.3, gapAfter: 0.75 },   // flying photos: need a double jump
    splash: { every: 0.5 },                // soft colour splash + particles every 0.5 s from the drop on (0 = off)
    secretWord: 'суслики',                 // typed under the Download button → the ZIP; anything else → a random image
    flashAt: [8.0, 9.0, 10.02],            // soft flashes in the build-up and on the drop (music seconds)
    target: 100,
    hearts: { speedStart: 70, perPoint: 1.4, speedMax: 210 },
    comboWindow: 1.5,
    comboSteps: [[10, 4], [6, 3], [3, 2]],
    music: {
      src: 'assets/music.mp3',            // soundtrack (relative path)
      map: 'assets/beatmap.json',         // pre-computed beat / intensity map for that file
      runAt: 1.0,                         // music second at which run time t = 0 (== entrance length)
      latency: 0.05,                      // seconds of assumed audio output latency
      volume: 0.6
    }
  };
  // Obstacles = your five photos. h = display height in world units; ratio = width/height (re-read from the file when it loads).
  const PHOTOS = [
    { src: 'assets/obstacles/photo1.png', h: 70, ratio: 0.688, fly: 118 },
    { src: 'assets/obstacles/photo2.png', h: 50, ratio: 1.376 },
    { src: 'assets/obstacles/photo3.png', h: 74, ratio: 0.594, fly: 124 },
    { src: 'assets/obstacles/photo4.png', h: 60, ratio: 1.115 },
    { src: 'assets/obstacles/photo5.png', h: 64, ratio: 1.0, fly: 112 }
  ];
  const HIT = { x: 0.14, top: 0.1 };      // hit-box inset on the visible photo (fraction of its size)
  const HEART_COLORS = ['#FF334F', '#FF5C86', '#FF7FA0', '#E8174A', '#F2698D'];
  /* ====================================================== */

  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const $ = (s) => root.querySelector(s);
  const world = $('.g-world'), heroEl = $('.g-hero'), heroImg = $('.g-hero img'), groundEl = $('.g-ground'),
        groundIn = $('.g-ground-in'), finishEl = $('.g-finish'), flashEl = $('.g-flash'), progEl = $('.g-progress i'),
        scoreEl = $('.g-score'), comboEl = $('.g-combo'), hintEl = $('.g-hint'), overEl = $('.g-over'),
        overText = $('.g-over-text'), overImg = $('.g-over-img'), againBtn = $('.g-again'), winEl = $('.g-win'), muteBtn = $('.g-mute');
  const rand = (a, b) => a + Math.random() * (b - a), pick = (a) => a[(Math.random() * a.length) | 0];
  const lerp = (a, b, t) => a + (b - a) * t, mod = (n, m) => ((n % m) + m) % m, clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const smooth = (x) => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };
  const M = CFG.music, D = CFG.duration, FLY = CFG.fly;
  const url = (p) => new URL(p, document.baseURI).href;

  // ---- layout (logical coordinate system; world is CSS-scaled to the container) ----
  let spdK = 1, LW = 800, LH = 450, GY = 378, heroH = 96, heroW = 55, heroX = 112, hs = 84, heartCount = 6, scale = 1, ratio = 148 / 256;
  const HILL_W = 400;
  function layout() {
    const portrait = innerWidth / innerHeight < 1;
    spdK = portrait ? CFG.portraitSpeed : 1;
    LW = portrait ? 400 : 800; LH = portrait ? 460 : 450; GY = LH - (portrait ? 84 : 72);
    heroH = portrait ? 88 : 96; heroW = heroH * ratio; heroX = Math.round(LW * (portrait ? 0.17 : 0.14));
    hs = portrait ? 76 : 84; heartCount = portrait ? 5 : 6;
    world.style.width = LW + 'px'; world.style.height = LH + 'px';
    root.style.setProperty('--ar', (LW / LH).toFixed(4));
    heroEl.style.width = heroW + 'px'; heroEl.style.height = heroH + 'px';
    groundEl.style.cssText = `top:${GY}px;height:${LH - GY}px;width:${LW}px`;
    groundIn.style.cssText = `top:${GY}px;width:${LW + 160}px`;
    finishEl.style.cssText = `top:${GY - 130}px;height:130px`;
    L.sky.style.cssText = `width:${LW}px;height:${GY + 6}px`;
    L.splash.style.cssText = `width:${LW}px;height:${GY + 6}px`;
    L.pulse.style.cssText = `width:${LW}px;height:${GY + 6}px`;
    const rs = Math.round(Math.hypot(LW, LH) * 1.5);
    L.rays.style.cssText = `width:${rs}px;height:${rs}px;left:${LW / 2 - rs / 2}px;top:${GY * 0.55 - rs / 2}px`;
    L.hills[0].style.cssText = `width:${LW + HILL_W}px;height:120px;top:${GY - 114}px`;
    L.hills[1].style.cssText = `width:${LW + HILL_W}px;height:84px;top:${GY - 78}px`;
    fit();
  }
  function fit() { if (root.clientWidth) { scale = root.clientWidth / LW; world.style.transform = `scale(${scale})`; } }
  heroImg.addEventListener('load', () => { if (heroImg.naturalWidth) { ratio = heroImg.naturalWidth / heroImg.naturalHeight; heroW = heroH * ratio; heroEl.style.width = heroW + 'px'; } });
  if (heroImg.complete && heroImg.naturalWidth) ratio = heroImg.naturalWidth / heroImg.naturalHeight;
  if (window.ResizeObserver) new ResizeObserver(fit).observe(root);
  addEventListener('orientationchange', () => setTimeout(fit, 150));
  addEventListener('resize', fit);

  // ---- scenery layers (created once; inserted behind ground/hero/obstacles) ----
  const mk = (cls, tag) => { const e = document.createElement(tag || 'div'); e.className = cls; world.insertBefore(e, groundEl); return e; };
  const L = { sky: mk('g-sky2'), rays: mk('g-rays'), splash: mk('g-splash'), hills: [mk('g-hills g-h1'), mk('g-hills g-h2')], pulse: mk('g-pulse'), shapes: [] };
  const CLOUDS = [[.1, 34, 1, .15], [.4, 96, .7, .1], [.7, 20, 1.2, .2], [.92, 80, .8, .12]].map(([x, y, s, p]) => {
    const el = mk('g-cloud'); return { el, x, s, p };
  });
  for (let i = 0; i < 8; i++) {
    const el = mk('g-shape' + (i % 3 === 0 ? ' tri' : ''));
    const sz = 12 + (i * 11) % 22;
    el.style.cssText = `width:${sz}px;height:${sz}px;${i % 2 ? 'background:#FF334F' : ''}`;
    L.shapes.push({ el, x: (i * 0.137 + 0.05) % 1, y: 30 + ((i * 53) % 150), p: 0.28 + (i % 4) * 0.08, th: 0.3 + i * 0.06, spin: i % 2 ? 0.2 : -0.16 });
  }
  for (let i = 0; i < 7; i++) {
    const f = mk('g-fh');
    f.style.cssText = `left:${(8 + i * 13) % 96}%;--s:${(12 + (i * 7) % 14)}px;animation-delay:${-i * 1.7}s;animation-duration:${7 + (i % 3) * 2}s`;
  }

  // ---- photos (the five obstacles) ----
  const photos = PHOTOS.map((p) => {
    const o = Object.assign({ bad: false }, p), im = new Image();
    im.onload = () => { if (im.naturalWidth) o.ratio = im.naturalWidth / im.naturalHeight; };
    im.onerror = () => { o.bad = true; console.error('Obstacle photo failed to load: ' + p.src); };
    im.src = url(p.src); o.url = im.src; return o;
  });
  const photoPool = () => photos.filter((p) => !p.bad);
  let bag = [], lastPhoto = -1;
  function nextPhoto(filter) {            // shuffle-bag: all five photos rotate, no immediate repeat
    const pool = photoPool(); if (!pool.length) return null;
    for (let tries = 0; tries < 3; tries++) {
      if (!bag.length) { bag = pool.slice(); for (let i = bag.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [bag[i], bag[j]] = [bag[j], bag[i]]; } }
      const k = bag.findIndex((p) => p !== lastPhoto && (!filter || filter(p)));
      if (k >= 0) { lastPhoto = bag.splice(k, 1)[0]; return lastPhoto; }
      if (filter) break;
    }
    const c = (filter ? pool.filter(filter) : pool); if (!c.length) return null;
    lastPhoto = pick(c); return lastPhoto;
  }
  const hitW = (p) => p.h * p.ratio * (1 - 2 * HIT.x);

  // ---- beat map / intensity (pre-computed from the mp3; falls back to a time-based curve) ----
  let beats = [], Ifine = null, mapOK = false, mapDone = false;
  const synthBeats = () => { const b = []; for (let k = 0; k < 400; k++) b.push([k * 0.4, [0.8, 0.3, 0.5, 0.3][k % 4]]); return b; };
  beats = synthBeats();
  const mapPromise = fetch(url(M.map)).then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); }).then((j) => {
    if (!j.beats || !j.beats.length || !j.intensity) throw new Error('bad beatmap');
    beats = j.beats;
    const n = Math.floor(j.duration * 10), raw = new Float32Array(n);
    for (let i = 0; i < n; i++) { const x = (i / 10) / j.intensityStep, k = Math.min(j.intensity.length - 2, Math.floor(x)); raw[i] = lerp(j.intensity[k], j.intensity[k + 1], x - k); }
    Ifine = new Float32Array(n);                         // ±0.6 s box blur
    for (let i = 0; i < n; i++) { let a = 0, c = 0; for (let k = -6; k <= 6; k++) { const q = raw[clamp(i + k, 0, n - 1)]; a += q; c++; } Ifine[i] = a / c; }
    mapOK = true;
  }).catch((e) => { console.warn('Beat map unavailable, using time-based difficulty:', e); }).then(() => { mapDone = true; });
  // musical intensity 0..1 at music time m (time-based curve when no map)
  const Iat = (m) => Ifine ? Ifine[clamp(Math.round(m * 10), 0, Ifine.length - 1)] : 0.15 + 0.85 * smooth((m - M.runAt) / D);

  // ---- soundtrack ----
  const audio = document.createElement('audio');
  audio.preload = 'none'; audio.loop = true; audio.volume = 0; audio.src = url(M.src);
  let audioOK = true, audioPlaying = false, muted = false, vol = 0;
  audio.addEventListener('playing', () => { audioPlaying = true; });
  ['pause', 'waiting', 'stalled', 'ended'].forEach((n) => audio.addEventListener(n, () => { audioPlaying = false; }));
  audio.addEventListener('error', () => { audioOK = false; audioPlaying = false; console.error('Soundtrack failed to load: ' + M.src); });
  const useAudio = () => audioOK && audioPlaying && !audio.paused && audio.readyState >= 2;
  function audioPlay() {
    if (!audioOK) return;
    const p = audio.play();
    if (p && p.catch) p.catch((e) => { if (e && e.name !== 'AbortError') { audioOK = false; console.warn('Audio blocked/unsupported, continuing silently:', e); } });
  }
  function audioStart() {                // always from the start of the track, so every run lines up the same way
    audioOK = true; audioPlaying = false; vol = 0; audio.volume = 0; audio.muted = muted;
    try { audio.currentTime = 0; } catch (e) { /* not seekable yet */ }
    audioPlay();
  }
  const audioStop = () => { try { audio.pause(); } catch (e) { /* noop */ } audioPlaying = false; };
  function setMuted(m) {
    muted = m; audio.muted = m; muteBtn.setAttribute('aria-pressed', String(m));
    muteBtn.setAttribute('aria-label', m ? 'Unmute music' : 'Mute music'); muteBtn.textContent = m ? '🔇' : '🔊';
  }
  muteBtn.addEventListener('click', () => setMuted(!muted));

  // ---- speed profile & distance table (distance is a pure function of run time, so obstacles can be placed on beats) ----
  const TS = 0.01;
  let rdTab = [0], FINISH = 0;
  const dropBoost = (m) => 1 + CFG.drop.speedBoost * smooth((m - CFG.drop.at) / CFG.drop.rampSec);
  const speedAt = (t) => lerp(CFG.speedStart, CFG.speedEnd, clamp(t / D, 0, 1)) * (0.96 + 0.08 * Iat(M.runAt + t)) * dropBoost(M.runAt + t) * spdK;
  function buildTable() {
    rdTab = [0]; const n = Math.ceil((D + 4) / TS);
    for (let i = 0; i < n; i++) rdTab.push(rdTab[i] + speedAt(i * TS) * TS);
    FINISH = rdAt(D);
  }
  function rdAt(t) {
    if (t <= 0) return speedAt(0) * t;
    const x = t / TS, i = Math.floor(x);
    if (i >= rdTab.length - 1) return rdTab[rdTab.length - 1] + speedAt(D) * (t - (rdTab.length - 1) * TS);
    return lerp(rdTab[i], rdTab[i + 1], x - i);
  }

  // ---- state ----
  let state = 'idle', stateT = 0, clock = 0, t = 0, rd = 0, scrollX = 0, heroPx = 0, synthM = 0, lastM = 0;
  let jumpY = 0, vy = 0, grounded = true, jumpBuf = 0, landSq = 0, plan = [], planI = 0, planReady = false, dummyXs = [], dIdx = 0;
  let obs = [], hearts = [], respawns = [], score = 0, streak = 0, mult = 1, lastHit = -99, hintOff = 0, flashed = false, deadAt = 0;
  let heldKey = false, canDouble = false, flipT = 0, splashT = 0, splashN = 0, flyHinted = false, lastFly = false, gridT = 0, fi = 0, bi = 0, pulse = 0, lvl = 0, lastBurst = -9, accentQ = 0, accentsDone = 0, bgLive = 0;
  const RUNNING = ['enter', 'run', 'finish', 'collect'];
  const heldPtr = new Set(), isHeld = () => heldPtr.size > 0 || heldKey;

  function setState(s) { state = s; stateT = 0; root.dataset.state = s; }
  function showHint(text, secs) { hintEl.textContent = text; hintEl.classList.add('show'); hintOff = clock + secs; }

  // ---- loop (exactly one rAF chain; paused when tab hidden) ----
  let raf = 0, last = 0;
  function loop(ts) { raf = requestAnimationFrame(loop); const dt = Math.min(0.05, Math.max(0, (ts - last) / 1000)); last = ts; update(dt); render(dt); }
  function startLoop() { if (raf) return; last = performance.now(); raf = requestAnimationFrame(loop); }
  function stopLoop() { if (raf) cancelAnimationFrame(raf); raf = 0; }
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { stopLoop(); audioStop(); }
    else if (RUNNING.includes(state)) { startLoop(); audioPlay(); }
    else if (state === 'won') audioPlay();
  });

  // ---- obstacle plan: obstacles are scheduled to reach the hero on musical beats ----
  function buildPlan() {
    plan = []; planI = 0; bag = []; lastPhoto = -1;
    const cx = heroX + heroW * 0.51;                       // hero hit-box centre
    const tEnd = D - CFG.endClearSec;
    let lastC = -1e9, pendingFly = false;                  // lastC: centre (world distance) of the previous obstacle
    let cand = beats.filter((b) => b[0] - M.runAt >= CFG.firstObstacleSec - 0.2 && b[0] - M.runAt <= tEnd);
    if (CFG.drop.grid) {                                   // optional fixed grid from the drop on
      cand = cand.filter((b) => b[0] < CFG.drop.at - 0.01);
      for (let m = CFG.drop.at; m - M.runAt <= tEnd; m += CFG.drop.grid) cand.push([m, 0.8]);
    }
    for (const b of cand) {
      let T = b[0] - M.runAt; const s = b[1], prog = T / D;
      if (T < CFG.firstObstacleSec) continue;
      if (Iat(b[0]) > CFG.offbeatI && Math.random() < CFG.offbeatChance) T += 0.2;   // syncopated eighth-note
      if (T > tEnd) continue;
      const I = Iat(M.runAt + T), spd = speedAt(T);
      let dens = lerp(CFG.densityStart, CFG.densityEnd, smooth(prog)) * (0.55 + 0.45 * I);
      if (I < CFG.breakdownI && prog > 0.15 && prog < 0.92) dens *= CFG.breakdownDensity;   // breathing space
      const Rc = rdAt(T), need = (spd + 30) * lerp(CFG.spacingStart, CFG.spacingEnd, prog) + CFG.spacingExtra;
      if (pendingFly) {                                     // a flying photo is "reserved": wait for the long gap it needs, then place it on a beat
        if (Rc - lastC >= spd * FLY.gapBefore + 60 && s > 0.4) {
          const fp = nextPhoto((p) => p.fly); pendingFly = false;
          if (fp) {                                         // can't be run under, can't be single-jumped → needs a double jump
            const fw = fp.fly * fp.ratio, fc = Rc + cx;
            plan.push({ T, p: fp, ox: fc - fw / 2, c: fc, fly: true }); lastC = Rc + spd * FLY.gapAfter; lastFly = true;
          }
        }
        continue;
      }
      if (Rc - lastC < need) continue;
      if (Math.random() > dens * (0.45 + 0.9 * s)) continue;
      if (T >= FLY.fromSec && !lastFly && s > 0.5 && Math.random() < FLY.chance) { pendingFly = true; continue; }
      lastFly = false;
      const compact = (p) => hitW(p) <= CFG.pairMaxHitW;
      let n = 1;
      if (prog >= CFG.pairFrom && s > 0.55 && Math.random() < CFG.pairChance) { n = 2; if (prog >= CFG.tripleFrom && Math.random() < CFG.tripleChance) n = 3; }
      const p1 = nextPhoto(n > 1 ? compact : null); if (!p1) break;
      if (n > 1 && !compact(p1)) n = 1;
      let w = p1.h * p1.ratio, c = Rc + cx;
      plan.push({ T, p: p1, ox: c - w / 2, c }); lastC = Rc;
      for (let k = 1; k < n; k++) {
        const pk = nextPhoto(compact); if (!pk) break;
        const wk = pk.h * pk.ratio, ck = c + (w + wk) / 2 + CFG.pairGap;
        plan.push({ T, p: pk, ox: ck - wk / 2, c: ck }); c = ck; w = wk; lastC = c - cx;
      }
    }
  }
  function buildAll() {
    buildTable(); buildPlan();
    dummyXs = []; dIdx = 0;
    const base = FINISH + heroX + heroW * 0.75 + 130;
    for (let k = 0; base + k * 95 - FINISH + 60 <= LW - 10; k++) dummyXs.push(base + k * 95);
    planReady = true;
  }

  // ---- begin / restart (full reset) ----
  function begin() {
    stopLoop();
    world.querySelectorAll('.g-ob,.g-heart,.g-fx,.g-plus').forEach((n) => n.remove());
    layout();
    obs = []; hearts = []; respawns = []; plan = []; planI = 0; planReady = false;
    clock = 0; t = 0; rd = 0; scrollX = 0; jumpY = 0; vy = 0; grounded = true; jumpBuf = 0; landSq = 0;
    score = 0; streak = 0; mult = 1; lastHit = -99; hintOff = 0; flashed = false;
    synthM = 0; lastM = 0; bi = 0; fi = 0; gridT = CFG.drop.at; splashT = CFG.drop.at; splashN = 0; pulse = 0;
    heldPtr.clear(); heldKey = false; canDouble = false; flipT = 0; flyHinted = false; lastFly = false; lvl = 0; lastBurst = -9; accentQ = 0; accentsDone = 0; bgLive = 0;
    heroPx = -heroW;
    heroEl.classList.remove('is-dead'); flashEl.classList.remove('go');
    [overEl, winEl, hintEl].forEach((e) => e.classList.remove('show'));
    comboEl.classList.remove('on'); scoreEl.textContent = '0/' + CFG.target; progEl.style.transform = 'scaleX(0)';
    finishEl.style.opacity = '';
    if (!photoPool().length) showHint('obstacle photos missing — check assets/obstacles/', 99);
    audioStart();                                   // called from the Play / Play Again click → allowed by autoplay rules
    if (mapDone) buildAll(); else mapPromise.then(() => { if (!planReady && RUNNING.includes(state)) buildAll(); });
    setState('enter');
    startLoop();
  }

  // ---- obstacles ----
  function makeOb(ox, p, dummy, fly) {
    const h = fly ? p.fly : p.h, w = h * p.ratio;
    let el;
    if (fly) {
      el = document.createElement('div'); el.className = 'g-ob g-fly';
      const im = document.createElement('img'); im.src = p.url; im.alt = ''; im.draggable = false; el.appendChild(im);
      ['l', 'r'].forEach((k) => { const wg = document.createElement('i'); wg.className = 'g-wing ' + k; el.appendChild(wg); });
      const sh = document.createElement('i'); sh.className = 'g-fshadow'; sh.style.top = `calc(100% + ${FLY.lift - 5}px)`; el.appendChild(sh);
    } else {
      el = document.createElement('img'); el.className = 'g-ob'; el.src = p.url; el.alt = ''; el.draggable = false;
    }
    el.style.cssText = `width:${w}px;height:${h}px`;
    world.appendChild(el);
    const o = { el, ox, w, h, fly: !!fly, src: p.url, dummy, ph: rand(0, 6.28) };
    obs.push(o); return o;
  }
  function spawnLogic() {
    while (planI < plan.length && plan[planI].ox - rd < LW + 60) {
      const it = plan[planI++]; makeOb(it.ox, it.p, false, it.fly);
      if (it.fly && !flyHinted) { flyHinted = true; showHint('flying one! tap twice to jump higher', 2.6); }
    }
    while (dIdx < dummyXs.length && dummyXs[dIdx] - rd < LW + 60) { const p = nextPhoto(); if (p) makeOb(dummyXs[dIdx], p, true); dIdx++; }
  }

  // ---- music-driven effects ----
  function musicTime() { return useAudio() ? audio.currentTime - M.latency : synthM; }
  function onBeat(s) {
    if (reduce.matches) return;
    if (musicTime() >= CFG.drop.at - 0.05) s = Math.max(s, 0.75);      // from the drop on, every beat is a full hit
    pulse = Math.max(pulse, (0.35 + 0.65 * s) * (0.35 + 0.65 * lvl));
    if (accentQ > 0 && s > 0.5) { accentQ--; accent(); }
    else if (s > 0.7 && lvl > 0.5 && clock - lastBurst > 0.8) { lastBurst = clock; bgBurst(4); }
  }
  function bgBurst(n) {
    for (let i = 0; i < n && bgLive < 30; i++) {
      const x = rand(0.08, 0.95) * LW, y = rand(30, GY - 190), s = rand(8, 18), dx = rand(-30, 30);
      bgLive++;
      fxHeart(x, y, s, pick(HEART_COLORS), [{ transform: `translate(${x}px,${y + 40}px) scale(.3)`, opacity: 0 },
        { transform: `translate(${x + dx * .5}px,${y}px) scale(1)`, opacity: .85, offset: .3 },
        { transform: `translate(${x + dx}px,${y - 60}px) scale(.7)`, opacity: 0 }], rand(900, 1300), 0, true);
      setTimeout(() => { bgLive = Math.max(0, bgLive - 1); }, 1400);
    }
  }
  function timedFlash(big) {                // scheduled build-up / drop flashes (soft, short)
    if (reduce.matches) return;
    flashEl.animate([{ opacity: 0 }, { opacity: big ? 0.5 : 0.32 }, { opacity: 0 }], { duration: big ? 520 : 300, easing: 'ease-out' });
    bgBurst(big ? 16 : 8);
  }
  const SPLASH_COL = ['#FF334F', '#FF7FA0', '#FFE6EE'];
  function splash() {                          // behind the characters, so it never hides hero or obstacles
    L.splash.style.background = SPLASH_COL[splashN++ % 3];
    L.splash.animate([{ opacity: 0 }, { opacity: 0.34 }, { opacity: 0 }], { duration: 340, easing: 'ease-out' });
    bgBurst(5);
  }
  function accent() {                       // short, soft section accent (max 2 per run)
    if (reduce.matches) return;
    flashEl.animate([{ opacity: 0 }, { opacity: 0.26 }, { opacity: 0 }], { duration: 480, easing: 'ease-out' });
    bgBurst(14);
  }
  function updateMusic(dt) {
    const m = musicTime();
    if (m < lastM - 1) { bi = 0; fi = 0; gridT = splashT = CFG.drop.at; }                 // soundtrack looped
    lastM = m;
    const G = CFG.drop.grid;
    while (bi < beats.length && beats[bi][0] <= m) {
      if (!(G && beats[bi][0] >= CFG.drop.at - 0.01) && m - beats[bi][0] < 0.2) onBeat(beats[bi][1]);
      bi++;
    }
    const SP = CFG.splash.every;
    if (SP) while (splashT <= m) { if (m >= CFG.drop.at - 0.01 && m - splashT < 0.25 && state !== 'enter' && !reduce.matches) splash(); splashT += SP; }
    if (G) { while (gridT <= m) { if (m >= CFG.drop.at && m - gridT < 0.2) onBeat(0.8); gridT += G; } }   // fixed-grid hits after the drop
    while (fi < CFG.flashAt.length && CFG.flashAt[fi] <= m) { if (state !== 'enter' && m - CFG.flashAt[fi] < 0.3) timedFlash(CFG.flashAt[fi] >= CFG.drop.at - 0.05); fi++; }
    const prog = clamp(t / D, 0, 1), target = 0.35 * smooth(prog) + 0.65 * Math.pow(Iat(m), 1.2);
    const prev = lvl; lvl += (target - lvl) * Math.min(1, dt * 1.6);
    if (state === 'run' && accentsDone < 2 && ((prev < 0.38 && lvl >= 0.38) || (prev < 0.7 && lvl >= 0.7))) { accentsDone++; accentQ++; }
    pulse *= Math.exp(-7 * dt);
    if (useAudio()) { const tv = muted ? 0 : M.volume; vol = Math.min(tv, vol + dt * 1.5); audio.volume = vol; }
  }

  // ---- physics / steps ----
  function physics(dt) {
    jumpBuf = Math.max(0, jumpBuf - dt); flipT = Math.max(0, flipT - dt);
    if (state === 'run') {
      if (grounded) {
        if (jumpBuf > 0 || isHeld()) { vy = CFG.jumpV; grounded = false; jumpBuf = 0; canDouble = true; }   // holding = jump again right after landing
      } else if (jumpBuf > 0 && canDouble && jumpY > CFG.doubleMinY) {                                     // new press in the air = double jump
        vy = CFG.doubleJumpV; canDouble = false; jumpBuf = 0; flipT = 0.5;
        if (!reduce.matches) for (let i = 0; i < 5; i++) { const a = rand(0, 6.28), cx = heroX + heroW / 2, cy = GY - jumpY - heroH * 0.2;
          fxHeart(cx, cy, rand(8, 14), pick(HEART_COLORS), [{ transform: `translate(${cx}px,${cy}px) scale(.4)`, opacity: 1 }, { transform: `translate(${cx + Math.cos(a) * 46}px,${cy + Math.sin(a) * 46 + 20}px) scale(1)`, opacity: 0 }], rand(380, 560)); }
      }
    }
    if (!grounded) {
      vy -= CFG.gravity * dt; jumpY += vy * dt;
      if (jumpY <= 0) { jumpY = 0; vy = 0; grounded = true; landSq = 0.12; canDouble = false; }
    }
    landSq = Math.max(0, landSq - dt * 0.6);
  }
  function update(dt) {
    clock += dt; stateT += dt;
    if (!useAudio()) synthM += dt;
    if (hintOff && clock > hintOff) { hintEl.classList.remove('show'); hintOff = 0; }
    if (state === 'enter') {
      const p = Math.min(1, stateT / (CFG.enterMs / 1000)), e = 1 - Math.pow(1 - p, 3);
      heroPx = -heroW + (heroX + heroW) * e; scrollX += CFG.speedStart * 1.1 * (1 - p * 0.4) * dt;
      const waitAudio = audioOK && !(useAudio() && audio.currentTime - M.latency >= M.runAt) && stateT < 3;   // run starts exactly at music second runAt
      if (p >= 1 && planReady && !waitAudio) {
        if (stateT >= 3 && audioOK && !useAudio()) { audioOK = false; audioStop(); }       // audio never started → time-based fallback
        heroPx = heroX; t = 0; if (!useAudio()) synthM = M.runAt;
        bi = 0; while (bi < beats.length && beats[bi][0] < musicTime() - 0.2) bi++;
        fi = 0; while (fi < CFG.flashAt.length && CFG.flashAt[fi] < musicTime() - 0.3) fi++;
        gridT = CFG.drop.at; while (gridT < musicTime() - 0.2) gridT += CFG.drop.grid || 1e9;
        splashT = CFG.drop.at; while (CFG.splash.every && splashT < musicTime() - 0.25) splashT += CFG.splash.every;
        setState('run'); showHint('tap or press space to jump', 3.2);
      }
    } else if (state === 'run') {
      t += dt;
      if (useAudio()) t += clamp((audio.currentTime - M.latency - M.runAt) - t, -0.012, 0.012);   // gentle drift correction to the soundtrack
      const prevRd = rd; rd = rdAt(t); scrollX += rd - prevRd;
      physics(dt); spawnLogic();
      const feet = GY - jumpY, hx1 = heroX + heroW * 0.3, hx2 = heroX + heroW * 0.72, hy1 = feet - heroH * 0.88, hy2 = feet - heroH * 0.05;
      for (let i = obs.length - 1; i >= 0; i--) {
        const o = obs[i], sx = o.ox - rd;
        if (sx < -o.w - 30) { o.el.remove(); obs.splice(i, 1); continue; }
        if (o.dummy) continue;
        const oy1 = (o.fly ? GY - FLY.lift : GY) - o.h * (1 - HIT.top), oy2 = o.fly ? GY - FLY.lift : GY - 2;
        if (hx1 < sx + o.w * (1 - HIT.x) && hx2 > sx + o.w * HIT.x && hy1 < oy2 && hy2 > oy1) { die(o); return; }
      }
      progEl.style.transform = `scaleX(${Math.min(1, rd / FINISH)})`;
      if (t >= D) { t = D; rd = FINISH; setState('finish'); }
    } else if (state === 'finish') {
      physics(dt);
      if (!flashed && stateT > 0.35) { flashed = true; flashEl.classList.remove('go'); void flashEl.offsetWidth; flashEl.classList.add('go'); }
      if (stateT > 0.9 && grounded) toCollect();
    } else if (state === 'collect') {
      collectStep(dt);
    }
    if (RUNNING.includes(state)) updateMusic(dt);
  }

  // ---- game over ----
  function die(o) {
    setState('dead'); deadAt = performance.now();
    heroEl.classList.add('is-dead'); audioStop();
    overImg.src = o.src; overText.textContent = 'Bonked!';
    overEl.classList.add('show'); hintEl.classList.remove('show');
    render(0); stopLoop();
  }

  // ---- finish → hearts ----
  function toCollect() {
    finishEl.style.opacity = '0';
    obs.forEach((o) => {
      const sx = o.ox - rd;
      if (hearts.length < heartCount && sx > -o.size && sx < LW) spawnHeart(sx + o.size / 2 - hs / 2, GY - o.size / 2 - hs / 2, 1);
      o.el.remove();
    });
    obs = [];
    for (let i = hearts.length; i < heartCount; i++) respawns.push({ at: clock + 0.1 + 0.1 * (i - hearts.length), hero: true });
    setState('collect');
    showHint('catch the hearts!', 3);
  }
  function spawnHeart(x, y, boost) {
    const el = document.createElement('div'), inn = document.createElement('i');
    el.className = 'g-heart'; el.style.width = el.style.height = hs + 'px';
    inn.className = 'g-heart-in'; inn.style.setProperty('--c', pick(HEART_COLORS)); el.appendChild(inn);
    world.appendChild(el);
    let a; do { a = rand(0, Math.PI * 2); } while (Math.min(Math.abs(Math.cos(a)), Math.abs(Math.sin(a))) < 0.3);
    const c = { el, inn, x: x == null ? rand(0, LW - hs) : x, y: y == null ? rand(46, LH - hs - 8) : y, dx: Math.cos(a), dy: Math.sin(a), m: rand(0.8, 1.2), boost: boost || 0, dead: false };
    el.__c = c; hearts.push(c);
    inn.animate([{ transform: 'scale(0)' }, { transform: 'scale(1.18)', offset: 0.6 }, { transform: 'scale(1)' }], { duration: reduce.matches ? 1 : 380, easing: 'ease-out' });
    return c;
  }
  function collectStep(dt) {
    for (let i = respawns.length - 1; i >= 0; i--) {
      if (respawns[i].at > clock) continue;
      const r = respawns.splice(i, 1)[0];
      if (hearts.length < heartCount) r.hero ? spawnHeart(heroX + heroW / 2 - hs / 2, GY - heroH - hs / 2, 1) : spawnHeart(null, null, 0);
    }
    if (streak > 0 && clock - lastHit > CFG.comboWindow) { streak = 0; mult = 1; comboEl.classList.remove('on'); }
    const H = CFG.hearts, spd = Math.min(H.speedMax, H.speedStart + score * H.perPoint) * Math.max(0.7, LW / 800);
    for (const c of hearts) {
      c.boost *= Math.exp(-2.6 * dt);
      const v = spd * c.m + c.boost * 520;
      c.x += c.dx * v * dt; c.y += c.dy * v * dt;
      if (c.x < 0) { c.x = 0; c.dx = Math.abs(c.dx); } else if (c.x > LW - hs) { c.x = LW - hs; c.dx = -Math.abs(c.dx); }
      if (c.y < 46) { c.y = 46; c.dy = Math.abs(c.dy); } else if (c.y > LH - hs - 6) { c.y = LH - hs - 6; c.dy = -Math.abs(c.dy); }
    }
  }
  const multFor = (n) => { for (const [s, m] of CFG.comboSteps) if (n >= s) return m; return 1; };
  function fxHeart(x, y, size, color, kf, dur, delay, behind) {
    const el = document.createElement('i'); el.className = 'g-fx';
    el.style.cssText = `width:${size}px;height:${size}px;margin:${-size / 2}px 0 0 ${-size / 2}px;--c:${color}`;
    if (behind) world.insertBefore(el, groundEl); else world.appendChild(el);
    const a = el.animate(kf, { duration: dur, delay: delay || 0, fill: 'both', easing: 'cubic-bezier(.2,.8,.3,1)' });
    a.onfinish = a.oncancel = () => el.remove();
  }
  function collect(el) {
    const c = el.__c;
    if (!c || c.dead || state !== 'collect') return;
    c.dead = true; hearts.splice(hearts.indexOf(c), 1); el.style.pointerEvents = 'none';
    streak = (streak > 0 && clock - lastHit <= CFG.comboWindow) ? streak + 1 : 1; lastHit = clock;
    const prev = mult; mult = multFor(streak);
    const gain = Math.min(mult, CFG.target - score); score += gain;
    scoreEl.textContent = score + '/' + CFG.target;
    if (!reduce.matches) scoreEl.animate([{ transform: 'scale(1.25)' }, { transform: 'scale(1)' }], { duration: 220 });
    if (mult > 1) {
      comboEl.textContent = 'COMBO ×' + mult; comboEl.classList.add('on');
      if (mult !== prev && !reduce.matches) comboEl.animate([{ transform: 'scale(.6) rotate(-8deg)' }, { transform: 'scale(1.3) rotate(4deg)', offset: .6 }, { transform: 'scale(1)' }], { duration: 380, easing: 'ease-out' });
    } else comboEl.classList.remove('on');
    const cx = c.x + hs / 2, cy = c.y + hs / 2;
    c.inn.animate([{ transform: 'scale(1)', opacity: 1 }, { transform: 'scale(1.7)', opacity: 0 }], { duration: reduce.matches ? 120 : 340, easing: 'ease-out', fill: 'forwards' }).onfinish = () => el.remove();
    const plus = document.createElement('div'); plus.className = 'g-plus'; plus.textContent = '+' + gain;
    plus.style.transform = `translate(${cx - 14}px,${cy - 16}px)`; world.appendChild(plus);
    plus.animate([{ opacity: 1, marginTop: '0px' }, { opacity: 0, marginTop: '-46px' }], { duration: reduce.matches ? 250 : 650, easing: 'ease-out', fill: 'forwards' }).onfinish = () => plus.remove();
    if (!reduce.matches) for (let i = 0; i < 5; i++) {
      const a = rand(0, 6.28), d = rand(30, 70);
      fxHeart(cx, cy, rand(8, 14), pick(HEART_COLORS), [{ transform: `translate(${cx}px,${cy}px) scale(.4)`, opacity: 1 }, { transform: `translate(${cx + Math.cos(a) * d}px,${cy + Math.sin(a) * d}px) scale(1)`, opacity: 0 }], rand(420, 650));
    }
    if (score >= CFG.target) win(); else respawns.push({ at: clock + 0.35 });
  }

  // ---- victory ----
  function win() {
    setState('won'); respawns = [];
    hearts.forEach((c) => { c.el.style.pointerEvents = 'none'; c.inn.animate([{ transform: 'scale(1)', opacity: 1 }, { transform: 'scale(1.8)', opacity: 0 }], { duration: 500, fill: 'forwards' }).onfinish = () => c.el.remove(); });
    hearts = [];
    const bursts = reduce.matches ? 2 : 5, n = reduce.matches ? 8 : 14;
    for (let b = 0; b < bursts; b++) {
      const cx = rand(0.2, 0.8) * LW, cy = rand(0.15, 0.55) * LH;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * 6.283 + rand(-.2, .2), d = rand(70, 140), s = rand(10, 22);
        fxHeart(cx, cy, s, pick(HEART_COLORS), [
          { transform: `translate(${cx}px,${cy}px) scale(.2)`, opacity: 0 },
          { transform: `translate(${cx + Math.cos(a) * d * .5}px,${cy + Math.sin(a) * d * .5}px) scale(1)`, opacity: 1, offset: .2 },
          { transform: `translate(${cx + Math.cos(a) * d}px,${cy + Math.sin(a) * d + 20}px) scale(.9)`, opacity: .9, offset: .7 },
          { transform: `translate(${cx + Math.cos(a) * d * 1.1}px,${cy + Math.sin(a) * d + 70}px) scale(.6)`, opacity: 0 }
        ], rand(1200, 1700), b * 280);
      }
    }
    winEl.classList.add('show'); hintEl.classList.remove('show'); comboEl.classList.remove('on');
    dlBtn.hidden = false; dlBtn.classList.add('g-reveal'); stage.classList.add('game-won'); if (keyRow) keyRow.hidden = false;
    render(); stopLoop();
  }

  // ---- render ----
  let lastOp = {};
  const setOp = (el, key, v) => { v = Math.round(clamp(v, 0, 1) * 100) / 100; if (lastOp[key] !== v) { lastOp[key] = v; el.style.opacity = v; } };
  function render(dt) {
    const running = state === 'enter' || state === 'run', ph = scrollX * 0.045, pu = reduce.matches ? 0 : pulse;
    const bob = running && grounded ? Math.abs(Math.sin(ph)) * 5 : 0;
    let rot = running && grounded ? Math.sin(ph) * 2.5 : (!grounded ? clamp(-vy / CFG.jumpV * 10, -12, 12) : 0);
    const cheer = (state === 'collect' || state === 'finish') && !reduce.matches ? Math.abs(Math.sin(clock * 5)) * 8 : 0;
    if (reduce.matches) rot = 0; else if (flipT > 0) rot = (1 - flipT / 0.5) * 360;      // double-jump flip
    const y = GY - heroH - jumpY - bob - (state === 'finish' && stateT < 0.2 ? 0 : cheer);
    const sq = landSq + 0.05 * pu * (grounded ? 1 : 0);
    heroEl.style.transform = `translate3d(${heroPx}px,${y}px,0) rotate(${rot}deg) scale(${1 + sq * 0.6},${1 - sq + 0.05 * pu * 2})`;
    groundIn.style.transform = `translate3d(${-mod(scrollX, 80)}px,0,0)`;
    const span = LW + 240;
    for (const c of CLOUDS) c.el.style.transform = `translate3d(${mod(c.x * span - scrollX * c.p, span) - 120}px,0,0) scale(${c.s})`;
    for (const o of obs) {
      const wob = reduce.matches ? 0 : Math.sin(clock * 3 + o.ph);
      o.el.style.transform = o.fly
        ? `translate3d(${o.ox - rd}px,${GY - FLY.lift - o.h - wob * 3}px,0) rotate(${wob * 1.5}deg) scale(${1 + 0.04 * pu})`
        : `translate3d(${o.ox - rd}px,${GY - o.h + 4 - wob * 2.2}px,0) rotate(${wob * 2.5}deg) scale(${1 + 0.05 * pu})`;
    }
    for (const c of hearts) c.el.style.transform = `translate3d(${c.x}px,${c.y}px,0)`;
    finishEl.style.transform = `translate3d(${FINISH + heroX + heroW * 0.75 - rd}px,0,0)`;
    // music-driven layers
    const l = lvl;
    setOp(L.sky, 'sky', Math.pow(clamp((l - 0.2) / 0.7, 0, 1), 1.3) * 0.88);
    setOp(L.rays, 'rays', clamp((l - 0.55) / 0.35, 0, 1) * 0.55);
    setOp(L.hills[0], 'h0', clamp((l - 0.1) / 0.2, 0, 1) * 0.8);
    setOp(L.hills[1], 'h1', clamp((l - 0.28) / 0.2, 0, 1) * 0.85);
    setOp(L.pulse, 'pulse', pu * 0.5 * (0.3 + 0.7 * l));
    L.hills[0].style.transform = `translate3d(${-mod(scrollX * 0.22, HILL_W)}px,0,0)`;
    L.hills[1].style.transform = `translate3d(${-mod(scrollX * 0.42, HILL_W)}px,0,0)`;
    const sp = LW + 200;
    for (const s of L.shapes) {
      setOp(s.el, 'sh' + s.th, clamp((l - s.th) / 0.15, 0, 1) * 0.7);
      s.el.style.transform = `translate3d(${mod(s.x * sp - scrollX * s.p, sp) - 100}px,${s.y + Math.sin(clock + s.th * 9) * 6}px,0) rotate(${reduce.matches ? 0 : scrollX * s.spin}deg)`;
    }
  }

  // ---- input (listeners registered once) ----
  const release = (e) => { heldPtr.delete(e.pointerId); };
  document.addEventListener('pointerup', release); document.addEventListener('pointercancel', release);
  addEventListener('blur', () => { heldPtr.clear(); heldKey = false; });
  root.addEventListener('pointerdown', (e) => {
    if (e.target.closest('button')) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (state === 'run') { heldPtr.add(e.pointerId); jumpBuf = 0.12; }
    else if (state === 'collect') { const h = e.target.closest('.g-heart'); if (h) collect(h); }
  });
  root.addEventListener('contextmenu', (e) => e.preventDefault());
  document.addEventListener('keyup', (e) => { if (e.code === 'Space' || e.key === ' ') heldKey = false; });
  document.addEventListener('keydown', (e) => {
    if (root.hidden) return;
    const space = e.code === 'Space' || e.key === ' ';
    if (state === 'dead' && (space || e.key === 'Enter') && !e.target.closest('button,a') && performance.now() - deadAt > 700) { e.preventDefault(); begin(); return; }
    if (!space || !RUNNING.includes(state)) return;
    if (state !== 'run' && state !== 'enter' && e.target.closest && e.target.closest('button,a,input,textarea,select')) return;
    e.preventDefault();                               // Space never scrolls while the game is active
    if (!e.repeat && state === 'run') { heldKey = true; jumpBuf = 0.12; }   // new press = jump / double jump; holding = auto-jump
  });
  againBtn.addEventListener('click', begin);
  playBtn.addEventListener('click', () => {
    playBtn.hidden = true; stage.classList.add('game-on'); root.hidden = false;
    begin();
    requestAnimationFrame(() => root.classList.add('is-open'));
  });
  // ---- reward: Download gives a random obstacle/hero image; the secret word gives the ZIP ----
  const keyRow = document.getElementById('keyRow'), keyInput = document.getElementById('keyInput');
  const ZIP = { href: dlBtn.href, name: dlBtn.getAttribute('download') || 'love.zip' };   // set by script.js (CONFIG.zipPath)
  const IMAGES = [{ href: url('assets/hero.png'), name: 'hero.png' }].concat(PHOTOS.map((p) => ({ href: url(p.src), name: p.src.split('/').pop() })));
  dlBtn.addEventListener('click', () => {
    const word = (keyInput ? keyInput.value : '').trim().toLowerCase();
    const pickd = word === CFG.secretWord.toLowerCase() ? ZIP : pick(IMAGES);
    dlBtn.href = pickd.href; dlBtn.setAttribute('download', pickd.name);
  });
  if (keyInput) keyInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); dlBtn.click(); } });
  buildTable();                                       // so FINISH exists before the first run
})();
