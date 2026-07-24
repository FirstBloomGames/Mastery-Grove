(() => {
  "use strict";

  const rules = window.RipplewakeRules;
  if (!rules) throw new Error("Ripplewake rules failed to load.");
  const motionQuery = window.matchMedia?.("(prefers-reduced-motion: reduce)");
  const pageParams = new URLSearchParams(window.location.search);
  const isTrialRun = pageParams.get("trial") === "1";
  const sessionId = pageParams.get("session") || "";
  const messageTargetOrigin = window.location.protocol === "file:" ? "*" : window.location.origin;
  const isEmbedded = window.parent !== window;
  const isGroveHosted = isEmbedded && pageParams.get("grove") === "1";

  const canvas = document.getElementById("lakeCanvas");
  const ctx = canvas.getContext("2d", { alpha: false });

  const ui = {
    app: document.getElementById("app"),
    hud: document.getElementById("hud"),
    stoneName: document.getElementById("stoneName"),
    stoneCount: document.getElementById("stoneCount"),
    scoreValue: document.getElementById("scoreValue"),
    bestValue: document.getElementById("bestValue"),
    soundButton: document.getElementById("soundButton"),
    soundIcon: document.getElementById("soundIcon"),
    fullscreenButton: document.getElementById("fullscreenButton"),
    pauseButton: document.getElementById("pauseButton"),
    guideCard: document.getElementById("guideCard"),
    guideKicker: document.getElementById("guideKicker"),
    guideText: document.getElementById("guideText"),
    skipValue: document.getElementById("skipValue"),
    perfectValue: document.getElementById("perfectValue"),
    lilyValue: document.getElementById("lilyValue"),
    comboBadge: document.getElementById("comboBadge"),
    comboValue: document.getElementById("comboValue"),
    currentName: document.getElementById("currentName"),
    actionPrompt: document.getElementById("actionPrompt"),
    promptText: document.getElementById("promptText"),
    promptHint: document.getElementById("promptHint"),
    toast: document.getElementById("toast"),
    screenFlash: document.getElementById("screenFlash"),
    startOverlay: document.getElementById("startOverlay"),
    startBest: document.getElementById("startBest"),
    playButton: document.getElementById("playButton"),
    pauseOverlay: document.getElementById("pauseOverlay"),
    resumeButton: document.getElementById("resumeButton"),
    quitButton: document.getElementById("quitButton"),
    resultOverlay: document.getElementById("resultOverlay"),
    resultTitle: document.getElementById("resultTitle"),
    wakeName: document.getElementById("wakeName"),
    resultCopy: document.getElementById("resultCopy"),
    resultScore: document.getElementById("resultScore"),
    resultRank: document.getElementById("resultRank"),
    resultSkips: document.getElementById("resultSkips"),
    resultPerfects: document.getElementById("resultPerfects"),
    resultLilies: document.getElementById("resultLilies"),
    resultBest: document.getElementById("resultBest"),
    replayButton: document.getElementById("replayButton"),
    homeButton: document.getElementById("homeButton")
  };

  if (isGroveHosted) {
    document.documentElement.dataset.groveHosted = "true";
    ui.fullscreenButton.hidden = true;
    ui.fullscreenButton.disabled = true;
  }

  const COLORS = {
    pearl: "#f4ffe8",
    mint: "#78e2c1",
    coral: "#ff9b85",
    gold: "#ffd36a",
    rose: "#ff84a6",
    deep: "#061a25"
  };

  const STONES = [
    { name: "FIRST STONE", current: "STILLWATER", duration: 1.25, drift: 0, tint: "#78e2c1" },
    { name: "REED STONE", current: "REEDLIGHT", duration: 1.18, drift: 0.015, tint: "#8ce6c9" },
    { name: "TIDE STONE", current: "CROSSCURRENT", duration: 1.12, drift: 0.03, tint: "#9bb8ff" },
    { name: "GOLD STONE", current: "GOLDFLOW", duration: 1.06, drift: 0.045, tint: "#ffd36a" },
    { name: "ECHO STONE", current: "MOONWAKE", duration: 1, drift: 0.06, tint: "#ff9b85" }
  ];

  const WINDOWS = [
    { perfect: 0.16, clean: 0.33, soft: 0.46 },
    { perfect: 0.145, clean: 0.3, soft: 0.43 },
    { perfect: 0.13, clean: 0.275, soft: 0.4 },
    { perfect: 0.115, clean: 0.25, soft: 0.37 },
    { perfect: 0.1, clean: 0.225, soft: 0.34 }
  ];

  const RANKS = [
    { score: 18000, name: "WAKEWEAVER" },
    { score: 12000, name: "MOONSKIPPER" },
    { score: 7000, name: "CURRENT READER" },
    { score: 3000, name: "RIPPLE KEEPER" },
    { score: 0, name: "SHORELISTENER" }
  ];

  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const lerp = (a, b, t) => a + (b - a) * t;
  const easeOut = (t) => 1 - Math.pow(1 - t, 3);
  const format = (value) => Math.round(value).toLocaleString("en-US");
  const random = (min, max) => min + Math.random() * (max - min);

  function loadBest() {
    try {
      const value = Number(localStorage.getItem("ripplewake-best"));
      return Number.isFinite(value) && value > 0 ? Math.round(value) : 0;
    } catch (_error) {
      return 0;
    }
  }

  function saveBest(value) {
    try {
      localStorage.setItem("ripplewake-best", String(Math.round(value)));
    } catch (_error) {
      // The game remains fully playable when storage is unavailable.
    }
  }

  const world = {
    width: 0,
    height: 0,
    horizon: 0,
    shore: 0,
    dpr: 1,
    stars: [],
    reeds: [],
    motes: []
  };

  const scene = {
    ripples: [],
    flowers: [],
    droplets: [],
    labels: [],
    wakes: [],
    sinks: [],
    titleRipples: []
  };

  const game = {
    mode: "title",
    modeBeforePause: "title",
    best: loadBest(),
    score: 0,
    displayedScore: 0,
    stoneIndex: 0,
    contactIndex: 0,
    skips: 0,
    timedTouches: 0,
    softSkips: 0,
    missedBeats: 0,
    stonesSunk: 0,
    stonesCompleted: 0,
    contactsPresented: 0,
    perfects: 0,
    cleanSkips: 0,
    rings: 0,
    golds: 0,
    blooms: 0,
    streak: 0,
    maxStreak: 0,
    longestWake: 0,
    distance: 0,
    completionSent: false,
    runStarted: false,
    firstGuidance: true,
    stone: null,
    options: [],
    pointerX: 0,
    pointerY: 0,
    transitionUntil: 0,
    pauseAt: 0,
    lastTime: performance.now(),
    renderTime: 0,
    toastUntil: 0,
    toastTimer: 0,
    titleRippleAt: 0,
    reducedMotion: motionQuery?.matches ?? false
  };
  let animationFrameId = 0;

  class LakeAudio {
    constructor() {
      this.context = null;
      this.master = null;
      this.muted = false;
      this.noiseBuffer = null;
      this.ambient = [];
    }

    ensure() {
      if (this.context) {
        if (this.context.state === "suspended") this.context.resume().catch(() => {});
        return;
      }

      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;

      try {
        this.context = new AudioContext();
        this.master = this.context.createGain();
        const compressor = this.context.createDynamicsCompressor();
        compressor.threshold.value = -18;
        compressor.knee.value = 18;
        compressor.ratio.value = 4;
        compressor.attack.value = 0.015;
        compressor.release.value = 0.25;
        this.master.gain.value = this.muted ? 0 : 0.62;
        this.master.connect(compressor);
        compressor.connect(this.context.destination);

        const length = Math.floor(this.context.sampleRate * 1.25);
        this.noiseBuffer = this.context.createBuffer(1, length, this.context.sampleRate);
        const data = this.noiseBuffer.getChannelData(0);
        for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
        this.startAmbient();
      } catch (_error) {
        this.context = null;
      }
    }

    suspend() {
      if (this.context?.state === "running") this.context.suspend().catch(() => {});
    }

    startAmbient() {
      if (!this.context || this.ambient.length) return;
      const now = this.context.currentTime;
      [55, 82.5].forEach((frequency, index) => {
        const oscillator = this.context.createOscillator();
        const gain = this.context.createGain();
        const filter = this.context.createBiquadFilter();
        oscillator.type = index ? "triangle" : "sine";
        oscillator.frequency.value = frequency;
        filter.type = "lowpass";
        filter.frequency.value = index ? 330 : 190;
        gain.gain.value = index ? 0.012 : 0.022;
        oscillator.connect(filter);
        filter.connect(gain);
        gain.connect(this.master);
        oscillator.start(now);
        this.ambient.push(oscillator);
      });
    }

    setMuted(muted) {
      this.muted = muted;
      if (!this.context || !this.master) return;
      const now = this.context.currentTime;
      this.master.gain.cancelScheduledValues(now);
      this.master.gain.setTargetAtTime(muted ? 0 : 0.62, now, 0.03);
    }

    tone(frequency, duration = 0.22, volume = 0.08, type = "sine", delay = 0) {
      if (!this.context || !this.master || this.muted) return;
      const start = this.context.currentTime + delay;
      const oscillator = this.context.createOscillator();
      const gain = this.context.createGain();
      oscillator.type = type;
      oscillator.frequency.setValueAtTime(frequency, start);
      oscillator.frequency.exponentialRampToValueAtTime(Math.max(35, frequency * 0.92), start + duration);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(volume, start + 0.018);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
      oscillator.connect(gain);
      gain.connect(this.master);
      oscillator.start(start);
      oscillator.stop(start + duration + 0.03);
    }

    splash(volume = 0.05, duration = 0.18, high = false) {
      if (!this.context || !this.master || !this.noiseBuffer || this.muted) return;
      const now = this.context.currentTime;
      const source = this.context.createBufferSource();
      const filter = this.context.createBiquadFilter();
      const gain = this.context.createGain();
      source.buffer = this.noiseBuffer;
      filter.type = "bandpass";
      filter.frequency.value = high ? 1700 : 850;
      filter.Q.value = 0.75;
      gain.gain.setValueAtTime(volume, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
      source.connect(filter);
      filter.connect(gain);
      gain.connect(this.master);
      source.start(now, Math.random() * 0.7, duration);
    }

    throw() {
      this.splash(0.045, 0.24, true);
      this.tone(250, 0.16, 0.045, "triangle");
    }

    contact(quality, streak) {
      const scale = [293.66, 329.63, 369.99, 440, 493.88];
      const note = scale[Math.min(scale.length - 1, Math.floor(streak / 2) % scale.length)];
      if (quality === "perfect") {
        this.splash(0.055, 0.14, true);
        this.tone(note, 0.28, 0.095, "sine");
        this.tone(note * 1.5, 0.32, 0.06, "triangle", 0.045);
      } else if (quality === "clean") {
        this.splash(0.045, 0.16, true);
        this.tone(note, 0.22, 0.067, "triangle");
      } else {
        this.splash(0.058, 0.22, false);
        this.tone(150, 0.16, 0.025, "sine");
      }
    }

    fading() {
      this.splash(0.034, 0.2, false);
      this.tone(132, 0.24, 0.024, "sine");
      this.tone(98, 0.34, 0.014, "triangle", 0.055);
    }

    sink() {
      this.splash(0.078, 0.38, false);
      this.tone(118, 0.42, 0.046, "sine");
      this.tone(68, 0.68, 0.032, "sine", 0.075);
    }

    ring(gold) {
      if (gold) {
        this.tone(523.25, 0.32, 0.075, "triangle");
        this.tone(659.25, 0.34, 0.055, "sine", 0.045);
        this.tone(783.99, 0.38, 0.04, "sine", 0.09);
      } else {
        this.tone(587.33, 0.23, 0.045, "sine", 0.02);
      }
    }

    bloom() {
      this.tone(880, 0.36, 0.035, "sine", 0.04);
    }

    finale() {
      [293.66, 369.99, 440, 587.33].forEach((note, index) => {
        this.tone(note, 0.58, 0.07 - index * 0.008, index % 2 ? "triangle" : "sine", index * 0.16);
      });
    }
  }

  const audio = new LakeAudio();

  function postToGrove(type, payload = {}) {
    if (!isEmbedded) return;
    window.parent.postMessage({
      source: "first-bloom-game",
      version: 1,
      type,
      gameId: "ripplewake",
      ...payload,
      sessionId
    }, messageTargetOrigin);
  }

  function rankFor(score) {
    return RANKS.find((rank) => score >= rank.score).name;
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    world.width = Math.max(320, rect.width || window.innerWidth);
    world.height = Math.max(320, rect.height || window.innerHeight);
    world.dpr = Math.min(window.matchMedia("(pointer: coarse)").matches ? 1.5 : 1.8, window.devicePixelRatio || 1);
    canvas.width = Math.round(world.width * world.dpr);
    canvas.height = Math.round(world.height * world.dpr);
    ctx.setTransform(world.dpr, 0, 0, world.dpr, 0, 0);
    world.horizon = world.height * (world.width < world.height ? 0.23 : 0.3);
    world.shore = world.height * 0.88;

    world.stars = Array.from({ length: Math.round(clamp(world.width / 18, 30, 78)) }, () => ({
      x: Math.random() * world.width,
      y: Math.random() * world.horizon * 0.92,
      r: random(0.35, 1.35),
      a: random(0.18, 0.72),
      phase: random(0, Math.PI * 2)
    }));

    world.reeds = Array.from({ length: Math.round(clamp(world.width / 34, 14, 42)) }, (_, index) => ({
      x: index < 6 ? random(0, world.width * 0.13) : index > 34 ? random(world.width * 0.87, world.width) : Math.random() < 0.5 ? random(0, world.width * 0.11) : random(world.width * 0.89, world.width),
      h: random(32, 100),
      lean: random(-9, 9),
      phase: random(0, Math.PI * 2)
    }));

    world.motes = Array.from({ length: Math.round(clamp(world.width / 21, 28, 70)) }, () => ({
      x: Math.random() * world.width,
      y: random(world.horizon, world.shore),
      r: random(0.5, 1.6),
      speed: random(0.2, 0.7),
      phase: random(0, Math.PI * 2),
      tint: Math.random() < 0.14 ? COLORS.coral : COLORS.mint
    }));

    game.pointerX = game.pointerX || world.width * 0.5;
    game.pointerY = game.pointerY || world.height * 0.55;
  }

  function waterYForContact(contactIndex) {
    const near = world.shore - Math.min(90, world.height * 0.1);
    const far = world.horizon + Math.max(54, world.height * 0.075);
    return lerp(near, far, (contactIndex + 1) / 10);
  }

  function laneToX(lane) {
    return world.width * (0.5 + clamp(lane, -0.92, 0.92) * 0.43);
  }

  function xToLane(x) {
    return clamp((x / world.width - 0.5) / 0.43, -0.92, 0.92);
  }

  function currentDrift(stoneIndex, contactIndex) {
    const definition = STONES[stoneIndex];
    return definition.drift * Math.sin(1.73 + (stoneIndex * 10 + contactIndex) * 1.37);
  }

  function makeOptions(stoneIndex, contactIndex) {
    const y = waterYForContact(contactIndex);
    const seed = stoneIndex * 2.31 + contactIndex * 1.17;
    const base = Math.sin(seed) * 0.48;
    const options = [];

    if (stoneIndex === 0) {
      options.push({ lane: clamp(base * 0.65, -0.55, 0.55), y, kind: "cyan", radius: 0.18 });
    } else if (stoneIndex === 1) {
      options.push({ lane: clamp(base - 0.24, -0.78, 0.78), y, kind: "cyan", radius: 0.18 });
      options.push({ lane: clamp(base + 0.28, -0.78, 0.78), y, kind: "cyan", radius: 0.18 });
    } else {
      const goldFrequency = stoneIndex === 2 ? contactIndex % 4 === 3 : stoneIndex === 3 ? contactIndex % 2 === 1 : contactIndex % 3 !== 1;
      options.push({ lane: clamp(base - 0.3, -0.82, 0.82), y, kind: "cyan", radius: 0.18 });
      options.push({ lane: clamp(base + 0.27, -0.82, 0.82), y, kind: "cyan", radius: 0.18 });
      if (goldFrequency) {
        const goldLane = clamp(-base * 0.72 + (contactIndex % 2 ? 0.18 : -0.18), -0.86, 0.86);
        options.push({ lane: goldLane, y, kind: "gold", radius: 0.095 });
      }
    }

    return options.map((option, index) => ({
      ...option,
      id: `${stoneIndex}-${contactIndex}-${index}`,
      x: laneToX(option.lane),
      hit: false,
      selected: false
    }));
  }

  function nearestOption(x, options = game.options) {
    if (!options.length) return null;
    return options.reduce((nearest, option) => Math.abs(option.x - x) < Math.abs(nearest.x - x) ? option : nearest, options[0]);
  }

  function chooseOption(x) {
    const option = nearestOption(x);
    game.options.forEach((candidate) => { candidate.selected = candidate === option; });
    return option;
  }

  function startRun() {
    if (isTrialRun && game.mode === "result") return;
    audio.ensure();
    game.mode = "between";
    game.score = 0;
    game.displayedScore = 0;
    game.stoneIndex = 0;
    game.contactIndex = 0;
    game.skips = 0;
    game.timedTouches = 0;
    game.softSkips = 0;
    game.missedBeats = 0;
    game.stonesSunk = 0;
    game.stonesCompleted = 0;
    game.contactsPresented = 0;
    game.perfects = 0;
    game.cleanSkips = 0;
    game.rings = 0;
    game.golds = 0;
    game.blooms = 0;
    game.streak = 0;
    game.maxStreak = 0;
    game.longestWake = 0;
    game.distance = 0;
    game.completionSent = false;
    game.runStarted = true;
    game.firstGuidance = true;
    game.stone = null;
    game.options = [];
    game.transitionUntil = performance.now() + 450;
    scene.ripples.length = 0;
    scene.flowers.length = 0;
    scene.droplets.length = 0;
    scene.labels.length = 0;
    scene.wakes.length = 0;
    scene.sinks.length = 0;

    ui.startOverlay.classList.remove("is-visible");
    ui.resultOverlay.classList.remove("is-visible");
    ui.pauseOverlay.classList.remove("is-visible");
    ui.hud.classList.remove("is-hidden");
    ui.hud.inert = false;
    canvas.inert = false;
    ui.guideCard.classList.remove("is-fading");
    lockViewport();
    canvas.focus({ preventScroll: true });
    requestAnimationFrame(lockViewport);
    updateHud(true);
    postToGrove("run-start");
  }

  function lockViewport() {
    ui.app.scrollTop = 0;
    ui.app.scrollLeft = 0;
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  }

  function beginStone() {
    game.contactIndex = 0;
    game.streak = 0;
    game.options = makeOptions(game.stoneIndex, 0);
    game.stone = null;
    game.mode = "aim";

    const definition = STONES[game.stoneIndex];
    ui.stoneName.textContent = definition.name;
    ui.stoneCount.textContent = `${game.stoneIndex + 1} / ${STONES.length}`;
    ui.currentName.textContent = definition.current;
    ui.guideKicker.textContent = game.stoneIndex === 0 ? "YOUR FIRST THROW" : definition.current;
    ui.guideText.textContent = game.stoneIndex < 2 ? "TAP A WATER RING TO CAST" : "CHOOSE A RING · GOLD IS NARROWER";
    ui.guideCard.classList.remove("is-fading");
    setPrompt("TAP A RING TO THROW", game.stoneIndex === 0 ? "No dragging · one touch chooses the lane" : "The current bends every route visibly");
    showToast(`${definition.current} · STONE ${game.stoneIndex + 1} OF 5`, definition.tint);
    updateHud(true);
  }

  function castStone(x) {
    if (game.mode !== "aim") return;
    audio.ensure();
    audio.throw();

    const option = chooseOption(x ?? world.width * 0.5) || game.options[0];
    const start = { x: world.width * 0.5, y: world.shore + 16 };
    const end = { x: option.x, y: option.y };
    const now = performance.now();

    game.stone = {
      p0: start,
      p1: end,
      currentTarget: { ...option },
      selectedNext: null,
      lockedQuality: null,
      inputDifference: null,
      noInputStreak: 0,
      recovering: false,
      hopStrength: 1,
      hopStart: now,
      contactAt: now + STONES[game.stoneIndex].duration * 1000,
      duration: STONES[game.stoneIndex].duration * 1000,
      screen: { ...start },
      previousStrongPoint: null,
      wakePoints: [{ ...start }]
    };

    game.options = game.contactIndex < 9 ? makeOptions(game.stoneIndex, 1) : [];
    game.mode = "flight";
    setPrompt("TAP AS THE HALO CLOSES", "Your touch also chooses the next landing ring");
  }

  function qualityFromDifference(difference) {
    const windows = WINDOWS[game.stoneIndex];
    const absolute = Math.abs(difference);
    if (absolute <= windows.perfect) return "perfect";
    if (absolute <= windows.clean) return "clean";
    return "soft";
  }

  function attemptSkip(x, now = performance.now()) {
    const stone = game.stone;
    if (game.mode !== "flight" || !stone || stone.lockedQuality) return;

    const difference = (now - stone.contactAt) / 1000;
    const windows = WINDOWS[game.stoneIndex];
    game.pointerX = clamp(x ?? game.pointerX ?? world.width * 0.5, 0, world.width);

    if (difference < -windows.soft) {
      chooseOption(game.pointerX);
      showToast("WAIT FOR THE HALO", COLORS.mint, "soft", 520);
      return;
    }

    if (difference > 0.08) return;
    stone.recovering = stone.noInputStreak > 0;
    stone.noInputStreak = 0;
    stone.lockedQuality = qualityFromDifference(difference);
    stone.inputDifference = difference;
    stone.selectedNext = game.options.length ? chooseOption(game.pointerX) : null;

    if (stone.lockedQuality === "perfect") {
      setPrompt("PERFECT TOUCH", "The wake will carry your exact line", true);
    } else if (stone.lockedQuality === "clean") {
      setPrompt("CLEAN TOUCH", "The current will bend the route slightly");
    } else {
      setPrompt("SOFT TOUCH", "The stone continues · the wake begins again");
    }
  }

  function resolveContact(now) {
    const stone = game.stone;
    if (!stone) return;

    const contactOutcome = rules.contactOutcome({
      hasAcceptedInput: Boolean(stone.lockedQuality),
      noInputStreak: stone.noInputStreak
    });
    const noInput = contactOutcome === "fading";
    if (contactOutcome === "sink") {
      sinkStone(now);
      return;
    }

    const quality = noInput ? "fading" : stone.lockedQuality;
    const point = { ...stone.p1 };
    const target = stone.currentTarget;
    const targetRadius = target ? Math.max(target.kind === "gold" ? 38 : 48, world.width * target.radius * 0.17) : 0;
    const targetHit = Boolean(!noInput && target && Math.abs(point.x - target.x) <= targetRadius);

    game.skips += 1;
    game.contactsPresented += 1;
    if (noInput) {
      game.missedBeats += 1;
      stone.noInputStreak = 1;
      game.streak = 0;
    } else if (quality === "perfect") {
      game.timedTouches += 1;
      game.perfects += 1;
      game.streak += 1;
    } else if (quality === "clean") {
      game.timedTouches += 1;
      game.cleanSkips += 1;
      game.streak += 1;
    } else {
      game.timedTouches += 1;
      game.softSkips += 1;
      game.streak = 0;
    }
    game.maxStreak = Math.max(game.maxStreak, game.streak);
    game.longestWake = game.maxStreak;

    const multiplier = game.streak > 0 ? 1 + 0.1 * Math.min(game.streak - 1, 10) : 1;
    const base = rules.basePoints(quality);
    let award = Math.round(base * multiplier);
    let ringAward = 0;

    if (targetHit) {
      ringAward = target.kind === "gold" ? 360 : 120;
      game.rings += 1;
      if (target.kind === "gold") game.golds += 1;
      audio.ring(target.kind === "gold");
    }

    award += ringAward;
    const strong = quality === "perfect" || quality === "clean";
    let bloomAward = 0;
    if (strong && stone.previousStrongPoint) {
      const dx = point.x - stone.previousStrongPoint.x;
      const dy = (point.y - stone.previousStrongPoint.y) / 0.34;
      const distance = Math.hypot(dx, dy);
      if (distance < Math.max(260, world.width * 0.31)) {
        bloomAward = 60;
        game.blooms += 1;
        const flowerPoint = {
          x: lerp(point.x, stone.previousStrongPoint.x, 0.46),
          y: lerp(point.y, stone.previousStrongPoint.y, 0.46)
        };
        spawnFlower(flowerPoint.x, flowerPoint.y, quality === "perfect", false);
        audio.bloom();
      }
    }

    if (strong) stone.previousStrongPoint = point;
    else stone.previousStrongPoint = null;

    award += bloomAward;
    game.score += award;
    game.distance += Math.hypot(stone.p1.x - stone.p0.x, stone.p1.y - stone.p0.y);
    stone.wakePoints.push(point);

    spawnRipple(point.x, point.y, quality, targetHit && target.kind === "gold");
    spawnSplash(point.x, point.y, quality);
    if (quality === "perfect") spawnFlower(point.x, point.y, true, targetHit && target.kind === "gold");
    spawnLabel(
      point.x,
      point.y - 22,
      quality === "fading" ? "WAKE FADING · 0" : quality.toUpperCase(),
      quality === "perfect" ? COLORS.pearl : quality === "clean" ? COLORS.mint : quality === "fading" ? COLORS.coral : "rgba(244,255,232,.72)"
    );
    if (ringAward) spawnLabel(point.x, point.y - 47, target.kind === "gold" ? "+360 GOLD" : "+120 RING", target.kind === "gold" ? COLORS.gold : COLORS.mint);
    if (bloomAward) spawnLabel(point.x + 12, point.y - 68, "+60 ECHO BLOOM", COLORS.coral);

    if (noInput) audio.fading();
    else audio.contact(quality, game.streak);
    if (noInput && game.contactIndex === 9) {
      showToast("MISSED BEAT · 0 POINTS · STONE SETTLED", COLORS.coral, "danger", 900);
    } else {
      feedbackFor(quality, targetHit ? target.kind : null, award);
    }
    if (!noInput && stone.recovering) showToast(`WAKE RESTORED · +${award}`, COLORS.mint, "perfect", 820);
    updateHud();

    game.contactIndex += 1;
    if (game.contactIndex >= 10) {
      settleStone(now);
      return;
    }

    const previousLane = xToLane(stone.p0.x);
    const currentLane = xToLane(stone.p1.x);
    const inertia = currentLane + (currentLane - previousLane) * 0.65;
    const drift = currentDrift(game.stoneIndex, game.contactIndex);
    const predictedLane = clamp(inertia + drift, -0.92, 0.92);
    const selected = stone.selectedNext
      || nearestOption(noInput ? laneToX(predictedLane) : (game.pointerX ?? point.x), game.options)
      || game.options[0];
    const accuracy = noInput ? 0 : quality === "perfect" ? 1 : quality === "clean" ? 0.86 : 0.45;
    const landingLane = clamp(inertia + (selected.lane - drift - inertia) * accuracy + drift, -0.92, 0.92);
    const nextPoint = { x: laneToX(landingLane), y: waterYForContact(game.contactIndex) };

    stone.p0 = point;
    stone.p1 = nextPoint;
    stone.currentTarget = { ...selected };
    stone.lockedQuality = null;
    stone.inputDifference = null;
    stone.selectedNext = null;
    stone.recovering = false;
    stone.hopStrength = noInput ? 0.55 : 1;
    stone.hopStart = now;
    stone.contactAt = now + stone.duration;
    game.options = game.contactIndex < 9 ? makeOptions(game.stoneIndex, game.contactIndex + 1) : [];

    if (noInput) {
      setPrompt("TOUCH THE NEXT RIPPLE", "Another missed beat will sink this stone", "danger");
    } else if (game.contactIndex < 3 && game.stoneIndex === 0) {
      setPrompt("TAP AS THE HALO CLOSES", "Pearl is perfect · mint is clean · silence fades the stone");
    } else {
      setPrompt(game.options.some((option) => option.kind === "gold") ? "TIME IT · CHOOSE YOUR RING" : "TAP ON THE WATER'S KISS", game.options.some((option) => option.kind === "gold") ? "Gold is smaller, brighter, and worth +360" : "Aim with the same touch · no dragging");
    }
  }

  function sinkStone(now) {
    const stone = game.stone;
    if (!stone) return;

    const point = { ...stone.p1 };
    game.missedBeats += 1;
    game.contactsPresented += 1;
    game.stonesSunk += 1;
    game.streak = 0;
    game.distance += Math.hypot(stone.p1.x - stone.p0.x, stone.p1.y - stone.p0.y);

    scene.wakes.push({
      points: stone.wakePoints.concat([point]),
      stone: game.stoneIndex,
      born: now,
      complete: false,
      sunk: true
    });
    scene.sinks.push({ x: point.x, y: point.y, age: 0, life: 1.15, stone: game.stoneIndex });
    if (scene.sinks.length > 10) scene.sinks.shift();

    spawnRipple(point.x, point.y, "sink", false);
    spawnSplash(point.x, point.y, "sink");
    spawnLabel(point.x, point.y - 24, "STONE SUNK", COLORS.coral);
    audio.sink();

    game.stone = null;
    game.options = [];
    game.mode = "between";
    game.stoneIndex += 1;
    game.transitionUntil = now + (game.stoneIndex >= STONES.length ? 1150 : 1050);
    setPrompt(game.stoneIndex >= STONES.length ? "THE LAKE IS READING YOUR WAKE" : "STONE SUNK", game.stoneIndex >= STONES.length ? "Your five-stone journey is complete" : "The next moonstone is rising", "danger");
    showToast("STONE SUNK · THE NEXT CURRENT IS RISING", COLORS.coral, "danger", 980);
    updateHud();
  }

  function settleStone(now) {
    if (!game.stone) return;
    const point = { ...game.stone.p1 };
    const faded = game.stone.noInputStreak > 0;
    scene.wakes.push({
      points: game.stone.wakePoints.slice(),
      stone: game.stoneIndex,
      born: now,
      complete: true,
      faded
    });
    spawnRipple(point.x, point.y, faded ? "fading" : "perfect", !faded && game.stoneIndex >= 3);
    if (faded) {
      for (let index = 0; index < 5; index += 1) spawnDroplet(point.x, point.y, COLORS.pearl, 0.45);
    } else {
      for (let index = 0; index < 15; index += 1) spawnDroplet(point.x, point.y, index % 3 === 0 ? COLORS.gold : COLORS.pearl, 0.8);
      audio.splash(0.075, 0.32, true);
    }
    game.stonesCompleted += 1;
    game.stone = null;
    game.options = [];
    game.mode = "between";
    game.stoneIndex += 1;
    game.transitionUntil = now + (game.stoneIndex >= STONES.length ? 1150 : 900);
    setPrompt(game.stoneIndex >= STONES.length ? "THE LAKE IS READING YOUR WAKE" : "STONE SETTLED", game.stoneIndex >= STONES.length ? "Your reflected garden is complete" : "The next current is rising");
  }

  function finishRun() {
    if (game.completionSent) return;
    game.score += rules.completionBonus(game.stonesSunk);
    game.displayedScore = game.score;
    game.best = Math.max(game.best, Math.round(game.score));
    saveBest(game.best);
    const score = Math.round(game.score);
    const rank = rankFor(score);
    const result = resultStory(score, game.perfects, game.golds, game.blooms, game.stonesSunk);

    game.completionSent = true;
    game.mode = "result";
    ui.hud.classList.add("is-hidden");
    ui.hud.inert = true;
    canvas.inert = true;
    ui.pauseOverlay.classList.remove("is-visible");
    ui.resultTitle.textContent = result.title;
    ui.wakeName.textContent = result.name;
    ui.resultCopy.textContent = result.copy;
    ui.resultScore.textContent = format(score);
    ui.resultRank.textContent = rank;
    ui.resultSkips.textContent = `${game.skips} / 50`;
    ui.resultPerfects.textContent = game.perfects;
    ui.resultLilies.textContent = game.rings;
    ui.resultBest.textContent = format(game.best);
    ui.startBest.textContent = `PERSONAL BEST · ${format(game.best)}`;
    if (isTrialRun) {
      ui.replayButton.disabled = true;
      ui.replayButton.querySelector("span").textContent = "TRIAL RUN COMPLETE · CONTINUE IN THE GROVE";
      ui.replayButton.querySelector("i")?.setAttribute("hidden", "");
      ui.replayButton.setAttribute("aria-label", "Trial run complete. Continue in the Grove.");
    }
    ui.resultOverlay.classList.add("is-visible");
    if (!isTrialRun) window.setTimeout(() => ui.replayButton.focus({ preventScroll: true }), 420);
    audio.finale();

    postToGrove("run-complete", {
      victory: true,
      score,
      best: game.best,
      rank,
      stats: {
        stones: 5,
        stonesCompleted: game.stonesCompleted,
        stonesSunk: game.stonesSunk,
        skips: game.skips,
        timedTouches: game.timedTouches,
        softSkips: game.softSkips,
        missedBeats: game.missedBeats,
        contactsPresented: game.contactsPresented,
        perfects: game.perfects,
        cleanSkips: game.cleanSkips,
        longestWake: game.longestWake,
        blooms: game.blooms,
        golds: game.golds,
        lilies: game.rings,
        maxCombo: game.maxStreak,
        distance: Math.round(game.distance)
      },
      assist: { preset: "standard", scoreChanging: false }
    });
  }

  function resultStory(score, perfects, golds, blooms, stonesSunk) {
    const sinkCount = stonesSunk > 0 ? `${stonesSunk} moonstone${stonesSunk === 1 ? "" : "s"}` : "";
    if (score >= 18000) return {
      title: "The whole lake learned your name.",
      name: "THE EVERLASTING WAKE",
      copy: stonesSunk
        ? `${perfects} perfect touches braided ${blooms} echo blooms into a living constellation, even after ${sinkCount} sank.`
        : `${perfects} perfect touches braided ${blooms} echo blooms into a living constellation.`
    };
    if (score >= 12000) return {
      title: "Your wake became a garden.",
      name: "THE MOONLIT BRAID",
      copy: stonesSunk
        ? `${golds} golden rings still glow between the flowers; ${sinkCount} found the deep water.`
        : `${golds} golden rings now glow between the flowers you left on the water.`
    };
    if (score >= 7000) return {
      title: "The current answered you.",
      name: "THE BRIGHT CROSSING",
      copy: stonesSunk
        ? `The current kept your rhythm after ${sinkCount} sank.`
        : "Each clean landing taught the lake a little more of your rhythm."
    };
    if (score >= 3000) return {
      title: "A new path shines on the lake.",
      name: "THE FIRST RIPPLE GARDEN",
      copy: stonesSunk
        ? `Your remaining wake carried light after ${sinkCount} sank.`
        : "Your soft skips still carried light, and every stone reached the far water."
    };
    return {
      title: "The lake is listening.",
      name: "THE QUIET BEGINNING",
      copy: stonesSunk
        ? `${sinkCount} sank. Cast again and let each closing halo set the rhythm.`
        : "Every moonstone reached the far water. Cast again and let the closing halos set the rhythm."
    };
  }

  function returnHome() {
    audio.suspend();
    game.mode = "title";
    game.runStarted = false;
    game.stone = null;
    game.options = [];
    ui.resultOverlay.classList.remove("is-visible");
    ui.pauseOverlay.classList.remove("is-visible");
    ui.hud.classList.add("is-hidden");
    ui.hud.inert = true;
    canvas.inert = true;
    ui.startBest.textContent = `PERSONAL BEST · ${format(game.best)}`;
    ui.startOverlay.classList.add("is-visible");
    window.setTimeout(() => ui.playButton.focus({ preventScroll: true }), 420);
    game.lastTime = performance.now();
    scheduleFrame();
  }

  function pause() {
    if (!["aim", "flight", "between"].includes(game.mode)) return;
    game.modeBeforePause = game.mode;
    game.pauseAt = performance.now();
    game.mode = "paused";
    stopFrameLoop();
    audio.suspend();
    ui.hud.inert = true;
    canvas.inert = true;
    ui.pauseOverlay.classList.add("is-visible");
    window.setTimeout(() => ui.resumeButton.focus({ preventScroll: true }), 420);
  }

  function resume() {
    if (game.mode !== "paused") return;
    const now = performance.now();
    const pausedFor = now - game.pauseAt;
    if (game.stone) {
      game.stone.hopStart += pausedFor;
      game.stone.contactAt += pausedFor;
    }
    if (game.transitionUntil) game.transitionUntil += pausedFor;
    game.mode = game.modeBeforePause;
    game.lastTime = now;
    ui.pauseOverlay.classList.remove("is-visible");
    ui.hud.inert = false;
    canvas.inert = false;
    audio.ensure();
    lockViewport();
    canvas.focus({ preventScroll: true });
    requestAnimationFrame(lockViewport);
    scheduleFrame();
  }

  function setPrompt(text, hint, state = "") {
    ui.promptText.textContent = text;
    ui.promptHint.textContent = hint;
    ui.actionPrompt.classList.toggle("is-perfect", state === true || state === "perfect");
    ui.actionPrompt.classList.toggle("is-danger", state === "danger");
  }

  function showToast(message, color = COLORS.pearl, kind = "", duration = 900) {
    ui.toast.textContent = message;
    ui.toast.style.color = color;
    ui.toast.classList.toggle("is-perfect", kind === "perfect");
    ui.toast.classList.toggle("is-danger", kind === "danger");
    ui.toast.classList.add("is-visible");
    window.clearTimeout(game.toastTimer);
    game.toastTimer = window.setTimeout(() => ui.toast.classList.remove("is-visible"), duration);
  }

  function feedbackFor(quality, ringKind, award) {
    if (quality === "perfect") {
      showToast(`PERFECT · +${award}`, ringKind === "gold" ? COLORS.gold : COLORS.pearl, "perfect", 760);
      ui.screenFlash.classList.remove("is-perfect");
      void ui.screenFlash.offsetWidth;
      ui.screenFlash.classList.add("is-perfect");
    } else if (quality === "clean") {
      showToast(`CLEAN · +${award}`, ringKind === "gold" ? COLORS.gold : COLORS.mint, "", 680);
    } else if (quality === "fading") {
      showToast("MISSED BEAT · 0 POINTS · NEXT MISS SINKS", COLORS.coral, "danger", 1050);
    } else {
      showToast(`SOFT · +${award} · KEEP GOING`, "rgba(244,255,232,.8)", "", 680);
    }
  }

  function updateHud(immediate = false) {
    if (immediate) game.displayedScore = game.score;
    ui.scoreValue.textContent = format(game.displayedScore);
    ui.bestValue.textContent = `BEST ${format(game.best)}`;
    ui.skipValue.textContent = game.skips;
    ui.perfectValue.textContent = game.perfects;
    ui.lilyValue.textContent = game.rings;
    const multiplier = game.streak > 0 ? 1 + 0.1 * Math.min(game.streak - 1, 10) : 1;
    ui.comboValue.textContent = `×${multiplier.toFixed(1)}`;
    ui.comboBadge.classList.toggle("is-hidden", game.streak < 2);
  }

  function spawnRipple(x, y, quality = "clean", gold = false) {
    const isFading = quality === "fading";
    const isSink = quality === "sink";
    scene.ripples.push({
      id: `${performance.now()}-${Math.random()}`,
      x, y,
      age: 0,
      life: quality === "perfect" ? 4.8 : quality === "clean" ? 3.8 : isSink ? 2.8 : isFading ? 1.8 : 2.2,
      strength: quality === "perfect" ? 1 : quality === "clean" ? 0.72 : isSink ? 0.5 : isFading ? 0.24 : 0.38,
      quality,
      gold
    });
    if (scene.ripples.length > 48) scene.ripples.shift();
  }

  function spawnFlower(x, y, perfect = false, gold = false) {
    scene.flowers.push({ x, y, age: 0, life: 120, scale: perfect ? 1.15 : 0.82, gold, rotation: Math.random() * Math.PI });
    if (scene.flowers.length > 32) scene.flowers.shift();
  }

  function spawnDroplet(x, y, color = COLORS.pearl, force = 1) {
    scene.droplets.push({
      x: x + random(-5, 5),
      y: y + random(-2, 3),
      vx: random(-54, 54) * force,
      vy: random(-126, -42) * force,
      age: 0,
      life: random(0.48, 0.9),
      color,
      radius: random(1.2, 2.9)
    });
    if (scene.droplets.length > 100) scene.droplets.splice(0, scene.droplets.length - 100);
  }

  function spawnSplash(x, y, quality) {
    const authoredCount = quality === "perfect" ? 16 : quality === "clean" ? 11 : quality === "sink" ? 6 : quality === "fading" ? 4 : 7;
    const count = game.reducedMotion ? Math.ceil(authoredCount * 0.4) : authoredCount;
    for (let index = 0; index < count; index += 1) {
      const color = quality === "perfect" && index % 4 === 0 ? COLORS.coral : quality === "sink" ? COLORS.mint : COLORS.pearl;
      const force = quality === "perfect" ? 1.15 : quality === "clean" ? 0.9 : quality === "sink" ? 0.48 : quality === "fading" ? 0.36 : 0.6;
      spawnDroplet(x, y, color, force);
    }
  }

  function spawnLabel(x, y, text, color) {
    scene.labels.push({ x, y, text, color, age: 0, life: 1.15 });
    if (scene.labels.length > 18) scene.labels.shift();
  }

  function update(now, delta) {
    game.renderTime += delta;
    if (game.mode === "paused") return;

    scene.ripples.forEach((ripple) => { ripple.age += delta; });
    scene.ripples = scene.ripples.filter((ripple) => ripple.age < ripple.life);
    scene.sinks.forEach((sink) => { sink.age += delta; });
    scene.sinks = scene.sinks.filter((sink) => sink.age < sink.life);
    scene.flowers.forEach((flower) => { flower.age += delta; });
    scene.flowers = scene.flowers.filter((flower) => flower.age < flower.life);
    scene.droplets.forEach((drop) => {
      drop.age += delta;
      drop.x += drop.vx * delta;
      drop.y += drop.vy * delta;
      drop.vy += 235 * delta;
      drop.vx *= Math.pow(0.985, delta * 60);
    });
    scene.droplets = scene.droplets.filter((drop) => drop.age < drop.life);
    scene.labels.forEach((label) => { label.age += delta; label.y -= 16 * delta; });
    scene.labels = scene.labels.filter((label) => label.age < label.life);

    if (game.displayedScore !== game.score) {
      const difference = game.score - game.displayedScore;
      game.displayedScore += Math.sign(difference) * Math.max(1, Math.ceil(Math.abs(difference) * Math.min(1, delta * 10)));
      if (Math.abs(game.score - game.displayedScore) < 2) game.displayedScore = game.score;
      updateHud();
    }

    if (game.mode === "between" && now >= game.transitionUntil) {
      if (game.stoneIndex >= STONES.length) finishRun();
      else beginStone();
    }

    if (game.mode === "flight" && game.stone) {
      const stone = game.stone;
      if (now >= stone.contactAt && (stone.lockedQuality || now >= stone.contactAt + 80)) resolveContact(now);
    }

    if (!game.reducedMotion && game.mode === "title" && now >= game.titleRippleAt) {
      game.titleRippleAt = now + random(900, 1800);
      spawnRipple(random(world.width * 0.16, world.width * 0.84), random(world.horizon + 50, world.shore - 40), Math.random() < 0.25 ? "perfect" : "clean", Math.random() < 0.14);
    }
  }

  function render(now) {
    const sceneNow = game.mode === "paused" ? game.pauseAt : now;
    drawLake(sceneNow);
    drawFlowers(sceneNow);
    drawWake(sceneNow);
    drawTargets(sceneNow);
    drawRipples();
    drawSinks();
    drawStone(sceneNow);
    drawParticles();
    drawForeground(sceneNow);
  }

  function drawLake(now) {
    const w = world.width;
    const h = world.height;
    const horizon = world.horizon;
    const stoneProgress = game.mode === "title" || game.mode === "result" ? 2 : game.stoneIndex;

    const sky = ctx.createLinearGradient(0, 0, 0, horizon * 1.15);
    sky.addColorStop(0, stoneProgress >= 4 ? "#071128" : "#081522");
    sky.addColorStop(0.58, stoneProgress >= 3 ? "#293650" : "#20394a");
    sky.addColorStop(1, stoneProgress >= 4 ? "#a46f75" : "#a77770");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, horizon + 3);

    world.stars.forEach((star) => {
      const alpha = star.a * (game.reducedMotion ? 0.82 : 0.7 + Math.sin(now * 0.0012 + star.phase) * 0.3);
      ctx.fillStyle = `rgba(244,255,232,${alpha})`;
      ctx.beginPath();
      ctx.arc(star.x, star.y, star.r, 0, Math.PI * 2);
      ctx.fill();
    });

    const moonX = w * 0.74;
    const moonY = horizon * 0.48;
    const moonR = clamp(w * 0.028, 18, 34);
    const halo = ctx.createRadialGradient(moonX, moonY, 0, moonX, moonY, moonR * 4.6);
    halo.addColorStop(0, "rgba(255,230,174,.34)");
    halo.addColorStop(0.2, "rgba(255,211,106,.12)");
    halo.addColorStop(1, "rgba(255,211,106,0)");
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(moonX, moonY, moonR * 4.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(250,244,209,.92)";
    ctx.beginPath();
    ctx.arc(moonX, moonY, moonR, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(153,113,112,.18)";
    ctx.beginPath();
    ctx.arc(moonX - moonR * 0.27, moonY + moonR * 0.08, moonR * 0.22, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#0c1a22";
    ctx.beginPath();
    ctx.moveTo(0, horizon + 4);
    for (let x = 0; x <= w; x += 36) {
      ctx.lineTo(x, horizon - 10 - Math.sin(x * 0.017) * 13 - Math.sin(x * 0.043) * 5);
    }
    ctx.lineTo(w, horizon + 12);
    ctx.closePath();
    ctx.fill();

    const water = ctx.createLinearGradient(0, horizon, 0, h);
    water.addColorStop(0, stoneProgress >= 3 ? "#183947" : "#16404a");
    water.addColorStop(0.42, stoneProgress >= 4 ? "#102f43" : "#0d3940");
    water.addColorStop(1, "#061a25");
    ctx.fillStyle = water;
    ctx.fillRect(0, horizon, w, h - horizon);

    const reflection = ctx.createLinearGradient(moonX, horizon, moonX, h * 0.9);
    reflection.addColorStop(0, "rgba(255,223,159,.26)");
    reflection.addColorStop(0.28, "rgba(255,211,106,.09)");
    reflection.addColorStop(1, "rgba(255,211,106,0)");
    ctx.fillStyle = reflection;
    ctx.beginPath();
    ctx.moveTo(moonX - moonR * 0.3, horizon);
    ctx.lineTo(moonX + moonR * 0.3, horizon);
    ctx.lineTo(moonX + w * 0.12, h * 0.9);
    ctx.lineTo(moonX - w * 0.12, h * 0.9);
    ctx.closePath();
    ctx.fill();

    ctx.save();
    ctx.globalCompositeOperation = "screen";
    for (let index = 0; index < 25; index += 1) {
      const depth = index / 24;
      const y = lerp(horizon + 8, h * 0.91, depth);
      const offset = game.reducedMotion ? 0 : Math.sin(now * 0.0007 + index * 1.43) * (2 + depth * 9);
      const length = lerp(32, w * 0.21, depth) * (0.35 + 0.65 * Math.sin(index * 2.23) ** 2);
      ctx.strokeStyle = `rgba(${index % 5 === 0 ? "255,155,133" : "120,226,193"},${0.025 + depth * 0.035})`;
      ctx.lineWidth = 1 + depth * 0.8;
      ctx.beginPath();
      ctx.moveTo(w * (0.13 + ((index * 0.231) % 0.74)) - length * 0.5 + offset, y);
      ctx.bezierCurveTo(w * 0.34 + offset, y - 3, w * 0.66 - offset, y + 3, w * (0.13 + ((index * 0.231) % 0.74)) + length * 0.5 + offset, y);
      ctx.stroke();
    }
    ctx.restore();

    drawCurrentRibbons(now);

    world.motes.forEach((mote) => {
      const x = game.reducedMotion ? mote.x : mote.x + Math.sin(now * 0.00025 + mote.phase) * 9;
      const y = game.reducedMotion ? mote.y : mote.y + Math.cos(now * 0.00033 * mote.speed + mote.phase) * 5;
      const alpha = game.reducedMotion ? 0.2 : 0.12 + 0.19 * (0.5 + Math.sin(now * 0.001 + mote.phase) * 0.5);
      ctx.fillStyle = mote.tint === COLORS.coral ? `rgba(255,155,133,${alpha})` : `rgba(120,226,193,${alpha})`;
      ctx.beginPath();
      ctx.arc(x, y, mote.r, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  function drawCurrentRibbons(now) {
    if (game.mode === "title" || game.mode === "result") return;
    const strength = STONES[Math.min(game.stoneIndex, 4)].drift;
    if (!strength) return;
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    for (let index = 0; index < 4; index += 1) {
      const x = world.width * (0.18 + index * 0.22);
      const direction = currentDrift(Math.min(game.stoneIndex, 4), game.contactIndex + index) >= 0 ? 1 : -1;
      ctx.strokeStyle = `rgba(155,184,255,${0.055 + strength * 0.8})`;
      ctx.lineWidth = 2 + index * 0.35;
      ctx.setLineDash([8, 13]);
      ctx.lineDashOffset = game.reducedMotion ? 0 : direction * now * -0.018;
      ctx.beginPath();
      ctx.moveTo(x - direction * 90, world.horizon + 60 + index * 25);
      ctx.bezierCurveTo(x + direction * 35, world.height * 0.45, x - direction * 50, world.height * 0.7, x + direction * 125, world.shore - 30);
      ctx.stroke();
    }
    ctx.restore();
    ctx.setLineDash([]);
  }

  function drawTargets(now) {
    if (!game.options.length || !["aim", "flight"].includes(game.mode)) return;
    const pulse = game.reducedMotion ? 0.5 : 0.5 + Math.sin(now * 0.004) * 0.5;
    game.options.forEach((option) => {
      const isGold = option.kind === "gold";
      const radius = Math.max(isGold ? 38 : 48, world.width * option.radius * 0.17);
      const depth = clamp((option.y - world.horizon) / (world.shore - world.horizon), 0, 1);
      const ry = radius * (0.3 + depth * 0.12);
      ctx.save();
      ctx.globalCompositeOperation = "screen";
      ctx.strokeStyle = isGold ? `rgba(255,211,106,${0.58 + pulse * 0.25})` : `rgba(120,226,193,${0.46 + pulse * 0.24})`;
      ctx.lineWidth = option.selected ? 3.2 : 2;
      ctx.setLineDash(isGold ? [10, 7, 2, 7] : [3, 7]);
      ctx.beginPath();
      ctx.ellipse(option.x, option.y, radius * (1 + pulse * 0.04), ry * (1 + pulse * 0.04), 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.strokeStyle = isGold ? "rgba(255,244,192,.34)" : "rgba(212,255,240,.25)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(option.x, option.y, radius * 0.63, ry * 0.63, 0, 0, Math.PI * 2);
      ctx.stroke();
      if (isGold) {
        for (let index = 0; index < 3; index += 1) {
          const angle = index * Math.PI * 2 / 3;
          ctx.save();
          ctx.translate(option.x + Math.cos(angle) * radius * 1.08, option.y + Math.sin(angle) * ry * 1.08);
          ctx.rotate(angle);
          ctx.fillStyle = COLORS.gold;
          ctx.fillRect(-4, -1, 8, 2);
          ctx.restore();
        }
      }
      ctx.restore();
    });
  }

  function drawWake(now) {
    const wakes = scene.wakes.slice();
    if (game.stone && game.stone.wakePoints.length > 1) {
      wakes.push({
        points: game.stone.wakePoints.concat([{ ...game.stone.screen }]),
        stone: game.stoneIndex,
        born: now,
        complete: false,
        faded: game.stone.noInputStreak > 0
      });
    }

    wakes.forEach((wake, wakeIndex) => {
      if (wake.points.length < 2) return;
      ctx.save();
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.strokeStyle = "rgba(1,10,17,.34)";
      ctx.lineWidth = 10;
      tracePoints(wake.points);
      ctx.stroke();
      const color = STONES[Math.min(wake.stone, 4)].tint;
      ctx.strokeStyle = color.replace("#", "#");
      ctx.globalAlpha = wake.sunk ? 0.14 : wake.faded ? 0.18 : wake.complete ? 0.24 : 0.48;
      ctx.lineWidth = 2.1;
      tracePoints(wake.points);
      ctx.stroke();
      if (!wake.sunk && ((game.streak >= 5 && wakeIndex === wakes.length - 1) || wake.complete)) {
        ctx.strokeStyle = "rgba(244,255,232,.18)";
        ctx.lineWidth = 1;
        ctx.setLineDash([5, 10]);
        ctx.lineDashOffset = -now * 0.02;
        tracePoints(wake.points.map((point, index) => ({ x: point.x + Math.sin(index * 2.1) * 7, y: point.y })));
        ctx.stroke();
      }
      ctx.restore();
    });
  }

  function tracePoints(points) {
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let index = 1; index < points.length; index += 1) {
      const previous = points[index - 1];
      const point = points[index];
      ctx.quadraticCurveTo(previous.x, previous.y, (previous.x + point.x) * 0.5, (previous.y + point.y) * 0.5);
    }
    const last = points[points.length - 1];
    ctx.lineTo(last.x, last.y);
  }

  function drawRipples() {
    scene.ripples.forEach((ripple) => {
      const t = ripple.age / ripple.life;
      const radius = easeOut(t) * (48 + ripple.strength * 82);
      const depth = clamp((ripple.y - world.horizon) / (world.shore - world.horizon), 0, 1);
      const flatten = 0.24 + depth * 0.17;
      const alpha = (1 - t) * ripple.strength;
      ctx.save();
      ctx.globalCompositeOperation = "screen";
      const colors = ripple.gold ? ["255,211,106", "244,255,232", "255,155,133"] : ["244,255,232", "120,226,193", "255,155,133"];
      [1, 0.72, 0.43].forEach((scale, index) => {
        ctx.strokeStyle = `rgba(${colors[index]},${alpha * (0.3 - index * 0.055)})`;
        ctx.lineWidth = index === 0 ? 1.7 : 1.1;
        ctx.beginPath();
        ctx.ellipse(ripple.x, ripple.y, radius * scale, radius * flatten * scale, 0, 0, Math.PI * 2);
        ctx.stroke();
      });
      ctx.restore();
    });
  }

  function drawSinks() {
    scene.sinks.forEach((sink) => {
      const progress = clamp(sink.age / sink.life, 0, 1);
      const fade = 1 - progress;
      const depth = easeOut(progress) * 24;

      ctx.save();
      ctx.globalAlpha = fade * 0.72;
      ctx.translate(sink.x, sink.y + depth);
      ctx.scale(1, 0.55);
      ctx.fillStyle = "rgba(112,136,142,.72)";
      ctx.strokeStyle = "rgba(255,155,133,.42)";
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.ellipse(0, 0, 12 - progress * 3, 7 - progress * 2, -0.15 + progress * 0.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();

      ctx.save();
      ctx.globalCompositeOperation = "screen";
      for (let index = 0; index < 3; index += 1) {
        const bubbleProgress = clamp(progress * 1.4 - index * 0.16, 0, 1);
        if (bubbleProgress <= 0) continue;
        ctx.globalAlpha = (1 - bubbleProgress) * 0.5;
        ctx.strokeStyle = "rgba(244,255,232,.72)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(sink.x + (index - 1) * 7, sink.y - bubbleProgress * (18 + index * 5), 2.2 + index * 0.6, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    });
  }

  function drawFlowers(now) {
    scene.flowers.forEach((flower) => {
      const appear = clamp(flower.age / 0.5, 0, 1);
      const ageFade = flower.life - flower.age < 3 ? (flower.life - flower.age) / 3 : 1;
      const size = (8 + appear * 10) * flower.scale;
      ctx.save();
      ctx.translate(flower.x, flower.y);
      ctx.rotate(flower.rotation + (game.reducedMotion ? 0 : Math.sin(now * 0.00025 + flower.rotation) * 0.08));
      ctx.scale(1, 0.42);
      ctx.globalAlpha = appear * ageFade;
      ctx.globalCompositeOperation = "screen";
      const petals = flower.gold ? 7 : 6;
      for (let index = 0; index < petals; index += 1) {
        ctx.rotate(Math.PI * 2 / petals);
        const gradient = ctx.createRadialGradient(size * 0.38, 0, 1, size * 0.38, 0, size * 0.72);
        gradient.addColorStop(0, flower.gold ? "rgba(255,211,106,.82)" : "rgba(244,255,232,.74)");
        gradient.addColorStop(1, flower.gold ? "rgba(255,155,133,0)" : "rgba(120,226,193,0)");
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.ellipse(size * 0.42, 0, size * 0.66, size * 0.25, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = flower.gold ? COLORS.gold : COLORS.pearl;
      ctx.beginPath();
      ctx.arc(0, 0, 2.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });
  }

  function drawStone(now) {
    const stone = game.stone;
    if (!stone || game.mode === "aim" || game.mode === "between") return;
    const raw = clamp((now - stone.hopStart) / stone.duration, 0, 1);
    const eased = raw;
    const baseX = lerp(stone.p0.x, stone.p1.x, eased);
    const baseY = lerp(stone.p0.y, stone.p1.y, eased);
    const hopStrength = stone.hopStrength ?? 1;
    const apex = (42 + (stone.lockedQuality === "perfect" ? 14 : stone.lockedQuality === "clean" ? 7 : 0)) * hopStrength;
    const arc = 4 * eased * (1 - eased) * apex;
    const x = baseX;
    const y = baseY - arc;
    stone.screen.x = x;
    stone.screen.y = y;

    const remaining = Math.max(0, (stone.contactAt - now) / 1000);
    const windows = WINDOWS[game.stoneIndex];
    const haloProgress = clamp(1 - remaining / STONES[game.stoneIndex].duration, 0, 1);
    const haloRadius = lerp(Math.max(76, world.width * 0.06), 18, easeOut(haloProgress));
    const depth = clamp((stone.p1.y - world.horizon) / (world.shore - world.horizon), 0, 1);

    ctx.save();
    ctx.globalCompositeOperation = "screen";
    let haloColor = "rgba(244,255,232,.42)";
    if (remaining <= windows.perfect) haloColor = "rgba(244,255,232,.95)";
    else if (remaining <= windows.clean) haloColor = "rgba(120,226,193,.82)";
    else if (remaining <= windows.soft) haloColor = "rgba(120,226,193,.46)";
    ctx.strokeStyle = haloColor;
    ctx.lineWidth = remaining <= windows.perfect ? 3 : 1.7;
    ctx.setLineDash(remaining > windows.soft ? [4, 8] : []);
    ctx.beginPath();
    ctx.ellipse(stone.p1.x, stone.p1.y, haloRadius, haloRadius * (0.28 + depth * 0.11), 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    if (stone.noInputStreak > 0) {
      ctx.strokeStyle = "rgba(255,132,166,.72)";
      ctx.lineWidth = 1.4;
      ctx.setLineDash([2, 6]);
      ctx.beginPath();
      ctx.ellipse(stone.p1.x, stone.p1.y, haloRadius + 8, (haloRadius + 8) * (0.28 + depth * 0.11), 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    if (stone.lockedQuality) {
      ctx.strokeStyle = stone.lockedQuality === "perfect" ? "rgba(255,211,106,.82)" : "rgba(120,226,193,.62)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(stone.p1.x, stone.p1.y, 20, 7, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();

    ctx.save();
    ctx.translate(baseX, baseY + 3);
    ctx.scale(1, 0.32);
    const shadow = ctx.createRadialGradient(0, 0, 0, 0, 0, 26);
    shadow.addColorStop(0, "rgba(0,5,10,.45)");
    shadow.addColorStop(1, "rgba(0,5,10,0)");
    ctx.fillStyle = shadow;
    ctx.beginPath();
    ctx.arc(0, 0, 26, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.save();
    if (stone.noInputStreak > 0) ctx.globalAlpha = 0.72;
    ctx.translate(x, y);
    ctx.rotate((stone.p1.x - stone.p0.x) * 0.004 + raw * Math.PI * 2.7);
    const scale = lerp(1.12, 0.8, clamp((baseY - world.horizon) / (world.shore - world.horizon), 0, 1) * -0.25 + 0.25);
    ctx.scale(scale, scale * 0.62);
    const pebble = ctx.createRadialGradient(-4, -5, 1, 0, 0, 17);
    pebble.addColorStop(0, "#ffffff");
    pebble.addColorStop(0.5, "#cfd9d7");
    pebble.addColorStop(0.82, "#72858a");
    pebble.addColorStop(1, "#263b45");
    ctx.fillStyle = pebble;
    ctx.strokeStyle = game.stoneIndex >= 3 ? COLORS.gold : COLORS.coral;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(0, 0, 16, 11, -0.12, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  function drawParticles() {
    scene.droplets.forEach((drop) => {
      const alpha = 1 - drop.age / drop.life;
      ctx.fillStyle = drop.color.startsWith("#") ? drop.color : COLORS.pearl;
      ctx.globalAlpha = alpha * 0.85;
      ctx.beginPath();
      ctx.arc(drop.x, drop.y, drop.radius, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;

    scene.labels.forEach((label) => {
      const alpha = 1 - label.age / label.life;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = label.color;
      ctx.shadowColor = "rgba(0,0,0,.7)";
      ctx.shadowBlur = 8;
      ctx.font = "800 13px Inter, system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(label.text, label.x, label.y);
      ctx.restore();
    });
  }

  function drawForeground(now) {
    const h = world.height;
    const gradient = ctx.createLinearGradient(0, h * 0.85, 0, h);
    gradient.addColorStop(0, "rgba(2,11,17,0)");
    gradient.addColorStop(1, "rgba(1,7,11,.82)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, h * 0.82, world.width, h * 0.18);

    ctx.save();
    ctx.strokeStyle = "rgba(4,16,20,.92)";
    ctx.fillStyle = "rgba(4,16,20,.92)";
    ctx.lineCap = "round";
    world.reeds.forEach((reed) => {
      const sway = game.reducedMotion ? 0 : Math.sin(now * 0.0008 + reed.phase) * 4;
      ctx.lineWidth = 2.1;
      ctx.beginPath();
      ctx.moveTo(reed.x, h + 2);
      ctx.quadraticCurveTo(reed.x + reed.lean * 0.5, h - reed.h * 0.55, reed.x + reed.lean + sway, h - reed.h);
      ctx.stroke();
      if (reed.h > 58) {
        ctx.save();
        ctx.translate(reed.x + reed.lean + sway, h - reed.h);
        ctx.rotate(-0.3 + reed.lean * 0.018);
        ctx.beginPath();
        ctx.ellipse(0, -5, 3.4, 9, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    });
    ctx.restore();
  }

  function pointerPosition(event) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: clamp(event.clientX - rect.left, 0, rect.width),
      y: clamp(event.clientY - rect.top, 0, rect.height)
    };
  }

  function handleAction(x) {
    if (game.mode === "aim") castStone(x);
    else if (game.mode === "flight") attemptSkip(x);
  }

  canvas.addEventListener("pointermove", (event) => {
    const point = pointerPosition(event);
    game.pointerX = point.x;
    game.pointerY = point.y;
    if (game.mode === "aim") chooseOption(point.x);
  });

  canvas.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    const point = pointerPosition(event);
    game.pointerX = point.x;
    game.pointerY = point.y;
    canvas.focus({ preventScroll: true });
    handleAction(point.x);
  });

  window.addEventListener("keydown", (event) => {
    if (event.repeat) return;
    const key = event.key.toLowerCase();
    if (key === "m") {
      toggleSound();
      return;
    }
    if (key === "f") {
      toggleFullscreen();
      return;
    }
    if (key === "p" || key === "escape") {
      if (game.mode === "paused") resume();
      else pause();
      return;
    }
    if (key === "arrowleft" || key === "arrowright") {
      event.preventDefault();
      game.pointerX = clamp((game.pointerX || world.width * 0.5) + (key === "arrowleft" ? -world.width * 0.08 : world.width * 0.08), 0, world.width);
      if (game.mode === "aim") chooseOption(game.pointerX);
      return;
    }
    if ((key === " " || key === "enter") && !["INPUT", "BUTTON", "A"].includes(document.activeElement?.tagName)) {
      event.preventDefault();
      if (game.mode === "title") startRun();
      else if (game.mode === "result" && !isTrialRun) startRun();
      else handleAction(game.pointerX || world.width * 0.5);
    }
  });

  function toggleSound() {
    audio.ensure();
    audio.setMuted(!audio.muted);
    ui.soundIcon.textContent = audio.muted ? "×" : "♪";
    ui.soundButton.setAttribute("aria-label", audio.muted ? "Unmute sound" : "Mute sound");
    showToast(audio.muted ? "SOUND MUTED" : "SOUND AWAKENED", audio.muted ? "rgba(244,255,232,.7)" : COLORS.mint, "", 620);
  }

  function toggleFullscreen() {
    if (isGroveHosted) return;
    const target = document.documentElement;
    if (!document.fullscreenElement) {
      target.requestFullscreen?.().catch(() => showToast("FULLSCREEN IS NOT AVAILABLE HERE", COLORS.coral));
    } else {
      document.exitFullscreen?.().catch(() => {});
    }
  }

  function syncFullscreenButton() {
    const isFullscreen = Boolean(document.fullscreenElement);
    const label = isFullscreen ? "Exit fullscreen" : "Enter fullscreen";
    ui.fullscreenButton.setAttribute("aria-label", label);
    ui.fullscreenButton.setAttribute("aria-pressed", String(isFullscreen));
    ui.fullscreenButton.title = label;
  }
  ui.playButton.addEventListener("click", startRun);
  ui.replayButton.addEventListener("click", startRun);
  ui.homeButton.addEventListener("click", returnHome);
  ui.pauseButton.addEventListener("click", pause);
  ui.resumeButton.addEventListener("click", resume);
  ui.quitButton.addEventListener("click", () => {
    postToGrove("run-abandon");
    returnHome();
  });
  ui.soundButton.addEventListener("click", toggleSound);
  ui.fullscreenButton.addEventListener("click", toggleFullscreen);

  window.addEventListener("resize", resize);
  document.addEventListener("fullscreenchange", () => {
    syncFullscreenButton();
    resize();
  });
  motionQuery?.addEventListener?.("change", (event) => {
    game.reducedMotion = event.matches;
    if (game.reducedMotion) {
      if (scene.droplets.length > 40) scene.droplets.splice(0, scene.droplets.length - 40);
      if (scene.ripples.length > 20) scene.ripples.splice(0, scene.ripples.length - 20);
    }
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      stopFrameLoop();
      if (["aim", "flight", "between"].includes(game.mode)) pause();
    } else {
      game.lastTime = performance.now();
      scheduleFrame();
    }
  });
  window.addEventListener("blur", () => {
    if (["aim", "flight", "between"].includes(game.mode)) pause();
  });

  function scheduleFrame() {
    if (animationFrameId || document.hidden || game.mode === "paused") return;
    animationFrameId = requestAnimationFrame(frame);
  }

  function stopFrameLoop() {
    if (!animationFrameId) return;
    cancelAnimationFrame(animationFrameId);
    animationFrameId = 0;
  }

  function frame(now) {
    animationFrameId = 0;
    const delta = Math.min(0.033, Math.max(0, (now - game.lastTime) / 1000));
    game.lastTime = now;
    update(now, delta);
    render(now);
    scheduleFrame();
  }

  syncFullscreenButton();
  resize();
  ui.hud.inert = true;
  canvas.inert = true;
  ui.startBest.textContent = `PERSONAL BEST · ${format(game.best)}`;
  ui.bestValue.textContent = `BEST ${format(game.best)}`;
  postToGrove("game-ready");
  scheduleFrame();
})();
