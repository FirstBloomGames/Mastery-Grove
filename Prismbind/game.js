(() => {
  "use strict";

  const rules = window.PrismbindRules;
  if (!rules) throw new Error("Prismbind rules failed to load.");
  const geometry = window.PrismbindGeometry;
  if (!geometry) throw new Error("Prismbind geometry failed to load.");
  const spectacle = window.PrismbindSpectacle;
  if (!spectacle) throw new Error("Prismbind spectacle state failed to load.");

  const $ = (id) => document.getElementById(id);
  const canvas = $("gameCanvas");
  const ctx = canvas.getContext("2d", { alpha: false });
  const TAU = Math.PI * 2;
  const STORAGE_KEY = "prismbind-best";
  const motionQuery = window.matchMedia?.("(prefers-reduced-motion: reduce)");
  const coarseQuery = window.matchMedia?.("(pointer: coarse)");
  const contrastQuery = window.matchMedia?.("(prefers-contrast: more)");
  let reducedMotion = motionQuery?.matches ?? false;
  let coarsePointer = coarseQuery?.matches ?? false;
  let highContrast = contrastQuery?.matches ?? false;
  const pageParams = new URLSearchParams(window.location.search);
  const sessionId = pageParams.get("session") || "";
  const messageTargetOrigin = window.location.protocol === "file:" ? "*" : window.location.origin;
  const isEmbedded = window.parent !== window;

  const ui = {
    app: $("app"),
    hud: $("hud"),
    phaseName: $("phaseName"),
    scoreValue: $("scoreValue"),
    bestValue: $("bestValue"),
    objectiveText: $("objectiveText"),
    objectiveProgress: $("objectiveProgress"),
    crownlightFill: $("crownlightFill"),
    crownlightValue: $("crownlightValue"),
    petalDisplay: $("petalDisplay"),
    healthValue: $("healthValue"),
    multiplierValue: $("multiplierValue"),
    sealCount: $("sealCount"),
    titleOverlay: $("titleOverlay"),
    pauseOverlay: $("pauseOverlay"),
    resultOverlay: $("resultOverlay"),
    startBest: $("startBest"),
    playButton: $("playButton"),
    pauseButton: $("pauseButton"),
    resumeButton: $("resumeButton"),
    quitButton: $("quitButton"),
    replayButton: $("replayButton"),
    homeButton: $("homeButton"),
    soundButton: $("soundButton"),
    soundIcon: $("soundIcon"),
    fullscreenButton: $("fullscreenButton"),
    resultTitle: $("resultTitle"),
    resultCopy: $("resultCopy"),
    resultScore: $("resultScore"),
    resultRank: $("resultRank"),
    resultSeals: $("resultSeals"),
    resultPerfects: $("resultPerfects"),
    resultBest: $("resultBest"),
    toast: $("toast"),
    liveRegion: $("liveRegion"),
  };

  const COLORS = Object.freeze({
    ink: "#03100f",
    deep: "#071b1a",
    teal: "#72e4d2",
    cyan: "#91f4ee",
    gold: "#ffd878",
    coral: "#ff8ea4",
    violet: "#b9a0ff",
    pearl: "#fff8df",
    moss: "#163e34",
    danger: "#ff8299",
  });

  const PHASES = Object.freeze([
    {
      name: "REMEMBER THE ROOT",
      kicker: "THE FIRST CONCORD",
      copy: "Wide arcs. Slow pulses. Let three familiar languages find one root.",
      pulse: 2.08,
      settle: 0.42,
      safeWidth: 0.5,
      goldWidth: 0.23,
      windows: { perfect: 0.16, clean: 0.32, soft: 0.5 },
      current: 0.035,
      optionMotion: 0.015,
      illegalChoices: 0,
      palette: ["#061714", "#11382f", "#ffd878"],
      motif: "root-dream",
    },
    {
      name: "HOLD THE PATTERN",
      kicker: "THE TURNING CROWN",
      copy: "The crown begins to move. Read the current before you bind.",
      pulse: 1.78,
      settle: 0.36,
      safeWidth: 0.42,
      goldWidth: 0.19,
      windows: { perfect: 0.135, clean: 0.275, soft: 0.435 },
      current: 0.075,
      optionMotion: 0.055,
      illegalChoices: 1,
      palette: ["#07131d", "#15394a", "#91f4ee"],
      motif: "fractured-canopy",
    },
    {
      name: "AWAKEN THE CROWN",
      kicker: "THE THREEFOLD HEART",
      copy: "Every current overlaps. Close the light and teach the crown to breathe.",
      pulse: 1.55,
      settle: 0.31,
      safeWidth: 0.36,
      goldWidth: 0.16,
      windows: { perfect: 0.115, clean: 0.245, soft: 0.39 },
      current: 0.11,
      optionMotion: 0.09,
      illegalChoices: 1,
      palette: ["#100d20", "#31305c", "#ff8ea4"],
      motif: "crownstorm",
    },
  ]);

  const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));
  const lerp = (a, b, amount) => a + (b - a) * amount;
  const smooth = (amount) => amount * amount * (3 - 2 * amount);
  const easeOut = (amount) => 1 - Math.pow(1 - amount, 3);
  const normAngle = (angle) => ((angle % TAU) + TAU) % TAU;
  const angleDelta = (target, source) => ((target - source + Math.PI) % TAU + TAU) % TAU - Math.PI;
  const format = (value) => Math.max(0, Math.round(value)).toLocaleString("en-US");
  const randomRange = (minimum, maximum, rng = Math.random) => minimum + rng() * (maximum - minimum);

  function readBest() {
    try {
      const value = Number(localStorage.getItem(STORAGE_KEY));
      return Number.isFinite(value) && value > 0 ? Math.round(value) : 0;
    } catch (_) {
      return 0;
    }
  }

  function writeBest(value) {
    try {
      localStorage.setItem(STORAGE_KEY, String(Math.max(0, Math.round(value))));
    } catch (_) {
      // The game remains playable when browser storage is unavailable.
    }
  }

  function mulberry32(seed) {
    return function seededRandom() {
      let value = seed += 0x6D2B79F5;
      value = Math.imul(value ^ value >>> 15, value | 1);
      value ^= value + Math.imul(value ^ value >>> 7, value | 61);
      return ((value ^ value >>> 14) >>> 0) / 4294967296;
    };
  }

  class AudioEngine {
    constructor() {
      this.context = null;
      this.master = null;
      this.filter = null;
      this.ambient = [];
      this.muted = false;
    }

    init() {
      if (this.context) {
        if (this.context.state === "suspended") this.context.resume().catch(() => {});
        return;
      }
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      this.context = new AudioContext();
      this.master = this.context.createGain();
      this.filter = this.context.createBiquadFilter();
      this.master.gain.value = this.muted ? 0.0001 : 0.25;
      this.filter.type = "lowpass";
      this.filter.frequency.value = 1100;
      this.filter.Q.value = 0.7;
      this.filter.connect(this.master).connect(this.context.destination);
      [55, 82.41, 110].forEach((frequency, index) => {
        const oscillator = this.context.createOscillator();
        const gain = this.context.createGain();
        oscillator.type = index === 1 ? "triangle" : "sine";
        oscillator.frequency.value = frequency;
        gain.gain.value = index === 0 ? 0.022 : index === 1 ? 0.011 : 0.006;
        oscillator.connect(gain).connect(this.filter);
        oscillator.start();
        this.ambient.push({ oscillator, gain });
      });
    }

    tone(frequency, duration = 0.2, volume = 0.05, type = "sine", delay = 0) {
      if (!this.context || !this.master || this.muted) return;
      const start = this.context.currentTime + delay;
      const oscillator = this.context.createOscillator();
      const gain = this.context.createGain();
      oscillator.type = type;
      oscillator.frequency.setValueAtTime(Math.max(30, frequency), start);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, volume), start + Math.min(0.03, duration * 0.2));
      gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
      oscillator.connect(gain).connect(this.filter || this.master);
      oscillator.start(start);
      oscillator.stop(start + duration + 0.03);
    }

    setPhase(index) {
      if (!this.context) return;
      const now = this.context.currentTime;
      const frequencies = [[55, 82.41, 110], [61.74, 92.5, 123.47], [65.41, 98, 130.81]][index] || [55, 82.41, 110];
      this.ambient.forEach((voice, voiceIndex) => {
        voice.oscillator.frequency.setTargetAtTime(frequencies[voiceIndex], now, 0.7);
        voice.gain.gain.setTargetAtTime((voiceIndex === 0 ? 0.022 : 0.009) + index * 0.002, now, 0.5);
      });
      this.filter.frequency.setTargetAtTime(1000 + index * 360, now, 0.5);
    }

    bind(quality, gold, streak) {
      const base = quality === "perfect" ? 440 : quality === "clean" ? 329.63 : 246.94;
      this.tone(base * (1 + Math.min(8, streak) * 0.015), 0.2, quality === "perfect" ? 0.075 : 0.05, "sine");
      if (quality !== "soft") this.tone(base * 1.5, 0.18, 0.035, "triangle", 0.045);
      if (gold) this.tone(base * 2, 0.3, 0.05, "sine", 0.08);
    }

    fray() {
      this.tone(185, 0.34, 0.05, "sawtooth");
      this.tone(123.47, 0.38, 0.04, "triangle", 0.07);
    }

    petal() {
      this.tone(130.81, 0.48, 0.07, "triangle");
      this.tone(82.41, 0.55, 0.055, "sine", 0.08);
    }

    recover() {
      [261.63, 329.63, 392].forEach((frequency, index) => this.tone(frequency, 0.25, 0.04, "sine", index * 0.055));
    }

    seal(anchorCount) {
      const chord = anchorCount >= 6 ? [261.63, 329.63, 392, 523.25] : anchorCount >= 5 ? [246.94, 329.63, 415.3] : [220, 293.66, 369.99];
      chord.forEach((frequency, index) => this.tone(frequency, 0.42, 0.055, index % 2 ? "triangle" : "sine", index * 0.055));
    }

    phase() {
      [196, 261.63, 329.63, 392].forEach((frequency, index) => this.tone(frequency, 0.5, 0.05, "sine", index * 0.08));
    }

    awaken() {
      [130.81, 196, 261.63, 329.63, 392, 523.25, 659.25].forEach((frequency, index) => this.tone(frequency, 0.75, 0.052, index % 2 ? "triangle" : "sine", index * 0.095));
    }

    approach(contact = false) {
      this.tone(contact ? 659.25 : 392, contact ? 0.09 : 0.07, contact ? 0.032 : 0.018, "sine");
    }

    suspend() {
      if (this.context?.state === "running") this.context.suspend().catch(() => {});
    }

    toggle() {
      this.muted = !this.muted;
      if (this.master && this.context) this.master.gain.setTargetAtTime(this.muted ? 0.0001 : 0.25, this.context.currentTime, 0.04);
      ui.soundIcon.textContent = this.muted ? "×" : "♪";
      ui.soundButton.setAttribute("aria-label", this.muted ? "Unmute sound" : "Mute sound");
      ui.soundButton.title = this.muted ? "Unmute sound (M)" : "Mute sound (M)";
    }
  }

  const audio = new AudioEngine();
  const view = {
    width: 1280,
    height: 720,
    dpr: 1,
    cx: 640,
    cy: 355,
    orbit: 220,
    time: 0,
    needsResize: true,
  };

  const input = {
    keys: new Set(),
    aimAngle: -Math.PI / 2,
    pointerSeen: false,
  };

  const scene = {
    motes: [],
    particles: [],
    floaters: [],
    ripples: [],
    seals: [],
    branches: [],
    growth: [],
    events: [],
    guardian: spectacle.createGuardianState(),
  };

  const game = {
    mode: "title",
    modeBeforePause: "playing",
    phaseIndex: 0,
    phaseTimer: 0,
    runTime: 0,
    score: 0,
    displayedScore: 0,
    best: readBest(),
    petals: 3,
    crownlight: 0,
    faultStreak: 0,
    contactStreak: 0,
    maxStreak: 0,
    seals: 0,
    anchorsPlaced: 0,
    perfects: 0,
    cleans: 0,
    softs: 0,
    golds: 0,
    faults: 0,
    petalsLost: 0,
    phasesCleared: 0,
    awakened: false,
    completionSent: false,
    runStarted: false,
    beatId: 0,
    beat: null,
    anchors: [],
    sealStartAngle: 0,
    sealDirection: 1,
    sealSweep: 0,
    sealPerfects: 0,
    sealGolds: 0,
    rng: mulberry32(Date.now() >>> 0),
    fxRng: mulberry32((Date.now() ^ 0x9e3779b9) >>> 0),
    flash: 0,
    shake: 0,
    frayPulse: 0,
    crownPulse: 0,
    toastTimer: 0,
    liveTimer: 0,
    resultDelay: 0,
    cinematicTime: 0,
    cinematicDuration: spectacle.awakeningDuration(reducedMotion),
    failureTime: 0,
    lastTime: performance.now(),
  };

  function postToGrove(type, payload = {}) {
    if (!isEmbedded) return;
    window.parent.postMessage({
      source: "first-bloom-game",
      version: 1,
      type,
      gameId: "prismbind",
      ...payload,
      sessionId,
    }, messageTargetOrigin);
  }

  function showToast(message, kind = "", duration = 1.15) {
    ui.toast.textContent = message;
    ui.toast.classList.remove("is-perfect", "is-danger");
    if (kind === "perfect") ui.toast.classList.add("is-perfect");
    if (kind === "danger") ui.toast.classList.add("is-danger");
    ui.toast.classList.add("is-visible");
    game.toastTimer = duration;
  }

  function announce(message) {
    window.clearTimeout(game.liveTimer);
    ui.liveRegion.textContent = "";
    game.liveTimer = window.setTimeout(() => { ui.liveRegion.textContent = message; }, 20);
  }

  function clearTransientStatus() {
    window.clearTimeout(game.liveTimer);
    game.liveTimer = 0;
    game.toastTimer = 0;
    ui.toast.classList.remove("is-visible", "is-perfect", "is-danger");
    ui.toast.textContent = "";
    ui.liveRegion.textContent = "";
  }

  function setObjective(message, progress = "") {
    if (ui.objectiveText.textContent !== message) ui.objectiveText.textContent = message;
    if (ui.objectiveProgress.textContent !== progress) ui.objectiveProgress.textContent = progress;
  }

  function setAriaHidden(element, hidden) {
    if (hidden) element.setAttribute("aria-hidden", "true");
    else element.removeAttribute("aria-hidden");
  }

  function activeDialog() {
    if (ui.titleOverlay.classList.contains("is-visible")) return ui.titleOverlay;
    if (ui.pauseOverlay.classList.contains("is-visible")) return ui.pauseOverlay;
    if (ui.resultOverlay.classList.contains("is-visible")) return ui.resultOverlay;
    return null;
  }

  function trapDialogFocus(event) {
    if (event.key !== "Tab") return false;
    const dialog = activeDialog();
    if (!dialog) return false;
    const focusable = [...dialog.querySelectorAll("button:not([disabled]), [href], [tabindex]:not([tabindex='-1'])")]
      .filter((element) => !element.inert && element.getClientRects().length > 0);
    if (!focusable.length) {
      event.preventDefault();
      return true;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (!dialog.contains(document.activeElement)) {
      event.preventDefault();
      (event.shiftKey ? last : first).focus({ preventScroll: true });
    } else if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus({ preventScroll: true });
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus({ preventScroll: true });
    }
    return true;
  }

  function pointFromPolar(angle, radial = 1) {
    return { x: Math.cos(angle) * radial, y: Math.sin(angle) * radial, angle: normAngle(angle), radial };
  }

  function worldPoint(point) {
    return {
      x: view.cx + point.x * view.orbit,
      y: view.cy + point.y * view.orbit,
    };
  }

  const polygonArea = geometry.polygonArea;

  function distanceBetween(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  function edgeWouldCross(points, candidate, closing = false) {
    return geometry.edgeWouldCross(points, candidate, closing);
  }

  function canClose(points = game.anchors) {
    return geometry.canClose(points, 0.16);
  }

  function optionPoint(option, beat = game.beat) {
    if (option.closing) return game.anchors[0] || pointFromPolar(option.angle, option.radial);
    const phase = PHASES[game.phaseIndex];
    const motion = option.stable || reducedMotion ? 0 : Math.sin((beat?.age || 0) * 2.15 + option.motionPhase) * phase.optionMotion;
    return pointFromPolar(option.angle + motion, option.radial);
  }

  function optionIsLegal(option) {
    if (!option || option.forcedIllegal) return false;
    if (option.closing) return canClose();
    const point = optionPoint(option);
    if (!game.anchors.length) return true;
    const last = game.anchors[game.anchors.length - 1];
    if (distanceBetween(last, point) < 0.34) return false;
    if (game.anchors.some((anchor) => distanceBetween(anchor, point) < 0.18)) return false;
    if (edgeWouldCross(game.anchors, point, false)) return false;
    const proposed = game.anchors.concat([point]);
    if (proposed.length >= 6 && !canClose(proposed)) return false;
    return option.sweep > game.sealSweep + 0.28 && option.sweep < 5.78;
  }

  function makeFirstOptions() {
    const phase = PHASES[game.phaseIndex];
    const count = game.phaseIndex === 0 ? 5 : 6;
    const base = input.aimAngle - Math.PI * 0.72;
    const options = [];
    for (let index = 0; index < count; index += 1) {
      const angle = normAngle(base + index / count * TAU + game.rng() * 0.12);
      const gold = game.phaseIndex > 0 && index === count - 2;
      options.push({
        id: `${game.beatId}-first-${index}`,
        angle,
        radial: 1,
        sweep: 0,
        closing: false,
        forcedIllegal: false,
        stable: index === 0,
        gold,
        width: gold ? phase.goldWidth : phase.safeWidth,
        motionPhase: game.rng() * TAU,
      });
    }
    return options;
  }

  function makeContinuationOptions() {
    const phase = PHASES[game.phaseIndex];
    const options = [];
    if (game.anchors.length >= 3 && canClose()) {
      options.push({
        id: `${game.beatId}-close`,
        angle: game.anchors[0].angle,
        radial: game.anchors[0].radial,
        sweep: TAU,
        closing: true,
        forcedIllegal: false,
        stable: true,
        gold: false,
        width: phase.safeWidth * 1.12,
        motionPhase: 0,
      });
    }
    if (game.anchors.length >= 6) return options;

    const deltas = [0.58, 1.02, 1.46, 1.8];
    let legalIndex = 0;
    for (let index = 0; index < deltas.length; index += 1) {
      const jitter = (game.rng() - 0.5) * 0.12;
      const nextSweep = game.sealSweep + deltas[index] + jitter;
      if (nextSweep >= 5.7) continue;
      const angle = normAngle(game.sealStartAngle + game.sealDirection * nextSweep);
      const option = {
        id: `${game.beatId}-next-${index}`,
        angle,
        radial: 0.91 + game.rng() * 0.16,
        sweep: nextSweep,
        closing: false,
        forcedIllegal: false,
        stable: legalIndex === 0,
        gold: false,
        width: phase.safeWidth,
        motionPhase: game.rng() * TAU,
      };
      if (!optionIsLegal(option)) {
        option.radial = 1;
        option.stable = true;
      }
      if (!optionIsLegal(option)) continue;
      options.push(option);
      legalIndex += 1;
      if (legalIndex >= 3) break;
    }

    const legalExtensions = options.filter((option) => !option.closing && optionIsLegal(option));
    if (!legalExtensions.length && !options.some((option) => option.closing)) {
      const fallbackSweep = Math.min(5.35, game.sealSweep + 0.72);
      const fallback = {
        id: `${game.beatId}-fallback`,
        angle: normAngle(game.sealStartAngle + game.sealDirection * fallbackSweep),
        radial: 1,
        sweep: fallbackSweep,
        closing: false,
        forcedIllegal: false,
        stable: true,
        gold: false,
        width: phase.safeWidth * 1.2,
        motionPhase: 0,
      };
      if (optionIsLegal(fallback)) options.push(fallback);
    }

    const eligibleGold = options.filter((option) => !option.closing && optionIsLegal(option));
    if (eligibleGold.length >= 2 && (game.phaseIndex > 0 || game.seals > 0)) {
      const gold = eligibleGold[eligibleGold.length - 1];
      gold.gold = true;
      gold.width = phase.goldWidth;
    }

    if (phase.illegalChoices && game.anchors.length >= 2) {
      const angle = normAngle(game.sealStartAngle - game.sealDirection * (0.48 + game.rng() * 0.5));
      options.push({
        id: `${game.beatId}-fracture`,
        angle,
        radial: 1,
        sweep: Math.max(0, game.sealSweep - 0.5),
        closing: false,
        forcedIllegal: true,
        stable: true,
        gold: false,
        width: phase.safeWidth * 0.8,
        motionPhase: 0,
      });
    }
    return options;
  }

  function buildOptions() {
    const options = game.anchors.length ? makeContinuationOptions() : makeFirstOptions();
    if (!options.some((option) => optionIsLegal(option))) {
      // Internal safety fallback: release an impossible open thread without charging the player.
      game.anchors = [];
      game.sealSweep = 0;
      game.faultStreak = 0;
      showToast("THE CROWN RECENTERED ITS LIGHT");
      return makeFirstOptions();
    }
    return options;
  }

  function beginBeat(delay = 0) {
    const phase = PHASES[game.phaseIndex];
    game.beatId += 1;
    const duration = phase.pulse + (game.phaseIndex === 0 && game.seals === 0 ? 0.18 : 0);
    game.beat = {
      id: game.beatId,
      status: delay > 0 ? "waiting" : "approach",
      age: -delay,
      contactAt: duration,
      duration,
      settle: phase.settle,
      resolved: false,
      approachCuePlayed: false,
      contactCuePlayed: false,
      options: [],
      quality: null,
      selectedId: null,
    };
    game.beat.options = buildOptions();
    updateObjective();
  }

  function nearestOption() {
    if (!game.beat?.options?.length) return null;
    let nearest = null;
    let nearestDistance = Infinity;
    for (const option of game.beat.options) {
      const point = optionPoint(option);
      const difference = Math.abs(angleDelta(point.angle, input.aimAngle));
      if (difference < nearestDistance) {
        nearestDistance = difference;
        nearest = option;
      }
    }
    if (!nearest) return null;
    return { option: nearest, difference: nearestDistance };
  }

  function addParticle(x, y, color, count = 12, force = 1) {
    const amount = reducedMotion ? Math.ceil(count * 0.35) : count;
    for (let index = 0; index < amount; index += 1) {
      const angle = game.fxRng() * TAU;
      const speed = randomRange(24, 105, game.fxRng) * force;
      scene.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        color,
        life: randomRange(0.45, 1.15, game.fxRng),
        maxLife: 1.15,
        size: randomRange(1.5, 4.5, game.fxRng),
      });
    }
    const particleCap = reducedMotion ? 128 : 360;
    if (scene.particles.length > particleCap) scene.particles.splice(0, scene.particles.length - particleCap);
  }

  function addFloater(point, text, color = COLORS.pearl, duration = 1.05) {
    const world = worldPoint(point);
    scene.floaters.push({ x: world.x, y: world.y - 20, text, color, life: duration, maxLife: duration });
    if (scene.floaters.length > 20) scene.floaters.shift();
  }

  function addRipple(point, color = COLORS.cyan, strength = 1) {
    const world = worldPoint(point);
    scene.ripples.push({ x: world.x, y: world.y, color, life: 1, strength });
    if (scene.ripples.length > 32) scene.ripples.shift();
  }

  function guardianReact(kind, intensity = 1, gazeAngle = input.aimAngle) {
    spectacle.triggerReaction(scene.guardian, kind, { intensity, gazeAngle });
    ui.app.dataset.reaction = kind;
  }

  function emitSpectacle(type, payload = {}, duration = 0.9) {
    scene.events.push({ type, payload, age: 0, duration: Math.max(0.1, duration) });
    if (scene.events.length > 24) scene.events.splice(0, scene.events.length - 24);
  }

  function addWorldGrowth(seal) {
    const phase = seal.phase;
    const samePhase = scene.growth.filter((growth) => growth.phase === phase);
    if (samePhase.length >= 6) {
      const oldest = samePhase[0];
      const index = scene.growth.indexOf(oldest);
      if (index >= 0) scene.growth.splice(index, 1);
    }
    const seedA = seal.seed;
    const seedB = Math.abs(Math.sin(seedA * 971.37 + seal.anchorCount * 17.11));
    const growth = {
      id: seal.id,
      phase,
      born: seal.born,
      seed: seedA,
      center: { ...seal.center },
      anchorCount: seal.anchorCount,
      areaRatio: seal.areaRatio,
      perfects: seal.perfects,
      golds: seal.golds,
      xNorm: phase === 0 ? seedA < 0.5 ? 0.08 + seedA * 0.28 : 0.64 + (seedA - 0.5) * 0.56 : 0.12 + seedA * 0.76,
      yNorm: phase === 0 ? 0.62 + seedB * 0.18 : phase === 1 ? 0.08 + seedB * 0.2 : 0.5,
      angle: normAngle(seedA * TAU + phase * 0.73),
      radial: 1.32 + seedB * 0.48,
    };
    scene.growth.push(growth);
    emitSpectacle("seal-travel", { growthId: growth.id, phase }, 1.15);
  }

  function updateSpectacleEvents(dt) {
    for (const event of scene.events) event.age += dt;
    scene.events = scene.events.filter((event) => event.age < event.duration);
  }

  function encounterGrowth() {
    const achieved = Math.max(game.phasesCleared, game.phaseIndex + game.crownlight / 100);
    return clamp(achieved / PHASES.length, 0, 1);
  }

  function acceptContact(option, quality) {
    const phase = PHASES[game.phaseIndex];
    const recovery = rules.faultOutcome({ accepted: true, faultStreak: game.faultStreak });
    game.faultStreak = recovery.nextFaultStreak;
    game.frayPulse = 0;
    game.contactStreak += 1;
    game.maxStreak = Math.max(game.maxStreak, game.contactStreak);
    if (quality === "perfect") game.perfects += 1;
    else if (quality === "clean") game.cleans += 1;
    else game.softs += 1;
    if (quality === "perfect") game.sealPerfects += 1;
    if (option.gold) {
      game.golds += 1;
      game.sealGolds += 1;
    }

    const points = rules.contactScore({ quality, gold: option.gold, streak: game.contactStreak });
    game.score += points;
    const selectedPoint = optionPoint(option);
    const contactColor = option.gold ? COLORS.gold : quality === "perfect" ? COLORS.pearl : COLORS.cyan;

    if (option.closing) {
      audio.bind(quality, false, game.contactStreak);
      addRipple(selectedPoint, contactColor, 1.3);
      addFloater(selectedPoint, `${quality.toUpperCase()} +${points}`, contactColor);
      closeSeal(quality);
      return;
    }

    let landing = selectedPoint;
    if (game.anchors.length && quality !== "perfect") {
      const influence = quality === "clean" ? 0.32 : 0.72;
      const shiftedSweep = option.sweep + phase.current * influence;
      const shifted = pointFromPolar(game.sealStartAngle + game.sealDirection * shiftedSweep, option.radial);
      const proposed = game.anchors.concat([shifted]);
      const legalShift = distanceBetween(game.anchors[game.anchors.length - 1], shifted) >= 0.34
        && !edgeWouldCross(game.anchors, shifted, false)
        && (proposed.length < 6 || canClose(proposed));
      if (legalShift) {
        landing = shifted;
        option.sweep = shiftedSweep;
      }
    }

    if (!game.anchors.length) {
      game.sealStartAngle = landing.angle;
      game.sealDirection = game.rng() > 0.5 ? 1 : -1;
      game.sealSweep = 0;
      game.sealPerfects = quality === "perfect" ? 1 : 0;
      game.sealGolds = option.gold ? 1 : 0;
      landing.sweep = 0;
      game.anchors.push(landing);
      addFloater(landing, `FIRST LIGHT +${points}`, contactColor);
    } else {
      landing.sweep = option.sweep;
      game.sealSweep = option.sweep;
      game.anchors.push(landing);
      addFloater(landing, `${quality.toUpperCase()} +${points}`, contactColor);
    }

    game.anchorsPlaced += 1;
    const world = worldPoint(landing);
    addParticle(world.x, world.y, contactColor, quality === "perfect" ? 22 : 13, option.gold ? 1.25 : 1);
    addRipple(landing, contactColor, option.gold ? 1.35 : 1);
    audio.bind(quality, option.gold, game.contactStreak);
    game.flash = Math.max(game.flash, quality === "perfect" ? 0.26 : 0.12);
    game.crownPulse = Math.max(game.crownPulse, option.gold ? 1 : 0.55);
    guardianReact(recovery.outcome === "recovered" ? "recovery" : "contact", option.gold ? 1.25 : quality === "perfect" ? 1.05 : 0.75, landing.angle);
    emitSpectacle(recovery.outcome === "recovered" ? "repair-wave" : "recognition", { point: { ...landing }, color: contactColor }, recovery.outcome === "recovered" ? 0.8 : 0.45);

    if (recovery.outcome === "recovered") {
      audio.recover();
      showToast(`WEAVE RESTORED · +${points}`, "perfect", 1.1);
      announce("Weave restored.");
    } else if (option.gold) {
      showToast(`GOLD ARC · +${points}`, "perfect", 0.95);
    } else if (quality === "perfect") {
      showToast(`PERFECT BIND · +${points}`, "perfect", 0.85);
    }
    resolveBeat(phase.settle);
  }

  function closeSeal(closureQuality) {
    const polygon = game.anchors.map((anchor) => ({ ...anchor }));
    if (!canClose(polygon)) {
      handleFault("THE CLOSING THREAD WOULD CROSS");
      return;
    }
    const anchorCount = polygon.length;
    const area = Math.abs(polygonArea(polygon));
    const areaRatio = clamp(area / 2.25, 0, 1);
    const shapePoints = Math.round(areaRatio * 500);
    const sealPoints = rules.sealBonus(anchorCount) + shapePoints;
    const crownlight = rules.crownlightFor({
      anchorCount,
      perfects: game.sealPerfects,
      golds: game.sealGolds,
      areaRatio,
    });
    game.score += sealPoints;
    game.crownlight = Math.min(100, game.crownlight + crownlight);
    game.seals += 1;
    const center = polygon.reduce((sum, point) => ({ x: sum.x + point.x / anchorCount, y: sum.y + point.y / anchorCount }), { x: 0, y: 0 });
    const completedSeal = {
      id: game.seals,
      points: polygon,
      phase: game.phaseIndex,
      born: game.runTime,
      strength: 0.45 + areaRatio * 0.45,
      anchorCount,
      center,
      areaRatio,
      perfects: game.sealPerfects,
      golds: game.sealGolds,
      // Keep presentation randomness out of the gameplay RNG stream so reduced
      // motion and particle density can never change future option layouts.
      seed: (() => {
        const raw = Math.sin(game.seals * 12.9898 + game.phaseIndex * 78.233 + areaRatio * 37.719) * 43758.5453;
        return raw - Math.floor(raw);
      })(),
    };
    scene.seals.push(completedSeal);
    if (scene.seals.length > 18) scene.seals.shift();
    addWorldGrowth(completedSeal);
    const centerWorld = worldPoint(center);
    addParticle(centerWorld.x, centerWorld.y, anchorCount >= 5 ? COLORS.gold : COLORS.cyan, 34 + anchorCount * 4, 1.35);
    scene.ripples.push({ x: centerWorld.x, y: centerWorld.y, color: COLORS.gold, life: 1.4, strength: 2.1 });
    addFloater(center, `${anchorCount}-ANCHOR SEAL +${format(sealPoints)}`, COLORS.gold, 1.35);
    audio.seal(anchorCount);
    game.shake = reducedMotion ? 0 : Math.min(10, 3 + anchorCount);
    game.flash = 0.48;
    game.crownPulse = 1.4;
    guardianReact("seal", 1 + anchorCount * 0.12, Math.atan2(center.y, center.x));
    emitSpectacle("seal-bloom", { point: { ...center }, anchorCount, phase: game.phaseIndex }, 1.2);
    showToast(`CROWN SEAL · +${crownlight}% LIGHT`, "perfect", 1.45);
    announce(`${anchorCount} anchor Crown Seal completed. Crownlight ${game.crownlight} percent.`);

    game.anchors = [];
    game.sealSweep = 0;
    game.sealPerfects = 0;
    game.sealGolds = 0;
    game.faultStreak = 0;
    game.frayPulse = 0;

    if (game.crownlight >= 100) {
      clearPhase();
      return;
    }
    resolveBeat(PHASES[game.phaseIndex].settle + 0.7);
  }

  function handleFault(reason) {
    if (!game.beat || game.beat.resolved || game.mode !== "playing") return;
    game.faults += 1;
    game.contactStreak = 0;
    const outcome = rules.faultOutcome({ accepted: false, faultStreak: game.faultStreak });
    game.faultStreak = outcome.nextFaultStreak;
    if (outcome.outcome === "fray") {
      game.frayPulse = 1;
      game.flash = 0.22;
      guardianReact("fray", 1.05);
      emitSpectacle("heart-fissure", { reason }, 0.72);
      audio.fray();
      showToast(`FRAY · ${reason} · ONE MORE FAULT BREAKS THE SEAL`, "danger", 1.55);
      announce("The weave frayed. One more consecutive fault will cost a Heart Petal.");
      resolveBeat(PHASES[game.phaseIndex].settle + 0.28);
      return;
    }

    const lostAnchors = game.anchors.length;
    if (lostAnchors) {
      const last = game.anchors[game.anchors.length - 1];
      const world = worldPoint(last);
      addParticle(world.x, world.y, COLORS.coral, 26, 1.15);
    }
    game.petals = Math.max(0, game.petals - 1);
    game.petalsLost += 1;
    game.anchors = [];
    game.sealSweep = 0;
    game.sealPerfects = 0;
    game.sealGolds = 0;
    game.frayPulse = 0;
    game.flash = 0.65;
    game.shake = reducedMotion ? 0 : 9;
    guardianReact("petal-loss", 1.25);
    emitSpectacle("falling-petal", { side: game.petals % 2 ? -1 : 1, lostAnchors }, 1.45);
    audio.petal();
    showToast(`HEART PETAL FALLS · ${lostAnchors ? "UNFINISHED SEAL RELEASED" : reason}`, "danger", 1.75);
    announce(`A Heart Petal fell. ${game.petals} remain.`);
    updateHud(true);
    if (game.petals <= 0) {
      game.beat.resolved = true;
      game.beat.status = "resolved";
      game.mode = "failing";
      game.resultDelay = 1.15;
      game.failureTime = 0;
      setObjective("THE CROWN STILL SLEEPS", "0 / 3 PETALS");
      return;
    }
    resolveBeat(PHASES[game.phaseIndex].settle + 0.75);
  }

  function resolveBeat(settle) {
    if (!game.beat || game.beat.resolved) return;
    game.beat.resolved = true;
    game.beat.status = "resolved";
    game.beat.settle = Math.max(0.05, settle);
    updateHud();
  }

  function attemptBind() {
    if (game.mode !== "playing" || !game.beat || game.beat.resolved || game.beat.status === "waiting") return;
    const phase = PHASES[game.phaseIndex];
    const difference = Math.abs(game.beat.age - game.beat.contactAt);
    const earliest = game.beat.contactAt - phase.windows.soft;
    if (game.beat.age < earliest) {
      handleFault("PULSE NOT YET OPEN");
      return;
    }
    const quality = rules.qualityFromDifference(difference, phase.windows);
    if (quality === "miss") {
      handleFault(game.beat.age > game.beat.contactAt ? "PULSE PASSED" : "PULSE NOT YET OPEN");
      return;
    }
    const selected = nearestOption();
    if (!selected || selected.difference > selected.option.width * 0.66 + 0.055) {
      handleFault("NO ARC ALIGNED");
      return;
    }
    if (!optionIsLegal(selected.option)) {
      handleFault(selected.option.forcedIllegal ? "FRACTURED ROUTE" : "THREAD WOULD CROSS");
      return;
    }
    game.beat.quality = quality;
    game.beat.selectedId = selected.option.id;
    acceptContact(selected.option, quality);
  }

  function clearPhase() {
    if (game.mode !== "playing") return;
    game.score += 1000;
    game.phasesCleared += 1;
    const restored = game.petals < 3;
    game.petals = Math.min(3, game.petals + 1);
    game.faultStreak = 0;
    game.contactStreak = 0;
    game.anchors = [];
    game.beat = null;
    game.crownPulse = 1.7;
    game.flash = 0.58;
    game.shake = reducedMotion ? 0 : 8;
    guardianReact("phase", 1.4);
    emitSpectacle("phase-surge", { phase: game.phaseIndex }, 1.8);
    audio.phase();
    if (game.phaseIndex >= PHASES.length - 1) {
      game.awakened = true;
      game.score += 3000 + game.petals * 500;
      game.mode = "awakening";
      game.cinematicTime = 0;
      game.cinematicDuration = spectacle.awakeningDuration(reducedMotion);
      game.resultDelay = game.cinematicDuration;
      ui.hud.classList.add("is-cinematic");
      ui.app.dataset.state = "awakening";
      showToast("THE CROWNHEART AWAKENS", "perfect", 2.2);
      announce("The Crownheart awakens.");
      audio.awaken();
      return;
    }
    game.mode = "phaseClear";
    game.phaseTimer = 2.45;
    showToast(restored ? "PHASE AWAKENED · ONE HEART PETAL RESTORED" : "PHASE AWAKENED · HEART FULL", "perfect", 1.8);
    announce(restored ? "Phase awakened. One Heart Petal restored." : "Phase awakened. Heart Petals full.");
  }

  function startPhase(index) {
    game.phaseIndex = index;
    game.phaseTimer = index === 0 ? 2.65 : 2.25;
    game.mode = "phaseIntro";
    game.crownlight = 0;
    game.faultStreak = 0;
    game.contactStreak = 0;
    game.anchors = [];
    game.sealSweep = 0;
    game.sealPerfects = 0;
    game.sealGolds = 0;
    game.beat = null;
    spectacle.beginPhase(scene.guardian, index);
    ui.app.dataset.phase = String(index + 1);
    ui.app.dataset.state = "phase-intro";
    audio.setPhase(index);
    ui.phaseName.textContent = PHASES[index].name;
    setObjective(PHASES[index].kicker, "0% LIGHT");
    updateHud(true);
    announce(`${PHASES[index].name}. ${PHASES[index].copy}`);
  }

  function resetScene() {
    scene.particles.length = 0;
    scene.floaters.length = 0;
    scene.ripples.length = 0;
    scene.seals.length = 0;
    scene.branches.length = 0;
    scene.growth.length = 0;
    scene.events.length = 0;
    spectacle.resetGuardianState(scene.guardian);
    if (!scene.motes.length) {
      for (let index = 0; index < 85; index += 1) {
        scene.motes.push({
          x: Math.random(),
          y: Math.random(),
          size: randomRange(0.6, 2.4),
          speed: randomRange(0.08, 0.35),
          phase: Math.random() * TAU,
          color: Math.random() > 0.72 ? COLORS.gold : COLORS.cyan,
        });
      }
    }
  }

  function startRun() {
    audio.init();
    clearTransientStatus();
    const runSeed = ((Date.now() & 0xffffffff) ^ Math.floor(performance.now() * 1000)) >>> 0;
    game.rng = mulberry32(runSeed);
    game.fxRng = mulberry32((runSeed ^ 0x9e3779b9) >>> 0);
    game.runTime = 0;
    game.score = 0;
    game.displayedScore = 0;
    game.petals = 3;
    game.crownlight = 0;
    game.faultStreak = 0;
    game.contactStreak = 0;
    game.maxStreak = 0;
    game.seals = 0;
    game.anchorsPlaced = 0;
    game.perfects = 0;
    game.cleans = 0;
    game.softs = 0;
    game.golds = 0;
    game.faults = 0;
    game.petalsLost = 0;
    game.phasesCleared = 0;
    game.awakened = false;
    game.completionSent = false;
    game.runStarted = true;
    game.beatId = 0;
    game.flash = 0;
    game.shake = 0;
    game.frayPulse = 0;
    game.crownPulse = 0;
    game.cinematicTime = 0;
    game.cinematicDuration = spectacle.awakeningDuration(reducedMotion);
    game.failureTime = 0;
    input.aimAngle = -Math.PI / 2;
    input.keys.clear();
    resetScene();
    ui.hud.classList.remove("is-cinematic");
    ui.app.dataset.state = "entering";
    ui.hud.classList.remove("is-hidden");
    ui.hud.inert = false;
    canvas.inert = false;
    setAriaHidden(ui.hud, false);
    setAriaHidden(canvas, false);
    canvas.focus({ preventScroll: true });
    ui.titleOverlay.classList.remove("is-visible");
    ui.pauseOverlay.classList.remove("is-visible");
    ui.resultOverlay.classList.remove("is-visible");
    ui.titleOverlay.inert = true;
    ui.pauseOverlay.inert = true;
    ui.resultOverlay.inert = true;
    setAriaHidden(ui.titleOverlay, true);
    setAriaHidden(ui.pauseOverlay, true);
    setAriaHidden(ui.resultOverlay, true);
    window.setTimeout(() => canvas.focus({ preventScroll: true }), 30);
    postToGrove("run-start");
    startPhase(0);
  }

  function finishRun(awakened) {
    if (game.completionSent) return;
    game.completionSent = true;
    game.awakened = Boolean(awakened);
    game.mode = "result";
    game.beat = null;
    const score = Math.max(0, Math.round(game.score));
    const previousBest = game.best;
    game.best = Math.max(game.best, score);
    if (game.best > previousBest) writeBest(game.best);
    const rank = rules.rankFor(score, game.awakened);
    ui.hud.classList.remove("is-cinematic");
    ui.app.dataset.state = game.awakened ? "awakened" : "sleeping";
    clearTransientStatus();
    ui.resultTitle.textContent = game.awakened ? "The Crownheart awakens." : "The Crown still sleeps.";
    ui.resultCopy.textContent = game.awakened
      ? "Gold, cyan, and coral became one living canopy. The Concord Banyan remembers your hands."
      : "Every completed seal remains in the tree. Return when you are ready to bind the threefold light again.";
    ui.resultScore.textContent = format(score);
    ui.resultRank.textContent = rank.toUpperCase();
    ui.resultSeals.textContent = String(game.seals);
    ui.resultPerfects.textContent = String(game.perfects);
    ui.resultBest.textContent = format(game.best);
    ui.startBest.textContent = `PERSONAL BEST · ${format(game.best)}`;
    ui.resultOverlay.classList.add("is-visible");
    ui.resultOverlay.inert = false;
    setAriaHidden(ui.resultOverlay, false);
    ui.replayButton.focus({ preventScroll: true });
    ui.hud.classList.add("is-hidden");
    ui.pauseOverlay.classList.remove("is-visible");
    ui.hud.inert = true;
    ui.pauseOverlay.inert = true;
    canvas.inert = true;
    setAriaHidden(ui.hud, true);
    setAriaHidden(canvas, true);
    setAriaHidden(ui.pauseOverlay, true);
    window.setTimeout(() => ui.replayButton.focus({ preventScroll: true }), 30);
    postToGrove("run-complete", {
      victory: game.awakened,
      score,
      best: game.best,
      rank,
      stats: {
        phasesCleared: game.phasesCleared,
        seals: game.seals,
        anchors: game.anchorsPlaced,
        perfects: game.perfects,
        cleans: game.cleans,
        softs: game.softs,
        golds: game.golds,
        faults: game.faults,
        petalsRemaining: game.petals,
        petalsLost: game.petalsLost,
        maxStreak: game.maxStreak,
        seconds: Math.round(game.runTime),
      },
      assist: { preset: "standard", scoreChanging: false },
    });
  }

  function goHome() {
    audio.suspend();
    clearTransientStatus();
    game.mode = "title";
    game.runStarted = false;
    game.beat = null;
    ui.hud.classList.remove("is-cinematic");
    ui.app.dataset.state = "title";
    input.keys.clear();
    ui.titleOverlay.classList.add("is-visible");
    ui.titleOverlay.inert = false;
    setAriaHidden(ui.titleOverlay, false);
    ui.playButton.focus({ preventScroll: true });
    ui.hud.classList.add("is-hidden");
    ui.pauseOverlay.classList.remove("is-visible");
    ui.resultOverlay.classList.remove("is-visible");
    ui.hud.inert = true;
    ui.pauseOverlay.inert = true;
    ui.resultOverlay.inert = true;
    canvas.inert = true;
    setAriaHidden(ui.hud, true);
    setAriaHidden(canvas, true);
    setAriaHidden(ui.pauseOverlay, true);
    setAriaHidden(ui.resultOverlay, true);
    ui.startBest.textContent = `PERSONAL BEST · ${format(game.best)}`;
    window.setTimeout(() => ui.playButton.focus({ preventScroll: true }), 30);
  }

  function pauseGame() {
    if (!["playing", "phaseIntro", "phaseClear", "awakening", "failing"].includes(game.mode)) return;
    game.modeBeforePause = game.mode;
    game.mode = "paused";
    clearTransientStatus();
    input.keys.clear();
    ui.pauseOverlay.inert = false;
    ui.pauseOverlay.classList.add("is-visible");
    setAriaHidden(ui.pauseOverlay, false);
    ui.resumeButton.focus({ preventScroll: true });
    ui.hud.inert = true;
    canvas.inert = true;
    setAriaHidden(ui.hud, true);
    setAriaHidden(canvas, true);
    audio.suspend();
    window.setTimeout(() => ui.resumeButton.focus({ preventScroll: true }), 30);
  }

  function resumeGame() {
    if (game.mode !== "paused") return;
    game.mode = game.modeBeforePause || "playing";
    game.lastTime = performance.now();
    ui.hud.inert = false;
    canvas.inert = false;
    setAriaHidden(ui.hud, false);
    setAriaHidden(canvas, false);
    canvas.focus({ preventScroll: true });
    ui.pauseOverlay.classList.remove("is-visible");
    ui.pauseOverlay.inert = true;
    setAriaHidden(ui.pauseOverlay, true);
    window.setTimeout(() => canvas.focus({ preventScroll: true }), 30);
    audio.init();
  }

  function updateObjective() {
    if (!game.runStarted) return;
    if (!game.anchors.length) {
      const message = game.phaseIndex === 0 && game.seals === 0 ? "ALIGN WITH A CYAN ARC" : "CHOOSE THE FIRST LIGHT";
      const changed = ui.objectiveText.textContent !== message;
      setObjective(message, `${game.crownlight}% LIGHT`);
      if (changed) announce(`${message}.`);
      return;
    }
    if (game.anchors.length < 3) {
      const message = "CATCH THE NEXT PULSE";
      const changed = ui.objectiveText.textContent !== message;
      setObjective(message, `${game.anchors.length} / 3 ANCHORS`);
      if (changed) announce(`${message}.`);
      return;
    }
    const message = game.anchors.length >= 6 ? "RETURN TO THE FIRST LIGHT" : "CLOSE NOW OR EXTEND THE SEAL";
    const changed = ui.objectiveText.textContent !== message;
    setObjective(message, `${game.anchors.length} / 6 ANCHORS`);
    if (changed) announce(`${message}.`);
  }

  function updateHud(immediate = false) {
    if (immediate) game.displayedScore = game.score;
    ui.scoreValue.textContent = format(game.displayedScore);
    ui.bestValue.textContent = `BEST ${format(Math.max(game.best, game.score))}`;
    ui.phaseName.textContent = PHASES[game.phaseIndex]?.name || "THE CONCORD BANYAN";
    ui.crownlightValue.textContent = `${Math.round(game.crownlight)}%`;
    ui.crownlightFill.style.width = `${clamp(game.crownlight, 0, 100)}%`;
    const track = ui.crownlightFill.parentElement;
    track.setAttribute("aria-valuenow", String(Math.round(game.crownlight)));
    ui.healthValue.textContent = `${game.petals} / 3`;
    const petals = [...ui.petalDisplay.querySelectorAll("span")];
    petals.forEach((petal, index) => petal.classList.toggle("is-lost", index >= game.petals));
    ui.petalDisplay.setAttribute("aria-label", `${game.petals} of 3 Heart Petals remain`);
    ui.multiplierValue.textContent = `×${rules.contactMultiplier(game.contactStreak).toFixed(1)}`;
    ui.sealCount.textContent = String(game.seals);
  }

  function updateParticles(dt) {
    for (const particle of scene.particles) {
      particle.life -= dt;
      if (!reducedMotion) {
        particle.x += particle.vx * dt;
        particle.y += particle.vy * dt;
        particle.vx *= Math.pow(0.08, dt);
        particle.vy = particle.vy * Math.pow(0.11, dt) + 12 * dt;
      }
    }
    scene.particles = scene.particles.filter((particle) => particle.life > 0);
    for (const floater of scene.floaters) {
      floater.life -= dt;
      if (!reducedMotion) floater.y -= 28 * dt;
    }
    scene.floaters = scene.floaters.filter((floater) => floater.life > 0);
    for (const ripple of scene.ripples) ripple.life -= dt * 0.75;
    scene.ripples = scene.ripples.filter((ripple) => ripple.life > 0);
  }

  function update(dt) {
    if (game.mode === "paused") {
      updateHud();
      return;
    }
    view.time += dt;
    game.flash = Math.max(0, game.flash - dt * 1.8);
    game.shake = Math.max(0, game.shake - dt * 22);
    game.frayPulse = Math.max(0, game.frayPulse - dt * 0.18);
    game.crownPulse = Math.max(0, game.crownPulse - dt * 0.75);
    if (game.toastTimer > 0) {
      game.toastTimer -= dt;
      if (game.toastTimer <= 0) ui.toast.classList.remove("is-visible");
    }
    updateParticles(dt);
    updateSpectacleEvents(dt);
    spectacle.updateGuardian(scene.guardian, dt, {
      phaseIndex: game.phaseIndex,
      crownlight: game.crownlight,
      aimAngle: input.aimAngle,
      reducedMotion,
      paused: false,
    });
    if (game.displayedScore !== game.score) {
      const difference = game.score - game.displayedScore;
      game.displayedScore += difference * Math.min(1, dt * 8);
      if (Math.abs(game.score - game.displayedScore) < 0.5) game.displayedScore = game.score;
    }
    // The ceremony is presentation, not play time. Excluding it keeps Grove
    // completion timing identical for standard and reduced-motion players.
    if (game.runStarted && !["title", "result", "awakening"].includes(game.mode)) game.runTime += dt;
    if (game.mode === "title" || game.mode === "result") {
      updateHud();
      return;
    }

    if (game.mode === "phaseIntro") {
      game.phaseTimer -= dt;
      if (game.phaseTimer <= 0) {
        game.mode = "playing";
        ui.app.dataset.state = "playing";
        beginBeat(0.28);
        showToast(PHASES[game.phaseIndex].kicker, "", 1.25);
      }
      updateHud();
      return;
    }

    if (game.mode === "phaseClear") {
      game.phaseTimer -= dt;
      if (game.phaseTimer <= 0) startPhase(game.phaseIndex + 1);
      updateHud();
      return;
    }

    if (game.mode === "awakening") {
      game.cinematicTime = Math.min(game.cinematicDuration, game.cinematicTime + dt);
      game.resultDelay = Math.max(0, game.cinematicDuration - game.cinematicTime);
      if (game.cinematicTime >= game.cinematicDuration) finishRun(true);
      updateHud();
      return;
    }

    if (game.mode === "failing") {
      game.failureTime += dt;
      game.resultDelay -= dt;
      if (game.resultDelay <= 0) finishRun(false);
      updateHud();
      return;
    }

    if (game.mode !== "playing") return;
    const direction = (input.keys.has("arrowright") || input.keys.has("d") ? 1 : 0)
      - (input.keys.has("arrowleft") || input.keys.has("a") ? 1 : 0);
    if (direction) input.aimAngle = normAngle(input.aimAngle + direction * dt * (game.phaseIndex === 2 ? 2.25 : 2.05));

    if (!game.beat) beginBeat();
    if (game.beat) {
      game.beat.age += dt;
      if (game.beat.status === "waiting" && game.beat.age >= 0) game.beat.status = "approach";
      if (!game.beat.resolved && game.beat.status === "approach") {
        const phase = PHASES[game.phaseIndex];
        const cueStage = spectacle.beatCueStage(game.beat.age, game.beat.contactAt);
        if (!game.beat.approachCuePlayed && cueStage === "approach") {
          game.beat.approachCuePlayed = true;
          audio.approach(false);
        }
        if (!game.beat.contactCuePlayed && cueStage === "contact") {
          game.beat.contactCuePlayed = true;
          audio.approach(true);
        }
        if (game.beat.age > game.beat.contactAt + phase.windows.soft) handleFault("PULSE MISSED");
      }
      if (game.beat.resolved) {
        game.beat.settle -= dt;
        if (game.beat.settle <= 0 && game.mode === "playing") beginBeat();
      }
    }
    updateObjective();
    updateHud();
  }

  function resizeCanvas(force = false) {
    if (!force && !view.needsResize) return;
    const oldWidth = view.width;
    const oldHeight = view.height;
    const rect = canvas.getBoundingClientRect();
    const dprCap = coarsePointer ? 1.5 : 1.9;
    view.dpr = clamp(window.devicePixelRatio || 1, 1, dprCap);
    view.width = Math.max(1, rect.width || window.innerWidth || 1280);
    view.height = Math.max(1, rect.height || window.innerHeight || 720);
    const backingWidth = Math.round(view.width * view.dpr);
    const backingHeight = Math.round(view.height * view.dpr);
    if (canvas.width !== backingWidth || canvas.height !== backingHeight) {
      canvas.width = backingWidth;
      canvas.height = backingHeight;
    }
    const compactLandscape = view.height <= 430 && view.width > view.height;
    view.cx = view.width * 0.5;
    view.cy = view.height * (compactLandscape ? 0.54 : view.height < 560 ? 0.53 : 0.49);
    const verticalRoom = compactLandscape ? view.height * 0.22 : view.height < 560 ? view.height * 0.31 : view.height * 0.3;
    view.orbit = clamp(Math.min(view.width * 0.235, verticalRoom), 48, 285);
    if (oldWidth > 0 && oldHeight > 0 && (oldWidth !== view.width || oldHeight !== view.height)) {
      const scaleX = view.width / oldWidth;
      const scaleY = view.height / oldHeight;
      [scene.particles, scene.floaters, scene.ripples].forEach((collection) => {
        collection.forEach((item) => {
          item.x *= scaleX;
          item.y *= scaleY;
        });
      });
    }
    view.needsResize = false;
  }

  function drawBackground() {
    const phase = PHASES[game.phaseIndex] || PHASES[0];
    const gradient = ctx.createRadialGradient(view.cx, view.cy, view.orbit * 0.08, view.cx, view.cy, Math.max(view.width, view.height) * 0.78);
    gradient.addColorStop(0, phase.palette[1]);
    gradient.addColorStop(0.38, phase.palette[0]);
    gradient.addColorStop(1, COLORS.ink);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, view.width, view.height);

    const sky = ctx.createLinearGradient(0, 0, 0, view.height);
    sky.addColorStop(0, "rgba(13,38,34,.25)");
    sky.addColorStop(0.6, "rgba(3,10,14,.1)");
    sky.addColorStop(1, "rgba(0,0,0,.48)");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, view.width, view.height);

    ctx.save();
    ctx.globalCompositeOperation = "screen";
    for (let index = 0; index < 4; index += 1) {
      const radius = view.orbit * (1.2 + index * 0.38) + (reducedMotion ? 0 : Math.sin(view.time * 0.22 + index) * 16);
      ctx.strokeStyle = index % 2 ? "rgba(114,228,210,.025)" : "rgba(255,216,120,.025)";
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(view.cx, view.cy, radius, 0, TAU);
      ctx.stroke();
    }
    ctx.restore();
  }

  function reactionAmount(field, durationKey) {
    const duration = spectacle.REACTION_DURATIONS[durationKey] || 1;
    return clamp((scene.guardian[field] || 0) / duration, 0, 1);
  }

  function growthDestination(growth) {
    if (growth.phase < 2) {
      return { x: growth.xNorm * view.width, y: growth.yNorm * view.height };
    }
    return {
      x: view.cx + Math.cos(growth.angle) * view.orbit * growth.radial,
      y: view.cy + Math.sin(growth.angle) * view.orbit * growth.radial * 0.78,
    };
  }

  function drawPhaseEnvironment() {
    const phase = game.phaseIndex;
    const growth = encounterGrowth();
    const motion = reducedMotion ? 0 : view.time;
    ctx.save();

    const horizon = view.cy + view.orbit * 0.54;
    const water = ctx.createLinearGradient(0, horizon, 0, view.height);
    water.addColorStop(0, `rgba(111,231,241,${0.018 + phase * 0.016})`);
    water.addColorStop(0.32, `rgba(30,103,104,${0.08 + phase * 0.018})`);
    water.addColorStop(1, "rgba(1,8,10,.52)");
    ctx.fillStyle = water;
    ctx.fillRect(0, horizon, view.width, view.height - horizon);
    ctx.globalCompositeOperation = "screen";
    const waterLines = coarsePointer ? 5 : 9;
    for (let index = 0; index < waterLines; index += 1) {
      const y = horizon + (index + 1) / (waterLines + 1) * (view.height - horizon);
      const drift = Math.sin(motion * 0.35 + index * 1.7) * view.orbit * 0.08;
      ctx.strokeStyle = phase === 0 ? "rgba(114,228,210,.075)" : phase === 1 ? "rgba(145,244,238,.11)" : "rgba(185,160,255,.085)";
      ctx.lineWidth = index % 3 === 0 ? 1.5 : 1;
      ctx.beginPath();
      ctx.ellipse(view.cx + drift, y, view.orbit * (0.5 + index * 0.18), view.orbit * 0.018, 0, 0, TAU);
      ctx.stroke();
    }

    if (phase === 0) {
      ctx.strokeStyle = `rgba(255,216,120,${0.07 + growth * 0.1})`;
      ctx.lineCap = "round";
      for (let index = 0; index < 11; index += 1) {
        const spread = (index - 5) / 5;
        const bottomX = view.cx + spread * view.width * 0.48;
        const sway = Math.sin(motion * 0.22 + index) * view.orbit * 0.035;
        ctx.lineWidth = Math.max(1, view.orbit * (0.012 - Math.abs(spread) * 0.004));
        ctx.beginPath();
        ctx.moveTo(view.cx + spread * view.orbit * 0.16, view.cy + view.orbit * 0.16);
        ctx.bezierCurveTo(view.cx + spread * view.orbit * 0.4, horizon, bottomX * 0.74 + view.cx * 0.26 + sway, view.height * 0.8, bottomX, view.height + 8);
        ctx.stroke();
      }
    } else {
      const canopyAlpha = phase === 1 ? 0.11 : 0.15;
      const branchColor = phase === 1 ? `rgba(114,228,210,${canopyAlpha})` : `rgba(255,142,164,${canopyAlpha})`;
      ctx.strokeStyle = branchColor;
      ctx.lineCap = "round";
      for (let index = 0; index < (coarsePointer ? 10 : 16); index += 1) {
        const side = index % 2 ? 1 : -1;
        const band = Math.floor(index / 2);
        const startX = view.cx + side * view.orbit * 0.2;
        const startY = view.cy - view.orbit * 0.18;
        const endX = view.cx + side * view.orbit * (0.72 + band * 0.12);
        const endY = view.cy - view.orbit * (0.62 + band * 0.11) + Math.sin(motion * 0.28 + index) * view.orbit * 0.025;
        ctx.lineWidth = Math.max(1, view.orbit * (0.022 - band * 0.0012));
        ctx.beginPath();
        ctx.moveTo(startX, startY);
        ctx.bezierCurveTo(startX + side * view.orbit * 0.34, startY - view.orbit * 0.18, endX - side * view.orbit * 0.2, endY + view.orbit * 0.12, endX, endY);
        ctx.stroke();
      }

      ctx.save();
      ctx.translate(view.cx, view.cy);
      ctx.rotate(reducedMotion ? 0 : motion * (phase === 1 ? 0.018 : -0.026));
      const petals = phase === 1 ? 12 : 18;
      for (let index = 0; index < petals; index += 1) {
        const angle = index / petals * TAU;
        const radius = view.orbit * (1.42 + (index % 3) * 0.16);
        const color = phase === 1 ? "rgba(145,244,238,.075)" : index % 3 === 0 ? "rgba(255,216,120,.085)" : index % 3 === 1 ? "rgba(114,228,210,.08)" : "rgba(255,142,164,.085)";
        ctx.fillStyle = color;
        ctx.save();
        ctx.rotate(angle);
        ctx.translate(radius, 0);
        ctx.rotate(angle * 0.25);
        ctx.beginPath();
        ctx.ellipse(0, 0, view.orbit * 0.16, view.orbit * 0.045, 0, 0, TAU);
        ctx.fill();
        ctx.restore();
      }
      ctx.restore();
    }
    ctx.restore();
  }

  function drawGuardianBack() {
    const guardian = scene.guardian;
    const contact = reactionAmount("contactTimer", "contact");
    const fray = reactionAmount("frayTimer", "fray");
    const recovery = reactionAmount("recoveryTimer", "recovery");
    const petalLoss = reactionAmount("petalLossTimer", "petalLoss");
    const phaseSurge = reactionAmount("phaseTimer", "phase");
    const awakeningState = game.mode === "awakening"
      ? spectacle.awakeningCue(game.cinematicTime, game.cinematicDuration)
      : null;
    const acceptanceProgress = awakeningState ? smooth(clamp((awakeningState.progress - 0.34) / 0.56, 0, 1)) : 0;
    const acceptance = reducedMotion ? (awakeningState ? 1 : 0) : acceptanceProgress;
    const crownBase = reducedMotion ? game.crownlight / 100 : guardian.crownOpen;
    const crownOpen = clamp(crownBase * 0.58 + acceptance * 0.74, 0, 1);
    const breath = reducedMotion ? 0 : Math.sin(view.time * 0.82) * 0.018;
    const recoil = reducedMotion ? 0 : fray * 0.035 + petalLoss * 0.055;
    const scale = 1 + breath + (reducedMotion ? 0 : contact * 0.012 + recovery * 0.016 + phaseSurge * 0.025) - recoil;
    const r = view.orbit;
    ctx.save();
    ctx.translate(view.cx, view.cy + r * (0.04 + acceptance * 0.018));
    ctx.scale(scale, scale);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    const body = ctx.createLinearGradient(0, -r, 0, r);
    body.addColorStop(0, "rgba(35,72,58,.78)");
    body.addColorStop(0.48, "rgba(16,43,38,.92)");
    body.addColorStop(1, "rgba(5,20,20,.96)");
    ctx.fillStyle = body;
    ctx.strokeStyle = "rgba(255,216,120,.12)";
    ctx.lineWidth = Math.max(2, r * 0.028);
    ctx.beginPath();
    ctx.moveTo(-r * 0.34, r * 0.92);
    ctx.bezierCurveTo(-r * 0.58, r * 0.34, -r * 0.58, -r * 0.34, -r * 0.3, -r * 0.68);
    ctx.bezierCurveTo(-r * 0.16, -r * 0.88, r * 0.16, -r * 0.88, r * 0.3, -r * 0.68);
    ctx.bezierCurveTo(r * 0.58, -r * 0.34, r * 0.58, r * 0.34, r * 0.34, r * 0.92);
    ctx.bezierCurveTo(r * 0.14, r * 0.72, -r * 0.14, r * 0.72, -r * 0.34, r * 0.92);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    if (crownOpen > 0.015) {
      ctx.save();
      ctx.globalCompositeOperation = "screen";
      ctx.lineCap = "round";
      for (let branch = -2; branch <= 2; branch += 1) {
        const spread = branch * r * 0.105;
        const reach = r * (0.18 + Math.abs(branch) * 0.045) * crownOpen;
        ctx.strokeStyle = branch % 2 ? COLORS.cyan : COLORS.gold;
        ctx.globalAlpha = 0.12 + crownOpen * 0.34;
        ctx.lineWidth = Math.max(1.5, r * (0.014 + crownOpen * 0.009));
        ctx.beginPath();
        ctx.moveTo(spread * 0.42, -r * 0.61);
        ctx.quadraticCurveTo(spread * 0.72, -r * (0.78 + crownOpen * 0.08), spread + Math.sign(branch || 1) * reach, -r * (0.88 + crownOpen * 0.18));
        ctx.stroke();
      }
      ctx.restore();
    }

    const handDraw = (side) => {
      const inward = (reducedMotion ? 0 : fray * 0.05 + petalLoss * 0.08 - recovery * 0.035) * side;
      const lift = crownOpen * r * 0.2;
      ctx.strokeStyle = "rgba(11,37,33,.94)";
      ctx.lineWidth = r * 0.16;
      ctx.beginPath();
      ctx.moveTo(side * r * 0.28, r * 0.42);
      ctx.bezierCurveTo(side * r * (0.76 - inward), r * 0.56 - lift * 0.2, side * r * (1.08 - inward), r * 0.18 - lift * 0.55, side * r * 1.31, -r * 0.08 - lift);
      ctx.stroke();
      ctx.strokeStyle = side < 0 ? "rgba(255,216,120,.16)" : "rgba(114,228,210,.16)";
      ctx.lineWidth = Math.max(1.5, r * 0.018);
      ctx.beginPath();
      ctx.moveTo(side * r * 0.28, r * 0.39);
      ctx.bezierCurveTo(side * r * 0.72, r * 0.48 - lift * 0.2, side * r * 1.03, r * 0.16 - lift * 0.55, side * r * 1.31, -r * 0.08 - lift);
      ctx.stroke();
      for (let finger = 0; finger < 3; finger += 1) {
        const baseX = side * r * 1.24;
        const baseY = -r * 0.04 - lift;
        ctx.strokeStyle = "rgba(18,52,44,.92)";
        ctx.lineWidth = r * 0.045;
        ctx.beginPath();
        ctx.moveTo(baseX, baseY);
        ctx.quadraticCurveTo(side * r * (1.38 + finger * 0.035), -r * (0.18 + finger * 0.1), side * r * (1.29 + finger * 0.07), -r * (0.32 + finger * 0.12));
        ctx.stroke();
      }
    };
    handDraw(-1);
    handDraw(1);

    ctx.globalCompositeOperation = "screen";
    const veinAlpha = 0.11 + guardian.awareness * 0.25 + contact * 0.18 + phaseSurge * 0.12 + crownOpen * 0.13;
    const veinColors = [COLORS.gold, COLORS.cyan, COLORS.coral];
    for (let index = 0; index < 9; index += 1) {
      const spread = (index - 4) * r * 0.075;
      ctx.strokeStyle = veinColors[index % (game.phaseIndex + 1)] || COLORS.gold;
      ctx.globalAlpha = veinAlpha * (index % 2 ? 0.7 : 1);
      ctx.lineWidth = Math.max(1, r * 0.012);
      ctx.beginPath();
      ctx.moveTo(spread * 0.18, r * 0.6);
      ctx.bezierCurveTo(spread * 0.45, r * 0.22, spread * 0.9, -r * 0.18, spread, -r * 0.58);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    if (crownOpen > 0.02) {
      ctx.strokeStyle = COLORS.pearl;
      ctx.globalAlpha = 0.12 + crownOpen * 0.48;
      ctx.shadowBlur = r * (0.04 + crownOpen * 0.1);
      ctx.shadowColor = game.phaseIndex === 2 ? COLORS.coral : COLORS.gold;
      ctx.lineWidth = Math.max(1.25, r * 0.012);
      ctx.beginPath();
      ctx.moveTo(0, -r * 0.66);
      ctx.bezierCurveTo(-r * 0.035 * crownOpen, -r * 0.44, r * 0.035 * crownOpen, -r * 0.12, 0, r * 0.27);
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;
    }

    const sleeping = game.mode === "failing" || (game.mode === "result" && game.runStarted && !game.awakened);
    const sleepClose = game.mode === "failing" ? (reducedMotion ? 1 : clamp(game.failureTime * 0.85, 0, 1)) : sleeping ? 1 : 0;
    const contactEye = reducedMotion ? (contact > 0 ? 0.24 : 0) : contact * 0.28;
    const phaseEye = reducedMotion ? (phaseSurge > 0 ? 0.12 : 0) : phaseSurge * 0.14;
    const frayEye = reducedMotion ? (fray > 0 ? 0.34 : 0) : fray * 0.38;
    const eyeOpen = clamp(0.12 + guardian.awareness * 0.72 + game.phaseIndex * 0.08 + contactEye + phaseEye + acceptance * 0.24 - guardian.blink - frayEye - sleepClose, 0.035, 1);
    const gazeX = reducedMotion ? 0 : Math.cos(guardian.gazeAngle) * r * 0.018;
    const gazeY = reducedMotion ? 0 : Math.sin(guardian.gazeAngle) * r * 0.012;
    for (const side of [-1, 1]) {
      const x = side * r * 0.245;
      const y = -r * 0.2;
      ctx.fillStyle = game.phaseIndex === 0 ? "rgba(255,216,120,.86)" : game.phaseIndex === 1 ? "rgba(145,244,238,.9)" : "rgba(255,248,223,.94)";
      ctx.shadowBlur = r * (0.12 + (reducedMotion ? (contact > 0 ? 0.13 : 0) : contact * 0.13) + acceptance * 0.09);
      ctx.shadowColor = game.phaseIndex === 2 ? COLORS.coral : game.phaseIndex === 1 ? COLORS.cyan : COLORS.gold;
      ctx.beginPath();
      ctx.ellipse(x, y, r * 0.09, r * 0.034 * eyeOpen, side * -0.12, 0, TAU);
      ctx.fill();
      if (eyeOpen > 0.16) {
        ctx.shadowBlur = 0;
        ctx.fillStyle = "rgba(4,18,17,.92)";
        ctx.beginPath();
        ctx.arc(x + gazeX, y + gazeY, r * 0.016, 0, TAU);
        ctx.fill();
      }
    }
    ctx.shadowBlur = 0;
    if (contact > 0.02) {
      const contactReach = reducedMotion ? 1 : contact;
      ctx.strokeStyle = COLORS.pearl;
      ctx.globalAlpha = contact * 0.72;
      ctx.lineWidth = Math.max(1.25, r * 0.009);
      for (const side of [-1, 1]) {
        const x = side * r * 0.245;
        ctx.beginPath();
        ctx.moveTo(x + side * r * 0.11, -r * 0.2);
        ctx.lineTo(x + side * r * (0.17 + contactReach * 0.07), -r * 0.2);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
    if (fray > 0.02) {
      ctx.strokeStyle = `rgba(255,130,153,${0.28 + fray * 0.62})`;
      ctx.lineWidth = Math.max(2, r * 0.018);
      ctx.beginPath();
      ctx.moveTo(-r * 0.03, -r * 0.5);
      ctx.lineTo(r * 0.025, -r * 0.24);
      ctx.lineTo(-r * 0.015, r * 0.02);
      ctx.lineTo(r * 0.05, r * 0.27);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawWorldGrowth() {
    if (!scene.growth.length) return;
    const awakening = game.mode === "awakening" ? spectacle.awakeningCue(game.cinematicTime, game.cinematicDuration) : null;
    const bloomBoost = awakening && ["bloom", "recognition"].includes(awakening.cue) ? smooth((awakening.progress - 0.6) / 0.4) : 0;
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    ctx.lineCap = "round";
    for (const growth of scene.growth) {
      const age = Math.max(0, game.runTime - growth.born);
      const grow = reducedMotion ? 1 : smooth(clamp(age / 1.05, 0, 1));
      const source = worldPoint(growth.center);
      const destination = growthDestination(growth);
      const phaseColor = growth.phase === 0 ? COLORS.gold : growth.phase === 1 ? COLORS.cyan : COLORS.coral;
      ctx.strokeStyle = phaseColor;
      ctx.globalAlpha = 0.08 + grow * 0.17 + bloomBoost * 0.12;
      ctx.lineWidth = 1 + growth.areaRatio * 2.4;
      ctx.beginPath();
      ctx.moveTo(source.x, source.y);
      const controlX = lerp(source.x, view.cx, 0.48);
      const controlY = lerp(source.y, view.cy, 0.48);
      ctx.quadraticCurveTo(controlX, controlY, lerp(source.x, destination.x, grow), lerp(source.y, destination.y, grow));
      ctx.stroke();

      ctx.save();
      ctx.translate(destination.x, destination.y);
      const finaleScale = reducedMotion ? 1 : 1 + bloomBoost * 0.28;
      ctx.scale(grow * finaleScale, grow * finaleScale);
      if (growth.phase === 0) {
        const height = view.orbit * (0.25 + growth.areaRatio * 0.24);
        ctx.strokeStyle = COLORS.gold;
        ctx.globalAlpha = 0.28 + growth.areaRatio * 0.28;
        ctx.lineWidth = 1.5 + growth.areaRatio * 2.5;
        ctx.beginPath();
        ctx.moveTo(0, height * 0.5);
        ctx.quadraticCurveTo(Math.sin(growth.seed * 9) * height * 0.16, 0, 0, -height * 0.5);
        ctx.stroke();
        const forks = clamp(growth.anchorCount - 1, 2, 5);
        for (let index = 0; index < forks; index += 1) {
          const side = index % 2 ? 1 : -1;
          const y = height * (0.2 - index * 0.15);
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.quadraticCurveTo(side * height * 0.18, y - height * 0.12, side * height * (0.22 + index * 0.025), y - height * 0.22);
          ctx.stroke();
        }
        ctx.fillStyle = growth.golds ? COLORS.gold : COLORS.cyan;
        ctx.globalAlpha = 0.7;
        ctx.beginPath();
        ctx.arc(0, -height * 0.5, 4 + growth.perfects * 0.9, 0, TAU);
        ctx.fill();
        for (const side of [-1, 1]) {
          ctx.fillStyle = side < 0 ? COLORS.gold : COLORS.cyan;
          ctx.globalAlpha = 0.38 + growth.areaRatio * 0.22;
          ctx.beginPath();
          ctx.ellipse(side * height * 0.11, -height * 0.28, height * 0.11, height * 0.038, side * 0.55, 0, TAU);
          ctx.fill();
        }
      } else if (growth.phase === 1) {
        const width = view.orbit * (0.17 + growth.anchorCount * 0.025);
        ctx.strokeStyle = COLORS.cyan;
        ctx.globalAlpha = 0.3 + growth.areaRatio * 0.25;
        ctx.lineWidth = 1.5 + growth.areaRatio * 2;
        ctx.beginPath();
        ctx.moveTo(-width * 0.55, width * 0.18);
        ctx.quadraticCurveTo(0, -width * 0.24, width * 0.55, width * 0.08);
        ctx.stroke();
        for (let index = 0; index < growth.anchorCount; index += 1) {
          const t = growth.anchorCount === 1 ? 0.5 : index / (growth.anchorCount - 1);
          const x = lerp(-width * 0.48, width * 0.48, t);
          const y = Math.sin(t * Math.PI) * -width * 0.18;
          ctx.fillStyle = growth.golds > index ? COLORS.gold : COLORS.cyan;
          ctx.globalAlpha = 0.55;
          ctx.beginPath();
          ctx.ellipse(x, y, width * 0.075, width * 0.03, t * 1.2 - 0.6, 0, TAU);
          ctx.fill();
        }
      } else {
        const petalCount = growth.anchorCount;
        const radius = view.orbit * (0.075 + growth.areaRatio * 0.055);
        for (let index = 0; index < petalCount; index += 1) {
          ctx.save();
          ctx.rotate(index / petalCount * TAU + growth.seed * TAU);
          ctx.translate(radius * 0.72, 0);
          ctx.fillStyle = index % 3 === 0 ? COLORS.coral : index % 3 === 1 ? COLORS.violet : COLORS.cyan;
          ctx.globalAlpha = 0.3 + growth.areaRatio * 0.28 + bloomBoost * 0.18;
          ctx.beginPath();
          ctx.ellipse(radius * 0.3, 0, radius * 0.68, radius * 0.23, 0, 0, TAU);
          ctx.fill();
          ctx.restore();
        }
        ctx.fillStyle = growth.golds ? COLORS.gold : COLORS.pearl;
        ctx.globalAlpha = 0.82;
        ctx.beginPath();
        ctx.arc(0, 0, radius * 0.22, 0, TAU);
        ctx.fill();
      }
      ctx.restore();
    }
    ctx.restore();
  }

  function drawSpectacleEvents() {
    if (!scene.events.length) return;
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    for (const event of scene.events) {
      const progress = clamp(event.age / event.duration, 0, 1);
      const alpha = 1 - smooth(progress);
      if (event.type === "falling-petal") {
        const side = event.payload.side || 1;
        const x = view.cx + side * view.orbit * (reducedMotion ? 0.86 : 0.72 + progress * 0.25);
        const y = reducedMotion ? view.cy + view.orbit * 0.45 : view.cy - view.orbit * 0.32 + progress * view.orbit * 1.42;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate((reducedMotion ? 0.78 : view.time * 1.8) * side);
        ctx.fillStyle = `rgba(255,142,164,${alpha * 0.8})`;
        ctx.beginPath();
        ctx.moveTo(0, -view.orbit * 0.05);
        ctx.quadraticCurveTo(view.orbit * 0.045, 0, 0, view.orbit * 0.065);
        ctx.quadraticCurveTo(-view.orbit * 0.045, 0, 0, -view.orbit * 0.05);
        ctx.fill();
        ctx.restore();
      } else if (event.type === "recognition" && event.payload.point) {
        const source = worldPoint(event.payload.point);
        ctx.strokeStyle = event.payload.color || COLORS.cyan;
        ctx.globalAlpha = alpha * 0.52;
        ctx.lineWidth = Math.max(1.5, view.orbit * 0.012);
        ctx.beginPath();
        ctx.arc(view.cx, view.cy - view.orbit * 0.2, view.orbit * (reducedMotion ? 0.28 : 0.12 + progress * 0.22), Math.PI * 0.12, Math.PI * 0.88);
        ctx.stroke();
        ctx.globalAlpha = alpha * 0.3;
        ctx.beginPath();
        ctx.moveTo(source.x, source.y);
        ctx.quadraticCurveTo(lerp(source.x, view.cx, 0.55), lerp(source.y, view.cy, 0.55), view.cx, view.cy - view.orbit * 0.14);
        ctx.stroke();
      } else if (event.type === "repair-wave" && event.payload.point) {
        const source = worldPoint(event.payload.point);
        ctx.strokeStyle = COLORS.pearl;
        ctx.globalAlpha = alpha * 0.55;
        ctx.lineWidth = 2 + (1 - progress) * 3;
        ctx.beginPath();
        ctx.moveTo(source.x, source.y);
        ctx.quadraticCurveTo(view.cx + (source.x - view.cx) * 0.25, view.cy + (source.y - view.cy) * 0.25, view.cx, view.cy);
        ctx.stroke();
      } else if (event.type === "phase-surge") {
        ctx.strokeStyle = event.payload.phase === 0 ? COLORS.gold : event.payload.phase === 1 ? COLORS.cyan : COLORS.coral;
        ctx.globalAlpha = alpha * 0.32;
        ctx.lineWidth = Math.max(2, view.orbit * 0.018);
        ctx.beginPath();
        ctx.ellipse(view.cx, view.cy, view.orbit * (reducedMotion ? 1.55 : 1.05 + progress * 0.72), view.orbit * (reducedMotion ? 0.86 : 0.62 + progress * 0.28), 0, 0, TAU);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  function drawAwakeningSequence() {
    if (game.mode !== "awakening") return;
    const state = spectacle.awakeningCue(game.cinematicTime, game.cinematicDuration);
    const progress = state.progress;
    const gather = clamp((progress - 0.12) / 0.32, 0, 1);
    const open = clamp((progress - 0.38) / 0.24, 0, 1);
    const bloom = clamp((progress - 0.58) / 0.28, 0, 1);
    const recognition = clamp((progress - 0.78) / 0.22, 0, 1);
    ctx.save();
    ctx.globalCompositeOperation = "screen";

    if (gather > 0) {
      const gatherTravel = reducedMotion ? 1 : gather;
      for (const growth of scene.growth) {
        const destination = growthDestination(growth);
        const color = growth.phase === 0 ? COLORS.gold : growth.phase === 1 ? COLORS.cyan : COLORS.coral;
        ctx.strokeStyle = color;
        ctx.globalAlpha = gather * 0.22;
        ctx.lineWidth = 1.5 + growth.areaRatio * 2;
        ctx.beginPath();
        ctx.moveTo(destination.x, destination.y);
        ctx.quadraticCurveTo(lerp(destination.x, view.cx, 0.58), lerp(destination.y, view.cy, 0.58), lerp(destination.x, view.cx, gatherTravel), lerp(destination.y, view.cy, gatherTravel));
        ctx.stroke();
      }
    }

    if (open > 0) {
      const haloReach = reducedMotion ? 1 : open;
      const halo = ctx.createRadialGradient(view.cx, view.cy, 0, view.cx, view.cy, view.orbit * (0.25 + haloReach * 1.12));
      halo.addColorStop(0, `rgba(255,248,223,${0.38 * open})`);
      halo.addColorStop(0.35, `rgba(255,216,120,${0.2 * open})`);
      halo.addColorStop(0.68, `rgba(114,228,210,${0.12 * open})`);
      halo.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(view.cx, view.cy, view.orbit * (0.35 + haloReach * 1.15), 0, TAU);
      ctx.fill();
    }

    if (bloom > 0) {
      const petals = coarsePointer ? 18 : 27;
      ctx.save();
      ctx.translate(view.cx, view.cy);
      ctx.rotate(reducedMotion ? 0 : progress * 0.45);
      for (let index = 0; index < petals; index += 1) {
        const angle = index / petals * TAU;
        const radius = view.orbit * (reducedMotion ? 1.2 + (index % 3) * 0.1 : 0.42 + bloom * (0.78 + (index % 3) * 0.13));
        ctx.save();
        ctx.rotate(angle);
        ctx.translate(radius, 0);
        ctx.fillStyle = index % 3 === 0 ? COLORS.gold : index % 3 === 1 ? COLORS.cyan : COLORS.coral;
        ctx.globalAlpha = bloom * 0.16 + recognition * 0.08;
        ctx.beginPath();
        ctx.ellipse(0, 0, view.orbit * (reducedMotion ? 0.15 : 0.08 + bloom * 0.08), view.orbit * 0.026, 0, 0, TAU);
        ctx.fill();
        ctx.restore();
      }
      ctx.restore();
    }

    if (recognition > 0) {
      const bloomY = view.cy - view.orbit * 0.56;
      ctx.save();
      ctx.translate(view.cx, bloomY);
      ctx.rotate(Math.PI / 4);
      ctx.fillStyle = `rgba(255,248,223,${recognition * 0.92})`;
      ctx.shadowBlur = view.orbit * 0.18;
      ctx.shadowColor = COLORS.gold;
      ctx.fillRect(-view.orbit * 0.055, -view.orbit * 0.055, view.orbit * 0.11, view.orbit * 0.11);
      ctx.restore();
    }
    ctx.restore();
  }

  function drawMotes() {
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    for (const mote of scene.motes) {
      const sway = reducedMotion ? 0 : Math.sin(view.time * mote.speed + mote.phase) * 18;
      const x = (mote.x * view.width + sway + view.width) % view.width;
      const y = reducedMotion ? mote.y * view.height : (mote.y * view.height - view.time * mote.speed * 7 + view.height) % view.height;
      const alpha = reducedMotion ? 0.3 : 0.18 + (Math.sin(view.time * 1.4 + mote.phase) * 0.5 + 0.5) * 0.36;
      ctx.fillStyle = mote.color === COLORS.gold ? `rgba(255,216,120,${alpha})` : `rgba(114,228,210,${alpha})`;
      ctx.beginPath();
      ctx.arc(x, y, mote.size, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawRoots() {
    const growth = encounterGrowth();
    const branchCount = 8 + Math.round(growth * 10);
    ctx.save();
    ctx.lineCap = "round";
    for (let index = 0; index < branchCount; index += 1) {
      const side = index % 2 ? 1 : -1;
      const band = Math.floor(index / 2);
      const originY = view.cy + view.orbit * (0.06 + band * 0.023);
      const reach = view.orbit * (0.55 + band * 0.055 + growth * 0.35);
      const sway = reducedMotion ? 0 : Math.sin(view.time * 0.45 + index * 1.7) * view.orbit * 0.025;
      const endX = view.cx + side * reach + sway;
      const endY = view.cy - view.orbit * (0.1 + band * 0.07 + growth * 0.22);
      const gradient = ctx.createLinearGradient(view.cx, originY, endX, endY);
      gradient.addColorStop(0, `rgba(255,216,120,${0.2 + growth * 0.2})`);
      gradient.addColorStop(0.55, `rgba(114,228,210,${0.16 + growth * 0.16})`);
      gradient.addColorStop(1, "rgba(255,142,164,.05)");
      ctx.strokeStyle = gradient;
      ctx.lineWidth = Math.max(1, view.orbit * (0.022 - band * 0.0008));
      ctx.beginPath();
      ctx.moveTo(view.cx + side * view.orbit * 0.08, originY);
      ctx.bezierCurveTo(
        view.cx + side * reach * 0.28,
        originY - view.orbit * (0.2 + band * 0.02),
        view.cx + side * reach * 0.62,
        endY + view.orbit * 0.08,
        endX,
        endY,
      );
      ctx.stroke();

      if (growth > 0.12) {
        const leafAlpha = 0.12 + growth * 0.35;
        ctx.fillStyle = index % 3 === 0 ? `rgba(255,216,120,${leafAlpha})` : `rgba(114,228,210,${leafAlpha})`;
        ctx.beginPath();
        ctx.ellipse(endX, endY, view.orbit * 0.032, view.orbit * 0.014, side * 0.7, 0, TAU);
        ctx.fill();
      }
    }

    const rootY = view.cy + view.orbit * 0.28;
    for (let index = 0; index < 9; index += 1) {
      const angle = Math.PI * (0.08 + index / 10 * 0.84);
      const direction = index < 4 ? -1 : 1;
      const x = view.cx + Math.cos(angle) * view.orbit * 0.18;
      const endX = view.cx + (index - 4) * view.orbit * 0.24;
      const endY = view.cy + view.orbit * (0.78 + Math.sin(index) * 0.08);
      ctx.strokeStyle = `rgba(114,228,210,${0.08 + growth * 0.13})`;
      ctx.lineWidth = Math.max(1, view.orbit * 0.014);
      ctx.beginPath();
      ctx.moveTo(x, rootY);
      ctx.bezierCurveTo(x + direction * view.orbit * 0.22, rootY + view.orbit * 0.16, endX * 0.8 + view.cx * 0.2, endY - view.orbit * 0.1, endX, endY);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawCrownheart() {
    const heartbeat = reducedMotion ? 0 : Math.sin(view.time * 1.7) * 0.025;
    const sealReaction = reactionAmount("sealTimer", "seal");
    const recovery = reactionAmount("recoveryTimer", "recovery");
    const pulse = reducedMotion ? 1 : 1 + heartbeat + game.crownPulse * 0.08 + sealReaction * 0.045 + recovery * 0.025;
    const radius = view.orbit * 0.205 * pulse;
    ctx.save();
    ctx.translate(view.cx, view.cy);

    const aura = ctx.createRadialGradient(0, 0, radius * 0.2, 0, 0, radius * 2.35);
    aura.addColorStop(0, `rgba(255,248,223,${0.22 + game.crownPulse * 0.1})`);
    aura.addColorStop(0.32, "rgba(255,216,120,.13)");
    aura.addColorStop(0.68, "rgba(114,228,210,.055)");
    aura.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = aura;
    ctx.beginPath();
    ctx.arc(0, 0, radius * 2.4, 0, TAU);
    ctx.fill();

    const heart = ctx.createLinearGradient(-radius, -radius, radius, radius);
    heart.addColorStop(0, "#442c32");
    heart.addColorStop(0.45, "#1e463c");
    heart.addColorStop(0.72, "#163229");
    heart.addColorStop(1, "#70483a");
    ctx.fillStyle = heart;
    ctx.strokeStyle = "rgba(255,216,120,.34)";
    ctx.lineWidth = Math.max(2, view.orbit * 0.012);
    ctx.beginPath();
    ctx.moveTo(0, radius * 1.14);
    ctx.bezierCurveTo(-radius * 0.88, radius * 0.55, -radius * 0.92, -radius * 0.54, -radius * 0.35, -radius * 0.8);
    ctx.bezierCurveTo(-radius * 0.05, -radius * 1.03, radius * 0.06, -radius * 0.82, 0, -radius * 0.6);
    ctx.bezierCurveTo(radius * 0.2, -radius * 0.94, radius * 0.84, -radius * 0.78, radius * 0.88, -radius * 0.18);
    ctx.bezierCurveTo(radius * 0.96, radius * 0.4, radius * 0.54, radius * 0.77, 0, radius * 1.14);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.globalCompositeOperation = "screen";
    const phaseLight = game.phaseIndex === 0 ? COLORS.gold : game.phaseIndex === 1 ? COLORS.cyan : COLORS.coral;
    for (let index = 0; index < 5; index += 1) {
      const offset = (index - 2) * radius * 0.24;
      ctx.strokeStyle = index === 2 ? "rgba(255,248,223,.65)" : phaseLight;
      ctx.globalAlpha = 0.12 + game.phasesCleared * 0.08 + game.crownlight / 100 * 0.15;
      ctx.lineWidth = Math.max(1, radius * 0.045);
      ctx.beginPath();
      ctx.moveTo(offset * 0.25, radius * 0.72);
      ctx.bezierCurveTo(offset * 0.7, radius * 0.3, offset * 1.2, -radius * 0.1, offset, -radius * 0.72);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    const stage = spectacle.phaseStage(game.crownlight);
    const stageCount = { watching: 0, recognition: 1, challenge: 2, invitation: 3, acceptance: 3 }[stage] || 0;
    for (let index = 0; index < 3; index += 1) {
      const angle = -Math.PI / 2 + index / 3 * TAU;
      const x = Math.cos(angle) * radius * 1.34;
      const y = Math.sin(angle) * radius * 1.34;
      const active = index < stageCount || game.awakened || game.mode === "awakening";
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(Math.PI / 4);
      ctx.fillStyle = active ? [COLORS.gold, COLORS.cyan, COLORS.coral][index] : "rgba(255,248,223,.12)";
      ctx.globalAlpha = active ? 0.72 : 0.5;
      const size = radius * (active ? 0.105 : 0.075);
      ctx.fillRect(-size * 0.5, -size * 0.5, size, size);
      ctx.restore();
    }

    if (game.awakened || game.mode === "awakening") {
      const awakening = game.mode === "awakening" ? spectacle.awakeningCue(game.cinematicTime, game.cinematicDuration).progress : 1;
      ctx.save();
      ctx.rotate(Math.PI / 4 + (reducedMotion ? 0 : awakening * 0.3));
      ctx.fillStyle = COLORS.pearl;
      ctx.shadowBlur = radius * 0.7;
      ctx.shadowColor = COLORS.gold;
      const prism = radius * (0.16 + awakening * 0.11);
      ctx.fillRect(-prism * 0.5, -prism * 0.5, prism, prism);
      ctx.restore();
    }
    ctx.restore();
  }

  function drawOrbit() {
    const phase = PHASES[game.phaseIndex] || PHASES[0];
    ctx.save();
    ctx.translate(view.cx, view.cy);
    for (let index = 0; index < 3; index += 1) {
      const radius = view.orbit * (0.82 + index * 0.09);
      ctx.strokeStyle = index === 1 ? "rgba(255,255,255,.075)" : "rgba(114,228,210,.06)";
      ctx.lineWidth = index === 1 ? 2 : 1;
      ctx.setLineDash(index === 1 ? [3, 12] : []);
      ctx.lineDashOffset = reducedMotion ? 0 : -view.time * (6 + game.phaseIndex * 4) * (index % 2 ? 1 : -1);
      ctx.beginPath();
      ctx.arc(0, 0, radius, 0, TAU);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    const currentCount = 10 + game.phaseIndex * 4;
    for (let index = 0; index < currentCount; index += 1) {
      const angle = index / currentCount * TAU + (reducedMotion ? 0 : view.time * phase.current * (index % 2 ? 1 : -1));
      const radius = view.orbit * (0.84 + (index % 3) * 0.045);
      ctx.strokeStyle = index % 3 === 0 ? "rgba(255,216,120,.18)" : "rgba(114,228,210,.13)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, radius, angle, angle + 0.08 + game.phaseIndex * 0.025);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawCompletedSeals() {
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    for (const seal of scene.seals) {
      if (seal.points.length < 3) continue;
      const age = Math.max(0, game.runTime - seal.born);
      const settle = clamp(age / 0.65, 0, 1);
      const echo = lerp(0.92, 0.18, smooth(clamp(age / 1.25, 0, 1)));
      const finale = game.mode === "awakening" ? spectacle.awakeningCue(game.cinematicTime, game.cinematicDuration).progress * 0.22 : 0;
      const colors = [COLORS.gold, COLORS.cyan, COLORS.coral];
      const color = colors[seal.phase] || COLORS.cyan;
      ctx.beginPath();
      seal.points.forEach((point, index) => {
        const world = worldPoint(point);
        if (index === 0) ctx.moveTo(world.x, world.y);
        else ctx.lineTo(world.x, world.y);
      });
      ctx.closePath();
      ctx.fillStyle = seal.phase === 0 ? `rgba(255,216,120,${0.045 + settle * 0.035})`
        : seal.phase === 1 ? `rgba(114,228,210,${0.045 + settle * 0.035})`
          : `rgba(255,142,164,${0.045 + settle * 0.035})`;
      ctx.strokeStyle = color;
      ctx.globalAlpha = (0.18 + seal.strength * 0.34) * echo + finale;
      ctx.lineWidth = 1.5 + seal.strength * 1.8;
      ctx.fill();
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  function drawActiveThread() {
    if (!game.anchors.length) return;
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.globalCompositeOperation = "screen";
    ctx.strokeStyle = game.faultStreak ? "rgba(255,130,153,.55)" : "rgba(255,248,223,.78)";
    ctx.lineWidth = Math.max(2.5, view.orbit * 0.018);
    if (game.faultStreak) {
      ctx.setLineDash([8, 9]);
      ctx.lineDashOffset = reducedMotion ? 0 : -view.time * 18;
    }
    ctx.beginPath();
    game.anchors.forEach((anchor, index) => {
      const world = worldPoint(anchor);
      if (index === 0) ctx.moveTo(world.x, world.y);
      else ctx.lineTo(world.x, world.y);
    });
    ctx.stroke();
    ctx.setLineDash([]);

    const selected = nearestOption();
    if (selected) {
      const last = worldPoint(game.anchors[game.anchors.length - 1]);
      const targetPoint = optionPoint(selected.option);
      const target = worldPoint(targetPoint);
      const aligned = selected.difference <= selected.option.width * 0.66 + 0.055;
      const legal = optionIsLegal(selected.option);
      ctx.strokeStyle = !aligned ? "rgba(255,255,255,.2)" : legal ? (selected.option.gold ? COLORS.gold : COLORS.cyan) : COLORS.danger;
      ctx.globalAlpha = aligned ? 0.72 : 0.28;
      ctx.lineWidth = Math.max(1.5, view.orbit * 0.011);
      if (!legal) ctx.setLineDash([6, 8]);
      ctx.beginPath();
      ctx.moveTo(last.x, last.y);
      ctx.lineTo(target.x, target.y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
    }

    game.anchors.forEach((anchor, index) => {
      const world = worldPoint(anchor);
      const first = index === 0;
      const pulse = !reducedMotion && first && game.anchors.length >= 3 ? 1 + Math.sin(view.time * 5) * 0.18 : 1;
      ctx.fillStyle = first ? COLORS.gold : COLORS.pearl;
      ctx.shadowBlur = view.orbit * 0.08;
      ctx.shadowColor = first ? COLORS.gold : COLORS.cyan;
      ctx.beginPath();
      ctx.arc(world.x, world.y, view.orbit * (first ? 0.034 : 0.027) * pulse, 0, TAU);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = first ? COLORS.gold : COLORS.cyan;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(world.x, world.y, view.orbit * 0.058 * pulse, 0, TAU);
      ctx.stroke();
    });
    ctx.restore();
  }

  function drawOptions() {
    if (game.mode !== "playing" || !game.beat?.options?.length || game.beat.status === "waiting" || game.beat.resolved) return;
    const selected = nearestOption();
    ctx.save();
    ctx.lineCap = "round";
    ctx.globalCompositeOperation = "screen";
    for (const option of game.beat.options) {
      const point = optionPoint(option);
      const angle = point.angle;
      const active = selected?.option?.id === option.id;
      const legal = optionIsLegal(option);
      const aligned = active && selected.difference <= option.width * 0.66 + 0.055;
      const color = !legal ? COLORS.danger : option.gold ? COLORS.gold : option.closing ? COLORS.pearl : COLORS.cyan;
      ctx.strokeStyle = color;
      ctx.globalAlpha = !legal ? (highContrast ? 0.76 : 0.46) : active ? 0.98 : highContrast ? 0.72 : 0.62;
      ctx.lineWidth = active ? view.orbit * (highContrast ? 0.082 : 0.07) : view.orbit * (highContrast ? 0.052 : 0.045);
      if (!legal) ctx.setLineDash([5, 8]);
      ctx.beginPath();
      ctx.arc(view.cx, view.cy, view.orbit, angle - option.width * 0.5, angle + option.width * 0.5);
      ctx.stroke();
      ctx.setLineDash([]);

      const world = worldPoint(point);
      ctx.fillStyle = color;
      ctx.globalAlpha = legal ? 0.95 : 0.5;
      ctx.beginPath();
      if (option.closing) {
        const size = view.orbit * (aligned ? 0.045 : 0.035);
        ctx.moveTo(world.x, world.y - size);
        ctx.lineTo(world.x + size, world.y);
        ctx.lineTo(world.x, world.y + size);
        ctx.lineTo(world.x - size, world.y);
        ctx.closePath();
      } else {
        ctx.arc(world.x, world.y, view.orbit * (option.gold ? 0.024 : 0.02), 0, TAU);
      }
      ctx.fill();
      if (!legal) {
        const notch = view.orbit * 0.032;
        ctx.globalAlpha = highContrast ? 1 : 0.78;
        ctx.strokeStyle = "rgba(30,2,9,.96)";
        ctx.lineWidth = Math.max(4, view.orbit * 0.028);
        ctx.beginPath();
        ctx.moveTo(world.x - notch, world.y - notch);
        ctx.lineTo(world.x + notch, world.y + notch);
        ctx.moveTo(world.x + notch, world.y - notch);
        ctx.lineTo(world.x - notch, world.y + notch);
        ctx.stroke();
        ctx.strokeStyle = COLORS.danger;
        ctx.lineWidth = Math.max(2, view.orbit * 0.012);
        ctx.stroke();
      }
      if (active) {
        ctx.globalAlpha = 0.38 + (aligned ? 0.35 : 0);
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(world.x, world.y, view.orbit * 0.085, 0, TAU);
        ctx.stroke();
      }
    }
    ctx.restore();

    ctx.save();
    ctx.translate(view.cx, view.cy);
    ctx.rotate(input.aimAngle);
    ctx.strokeStyle = "rgba(255,248,223,.45)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(view.orbit * 0.72, 0);
    ctx.lineTo(view.orbit * 1.12, 0);
    ctx.stroke();
    ctx.fillStyle = "rgba(255,248,223,.8)";
    ctx.beginPath();
    ctx.moveTo(view.orbit * 1.12, 0);
    ctx.lineTo(view.orbit * 1.07, -5);
    ctx.lineTo(view.orbit * 1.07, 5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function drawTimingPulse() {
    if (game.mode !== "playing" || !game.beat || game.beat.status === "waiting" || game.beat.resolved) return;
    const phase = PHASES[game.phaseIndex];
    const progress = clamp(game.beat.age / game.beat.contactAt, 0, 1.22);
    const beforeContact = progress <= 1;
    const radius = reducedMotion ? view.orbit : beforeContact ? lerp(view.orbit * 0.2, view.orbit, easeOut(progress)) : view.orbit * (1 + (progress - 1) * 0.22);
    const distance = Math.abs(game.beat.age - game.beat.contactAt);
    const near = clamp(1 - distance / Math.max(0.01, phase.windows.soft), 0, 1);
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    ctx.strokeStyle = near > 0.72 ? COLORS.pearl : near > 0.32 ? COLORS.gold : COLORS.cyan;
    ctx.globalAlpha = reducedMotion ? 0.16 + near * 0.82 : beforeContact ? 0.2 + near * 0.72 : clamp(0.7 - (progress - 1) * 2.5, 0, 0.7);
    ctx.lineWidth = Math.max(2, view.orbit * (0.012 + near * 0.018));
    ctx.beginPath();
    ctx.arc(view.cx, view.cy, radius, 0, TAU);
    ctx.stroke();
    ctx.globalAlpha = 0.1 + near * 0.24;
    ctx.lineWidth = view.orbit * 0.07;
    ctx.beginPath();
    ctx.arc(view.cx, view.cy, radius, 0, TAU);
    ctx.stroke();
    ctx.restore();
  }

  function drawRipplesAndParticles() {
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    for (const ripple of scene.ripples) {
      const progress = 1 - clamp(ripple.life / 1.4, 0, 1);
      ctx.strokeStyle = ripple.color;
      ctx.globalAlpha = clamp(ripple.life, 0, 1) * 0.42;
      ctx.lineWidth = 1.5 + ripple.strength;
      ctx.beginPath();
      ctx.ellipse(ripple.x, ripple.y, reducedMotion ? 28 * ripple.strength : 10 + progress * 70 * ripple.strength, reducedMotion ? 12 * ripple.strength : 5 + progress * 25 * ripple.strength, 0, 0, TAU);
      ctx.stroke();
    }
    for (const particle of scene.particles) {
      ctx.fillStyle = particle.color;
      ctx.globalAlpha = clamp(particle.life / particle.maxLife, 0, 1);
      ctx.beginPath();
      ctx.arc(particle.x, particle.y, particle.size * (reducedMotion ? 1 : clamp(particle.life * 1.4, 0.2, 1)), 0, TAU);
      ctx.fill();
    }
    ctx.restore();

    ctx.save();
    ctx.textAlign = "center";
    ctx.font = `800 ${clamp(view.orbit * 0.065, 14, 21)}px system-ui, sans-serif`;
    for (const floater of scene.floaters) {
      const alpha = clamp(floater.life / floater.maxLife, 0, 1);
      ctx.fillStyle = floater.color;
      ctx.globalAlpha = alpha;
      ctx.shadowBlur = 12;
      ctx.shadowColor = floater.color;
      ctx.fillText(floater.text, floater.x, floater.y);
    }
    ctx.restore();
  }

  function drawModeBanner() {
    if (!["phaseIntro", "phaseClear", "awakening", "failing"].includes(game.mode)) return;
    if (game.mode === "phaseIntro" && game.phaseIndex === 0 && game.runTime < 0.45) return;
    let bannerAlpha = 1;
    if (game.mode === "awakening") {
      const progress = spectacle.awakeningCue(game.cinematicTime, game.cinematicDuration).progress;
      if (progress < 0.78) return;
      bannerAlpha = smooth(clamp((progress - 0.78) / 0.16, 0, 1));
    }
    let kicker = "";
    let title = "";
    let copy = "";
    if (game.mode === "phaseIntro") {
      const phase = PHASES[game.phaseIndex];
      kicker = phase.kicker;
      title = phase.name;
      copy = phase.copy;
    } else if (game.mode === "phaseClear") {
      kicker = "CROWNLIGHT COMPLETE";
      title = "THE ROOT REMEMBERS";
      copy = "One living layer has awakened.";
    } else if (game.mode === "awakening") {
      kicker = "THREE LANGUAGES · ONE CROWN";
      title = "THE CROWNHEART AWAKENS";
      copy = "Gold, cyan, and coral become white-gold life.";
    } else {
      kicker = "THE LIGHT REMAINS";
      title = "THE CROWN STILL SLEEPS";
      copy = "Every completed seal is remembered.";
    }
    ctx.save();
    const maxWidth = Math.max(1, view.width - 28);
    const fitFont = (text, preferred, minimum, weight, family) => {
      let size = Math.max(minimum, preferred);
      do {
        ctx.font = `${weight} ${size}px ${family}`;
        if (ctx.measureText(text).width <= maxWidth || size <= minimum) break;
        size -= 1;
      } while (size > minimum);
      return size;
    };
    const drawWrapped = (text, y, preferred, minimum) => {
      const fontSize = fitFont(text, preferred, minimum, 500, "system-ui, sans-serif");
      if (ctx.measureText(text).width <= maxWidth) {
        ctx.fillText(text, view.cx, y, maxWidth);
        return;
      }
      const words = text.split(" ");
      const lines = [];
      let line = "";
      for (const word of words) {
        const candidate = line ? `${line} ${word}` : word;
        if (line && ctx.measureText(candidate).width > maxWidth) {
          lines.push(line);
          line = word;
        } else line = candidate;
      }
      if (line) lines.push(line);
      const lineHeight = fontSize + 5;
      lines.forEach((value, index) => ctx.fillText(value, view.cx, y + index * lineHeight, maxWidth));
    };
    ctx.globalAlpha = bannerAlpha;
    ctx.fillStyle = game.mode === "awakening" ? "rgba(2,9,10,.12)" : "rgba(2,9,10,.32)";
    ctx.fillRect(0, 0, view.width, view.height);
    ctx.textAlign = "center";
    ctx.fillStyle = COLORS.gold;
    const kickerSize = fitFont(kicker, clamp(view.width * 0.011, 12, 16), 10, 900, "system-ui, sans-serif");
    ctx.fillStyle = COLORS.pearl;
    const titleSize = fitFont(title, clamp(view.width * 0.033, 28, 54), 18, 400, "Georgia, serif");
    const titleY = view.cy + titleSize * 0.28;
    ctx.fillStyle = COLORS.gold;
    fitFont(kicker, kickerSize, 10, 900, "system-ui, sans-serif");
    ctx.fillText(kicker, view.cx, titleY - titleSize - Math.max(8, kickerSize * 0.45), maxWidth);
    ctx.fillStyle = COLORS.pearl;
    fitFont(title, titleSize, 18, 400, "Georgia, serif");
    ctx.fillText(title, view.cx, titleY, maxWidth);
    ctx.fillStyle = "rgba(255,248,223,.72)";
    drawWrapped(copy, titleY + Math.max(25, titleSize * 0.86), clamp(view.width * 0.013, 15, 21), 12);
    ctx.restore();
  }

  function drawVignette() {
    const gradient = ctx.createRadialGradient(view.cx, view.cy, Math.min(view.width, view.height) * 0.24, view.cx, view.cy, Math.max(view.width, view.height) * 0.72);
    gradient.addColorStop(0, "rgba(0,0,0,0)");
    gradient.addColorStop(0.64, "rgba(0,0,0,.08)");
    gradient.addColorStop(1, "rgba(0,0,0,.68)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, view.width, view.height);
    if (game.flash > 0) {
      const color = game.petals <= 0 || game.faultStreak ? `rgba(255,130,153,${game.flash * 0.12})` : `rgba(255,248,223,${game.flash * 0.12})`;
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, view.width, view.height);
    }
  }

  function draw() {
    resizeCanvas();
    ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    ctx.save();
    if (game.shake > 0 && !reducedMotion) {
      ctx.translate(Math.sin(view.time * 173.3) * game.shake, Math.cos(view.time * 149.7) * game.shake);
    }
    drawBackground();
    drawPhaseEnvironment();
    drawMotes();
    drawRoots();
    drawGuardianBack();
    drawWorldGrowth();
    drawSpectacleEvents();
    drawOrbit();
    drawCompletedSeals();
    drawCrownheart();
    drawOptions();
    drawActiveThread();
    drawTimingPulse();
    drawRipplesAndParticles();
    drawAwakeningSequence();
    drawModeBanner();
    drawVignette();
    ctx.restore();
  }

  function setAimFromPointer(event) {
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    input.aimAngle = normAngle(Math.atan2(y - view.cy, x - view.cx));
    input.pointerSeen = true;
  }

  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.().catch(() => {});
    } else {
      document.exitFullscreen?.().catch(() => {});
    }
  }

  function makeQaPanel() {
    const qaHostAllowed = window.location.protocol === "file:"
      || ["localhost", "127.0.0.1", "::1", "[::1]"].includes(window.location.hostname);
    if (!pageParams.has("qa") || !qaHostAllowed) return;
    const panel = document.createElement("aside");
    panel.setAttribute("aria-label", "Prismbind QA controls");
    Object.assign(panel.style, {
      position: "fixed", right: "8px", bottom: "8px", zIndex: "50", display: "flex", flexWrap: "wrap",
      gap: "4px", maxWidth: "330px", padding: "6px", background: "rgba(0,0,0,.72)", border: "1px solid #72e4d2",
    });
    const add = (label, action) => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = label;
      Object.assign(button.style, { padding: "5px 7px", fontSize: "10px", color: "#fff8df", background: "#12352f", border: "1px solid #72e4d2", cursor: "pointer" });
      button.addEventListener("click", action);
      panel.appendChild(button);
    };
    add("START", () => startRun());
    add("PERFECT", () => {
      if (game.mode !== "playing" || !game.beat || game.beat.resolved) return;
      const legal = game.beat.options.find((option) => optionIsLegal(option));
      if (!legal) return;
      input.aimAngle = optionPoint(legal).angle;
      game.beat.age = game.beat.contactAt;
      attemptBind();
    });
    add("MISS", () => { if (game.mode === "playing") handleFault("QA MISS"); });
    add("PHASE", () => { if (game.mode === "playing") { game.crownlight = 100; clearPhase(); } });
    add("FAIL", () => { if (game.mode === "playing") { game.petals = 1; game.faultStreak = 1; handleFault("QA FAIL"); } });
    add("VICTORY", () => {
      if (!game.runStarted) startRun();
      game.phaseIndex = 2;
      game.mode = "playing";
      game.crownlight = 100;
      clearPhase();
    });
    document.body.appendChild(panel);
  }

  function frame(now) {
    const dt = clamp((now - game.lastTime) / 1000, 0, 0.05);
    game.lastTime = now;
    update(dt);
    draw();
    requestAnimationFrame(frame);
  }

  canvas.addEventListener("pointermove", (event) => {
    if (event.pointerType === "mouse" || event.isPrimary) setAimFromPointer(event);
  });
  canvas.addEventListener("pointerdown", (event) => {
    if (!event.isPrimary || event.button > 0) return;
    if (game.mode !== "playing") return;
    event.preventDefault();
    audio.init();
    setAimFromPointer(event);
    attemptBind();
  });
  canvas.addEventListener("contextmenu", (event) => event.preventDefault());

  window.addEventListener("keydown", (event) => {
    if (trapDialogFocus(event)) return;
    const key = event.key.toLowerCase();
    const buttonFocused = document.activeElement instanceof HTMLButtonElement;
    if (["arrowleft", "arrowright", "a", "d"].includes(key) && game.mode === "playing" && !buttonFocused) {
      event.preventDefault();
      input.keys.add(key);
      return;
    }
    if ((key === " " || key === "enter") && game.mode === "playing" && !buttonFocused) {
      event.preventDefault();
      if (!event.repeat) attemptBind();
      return;
    }
    if ((key === "p" || key === "escape") && !event.repeat) {
      if (game.mode === "paused") resumeGame();
      else if (!["title", "result"].includes(game.mode)) pauseGame();
      return;
    }
    if (key === "m" && !event.repeat) audio.toggle();
    if (key === "f" && !event.repeat) toggleFullscreen();
    if (key === "r" && game.mode === "result" && !event.repeat) startRun();
  });
  window.addEventListener("keyup", (event) => input.keys.delete(event.key.toLowerCase()));
  window.addEventListener("blur", () => {
    if (["playing", "phaseIntro", "phaseClear", "awakening", "failing"].includes(game.mode)) pauseGame();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && ["playing", "phaseIntro", "phaseClear", "awakening", "failing"].includes(game.mode)) pauseGame();
  });
  window.addEventListener("resize", () => { view.needsResize = true; resizeCanvas(true); });
  if (typeof ResizeObserver === "function") {
    const resizeObserver = new ResizeObserver(() => { view.needsResize = true; });
    resizeObserver.observe(canvas);
  }
  motionQuery?.addEventListener?.("change", (event) => {
    reducedMotion = event.matches;
    if (scene.particles.length > (reducedMotion ? 128 : 360)) scene.particles.splice(0, scene.particles.length - (reducedMotion ? 128 : 360));
    const awakeningPaused = game.mode === "paused" && game.modeBeforePause === "awakening";
    if (game.mode !== "awakening" && !awakeningPaused) game.cinematicDuration = spectacle.awakeningDuration(reducedMotion);
  });
  coarseQuery?.addEventListener?.("change", (event) => { coarsePointer = event.matches; view.needsResize = true; });
  contrastQuery?.addEventListener?.("change", (event) => { highContrast = event.matches; });

  ui.playButton.addEventListener("click", startRun);
  ui.replayButton.addEventListener("click", startRun);
  ui.homeButton.addEventListener("click", goHome);
  ui.pauseButton.addEventListener("click", pauseGame);
  ui.resumeButton.addEventListener("click", resumeGame);
  ui.quitButton.addEventListener("click", () => {
    postToGrove("run-abandon");
    goHome();
  });
  ui.soundButton.addEventListener("click", () => { audio.init(); audio.toggle(); });
  ui.fullscreenButton.addEventListener("click", toggleFullscreen);
  document.addEventListener("fullscreenchange", () => {
    ui.fullscreenButton.setAttribute("aria-label", document.fullscreenElement ? "Exit fullscreen" : "Enter fullscreen");
    ui.fullscreenButton.title = document.fullscreenElement ? "Exit fullscreen (F)" : "Enter fullscreen (F)";
  });

  ui.startBest.textContent = `PERSONAL BEST · ${format(game.best)}`;
  ui.bestValue.textContent = `BEST ${format(game.best)}`;
  ui.hud.inert = true;
  ui.pauseOverlay.inert = true;
  ui.resultOverlay.inert = true;
  ui.titleOverlay.inert = false;
  canvas.inert = true;
  setAriaHidden(ui.hud, true);
  setAriaHidden(canvas, true);
  setAriaHidden(ui.pauseOverlay, true);
  setAriaHidden(ui.resultOverlay, true);
  setAriaHidden(ui.titleOverlay, false);
  ui.app.dataset.phase = "1";
  ui.app.dataset.state = "title";
  resetScene();
  resizeCanvas(true);
  makeQaPanel();
  updateHud(true);
  postToGrove("game-ready");
  window.setTimeout(() => ui.playButton.focus({ preventScroll: true }), 100);
  requestAnimationFrame(frame);
})();
