(() => {
  'use strict';

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d', { alpha: false });
  const $ = (id) => document.getElementById(id);
  const TAU = Math.PI * 2;
  const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  let reducedMotion = motionQuery.matches;
  const pageParams = new URLSearchParams(window.location.search);
  const modeRules = window.LumenloomModes;
  if (!modeRules || typeof modeRules.getMode !== 'function') {
    throw new Error('Lumenloom mode rules must load before the game runtime.');
  }
  const groveBridge = window.LumenloomGroveProtocolV2;
  if (!groveBridge || typeof groveBridge.parseContext !== 'function') {
    throw new Error('Lumenloom Grove protocol bridge must load before the game runtime.');
  }
  const isEmbedded = window.parent !== window;
  const groveContext = groveBridge.parseContext(window.location.search, isEmbedded);
  if (groveContext.kind === 'invalid') {
    throw new Error('Lumenloom refused an invalid embedded Grove context.');
  }
  const isGroveHosted = groveContext.hosted;
  // D-029 keeps the gameplay lifecycle in state.mode. Arcade selection is a
  // separate immutable value so title/playing/paused/result transitions never
  // become entangled with Standard/Quick/Wild/Crown mode identity.
  const selectedModeId = isGroveHosted ? groveContext.modeId : 'standard';
  const selectedMode = modeRules.getMode(selectedModeId);
  if (!selectedMode) throw new Error('The canonical Lumenloom mode is unavailable.');
  const isPetalRush = selectedModeId === 'petalRush';
  const isShiftingConstellation = selectedModeId === 'shiftingConstellation';
  const isHollowRush = selectedModeId === 'hollowRush';
  const isArcadeMode = selectedModeId !== 'standard';
  const isTimedArcadeMode = isPetalRush || isShiftingConstellation;
  const CONSTELLATION_SYMBOLS = Object.freeze(['\u25B3', '\u25C7', '\u2B20']);
  const isTrialRun = isGroveHosted && groveContext.trial;
  const sessionId = isGroveHosted ? groveContext.sessionId : '';
  const messageTargetOrigin = window.location.protocol === 'file:' ? '*' : window.location.origin;
  let groveClient = groveBridge.createClient(groveContext);

  const ui = {
    app: $('app'),
    hud: $('hud'),
    phaseName: $('phaseName'),
    scoreValue: $('scoreValue'),
    bestValue: $('bestValue'),
    objectiveKicker: $('objectiveKicker'),
    objectiveCard: $('objectiveCard'),
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
    pauseRestartButton: $('pauseRestartButton'),
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
    resultBestLabel: $('resultBestLabel'),
    resultBest: $('resultBest'),
    resultLoops: $('resultLoops'),
    resultShadows: $('resultShadows'),
    replayButton: $('replayButton'),
    homeButton: $('homeButton'),
    mobileMoveZone: $('mobileMoveZone'),
    mobileStick: $('mobileStick'),
    mobileStickKnob: $('mobileStickKnob')
  };

  if (isGroveHosted) {
    document.documentElement.dataset.groveHosted = 'true';
    ui.fullscreenButton.hidden = true;
    ui.fullscreenButton.disabled = true;
  }
  document.documentElement.dataset.lumenMode = selectedModeId;

  const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
  const lerp = (a, b, t) => a + (b - a) * t;
  const easeOut = (t) => 1 - Math.pow(1 - t, 3);
  const easeInOut = (t) => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const formatNumber = (n) => Math.round(n).toLocaleString('en-US');

  const PHASE_ATMOSPHERES = Object.freeze([
    'first-stitch',
    'murmurs',
    'hunger',
    'crosswind',
    'hollow'
  ]);
  const VISUAL_BUDGETS = Object.freeze({
    desktop: Object.freeze({
      normal: Object.freeze({ awakeningMarks: 24, closureWaves: 5, atmosphereMotifs: 18, threadGlints: 7, trailParticles: 420 }),
      reduced: Object.freeze({ awakeningMarks: 16, closureWaves: 3, atmosphereMotifs: 8, threadGlints: 0, trailParticles: 120 })
    }),
    mobile: Object.freeze({
      normal: Object.freeze({ awakeningMarks: 16, closureWaves: 4, atmosphereMotifs: 11, threadGlints: 4, trailParticles: 260 }),
      reduced: Object.freeze({ awakeningMarks: 12, closureWaves: 2, atmosphereMotifs: 6, threadGlints: 0, trailParticles: 90 })
    })
  });
  const VISUAL_CONSTANTS = Object.freeze({
    canon: 'D-023',
    phaseAtmospheres: PHASE_ATMOSPHERES,
    budgets: VISUAL_BUDGETS,
    awakeningCap: 24,
    cosmeticIsolation: 'dedicated-cosmetic-rng-and-deterministic-render-hash',
    reducedMotion: Object.freeze({
      cameraPulse: 0,
      threadTrails: 0,
      closureWave: 'static-contained-radiance',
      atmosphere: 'static-composition'
    })
  });
  const FRAY_BALANCE = Object.freeze({
    canon: 'D-027',
    baseWindow: selectedMode.frayWindowMs / 1000,
    goldenFiberBonus: selectedModeId === 'standard'
      ? (selectedMode.goldenFiberFrayWindowMs - selectedMode.frayWindowMs) / 1000
      : 0
  });

  function hash01(value) {
    const x = Math.sin(Number(value) * 12.9898 + 78.233) * 43758.5453123;
    return x - Math.floor(x);
  }

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
  let gameplayRandomSource = mulberry32(Date.now() >>> 0);
  let cosmeticRandomSource = mulberry32((Date.now() ^ 0x9E3779B9) >>> 0);
  let gameplayRandomCalls = 0;
  let cosmeticRandomCalls = 0;
  const random = () => {
    gameplayRandomCalls++;
    return gameplayRandomSource();
  };
  const cosmeticRandom = () => {
    cosmeticRandomCalls++;
    return cosmeticRandomSource();
  };
  function seedRunRandom(seed) {
    gameplayRandomSource = mulberry32(seed >>> 0);
    cosmeticRandomSource = mulberry32((seed ^ 0x9E3779B9) >>> 0);
    gameplayRandomCalls = 0;
    cosmeticRandomCalls = 0;
  }
  const PLAYER_RADIUS = 18;
  const ANCHOR_RADIUS = 27;
  const profileOverride = ['mobile', 'desktop'].includes(pageParams.get('profile')) ? pageParams.get('profile') : '';

  function resolveControlProfile(options = {}) {
    const override = options.override || '';
    if (override === 'mobile' || override === 'mobile-portrait') return 'mobile-portrait';
    if (override === 'desktop') return 'desktop';

    const width = Math.max(1, Number(options.width) || 1);
    const height = Math.max(1, Number(options.height) || 1);
    const coarsePointer = Boolean(options.coarsePointer);
    const touchPoints = Math.max(0, Number(options.touchPoints) || 0);
    // Coarse-pointer devices stay mobile when rotated. A touch-capable laptop
    // only opts in automatically when its viewport is tablet-sized or smaller.
    const mobileDevice = coarsePointer || (touchPoints > 0 && (width <= 1024 || height <= 600));
    return mobileDevice ? 'mobile-portrait' : 'desktop';
  }

  function calculatePlayBounds(width, height, profile) {
    width = Math.max(1, Number(width) || 1);
    height = Math.max(1, Number(height) || 1);
    const mobile = profile === 'mobile' || profile === 'mobile-portrait';
    let left;
    let right;
    let top;
    let bottom;

    if (mobile) {
      const sideInset = clamp(width * 0.06, 20, 34);
      const topInset = clamp(height * 0.105, 78, 108);
      const bottomInset = clamp(height * 0.21, 118, 196);
      left = sideInset;
      right = width - sideInset;
      top = topInset;
      bottom = height - bottomInset;
    } else {
      // These are the established desktop player limits. Keeping them here
      // protects the existing mouse/keyboard composition from mobile tuning.
      left = 26;
      right = width - 26;
      top = 124;
      bottom = height - 26;
    }

    // Extremely small embedded frames should still produce finite geometry.
    if (right <= left) {
      left = Math.max(0, width * 0.1);
      right = Math.min(width, width * 0.9);
    }
    if (bottom <= top) {
      top = Math.max(0, height * 0.1);
      bottom = Math.min(height, height * 0.9);
    }

    return {
      left,
      right,
      top,
      bottom,
      width: right - left,
      height: bottom - top,
      centerX: (left + right) / 2,
      centerY: (top + bottom) / 2,
      playerRadius: PLAYER_RADIUS,
      anchorRadius: ANCHOR_RADIUS
    };
  }

  function clampPointToBounds(point, bounds) {
    return {
      x: clamp(Number(point.x) || 0, bounds.left, bounds.right),
      y: clamp(Number(point.y) || 0, bounds.top, bounds.bottom)
    };
  }

  function calculateTutorialLayout(width, height, profile) {
    const bounds = calculatePlayBounds(width, height, profile);
    if (profile === 'desktop') {
      const cx = width / 2;
      const cy = height / 2;
      const spreadX = Math.min(215, width * 0.18);
      const spreadY = Math.min(155, height * 0.21);
      return {
        player: clampPointToBounds({ x: cx, y: cy + Math.min(120, height * 0.15) }, bounds),
        anchors: [
          clampPointToBounds({ x: cx - spreadX, y: cy + spreadY * 0.45 }, bounds),
          clampPointToBounds({ x: cx, y: cy - spreadY }, bounds),
          clampPointToBounds({ x: cx + spreadX, y: cy + spreadY * 0.45 }, bounds)
        ]
      };
    }

    const flowerBounds = insetBounds(bounds, ANCHOR_RADIUS + 4);
    const cx = flowerBounds.centerX;
    const cy = flowerBounds.top + flowerBounds.height * 0.47;
    const spreadX = clamp(flowerBounds.width * 0.38, 72, 132);
    const spreadY = clamp(flowerBounds.height * 0.29, 78, 150);
    const lowerY = cy + spreadY * 0.42;
    const playerLead = clamp(bounds.height * 0.21, 70, 116);
    return {
      player: clampPointToBounds({ x: bounds.centerX, y: lowerY + playerLead }, bounds),
      anchors: [
        clampPointToBounds({ x: cx - spreadX, y: lowerY }, flowerBounds),
        clampPointToBounds({ x: cx, y: cy - spreadY }, flowerBounds),
        clampPointToBounds({ x: cx + spreadX, y: lowerY }, flowerBounds)
      ]
    };
  }

  function insetBounds(bounds, amountX, amountTop = amountX, amountBottom = amountX) {
    const left = Math.min(bounds.centerX, bounds.left + Math.max(0, amountX));
    const right = Math.max(bounds.centerX, bounds.right - Math.max(0, amountX));
    const top = Math.min(bounds.centerY, bounds.top + Math.max(0, amountTop));
    const bottom = Math.max(bounds.centerY, bounds.bottom - Math.max(0, amountBottom));
    return {
      left,
      right,
      top,
      bottom,
      width: right - left,
      height: bottom - top,
      centerX: (left + right) / 2,
      centerY: (top + bottom) / 2
    };
  }

  function currentDeviceProfile(width = W, height = H) {
    return resolveControlProfile({
      override: profileOverride,
      width,
      height,
      coarsePointer: window.matchMedia?.('(pointer: coarse)').matches,
      touchPoints: navigator.maxTouchPoints || 0
    });
  }

  let controlProfile = currentDeviceProfile(W, H);
  let playBounds = calculatePlayBounds(W, H, controlProfile);
  let viewportOrientation = W > H ? 'landscape' : 'portrait';
  let orientationBlocked = controlProfile === 'mobile-portrait' && viewportOrientation === 'landscape';

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

  const standardPhaseTargets = phaseDefs.map((phase) => phase.target);
  const standardFlowerCounts = phaseDefs.map((phase) => phase.anchorCount);
  if (selectedModeId === 'standard'
    && (JSON.stringify(standardPhaseTargets) !== JSON.stringify(selectedMode.phaseTargets)
      || JSON.stringify(standardFlowerCounts) !== JSON.stringify(selectedMode.flowerCounts))) {
    throw new Error('Lumenloom Standard phase definitions drifted from the shared mode canon.');
  }

  const blessingDefs = [
    { id: 'longer', symbol: '∞', name: 'Longer Thread', copy: '+25 maximum lumen. Brave shapes can stretch farther.' },
    { id: 'golden', symbol: '⌛', name: 'Golden Fiber', copy: `Fraying thread holds ${FRAY_BALANCE.goldenFiberBonus.toFixed(1)} seconds longer before it breaks.` },
    { id: 'quickwing', symbol: '❯', name: 'Quickwing', copy: 'Glide 12% faster and turn with a little more grace.' },
    { id: 'nectar', symbol: '✦', name: 'Night Nectar', copy: 'Every sealed loop restores 10 additional lumen.' },
    { id: 'ward', symbol: '◇', name: 'Petal Ward', copy: 'The next shadow touch or moonfall cannot take a petal.' },
    { id: 'echo', symbol: '↟', name: 'Echo Bloom', copy: 'Chain-weave time lasts 2 seconds longer between loops.' }
  ];

  function createDefaultUpgrades() {
    return {
      speed: 1,
      frayWindow: FRAY_BALANCE.baseWindow,
      captureRefund: 16,
      chainWindow: (selectedMode.loop?.chainWindowMs || 6000) / 1000,
      ward: false
    };
  }

  function applyGoldenFiber(upgrades = state.upgrades) {
    upgrades.frayWindow += FRAY_BALANCE.goldenFiberBonus;
  }

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
    lives: selectedMode.startPetals,
    lumen: selectedMode.startLumen,
    maxLumen: selectedMode.startLumen,
    frayTimer: 0,
    frayMax: 0,
    weaveAge: 0,
    chain: [],
    anchors: [],
    enemies: [],
    regions: [],
    closureWaves: [],
    awakeningMarks: [],
    wildBlooms: [],
    particles: [],
    floaters: [],
    fireflies: [],
    grass: [],
    stones: [],
    lastLoopAt: -999,
    lastArcadeLoopAtMs: -1,
    comboStack: 0,
    cleanWeave: true,
    invalidFlash: 0,
    spawnTimer: 0,
    runTime: 0,
    loops: 0,
    shadows: 0,
    totalVertices: 0,
    cleanLoops: 0,
    chainLinks: 0,
    targetIndex: 0,
    targetClockMs: 0,
    targetMatches: 0,
    seals: 0,
    arcadeClockMs: 0,
    arcadeElapsedMs: 0,
    arcadeReplacementQueue: [],
    shake: 0,
    flash: 0,
    dawn: 0,
    completed: false,
    tutorialStep: 0,
    upgrades: createDefaultUpgrades(),
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
    lastKeyboard: 0,
    mobilePointerId: null,
    stickOriginX: 0,
    stickOriginY: 0,
    stickX: 0,
    stickY: 0,
    stickMagnitude: 0,
    actionPointers: new Set(),
    lastTouchActionAt: -Infinity
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
      for (let i = 0; i < length; i++) data[i] = (cosmeticRandom() * 2 - 1) * (1 - i / length);
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

  function mobileHaptic(pattern) {
    if (!isMobileProfile() || reducedMotion || typeof navigator.vibrate !== 'function') return;
    try { navigator.vibrate(pattern); }
    catch (_) { /* Vibration is an optional, capability-gated enhancement. */ }
  }

  function sendGroveMessage(message) {
    if (!isGroveHosted || !message) return false;
    window.parent.postMessage(message, messageTargetOrigin);
    return true;
  }

  function transitionGroveClient(action) {
    const next = groveBridge.reduceClient(groveClient, action);
    groveClient = next;
    return next;
  }

  function publishGroveReady() {
    const message = groveBridge.buildGameReady(groveClient);
    if (!sendGroveMessage(message)) return false;
    transitionGroveClient({ type: groveBridge.CLIENT_ACTIONS.READY_SENT });
    return true;
  }

  function requestGroveStart() {
    if (!isGroveHosted || groveClient.phase !== 'ready') return false;
    const runId = groveBridge.createRunId({ scope: sessionId });
    transitionGroveClient({
      type: groveBridge.CLIENT_ACTIONS.START_REQUESTED,
      runId
    });
    const message = groveBridge.buildRunStart(groveClient);
    if (!sendGroveMessage(message)) return false;
    ui.playButton.disabled = true;
    ui.playButton.querySelector('span:last-of-type')?.replaceChildren('PREPARING THE GARDEN…');
    return true;
  }

  function requestGroveSessionAction(action) {
    if (!isGroveHosted || !groveBridge.canRequestSessionAction(groveClient, action)) return false;
    transitionGroveClient({
      type: groveBridge.CLIENT_ACTIONS.SESSION_ACTION_REQUESTED,
      action
    });
    const message = groveBridge.buildSessionAction(groveClient);
    if (!sendGroveMessage(message)) return false;
    ui.replayButton.disabled = true;
    ui.homeButton.disabled = true;
    ui.quitButton.disabled = true;
    ui.pauseRestartButton.disabled = true;
    return true;
  }

  function publishGroveRunComplete(payload) {
    if (!isGroveHosted || groveClient.phase !== 'running') return false;
    const message = groveBridge.buildRunComplete(groveClient, payload);
    if (!message) return false;
    transitionGroveClient({
      type: groveBridge.CLIENT_ACTIONS.RUN_FINISHED,
      score: payload.score,
      victory: payload.victory
    });
    return sendGroveMessage(message);
  }

  function publishGroveAbandon() {
    if (!isGroveHosted || groveClient.phase !== 'running') return false;
    return sendGroveMessage(groveBridge.buildRunAbandon(groveClient));
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
    if (isGroveHosted) return 0;
    try { return Number(localStorage.getItem('lumenloom-best') || 0); }
    catch (_) { return 0; }
  }

  function writeBest(value) {
    if (isGroveHosted) return;
    try { localStorage.setItem('lumenloom-best', String(Math.round(value))); }
    catch (_) { /* local file privacy modes may disable storage */ }
  }

  function isMobileProfile() {
    return controlProfile === 'mobile-portrait';
  }

  function getVisualBudget() {
    const profile = isMobileProfile() ? 'mobile' : 'desktop';
    return VISUAL_BUDGETS[profile][reducedMotion ? 'reduced' : 'normal'];
  }

  function setStyleProperty(element, name, value) {
    if (!element?.style) return;
    if (typeof element.style.setProperty === 'function') element.style.setProperty(name, value);
    else element.style[name] = value;
  }

  function setProfileDomState() {
    viewportOrientation = W > H ? 'landscape' : 'portrait';
    orientationBlocked = isMobileProfile() && viewportOrientation === 'landscape';
    const displayProfile = isMobileProfile() ? `mobile-${viewportOrientation}` : 'desktop';
    const roots = [document.documentElement, document.body, ui.app, canvas].filter(Boolean);
    roots.forEach((element) => {
      element.classList.remove('profile-desktop', 'profile-mobile', 'profile-mobile-portrait', 'profile-mobile-landscape', 'is-orientation-blocked');
      element.classList.add(isMobileProfile() ? 'profile-mobile' : 'profile-desktop');
      // "mobile-portrait" names the mobile control/layout profile. Landscape
      // is an orientation state layered on top so phones never become desktop.
      if (isMobileProfile()) element.classList.add('profile-mobile-portrait');
      if (isMobileProfile() && viewportOrientation === 'landscape') element.classList.add('profile-mobile-landscape');
      element.classList.toggle('is-orientation-blocked', orientationBlocked);
      element.dataset.controlProfile = controlProfile;
      element.dataset.profile = displayProfile;
      element.dataset.orientation = viewportOrientation;
      element.dataset.orientationBlocked = String(orientationBlocked);
    });
  }

  function syncMobileStickVisual(active = input.mobilePointerId !== null) {
    const originX = active ? input.stickOriginX : Math.max(72, W * 0.21);
    const originY = active ? input.stickOriginY : Math.min(H - 72, H * 0.79);
    const targets = [ui.mobileMoveZone, ui.mobileStick].filter(Boolean);
    targets.forEach((element) => {
      setStyleProperty(element, '--stick-x', `${originX}px`);
      setStyleProperty(element, '--stick-y', `${originY}px`);
      setStyleProperty(element, '--stick-dx', `${input.stickX}px`);
      setStyleProperty(element, '--stick-dy', `${input.stickY}px`);
      element.classList.toggle('is-active', active);
      element.dataset.active = String(active);
    });
    if (ui.mobileStickKnob) {
      setStyleProperty(ui.mobileStickKnob, '--stick-dx', `${input.stickX}px`);
      setStyleProperty(ui.mobileStickKnob, '--stick-dy', `${input.stickY}px`);
      ui.mobileStickKnob.dataset.active = String(active);
    }
  }

  function resetMobileStick(pointerId = null) {
    if (pointerId !== null && input.mobilePointerId !== pointerId) return;
    input.mobilePointerId = null;
    input.stickX = 0;
    input.stickY = 0;
    input.stickMagnitude = 0;
    input.pointerActive = false;
    syncMobileStickVisual(false);
  }

  function updateMobileStick(point) {
    const maxDistance = clamp(Math.min(W, H) * 0.16, 46, 68);
    const deadZone = Math.max(7, maxDistance * 0.13);
    const rawX = point.x - input.stickOriginX;
    const rawY = point.y - input.stickOriginY;
    const rawLength = Math.hypot(rawX, rawY);
    const visualScale = rawLength > maxDistance ? maxDistance / rawLength : 1;
    input.stickX = rawX * visualScale;
    input.stickY = rawY * visualScale;
    if (rawLength <= deadZone) {
      input.stickMagnitude = 0;
    } else {
      input.stickMagnitude = clamp((Math.min(rawLength, maxDistance) - deadZone) / (maxDistance - deadZone), 0, 1);
    }
    syncMobileStickVisual(true);
  }

  function getAnchorPlacementBounds() {
    if (isMobileProfile()) return insetBounds(playBounds, ANCHOR_RADIUS + 4);
    const side = Math.max(58, W * 0.055);
    const top = Math.max(150, H * 0.18);
    const bottomInset = Math.max(95, H * 0.13);
    const bounds = {
      left: Math.max(playBounds.left, side),
      right: Math.min(playBounds.right, W - side),
      top: Math.max(playBounds.top, top),
      bottom: Math.min(playBounds.bottom, H - bottomInset),
      width: Math.min(playBounds.right, W - side) - Math.max(playBounds.left, side),
      height: Math.min(playBounds.bottom, H - bottomInset) - Math.max(playBounds.top, top),
      centerX: W / 2,
      centerY: (Math.max(playBounds.top, top) + Math.min(playBounds.bottom, H - bottomInset)) / 2
    };
    if (!isArcadeMode) return bounds;

    const compactWidth = Math.min(bounds.width, Math.max(620, W * 0.64));
    const left = bounds.centerX - compactWidth / 2;
    return {
      ...bounds,
      left,
      right: left + compactWidth,
      width: compactWidth
    };
  }

  function getEnemyBounds(radius) {
    if (isMobileProfile()) return insetBounds(playBounds, radius);
    const left = Math.max(playBounds.left, radius + 18);
    const right = Math.min(playBounds.right, W - radius - 18);
    const top = Math.max(playBounds.top, 125 + radius);
    const bottom = Math.min(playBounds.bottom, H - radius - 18);
    return {
      left,
      right,
      top,
      bottom,
      width: right - left,
      height: bottom - top,
      centerX: (left + right) / 2,
      centerY: (top + bottom) / 2
    };
  }

  function remapPoint(point, from, to) {
    const nx = clamp((point.x - from.left) / Math.max(1, from.width), 0, 1);
    const ny = clamp((point.y - from.top) / Math.max(1, from.height), 0, 1);
    point.x = lerp(to.left, to.right, nx);
    point.y = lerp(to.top, to.bottom, ny);
  }

  function resize() {
    const oldW = W;
    const oldH = H;
    const oldBounds = { ...playBounds };
    const rect = canvas.getBoundingClientRect();
    W = Math.max(320, rect.width);
    H = Math.max(240, rect.height);
    controlProfile = currentDeviceProfile(W, H);
    playBounds = calculatePlayBounds(W, H, controlProfile);
    setProfileDomState();
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
      remapPoint(state.player, oldBounds, playBounds);
      state.anchors.forEach((anchor) => remapPoint(anchor, oldBounds, playBounds));
      state.enemies.forEach((enemy) => remapPoint(enemy, oldBounds, playBounds));
      state.wildBlooms.forEach((bloom) => remapPoint(bloom, oldBounds, playBounds));
      state.awakeningMarks.forEach((mark) => remapPoint(mark, oldBounds, playBounds));
      state.closureWaves.forEach((wave) => {
        remapPoint(wave, oldBounds, playBounds);
        wave.points.forEach((point) => remapPoint(point, oldBounds, playBounds));
        wave.radius *= Math.min(sx, sy);
      });
      state.particles.forEach(scalePoint);
      state.floaters.forEach(scalePoint);
      state.regions.forEach((region) => region.points.forEach((point) => remapPoint(point, oldBounds, playBounds)));

      const clampedPlayer = clampPointToBounds(state.player, playBounds);
      state.player.x = clampedPlayer.x;
      state.player.y = clampedPlayer.y;
      const anchorBounds = getAnchorPlacementBounds();
      state.anchors.forEach((anchor) => Object.assign(anchor, clampPointToBounds(anchor, anchorBounds)));
      state.enemies.forEach((enemy) => Object.assign(enemy, clampPointToBounds(enemy, getEnemyBounds(enemy.radius))));
    } else {
      state.player.x = playBounds.centerX;
      state.player.y = playBounds.centerY;
    }
    resetMobileStick();
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
        radius: 0.7 + rng() * 1.7,
        color: rng() > 0.7 ? '#73e8d2' : '#ffd977'
      });
    }
  }

  function startRun() {
    if (isTrialRun && state.mode === 'result') return;
    if (isGroveHosted) {
      requestGroveStart();
      return;
    }
    beginRun();
  }

  function beginRun() {
    audio.init();
    resetMobileStick();
    seedRunRandom((Date.now() ^ Math.round(performance.now() * 1000)) >>> 0);
    state.mode = 'playing';
    state.previousMode = 'playing';
    state.phaseIndex = 0;
    state.phaseProgress = 0;
    state.phaseTarget = 1;
    state.phaseTime = Infinity;
    state.score = 0;
    state.lives = selectedMode.startPetals;
    state.maxLumen = selectedMode.startLumen;
    state.lumen = selectedMode.startLumen;
    state.chain = [];
    state.anchors = [];
    state.enemies = [];
    state.regions = [];
    state.closureWaves = [];
    state.awakeningMarks = [];
    state.wildBlooms = [];
    state.particles = [];
    state.floaters = [];
    state.frayTimer = 0;
    state.comboStack = 0;
    state.lastLoopAt = -999;
    state.lastArcadeLoopAtMs = -1;
    state.runTime = 0;
    state.loops = 0;
    state.shadows = 0;
    state.totalVertices = 0;
    state.cleanLoops = 0;
    state.chainLinks = 0;
    state.arcadeClockMs = 0;
    state.targetIndex = 0;
    state.targetClockMs = 0;
    state.targetMatches = 0;
    state.seals = 0;
    state.arcadeElapsedMs = 0;
    state.arcadeReplacementQueue = [];
    state.shake = 0;
    state.flash = 0;
    state.dawn = 0;
    state.completed = false;
    state.tutorialStep = 0;
    state.upgrades = createDefaultUpgrades();
    state.player = { x: playBounds.centerX, y: playBounds.centerY, vx: 0, vy: 0, facing: -Math.PI / 2, invulnerable: 1.1, wing: 0 };
    ui.hud.classList.remove('is-hidden');
    ui.playButton.disabled = false;
    ui.replayButton.disabled = false;
    ui.homeButton.disabled = false;
    ui.quitButton.disabled = false;
    ui.pauseRestartButton.disabled = isTrialRun;
    closeDialogs(canvas);
    if (isArcadeMode) beginArcadeMode();
    else beginPhase(0);
  }

  function beginArcadeMode() {
    state.phaseIndex = isHollowRush ? 4 : isShiftingConstellation ? 3 : 1;
    state.phaseProgress = 0;
    state.phaseTarget = isHollowRush ? selectedMode.requiredSeals : selectedMode.durationMs;
    state.phaseTime = selectedMode.durationMs / 1000;
    state.anchors = generateAnchors(selectedMode.flowerCount, false);
    replenishArcadeFlowers([]);
    state.enemies = [];
    state.chain = [];
    state.frayTimer = 0;
    state.weaveAge = 0;
    state.player.x = playBounds.centerX;
    state.player.y = playBounds.centerY;
    state.player.vx = 0;
    state.player.vy = 0;
    state.player.invulnerable = 1.35;
    state.lumen = state.maxLumen;
    state.mode = 'playing';
    ui.phaseBanner.classList.remove('is-visible');
    state.phaseIntroTimer = 0;
    maintainArcadeThreatFloor(true);
    if (isHollowRush) spawnEnemy('boss', true);
    const entryCue = isPetalRush
      ? 'Close bright loops. Keep one petal for 90 seconds.'
      : isShiftingConstellation
        ? 'Match the glowing shape. Keep weaving for two minutes.'
        : 'Enclose the Guardian three times before the Hollow closes.';
    showToast(entryCue, false, 2.6);
    updateObjective();
    updateHud();
  }

  function beginPhase(index) {
    if (state.anchors.length) {
      state.anchors.filter((a) => a.awakened).forEach((a) => {
        state.wildBlooms.push({ x: a.x, y: a.y, hue: a.hue, size: 0.7 + cosmeticRandom() * 0.45, age: 10 });
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
    const phaseStart = index === 0
      ? calculateTutorialLayout(W, H, controlProfile).player
      : { x: playBounds.centerX, y: playBounds.centerY };
    state.player.x = phaseStart.x;
    state.player.y = phaseStart.y;
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
    const bounds = getAnchorPlacementBounds();
    const baseMinDist = isMobileProfile()
      ? clamp(Math.min(bounds.width, bounds.height) * 0.235, 62, 96)
      : clamp(Math.min(W, H) * 0.145, 86, 132);

    if (tutorial) {
      calculateTutorialLayout(W, H, controlProfile).anchors
        .forEach((point, guide) => anchors.push(makeAnchor(point.x, point.y, guide)));
    }

    let attempts = 0;
    while (anchors.length < count && attempts < 1600) {
      attempts++;
      const x = bounds.left + random() * Math.max(1, bounds.width);
      const y = bounds.top + random() * Math.max(1, bounds.height);
      const centerClearance = isMobileProfile() ? Math.min(74, baseMinDist * 0.92) : 92;
      if (Math.hypot(x - playBounds.centerX, y - playBounds.centerY) < centerClearance) continue;
      const relaxation = attempts > 1100 ? 0.78 : attempts > 700 ? 0.88 : 1;
      if (anchors.some((a) => Math.hypot(a.x - x, a.y - y) < baseMinDist * relaxation)) continue;
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
      radius: ANCHOR_RADIUS,
      touchCooldown: 0,
      awakened: false,
      bloom: 0,
      hue: 162 + Math.round(cosmeticRandom() * 150),
      phase: cosmeticRandom() * TAU
    };
  }

  function spawnEnemy(type, initial = false, rosterSlot = null) {
    const data = {
      drifter: { radius: 17, speed: 45 + random() * 18 },
      seeker: { radius: 19, speed: 58 + random() * 14 },
      rusher: { radius: 20, speed: 42 + random() * 9 },
      boss: { radius: 61, speed: 27 }
    }[type];
    const bounds = getEnemyBounds(data.radius);
    let x;
    let y;
    if (initial) {
      let tries = 0;
      const safeDistance = Math.min(190, Math.hypot(bounds.width, bounds.height) * 0.36);
      do {
        x = bounds.left + random() * Math.max(1, bounds.width);
        y = bounds.top + random() * Math.max(1, bounds.height);
        tries++;
      } while (Math.hypot(x - state.player.x, y - state.player.y) < safeDistance && tries < 40);
    } else {
      const edge = Math.floor(random() * 4);
      if (edge === 0) { x = bounds.left; y = bounds.top + random() * bounds.height; }
      if (edge === 1) { x = bounds.right; y = bounds.top + random() * bounds.height; }
      if (edge === 2) { x = bounds.left + random() * bounds.width; y = bounds.top; }
      if (edge === 3) { x = bounds.left + random() * bounds.width; y = bounds.bottom; }
    }

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
      dead: false,
      rosterSlot
    });
  }

  function chooseSpawnType() {
    const phase = state.phaseIndex;
    const roll = random();
    if (phase >= 3 && roll < 0.2) return 'rusher';
    if (phase >= 2 && roll < (phase === 2 ? 0.32 : 0.46)) return 'seeker';
    return 'drifter';
  }

  const PETAL_THREAT_TYPES = Object.freeze(['drifter', 'seeker', 'rusher']);

  function arcadeThreatMinimum(elapsedMs = state.arcadeElapsedMs) {
    let minimum = selectedMode.threat.stages[0].minimum;
    for (const stage of selectedMode.threat.stages) {
      if (elapsedMs < stage.atMs) break;
      minimum = stage.minimum;
    }
    return minimum;
  }

  function maintainArcadeThreatFloor(initial = false) {
    if (!isArcadeMode || state.mode !== 'playing') return;
    const ready = [];
    const waiting = [];
    for (const replacement of state.arcadeReplacementQueue) {
      (replacement.readyAtMs <= state.arcadeElapsedMs ? ready : waiting).push(replacement);
    }
    state.arcadeReplacementQueue = waiting;
    for (const replacement of ready) {
      spawnEnemy(replacement.type, false, replacement.type);
    }

    const minimum = arcadeThreatMinimum();
    for (const type of PETAL_THREAT_TYPES) {
      const active = state.enemies.filter((enemy) => (
        !enemy.dead && enemy.rosterSlot === type
      )).length;
      const queued = state.arcadeReplacementQueue.filter((replacement) => replacement.type === type).length;
      const missing = Math.max(0, minimum[type] - active - queued);
      for (let index = 0; index < missing; index++) {
        spawnEnemy(type, initial, type);
      }
    }
  }

  function scheduleArcadeReplacement(enemy) {
    if (!isArcadeMode || !PETAL_THREAT_TYPES.includes(enemy?.rosterSlot)) return;
    state.arcadeReplacementQueue.push({
      type: enemy.rosterSlot,
      readyAtMs: state.arcadeElapsedMs + selectedMode.threat.replacementDelayMs
    });
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

    if (state.mode === 'playing' && !orientationBlocked) {
      state.runTime += dt;
      updatePlaying(dt);
      audio.update();
    } else if (state.mode === 'transition' && !orientationBlocked) {
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
    if (isArcadeMode) {
      updateArcadeMode(dt);
      return;
    }
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

  function cycleConstellationTarget(matched = false) {
    if (!isShiftingConstellation) return;
    state.targetIndex = (state.targetIndex + 1) % selectedMode.targetVertices.length;
    state.targetClockMs = 0;
    if (matched) {
      const count = selectedMode.targetVertices[state.targetIndex];
      showToast(`${CONSTELLATION_SYMBOLS[state.targetIndex]} ${count} FLOWERS`, false, 1.25);
    }
  }

  function advanceConstellationClock(deltaMs) {
    if (!isShiftingConstellation || state.mode !== 'playing') return;
    state.targetClockMs += Math.max(0, deltaMs);
    while (state.targetClockMs >= selectedMode.targetWindowMs) {
      state.targetClockMs -= selectedMode.targetWindowMs;
      state.targetIndex = (state.targetIndex + 1) % selectedMode.targetVertices.length;
    }
  }

  function advanceArcadeClock(deltaMs) {
    if (!isArcadeMode || state.mode !== 'playing') return false;
    const durationMs = selectedMode.durationMs;
    const safeDelta = Math.max(0, deltaMs);
    advanceConstellationClock(Math.min(safeDelta, durationMs - state.arcadeClockMs));
    state.arcadeClockMs = Math.min(durationMs, state.arcadeClockMs + safeDelta);
    state.arcadeElapsedMs = state.arcadeClockMs >= durationMs
      ? durationMs
      : Math.min(durationMs - 1, Math.floor(state.arcadeClockMs));
    state.phaseTime = Math.max(0, (durationMs - state.arcadeClockMs) / 1000);
    state.phaseProgress = isHollowRush ? state.seals : state.arcadeElapsedMs;
    if (state.arcadeClockMs < durationMs) return false;

    // D-029 resolves the timer before any collision or closure on the final tick.
    state.arcadeElapsedMs = durationMs;
    state.phaseProgress = isHollowRush ? state.seals : durationMs;
    state.phaseTime = 0;
    finishRun(isTimedArcadeMode);
    return true;
  }

  function updateArcadeMode(dt) {
    if (advanceArcadeClock(dt * 1000)) return;
    updatePlayer(dt);
    updateAnchors(dt);
    updateWeave(dt);
    if (state.mode !== 'playing') return;
    maintainArcadeThreatFloor(false);
    updateEnemies(dt, true);
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
    let intentStrength = 1;
    if (!usingKeys && isMobileProfile() && input.mobilePointerId !== null && input.stickMagnitude > 0) {
      dx = input.stickX;
      dy = input.stickY;
      intentStrength = 0.38 + input.stickMagnitude * 0.62;
    } else if (!usingKeys && !isMobileProfile() && input.pointerActive && performance.now() - input.lastKeyboard > 350) {
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
    const analogSpeed = !usingKeys && isMobileProfile() && input.mobilePointerId !== null
      ? 0.48 + input.stickMagnitude * 0.52
      : 1;
    const maxSpeed = 235 * state.upgrades.speed * (state.chain.length ? 1.08 : 1) * analogSpeed;
    if (length > 0) {
      dx /= length;
      dy /= length;
      p.vx += dx * accel * dt * intentStrength;
      p.vy += dy * accel * dt * intentStrength;
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
    if (p.x < playBounds.left) { p.x = playBounds.left; p.vx = Math.abs(p.vx) * 0.35; }
    if (p.x > playBounds.right) { p.x = playBounds.right; p.vx = -Math.abs(p.vx) * 0.35; }
    if (p.y < playBounds.top) { p.y = playBounds.top; p.vy = Math.abs(p.vy) * 0.35; }
    if (p.y > playBounds.bottom) { p.y = playBounds.bottom; p.vy = -Math.abs(p.vy) * 0.35; }

    const trailRate = reducedMotion ? 4 : isMobileProfile() ? 11 : 18;
    if (speed > 65 && cosmeticRandom() < dt * trailRate) {
      addParticle(p.x - Math.cos(p.facing) * 13, p.y - Math.sin(p.facing) * 13, {
        color: cosmeticRandom() > 0.4 ? '#ffd977' : '#73e8d2',
        size: 1.6 + cosmeticRandom() * 2.2,
        life: 0.35 + cosmeticRandom() * 0.35,
        vx: -p.vx * 0.1 + (cosmeticRandom() - 0.5) * 24,
        vy: -p.vy * 0.1 + (cosmeticRandom() - 0.5) * 24
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
    mobileHaptic(7);
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
    if (isArcadeMode && state.chain.length >= selectedMode.loop.maximumVertices) {
      showToast(`${selectedMode.loop.maximumVertices} flowers is the widest ${selectedMode.name} weave.`, false, 1.6);
      return;
    }
    state.chain.push(anchor.id);
    state.lumen = Math.max(0, state.lumen - 1.5);
    audio.pin(state.chain.length - 1);
    mobileHaptic(7);
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

  function arcadeBaseScore() {
    const scoring = selectedMode.scoring;
    return ['loops', 'totalVertices', 'shadows', 'cleanLoops', 'chainLinks', 'targetMatches', 'seals']
      .reduce((total, key) => total + state[key] * (Number(scoring[key]) || 0), 0);
  }

  function creditArcadeLoop(vertices, shadows, clean, guardianSeal = false) {
    const loop = selectedMode.loop;
    if (!Number.isSafeInteger(vertices)
      || vertices < loop.minimumVertices
      || vertices > loop.maximumVertices
      || !Number.isSafeInteger(shadows)
      || shadows < 0
      || shadows > loop.maximumShadows
      || typeof clean !== 'boolean'
      || typeof guardianSeal !== 'boolean'
      || state.loops >= loop.maximumLoops) {
      return Object.freeze({
        credited: false,
        awarded: 0,
        chain: false,
        targetMatch: false,
        matchedTarget: null,
        seal: false
      });
    }

    const previousScore = state.score;
    const chain = state.lastArcadeLoopAtMs >= 0
      && state.arcadeElapsedMs - state.lastArcadeLoopAtMs <= loop.chainWindowMs;
    const matchedTarget = isShiftingConstellation
      ? selectedMode.targetVertices[state.targetIndex]
      : null;
    const targetMatch = isShiftingConstellation
      && clean
      && vertices === matchedTarget;
    const seal = isHollowRush
      && guardianSeal
      && state.seals < selectedMode.requiredSeals;

    state.loops++;
    state.totalVertices += vertices;
    state.shadows += shadows;
    if (clean) state.cleanLoops++;
    if (chain) state.chainLinks++;
    if (targetMatch) {
      state.targetMatches++;
      cycleConstellationTarget(true);
    }
    if (seal) {
      state.seals++;
      state.phaseProgress = state.seals;
    }
    state.lastArcadeLoopAtMs = state.arcadeElapsedMs;
    state.lastLoopAt = state.runTime;
    state.comboStack = chain ? Math.min(6, state.comboStack + 1) : 0;
    state.score = arcadeBaseScore();
    return Object.freeze({
      credited: true,
      awarded: state.score - previousScore,
      chain,
      targetMatch,
      matchedTarget,
      seal
    });
  }

  function replenishArcadeFlowers(usedIds) {
    const used = new Set(usedIds);
    const anchors = state.anchors.filter((anchor) => !used.has(anchor.id));
    const bounds = getAnchorPlacementBounds();
    const baseMinDist = isMobileProfile()
      ? clamp(Math.min(bounds.width, bounds.height) * 0.205, 58, 86)
      : clamp(Math.min(bounds.width, bounds.height) * 0.14, 76, 116);
    let attempts = 0;

    while (anchors.length < selectedMode.flowerCount && attempts < 1800) {
      attempts++;
      const x = bounds.left + random() * Math.max(1, bounds.width);
      const y = bounds.top + random() * Math.max(1, bounds.height);
      if (Math.hypot(x - state.player.x, y - state.player.y) < 58) continue;
      const relaxation = attempts > 1200 ? 0.68 : attempts > 700 ? 0.82 : 1;
      if (anchors.some((anchor) => distance(anchor, { x, y }) < baseMinDist * relaxation)) continue;
      anchors.push(makeAnchor(x, y, -1));
    }

    // The fallback is bounded and deterministic; it protects very small
    // embedded frames without ever allowing the active flower count to drift.
    while (anchors.length < selectedMode.flowerCount) {
      const index = anchors.length;
      const angle = index / selectedMode.flowerCount * TAU;
      const radiusX = Math.max(24, bounds.width * 0.36);
      const radiusY = Math.max(24, bounds.height * 0.36);
      anchors.push(makeAnchor(
        clamp(bounds.centerX + Math.cos(angle) * radiusX, bounds.left, bounds.right),
        clamp(bounds.centerY + Math.sin(angle) * radiusY, bounds.top, bounds.bottom),
        -1
      ));
    }
    state.anchors = anchors.slice(0, selectedMode.flowerCount);
  }

  function releaseHollowSealThreats() {
    if (!isHollowRush || !selectedMode.threat.sealRelease.afterSeals.includes(state.seals)) return;
    const cap = selectedMode.threat.sealRelease.nonGuardianCap;
    for (const type of ['drifter', 'seeker']) {
      const active = state.enemies.filter((enemy) => !enemy.dead && enemy.type !== 'boss').length;
      const futurePopulation = active + state.arcadeReplacementQueue.length;
      if (futurePopulation >= cap) break;
      spawnEnemy(type, false);
    }
  }

  function sealArcadeWeave(polygon) {
    const usedIds = [...state.chain];
    const guardian = isHollowRush
      ? state.enemies.find((enemy) => (
        !enemy.dead
        && enemy.type === 'boss'
        && enemy.invulnerable <= 0
        && pointInPolygon(enemy, polygon)
      ))
      : null;
    const caught = [];
    for (const enemy of state.enemies) {
      if (enemy.dead || enemy.type === 'boss' || !pointInPolygon(enemy, polygon)) continue;
      enemy.dead = true;
      caught.push(enemy);
      scheduleArcadeReplacement(enemy);
      state.wildBlooms.push({
        x: enemy.x,
        y: enemy.y,
        hue: 145 + cosmeticRandom() * 190,
        size: 0.8 + cosmeticRandom() * 0.7,
        age: 0
      });
      burst(
        enemy.x,
        enemy.y,
        enemy.type === 'rusher' ? '#ffad62' : enemy.type === 'seeker' ? '#ff769d' : '#73e8d2',
        14,
        145
      );
    }

    const scoredShadows = Math.min(caught.length, selectedMode.loop.maximumShadows);
    const result = creditArcadeLoop(
      polygon.length,
      scoredShadows,
      state.cleanWeave,
      Boolean(guardian)
    );
    if (result.seal && guardian) {
      guardian.hp = Math.max(0, selectedMode.requiredSeals - state.seals);
      guardian.invulnerable = state.seals < selectedMode.requiredSeals ? 2.35 : 0;
      guardian.dead = state.seals >= selectedMode.requiredSeals;
      state.wildBlooms.push({
        x: guardian.x,
        y: guardian.y,
        hue: 44 + guardian.hp * 48,
        size: 2.1,
        age: 0
      });
      burst(guardian.x, guardian.y, '#ffd977', 48, 260);
      burst(guardian.x, guardian.y, '#73e8d2', 28, 210);
      addFloater(
        guardian.x,
        guardian.y - 75,
        state.seals < selectedMode.requiredSeals
          ? `GUARDIAN SEAL ${state.seals} / ${selectedMode.requiredSeals}`
          : 'THE GUARDIAN OPENS',
        '#ffd977',
        1.35
      );
      releaseHollowSealThreats();
    }
    for (const id of usedIds) {
      const anchor = anchorById(id);
      if (!anchor) continue;
      state.wildBlooms.push({
        x: anchor.x,
        y: anchor.y,
        hue: anchor.hue,
        size: 0.7 + cosmeticRandom() * 0.45,
        age: 0
      });
    }

    state.lumen = Math.min(
      state.maxLumen,
      state.lumen + state.upgrades.captureRefund + scoredShadows * 3
    );
    state.regions.push({
      points: polygon.map((point) => ({ ...point })),
      hue: 154 + cosmeticRandom() * 170,
      age: 0,
      strength: clamp(0.2 + caught.length * 0.025, 0.2, 0.34)
    });
    while (state.regions.length > getVisualBudget().awakeningMarks) state.regions.shift();
    addClosureSpectacle(polygon, caught.length, polygon.length);

    const center = polygonCentroid(polygon);
    const label = result.credited
      ? `${scoredShadows ? `${scoredShadows} SHADOW${scoredShadows === 1 ? '' : 'S'} · ` : ''}+${formatNumber(result.awarded)}`
      : 'LOOP LIMIT · KEEP GLOWING';
    addFloater(center.x, center.y, label, scoredShadows >= 3 ? '#ffd977' : '#fff8da', 1.15);
    if (result.credited && state.cleanWeave) {
      window.setTimeout(() => {
        if (state.mode === 'playing') addFloater(center.x, center.y + 22, `CLEAN LOOP +${selectedMode.scoring.cleanLoops}`, '#73e8d2', 0.9);
      }, 120);
    }
    if (result.chain) {
      window.setTimeout(() => {
        if (state.mode === 'playing') addFloater(center.x, center.y + 43, `QUICK CHAIN +${selectedMode.scoring.chainLinks}`, '#ffd977', 0.9);
      }, 170);
    }
    if (result.targetMatch) {
      window.setTimeout(() => {
        if (state.mode === 'playing') {
          const matchedIndex = selectedMode.targetVertices.indexOf(result.matchedTarget);
          addFloater(
            center.x,
            center.y + 64,
            `${CONSTELLATION_SYMBOLS[matchedIndex]} MATCH +${selectedMode.scoring.targetMatches}`,
            '#d6a7ff',
            1
          );
        }
      }, 210);
    }
    if (caught.length > scoredShadows) {
      showToast('Three shadows scored. Every captured shade still blooms.', false, 1.9);
    }

    audio.close(caught.length + (result.seal ? 3 : 0), state.cleanWeave);
    mobileHaptic(result.seal ? [16, 24, 28] : caught.length >= 3 ? [12, 18, 18] : [9, 18, 14]);
    burst(center.x, center.y, '#ffd977', 18 + caught.length * 5, 190);
    state.shake = reducedMotion ? 0 : Math.min(15, 3 + caught.length * 2.2 + (result.seal ? 5 : 0));
    state.flash = Math.min(0.7, 0.1 + caught.length * 0.04 + (result.seal ? 0.25 : 0));
    state.enemies = state.enemies.filter((enemy) => !enemy.dead);
    clearWeave();
    replenishArcadeFlowers(usedIds);
    maintainArcadeThreatFloor(false);
    updateObjective();

    if (result.seal && state.seals >= selectedMode.requiredSeals) finishRun(true);
  }

  function sealWeave(polygon) {
    if (isArcadeMode) {
      sealArcadeWeave(polygon);
      return;
    }
    const now = state.runTime;
    const rescuedFray = state.frayTimer > 0;
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
      state.wildBlooms.push({ x: enemy.x, y: enemy.y, hue: 145 + cosmeticRandom() * 190, size: 0.8 + cosmeticRandom() * 0.7, age: 0 });
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
      hue: 154 + cosmeticRandom() * 170,
      age: 0,
      strength: clamp(0.18 + caught.length * 0.025, 0.18, 0.34)
    });
    while (state.regions.length > getVisualBudget().awakeningMarks) state.regions.shift();
    addClosureSpectacle(polygon, caught.length, newBlooms);

    if (state.phaseIndex === 0) {
      state.phaseProgress = 1;
      state.tutorialStep = 3;
    } else if (!phaseDefs[state.phaseIndex].boss) {
      state.phaseProgress += progressGain + (newBlooms > 0 ? 1 : 0);
    }

    audio.close(caught.length, state.cleanWeave);
    mobileHaptic(bossHit ? [16, 24, 28] : [9, 18, 14]);
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
    if (rescuedFray) {
      state.toastTimer = 0;
      ui.toast.classList.remove('is-visible', 'is-warning');
    }
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
    } else if (rescuedFray) {
      showToast('THREAD HELD — loop sealed!', false, 1.35);
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

  function addClosureSpectacle(polygon, caughtCount = 0, newBlooms = 0) {
    if (!polygon.length) return;
    const budget = getVisualBudget();
    const center = polygonCentroid(polygon);
    const radius = clamp(
      Math.max(...polygon.map((point) => distance(point, center))) + 18,
      46,
      Math.min(W, H) * 0.38
    );
    const hue = 42 + hash01(state.loops * 17 + caughtCount * 31 + newBlooms * 7) * 128;
    state.closureWaves.push({
      x: center.x,
      y: center.y,
      points: polygon.map((point) => ({ x: point.x, y: point.y })),
      radius,
      hue,
      age: 0,
      duration: reducedMotion ? 0.82 : 1.18,
      strength: clamp(0.58 + caughtCount * 0.06, 0.58, 0.9)
    });
    while (state.closureWaves.length > budget.closureWaves) state.closureWaves.shift();

    state.awakeningMarks.push({
      x: center.x,
      y: center.y,
      hue: 118 + hash01(state.loops * 43 + polygon.length * 11) * 176,
      size: clamp(0.82 + polygon.length * 0.055 + caughtCount * 0.06, 0.82, 1.55),
      petals: 5 + (state.loops % 3),
      phase: hash01(state.loops * 71 + 3) * TAU,
      age: 0,
      caught: caughtCount
    });
    while (state.awakeningMarks.length > budget.awakeningMarks) state.awakeningMarks.shift();
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
    const bounds = getEnemyBounds(enemy.radius);
    if (enemy.x < bounds.left) { enemy.x = bounds.left; enemy.vx = Math.abs(enemy.vx); }
    if (enemy.x > bounds.right) { enemy.x = bounds.right; enemy.vx = -Math.abs(enemy.vx); }
    if (enemy.y < bounds.top) { enemy.y = bounds.top; enemy.vy = Math.abs(enemy.vy); }
    if (enemy.y > bounds.bottom) { enemy.y = bounds.bottom; enemy.vy = -Math.abs(enemy.vy); }
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
    mobileHaptic(32);
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
      const dawnParticleCount = reducedMotion ? 24 : isMobileProfile() ? 52 : 90;
      for (let i = 0; i < dawnParticleCount; i++) {
        addParticle(cosmeticRandom() * W, H + cosmeticRandom() * 100, {
          color: cosmeticRandom() > 0.45 ? '#ffd977' : '#73e8d2',
          size: 2 + cosmeticRandom() * 4,
          life: 2.2 + cosmeticRandom() * 2,
          vx: (cosmeticRandom() - 0.5) * 60,
          vy: -80 - cosmeticRandom() * 180,
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
      applyGoldenFiber();
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

  function buildRunProof() {
    if (!isArcadeMode) {
      return {
        loops: state.loops,
        shadows: state.shadows,
        phase: state.phaseIndex
      };
    }
    const proof = {
      loops: state.loops,
      totalVertices: state.totalVertices,
      shadows: state.shadows,
      cleanLoops: state.cleanLoops,
      chainLinks: state.chainLinks,
      elapsedMs: state.arcadeElapsedMs,
      petals: Math.max(0, state.lives)
    };
    if (isShiftingConstellation) proof.targetMatches = state.targetMatches;
    if (isHollowRush) {
      proof.seals = state.seals;
      proof.remainingMs = Math.max(0, selectedMode.durationMs - state.arcadeElapsedMs);
      proof.baseScore = arcadeBaseScore();
    }
    return proof;
  }

  function finishRun(victory) {
    if (state.mode === 'result') return;
    if (isArcadeMode) {
      if (isTimedArcadeMode) {
        if (victory) {
          state.arcadeClockMs = selectedMode.durationMs;
          state.arcadeElapsedMs = selectedMode.durationMs;
          state.phaseTime = 0;
          state.lives = Math.max(1, state.lives);
        } else {
          state.arcadeClockMs = Math.min(state.arcadeClockMs, selectedMode.durationMs - 1);
          state.arcadeElapsedMs = Math.min(
            selectedMode.durationMs - 1,
            Math.max(0, Math.floor(state.arcadeClockMs))
          );
          state.lives = 0;
        }
      } else {
        state.arcadeClockMs = Math.min(selectedMode.durationMs, Math.max(0, state.arcadeClockMs));
        state.arcadeElapsedMs = state.arcadeClockMs >= selectedMode.durationMs
          ? selectedMode.durationMs
          : Math.min(selectedMode.durationMs - 1, Math.max(0, Math.floor(state.arcadeClockMs)));
        state.phaseTime = Math.max(0, (selectedMode.durationMs - state.arcadeClockMs) / 1000);
        if (victory) {
          state.seals = selectedMode.requiredSeals;
          state.phaseProgress = state.seals;
          state.lives = Math.max(1, state.lives);
        }
      }
      state.score = arcadeBaseScore();
    }
    state.completed = victory;
    state.mode = 'result';
    clearWeave();
    const proof = buildRunProof();
    const verifiedRemixScore = isArcadeMode
      ? modeRules.recomputeResult(selectedModeId, proof, Boolean(victory))
      : null;
    const proofValid = !isArcadeMode || Number.isSafeInteger(verifiedRemixScore);
    const roundedScore = isArcadeMode && proofValid
      ? verifiedRemixScore
      : Math.round(state.score);
    state.score = roundedScore;
    if (!isGroveHosted) {
      const previousBest = state.best;
      state.best = Math.max(state.best, roundedScore);
      if (state.best > previousBest) writeBest(state.best);
    }
    const rank = getRank(victory, state.score);

    const grovePayload = {
      victory: Boolean(victory),
      score: roundedScore,
      stats: proof,
      assist: { preset: 'standard', scoreChanging: false }
    };
    const completionPublished = isGroveHosted && proofValid
      ? publishGroveRunComplete(grovePayload)
      : !isGroveHosted;

    ui.resultSymbol.textContent = victory ? '✦' : '◇';
    ui.resultKicker.textContent = isGroveHosted
      ? 'SAVING IN THE GROVE'
      : victory
        ? 'DAWN REMEMBERS YOUR NAME'
        : 'THE GARDEN HOLDS YOUR LIGHT';
    ui.resultTitle.textContent = isPetalRush
      ? victory
        ? 'Ninety seconds. Still glowing.'
        : 'One more bright loop.'
      : isShiftingConstellation
        ? victory
          ? 'The constellation holds.'
          : 'The stars will turn again.'
        : isHollowRush
          ? victory
            ? 'The Guardian opens.'
            : 'The Hollow keeps its crown.'
          : victory
            ? 'The garden wakes.'
            : 'The night was deep.';
    ui.resultCopy.textContent = isGroveHosted
      ? completionPublished
        ? isArcadeMode
          ? `Your exact ${selectedMode.name} proof is waiting for the Grove to take root.`
          : 'Your exact run is waiting for the Grove to confirm its roots.'
        : proofValid
          ? 'The run could not be sent safely. Return to the Grove and try again.'
          : 'This run did not produce valid proof and will not alter the Grove.'
      : victory
        ? 'Every closed thread became a place where morning could begin.'
        : 'Every flower you woke remains. The loomwing can always try another path.';
    ui.resultRank.textContent = rank;
    ui.resultScore.textContent = formatNumber(state.score);
    ui.resultBestLabel.textContent = isGroveHosted ? 'SAVE' : 'BEST';
    ui.resultBest.textContent = isGroveHosted ? 'WAITING' : formatNumber(state.best);
    ui.resultLoops.textContent = String(state.loops);
    ui.resultShadows.textContent = String(state.shadows);
    if (isGroveHosted) {
      ui.replayButton.disabled = true;
      ui.homeButton.disabled = true;
      if (!proofValid) {
        ui.replayButton.disabled = isTrialRun;
        ui.homeButton.disabled = false;
        ui.replayButton.setAttribute('aria-label', `Restart ${selectedMode.name}`);
      }
      ui.replayButton.querySelector('span').textContent = 'SAVING…';
      if (isTrialRun) {
        ui.replayButton.querySelector('i')?.setAttribute('hidden', '');
        ui.replayButton.setAttribute('aria-label', 'Trial run saving. Continue in the Grove after confirmation.');
      }
    }
    openDialog(ui.resultOverlay, isTrialRun ? null : ui.replayButton);
  }

  function finalizeHostedResult(phase) {
    if (!isGroveHosted || !['saved', 'unsaved', 'pending'].includes(phase)) return;
    const saved = phase === 'saved';
    const pending = phase === 'pending';
    ui.resultKicker.textContent = pending
      ? 'SAVE PAUSED IN THE GROVE'
      : saved
        ? 'ROOTED IN THE GROVE'
        : 'UNSAVED RUN';
    ui.resultCopy.textContent = pending
      ? 'The Grove is holding this exact score safely. Use its Retry Save choice before leaving.'
      : saved
        ? state.completed
          ? isArcadeMode
            ? `The Grove confirmed every ${selectedMode.name} point before showing it.`
            : 'The Grove confirmed this dawn before showing it.'
          : 'The Grove confirmed every point that took root.'
        : 'You can see this run, but it did not change Best, Tree Total, growth, or unlocks.';
    ui.resultBestLabel.textContent = 'STATUS';
    ui.resultBest.textContent = pending ? 'WAITING' : saved ? 'SAVED' : 'UNSAVED';
    ui.replayButton.disabled = pending || isTrialRun;
    ui.homeButton.disabled = pending;
    ui.replayButton.querySelector('span').textContent = isTrialRun
      ? 'TRIAL RUN COMPLETE · CONTINUE IN THE GROVE'
      : isArcadeMode
        ? `PLAY ${selectedMode.name.toUpperCase()} AGAIN`
        : 'WEAVE ANOTHER NIGHT';
    if (isTrialRun) {
      ui.replayButton.querySelector('i')?.setAttribute('hidden', '');
      ui.replayButton.setAttribute('aria-label', 'Trial run complete. Continue in the Grove.');
    } else {
      ui.replayButton.querySelector('i')?.removeAttribute('hidden');
      ui.replayButton.setAttribute('aria-label', isArcadeMode ? `Play ${selectedMode.name} again` : 'Weave another night');
    }
    if (!pending) {
      window.setTimeout(() => (isTrialRun ? ui.homeButton : ui.replayButton).focus({ preventScroll: true }), 60);
    }
  }

  function getRank(victory, score) {
    if (isPetalRush) {
      if (victory && score >= 30000) return 'QUICK BLOOM MASTER';
      if (victory && score >= 15000) return 'PETAL COMET';
      if (victory) return 'BRIGHT SURVIVOR';
      if (score >= 9000) return 'CHAIN WEAVER';
      if (score >= 3500) return 'BLOOM RUNNER';
      return 'FIRST SPARK';
    }
    if (isShiftingConstellation) {
      if (victory && score >= 60000) return 'STARLOOM MASTER';
      if (victory && score >= 25000) return 'WILD ORBIT';
      if (victory) return 'CONSTELLATION KEEPER';
      if (score >= 12000) return 'SHAPE WEAVER';
      if (score >= 4500) return 'STAR FINDER';
      return 'FIRST ORBIT';
    }
    if (isHollowRush) {
      if (victory && score >= 30000) return 'CROWNWEAVER';
      if (victory) return 'GUARDIAN BINDER';
      if (state.seals >= 2) return 'SECOND SEAL';
      if (state.seals >= 1) return 'FIRST SEAL';
      return 'HOLLOW WALKER';
    }
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
    if (isArcadeMode) {
      const remainingSeconds = Math.max(0, Math.ceil((selectedMode.durationMs - state.arcadeClockMs) / 1000));
      if (isShiftingConstellation) {
        const target = selectedMode.targetVertices[state.targetIndex];
        const symbol = CONSTELLATION_SYMBOLS[state.targetIndex];
        ui.objectiveKicker.textContent = `WILD BLOOM / ${Math.floor(remainingSeconds / 60)}:${String(remainingSeconds % 60).padStart(2, '0')}`;
        ui.objectiveText.textContent = `${symbol} ${target}`;
        ui.objectiveProgress.textContent = `${state.targetMatches} MATCH${state.targetMatches === 1 ? '' : 'ES'}`;
        ui.objectiveCard.setAttribute('aria-label', `Target shape: clean loop with ${target} flowers. ${remainingSeconds} seconds remain.`);
        return;
      }
      if (isHollowRush) {
        const seals = Array.from({ length: selectedMode.requiredSeals }, (_, index) => (
          index < state.seals ? '\u25C6' : '\u25C7'
        )).join(' ');
        ui.objectiveKicker.textContent = `CROWN BLOOM / ${Math.floor(remainingSeconds / 60)}:${String(remainingSeconds % 60).padStart(2, '0')}`;
        ui.objectiveText.textContent = seals;
        ui.objectiveProgress.textContent = `${state.seals} / ${selectedMode.requiredSeals} SEALS`;
        ui.objectiveCard.setAttribute('aria-label', `Guardian seals: ${state.seals} of ${selectedMode.requiredSeals}. ${remainingSeconds} seconds remain.`);
        return;
      }
      ui.objectiveCard.setAttribute('aria-label', `${remainingSeconds} seconds remain. Close loops and keep at least one petal.`);
      ui.objectiveKicker.textContent = `QUICK BLOOM · ${Math.floor(remainingSeconds / 60)}:${String(remainingSeconds % 60).padStart(2, '0')}`;
      ui.objectiveText.textContent = isMobileProfile()
        ? 'Close loops · keep a petal'
        : 'Close bright loops and keep at least one petal';
      ui.objectiveProgress.textContent = `${state.loops} LOOP${state.loops === 1 ? '' : 'S'}`;
      return;
    }
    const phase = phaseDefs[state.phaseIndex];
    const mobile = isMobileProfile();
    if (state.phaseIndex === 0) {
      if (!state.chain.length && state.phaseProgress === 0) {
        ui.objectiveText.textContent = mobile ? 'Find a gold bloom' : 'Glide to a flower and take up the thread';
        ui.objectiveProgress.textContent = mobile ? '✦' : 'SPACE / CLICK';
      } else if (state.chain.length < 3 && state.phaseProgress === 0) {
        ui.objectiveText.textContent = mobile
          ? `${3 - state.chain.length} bloom${3 - state.chain.length === 2 ? 's' : ''} to go`
          : `Touch ${3 - state.chain.length} more flower${3 - state.chain.length === 1 ? '' : 's'} to pin the loom`;
        ui.objectiveProgress.textContent = `${state.chain.length} / 3`;
      } else if (state.phaseProgress === 0) {
        ui.objectiveText.textContent = mobile ? 'Return to gold' : 'Return to the golden first flower';
        ui.objectiveProgress.textContent = mobile ? '✦' : 'SEAL IT';
      } else {
        ui.objectiveText.textContent = mobile ? 'First bloom awake' : 'The first part of the garden remembers';
        ui.objectiveProgress.textContent = '1 / 1';
      }
      ui.objectiveKicker.textContent = 'THE FIRST THREAD';
    } else if (phase.boss) {
      ui.objectiveKicker.textContent = 'CLOSE THE DARKNESS THREE TIMES';
      ui.objectiveText.textContent = mobile
        ? (state.phaseProgress === 0 ? 'Enclose the Hollow' : 'Seal it again')
        : (state.phaseProgress === 0 ? 'Enclose the Hollow in a sealed weave' : 'Its shell is cracked. Weave it again.');
      ui.objectiveProgress.textContent = `${state.phaseProgress} / 3`;
    } else {
      const time = Math.max(0, Math.ceil(state.phaseTime));
      ui.objectiveKicker.textContent = `GATHER BLOOMLIGHT · ${Math.floor(time / 60)}:${String(time % 60).padStart(2, '0')}`;
      ui.objectiveText.textContent = mobile ? 'Wake blooms' : 'Seal shadows and wake new flowers';
      ui.objectiveProgress.textContent = `${Math.min(state.phaseProgress, state.phaseTarget)} / ${state.phaseTarget}`;
    }
  }

  function updateHud() {
    const phaseTitle = isArcadeMode
      ? selectedMode.name.toUpperCase()
      : phaseDefs[state.phaseIndex]?.title || 'LUMENLOOM';
    ui.phaseName.textContent = isMobileProfile()
      ? ({ 'FIRST STITCH': 'STITCH', 'THE HOLLOW': 'HOLLOW' }[phaseTitle] || phaseTitle)
      : phaseTitle;
    ui.scoreValue.textContent = formatNumber(state.score);
    ui.bestValue.textContent = isPetalRush
      ? '90 SECOND SCORE ATTACK'
      : isShiftingConstellation
        ? `TARGET MATCHES ${state.targetMatches}`
        : isHollowRush
          ? `GUARDIAN SEALS ${state.seals} / ${selectedMode.requiredSeals}`
          : `BEST ${formatNumber(Math.max(state.best, state.score))}`;
    const lumenPercent = clamp(state.lumen / state.maxLumen * 100, 0, 100);
    ui.lumenFill.style.width = `${lumenPercent}%`;
    ui.lumenFill.classList.toggle('is-low', lumenPercent < 24 || state.frayTimer > 0);
    ui.lumenValue.textContent = String(Math.round(state.lumen));
    [...ui.petalDisplay.children].forEach((petal, index) => petal.classList.toggle('is-lost', index >= state.lives));
    ui.healthValue.textContent = `${state.lives} / 3`;
    ui.petalDisplay.setAttribute('aria-label', `Health, ${state.lives} of 3 petals`);
    ui.wardIndicator.classList.toggle('is-hidden', !state.upgrades.ward);
    const weaving = state.chain.length > 0;
    ui.weaveButtonLabel.textContent = weaving ? 'RELEASE' : 'WEAVE';
    ui.weaveButton.classList.toggle('is-cancel', weaving);
    ui.weaveButton.setAttribute('aria-label', weaving ? 'Release and close the weave' : 'Begin weaving');
    const multiplier = 1 + state.comboStack * 0.25;
    ui.comboBadge.classList.toggle('is-hidden', state.comboStack <= 0 || state.mode === 'title');
    ui.comboValue.textContent = isArcadeMode
      ? `${state.comboStack + 1} LOOP CHAIN`
      : `×${multiplier.toFixed(2).replace(/0$/, '')}`;
    const progress = isShiftingConstellation
      ? clamp((selectedMode.targetWindowMs - state.targetClockMs) / selectedMode.targetWindowMs * 100, 0, 100)
      : state.phaseTarget
        ? clamp(state.phaseProgress / state.phaseTarget * 100, 0, 100)
        : 0;
    ui.objectiveFill.style.width = `${progress}%`;
    updateObjective();
  }

  function addParticle(x, y, options = {}) {
    const particleCap = getVisualBudget().trailParticles;
    if (state.particles.length >= particleCap) state.particles.shift();
    state.particles.push({
      x,
      y,
      vx: options.vx ?? (cosmeticRandom() - 0.5) * 80,
      vy: options.vy ?? (cosmeticRandom() - 0.5) * 80,
      life: options.life ?? 0.7,
      maxLife: options.life ?? 0.7,
      size: options.size ?? 2.4,
      color: options.color ?? '#ffd977',
      gravity: options.gravity ?? 8,
      drag: options.drag ?? 0.985,
      shape: options.shape ?? (cosmeticRandom() > 0.75 ? 'diamond' : 'circle')
    });
  }

  function burst(x, y, color, count, speed) {
    count = reducedMotion ? Math.ceil(count * 0.35) : count;
    for (let i = 0; i < count; i++) {
      const angle = cosmeticRandom() * TAU;
      const velocity = speed * (0.28 + cosmeticRandom() * 0.72);
      addParticle(x, y, {
        color,
        size: 1.5 + cosmeticRandom() * 3.6,
        life: 0.42 + cosmeticRandom() * 0.85,
        vx: Math.cos(angle) * velocity,
        vy: Math.sin(angle) * velocity,
        gravity: 10 + cosmeticRandom() * 18
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
    state.closureWaves.forEach((wave) => { wave.age += dt; });
    state.closureWaves = state.closureWaves.filter((wave) => wave.age < wave.duration);
    state.awakeningMarks.forEach((mark) => { mark.age += dt; });
    const budget = getVisualBudget();
    if (state.awakeningMarks.length > budget.awakeningMarks) {
      state.awakeningMarks = state.awakeningMarks.slice(-budget.awakeningMarks);
    }
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
    const shakeTick = Math.floor(state.runTime * 60);
    const shakeX = state.shake ? (hash01(shakeTick * 2 + 1) - 0.5) * state.shake : 0;
    const shakeY = state.shake ? (hash01(shakeTick * 2 + 2) - 0.5) * state.shake : 0;
    ctx.save();
    ctx.translate(shakeX, shakeY);
    drawBackground();
    drawRegions();
    drawAwakeningMarks();
    drawWildBlooms();
    drawClosureWaves();
    drawThread();
    drawAnchors();
    drawEnemies();
    drawHollowForeground();
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

    drawPhaseAtmosphere();

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
    const fireflyLimit = Math.min(state.fireflies.length, getVisualBudget().atmosphereMotifs + 10);
    for (let i = 0; i < fireflyLimit; i++) {
      const f = state.fireflies[i];
      const alpha = 0.18 + (Math.sin(f.phase * 2.2) + 1) * 0.17;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = f.color;
      ctx.shadowColor = ctx.fillStyle;
      ctx.shadowBlur = 9;
      ctx.beginPath();
      ctx.arc(f.x, f.y, f.radius, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawPhaseAtmosphere() {
    const phaseKey = PHASE_ATMOSPHERES[state.phaseIndex] || PHASE_ATMOSPHERES[0];
    const motifCount = getVisualBudget().atmosphereMotifs;
    const time = reducedMotion ? 0 : state.runTime;

    ctx.save();
    if (phaseKey === 'first-stitch') {
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = 'rgba(179, 231, 218, .16)';
      ctx.fillStyle = '#fff1b8';
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      for (let i = 0; i < motifCount; i++) {
        const x = W * (0.1 + hash01(i * 29 + 1) * 0.8);
        const y = H * (0.14 + hash01(i * 31 + 7) * 0.68);
        if (i < 7) i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
        const pulse = reducedMotion ? 1 : 0.8 + Math.sin(time * 1.15 + i) * 0.2;
        ctx.moveTo(x + 1.5, y);
        ctx.arc(x, y, (i % 4 === 0 ? 1.8 : 1) * pulse, 0, TAU);
      }
      ctx.globalAlpha = 0.55;
      ctx.stroke();
      ctx.globalAlpha = 0.72;
      ctx.fill();
    } else if (phaseKey === 'murmurs') {
      ctx.globalCompositeOperation = 'screen';
      ctx.lineCap = 'round';
      for (let i = 0; i < motifCount; i++) {
        const y = H * (0.18 + hash01(i * 19 + 2) * 0.7);
        const drift = reducedMotion ? 0 : Math.sin(time * 0.18 + i * 0.9) * W * 0.035;
        const x = W * (hash01(i * 47 + 5) * 0.86 - 0.08) + drift;
        const length = W * (0.11 + hash01(i * 13 + 8) * 0.18);
        ctx.globalAlpha = 0.035 + (i % 3) * 0.012;
        ctx.strokeStyle = i % 2 ? '#9fd9cf' : '#b7addc';
        ctx.lineWidth = 5 + (i % 3) * 3;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.bezierCurveTo(x + length * 0.28, y - 13, x + length * 0.7, y + 13, x + length, y);
        ctx.stroke();
      }
    } else if (phaseKey === 'hunger') {
      const pulse = reducedMotion ? 0.42 : 0.38 + Math.sin(time * 0.85) * 0.045;
      const hungerVignette = ctx.createRadialGradient(W * 0.5, H * 0.5, Math.min(W, H) * 0.16, W * 0.5, H * 0.5, Math.max(W, H) * 0.66);
      hungerVignette.addColorStop(0, 'rgba(4, 3, 17, 0)');
      hungerVignette.addColorStop(1, `rgba(22, 4, 37, ${pulse})`);
      ctx.fillStyle = hungerVignette;
      ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = 'rgba(125, 85, 155, .16)';
      ctx.lineWidth = 2;
      for (let i = 0; i < motifCount; i++) {
        const edge = i % 2 ? 0 : W;
        const direction = edge === 0 ? 1 : -1;
        const y = H * hash01(i * 23 + 4);
        const reach = W * (0.045 + hash01(i * 41 + 6) * 0.07);
        ctx.beginPath();
        ctx.moveTo(edge, y);
        ctx.quadraticCurveTo(edge + direction * reach * 0.65, y - 12, edge + direction * reach, y + 8);
        ctx.lineTo(edge + direction * reach * 0.66, y + 2);
        ctx.stroke();
      }
    } else if (phaseKey === 'crosswind') {
      ctx.globalCompositeOperation = 'screen';
      ctx.lineCap = 'round';
      const travel = reducedMotion ? 0 : (time * 34) % (W * 0.34);
      for (let i = 0; i < motifCount; i++) {
        const baseX = -W * 0.22 + hash01(i * 37 + 9) * W * 1.2 + travel;
        const baseY = H * (0.12 + hash01(i * 17 + 3) * 0.76);
        const length = Math.min(W, H) * (0.13 + hash01(i * 11 + 5) * 0.12);
        ctx.globalAlpha = 0.055 + (i % 4) * 0.018;
        ctx.strokeStyle = i % 3 ? '#b2d7e2' : '#e7c5e7';
        ctx.lineWidth = 1 + (i % 3) * 0.7;
        ctx.beginPath();
        ctx.moveTo(baseX, baseY);
        ctx.quadraticCurveTo(baseX + length * 0.48, baseY - length * 0.24, baseX + length, baseY - length * 0.46);
        ctx.stroke();
      }
    } else {
      drawHollowAtmosphere(motifCount, time);
    }
    ctx.restore();

    if (state.dawn > 0) drawDawnAtmosphere();
  }

  function drawHollowAtmosphere(motifCount, time) {
    const boss = state.enemies.find((enemy) => enemy.type === 'boss' && !enemy.dead);
    const focus = boss || { x: playBounds.centerX, y: playBounds.centerY };
    const sealProgress = clamp(state.phaseProgress / 3, 0, 1);
    const reach = 0.84 - sealProgress * 0.36;
    const shadow = ctx.createRadialGradient(focus.x, focus.y, 18, focus.x, focus.y, Math.min(W, H) * (0.46 - sealProgress * 0.1));
    shadow.addColorStop(0, `rgba(2, 1, 9, ${0.55 - sealProgress * 0.24})`);
    shadow.addColorStop(0.58, `rgba(8, 3, 18, ${0.32 - sealProgress * 0.16})`);
    shadow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = shadow;
    ctx.fillRect(0, 0, W, H);

    ctx.lineCap = 'round';
    const rootCount = Math.min(motifCount, 14);
    for (let i = 0; i < rootCount; i++) {
      const fromSide = i % 4;
      const along = 0.08 + hash01(i * 53 + 12) * 0.84;
      const start = fromSide === 0 ? { x: 0, y: H * along }
        : fromSide === 1 ? { x: W, y: H * along }
          : fromSide === 2 ? { x: W * along, y: 0 }
            : { x: W * along, y: H };
      const endX = lerp(start.x, focus.x, reach * (0.74 + hash01(i * 7 + 2) * 0.18));
      const endY = lerp(start.y, focus.y, reach * (0.74 + hash01(i * 7 + 2) * 0.18));
      const bend = (hash01(i * 31 + 7) - 0.5) * Math.min(W, H) * 0.22;
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 0.54 - sealProgress * 0.2;
      ctx.strokeStyle = i % 3 ? '#090714' : '#140a20';
      ctx.lineWidth = Math.max(2, 8 - i * 0.35);
      ctx.beginPath();
      ctx.moveTo(start.x, start.y);
      ctx.quadraticCurveTo((start.x + endX) / 2 + bend, (start.y + endY) / 2 - bend * 0.35, endX, endY);
      ctx.stroke();
    }

    if (sealProgress > 0) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = '#ffd977';
      ctx.shadowColor = '#ffd977';
      ctx.shadowBlur = 10;
      for (let i = 0; i < Math.round(sealProgress * 9); i++) {
        const angle = hash01(i * 73 + 4) * TAU;
        const inner = 32 + hash01(i * 17 + 2) * 20;
        const outer = inner + 20 + hash01(i * 43 + 8) * 34;
        ctx.globalAlpha = 0.18 + sealProgress * 0.24;
        ctx.lineWidth = 1.1;
        ctx.beginPath();
        ctx.moveTo(focus.x + Math.cos(angle) * inner, focus.y + Math.sin(angle) * inner);
        ctx.lineTo(focus.x + Math.cos(angle + 0.08) * outer, focus.y + Math.sin(angle + 0.08) * outer);
        ctx.stroke();
      }
    }

    if (!reducedMotion && sealProgress < 1) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.05 + Math.sin(time * 0.8) * 0.015;
      ctx.strokeStyle = '#9279d8';
      ctx.lineWidth = 18;
      ctx.beginPath();
      ctx.arc(focus.x, focus.y, Math.min(W, H) * (0.2 + sealProgress * 0.035), 0, TAU);
      ctx.stroke();
    }
  }

  function drawDawnAtmosphere() {
    const dawn = clamp(state.dawn, 0, 1);
    const horizonStage = easeOut(clamp(dawn / 0.42, 0, 1));
    const rayStage = easeInOut(clamp((dawn - 0.18) / 0.56, 0, 1));
    const bloomStage = easeOut(clamp((dawn - 0.52) / 0.48, 0, 1));
    const sunX = W * 0.5;
    const sunY = H * 0.18;

    ctx.save();
    const horizon = ctx.createLinearGradient(0, H, 0, H * 0.08);
    horizon.addColorStop(0, `rgba(255, 190, 117, ${0.24 * horizonStage})`);
    horizon.addColorStop(0.52, `rgba(255, 220, 166, ${0.09 * horizonStage})`);
    horizon.addColorStop(1, 'rgba(255, 239, 193, 0)');
    ctx.fillStyle = horizon;
    ctx.fillRect(0, 0, W, H);

    ctx.globalCompositeOperation = 'lighter';
    const sun = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, Math.min(W, H) * 0.34);
    sun.addColorStop(0, `rgba(255, 249, 205, ${0.38 * horizonStage})`);
    sun.addColorStop(0.16, `rgba(255, 215, 125, ${0.2 * horizonStage})`);
    sun.addColorStop(1, 'rgba(255, 186, 102, 0)');
    ctx.fillStyle = sun;
    ctx.fillRect(0, 0, W, H);

    ctx.translate(sunX, sunY);
    for (let i = 0; i < 10; i++) {
      const angle = -Math.PI * 0.92 + i / 9 * Math.PI * 0.84;
      const length = Math.max(W, H) * (0.55 + hash01(i * 29 + 5) * 0.3);
      ctx.globalAlpha = rayStage * (0.025 + (i % 3) * 0.012);
      ctx.fillStyle = '#fff0b0';
      ctx.beginPath();
      ctx.moveTo(Math.cos(angle - 0.022) * 16, Math.sin(angle - 0.022) * 16);
      ctx.lineTo(Math.cos(angle) * length, Math.sin(angle) * length);
      ctx.lineTo(Math.cos(angle + 0.022) * 16, Math.sin(angle + 0.022) * 16);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();

    if (bloomStage > 0) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const motifCount = Math.min(getVisualBudget().atmosphereMotifs, 14);
      for (let i = 0; i < motifCount; i++) {
        const x = W * (0.08 + hash01(i * 61 + 9) * 0.84);
        const baseY = H * (0.24 + hash01(i * 47 + 3) * 0.68);
        const lift = reducedMotion ? 0 : (state.runTime * (9 + i % 4) + i * 23) % 68;
        const y = baseY - lift;
        ctx.globalAlpha = bloomStage * (0.12 + (i % 4) * 0.035);
        ctx.fillStyle = i % 3 ? '#ffd977' : '#73e8d2';
        ctx.beginPath();
        ctx.ellipse(x, y, 1.4, 3.2, hash01(i * 13) * TAU, 0, TAU);
        ctx.fill();
      }
      ctx.restore();
    }
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

  function drawAwakeningMarks() {
    for (let index = 0; index < state.awakeningMarks.length; index++) {
      const mark = state.awakeningMarks[index];
      const growth = easeOut(clamp(mark.age / 0.9, 0, 1));
      const scale = mark.size * growth;
      if (scale <= 0) continue;
      ctx.save();
      ctx.translate(mark.x, mark.y);
      ctx.rotate(mark.phase);
      ctx.scale(scale, scale);

      ctx.globalAlpha = 0.18 + Math.min(0.2, mark.caught * 0.025);
      ctx.strokeStyle = `hsl(${mark.hue} 54% 62%)`;
      ctx.lineWidth = 1.1;
      for (let i = 0; i < mark.petals; i++) {
        const angle = i / mark.petals * TAU;
        const reach = 13 + (i % 2) * 4;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.quadraticCurveTo(Math.cos(angle + 0.32) * reach * 0.55, Math.sin(angle + 0.32) * reach * 0.55, Math.cos(angle) * reach, Math.sin(angle) * reach);
        ctx.stroke();
      }

      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.17 + Math.min(0.14, mark.caught * 0.02);
      ctx.fillStyle = `hsl(${mark.hue + 28} 76% 68%)`;
      ctx.shadowColor = ctx.fillStyle;
      ctx.shadowBlur = 7;
      for (let i = 0; i < mark.petals; i++) {
        const angle = i / mark.petals * TAU;
        ctx.beginPath();
        ctx.ellipse(Math.cos(angle) * 8, Math.sin(angle) * 8, 2.2, 5.5, angle, 0, TAU);
        ctx.fill();
      }
      ctx.globalAlpha = 0.42;
      ctx.fillStyle = '#ffe59a';
      ctx.beginPath();
      ctx.arc(0, 0, 2.2, 0, TAU);
      ctx.fill();
      ctx.restore();
    }
  }

  function drawClosureWaves() {
    for (const wave of state.closureWaves) {
      const life = clamp(wave.age / wave.duration, 0, 1);
      const expansion = reducedMotion ? 0.68 : easeOut(life);
      const fade = reducedMotion ? 1 - life : Math.pow(1 - life, 1.35);
      const radius = wave.radius * (0.24 + expansion * 0.76);

      ctx.save();
      ctx.beginPath();
      wave.points.forEach((point, index) => index ? ctx.lineTo(point.x, point.y) : ctx.moveTo(point.x, point.y));
      ctx.closePath();
      ctx.clip();

      ctx.globalCompositeOperation = 'lighter';
      const glow = ctx.createRadialGradient(wave.x, wave.y, 0, wave.x, wave.y, Math.max(1, radius));
      glow.addColorStop(0, `hsla(${wave.hue}, 92%, 76%, ${0.2 * wave.strength * fade})`);
      glow.addColorStop(0.62, `hsla(${wave.hue + 38}, 88%, 67%, ${0.08 * wave.strength * fade})`);
      glow.addColorStop(1, `hsla(${wave.hue + 58}, 92%, 72%, 0)`);
      ctx.fillStyle = glow;
      ctx.fillRect(wave.x - radius, wave.y - radius, radius * 2, radius * 2);

      ctx.strokeStyle = `hsl(${wave.hue} 92% 78%)`;
      ctx.shadowColor = `hsl(${wave.hue + 25} 95% 72%)`;
      ctx.shadowBlur = 14;
      ctx.globalAlpha = 0.62 * fade;
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.arc(wave.x, wave.y, radius, 0, TAU);
      ctx.stroke();
      ctx.globalAlpha = 0.24 * fade;
      ctx.lineWidth = 5.5;
      ctx.beginPath();
      ctx.arc(wave.x, wave.y, radius * 0.82, 0, TAU);
      ctx.stroke();
      ctx.restore();
    }
  }

  function drawHollowForeground() {
    if (state.phaseIndex !== phaseDefs.length - 1 || state.dawn >= 0.98) return;
    const boss = state.enemies.find((enemy) => enemy.type === 'boss' && !enemy.dead);
    const focus = boss || { x: playBounds.centerX, y: playBounds.centerY };
    const sealProgress = clamp(state.phaseProgress / 3, 0, 1);
    const retreat = 1 - sealProgress * 0.48 - state.dawn * 0.45;

    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = `rgba(5, 3, 13, ${0.78 * retreat})`;
    ctx.lineCap = 'round';
    for (let corner = 0; corner < 4; corner++) {
      const sx = corner % 2 ? W : 0;
      const sy = corner > 1 ? H : 0;
      const directionX = sx ? -1 : 1;
      const directionY = sy ? -1 : 1;
      for (let branch = 0; branch < 3; branch++) {
        const reach = Math.min(W, H) * (0.13 + branch * 0.035) * retreat;
        ctx.lineWidth = 8 - branch * 2;
        ctx.beginPath();
        ctx.moveTo(sx, sy + directionY * branch * 16);
        ctx.quadraticCurveTo(sx + directionX * reach * 0.42, sy + directionY * reach * 0.25, sx + directionX * reach, sy + directionY * reach * (0.72 + branch * 0.12));
        ctx.stroke();
      }
    }

    ctx.globalCompositeOperation = 'lighter';
    for (let seal = 0; seal < 3; seal++) {
      const angle = -Math.PI / 2 + seal / 3 * TAU;
      const radius = 87 + seal * 3;
      const x = focus.x + Math.cos(angle) * radius;
      const y = focus.y + Math.sin(angle) * radius;
      const filled = seal < state.phaseProgress;
      ctx.globalAlpha = filled ? 0.78 : 0.18;
      ctx.strokeStyle = filled ? '#ffd977' : '#8e77b5';
      ctx.fillStyle = filled ? '#fff0a5' : '#312142';
      ctx.shadowColor = filled ? '#ffd977' : '#6e539c';
      ctx.shadowBlur = filled ? 15 : 5;
      ctx.lineWidth = filled ? 2 : 1;
      ctx.beginPath();
      for (let point = 0; point < 4; point++) {
        const a = Math.PI / 4 + point / 4 * TAU;
        const px = x + Math.cos(a) * 7;
        const py = y + Math.sin(a) * 7;
        point ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
      }
      ctx.closePath();
      if (filled) ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
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
    const first = anchorById(state.chain[0]);
    if (!first) return;

    const traceThreadPath = () => {
      ctx.beginPath();
      ctx.moveTo(first.x, first.y);
      for (let i = 1; i < state.chain.length; i++) {
        const anchor = anchorById(state.chain[i]);
        if (anchor) ctx.lineTo(anchor.x, anchor.y);
      }
      ctx.lineTo(state.player.x, state.player.y);
    };

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = fray ? 'rgba(37, 7, 29, .86)' : 'rgba(5, 10, 27, .82)';
    ctx.lineWidth = 9;
    traceThreadPath();
    ctx.stroke();
    ctx.restore();

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    for (const width of [15, 6, 2]) {
      ctx.strokeStyle = threadColor;
      ctx.globalAlpha = width === 15 ? 0.075 : width === 6 ? 0.3 : 0.98;
      ctx.lineWidth = width;
      ctx.shadowColor = threadColor;
      ctx.shadowBlur = width === 2 ? 15 : 5;
      traceThreadPath();
      ctx.stroke();
    }

    if (state.chain.length >= 3) {
      if (first) {
        ctx.globalAlpha = reducedMotion ? 0.22 : 0.22 + Math.sin(state.runTime * 4) * 0.06;
        ctx.strokeStyle = '#ffd977';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([3, 7]);
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

    const glintCount = getVisualBudget().threadGlints;
    if (!fray && glintCount > 0 && segments.length) {
      ctx.globalAlpha = 0.92;
      ctx.fillStyle = '#fffbdc';
      ctx.shadowColor = '#ffd977';
      ctx.shadowBlur = 12;
      for (let i = 0; i < glintCount; i++) {
        const segment = segments[i % segments.length];
        const offset = hash01(i * 37 + state.chain.length * 11);
        const t = (state.runTime * 0.52 + offset) % 1;
        const x = lerp(segment.a.x, segment.b.x, t);
        const y = lerp(segment.a.y, segment.b.y, t);
        ctx.beginPath();
        ctx.arc(x, y, i % 3 === 0 ? 2.2 : 1.25, 0, TAU);
        ctx.fill();
      }
    }

    state.chain.forEach((id, index) => {
      const anchor = anchorById(id);
      if (!anchor) return;
      ctx.save();
      ctx.translate(anchor.x, anchor.y);
      ctx.rotate(Math.PI / 4);
      ctx.globalAlpha = index === 0 ? 0.92 : 0.68;
      ctx.strokeStyle = index === 0 ? '#ffd977' : '#b5fff0';
      ctx.shadowColor = ctx.strokeStyle;
      ctx.shadowBlur = index === 0 ? 15 : 9;
      ctx.lineWidth = index === 0 ? 2 : 1.25;
      const size = index === 0 ? 7 : 5;
      ctx.strokeRect(-size, -size, size * 2, size * 2);
      ctx.restore();
    });
    ctx.restore();
  }

  function getVisualTargetState() {
    if (!state.anchors.length) return { targetAnchorId: null, targetState: 'idle' };
    const firstId = state.chain[0] ?? null;
    if (state.chain.length >= 3) return { targetAnchorId: firstId, targetState: 'closure-ready' };
    if (state.chain.length) {
      let next = null;
      let best = isMobileProfile() ? 96 : 88;
      for (const anchor of state.anchors) {
        if (state.chain.includes(anchor.id)) continue;
        const d = distance(state.player, anchor);
        if (d < best) { best = d; next = anchor; }
      }
      return { targetAnchorId: next?.id ?? firstId, targetState: 'active' };
    }
    const nearby = nearestAvailableAnchor(66);
    return { targetAnchorId: nearby?.id ?? null, targetState: nearby ? 'near' : 'idle' };
  }

  function drawAnchors() {
    const firstId = state.chain[0];
    const visualTarget = getVisualTargetState();
    const closureReady = visualTarget.targetState === 'closure-ready';
    for (let anchorIndex = 0; anchorIndex < state.anchors.length; anchorIndex++) {
      const anchor = state.anchors[anchorIndex];
      const activeIndex = state.chain.indexOf(anchor.id);
      const first = anchor.id === firstId;
      const highlighted = visualTarget.targetState === 'near' && visualTarget.targetAnchorId === anchor.id;
      const nextTarget = visualTarget.targetState === 'active' && visualTarget.targetAnchorId === anchor.id && !first;
      const constellationGuide = isShiftingConstellation && anchorIndex < selectedMode.targetVertices[state.targetIndex];
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

      if (first || highlighted || nextTarget || constellationGuide || (state.phaseIndex === 0 && anchor.guide >= 0 && !state.chain.length)) {
        const ring = reducedMotion ? 31 : 31 + Math.sin(state.runTime * 4 + anchor.phase) * 4;
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = first ? 0.68 : nextTarget ? 0.46 : constellationGuide ? 0.4 : 0.25;
        ctx.strokeStyle = first ? '#ffd977' : nextTarget ? '#9df8e5' : constellationGuide ? '#d6a7ff' : '#fff8da';
        ctx.lineWidth = first ? 1.8 : nextTarget ? 1.4 : 1;
        ctx.beginPath();
        ctx.arc(0, 0, ring, 0, TAU);
        ctx.stroke();
        if (constellationGuide && activeIndex < 0) {
          ctx.globalCompositeOperation = 'source-over';
          ctx.globalAlpha = 0.84;
          ctx.fillStyle = '#ead7ff';
          ctx.font = '800 10px system-ui, sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(String(anchorIndex + 1), 0, -36);
        }

        if (highlighted) {
          ctx.save();
          ctx.rotate(Math.PI / 4);
          ctx.globalAlpha = 0.72;
          ctx.strokeStyle = '#fff1aa';
          ctx.strokeRect(-22, -22, 44, 44);
          ctx.restore();
        }

        if (nextTarget) {
          ctx.globalAlpha = 0.78;
          ctx.strokeStyle = '#b9fff1';
          ctx.lineWidth = 2;
          for (let side = 0; side < 4; side++) {
            ctx.save();
            ctx.rotate(side * Math.PI / 2);
            ctx.beginPath();
            ctx.moveTo(-7, -27);
            ctx.lineTo(0, -21);
            ctx.lineTo(7, -27);
            ctx.stroke();
            ctx.restore();
          }
        }

        if (first) {
          ctx.globalAlpha = closureReady ? 0.94 : 0.72;
          ctx.strokeStyle = '#ffd977';
          ctx.lineWidth = closureReady ? 2.4 : 1.5;
          if (closureReady) ctx.setLineDash([4, 4]);
          ctx.beginPath();
          ctx.arc(0, 0, ring + 8, 0, TAU);
          ctx.stroke();
          ctx.setLineDash([]);
          for (let ray = 0; ray < 8; ray++) {
            const angle = ray / 8 * TAU;
            const inner = closureReady ? ring + 2 : ring + 5;
            const outer = ring + (closureReady ? 13 : 10);
            ctx.beginPath();
            ctx.moveTo(Math.cos(angle) * inner, Math.sin(angle) * inner);
            ctx.lineTo(Math.cos(angle) * outer, Math.sin(angle) * outer);
            ctx.stroke();
          }
          if (closureReady) {
            ctx.globalAlpha = 0.9;
            ctx.fillStyle = '#fff4b8';
            for (let arrow = 0; arrow < 4; arrow++) {
              const angle = arrow / 4 * TAU;
              ctx.save();
              ctx.rotate(angle);
              ctx.beginPath();
              ctx.moveTo(0, -23);
              ctx.lineTo(-4, -30);
              ctx.lineTo(4, -30);
              ctx.closePath();
              ctx.fill();
              ctx.restore();
            }
          }
        }
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
    const breathe = reducedMotion ? 1 : 1 + Math.sin(enemy.phase * 1.4) * 0.035;
    ctx.scale(breathe, breathe);
    const vulnerable = enemy.invulnerable <= 0;
    const sealStage = clamp(3 - enemy.hp, 0, 3);

    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = `rgba(8, 5, 18, ${0.88 - sealStage * 0.12})`;
    ctx.lineCap = 'round';
    for (let limb = 0; limb < 8; limb++) {
      const angle = limb / 8 * TAU + 0.18;
      const inner = enemy.radius * 0.68;
      const length = enemy.radius * (1.28 - sealStage * 0.1 + (limb % 2) * 0.12);
      ctx.lineWidth = 10 - limb % 3 * 2;
      ctx.beginPath();
      ctx.moveTo(Math.cos(angle) * inner, Math.sin(angle) * inner);
      ctx.quadraticCurveTo(
        Math.cos(angle + (limb % 2 ? 0.24 : -0.24)) * length * 0.8,
        Math.sin(angle + (limb % 2 ? 0.24 : -0.24)) * length * 0.8,
        Math.cos(angle) * length,
        Math.sin(angle) * length
      );
      ctx.stroke();
    }
    ctx.restore();

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

    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = `rgba(118, 86, 145, ${0.28 + sealStage * 0.08})`;
    ctx.lineWidth = 1.4;
    for (let plate = 0; plate < 7; plate++) {
      const angle = plate / 7 * TAU - Math.PI / 2;
      ctx.beginPath();
      ctx.arc(Math.cos(angle) * enemy.radius * 0.27, Math.sin(angle) * enemy.radius * 0.27, enemy.radius * 0.54, angle - 0.42, angle + 0.42);
      ctx.stroke();
    }
    ctx.restore();

    if (sealStage > 0) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = '#ffd977';
      ctx.shadowColor = '#ffb36e';
      ctx.shadowBlur = 9;
      ctx.lineWidth = 1.6;
      for (let crack = 0; crack < sealStage * 4; crack++) {
        const angle = hash01(crack * 47 + 9) * TAU;
        const start = 11 + (crack % 3) * 4;
        const end = start + 17 + hash01(crack * 19 + 4) * 14;
        ctx.globalAlpha = 0.42 + sealStage * 0.12;
        ctx.beginPath();
        ctx.moveTo(Math.cos(angle) * start, Math.sin(angle) * start);
        ctx.lineTo(Math.cos(angle + 0.11) * end, Math.sin(angle + 0.11) * end);
        ctx.lineTo(Math.cos(angle - 0.05) * (end + 7), Math.sin(angle - 0.05) * (end + 7));
        ctx.stroke();
      }
      ctx.restore();
    }

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const opening = 8 + sealStage * 7;
    const core = ctx.createRadialGradient(0, 8, 0, 0, 8, opening * 1.6);
    core.addColorStop(0, `rgba(255, 244, 184, ${0.18 + sealStage * 0.2})`);
    core.addColorStop(0.45, `rgba(255, 118, 157, ${0.18 + sealStage * 0.08})`);
    core.addColorStop(1, 'rgba(115, 232, 210, 0)');
    ctx.fillStyle = core;
    ctx.beginPath();
    ctx.ellipse(0, 9, opening * 1.1, opening * 0.72, 0, 0, TAU);
    ctx.fill();
    ctx.restore();

    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = vulnerable ? 0.85 + sealStage * 0.04 : 0.3;
    ctx.fillStyle = '#ffd977';
    ctx.shadowColor = '#ff769d';
    ctx.shadowBlur = 18;
    ctx.beginPath();
    ctx.ellipse(-16, -5, 7, 2.5, -0.15, 0, TAU);
    ctx.ellipse(16, -5, 7, 2.5, 0.15, 0, TAU);
    ctx.fill();

    ctx.globalAlpha = 0.52 + sealStage * 0.12;
    ctx.strokeStyle = sealStage >= 2 ? '#fff0a6' : '#9279d8';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-22, -22);
    ctx.quadraticCurveTo(-9, -34 - sealStage * 2, 0, -25);
    ctx.quadraticCurveTo(9, -34 - sealStage * 2, 22, -22);
    ctx.stroke();
    ctx.restore();
  }

  function drawPlayer() {
    const p = state.player;
    const blink = p.invulnerable > 0 && Math.floor(p.invulnerable * 12) % 2 === 0;
    if (blink) return;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.facing);
    ctx.scale(isMobileProfile() ? 1.08 : 1, isMobileProfile() ? 1.08 : 1);
    const flap = reducedMotion ? 0 : Math.sin(p.wing) * 0.38;
    const flight = clamp(Math.hypot(p.vx, p.vy) / 235, 0, 1);

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const aura = ctx.createRadialGradient(0, 0, 2, 0, 0, 28 + flight * 7);
    aura.addColorStop(0, 'rgba(255, 232, 151, .24)');
    aura.addColorStop(0.42, 'rgba(115, 232, 210, .12)');
    aura.addColorStop(1, 'rgba(115, 232, 210, 0)');
    ctx.fillStyle = aura;
    ctx.beginPath();
    ctx.arc(0, 0, 35, 0, TAU);
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.globalAlpha = 0.42;
    ctx.strokeStyle = '#83d7cb';
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.moveTo(-8, -2);
    ctx.quadraticCurveTo(-18 - flight * 5, -9, -24 - flight * 8, -5);
    ctx.moveTo(-8, 2);
    ctx.quadraticCurveTo(-18 - flight * 5, 9, -24 - flight * 8, 5);
    ctx.stroke();
    ctx.restore();

    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = 'rgba(115, 232, 210, .28)';
    ctx.shadowColor = '#73e8d2';
    ctx.shadowBlur = 15;
    ctx.save();
    ctx.rotate(-0.42 - flap);
    ctx.beginPath();
    ctx.ellipse(-2, -9, 11, 5, -0.4, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = 'rgba(210, 255, 245, .62)';
    ctx.lineWidth = 0.8;
    ctx.stroke();
    ctx.restore();
    ctx.save();
    ctx.rotate(0.42 + flap);
    ctx.beginPath();
    ctx.ellipse(-2, 9, 11, 5, 0.4, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = 'rgba(210, 255, 245, .62)';
    ctx.lineWidth = 0.8;
    ctx.stroke();
    ctx.restore();

    ctx.fillStyle = '#fff0a6';
    ctx.shadowColor = '#ffd977';
    ctx.shadowBlur = 20;
    ctx.beginPath();
    ctx.ellipse(2, 0, 10, 5, 0, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = '#fff8d7';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = '#fffdf1';
    ctx.shadowColor = '#ffffff';
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.arc(4, 0, 2.2, 0, TAU);
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
    ctx.globalAlpha = 0.72;
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(8, -2.5);
    ctx.quadraticCurveTo(15, -8, 18, -5);
    ctx.moveTo(8, 2.5);
    ctx.quadraticCurveTo(15, 8, 18, 5);
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

  function getGeometrySnapshot() {
    const copyPoint = (point, extra = {}) => Object.freeze({ x: point.x, y: point.y, ...extra });
    return Object.freeze({
      profile: controlProfile,
      orientation: viewportOrientation,
      orientationBlocked,
      player: copyPoint(state.player, { radius: PLAYER_RADIUS }),
      anchors: Object.freeze(state.anchors.map((anchor) => copyPoint(anchor, {
        id: anchor.id,
        radius: anchor.radius,
        guide: anchor.guide,
        awakened: anchor.awakened
      }))),
      enemies: Object.freeze(state.enemies.map((enemy) => copyPoint(enemy, {
        id: enemy.id,
        type: enemy.type,
        radius: enemy.radius,
        dead: enemy.dead
      })))
    });
  }

  let qaGuardianOverride = '';

  function getRngSnapshot() {
    return Object.freeze({
      gameplayCalls: gameplayRandomCalls,
      cosmeticCalls: cosmeticRandomCalls
    });
  }

  function getVisualSnapshot() {
    const budget = getVisualBudget();
    const target = getVisualTargetState();
    const boss = state.enemies.find((enemy) => enemy.type === 'boss');
    const sealProgress = state.phaseIndex === phaseDefs.length - 1 ? clamp(state.phaseProgress / 3, 0, 1) : 0;
    const guardianState = qaGuardianOverride || (state.phaseIndex !== phaseDefs.length - 1
      ? 'dormant'
      : sealProgress >= 1 || (boss && boss.hp <= 0) || state.dawn > 0
        ? 'defeated'
        : sealProgress > 0 || (boss && boss.invulnerable > 0)
          ? 'sealing'
          : 'engaged');
    const awakenedAnchors = state.anchors.filter((anchor) => anchor.awakened).length;
    const awakenedCount = awakenedAnchors + state.awakeningMarks.length;
    const closurePulse = state.closureWaves.reduce((strongest, wave) => {
      const pulse = clamp(1 - wave.age / Math.max(0.001, wave.duration), 0, 1);
      return Math.max(strongest, pulse);
    }, 0);
    const visualCounts = Object.freeze({
      awakeningMarks: state.awakeningMarks.length,
      closureWaves: state.closureWaves.length,
      atmosphereMotifs: budget.atmosphereMotifs,
      threadGlints: state.chain.length && state.frayTimer <= 0 ? budget.threadGlints : 0,
      trailParticles: state.particles.length,
      regions: state.regions.length,
      wildBlooms: state.wildBlooms.length,
      particles: state.particles.length
    });
    return Object.freeze({
      profile: controlProfile,
      reducedMotion,
      phaseIndex: state.phaseIndex,
      phaseKey: PHASE_ATMOSPHERES[state.phaseIndex] || PHASE_ATMOSPHERES[0],
      atmosphereKey: PHASE_ATMOSPHERES[state.phaseIndex] || PHASE_ATMOSPHERES[0],
      targetAnchorId: target.targetAnchorId,
      targetState: target.targetState,
      threadState: state.frayTimer > 0 ? 'fraying' : state.chain.length >= 3 ? 'closure-ready' : state.chain.length ? 'active' : 'idle',
      awakeningLevel: clamp(state.awakeningMarks.length / Math.max(1, budget.awakeningMarks), 0, 1),
      awakenedCount,
      closurePulse,
      cameraPulse: reducedMotion ? 0 : state.shake,
      guardianState,
      guardianHp: boss ? boss.hp : null,
      sealProgress,
      dawn: clamp(state.dawn, 0, 1),
      visualCounts
    });
  }

  function ensureQaAnchors() {
    if (state.anchors.length >= 3) return;
    const layout = calculateTutorialLayout(W, H, controlProfile);
    state.anchors = layout.anchors.map((point, index) => ({
      id: -23030 - index,
      x: point.x,
      y: point.y,
      guide: index,
      radius: ANCHOR_RADIUS,
      touchCooldown: 0,
      awakened: false,
      bloom: 0,
      hue: 164 + index * 38,
      phase: index * 1.7
    }));
  }

  function placeQaPlayerAwayFromAnchors() {
    const candidates = [
      { x: playBounds.left, y: playBounds.top },
      { x: playBounds.right, y: playBounds.top },
      { x: playBounds.left, y: playBounds.bottom },
      { x: playBounds.right, y: playBounds.bottom },
      { x: playBounds.centerX, y: playBounds.centerY }
    ];
    const best = candidates.reduce((winner, candidate) => {
      const clearance = Math.min(...state.anchors.map((anchor) => distance(candidate, anchor)));
      return !winner || clearance > winner.clearance ? { point: candidate, clearance } : winner;
    }, null);
    state.player.x = best?.point.x ?? playBounds.centerX;
    state.player.y = best?.point.y ?? playBounds.centerY;
  }

  function makeQaBoss(hp) {
    return {
      id: -23023,
      type: 'boss',
      x: playBounds.centerX,
      y: playBounds.centerY,
      vx: 0,
      vy: 0,
      radius: 61,
      speed: 27,
      phase: 0.7,
      age: 0,
      frayCooldown: 0,
      chargeCooldown: 3,
      chargeState: 'idle',
      chargeTimer: 0,
      chargeX: 0,
      chargeY: 0,
      hp,
      invulnerable: hp < 3 && hp > 0 ? 1.2 : 0,
      dead: false
    };
  }

  function setQaHollowScenario(hp, progress, guardianState, dawn = 0) {
    ensureQaAnchors();
    state.phaseIndex = phaseDefs.length - 1;
    state.phaseTarget = 3;
    state.phaseProgress = progress;
    state.phaseTime = Infinity;
    state.mode = 'playing';
    state.dawn = clamp(dawn, 0, 1);
    state.chain = [];
    state.enemies = [makeQaBoss(hp)];
    state.player.x = clamp(playBounds.centerX, playBounds.left, playBounds.right);
    state.player.y = clamp(playBounds.centerY + Math.min(130, playBounds.height * 0.25), playBounds.top, playBounds.bottom);
    qaGuardianOverride = guardianState;
  }

  function setVisualScenario(name) {
    const scenario = String(name || '').toLowerCase();
    ensureQaAnchors();
    qaGuardianOverride = '';

    if (scenario === 'idle') {
      state.chain = [];
      placeQaPlayerAwayFromAnchors();
    } else if (scenario === 'near') {
      state.chain = [];
      state.player.x = state.anchors[0].x;
      state.player.y = state.anchors[0].y;
    } else if (scenario === 'active') {
      state.chain = [state.anchors[0].id];
      state.player.x = state.anchors[1].x;
      state.player.y = state.anchors[1].y;
    } else if (scenario === 'closure-ready') {
      state.chain = state.anchors.slice(0, 3).map((anchor) => anchor.id);
      state.player.x = state.anchors[0].x;
      state.player.y = state.anchors[0].y;
    } else if (scenario === 'closure-pulse') {
      const polygon = state.anchors.slice(0, 3).map((anchor) => ({ x: anchor.x, y: anchor.y }));
      addClosureSpectacle(polygon, 2, 2);
    } else if (scenario === 'hollow-dormant') {
      setQaHollowScenario(3, 0, 'dormant');
    } else if (scenario === 'hollow-engaged') {
      setQaHollowScenario(3, 0, 'engaged');
    } else if (scenario === 'hollow-sealing-1') {
      setQaHollowScenario(2, 1, 'sealing');
    } else if (scenario === 'hollow-sealing-2') {
      setQaHollowScenario(1, 2, 'sealing');
    } else if (scenario === 'hollow-defeated') {
      setQaHollowScenario(0, 3, 'defeated');
    } else if (scenario === 'dawn-early') {
      setQaHollowScenario(0, 3, 'defeated', 0.36);
    } else if (scenario === 'dawn-full') {
      setQaHollowScenario(0, 3, 'defeated', 1);
    } else if (scenario.startsWith('phase-')) {
      const phaseKey = scenario.slice(6);
      const phaseIndex = PHASE_ATMOSPHERES.indexOf(phaseKey);
      if (phaseIndex >= 0) {
        state.phaseIndex = phaseIndex;
        state.phaseTarget = phaseDefs[phaseIndex].target;
        state.phaseProgress = 0;
        state.dawn = 0;
        if (phaseIndex === phaseDefs.length - 1) state.enemies = [makeQaBoss(3)];
      }
    } else {
      throw new Error(`Unknown Lumenloom visual QA scenario: ${name}`);
    }
    return getVisualSnapshot();
  }

  function setQaReducedMotion(value) {
    reducedMotion = Boolean(value);
    if (reducedMotion) state.shake = 0;
    return getVisualSnapshot();
  }

  function renderForQa(count = 1) {
    const renders = clamp(Math.floor(Number(count) || 1), 1, 30);
    for (let i = 0; i < renders; i++) render();
    return getVisualSnapshot();
  }

  function assertCosmeticIsolation(count = 3) {
    const gameplayCallsBefore = gameplayRandomCalls;
    renderForQa(count);
    const gameplayCallsAfter = gameplayRandomCalls;
    return Object.freeze({
      isolated: gameplayCallsBefore === gameplayCallsAfter,
      gameplayCallsBefore,
      gameplayCallsAfter
    });
  }

  function getFrayQaSnapshot() {
    return Object.freeze({
      profile: controlProfile,
      chainLength: state.chain.length,
      frayTimer: Math.max(0, state.frayTimer),
      frayMax: state.frayMax,
      cleanWeave: state.cleanWeave,
      comboStack: state.comboStack,
      lumen: state.lumen,
      lives: state.lives,
      frayWindow: state.upgrades.frayWindow,
      toastText: ui.toast.textContent,
      toastVisible: ui.toast.classList.contains('is-visible'),
      toastWarning: ui.toast.classList.contains('is-warning')
    });
  }

  function getArcadeQaSnapshot() {
    const enemyCounts = Object.fromEntries(PETAL_THREAT_TYPES.map((type) => [
      type,
      state.enemies.filter((enemy) => !enemy.dead && enemy.type === type).length
    ]));
    const floorCounts = Object.fromEntries(PETAL_THREAT_TYPES.map((type) => [
      type,
      state.enemies.filter((enemy) => !enemy.dead && enemy.rosterSlot === type).length
    ]));
    const guardian = state.enemies.find((enemy) => !enemy.dead && enemy.type === 'boss') || null;
    const bonusEnemies = state.enemies.filter((enemy) => (
      !enemy.dead && enemy.type !== 'boss' && !PETAL_THREAT_TYPES.includes(enemy.rosterSlot)
    )).length;
    return Object.freeze({
      selectedModeId,
      runtimeMode: state.mode,
      victory: state.mode === 'result' ? state.completed : null,
      elapsedMs: state.arcadeElapsedMs,
      durationMs: isArcadeMode ? selectedMode.durationMs : null,
      score: Math.round(state.score),
      lives: state.lives,
      flowers: state.anchors.length,
      enemyCounts: Object.freeze(enemyCounts),
      targetIndex: isShiftingConstellation ? state.targetIndex : null,
      targetVertices: isShiftingConstellation ? selectedMode.targetVertices[state.targetIndex] : null,
      targetClockMs: isShiftingConstellation ? state.targetClockMs : null,
      targetMatches: isShiftingConstellation ? state.targetMatches : null,
      seals: isHollowRush ? state.seals : null,
      guardian: guardian ? Object.freeze({ hp: guardian.hp, invulnerable: guardian.invulnerable }) : null,
      bonusEnemies,
      floorCounts: Object.freeze(floorCounts),
      replacements: Object.freeze(state.arcadeReplacementQueue.map((replacement) => Object.freeze({ ...replacement }))),
      proof: Object.freeze({ ...buildRunProof() })
    });
  }

  function advanceArcadeClockForQa(milliseconds) {
    if (!isArcadeMode || state.mode !== 'playing') {
      throw new Error('Start an arcade run before advancing its QA clock.');
    }
    const delta = Number(milliseconds);
    if (!Number.isSafeInteger(delta) || delta < 0 || delta > selectedMode.durationMs) {
      throw new RangeError('Arcade QA milliseconds must be a safe integer within one full run.');
    }
    state.runTime += delta / 1000;
    const guardian = state.enemies.find((enemy) => !enemy.dead && enemy.type === 'boss');
    if (guardian) guardian.invulnerable = Math.max(0, guardian.invulnerable - delta / 1000);
    const finished = advanceArcadeClock(delta);
    if (!finished) maintainArcadeThreatFloor(false);
    updateHud();
    return getArcadeQaSnapshot();
  }

  function captureArcadeThreatForQa(type, count = 1) {
    if (!isArcadeMode || state.mode !== 'playing' || !PETAL_THREAT_TYPES.includes(type)) {
      throw new Error('Arcade QA capture requires an active canonical threat type.');
    }
    const amount = Number(count);
    if (!Number.isSafeInteger(amount) || amount < 1 || amount > 4) {
      throw new RangeError('Arcade QA capture count must be an integer from 1 to 4.');
    }
    const captured = state.enemies
      .filter((enemy) => !enemy.dead && enemy.rosterSlot === type)
      .slice(0, amount);
    captured.forEach((enemy) => {
      enemy.dead = true;
      scheduleArcadeReplacement(enemy);
    });
    state.enemies = state.enemies.filter((enemy) => !enemy.dead);
    maintainArcadeThreatFloor(false);
    return getArcadeQaSnapshot();
  }

  function captureArcadeBonusForQa(type, count = 1) {
    if (!isHollowRush || state.mode !== 'playing' || !['drifter', 'seeker'].includes(type)) {
      throw new Error('Hollow Rush bonus capture requires an active bonus threat type.');
    }
    const amount = Number(count);
    if (!Number.isSafeInteger(amount) || amount < 1 || amount > 4) {
      throw new RangeError('Hollow Rush bonus capture count must be an integer from 1 to 4.');
    }
    const captured = state.enemies
      .filter((enemy) => !enemy.dead && enemy.type === type && !PETAL_THREAT_TYPES.includes(enemy.rosterSlot))
      .slice(0, amount);
    captured.forEach((enemy) => { enemy.dead = true; });
    state.enemies = state.enemies.filter((enemy) => !enemy.dead);
    maintainArcadeThreatFloor(false);
    return getArcadeQaSnapshot();
  }

  function creditArcadeLoopForQa(vertices, shadows, clean, elapsedMs, guardianSeal = false) {
    if (!isArcadeMode || state.mode !== 'playing') {
      throw new Error('Arcade QA loop credit requires an active run.');
    }
    const atMs = Number(elapsedMs);
    if (!Number.isSafeInteger(atMs)
      || atMs < state.arcadeElapsedMs
      || atMs >= selectedMode.durationMs) {
      throw new RangeError('Arcade QA loop time must be monotonic and earlier than the finish.');
    }
    const delta = atMs - state.arcadeElapsedMs;
    advanceConstellationClock(delta);
    const guardian = state.enemies.find((enemy) => !enemy.dead && enemy.type === 'boss') || null;
    if (guardian) guardian.invulnerable = Math.max(0, guardian.invulnerable - delta / 1000);
    state.arcadeClockMs = atMs;
    state.arcadeElapsedMs = atMs;
    state.phaseTime = (selectedMode.durationMs - atMs) / 1000;
    state.runTime = atMs / 1000;
    const canSeal = Boolean(guardianSeal) && Boolean(guardian) && guardian.invulnerable <= 0;
    const credited = creditArcadeLoop(
      Number(vertices),
      Number(shadows),
      Boolean(clean),
      canSeal
    );
    if (credited.seal && guardian) {
      guardian.hp = Math.max(0, selectedMode.requiredSeals - state.seals);
      guardian.invulnerable = state.seals < selectedMode.requiredSeals ? 2.35 : 0;
      guardian.dead = state.seals >= selectedMode.requiredSeals;
      releaseHollowSealThreats();
    }
    state.phaseProgress = isHollowRush ? state.seals : atMs;
    if (credited.seal && state.seals >= selectedMode.requiredSeals) finishRun(true);
    updateHud();
    return Object.freeze({ ...getArcadeQaSnapshot(), credited });
  }

  function defeatArcadeForQa(elapsedMs) {
    if (!isArcadeMode || state.mode !== 'playing') {
      throw new Error('Arcade QA defeat requires an active run.');
    }
    const atMs = Number(elapsedMs);
    if (!Number.isSafeInteger(atMs) || atMs < 0 || atMs >= selectedMode.durationMs) {
      throw new RangeError('Arcade QA defeat must happen before the mode timer ends.');
    }
    state.arcadeClockMs = atMs;
    state.arcadeElapsedMs = atMs;
    state.runTime = atMs / 1000;
    state.lives = 0;
    finishRun(false);
    return getArcadeQaSnapshot();
  }

  function setFrayContactScenario(goldenFibers = 0) {
    if (state.mode !== 'playing') throw new Error('Start a Lumenloom run before configuring a fray QA scenario.');
    const goldenCount = Number(goldenFibers);
    if (!Number.isInteger(goldenCount) || goldenCount < 0 || goldenCount > 3) {
      throw new RangeError('Golden Fiber QA count must be an integer from 0 to 3.');
    }
    state.upgrades.frayWindow = FRAY_BALANCE.baseWindow;
    for (let i = 0; i < goldenCount; i++) applyGoldenFiber();

    const halfSegment = clamp(playBounds.width * 0.22, 72, 130);
    const segmentY = clamp(
      playBounds.centerY - Math.min(50, playBounds.height * 0.08),
      playBounds.top + 40,
      playBounds.bottom - 100
    );
    const makeAnchor = (id, x, y = segmentY) => ({
      id,
      x,
      y,
      guide: -1,
      radius: ANCHOR_RADIUS,
      touchCooldown: 0,
      awakened: false,
      bloom: 0,
      hue: 180,
      phase: 0
    });
    const leftAnchor = makeAnchor(-27001, playBounds.centerX - halfSegment);
    const rightAnchor = makeAnchor(-27002, playBounds.centerX + halfSegment);
    const closingAnchor = makeAnchor(
      -27004,
      playBounds.centerX,
      clamp(segmentY + Math.min(96, playBounds.height * 0.2), playBounds.top + 40, playBounds.bottom - 40)
    );

    state.mode = 'playing';
    state.phaseIndex = 2;
    state.phaseProgress = 0;
    state.phaseTarget = phaseDefs[2].target;
    state.phaseTime = phaseDefs[state.phaseIndex].time;
    state.phaseIntroTimer = 0;
    ui.phaseBanner.classList.remove('is-visible');
    state.spawnTimer = Infinity;
    state.anchors = [leftAnchor, rightAnchor, closingAnchor];
    state.chain = [leftAnchor.id, rightAnchor.id, closingAnchor.id];
    state.frayTimer = 0;
    state.frayMax = 0;
    state.weaveAge = 0;
    state.cleanWeave = true;
    state.comboStack = 3;
    state.maxLumen = 100;
    state.lumen = 80;
    state.lives = 3;
    state.player = {
      x: playBounds.left,
      y: playBounds.bottom,
      vx: 0,
      vy: 0,
      facing: -Math.PI / 2,
      invulnerable: 0,
      wing: 0
    };
    state.enemies = [{
      id: -27003,
      type: 'seeker',
      x: playBounds.centerX,
      y: segmentY,
      vx: 0,
      vy: 0,
      radius: 19,
      speed: 0,
      phase: 0,
      age: 0,
      frayCooldown: 0,
      chargeCooldown: 3,
      chargeState: 'idle',
      chargeTimer: 0,
      chargeX: 0,
      chargeY: 0,
      hp: 1,
      invulnerable: 0,
      dead: false
    }];

    // Arm the warning through the real Seeker-to-thread collision path.
    updatePlaying(0);
    return getFrayQaSnapshot();
  }

  function rescueFrayingWeaveForQa() {
    if (state.mode !== 'playing' || state.frayTimer <= 0 || state.chain.length < 3) {
      throw new Error('Configure a closure-ready fray QA scenario before rescuing it.');
    }
    tryCloseWeave();
    return getFrayQaSnapshot();
  }

  function triggerMoonfallDuringFrayForQa() {
    if (state.mode !== 'playing' || state.frayTimer <= 0 || !state.chain.length) {
      throw new Error('Configure an active fray QA scenario before triggering Moonfall.');
    }
    state.upgrades.ward = false;
    handleMoonfall();
    return getFrayQaSnapshot();
  }

  function advanceGameplayForQa(seconds) {
    const duration = Number(seconds);
    if (!Number.isFinite(duration) || duration < 0 || duration > 10) {
      throw new RangeError('QA gameplay duration must be a finite value from 0 to 10 seconds.');
    }
    let remaining = duration;
    while (remaining > 1e-9 && state.chain.length) {
      const dt = Math.min(1 / 60, remaining);
      updatePlaying(dt);
      remaining = Math.max(0, remaining - dt);
    }
    return getFrayQaSnapshot();
  }

  const qaHostAllowed = window.location.protocol === 'file:'
    || ['localhost', '127.0.0.1', '::1', '[::1]'].includes(window.location.hostname);

  function finishRunForQa(victory = true) {
    if (!qaHostAllowed) throw new Error('Lumenloom QA controls are available only on local builds.');
    if (state.mode === 'result') {
      return Object.freeze({ mode: state.mode, completed: state.completed, score: Math.round(state.score) });
    }
    if (state.mode === 'title') startRun();
    if (isArcadeMode) {
      if (state.mode !== 'playing') {
        throw new Error('Wait for the Grove to accept the arcade start before completing QA.');
      }
      if (victory && isHollowRush) {
        while (state.mode === 'playing' && state.seals < selectedMode.requiredSeals) {
          const guardian = state.enemies.find((enemy) => !enemy.dead && enemy.type === 'boss');
          if (!guardian) throw new Error('Hollow Rush QA requires its active Guardian.');
          guardian.invulnerable = 0;
          creditArcadeLoopForQa(
            selectedMode.loop.minimumVertices,
            0,
            true,
            Math.min(selectedMode.durationMs - 1, state.arcadeElapsedMs + 1),
            true
          );
        }
      } else if (victory) {
        advanceArcadeClock(selectedMode.durationMs - state.arcadeClockMs);
      } else {
        state.lives = 0;
        finishRun(false);
      }
      return Object.freeze({ mode: state.mode, completed: state.completed, score: Math.round(state.score) });
    }
    state.score = Math.max(state.score, victory ? 15000 : 750);
    state.loops = Math.max(state.loops, victory ? 12 : 2);
    state.shadows = Math.max(state.shadows, victory ? 25 : 3);
    if (victory) state.phaseIndex = phaseDefs.length - 1;
    else state.lives = 0;
    finishRun(Boolean(victory));
    return Object.freeze({ mode: state.mode, completed: state.completed, score: Math.round(state.score) });
  }

  // Keep deterministic geometry inspectable for local regression tests without
  // publishing a live-state inspection surface in production builds.
  if (qaHostAllowed) {
    window.__LUMENLOOM_QA__ = Object.freeze({
      getControlProfile: () => controlProfile,
      getSelectedMode: () => Object.freeze({ id: selectedModeId, mode: selectedMode }),
      getPlayBounds: () => Object.freeze({ ...playBounds }),
      getGeometrySnapshot,
      getFrayBalance: () => FRAY_BALANCE,
      getArcadeSnapshot: getArcadeQaSnapshot,
      advanceArcadeClock: advanceArcadeClockForQa,
      captureArcadeBonusThreat: captureArcadeBonusForQa,
      captureArcadeThreat: captureArcadeThreatForQa,
      creditArcadeLoop: creditArcadeLoopForQa,
      defeatArcadeRun: defeatArcadeForQa,
      setFrayContactScenario,
      rescueFrayingWeaveForQa,
      triggerMoonfallDuringFrayForQa,
      advanceGameplayForQa,
      getVisualConstants: () => VISUAL_CONSTANTS,
      getVisualContract: () => VISUAL_CONSTANTS,
      getVisualSnapshot,
      getRngSnapshot,
      setVisualScenario,
      finishRun: finishRunForQa,
      setReducedMotion: setQaReducedMotion,
      renderForQa,
      assertCosmeticIsolation,
      resolveControlProfile,
      calculatePlayBounds,
      calculateTutorialLayout,
      clampPointToBounds,
      refreshLayout: () => resize()
    });
  }

  function frame(time) {
    const dt = Math.min(0.033, Math.max(0, (time - lastFrame) / 1000));
    lastFrame = time;
    update(dt);
    render();
    requestAnimationFrame(frame);
  }

  function setupQaControls() {
    if (!pageParams.has('qa') || !qaHostAllowed) return;
    const panel = document.createElement('aside');
    panel.setAttribute('aria-label', 'QA controls');
    panel.style.cssText = 'position:fixed;left:8px;top:92px;z-index:1000;display:flex;flex-wrap:wrap;max-width:min(520px,calc(100vw - 16px));gap:5px;padding:6px;background:#09091ddd;border:1px solid #ffd97755;border-radius:8px;font:700 9px system-ui;color:#fff;pointer-events:auto';

    const addButton = (label, action) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = label;
      button.style.cssText = 'padding:6px 8px;border:0;border-radius:5px;background:#ffd977;color:#151129;font:inherit;cursor:pointer';
      button.addEventListener('click', action);
      panel.appendChild(button);
    };

    addButton('QA START', () => startRun());
    addButton('QA FRAY', () => {
      if (state.mode !== 'playing') startRun();
      setFrayContactScenario();
      updateHud();
    });
    addButton('QA +0.86', () => {
      if (state.mode !== 'playing' || state.frayTimer <= 0) return;
      advanceGameplayForQa(0.86);
      updateHud();
    });
    addButton('QA EXPIRE', () => {
      if (state.mode !== 'playing' || state.frayTimer <= 0) return;
      advanceGameplayForQa(state.frayTimer + 0.02);
      updateHud();
    });
    addButton('QA GOLDEN FRAY', () => {
      startRun();
      setFrayContactScenario(1);
      updateHud();
    });
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
      finishRunForQa(false);
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

  let resizeQueued = false;
  function scheduleResize() {
    if (resizeQueued) return;
    resizeQueued = true;
    requestAnimationFrame(() => {
      resizeQueued = false;
      resize();
    });
  }

  function isTrustedGroveResponse(event) {
    if (!isGroveHosted || event.source !== window.parent) return false;
    if (window.location.protocol === 'file:') {
      return !event.origin || event.origin === 'null';
    }
    return event.origin === window.location.origin;
  }

  function handleGroveResponse(event) {
    if (!isTrustedGroveResponse(event)) return;
    const previous = groveClient;
    const next = groveBridge.reduceClient(previous, {
      type: groveBridge.CLIENT_ACTIONS.PARENT_MESSAGE,
      message: event.data
    });
    if (next === previous) return;
    groveClient = next;

    if (previous.phase === 'awaiting-start' && next.phase === 'running') {
      beginRun();
      return;
    }
    if (next.phase === 'pending' || next.phase === 'saved' || next.phase === 'unsaved') {
      finalizeHostedResult(next.phase);
      return;
    }
    if (previous.phase === 'awaiting-action' && next.phase === 'ready') {
      ui.replayButton.disabled = true;
      ui.homeButton.disabled = true;
      requestGroveStart();
      return;
    }
    if (previous.phase === 'awaiting-action'
      && next.phase === previous.actionOrigin
      && next.lastRejection) {
      ui.quitButton.disabled = false;
      ui.pauseRestartButton.disabled = isTrialRun;
      ui.homeButton.disabled = next.phase === 'pending';
      ui.replayButton.disabled = next.phase === 'pending' || isTrialRun;
      showToast(next.lastRejection === 'trial-locked'
        ? 'The Grove Trial must continue forward.'
        : 'The Grove kept that action paused.', true, 2.2);
      return;
    }
    if (next.phase === 'awaiting-start' && next.lastRejection) {
      showToast('The Grove is waiting for a safe start choice.', true, 2.2);
    }
  }

  window.addEventListener('message', handleGroveResponse);
  window.addEventListener('resize', scheduleResize);
  window.visualViewport?.addEventListener('resize', scheduleResize);
  window.addEventListener('orientationchange', () => {
    resetMobileStick();
    scheduleResize();
    window.setTimeout(scheduleResize, 120);
  });
  window.addEventListener('blur', () => {
    input.keys.clear();
    input.actionPointers.clear();
    resetMobileStick();
    if (state.mode === 'playing' || state.mode === 'transition') pauseGame();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      input.actionPointers.clear();
      resetMobileStick();
      if (state.mode === 'playing' || state.mode === 'transition') pauseGame();
    }
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
      if (isGroveHosted) requestGroveSessionAction('restart');
      else startRun();
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
    if (isMobileProfile() && event.pointerType !== 'mouse') {
      if (event.pointerId !== input.mobilePointerId) return;
      event.preventDefault();
      updateMobileStick(screenPoint(event));
      return;
    }
    const p = screenPoint(event);
    input.x = p.x;
    input.y = p.y;
    input.pointerType = event.pointerType;
    if (event.pointerType === 'mouse' || event.buttons) input.pointerActive = true;
  });
  canvas.addEventListener('pointerdown', (event) => {
    const p = screenPoint(event);
    if (isMobileProfile() && event.pointerType !== 'mouse') {
      if (input.mobilePointerId !== null || orientationBlocked) return;
      event.preventDefault();
      input.mobilePointerId = event.pointerId;
      input.pointerType = event.pointerType;
      input.pointerActive = true;
      input.stickOriginX = p.x;
      input.stickOriginY = p.y;
      input.stickX = 0;
      input.stickY = 0;
      input.stickMagnitude = 0;
      canvas.setPointerCapture?.(event.pointerId);
      syncMobileStickVisual(true);
      return;
    }
    input.x = p.x;
    input.y = p.y;
    input.pointerType = event.pointerType;
    input.pointerActive = true;
    if (event.pointerType === 'mouse' && event.button === 0) toggleWeave();
    if (event.pointerType !== 'mouse') canvas.setPointerCapture?.(event.pointerId);
  });
  canvas.addEventListener('pointerup', (event) => {
    if (isMobileProfile() && event.pointerType !== 'mouse') {
      resetMobileStick(event.pointerId);
      return;
    }
    if (event.pointerType !== 'mouse') input.pointerActive = false;
  });
  canvas.addEventListener('pointercancel', (event) => resetMobileStick(event.pointerId));
  canvas.addEventListener('lostpointercapture', (event) => resetMobileStick(event.pointerId));
  canvas.addEventListener('contextmenu', (event) => event.preventDefault());

  ui.playButton.addEventListener('click', startRun);
  ui.replayButton.addEventListener('click', () => {
    if (isGroveHosted) requestGroveSessionAction('restart');
    else startRun();
  });
  ui.homeButton.addEventListener('click', () => {
    if (isGroveHosted) requestGroveSessionAction('grove');
    else goHome();
  });
  ui.resumeButton.addEventListener('click', resumeGame);
  ui.pauseRestartButton.addEventListener('click', () => {
    if (isTrialRun) return;
    if (isGroveHosted) requestGroveSessionAction('restart');
    else startRun();
  });
  ui.quitButton.addEventListener('click', () => {
    if (isGroveHosted) requestGroveSessionAction('grove');
    else goHome();
  });
  ui.pauseButton.addEventListener('click', pauseGame);
  ui.soundButton.addEventListener('click', () => audio.toggle());
  ui.weaveButton.addEventListener('pointerdown', (event) => {
    if (!isMobileProfile() || event.pointerType === 'mouse' || orientationBlocked) return;
    event.preventDefault();
    event.stopPropagation();
    input.actionPointers.add(event.pointerId);
    input.lastTouchActionAt = performance.now();
    ui.weaveButton.setPointerCapture?.(event.pointerId);
    toggleWeave();
  });
  const releaseActionPointer = (event) => input.actionPointers.delete(event.pointerId);
  ui.weaveButton.addEventListener('pointerup', releaseActionPointer);
  ui.weaveButton.addEventListener('pointercancel', releaseActionPointer);
  ui.weaveButton.addEventListener('lostpointercapture', releaseActionPointer);
  ui.weaveButton.addEventListener('click', (event) => {
    const synthesizedTouchClick = isMobileProfile()
      && event.detail !== 0
      && performance.now() - input.lastTouchActionAt < 700;
    if (synthesizedTouchClick) {
      event.preventDefault();
      return;
    }
    toggleWeave();
  });
  ui.fullscreenButton.addEventListener('click', async () => {
    if (isGroveHosted) return;
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
  window.addEventListener('pagehide', () => {
    publishGroveAbandon();
  });

  ui.startBest.textContent = `PERSONAL BEST · ${formatNumber(state.best)}`;
  if (isGroveHosted) {
    ui.startBest.textContent = 'GROVE SESSION · PARENT-SAVED';
    ui.quitButton.textContent = 'Return to Grove';
    ui.homeButton.textContent = 'Return to Grove';
    ui.replayButton.querySelector('span').textContent = 'RETRY';
  }
  ui.pauseRestartButton.hidden = isTrialRun;
  ui.pauseRestartButton.disabled = isTrialRun;
  setupQaControls();
  resize();
  syncDialogState();
  if (isGroveHosted) {
    publishGroveReady();
    requestGroveStart();
  } else {
    window.setTimeout(() => ui.playButton.focus({ preventScroll: true }), 100);
  }
  requestAnimationFrame(frame);
})();
