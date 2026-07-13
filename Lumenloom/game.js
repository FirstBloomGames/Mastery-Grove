(() => {
  'use strict';

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d', { alpha: false });
  const $ = (id) => document.getElementById(id);
  const TAU = Math.PI * 2;
  const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  let reducedMotion = motionQuery.matches;
  const pageParams = new URLSearchParams(window.location.search);
  const isTrialRun = pageParams.get('trial') === '1';
  const sessionId = pageParams.get('session') || '';
  const messageTargetOrigin = window.location.protocol === 'file:' ? '*' : window.location.origin;
  const isEmbedded = window.parent !== window;

  const ui = {
    hud: $('hud'),
    phaseName: $('phaseName'),
    scoreValue: $('scoreValue'),
    bestValue: $('bestValue'),
    objectiveKicker: $('objectiveKicker'),
    objectiveText: $('objectiveText'),
    objectiveProgress: $('objectiveProgress'),
    objectiveFill: $('objectiveFill'),
    lumenFill: $('lumenFill'),
    lumenValue: $('lumenValue'),
    petalDisplay: $('petalDisplay'),
    healthValue: $('healthValue'),
    wardIndicator: $('wardIndicator'),
    comboBadge: $('comboBadge'),
    comboValue: $('comboValue'),
    weaveButton: $('weaveButton'),
    weaveButtonLabel: $('weaveButtonLabel'),
    soundButton: $('soundButton'),
    soundIcon: $('soundIcon'),
    fullscreenButton: $('fullscreenButton'),
    pauseButton: $('pauseButton'),
    toast: $('toast'),
    phaseBanner: $('phaseBanner'),
    phaseBannerKicker: $('phaseBannerKicker'),
    phaseBannerTitle: $('phaseBannerTitle'),
    phaseBannerSubtitle: $('phaseBannerSubtitle'),
    startOverlay: $('startOverlay'),
    startBest: $('startBest'),
    playButton: $('playButton'),
    pauseOverlay: $('pauseOverlay'),
    resumeButton: $('resumeButton'),
    quitButton: $('quitButton'),
    blessingOverlay: $('blessingOverlay'),
    blessingChoices: $('blessingChoices'),
    resultOverlay: $('resultOverlay'),
    resultSymbol: $('resultSymbol'),
    resultKicker: $('resultKicker'),
    resultTitle: $('resultTitle'),
    resultCopy: $('resultCopy'),
    resultRank: $('resultRank'),
    resultScore: $('resultScore'),
    resultBest: $('resultBest'),
    resultLoops: $('resultLoops'),
    resultShadows: $('resultShadows'),
    replayButton: $('replayButton'),
    homeButton: $('homeButton')
  };

  const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
  const lerp = (a, b, t) => a + (b - a) * t;
  const easeOut = (t) => 1 - Math.pow(1 - t, 3);
  const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const formatNumber = (n) => Math.round(n).toLocaleString('en-US');

  function mulberry32(seed) {
    return function random() {
      let t = seed += 0x6D2B79F5;
      t = Math.imul(t ^ t >>> 15, t | 1);
      t ^= t + Math.imul(t ^ t >>> 7, t | 61);
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  let W = 1280;
  let H = 720;
  let DPR = 1;
  let lastFrame = performance.now();
  let nextId = 1;
  let random = mulberry32(Date.now() >>> 0);

  const phaseDefs = [
    {
      title: 'FIRST STITCH',
      kicker: 'THE FIRST THREAD',
      subtitle: 'Every garden begins with one brave line of light.',
      target: 1,
      anchorCount: 9,
      initial: { drifter: 2 },
      maxEnemies: 3,
      spawnInterval: 8,
      time: Infinity,
      palette: ['#09091d', '#17143c', '#142d3c']
    },
    {
      title: 'MURMURS',
      kicker: 'NIGHT I',
      subtitle: 'Small shadows gather where the flowers have forgotten.',
      target: 7,
      anchorCount: 13,
      initial: { drifter: 5 },
      maxEnemies: 7,
      spawnInterval: 4.6,
      time: 82,
      palette: ['#08091f', '#152b45', '#123f43']
    },
    {
      title: 'HUNGER',
      kicker: 'NIGHT II',
      subtitle: 'Some darkness has learned to follow the thread.',
      target: 12,
      anchorCount: 15,
      initial: { drifter: 5, seeker: 2 },
      maxEnemies: 9,
      spawnInterval: 3.7,
      time: 82,
      palette: ['#08071d', '#24204c', '#263456']
    },
    {
      title: 'CROSSWIND',
      kicker: 'NIGHT III',
      subtitle: 'The dark runs hard when it knows the dawn is close.',
      target: 18,
      anchorCount: 17,
      initial: { drifter: 5, seeker: 2, rusher: 2 },
      maxEnemies: 11,
      spawnInterval: 3.1,
      time: 88,
      palette: ['#070619', '#291943', '#17364d']
    },
    {
      title: 'THE HOLLOW',
      kicker: 'THE LAST DARK',
      subtitle: 'It cannot be fought. It can only be given a shape—and closed.',
      target: 3,
      anchorCount: 19,
      initial: { drifter: 3, seeker: 2 },
      maxEnemies: 9,
      spawnInterval: 4.2,
      time: Infinity,
      palette: ['#050511', '#1d102d', '#2b223e'],
      boss: true
    }
  ];

  const blessingDefs = [
    { id: 'longer', symbol: '∞', name: 'Longer Thread', copy: '+25 maximum lumen. Brave shapes can stretch farther.' },
    { id: 'golden', symbol: '⌛', name: 'Golden Fiber', copy: 'Fraying thread holds 0.4 seconds longer before it breaks.' },
    { id: 'quickwing', symbol: '❯', name: 'Quickwing', copy: 'Glide 12% faster and turn with a little more grace.' },
    { id: 'nectar', symbol: '✦', name: 'Night Nectar', copy: 'Every sealed loop restores 10 additional lumen.' },
    { id: 'ward', symbol: '◇', name: 'Petal Ward', copy: 'The next shadow touch or moonfall cannot take a petal.' },
    { id: 'echo', symbol: '↟', name: 'Echo Bloom', copy: 'Chain-weave time lasts 2 seconds longer between loops.' }
  ];

  const state = {
    mode: 'title',
    previousMode: 'playing',
    phaseIndex: 0,
    phaseProgress: 0,
    phaseTarget: 1,
    phaseTime: Infinity,
    phaseIntroTimer: 0,
    transitionTimer: 0,
    toastTimer: 0,
    score: 0,
    best: readBest(),
    lives: 3,
    lumen: 100,
    maxLumen: 100,
    frayTimer: 0,
    frayMax: 0,
    weaveAge: 0,
    chain: [],
    anchors: [],
    enemies: [],
    regions: [],
    wildBlooms: [],
    particles: [],
    floaters: [],
    fireflies: [],
    grass: [],
    stones: [],
    lastLoopAt: -999,
    comboStack: 0,
    cleanWeave: true,
    invalidFlash: 0,
    spawnTimer: 0,
    runTime: 0,
    loops: 0,
    shadows: 0,
    shake: 0,
    flash: 0,
    dawn: 0,
    completed: false,
    tutorialStep: 0,
    upgrades: {
      speed: 1,
      frayWindow: 0.85,
      captureRefund: 16,
      chainWindow: 6,
      ward: false
    },
    player: {
      x: W / 2,
      y: H / 2,
      vx: 0,
      vy: 0,
      facing: -Math.PI / 2,
      invulnerable: 0,
      wing: 0
    }
  };

  const input = {
    keys: new Set(),
    pointerActive: false,
    pointerType: 'mouse',
    x: W / 2,
    y: H / 2,
    lastKeyboard: 0
  };

  class AudioGarden {
    constructor() {
      this.context = null;
      this.master = null;
      this.muted = false;
      this.nextMusic = 0;
      this.musicStep = 0;
    }

    init() {
      if (this.context) {
        if (this.context.state === 'suspended') this.context.resume().catch(() => {});
        return;
      }
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      try {
        this.context = new AudioContext();
        this.master = this.context.createGain();
        this.master.gain.value = this.muted ? 0 : 0.42;
        const filter = this.context.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 5200;
        filter.Q.value = 0.4;
        this.master.connect(filter);
        filter.connect(this.context.destination);
        this.nextMusic = this.context.currentTime + 0.2;
      } catch (_) {
        this.context = null;
      }
    }

    toggle() {
      this.muted = !this.muted;
      if (this.master && this.context) {
        this.master.gain.cancelScheduledValues(this.context.currentTime);
        this.master.gain.setTargetAtTime(this.muted ? 0 : 0.42, this.context.currentTime, 0.05);
      }
      ui.soundIcon.textContent = this.muted ? '×' : '♪';
      ui.soundButton.setAttribute('aria-label', this.muted ? 'Unmute sound' : 'Mute sound');
    }

    suspend() {
      if (this.context?.state === 'running') this.context.suspend().catch(() => {});
    }

    tone(frequency, duration = 0.35, volume = 0.06, type = 'sine', delay = 0) {
      if (!this.context || !this.master || this.muted) return;
      const now = this.context.currentTime + delay;
      const osc = this.context.createOscillator();
      const gain = this.context.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(frequency, now);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, volume), now + Math.min(0.04, duration * 0.2));
      gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
      osc.connect(gain);
      gain.connect(this.master);
      osc.start(now);
      osc.stop(now + duration + 0.03);
    }

    noise(duration = 0.12, volume = 0.035, highpass = 280) {
      if (!this.context || !this.master || this.muted) return;
      const length = Math.max(1, Math.floor(this.context.sampleRate * duration));
      const buffer = this.context.createBuffer(1, length, this.context.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
      const source = this.context.createBufferSource();
      const gain = this.context.createGain();
      const filter = this.context.createBiquadFilter();
      filter.type = 'highpass';
      filter.frequency.value = highpass;
      gain.gain.value = volume;
      source.buffer = buffer;
      source.connect(filter);
      filter.connect(gain);
      gain.connect(this.master);
      source.start();
    }

    pin(index) {
      const scale = [293.66, 329.63, 392, 440, 523.25, 587.33];
      this.tone(scale[index % scale.length], 0.38, 0.055, 'sine');
      this.tone(scale[index % scale.length] * 2, 0.18, 0.018, 'triangle', 0.03);
    }

    close(count, clean) {
      const base = count >= 4 ? 293.66 : 261.63;
      [1, 1.25, 1.5, 2].forEach((ratio, i) => this.tone(base * ratio, 0.75 + i * 0.08, 0.045, 'sine', i * 0.055));
      if (clean) this.tone(base * 3, 1.05, 0.025, 'triangle', 0.17);
    }

    hit() {
      this.noise(0.22, 0.055, 90);
      this.tone(92, 0.45, 0.08, 'sawtooth');
    }

    fray() {
      this.tone(116, 0.55, 0.045, 'square');
      this.tone(109, 0.55, 0.025, 'sine', 0.1);
    }

    update() {
      if (!this.context || this.muted || state.mode !== 'playing') return;
      const now = this.context.currentTime;
      if (now < this.nextMusic) return;
      const roots = [110, 130.81, 98, 116.54, 87.31];
      const root = roots[state.phaseIndex] || 110;
      const patterns = [[0, 7, 12, 16], [0, 5, 9, 14], [0, 7, 10, 15]];
      const pattern = patterns[this.musicStep % patterns.length];
      pattern.forEach((semitone, i) => {
        const f = root * Math.pow(2, semitone / 12);
        this.tone(f * 2, 1.6, 0.012, 'sine', i * 0.72);
        if (i === 0) this.tone(f, 3.4, 0.014, 'triangle', 0.05);
      });
      this.musicStep++;
      this.nextMusic = now + 3.5;
    }
  }

  const audio = new AudioGarden();

  function postToGrove(type, payload = {}) {
    if (!isEmbedded) return;
    window.parent.postMessage({
      source: 'first-bloom-game',
      version: 1,
      type,
      gameId: 'lumenloom',
      ...payload,
      sessionId
    }, messageTargetOrigin);
  }

  const dialogOverlays = [ui.startOverlay, ui.pauseOverlay, ui.blessingOverlay, ui.resultOverlay];
  let focusBeforeDialog = null;

  function setAriaHidden(element, hidden) {
    if (hidden) element.setAttribute('aria-hidden', 'true');
    else element.removeAttribute('aria-hidden');
  }

  function activeDialog() {
    return dialogOverlays.find((overlay) => overlay.classList.contains('is-visible')) || null;
  }

  function syncDialogState() {
    const active = activeDialog();
    dialogOverlays.forEach((overlay) => {
      const visible = overlay === active;
      overlay.inert = !visible;
      setAriaHidden(overlay, !visible);
    });
    const backgroundHidden = Boolean(active);
    ui.hud.inert = backgroundHidden;
    canvas.inert = backgroundHidden;
    setAriaHidden(ui.hud, backgroundHidden || ui.hud.classList.contains('is-hidden'));
    setAriaHidden(canvas, backgroundHidden);
  }

  function openDialog(overlay, focusTarget) {
    if (!activeDialog()) focusBeforeDialog = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialogOverlays.forEach((candidate) => candidate.classList.toggle('is-visible', candidate === overlay));
    syncDialogState();
    if (focusTarget) {
      focusTarget.focus({ preventScroll: true });
      window.setTimeout(() => focusTarget.focus({ preventScroll: true }), 40);
    }
  }

  function closeDialogs(focusTarget = null) {
    dialogOverlays.forEach((overlay) => overlay.classList.remove('is-visible'));
    syncDialogState();
    const target = focusTarget || focusBeforeDialog;
    focusBeforeDialog = null;
    if (target?.isConnected && !target.inert) {
      target.focus({ preventScroll: true });
      window.setTimeout(() => target.focus({ preventScroll: true }), 30);
    }
  }

  function trapDialogFocus(event) {
    if (isEmbedded || event.key !== 'Tab') return false;
    const overlay = activeDialog();
    if (!overlay) return false;
    const focusable = [...overlay.querySelectorAll('button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])')]
      .filter((element) => !element.inert && element.getClientRects().length > 0);
    if (!focusable.length) return false;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && (document.activeElement === first || !overlay.contains(document.activeElement))) {
      event.preventDefault();
      last.focus({ preventScroll: true });
      return true;
    }
    if (!event.shiftKey && (document.activeElement === last || !overlay.contains(document.activeElement))) {
      event.preventDefault();
      first.focus({ preventScroll: true });
      return true;
    }
    return false;
  }

  function readBest() {
    try { return Number(localStorage.getItem('lumenloom-best') || 0); }
    catch (_) { return 0; }
  }

  function writeBest(value) {
    try { localStorage.setItem('lumenloom-best', String(Math.round(value))); }
    catch (_) { /* local file privacy modes may disable storage */ }
  }

  function resize() {
    const oldW = W;
    const oldH = H;
    const rect = canvas.getBoundingClientRect();
    W = Math.max(320, rect.width);
    H = Math.max(240, rect.height);
    DPR = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(W * DPR);
    canvas.height = Math.round(H * DPR);
    canvas.style.width = `${W}px`;
    canvas.style.height = `${H}px`;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);

    if (oldW && oldH && state.mode !== 'title') {
      const sx = W / oldW;
      const sy = H / oldH;
      const scalePoint = (p) => { p.x *= sx; p.y *= sy; };
      scalePoint(state.player);
      state.anchors.forEach(scalePoint);
      state.enemies.forEach(scalePoint);
      state.wildBlooms.forEach(scalePoint);
      state.particles.forEach(scalePoint);
      state.floaters.forEach(scalePoint);
      state.regions.forEach((region) => region.points.forEach(scalePoint));
    } else {
      state.player.x = W / 2;
      state.player.y = H / 2;
    }
    generateBackdrop();
  }

  function generateBackdrop() {
    const seed = 1701 + Math.round(W) * 7 + Math.round(H) * 13;
    const rng = mulberry32(seed >>> 0);
    state.grass = [];
    state.stones = [];
    state.fireflies = [];

    const grassCount = Math.round((W * H) / 4300);
    for (let i = 0; i < grassCount; i++) {
      state.grass.push({
        x: rng() * W,
        y: rng() * H,
        length: 7 + rng() * 16,
        angle: -0.45 + rng() * 0.9,
        alpha: 0.07 + rng() * 0.13,
        phase: rng() * TAU,
        warm: rng() > 0.82
      });
    }

    const stoneCount = Math.round((W * H) / 30000);
    for (let i = 0; i < stoneCount; i++) {
      state.stones.push({
        x: rng() * W,
        y: rng() * H,
        rx: 2 + rng() * 8,
        ry: 1 + rng() * 4,
        angle: rng() * TAU,
        alpha: 0.04 + rng() * 0.08
      });
    }

    for (let i = 0; i < 28; i++) {
      state.fireflies.push({
        x: rng() * W,
        y: rng() * H,
        baseX: rng() * W,
        baseY: rng() * H,
        phase: rng() * TAU,
        speed: 0.25 + rng() * 0.55,
        radius: 0.7 + rng() * 1.7
      });
    }
  }

  function startRun() {
    if (isTrialRun && state.mode === 'result') return;
    audio.init();
    random = mulberry32((Date.now() ^ Math.round(performance.now() * 1000)) >>> 0);
    state.mode = 'playing';
    postToGrove('run-start');
    state.previousMode = 'playing';
    state.phaseIndex = 0;
    state.phaseProgress = 0;
    state.phaseTarget = 1;
    state.phaseTime = Infinity;
    state.score = 0;
    state.lives = 3;
    state.maxLumen = 100;
    state.lumen = 100;
    state.chain = [];
    state.anchors = [];
    state.enemies = [];
    state.regions = [];
    state.wildBlooms = [];
    state.particles = [];
    state.floaters = [];
    state.frayTimer = 0;
    state.comboStack = 0;
    state.lastLoopAt = -999;
    state.runTime = 0;
    state.loops = 0;
    state.shadows = 0;
    state.shake = 0;
    state.flash = 0;
    state.dawn = 0;
    state.completed = false;
    state.tutorialStep = 0;
    state.upgrades = { speed: 1, frayWindow: 0.85, captureRefund: 16, chainWindow: 6, ward: false };
    state.player = { x: W / 2, y: H / 2, vx: 0, vy: 0, facing: -Math.PI / 2, invulnerable: 1.1, wing: 0 };
    ui.hud.classList.remove('is-hidden');
    closeDialogs(canvas);
    beginPhase(0);
  }

  function beginPhase(index) {
    if (state.anchors.length) {
      state.anchors.filter((a) => a.awakened).forEach((a) => {
        state.wildBlooms.push({ x: a.x, y: a.y, hue: a.hue, size: 0.7 + random() * 0.45, age: 10 });
      });
    }

    state.phaseIndex = index;
    state.phaseProgress = 0;
    state.phaseTarget = phaseDefs[index].target;
    state.phaseTime = phaseDefs[index].time;
    state.anchors = generateAnchors(phaseDefs[index].anchorCount, index === 0);
    state.enemies = [];
    state.chain = [];
    state.frayTimer = 0;
    state.weaveAge = 0;
    state.spawnTimer = phaseDefs[index].spawnInterval * 0.65;
    state.player.x = W / 2;
    state.player.y = H / 2 + (index === 0 ? Math.min(120, H * 0.15) : 0);
    state.player.vx = 0;
    state.player.vy = 0;
    // Phase banners are readable, not a trap. The grace window outlasts the
    // title card so a player never loses a petal while learning the new threat.
    state.player.invulnerable = 3.2;
    state.lumen = state.maxLumen;
    state.tutorialStep = index === 0 ? 0 : state.tutorialStep;
    state.mode = 'playing';

    const initial = phaseDefs[index].initial;
    Object.keys(initial).forEach((type) => {
      for (let i = 0; i < initial[type]; i++) spawnEnemy(type, true);
    });
    if (phaseDefs[index].boss) spawnEnemy('boss', true);

    showPhaseBanner(phaseDefs[index]);
    updateObjective();
    updateHud();
  }

  function generateAnchors(count, tutorial) {
    const anchors = [];
    const top = Math.max(150, H * 0.18);
    const bottom = Math.max(95, H * 0.13);
    const side = Math.max(58, W * 0.055);
    const minDist = clamp(Math.min(W, H) * 0.145, 86, 132);

    if (tutorial) {
      const cx = W / 2;
      const cy = H / 2;
      const spreadX = Math.min(215, W * 0.18);
      const spreadY = Math.min(155, H * 0.21);
      [
        { x: cx - spreadX, y: cy + spreadY * 0.45 },
        { x: cx, y: cy - spreadY },
        { x: cx + spreadX, y: cy + spreadY * 0.45 }
      ].forEach((p, guide) => anchors.push(makeAnchor(p.x, p.y, guide)));
    }

    let attempts = 0;
    while (anchors.length < count && attempts < 900) {
      attempts++;
      const x = side + random() * Math.max(20, W - side * 2);
      const y = top + random() * Math.max(20, H - top - bottom);
      if (Math.hypot(x - W / 2, y - H / 2) < 92) continue;
      if (anchors.some((a) => Math.hypot(a.x - x, a.y - y) < minDist)) continue;
      anchors.push(makeAnchor(x, y, -1));
    }

    return anchors;
  }

  function makeAnchor(x, y, guide = -1) {
    return {
      id: nextId++,
      x,
      y,
      guide,
      radius: 27,
      touchCooldown: 0,
      awakened: false,
      bloom: 0,
      hue: 162 + Math.round(random() * 150),
      phase: random() * TAU
    };
  }

  function spawnEnemy(type, initial = false) {
    const margin = 46;
    let x;
    let y;
    if (initial) {
      let tries = 0;
      do {
        x = margin + random() * (W - margin * 2);
        y = Math.max(150, margin) + random() * (H - Math.max(150, margin) - 80);
        tries++;
      } while (Math.hypot(x - state.player.x, y - state.player.y) < 190 && tries < 40);
    } else {
      const edge = Math.floor(random() * 4);
      if (edge === 0) { x = margin; y = 130 + random() * (H - 210); }
      if (edge === 1) { x = W - margin; y = 130 + random() * (H - 210); }
      if (edge === 2) { x = margin + random() * (W - margin * 2); y = 135; }
      if (edge === 3) { x = margin + random() * (W - margin * 2); y = H - 68; }
    }

    const data = {
      drifter: { radius: 17, speed: 45 + random() * 18 },
      seeker: { radius: 19, speed: 58 + random() * 14 },
      rusher: { radius: 20, speed: 42 + random() * 9 },
      boss: { radius: 61, speed: 27 }
    }[type];

    state.enemies.push({
      id: nextId++,
      type,
      x,
      y,
      vx: (random() - 0.5) * 40,
      vy: (random() - 0.5) * 40,
      radius: data.radius,
      speed: data.speed,
      phase: random() * TAU,
      age: random() * 4,
      frayCooldown: 0,
      chargeCooldown: 1.8 + random() * 2.4,
      chargeState: 'idle',
      chargeTimer: 0,
      chargeX: 0,
      chargeY: 0,
      hp: type === 'boss' ? 3 : 1,
      invulnerable: 0,
      dead: false
    });
  }

  function chooseSpawnType() {
    const phase = state.phaseIndex;
    const roll = random();
    if (phase >= 3 && roll < 0.2) return 'rusher';
    if (phase >= 2 && roll < (phase === 2 ? 0.32 : 0.46)) return 'seeker';
    return 'drifter';
  }

  function showPhaseBanner(def) {
    ui.phaseBannerKicker.textContent = def.kicker;
    ui.phaseBannerTitle.textContent = def.title;
    ui.phaseBannerSubtitle.textContent = def.subtitle;
    ui.phaseBanner.classList.add('is-visible');
    state.phaseIntroTimer = 2.45;
  }

  function showToast(message, warning = false, duration = 2.2) {
    ui.toast.textContent = message;
    ui.toast.classList.toggle('is-warning', warning);
    ui.toast.classList.add('is-visible');
    state.toastTimer = duration;
  }

  function update(dt) {
    state.player.wing += dt * (reducedMotion ? 2 : 11);
    state.fireflies.forEach((f) => {
      if (reducedMotion) {
        f.x = f.baseX;
        f.y = f.baseY;
      } else {
        f.phase += dt * f.speed;
        f.x = f.baseX + Math.sin(f.phase * 1.31) * 25;
        f.y = f.baseY + Math.cos(f.phase) * 16;
      }
    });

    if (state.toastTimer > 0) {
      state.toastTimer -= dt;
      if (state.toastTimer <= 0) ui.toast.classList.remove('is-visible');
    }

    if (state.phaseIntroTimer > 0) {
      state.phaseIntroTimer -= dt;
      if (state.phaseIntroTimer <= 0) ui.phaseBanner.classList.remove('is-visible');
    }

    updateParticles(dt);
    updateFloaters(dt);

    if (state.mode === 'playing') {
      state.runTime += dt;
      updatePlaying(dt);
      audio.update();
    } else if (state.mode === 'transition') {
      updateEnemies(dt * 0.22, false);
      state.transitionTimer -= dt;
      if (state.phaseIndex === phaseDefs.length - 1) state.dawn = clamp(state.dawn + dt * 0.42, 0, 1);
      if (state.transitionTimer <= 0) {
        if (state.phaseIndex === 0) beginPhase(1);
        else if (state.phaseIndex < phaseDefs.length - 1) showBlessings();
        else finishRun(true);
      }
    } else if (state.mode === 'result' && state.completed) {
      state.dawn = clamp(state.dawn + dt * 0.12, 0, 1);
    }

    state.shake = Math.max(0, state.shake - dt * 30);
    state.flash = Math.max(0, state.flash - dt * 2.8);
    state.invalidFlash = Math.max(0, state.invalidFlash - dt);
    updateHud();
  }

  function updatePlaying(dt) {
    const def = phaseDefs[state.phaseIndex];
    updatePlayer(dt);
    updateAnchors(dt);
    updateWeave(dt);
    updateEnemies(dt, true);

    if (Number.isFinite(state.phaseTime) && state.phaseIndex > 0 && state.phaseIndex < 4) {
      state.phaseTime -= dt;
      if (state.phaseTime <= 0) handleMoonfall();
    }

    state.spawnTimer -= dt;
    const nonBossCount = state.enemies.filter((e) => e.type !== 'boss' && !e.dead).length;
    if (state.spawnTimer <= 0 && nonBossCount < def.maxEnemies) {
      spawnEnemy(chooseSpawnType(), false);
      state.spawnTimer = def.spawnInterval * (0.78 + random() * 0.42);
    }
  }

  function updatePlayer(dt) {
    const p = state.player;
    p.invulnerable = Math.max(0, p.invulnerable - dt);
    let dx = 0;
    let dy = 0;
    if (input.keys.has('w') || input.keys.has('arrowup')) dy -= 1;
    if (input.keys.has('s') || input.keys.has('arrowdown')) dy += 1;
    if (input.keys.has('a') || input.keys.has('arrowleft')) dx -= 1;
    if (input.keys.has('d') || input.keys.has('arrowright')) dx += 1;

    const usingKeys = dx !== 0 || dy !== 0;
    if (!usingKeys && input.pointerActive && performance.now() - input.lastKeyboard > 350) {
      const pdx = input.x - p.x;
      const pdy = input.y - p.y;
      if (Math.hypot(pdx, pdy) > 18) {
        dx = pdx;
        dy = pdy;
      }
    }

    const nearest = state.chain.length ? nearestAvailableAnchor(78) : null;
    if (nearest && (dx || dy)) {
      const magnet = clamp(1 - distance(p, nearest) / 78, 0, 1) * 0.52;
      const mdx = nearest.x - p.x;
      const mdy = nearest.y - p.y;
      const ml = Math.hypot(mdx, mdy) || 1;
      dx += mdx / ml * magnet;
      dy += mdy / ml * magnet;
    }

    const length = Math.hypot(dx, dy);
    const accel = 890;
    const maxSpeed = 235 * state.upgrades.speed * (state.chain.length ? 1.08 : 1);
    if (length > 0) {
      dx /= length;
      dy /= length;
      p.vx += dx * accel * dt;
      p.vy += dy * accel * dt;
    } else {
      const drag = Math.exp(-5.8 * dt);
      p.vx *= drag;
      p.vy *= drag;
    }

    const speed = Math.hypot(p.vx, p.vy);
    if (speed > maxSpeed) {
      p.vx = p.vx / speed * maxSpeed;
      p.vy = p.vy / speed * maxSpeed;
    }
    if (speed > 8) {
      const targetFacing = Math.atan2(p.vy, p.vx);
      let turn = ((targetFacing - p.facing + Math.PI * 3) % TAU) - Math.PI;
      p.facing += turn * Math.min(1, dt * 9);
    }

    p.x += p.vx * dt;
    p.y += p.vy * dt;
    const margin = 26;
    const top = 124;
    if (p.x < margin) { p.x = margin; p.vx = Math.abs(p.vx) * 0.35; }
    if (p.x > W - margin) { p.x = W - margin; p.vx = -Math.abs(p.vx) * 0.35; }
    if (p.y < top) { p.y = top; p.vy = Math.abs(p.vy) * 0.35; }
    if (p.y > H - margin) { p.y = H - margin; p.vy = -Math.abs(p.vy) * 0.35; }

    if (speed > 65 && random() < dt * 18) {
      addParticle(p.x - Math.cos(p.facing) * 13, p.y - Math.sin(p.facing) * 13, {
        color: random() > 0.4 ? '#ffd977' : '#73e8d2',
        size: 1.6 + random() * 2.2,
        life: 0.35 + random() * 0.35,
        vx: -p.vx * 0.1 + (random() - 0.5) * 24,
        vy: -p.vy * 0.1 + (random() - 0.5) * 24
      });
    }
  }

  function updateAnchors(dt) {
    for (const anchor of state.anchors) {
      anchor.phase += dt * 1.4;
      anchor.touchCooldown = Math.max(0, anchor.touchCooldown - dt);
      if (anchor.awakened) anchor.bloom = Math.min(1, anchor.bloom + dt * 2.8);
    }

    if (!state.chain.length) return;
    for (const anchor of state.anchors) {
      if (anchor.touchCooldown > 0 || distance(state.player, anchor) > anchor.radius + 10) continue;
      const firstId = state.chain[0];
      const lastId = state.chain[state.chain.length - 1];
      if (anchor.id === lastId) continue;
      if (anchor.id === firstId && state.chain.length >= 3) {
        tryCloseWeave();
        anchor.touchCooldown = 0.55;
        break;
      }
      if (!state.chain.includes(anchor.id)) {
        pinAnchor(anchor);
        anchor.touchCooldown = 0.45;
        break;
      }
    }
  }

  function nearestAvailableAnchor(radius) {
    let nearest = null;
    let best = radius;
    for (const anchor of state.anchors) {
      if (state.chain.length && state.chain.includes(anchor.id) && anchor.id !== state.chain[0]) continue;
      const d = distance(state.player, anchor);
      if (d < best) { best = d; nearest = anchor; }
    }
    return nearest;
  }

  function toggleWeave() {
    if (state.mode !== 'playing') return;
    if (state.chain.length) {
      cancelWeave('Thread released.', false);
      return;
    }
    const anchor = nearestAvailableAnchor(66);
    if (!anchor) {
      showToast('Glide closer to a flower to begin.', false, 1.6);
      audio.tone(174.61, 0.18, 0.025, 'sine');
      return;
    }
    state.chain = [anchor.id];
    state.weaveAge = 0;
    state.cleanWeave = true;
    state.frayTimer = 0;
    anchor.touchCooldown = 0.55;
    audio.pin(0);
    burst(anchor.x, anchor.y, '#ffd977', 10, 75);
    addFloater(anchor.x, anchor.y - 33, 'FIRST LIGHT', '#ffd977');
    if (state.phaseIndex === 0) state.tutorialStep = 1;
    updateObjective();
  }

  function pinAnchor(anchor) {
    const last = anchorById(state.chain[state.chain.length - 1]);
    if (!last || wouldCross(last, anchor, false)) {
      state.invalidFlash = 0.32;
      showToast('The loom cannot hold a crossed thread.', true, 1.7);
      audio.tone(146.83, 0.22, 0.03, 'square');
      return;
    }
    state.chain.push(anchor.id);
    state.lumen = Math.max(0, state.lumen - 1.5);
    audio.pin(state.chain.length - 1);
    burst(anchor.x, anchor.y, state.chain.length === 3 ? '#ffd977' : '#73e8d2', 8, 62);
    addFloater(anchor.x, anchor.y - 30, String(state.chain.length), '#fff8da');
    if (state.phaseIndex === 0) state.tutorialStep = state.chain.length >= 3 ? 2 : 1;
    updateObjective();
  }

  function tryCloseWeave() {
    const last = anchorById(state.chain[state.chain.length - 1]);
    const first = anchorById(state.chain[0]);
    if (!last || !first) return;
    if (wouldCross(last, first, true)) {
      state.invalidFlash = 0.38;
      showToast('That closing stitch would cross the weave.', true, 1.8);
      audio.tone(138.59, 0.25, 0.035, 'square');
      return;
    }

    const polygon = state.chain.map(anchorById).filter(Boolean).map((a) => ({ x: a.x, y: a.y }));
    if (Math.abs(polygonArea(polygon)) < 3200) {
      showToast('Give the light a little more room.', true, 1.5);
      return;
    }
    sealWeave(polygon);
  }

  function sealWeave(polygon) {
    const now = state.runTime;
    const chainWasAlive = now - state.lastLoopAt <= state.upgrades.chainWindow;
    state.comboStack = chainWasAlive ? Math.min(6, state.comboStack + 1) : 0;
    const chainMultiplier = 1 + state.comboStack * 0.25;
    const caught = [];
    let bossHit = false;

    for (const enemy of state.enemies) {
      if (enemy.dead || !pointInPolygon(enemy, polygon)) continue;
      if (enemy.type === 'boss') {
        if (enemy.invulnerable <= 0) {
          bossHit = true;
          enemy.hp--;
          enemy.invulnerable = 2.35;
          state.phaseProgress = 3 - enemy.hp;
          state.score += Math.round(650 * chainMultiplier);
          state.wildBlooms.push({ x: enemy.x, y: enemy.y, hue: 44 + enemy.hp * 48, size: 2.1, age: 0 });
          burst(enemy.x, enemy.y, '#ffd977', 48, 260);
          burst(enemy.x, enemy.y, '#73e8d2', 28, 210);
          addFloater(enemy.x, enemy.y - 75, enemy.hp > 0 ? `HOLLOW RING ${3 - enemy.hp} / 3` : 'THE HOLLOW OPENS', '#ffd977', 1.35);
          for (let i = 0; i < 2; i++) spawnEnemy(i ? 'seeker' : 'drifter', false);
          state.shake = reducedMotion ? 0 : 15;
          state.flash = 0.7;
        }
      } else {
        enemy.dead = true;
        caught.push(enemy);
      }
    }

    const catchMultiplier = caught.length >= 5 ? 3.5 : caught.length === 4 ? 2.75 : caught.length === 3 ? 2 : caught.length === 2 ? 1.5 : 1;
    let captureScore = 0;
    let progressGain = 0;
    for (const enemy of caught) {
      const values = enemy.type === 'rusher' ? [250, 3] : enemy.type === 'seeker' ? [175, 2] : [100, 1];
      captureScore += values[0];
      progressGain += values[1];
      state.wildBlooms.push({ x: enemy.x, y: enemy.y, hue: 145 + random() * 190, size: 0.8 + random() * 0.7, age: 0 });
      burst(enemy.x, enemy.y, enemy.type === 'rusher' ? '#ffad62' : enemy.type === 'seeker' ? '#ff769d' : '#73e8d2', 14, 145);
    }

    let newBlooms = 0;
    for (const id of state.chain) {
      const anchor = anchorById(id);
      if (anchor && !anchor.awakened) {
        anchor.awakened = true;
        anchor.bloom = 0;
        newBlooms++;
      }
    }

    const cleanBonus = caught.length && state.cleanWeave ? 150 : 0;
    const baseScore = 80 + newBlooms * 45;
    const awarded = Math.round((baseScore + captureScore * catchMultiplier + cleanBonus) * chainMultiplier);
    state.score += awarded;
    state.loops++;
    state.shadows += caught.length;
    state.lastLoopAt = now;
    state.lumen = Math.min(state.maxLumen, state.lumen + state.upgrades.captureRefund + caught.length * 3);
    state.regions.push({
      points: polygon.map((p) => ({ ...p })),
      hue: 154 + random() * 170,
      age: 0,
      strength: clamp(0.18 + caught.length * 0.025, 0.18, 0.34)
    });

    if (state.phaseIndex === 0) {
      state.phaseProgress = 1;
      state.tutorialStep = 3;
    } else if (!phaseDefs[state.phaseIndex].boss) {
      state.phaseProgress += progressGain + (newBlooms > 0 ? 1 : 0);
    }

    audio.close(caught.length, state.cleanWeave);
    const center = polygonCentroid(polygon);
    const label = caught.length
      ? `${caught.length} SHADOW${caught.length === 1 ? '' : 'S'} BLOOMED  +${formatNumber(awarded)}`
      : `CLEAN LOOP  +${formatNumber(awarded)}`;
    addFloater(center.x, center.y, label, caught.length >= 3 ? '#ffd977' : '#fff8da', 1.15);
    if (cleanBonus) setTimeout(() => {
      if (state.mode === 'playing') addFloater(center.x, center.y + 22, 'CLEAN WEAVE +150', '#73e8d2', 0.9);
    }, 120);
    burst(center.x, center.y, '#ffd977', 18 + caught.length * 5, 190);
    state.shake = reducedMotion ? 0 : Math.min(12, 3 + caught.length * 2.2);
    state.flash = Math.min(0.42, 0.1 + caught.length * 0.04);

    state.enemies = state.enemies.filter((e) => !e.dead);
    clearWeave();
    updateObjective();

    if (phaseDefs[state.phaseIndex].boss && bossHit) {
      const boss = state.enemies.find((e) => e.type === 'boss');
      if (boss && boss.hp <= 0) {
        boss.dead = true;
        state.enemies = state.enemies.filter((e) => !e.dead);
        completePhase();
      } else {
        showToast('The Hollow recoils. Weave it again.', false, 2.3);
      }
    } else if (state.phaseProgress >= state.phaseTarget) {
      completePhase();
    }
  }

  function updateWeave(dt) {
    if (!state.chain.length) {
      state.lumen = Math.min(state.maxLumen, state.lumen + dt * 19);
      state.frayTimer = 0;
      return;
    }

    state.weaveAge += dt;
    const length = totalThreadLength();
    const drain = 2.8 + length / 185;
    state.lumen = Math.max(0, state.lumen - dt * drain);

    if (state.frayTimer > 0) {
      state.frayTimer -= dt;
      if (state.frayTimer <= 0) {
        cancelWeave('The thread came apart—but no petal was lost.', true);
        state.comboStack = 0;
        state.lumen = Math.max(18, state.lumen - 12);
        return;
      }
    }

    if (state.lumen <= 0) {
      cancelWeave('The loomwing needs a breath of lumen.', true);
      state.comboStack = 0;
      return;
    }
  }

  function clearWeave() {
    state.chain = [];
    state.frayTimer = 0;
    state.weaveAge = 0;
    state.cleanWeave = true;
    updateObjective();
  }

  function cancelWeave(message, warning) {
    if (!state.chain.length) return;
    const last = anchorById(state.chain[state.chain.length - 1]);
    if (last) burst(last.x, last.y, warning ? '#ff769d' : '#b7b3d0', 10, 90);
    clearWeave();
    showToast(message, warning, warning ? 2.2 : 1.25);
    if (warning) audio.fray();
    else audio.tone(196, 0.25, 0.025, 'sine');
  }

  function totalThreadLength() {
    const segments = getThreadSegments();
    return segments.reduce((sum, s) => sum + Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y), 0);
  }

  function getThreadSegments() {
    if (!state.chain.length) return [];
    const result = [];
    for (let i = 0; i < state.chain.length - 1; i++) {
      const a = anchorById(state.chain[i]);
      const b = anchorById(state.chain[i + 1]);
      if (a && b) result.push({ a, b });
    }
    const last = anchorById(state.chain[state.chain.length - 1]);
    if (last) result.push({ a: last, b: state.player, live: true });
    return result;
  }

  function wouldCross(a, b, closing) {
    if (state.chain.length < 2) return false;
    const fixed = [];
    for (let i = 0; i < state.chain.length - 1; i++) {
      fixed.push({ a: anchorById(state.chain[i]), b: anchorById(state.chain[i + 1]), index: i });
    }
    for (const segment of fixed) {
      if (!segment.a || !segment.b) continue;
      if (segment.a.id === a.id || segment.b.id === a.id || segment.a.id === b.id || segment.b.id === b.id) continue;
      if (segmentsIntersect(a, b, segment.a, segment.b)) return true;
    }
    if (closing && state.chain.length >= 4) {
      for (let i = 1; i < fixed.length - 1; i++) {
        if (segmentsIntersect(a, b, fixed[i].a, fixed[i].b)) return true;
      }
    }
    return false;
  }

  function segmentsIntersect(a, b, c, d) {
    const cross = (p, q, r) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
    const abC = cross(a, b, c);
    const abD = cross(a, b, d);
    const cdA = cross(c, d, a);
    const cdB = cross(c, d, b);
    return ((abC > 0 && abD < 0) || (abC < 0 && abD > 0)) && ((cdA > 0 && cdB < 0) || (cdA < 0 && cdB > 0));
  }

  function polygonArea(points) {
    let sum = 0;
    for (let i = 0; i < points.length; i++) {
      const a = points[i];
      const b = points[(i + 1) % points.length];
      sum += a.x * b.y - b.x * a.y;
    }
    return sum / 2;
  }

  function polygonCentroid(points) {
    let x = 0;
    let y = 0;
    points.forEach((p) => { x += p.x; y += p.y; });
    return { x: x / points.length, y: y / points.length };
  }

  function pointInPolygon(point, polygon) {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const xi = polygon[i].x;
      const yi = polygon[i].y;
      const xj = polygon[j].x;
      const yj = polygon[j].y;
      const intersects = ((yi > point.y) !== (yj > point.y)) &&
        (point.x < (xj - xi) * (point.y - yi) / ((yj - yi) || 0.00001) + xi);
      if (intersects) inside = !inside;
    }
    return inside;
  }

  function anchorById(id) {
    return state.anchors.find((a) => a.id === id);
  }

  function nearestPointOnSegments(point, segments) {
    let best = null;
    let bestDist = Infinity;
    for (const segment of segments) {
      const abx = segment.b.x - segment.a.x;
      const aby = segment.b.y - segment.a.y;
      const denominator = abx * abx + aby * aby || 1;
      const t = clamp(((point.x - segment.a.x) * abx + (point.y - segment.a.y) * aby) / denominator, 0, 1);
      const candidate = { x: segment.a.x + abx * t, y: segment.a.y + aby * t };
      const d = distance(point, candidate);
      if (d < bestDist) { bestDist = d; best = candidate; }
    }
    return best ? { ...best, distance: bestDist } : null;
  }

  function updateEnemies(dt, collisions) {
    const threadSegments = getThreadSegments();
    for (const enemy of state.enemies) {
      if (enemy.dead) continue;
      enemy.age += dt;
      enemy.phase += dt * (enemy.type === 'rusher' ? 2.1 : 1.1);
      enemy.invulnerable = Math.max(0, enemy.invulnerable - dt);
      enemy.frayCooldown = Math.max(0, enemy.frayCooldown - dt);

      let targetX = state.player.x;
      let targetY = state.player.y;
      let desiredSpeed = enemy.speed;

      if (enemy.type === 'drifter') {
        targetX += Math.cos(enemy.phase * 1.7) * 125;
        targetY += Math.sin(enemy.phase * 1.3) * 110;
        desiredSpeed *= state.phaseIndex === 0 ? 0.55 : 0.8;
      } else if (enemy.type === 'seeker') {
        const nearest = threadSegments.length ? nearestPointOnSegments(enemy, threadSegments) : null;
        if (nearest) {
          targetX = nearest.x;
          targetY = nearest.y;
          desiredSpeed *= 1.18;
        }
      } else if (enemy.type === 'rusher') {
        updateRusher(enemy, dt);
        if (enemy.chargeState === 'charge') {
          enemy.x += enemy.vx * dt;
          enemy.y += enemy.vy * dt;
          confineEnemy(enemy);
          if (collisions) checkEnemyCollision(enemy, threadSegments);
          continue;
        }
        desiredSpeed *= enemy.chargeState === 'telegraph' ? 0.15 : 0.65;
      } else if (enemy.type === 'boss') {
        targetX += Math.cos(enemy.phase * 0.6) * 90;
        targetY += Math.sin(enemy.phase * 0.8) * 70;
        desiredSpeed = 23 + (3 - enemy.hp) * 8;
      }

      const dx = targetX - enemy.x;
      const dy = targetY - enemy.y;
      const length = Math.hypot(dx, dy) || 1;
      const steer = enemy.type === 'boss' ? 1.1 : 2.1;
      enemy.vx = lerp(enemy.vx, dx / length * desiredSpeed, Math.min(1, dt * steer));
      enemy.vy = lerp(enemy.vy, dy / length * desiredSpeed, Math.min(1, dt * steer));
      enemy.x += enemy.vx * dt;
      enemy.y += enemy.vy * dt;
      confineEnemy(enemy);
      if (collisions) checkEnemyCollision(enemy, threadSegments);
    }
    state.enemies = state.enemies.filter((e) => !e.dead);
  }

  function updateRusher(enemy, dt) {
    if (enemy.chargeState === 'idle') {
      enemy.chargeCooldown -= dt;
      if (enemy.chargeCooldown <= 0) {
        enemy.chargeState = 'telegraph';
        enemy.chargeTimer = 0.82;
        const dx = state.player.x - enemy.x;
        const dy = state.player.y - enemy.y;
        const length = Math.hypot(dx, dy) || 1;
        enemy.chargeX = dx / length;
        enemy.chargeY = dy / length;
        audio.tone(155.56, 0.56, 0.035, 'sawtooth');
      }
    } else if (enemy.chargeState === 'telegraph') {
      enemy.chargeTimer -= dt;
      if (enemy.chargeTimer <= 0) {
        enemy.chargeState = 'charge';
        enemy.chargeTimer = 0.62;
        enemy.vx = enemy.chargeX * 330;
        enemy.vy = enemy.chargeY * 330;
        audio.noise(0.1, 0.025, 500);
      }
    } else {
      enemy.chargeTimer -= dt;
      if (enemy.chargeTimer <= 0) {
        enemy.chargeState = 'idle';
        enemy.chargeCooldown = 2.2 + random() * 1.8;
        enemy.vx *= 0.2;
        enemy.vy *= 0.2;
      }
    }
  }

  function confineEnemy(enemy) {
    const margin = enemy.radius + 18;
    const top = 125 + enemy.radius;
    if (enemy.x < margin) { enemy.x = margin; enemy.vx = Math.abs(enemy.vx); }
    if (enemy.x > W - margin) { enemy.x = W - margin; enemy.vx = -Math.abs(enemy.vx); }
    if (enemy.y < top) { enemy.y = top; enemy.vy = Math.abs(enemy.vy); }
    if (enemy.y > H - margin) { enemy.y = H - margin; enemy.vy = -Math.abs(enemy.vy); }
  }

  function checkEnemyCollision(enemy, segments) {
    const playerHitDistance = enemy.radius + 12;
    // Tutorial shadows are deliberately harmless: the first minute should teach
    // the weave without punishing a player who pauses to read the objective.
    if (state.phaseIndex !== 0 && state.player.invulnerable <= 0 && distance(enemy, state.player) < playerHitDistance) {
      hitPlayer(enemy);
      return;
    }
    if (enemy.type === 'seeker' && state.chain.length && state.frayTimer <= 0 && enemy.frayCooldown <= 0) {
      const nearest = nearestPointOnSegments(enemy, segments);
      if (nearest && nearest.distance < enemy.radius + 5) {
        state.frayTimer = state.upgrades.frayWindow;
        state.frayMax = state.frayTimer;
        state.cleanWeave = false;
        enemy.frayCooldown = 2.5;
        showToast('THREAD FRAYING — close the loop!', true, state.frayTimer + 0.25);
        audio.fray();
        state.shake = reducedMotion ? 0 : 3;
      }
    }
  }

  function hitPlayer(enemy) {
    const dx = state.player.x - enemy.x;
    const dy = state.player.y - enemy.y;
    const length = Math.hypot(dx, dy) || 1;
    state.player.vx = dx / length * 300;
    state.player.vy = dy / length * 300;
    state.player.invulnerable = 1.65;
    burst(state.player.x, state.player.y, '#ff769d', 24, 190);
    state.shake = reducedMotion ? 0 : 12;
    state.flash = 0.72;
    audio.hit();
    if (state.chain.length) clearWeave();

    if (state.upgrades.ward) {
      state.upgrades.ward = false;
      showToast('Your Petal Ward held.', false, 2);
      addFloater(state.player.x, state.player.y - 38, 'WARD', '#73e8d2');
      return;
    }

    state.lives--;
    showToast(state.lives > 0 ? 'A petal falls. Keep weaving.' : 'The last petal falls.', true, 2.2);
    if (state.lives <= 0) finishRun(false);
  }

  function handleMoonfall() {
    if (state.upgrades.ward) {
      state.upgrades.ward = false;
      showToast('Your ward held back the fading moon.', false, 2.2);
    } else {
      state.lives--;
      audio.hit();
      state.flash = 0.7;
      showToast('Moonlight fades. One petal falls—but the path grows kinder.', true, 2.8);
    }
    const remaining = Math.max(1, state.phaseTarget - state.phaseProgress);
    state.phaseTarget = state.phaseProgress + Math.max(1, Math.ceil(remaining * 0.72));
    state.phaseTime = 48;
    if (state.chain.length) clearWeave();
    if (state.lives <= 0) finishRun(false);
  }

  function completePhase() {
    if (state.mode !== 'playing') return;
    clearWeave();
    state.mode = 'transition';
    state.transitionTimer = state.phaseIndex === phaseDefs.length - 1 ? 2.8 : 1.65;
    state.phaseProgress = state.phaseTarget;
    state.score += 500 + state.phaseIndex * 250;
    audio.close(5, true);
    showToast(state.phaseIndex === phaseDefs.length - 1 ? 'DAWN.' : `${phaseDefs[state.phaseIndex].title} blooms complete.`, false, 2.1);
    if (state.phaseIndex === phaseDefs.length - 1) {
      for (let i = 0; i < 90; i++) {
        addParticle(random() * W, H + random() * 100, {
          color: random() > 0.45 ? '#ffd977' : '#73e8d2',
          size: 2 + random() * 4,
          life: 2.2 + random() * 2,
          vx: (random() - 0.5) * 60,
          vy: -80 - random() * 180,
          gravity: -6
        });
      }
    }
  }

  function showBlessings() {
    state.mode = 'blessing';
    const pool = [...blessingDefs];
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    const choices = pool.slice(0, 3);
    ui.blessingChoices.innerHTML = '';
    choices.forEach((blessing) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'blessing-card';
      button.innerHTML = `<span class="blessing-symbol" aria-hidden="true">${blessing.symbol}</span><strong>${blessing.name}</strong><small>${blessing.copy}</small>`;
      button.addEventListener('click', () => chooseBlessing(blessing));
      ui.blessingChoices.appendChild(button);
    });
    openDialog(ui.blessingOverlay, ui.blessingChoices.querySelector('button'));
  }

  function chooseBlessing(blessing) {
    if (state.mode !== 'blessing') return;
    if (blessing.id === 'longer') {
      state.maxLumen += 25;
      state.lumen = state.maxLumen;
    } else if (blessing.id === 'golden') {
      state.upgrades.frayWindow += 0.4;
    } else if (blessing.id === 'quickwing') {
      state.upgrades.speed += 0.12;
    } else if (blessing.id === 'nectar') {
      state.upgrades.captureRefund += 10;
    } else if (blessing.id === 'ward') {
      state.upgrades.ward = true;
    } else if (blessing.id === 'echo') {
      state.upgrades.chainWindow += 2;
    }
    closeDialogs(canvas);
    audio.pin(5);
    showToast(`${blessing.name} received.`, false, 1.8);
    beginPhase(state.phaseIndex + 1);
  }

  function finishRun(victory) {
    if (state.mode === 'result') return;
    state.completed = victory;
    state.mode = 'result';
    clearWeave();
    const previousBest = state.best;
    state.best = Math.max(state.best, Math.round(state.score));
    if (state.best > previousBest) writeBest(state.best);
    const rank = getRank(victory, state.score);

    postToGrove('run-complete', {
      victory: Boolean(victory),
      score: Math.round(state.score),
      best: Math.round(state.best),
      rank,
      stats: {
        loops: state.loops,
        shadows: state.shadows,
        phase: state.phaseIndex
      },
      assist: { preset: 'standard', scoreChanging: false }
    });

    ui.resultSymbol.textContent = victory ? '✦' : '◇';
    ui.resultKicker.textContent = victory ? 'DAWN REMEMBERS YOUR NAME' : 'THE GARDEN HOLDS YOUR LIGHT';
    ui.resultTitle.textContent = victory ? 'The garden wakes.' : 'The night was deep.';
    ui.resultCopy.textContent = victory
      ? 'Every closed thread became a place where morning could begin.'
      : 'Every flower you woke remains. The loomwing can always try another path.';
    ui.resultRank.textContent = rank;
    ui.resultScore.textContent = formatNumber(state.score);
    ui.resultBest.textContent = formatNumber(state.best);
    ui.resultLoops.textContent = String(state.loops);
    ui.resultShadows.textContent = String(state.shadows);
    if (isTrialRun) {
      ui.replayButton.disabled = true;
      ui.replayButton.querySelector('span').textContent = 'TRIAL RUN COMPLETE · CONTINUE IN THE GROVE';
      ui.replayButton.querySelector('i')?.setAttribute('hidden', '');
      ui.replayButton.setAttribute('aria-label', 'Trial run complete. Continue in the Grove.');
    }
    openDialog(ui.resultOverlay, isTrialRun ? null : ui.replayButton);
  }

  function getRank(victory, score) {
    if (victory && score >= 14000) return 'DAWN ARCHITECT';
    if (victory && score >= 9500) return 'MOONLOOM MASTER';
    if (victory) return 'NIGHT WEAVER';
    if (score >= 5500) return 'GOLDEN THREAD';
    if (score >= 2500) return 'LOOMWING';
    return 'FIRST FIREFLY';
  }

  function goHome() {
    audio.suspend();
    state.mode = 'title';
    ui.hud.classList.add('is-hidden');
    ui.startBest.textContent = `PERSONAL BEST · ${formatNumber(state.best)}`;
    openDialog(ui.startOverlay, ui.playButton);
  }

  function pauseGame() {
    if (state.mode !== 'playing' && state.mode !== 'transition') return;
    state.previousMode = state.mode;
    state.mode = 'paused';
    audio.suspend();
    openDialog(ui.pauseOverlay, ui.resumeButton);
  }

  function resumeGame() {
    if (state.mode !== 'paused') return;
    state.mode = state.previousMode || 'playing';
    audio.init();
    closeDialogs(canvas);
  }

  function updateObjective() {
    const phase = phaseDefs[state.phaseIndex];
    if (state.phaseIndex === 0) {
      if (!state.chain.length && state.phaseProgress === 0) {
        ui.objectiveText.textContent = 'Glide to a flower and take up the thread';
        ui.objectiveProgress.textContent = 'SPACE / CLICK';
      } else if (state.chain.length < 3 && state.phaseProgress === 0) {
        ui.objectiveText.textContent = `Touch ${3 - state.chain.length} more flower${3 - state.chain.length === 1 ? '' : 's'} to pin the loom`;
        ui.objectiveProgress.textContent = `${state.chain.length} / 3`;
      } else if (state.phaseProgress === 0) {
        ui.objectiveText.textContent = 'Return to the golden first flower';
        ui.objectiveProgress.textContent = 'SEAL IT';
      } else {
        ui.objectiveText.textContent = 'The first part of the garden remembers';
        ui.objectiveProgress.textContent = '1 / 1';
      }
      ui.objectiveKicker.textContent = 'THE FIRST THREAD';
    } else if (phase.boss) {
      ui.objectiveKicker.textContent = 'CLOSE THE DARKNESS THREE TIMES';
      ui.objectiveText.textContent = state.phaseProgress === 0 ? 'Enclose the Hollow in a sealed weave' : 'Its shell is cracked. Weave it again.';
      ui.objectiveProgress.textContent = `${state.phaseProgress} / 3`;
    } else {
      const time = Math.max(0, Math.ceil(state.phaseTime));
      ui.objectiveKicker.textContent = `GATHER BLOOMLIGHT · ${Math.floor(time / 60)}:${String(time % 60).padStart(2, '0')}`;
      ui.objectiveText.textContent = 'Seal shadows and wake new flowers';
      ui.objectiveProgress.textContent = `${Math.min(state.phaseProgress, state.phaseTarget)} / ${state.phaseTarget}`;
    }
  }

  function updateHud() {
    ui.phaseName.textContent = phaseDefs[state.phaseIndex]?.title || 'LUMENLOOM';
    ui.scoreValue.textContent = formatNumber(state.score);
    ui.bestValue.textContent = `BEST ${formatNumber(Math.max(state.best, state.score))}`;
    const lumenPercent = clamp(state.lumen / state.maxLumen * 100, 0, 100);
    ui.lumenFill.style.width = `${lumenPercent}%`;
    ui.lumenFill.classList.toggle('is-low', lumenPercent < 24 || state.frayTimer > 0);
    ui.lumenValue.textContent = String(Math.round(state.lumen));
    [...ui.petalDisplay.children].forEach((petal, index) => petal.classList.toggle('is-lost', index >= state.lives));
    ui.healthValue.textContent = `${state.lives} / 3`;
    ui.petalDisplay.setAttribute('aria-label', `Health, ${state.lives} of 3 petals`);
    ui.wardIndicator.classList.toggle('is-hidden', !state.upgrades.ward);
    ui.weaveButtonLabel.textContent = state.chain.length ? 'RELEASE' : 'WEAVE';
    ui.weaveButton.classList.toggle('is-cancel', state.chain.length > 0);
    const multiplier = 1 + state.comboStack * 0.25;
    ui.comboBadge.classList.toggle('is-hidden', state.comboStack <= 0 || state.mode === 'title');
    ui.comboValue.textContent = `×${multiplier.toFixed(2).replace(/0$/, '')}`;
    const progress = state.phaseTarget ? clamp(state.phaseProgress / state.phaseTarget * 100, 0, 100) : 0;
    ui.objectiveFill.style.width = `${progress}%`;
    updateObjective();
  }

  function addParticle(x, y, options = {}) {
    if (state.particles.length > (reducedMotion ? 180 : 520)) state.particles.shift();
    state.particles.push({
      x,
      y,
      vx: options.vx ?? (random() - 0.5) * 80,
      vy: options.vy ?? (random() - 0.5) * 80,
      life: options.life ?? 0.7,
      maxLife: options.life ?? 0.7,
      size: options.size ?? 2.4,
      color: options.color ?? '#ffd977',
      gravity: options.gravity ?? 8,
      drag: options.drag ?? 0.985,
      shape: options.shape ?? (random() > 0.75 ? 'diamond' : 'circle')
    });
  }

  function burst(x, y, color, count, speed) {
    count = reducedMotion ? Math.ceil(count * 0.35) : count;
    for (let i = 0; i < count; i++) {
      const angle = random() * TAU;
      const velocity = speed * (0.28 + random() * 0.72);
      addParticle(x, y, {
        color,
        size: 1.5 + random() * 3.6,
        life: 0.42 + random() * 0.85,
        vx: Math.cos(angle) * velocity,
        vy: Math.sin(angle) * velocity,
        gravity: 10 + random() * 18
      });
    }
  }

  function updateParticles(dt) {
    for (const p of state.particles) {
      p.life -= dt;
      p.vx *= Math.pow(p.drag, dt * 60);
      p.vy = p.vy * Math.pow(p.drag, dt * 60) + p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    state.particles = state.particles.filter((p) => p.life > 0);
    state.regions.forEach((r) => { r.age += dt; });
    state.wildBlooms.forEach((b) => { b.age += dt; });
  }

  function addFloater(x, y, text, color = '#fff8da', duration = 1.05) {
    state.floaters.push({ x, y, text, color, life: duration, maxLife: duration });
  }

  function updateFloaters(dt) {
    for (const f of state.floaters) {
      f.life -= dt;
      f.y -= dt * 22;
    }
    state.floaters = state.floaters.filter((f) => f.life > 0);
  }

  function render() {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const shakeX = state.shake ? (random() - 0.5) * state.shake : 0;
    const shakeY = state.shake ? (random() - 0.5) * state.shake : 0;
    ctx.save();
    ctx.translate(shakeX, shakeY);
    drawBackground();
    drawRegions();
    drawWildBlooms();
    drawThread();
    drawAnchors();
    drawEnemies();
    if (state.mode !== 'title') drawPlayer();
    drawParticles();
    drawFloaters();
    ctx.restore();

    if (state.flash > 0) {
      ctx.save();
      ctx.globalAlpha = state.flash * 0.2;
      ctx.fillStyle = state.completed ? '#fff3bc' : '#ff769d';
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }
  }

  function drawBackground() {
    const phase = phaseDefs[state.phaseIndex] || phaseDefs[0];
    const palette = phase.palette;
    const gradient = ctx.createRadialGradient(W * 0.5, H * 0.42, 20, W * 0.5, H * 0.52, Math.max(W, H) * 0.76);
    const dawnTop = mixColor(palette[1], '#9d6f88', state.dawn);
    const dawnEdge = mixColor(palette[0], '#172b3d', state.dawn);
    gradient.addColorStop(0, dawnTop);
    gradient.addColorStop(0.55, palette[2]);
    gradient.addColorStop(1, dawnEdge);
    ctx.fillStyle = gradient;
    ctx.fillRect(-20, -20, W + 40, H + 40);

    const moonX = W * 0.82;
    const moonY = H * 0.16;
    const moonGlow = ctx.createRadialGradient(moonX, moonY, 0, moonX, moonY, Math.min(W, H) * 0.28);
    moonGlow.addColorStop(0, `rgba(255, 237, 183, ${0.11 + state.dawn * 0.16})`);
    moonGlow.addColorStop(0.18, 'rgba(206, 197, 255, .045)');
    moonGlow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = moonGlow;
    ctx.fillRect(0, 0, W, H);

    ctx.save();
    ctx.lineCap = 'round';
    for (const blade of state.grass) {
      const sway = reducedMotion ? 0 : Math.sin(state.runTime * 0.7 + blade.phase) * 0.12;
      ctx.globalAlpha = blade.alpha + state.dawn * 0.035;
      ctx.strokeStyle = blade.warm ? '#b9a56b' : '#7fb291';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(blade.x, blade.y + blade.length * 0.4);
      ctx.quadraticCurveTo(blade.x + (blade.angle + sway) * blade.length * 0.45, blade.y, blade.x + (blade.angle + sway) * blade.length, blade.y - blade.length * 0.55);
      ctx.stroke();
    }
    for (const stone of state.stones) {
      ctx.globalAlpha = stone.alpha;
      ctx.fillStyle = '#c8bfd2';
      ctx.beginPath();
      ctx.ellipse(stone.x, stone.y, stone.rx, stone.ry, stone.angle, 0, TAU);
      ctx.fill();
    }
    ctx.restore();

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const f of state.fireflies) {
      const alpha = 0.18 + (Math.sin(f.phase * 2.2) + 1) * 0.17;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = random() > 0.7 ? '#73e8d2' : '#ffd977';
      ctx.shadowColor = ctx.fillStyle;
      ctx.shadowBlur = 9;
      ctx.beginPath();
      ctx.arc(f.x, f.y, f.radius, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawRegions() {
    for (const region of state.regions) {
      const birth = clamp(region.age / 0.7, 0, 1);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = region.strength * easeOut(birth);
      ctx.fillStyle = `hsl(${region.hue} 78% 55%)`;
      ctx.strokeStyle = `hsl(${region.hue + 28} 88% 70%)`;
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      region.points.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y));
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha *= 1.6;
      ctx.stroke();
      ctx.restore();

      ctx.save();
      ctx.globalAlpha = 0.12 * birth;
      ctx.fillStyle = '#fff8da';
      const center = polygonCentroid(region.points);
      for (let i = 0; i < Math.min(12, region.points.length * 3); i++) {
        const a = region.points[i % region.points.length];
        const t = ((i * 0.618033) % 1) * 0.72;
        ctx.beginPath();
        ctx.arc(lerp(center.x, a.x, t), lerp(center.y, a.y, t), 1 + (i % 3), 0, TAU);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  function drawWildBlooms() {
    for (const bloom of state.wildBlooms) drawSmallBloom(bloom.x, bloom.y, bloom.hue, bloom.size, clamp(bloom.age / 0.55, 0, 1));
  }

  function drawSmallBloom(x, y, hue, size = 1, growth = 1) {
    const s = size * easeOut(growth);
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s, s);
    ctx.strokeStyle = 'rgba(97, 167, 126, .58)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(0, 5);
    ctx.quadraticCurveTo(3, 13, -1, 24);
    ctx.stroke();
    ctx.fillStyle = `hsl(${hue} 78% 68%)`;
    ctx.shadowColor = ctx.fillStyle;
    ctx.shadowBlur = 9;
    for (let i = 0; i < 5; i++) {
      const a = i / 5 * TAU - Math.PI / 2;
      ctx.beginPath();
      ctx.ellipse(Math.cos(a) * 6, Math.sin(a) * 6, 3.5, 6.5, a, 0, TAU);
      ctx.fill();
    }
    ctx.fillStyle = '#ffe9a0';
    ctx.beginPath();
    ctx.arc(0, 0, 3, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  function drawThread() {
    if (!state.chain.length) return;
    const segments = getThreadSegments();
    const fray = state.frayTimer > 0;
    const threadColor = fray ? '#ff769d' : state.invalidFlash > 0 ? '#ffad62' : '#ffe69a';

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    for (const width of [13, 5, 1.7]) {
      ctx.strokeStyle = threadColor;
      ctx.globalAlpha = width === 13 ? 0.08 : width === 5 ? 0.27 : 0.95;
      ctx.lineWidth = width;
      ctx.shadowColor = threadColor;
      ctx.shadowBlur = width === 1.7 ? 13 : 4;
      ctx.beginPath();
      const first = anchorById(state.chain[0]);
      if (!first) continue;
      ctx.moveTo(first.x, first.y);
      for (let i = 1; i < state.chain.length; i++) {
        const a = anchorById(state.chain[i]);
        if (a) ctx.lineTo(a.x, a.y);
      }
      ctx.lineTo(state.player.x, state.player.y);
      ctx.stroke();
    }

    if (state.chain.length >= 3) {
      const first = anchorById(state.chain[0]);
      if (first) {
        ctx.globalAlpha = reducedMotion ? 0.22 : 0.22 + Math.sin(state.runTime * 4) * 0.06;
        ctx.strokeStyle = '#ffd977';
        ctx.lineWidth = 1;
        ctx.setLineDash([5, 8]);
        ctx.beginPath();
        ctx.moveTo(state.player.x, state.player.y);
        ctx.lineTo(first.x, first.y);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    if (fray) {
      const ratio = clamp(state.frayTimer / state.frayMax, 0, 1);
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = '#ff769d';
      ctx.shadowColor = '#ff769d';
      ctx.shadowBlur = 14;
      segments.forEach((segment, index) => {
        const t = reducedMotion ? (index * 0.37) % 1 : (state.runTime * 5 + index * 0.37) % 1;
        const x = lerp(segment.a.x, segment.b.x, t);
        const y = lerp(segment.a.y, segment.b.y, t);
        ctx.beginPath();
        ctx.arc(x, y, 2 + (1 - ratio) * 3, 0, TAU);
        ctx.fill();
      });
    }
    ctx.restore();
  }

  function drawAnchors() {
    const firstId = state.chain[0];
    const hover = !state.chain.length ? nearestAvailableAnchor(66) : null;
    for (const anchor of state.anchors) {
      const activeIndex = state.chain.indexOf(anchor.id);
      const first = anchor.id === firstId;
      const highlighted = hover?.id === anchor.id;
      const pulse = 1 + Math.sin(anchor.phase * 2) * 0.05;
      ctx.save();
      ctx.translate(anchor.x, anchor.y);

      ctx.strokeStyle = anchor.awakened ? 'rgba(94, 181, 127, .75)' : 'rgba(94, 145, 116, .52)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, 8);
      ctx.quadraticCurveTo(7, 24, 0, 37);
      ctx.stroke();
      ctx.fillStyle = 'rgba(76, 143, 102, .52)';
      ctx.beginPath();
      ctx.ellipse(-5, 25, 7, 3.3, -0.45, 0, TAU);
      ctx.ellipse(5, 31, 6, 3, 0.45, 0, TAU);
      ctx.fill();

      if (anchor.awakened || activeIndex >= 0) {
        const growth = activeIndex >= 0 ? 1 : anchor.bloom;
        const s = pulse * easeOut(growth);
        ctx.scale(s, s);
        const color = first ? '#ffd977' : activeIndex >= 0 ? '#9df8e5' : `hsl(${anchor.hue} 78% 68%)`;
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = color;
        ctx.shadowColor = color;
        ctx.shadowBlur = first ? 24 : 14;
        for (let i = 0; i < 6; i++) {
          const angle = i / 6 * TAU - Math.PI / 2;
          ctx.beginPath();
          ctx.ellipse(Math.cos(angle) * 10, Math.sin(angle) * 10, 5, 10, angle, 0, TAU);
          ctx.fill();
        }
        ctx.fillStyle = '#fff1aa';
        ctx.beginPath();
        ctx.arc(0, 0, 4.3, 0, TAU);
        ctx.fill();
      } else {
        ctx.rotate(Math.sin(anchor.phase) * 0.05);
        ctx.fillStyle = highlighted ? '#d9c993' : '#706a86';
        ctx.shadowColor = highlighted ? '#ffd977' : '#7f77a8';
        ctx.shadowBlur = highlighted ? 16 : 6;
        ctx.beginPath();
        ctx.ellipse(-4, 0, 5, 11, -0.42, 0, TAU);
        ctx.ellipse(4, 0, 5, 11, 0.42, 0, TAU);
        ctx.fill();
      }

      if (first || highlighted || (state.phaseIndex === 0 && anchor.guide >= 0 && !state.chain.length)) {
        const ring = reducedMotion ? 31 : 31 + Math.sin(state.runTime * 4 + anchor.phase) * 4;
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = first ? 0.62 : 0.25;
        ctx.strokeStyle = first ? '#ffd977' : '#fff8da';
        ctx.lineWidth = first ? 1.5 : 1;
        ctx.beginPath();
        ctx.arc(0, 0, ring, 0, TAU);
        ctx.stroke();
      }

      if (activeIndex >= 0) {
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 0.86;
        ctx.fillStyle = '#10102c';
        ctx.beginPath();
        ctx.arc(19, -20, 8, 0, TAU);
        ctx.fill();
        ctx.fillStyle = '#fff8da';
        ctx.font = '700 11px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(activeIndex + 1), 19, -20);
      }
      ctx.restore();
    }
  }

  function drawEnemies() {
    for (const enemy of state.enemies) {
      if (enemy.dead) continue;
      if (enemy.type === 'boss') drawBoss(enemy);
      else drawShade(enemy);
    }
  }

  function drawShade(enemy) {
    const angle = Math.atan2(enemy.vy, enemy.vx);
    const color = enemy.type === 'seeker' ? '#ff769d' : enemy.type === 'rusher' ? '#ffad62' : '#73e8d2';
    ctx.save();
    ctx.translate(enemy.x, enemy.y);
    ctx.rotate(angle);
    ctx.globalAlpha = 0.94;

    if (enemy.type === 'rusher' && enemy.chargeState === 'telegraph') {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = reducedMotion ? 0.32 : 0.32 + Math.sin(state.runTime * 18) * 0.15;
      ctx.strokeStyle = '#ffad62';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(10, 0);
      ctx.lineTo(125, 0);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, 0, enemy.radius + 9, 0, TAU);
      ctx.stroke();
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 0.94;
    }

    const aura = ctx.createRadialGradient(0, 0, 2, 0, 0, enemy.radius * 1.65);
    aura.addColorStop(0, 'rgba(22, 16, 43, .9)');
    aura.addColorStop(0.55, 'rgba(17, 12, 37, .75)');
    aura.addColorStop(1, 'rgba(69, 43, 102, 0)');
    ctx.fillStyle = aura;
    ctx.beginPath();
    ctx.arc(0, 0, enemy.radius * 1.65, 0, TAU);
    ctx.fill();

    ctx.fillStyle = '#0b091b';
    ctx.strokeStyle = 'rgba(123, 91, 158, .38)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = i / 10 * TAU;
      const wobble = enemy.radius * (0.82 + Math.sin(enemy.phase * 3 + i * 1.9) * 0.13);
      const x = Math.cos(a) * wobble;
      const y = Math.sin(a) * wobble * 0.82;
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    if (enemy.type === 'seeker') {
      ctx.strokeStyle = '#18102a';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(-7, 11);
      ctx.quadraticCurveTo(-22, 20, -25, 7);
      ctx.moveTo(7, 11);
      ctx.quadraticCurveTo(22, 20, 25, 7);
      ctx.stroke();
    }

    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 12;
    const eyeY = -2;
    ctx.beginPath();
    ctx.ellipse(6, eyeY - 4, enemy.type === 'rusher' ? 3.5 : 2.6, 1.6, 0.1, 0, TAU);
    ctx.ellipse(6, eyeY + 4, enemy.type === 'rusher' ? 3.5 : 2.6, 1.6, -0.1, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  function drawBoss(enemy) {
    ctx.save();
    ctx.translate(enemy.x, enemy.y);
    const breathe = 1 + Math.sin(enemy.phase * 1.4) * 0.035;
    ctx.scale(breathe, breathe);
    const vulnerable = enemy.invulnerable <= 0;

    ctx.globalCompositeOperation = 'lighter';
    for (let ring = 0; ring < enemy.hp; ring++) {
      ctx.globalAlpha = vulnerable ? 0.22 + ring * 0.05 : 0.1;
      ctx.strokeStyle = ring === 0 ? '#ff769d' : ring === 1 ? '#9279d8' : '#73e8d2';
      ctx.lineWidth = 2;
      ctx.setLineDash([6 + ring * 2, 9]);
      ctx.lineDashOffset = reducedMotion ? 0 : state.runTime * (ring % 2 ? 14 : -11);
      ctx.beginPath();
      ctx.arc(0, 0, enemy.radius + 15 + ring * 12, 0, TAU);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 0.96;
    const gradient = ctx.createRadialGradient(-12, -15, 2, 0, 0, enemy.radius * 1.25);
    gradient.addColorStop(0, '#33213f');
    gradient.addColorStop(0.42, '#100b21');
    gradient.addColorStop(1, 'rgba(5, 3, 14, .2)');
    ctx.fillStyle = gradient;
    ctx.shadowColor = '#05030e';
    ctx.shadowBlur = 28;
    ctx.beginPath();
    for (let i = 0; i < 18; i++) {
      const a = i / 18 * TAU;
      const r = enemy.radius * (0.9 + Math.sin(enemy.phase * 2 + i * 1.17) * 0.1);
      const x = Math.cos(a) * r;
      const y = Math.sin(a) * r;
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.closePath();
    ctx.fill();

    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = vulnerable ? 0.85 : 0.3;
    ctx.fillStyle = '#ffd977';
    ctx.shadowColor = '#ff769d';
    ctx.shadowBlur = 18;
    ctx.beginPath();
    ctx.ellipse(-16, -5, 7, 2.5, -0.15, 0, TAU);
    ctx.ellipse(16, -5, 7, 2.5, 0.15, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  function drawPlayer() {
    const p = state.player;
    const blink = p.invulnerable > 0 && Math.floor(p.invulnerable * 12) % 2 === 0;
    if (blink) return;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.facing);
    const flap = reducedMotion ? 0 : Math.sin(p.wing) * 0.38;

    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = 'rgba(115, 232, 210, .28)';
    ctx.shadowColor = '#73e8d2';
    ctx.shadowBlur = 15;
    ctx.save();
    ctx.rotate(-0.42 - flap);
    ctx.beginPath();
    ctx.ellipse(-2, -9, 11, 5, -0.4, 0, TAU);
    ctx.fill();
    ctx.restore();
    ctx.save();
    ctx.rotate(0.42 + flap);
    ctx.beginPath();
    ctx.ellipse(-2, 9, 11, 5, 0.4, 0, TAU);
    ctx.fill();
    ctx.restore();

    ctx.fillStyle = '#fff0a6';
    ctx.shadowColor = '#ffd977';
    ctx.shadowBlur = 20;
    ctx.beginPath();
    ctx.ellipse(2, 0, 10, 5, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#ffd977';
    ctx.beginPath();
    ctx.moveTo(11, 0);
    ctx.lineTo(1, -4.2);
    ctx.lineTo(1, 4.2);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#ffd977';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-8, 0);
    ctx.lineTo(-18, 0);
    ctx.stroke();
    ctx.restore();
  }

  function drawParticles() {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const p of state.particles) {
      const alpha = clamp(p.life / p.maxLife, 0, 1);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 7;
      const size = p.size * (0.45 + alpha * 0.55);
      ctx.save();
      ctx.translate(p.x, p.y);
      if (p.shape === 'diamond') ctx.rotate(Math.PI / 4 + (reducedMotion ? 0 : state.runTime));
      ctx.beginPath();
      if (p.shape === 'diamond') ctx.rect(-size / 2, -size / 2, size, size);
      else ctx.arc(0, 0, size, 0, TAU);
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  }

  function drawFloaters() {
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const floater of state.floaters) {
      const ratio = clamp(floater.life / floater.maxLife, 0, 1);
      ctx.globalAlpha = Math.min(1, ratio * 2.5);
      ctx.fillStyle = floater.color;
      ctx.shadowColor = 'rgba(0,0,0,.8)';
      ctx.shadowBlur = 8;
      ctx.font = `800 ${floater.text.length > 18 ? 13 : 15}px system-ui, sans-serif`;
      ctx.fillText(floater.text, floater.x, floater.y);
    }
    ctx.restore();
  }

  function mixColor(a, b, amount) {
    const parse = (hex) => {
      const value = hex.replace('#', '');
      return [parseInt(value.slice(0, 2), 16), parseInt(value.slice(2, 4), 16), parseInt(value.slice(4, 6), 16)];
    };
    const aa = parse(a);
    const bb = parse(b);
    return `rgb(${Math.round(lerp(aa[0], bb[0], amount))},${Math.round(lerp(aa[1], bb[1], amount))},${Math.round(lerp(aa[2], bb[2], amount))})`;
  }

  function screenPoint(event) {
    const rect = canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  function frame(time) {
    const dt = Math.min(0.033, Math.max(0, (time - lastFrame) / 1000));
    lastFrame = time;
    update(dt);
    render();
    requestAnimationFrame(frame);
  }

  function setupQaControls() {
    const qaHostAllowed = window.location.protocol === 'file:'
      || ['localhost', '127.0.0.1', '::1', '[::1]'].includes(window.location.hostname);
    if (!pageParams.has('qa') || !qaHostAllowed) return;
    const panel = document.createElement('aside');
    panel.setAttribute('aria-label', 'QA controls');
    panel.style.cssText = 'position:fixed;left:8px;top:92px;z-index:1000;display:flex;gap:5px;padding:6px;background:#09091ddd;border:1px solid #ffd97755;border-radius:8px;font:700 9px system-ui;color:#fff;pointer-events:auto';

    const addButton = (label, action) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = label;
      button.style.cssText = 'padding:6px 8px;border:0;border-radius:5px;background:#ffd977;color:#151129;font:inherit;cursor:pointer';
      button.addEventListener('click', action);
      panel.appendChild(button);
    };

    addButton('QA START', () => startRun());
    addButton('QA COMPLETE PHASE', () => {
      if (state.mode !== 'playing') return;
      state.phaseProgress = state.phaseTarget;
      if (phaseDefs[state.phaseIndex].boss) {
        const boss = state.enemies.find((enemy) => enemy.type === 'boss');
        if (boss) boss.dead = true;
      }
      completePhase();
    });
    addButton('QA FAIL RUN', () => {
      if (state.mode === 'title') startRun();
      state.lives = 0;
      finishRun(false);
    });
    addButton('QA DAWN', () => {
      if (state.mode === 'title') startRun();
      state.phaseIndex = phaseDefs.length - 1;
      state.phaseTarget = 3;
      state.phaseProgress = 3;
      state.score = Math.max(state.score, 15000);
      state.loops = Math.max(state.loops, 12);
      state.shadows = Math.max(state.shadows, 25);
      state.mode = 'playing';
      completePhase();
    });
    document.body.appendChild(panel);
  }

  window.addEventListener('resize', resize);
  window.addEventListener('blur', () => {
    input.keys.clear();
    if (state.mode === 'playing' || state.mode === 'transition') pauseGame();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && (state.mode === 'playing' || state.mode === 'transition')) pauseGame();
  });

  window.addEventListener('keydown', (event) => {
    if (trapDialogFocus(event)) return;
    const key = event.key.toLowerCase();
    // Keep native Space activation for focused menu and overlay buttons.
    if (key === ' ' && event.target instanceof Element && event.target.closest('button')) return;
    if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(key)) event.preventDefault();
    if (key === 'm') {
      audio.toggle();
      return;
    }
    if (key === 'p' || key === 'escape') {
      if (state.mode === 'paused') resumeGame();
      else pauseGame();
      return;
    }
    if (key === 'r' && state.mode === 'result' && !isTrialRun) {
      startRun();
      return;
    }
    if (key === ' ' && !event.repeat) {
      toggleWeave();
      return;
    }
    input.keys.add(key);
    input.lastKeyboard = performance.now();
  });

  window.addEventListener('keyup', (event) => input.keys.delete(event.key.toLowerCase()));

  canvas.addEventListener('pointerenter', (event) => {
    if (event.pointerType === 'mouse') input.pointerActive = true;
  });
  canvas.addEventListener('pointerleave', (event) => {
    if (event.pointerType === 'mouse') input.pointerActive = false;
  });
  canvas.addEventListener('pointermove', (event) => {
    const p = screenPoint(event);
    input.x = p.x;
    input.y = p.y;
    input.pointerType = event.pointerType;
    if (event.pointerType === 'mouse' || event.buttons) input.pointerActive = true;
  });
  canvas.addEventListener('pointerdown', (event) => {
    const p = screenPoint(event);
    input.x = p.x;
    input.y = p.y;
    input.pointerType = event.pointerType;
    input.pointerActive = true;
    if (event.pointerType === 'mouse' && event.button === 0) toggleWeave();
    if (event.pointerType !== 'mouse') canvas.setPointerCapture?.(event.pointerId);
  });
  canvas.addEventListener('pointerup', (event) => {
    if (event.pointerType !== 'mouse') input.pointerActive = false;
  });
  canvas.addEventListener('contextmenu', (event) => event.preventDefault());

  ui.playButton.addEventListener('click', startRun);
  ui.replayButton.addEventListener('click', startRun);
  ui.homeButton.addEventListener('click', goHome);
  ui.resumeButton.addEventListener('click', resumeGame);
  ui.quitButton.addEventListener('click', () => {
    postToGrove('run-abandon');
    goHome();
  });
  ui.pauseButton.addEventListener('click', pauseGame);
  ui.soundButton.addEventListener('click', () => audio.toggle());
  ui.weaveButton.addEventListener('click', toggleWeave);
  ui.fullscreenButton.addEventListener('click', async () => {
    try {
      if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
      else await document.exitFullscreen();
    } catch (_) {
      showToast('Fullscreen is not available in this browser.', true, 1.8);
    }
  });
  document.addEventListener('fullscreenchange', () => {
    const isFullscreen = Boolean(document.fullscreenElement);
    const label = isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen';
    ui.fullscreenButton.setAttribute('aria-label', label);
    ui.fullscreenButton.title = label;
  });
  motionQuery.addEventListener?.('change', (event) => {
    reducedMotion = event.matches;
    if (reducedMotion) {
      state.shake = 0;
      if (state.particles.length > 180) state.particles.splice(0, state.particles.length - 180);
    }
  });

  ui.startBest.textContent = `PERSONAL BEST · ${formatNumber(state.best)}`;
  setupQaControls();
  resize();
  syncDialogState();
  postToGrove('game-ready');
  window.setTimeout(() => ui.playButton.focus({ preventScroll: true }), 100);
  requestAnimationFrame(frame);
})();
