(function initializeMothchorusGame(root, factory) {
  "use strict";

  const api = factory(root);
  if (typeof module === "object" && module.exports) {
    module.exports = api;
    return;
  }

  root.MothchorusGame = api;
  const launch = () => {
    try {
      const app = api.bootstrap(root.document);
      if (app && /(?:^|[?&])qa=1(?:&|$)/.test(root.location?.search || "")) {
        root.__MOTHCHORUS_QA__ = app.qaApi();
      }
    } catch (error) {
      api.showFatalError(root.document, error);
      root.console?.error?.(error);
    }
  };

  if (root.document?.readyState === "loading") root.document.addEventListener("DOMContentLoaded", launch, { once: true });
  else launch();
})(typeof globalThis !== "undefined" ? globalThis : this, function createMothchorusGame(root) {
  "use strict";

  const STORAGE_KEYS = Object.freeze({
    best: "mothchorus-best-v1",
    settings: "mothchorus-settings-v1",
    playtest: "mothchorus-playtest-v1",
  });
  const MAX_RECENT_RUNS = 12;
  const FINALE_SECONDS = 2.8;
  const GROVE_PROTOCOL = Object.freeze({
    source: "first-bloom-game",
    version: 1,
    gameId: "mothchorus",
  });
  const GROVE_RANKS = Object.freeze([
    Object.freeze({ threshold: 0, name: "FIRST VOICE" }),
    Object.freeze({ threshold: 4500, name: "MOONCALLER" }),
    Object.freeze({ threshold: 6500, name: "LINDEN KEEPER" }),
    Object.freeze({ threshold: 8000, name: "HEARTLIGHT CHOIR" }),
    Object.freeze({ threshold: 9500, name: "CROWN CHORUS" }),
  ]);
  const PHASES = Object.freeze({
    call: Object.freeze({ index: 0, label: "The Call" }),
    answer: Object.freeze({ index: 1, label: "The Answer" }),
    chorus: Object.freeze({ index: 2, label: "The Chorus" }),
  });
  const RESULT_MESSAGES = Object.freeze({
    "first-voice": "A first answer has entered the linden. Follow the dim voices and call them home.",
    mooncaller: "The garden heard you. Each careful pulse brought the chorus closer together.",
    "linden-keeper": "The Choir Linden holds your song among its heart-shaped leaves.",
    "heartlight-choir": "The moths carried one another through the dark and returned as heartlight.",
    "crown-chorus": "Every movement answered the next. The linden has learned your radiant chorus.",
  });

  function clamp(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, Number(value) || 0));
  }

  function integer(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.max(0, Math.floor(number)) : fallback;
  }

  function phaseInfo(phase) {
    return PHASES[phase] || PHASES.call;
  }

  function formatScore(value) {
    return integer(value).toLocaleString("en-US");
  }

  function titleCase(value) {
    return String(value || "First Voice")
      .toLowerCase()
      .replace(/\b\w/g, (letter) => letter.toUpperCase());
  }

  function safeParse(value, fallback) {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === "object" ? parsed : fallback;
    } catch (_error) {
      return fallback;
    }
  }

  function readStorage(key, fallback) {
    try {
      const value = root.localStorage?.getItem(key);
      return value ? safeParse(value, fallback) : fallback;
    } catch (_error) {
      return fallback;
    }
  }

  function writeStorage(key, value) {
    try {
      root.localStorage?.setItem(key, JSON.stringify(value));
      return true;
    } catch (_error) {
      return false;
    }
  }

  function isProtocolToken(value, minimumLength) {
    return typeof value === "string"
      && value.length >= minimumLength
      && value.length <= 128
      && /^[A-Za-z0-9._:-]+$/.test(value);
  }

  function parseGroveContext(windowTarget = root) {
    const locationTarget = windowTarget?.location || {};
    const protocol = typeof locationTarget.protocol === "string" ? locationTarget.protocol : "";
    const origin = typeof locationTarget.origin === "string" ? locationTarget.origin : "";
    const targetOrigin = protocol === "file:" || !origin || origin === "null" ? "*" : origin;
    let embedded = false;
    try {
      embedded = Boolean(windowTarget?.parent && windowTarget.parent !== windowTarget);
    } catch (_error) {
      embedded = false;
    }

    let params;
    try {
      const Params = windowTarget?.URLSearchParams || root.URLSearchParams;
      if (typeof Params !== "function") throw new TypeError("URLSearchParams is unavailable.");
      params = new Params(typeof locationTarget.search === "string" ? locationTarget.search : "");
    } catch (_error) {
      return Object.freeze({ hosted: false, sessionId: "", targetOrigin });
    }

    const groveValues = params.getAll("grove");
    const sessionValues = params.getAll("session");
    const sessionId = sessionValues.length === 1 ? sessionValues[0] : "";
    const hosted = embedded
      && groveValues.length === 1
      && groveValues[0] === "1"
      && isProtocolToken(sessionId, 8);
    return Object.freeze({
      hosted,
      sessionId: hosted ? sessionId : "",
      targetOrigin,
    });
  }

  function canonicalGroveRank(rawScore, Rules) {
    if (!Number.isSafeInteger(rawScore) || rawScore < 0 || rawScore > 10000) {
      throw new RangeError("Grove score must be a safe integer from 0 through 10000.");
    }
    const canonical = Rules?.rankForScore?.(rawScore)?.name;
    let expected = GROVE_RANKS[0].name;
    for (const rank of GROVE_RANKS) if (rawScore >= rank.threshold) expected = rank.name;
    if (canonical !== expected) throw new Error("Mothchorus rank rules no longer match the Grove wire contract.");
    return canonical;
  }

  function defaultRunId(sequence, windowTarget) {
    let entropy = "";
    try {
      const uuid = windowTarget?.crypto?.randomUUID?.();
      if (typeof uuid === "string" && uuid) entropy = uuid;
    } catch (_error) {
      entropy = "";
    }
    if (!entropy) {
      const random = Math.floor(Math.random() * 0x100000000).toString(36);
      entropy = `${Date.now().toString(36)}-${random}`;
    }
    return `moth-${sequence.toString(36)}-${entropy}`;
  }

  function createGroveBridge(windowTarget = root, options = {}) {
    const context = options.context || parseGroveContext(windowTarget);
    const idFactory = typeof options.idFactory === "function"
      ? options.idFactory
      : (sequence) => defaultRunId(sequence, windowTarget);
    const issuedRunIds = new Set();
    let sequence = 0;
    let readySent = false;
    let activeRunId = null;

    function post(type, fields = {}) {
      if (!context.hosted) return false;
      const message = {
        source: GROVE_PROTOCOL.source,
        version: GROVE_PROTOCOL.version,
        type,
        gameId: GROVE_PROTOCOL.gameId,
        sessionId: context.sessionId,
        ...fields,
      };
      try {
        windowTarget.parent.postMessage(message, context.targetOrigin);
        return true;
      } catch (_error) {
        return false;
      }
    }

    function nextRunId() {
      sequence += 1;
      let candidate = "";
      try {
        candidate = String(idFactory(sequence) || "");
      } catch (_error) {
        candidate = "";
      }
      if (!isProtocolToken(candidate, 4) || issuedRunIds.has(candidate)) {
        const safeBase = isProtocolToken(candidate, 1) ? candidate.slice(0, 118) : "moth-run";
        candidate = `${safeBase}-${sequence.toString(36)}`;
      }
      while (issuedRunIds.has(candidate)) {
        sequence += 1;
        candidate = `moth-run-${sequence.toString(36)}`;
      }
      issuedRunIds.add(candidate);
      return candidate;
    }

    function ready() {
      if (!context.hosted || readySent) return false;
      if (!post("game-ready")) return false;
      readySent = true;
      return true;
    }

    function abandonRun() {
      if (!context.hosted || !activeRunId) return false;
      const runId = activeRunId;
      if (!post("run-abandon", { runId })) return false;
      activeRunId = null;
      return true;
    }

    function startRun() {
      if (!context.hosted) return null;
      if (activeRunId && !abandonRun()) return null;
      const runId = nextRunId();
      if (!post("run-start", { runId })) return null;
      activeRunId = runId;
      return runId;
    }

    function completeRun(result) {
      if (!context.hosted || !activeRunId || !result || typeof result !== "object") return false;
      const score = result.score;
      const best = result.best;
      const finalVoiceCount = result.finalVoiceCount;
      const participantMode = result.participantMode;
      let expectedRank = GROVE_RANKS[0].name;
      for (const rank of GROVE_RANKS) if (score >= rank.threshold) expectedRank = rank.name;
      if (!Number.isSafeInteger(score) || score < 0 || score > 10000
        || !Number.isSafeInteger(best) || best < score || best > 10000
        || !Number.isSafeInteger(finalVoiceCount) || finalVoiceCount < 0 || finalVoiceCount > 24
        || (participantMode !== "solo" && participantMode !== "together")
        || result.rank !== expectedRank) {
        return false;
      }
      const runId = activeRunId;
      const sent = post("run-complete", {
        runId,
        score,
        best,
        rank: result.rank,
        victory: true,
        finalVoiceCount,
        participantMode,
        assist: { preset: "standard", scoreChanging: false },
      });
      if (!sent) return false;
      activeRunId = null;
      return true;
    }

    return Object.freeze({
      context,
      ready,
      startRun,
      abandonRun,
      completeRun,
      diagnostics: () => Object.freeze({
        hosted: context.hosted,
        readySent,
        activeRunId,
        issuedRunCount: issuedRunIds.size,
      }),
    });
  }

  function normalizeSettings(value, prefersReducedMotion = false) {
    const source = value && typeof value === "object" ? value : {};
    return Object.freeze({
      sound: source.sound !== false,
      reducedMotion: source.reducedMotion === undefined ? Boolean(prefersReducedMotion) : Boolean(source.reducedMotion),
      lowEffects: Boolean(source.lowEffects),
    });
  }

  function normalizeBest(value) {
    const source = value && typeof value === "object" ? value : {};
    return Object.freeze({
      score: integer(source.score),
      voices: clamp(integer(source.voices), 0, 24),
      rank: typeof source.rank === "string" ? source.rank : "",
      mode: source.mode === "together" ? "together" : "solo",
    });
  }

  function sanitizeCountMap(value) {
    const source = value && typeof value === "object" ? value : {};
    return Object.freeze(Object.fromEntries(
      Object.entries(source)
        .filter(([key]) => /^[a-z][a-z0-9:-]{0,31}$/i.test(key))
        .map(([key, count]) => [key, clamp(integer(count), 0, 100000)])
        .sort(([left], [right]) => left.localeCompare(right, "en")),
    ));
  }

  function summarizeRun(state, evidence = {}) {
    const result = state?.result || {};
    const metrics = state?.metrics || {};
    const inputCounts = sanitizeCountMap(metrics.inputSources);
    const inputModes = Object.freeze(Object.keys(inputCounts).filter((key) => inputCounts[key] > 0));
    const accepted = Object.freeze({
      left: integer(metrics.pulsesAccepted?.left),
      right: integer(metrics.pulsesAccepted?.right),
    });
    const rejected = Object.freeze({
      left: integer(metrics.pulsesRejected?.left),
      right: integer(metrics.pulsesRejected?.right),
    });
    const chordQualities = Object.freeze({
      soft: integer(metrics.chords?.soft),
      clear: integer(metrics.chords?.clear),
      perfect: integer(metrics.chords?.perfect),
    });
    const frameSamples = integer(evidence.frameSamples);
    const averageFrameMs = frameSamples
      ? Math.round(clamp(Number(evidence.frameTotalMs) / frameSamples, 0, 10000) * 100) / 100
      : 0;
    const worstFrameMs = Math.round(clamp(Number(evidence.worstFrameMs), 0, 10000) * 100) / 100;
    return Object.freeze({
      seed: integer(state?.seed),
      route: typeof state?.routeId === "string" ? state.routeId : "unknown",
      mode: state?.participantMode === "together" ? "together" : "solo",
      inputMode: inputModes.length > 1 ? "mixed" : inputModes[0] || "none",
      inputModes,
      inputCounts,
      completionSeconds: Math.round(clamp(
        Number(state?.tick) / Math.max(1, Number(evidence.tickRate) || 60),
        0,
        3600,
      ) * 100) / 100,
      score: integer(result.score ?? state?.score),
      voices: clamp(integer(result.finalVoiceCount), 0, 24),
      gates: clamp(integer(result.gatesCleared), 0, 15),
      gatesEntered: clamp(integer(metrics.gatesResolved), 0, 15),
      gatesMissed: clamp(integer(metrics.gatesMissed), 0, 15),
      fullGates: clamp(integer(result.fullChorusGates), 0, 15),
      pulsesAccepted: accepted,
      pulsesRejected: rejected,
      chordAttempts: integer(metrics.chordAttempts),
      chordQualities,
      chords: integer(Object.values(chordQualities).reduce((sum, count) => sum + integer(count), 0)),
      blooms: clamp(integer(metrics.moonBlooms), 0, 5),
      scatters: integer(metrics.voicesScattered),
      rescues: clamp(integer(metrics.voicesRescued), 0, 24),
      rescuePoints: integer(result.categories?.rescues
        ?? state?.rescueLedger?.reduce((sum, entry) => sum + integer(entry?.points), 0)),
      seedEligible: Boolean(result.seed?.eligible),
      frame: Object.freeze({ samples: frameSamples, averageMs: averageFrameMs, worstMs: worstFrameMs }),
    });
  }

  function updateBoundedHistory(value, run) {
    const source = value && typeof value === "object" ? value : {};
    const previous = Array.isArray(source.recent) ? source.recent.slice(-MAX_RECENT_RUNS + 1) : [];
    const summary = Object.freeze({ ...run });
    return Object.freeze({
      version: 2,
      runCount: integer(source.runCount) + 1,
      totalScore: integer(source.totalScore) + integer(summary.score),
      totalVoices: integer(source.totalVoices) + integer(summary.voices),
      seedCount: integer(source.seedCount) + (summary.seedEligible ? 1 : 0),
      restartCount: integer(source.restartCount),
      exitCount: integer(source.exitCount),
      recent: Object.freeze([...previous, summary]),
    });
  }

  function updatePlaytestCounter(value, counter) {
    if (counter !== "restartCount" && counter !== "exitCount") throw new TypeError("Unknown playtest counter.");
    const source = value && typeof value === "object" ? value : {};
    const recent = Array.isArray(source.recent) ? source.recent.slice(-MAX_RECENT_RUNS) : [];
    return Object.freeze({
      version: 2,
      runCount: integer(source.runCount),
      totalScore: integer(source.totalScore),
      totalVoices: integer(source.totalVoices),
      seedCount: integer(source.seedCount),
      restartCount: integer(source.restartCount) + (counter === "restartCount" ? 1 : 0),
      exitCount: integer(source.exitCount) + (counter === "exitCount" ? 1 : 0),
      recent: Object.freeze(recent),
    });
  }

  function generateSeed() {
    try {
      const values = new Uint32Array(1);
      root.crypto?.getRandomValues?.(values);
      if (values[0]) return values[0] >>> 0;
    } catch (_error) {
      // A deterministic simulation does not require cryptographic entropy.
    }
    return ((Date.now() ^ Math.floor((root.performance?.now?.() || 0) * 1000)) >>> 0) || 0x4d4f5448;
  }

  function requireElement(documentTarget, id) {
    const element = documentTarget.getElementById(id);
    if (!element) throw new Error(`Mothchorus could not find #${id}.`);
    return element;
  }

  function editableTarget(target) {
    if (!target || typeof target !== "object") return false;
    if (target.isContentEditable) return true;
    return ["input", "textarea", "select"].includes(String(target.tagName || "").toLowerCase());
  }

  function mapSimulationEvents(events, state, Simulation) {
    if (!Array.isArray(events)) return [];
    return events.map((event) => {
      const mapped = { ...event };
      if (event.type === "pulse-rejected") {
        mapped.type = "pulse";
        mapped.accepted = false;
      } else if (event.type === "pulse") {
        mapped.accepted = true;
      } else if (event.type === "voice-scattered") {
        mapped.type = "scatter";
      } else if (event.type === "voice-rescued" || event.type === "voice-returned") {
        mapped.type = "rescue";
      }

      const voice = Number.isInteger(event.voiceId) ? state.voices[event.voiceId] : null;
      if (voice) {
        mapped.x = voice.status === "lost" && Number.isFinite(voice.lostX) ? voice.lostX : voice.x;
        mapped.y = voice.status === "lost" && Number.isFinite(voice.lostY) ? voice.lostY : voice.y;
      }
      if (mapped.type === "pulse" || mapped.type === "chord") {
        mapped.x = state.center.x;
        mapped.y = state.center.y;
      }

      const gateIndex = event.gateId
        ? state.route.gates.findIndex((gate) => gate.id === event.gateId)
        : -1;
      if (gateIndex >= 0) {
        const gate = state.route.gates[gateIndex];
        mapped.x = event.type === "moon-bloom" ? gate.bloomX : gate.centerX;
        mapped.y = Simulation.gateRenderY(state, gate);
      }
      if (mapped.type === "phase") mapped.phaseIndex = phaseInfo(mapped.phase).index;
      return Object.freeze(mapped);
    });
  }

  function buildRenderState(state, Simulation, options = {}) {
    const counts = Simulation.voiceCounts(state);
    const finaleProgress = clamp(options.finaleProgress, 0, 1);
    const voices = finaleProgress > 0
      ? state.voices.filter((voice) => voice.status !== "lost")
      : state.voices;
    const reusableGates = Array.isArray(options.gateViews) ? options.gateViews : null;
    if (reusableGates && reusableGates.length !== state.route.gates.length) {
      reusableGates.length = 0;
      for (let index = 0; index < state.route.gates.length; index += 1) reusableGates.push({});
    }
    const gates = state.route.gates.map((gate, index) => {
      const view = reusableGates ? reusableGates[index] : {};
      Object.assign(view, gate, state.gates[index], {
        x: gate.centerX,
        y: Simulation.gateRenderY(state, gate),
        width: gate.halfWidth * 2,
        markedChord: gate.chordOpportunity,
        moonBloom: gate.moonBloom && !state.gates[index].moonBloomCollected,
      });
      return reusableGates ? view : Object.freeze(view);
    });
    const gateViews = reusableGates || gates;
    return Object.freeze({
      tick: state.tick,
      time: state.tick / Simulation.TUNING.tickRate,
      renderDelta: clamp(options.renderDelta ?? 1 / 60, 0, 0.05),
      phaseIndex: phaseInfo(state.phase).index,
      center: state.center,
      pulseState: state.pulseState,
      voices,
      gates: gateViews,
      windX: Number(state.windX) || 0,
      activeVoiceCount: counts.retained,
      finalVoiceCount: counts.retained,
      complete: Boolean(state.completed),
      completed: Boolean(state.completed),
      finaleProgress,
    });
  }

  class MothchorusApp {
    constructor(documentTarget, modules) {
      this.document = documentTarget;
      this.window = documentTarget.defaultView || root;
      this.Rules = modules.Rules;
      this.Simulation = modules.Simulation;
      this.Renderer = modules.Renderer;
      this.Audio = modules.Audio;
      this.Input = modules.Input;
      this.elements = {};
      for (const id of [
        "app", "stage", "gameCanvas", "phaseLabel", "voiceCount", "scoreValue", "soundButton", "pauseButton",
        "objectiveSymbol", "objectiveText", "chordReadout", "chordText", "leftPulse", "rightPulse", "leftRecharge",
        "rightRecharge", "runProgressFill", "modeLabel", "bestLabel", "titleOverlay", "startSolo", "startTogether",
        "titleSound", "reducedMotion", "lowEffects", "titleBest", "pauseOverlay", "resumeButton", "restartButton",
        "titleButton", "resultOverlay", "resultEyebrow", "resultHeading", "resultMessage", "resultScore", "resultVoices",
        "seedResult", "seedText", "gateScore", "chordScore", "bloomScore", "finaleScore", "recordMessage",
        "playAgainButton", "changeModeButton", "liveRegion",
      ]) this.elements[id] = requireElement(documentTarget, id);

      const reducedPreference = Boolean(this.window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches);
      this.settings = normalizeSettings(readStorage(STORAGE_KEYS.settings, null), reducedPreference);
      this.best = normalizeBest(readStorage(STORAGE_KEYS.best, null));
      this.mode = "title";
      this.participantMode = "solo";
      this.simulation = null;
      this.scheduler = null;
      this.animationFrame = 0;
      this.lastTimestamp = null;
      this.finaleStartedAt = null;
      this.pausedFromMode = null;
      this.pausedFinaleElapsed = 0;
      this.qaManual = false;
      this.destroyed = false;
      this.listenerRecords = [];
      this.pulseTimers = new Map();
      this.announceTimer = 0;
      this.focusTimer = 0;
      this.focusBeforeDialog = null;
      this.resizeObserver = null;
      this.lastObjective = "";
      this.lastChordText = "";
      this.lastChordReady = null;
      this.hudCache = new Map();
      this.renderGateViews = [];
      this.frameStats = { samples: 0, totalMs: 0, worstMs: 0 };
      this.groveBridge = createGroveBridge(this.window);
      if (this.groveBridge.context.hosted) {
        this.document.documentElement?.setAttribute?.("data-grove-hosted", "true");
        this.elements.app.dataset.groveHosted = "true";
      }

      this.renderer = this.Renderer.createRenderer({
        canvas: this.elements.gameCanvas,
        effects: this.settings.lowEffects ? "low" : "full",
        reducedMotion: this.settings.reducedMotion,
        seed: 0x51d3a7,
      });
      this.audio = new this.Audio.ChorusAudio({ enabled: this.settings.sound });
      this.input = new this.Input.InputController({
        leftTarget: this.elements.leftPulse,
        rightTarget: this.elements.rightPulse,
        windowTarget: this.window,
        documentTarget: this.document,
        getTick: () => this.simulation?.tick || 0,
        isEnabled: () => this.mode === "playing" && !this.simulation?.completed,
      });
      this.input.attach();

      this.boundFrame = (timestamp) => this.frame(timestamp);
      this.bindInterface();
      this.applySettings(false);
      this.showTitle(true);
      this.installResizeHandling();
      this.resize();
      this.groveBridge.ready();
    }

    listen(target, type, handler, options) {
      target.addEventListener(type, handler, options);
      this.listenerRecords.push({ target, type, handler, options });
    }

    bindInterface() {
      const e = this.elements;
      this.listen(e.startSolo, "click", () => this.startRun("solo"));
      this.listen(e.startTogether, "click", () => this.startRun("together"));
      this.listen(e.soundButton, "click", () => this.setSound(!this.settings.sound));
      this.listen(e.titleSound, "change", () => this.setSound(e.titleSound.checked));
      this.listen(e.reducedMotion, "change", () => {
        this.settings = normalizeSettings({ ...this.settings, reducedMotion: e.reducedMotion.checked });
        this.applySettings(true);
      });
      this.listen(e.lowEffects, "change", () => {
        this.settings = normalizeSettings({ ...this.settings, lowEffects: e.lowEffects.checked });
        this.applySettings(true);
      });
      this.listen(e.pauseButton, "click", () => this.pause());
      this.listen(e.resumeButton, "click", () => this.resume());
      this.listen(e.restartButton, "click", () => this.startRun(this.participantMode));
      this.listen(e.titleButton, "click", () => this.showTitle());
      this.listen(e.playAgainButton, "click", () => this.startRun(this.participantMode));
      this.listen(e.changeModeButton, "click", () => this.showTitle());
      this.listen(this.window, "keydown", (event) => this.handleGlobalKey(event));
      this.listen(this.document, "visibilitychange", () => this.handleVisibilityChange());
      this.listen(this.window, "pagehide", (event) => this.handlePageHide(event));
      this.listen(this.window, "resize", () => this.resize(), { passive: true });
      this.listen(this.window, "orientationchange", () => this.resize(), { passive: true });
      this.listen(this.document, "keydown", (event) => this.trapDialogFocus(event));
    }

    installResizeHandling() {
      if (typeof this.window.ResizeObserver !== "function") return;
      this.resizeObserver = new this.window.ResizeObserver(() => this.resize());
      this.resizeObserver.observe(this.elements.stage);
    }

    resize() {
      if (this.destroyed) return;
      const rect = this.elements.stage.getBoundingClientRect();
      this.renderer.resize(
        Math.max(1, rect.width || this.elements.stage.clientWidth || 1),
        Math.max(1, rect.height || this.elements.stage.clientHeight || 1),
        this.window.devicePixelRatio || 1,
      );
      if (this.simulation) this.renderNow(0);
    }

    applySettings(save) {
      const e = this.elements;
      e.app.classList.toggle("is-reduced-motion", this.settings.reducedMotion);
      e.app.dataset.effects = this.settings.lowEffects ? "low" : "full";
      e.titleSound.checked = this.settings.sound;
      e.reducedMotion.checked = this.settings.reducedMotion;
      e.lowEffects.checked = this.settings.lowEffects;
      e.soundButton.setAttribute("aria-pressed", String(this.settings.sound));
      e.soundButton.setAttribute("aria-label", this.settings.sound ? "Mute sound" : "Turn on sound");
      e.soundButton.querySelector("span").textContent = this.settings.sound ? "♫" : "×";
      this.renderer.setPreferences({
        effects: this.settings.lowEffects ? "low" : "full",
        reducedMotion: this.settings.reducedMotion,
      });
      if (save) writeStorage(STORAGE_KEYS.settings, this.settings);
      if (this.simulation) this.renderNow(0);
    }

    setSound(enabled) {
      this.settings = normalizeSettings({ ...this.settings, sound: Boolean(enabled) });
      this.applySettings(true);
      this.audio.setEnabled(this.settings.sound);
      if (this.settings.sound && (this.mode === "playing" || this.mode === "finale")) {
        void this.audio.resume().then((running) => {
          if (!running || !(this.mode === "playing" || this.mode === "finale")) return;
          this.audio.startRun();
          this.audio.update(this.currentRenderState());
        });
      }
    }

    setOverlay(element, visible, focusTarget) {
      element.classList.toggle("is-visible", visible);
      element.setAttribute("aria-hidden", String(!visible));
      element.inert = !visible;
      this.syncModalIsolation();
      if (this.focusTimer) this.window.clearTimeout(this.focusTimer);
      this.focusTimer = 0;
      if (visible && focusTarget) {
        this.focusTimer = this.window.setTimeout(() => {
          this.focusTimer = 0;
          if (!this.destroyed && this.activeOverlay() === element) focusTarget.focus({ preventScroll: true });
        }, 0);
      }
    }

    activeOverlay() {
      return [this.elements.titleOverlay, this.elements.pauseOverlay, this.elements.resultOverlay]
        .find((overlay) => overlay.classList.contains("is-visible")) || null;
    }

    syncModalIsolation() {
      const active = this.activeOverlay();
      for (const child of this.elements.app.children) {
        if (child === this.elements.liveRegion) continue;
        const isOverlay = child.classList.contains("overlay");
        child.inert = isOverlay ? child !== active : Boolean(active);
      }
    }

    trapDialogFocus(event) {
      if (event.key !== "Tab") return;
      const overlay = this.activeOverlay();
      if (!overlay) return;
      const focusable = [...overlay.querySelectorAll("button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex='-1'])")]
        .filter((element) => !element.inert && element.getAttribute("aria-hidden") !== "true");
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!overlay.contains(this.document.activeElement)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus({ preventScroll: true });
        return;
      }
      if (event.shiftKey && this.document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && this.document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    clearUiTimers() {
      for (const timer of this.pulseTimers.values()) this.window.clearTimeout(timer);
      this.pulseTimers.clear();
      this.elements.leftPulse.classList.remove("is-active", "is-rejected");
      this.elements.rightPulse.classList.remove("is-active", "is-rejected");
      if (this.announceTimer) this.window.clearTimeout(this.announceTimer);
      this.announceTimer = 0;
      this.elements.liveRegion.textContent = "";
      if (this.focusTimer) this.window.clearTimeout(this.focusTimer);
      this.focusTimer = 0;
    }

    runInProgress() {
      return this.mode === "playing" || this.mode === "finale" || this.mode === "paused";
    }

    recordRunInterruption(counter) {
      const history = updatePlaytestCounter(readStorage(STORAGE_KEYS.playtest, null), counter);
      writeStorage(STORAGE_KEYS.playtest, history);
    }

    handleVisibilityChange() {
      if (this.document.hidden && (this.mode === "playing" || this.mode === "finale")) this.pause(true);
    }

    handlePageHide(event) {
      if (event?.persisted) {
        if (this.mode === "playing" || this.mode === "finale") this.pause(true);
        return;
      }
      this.destroy();
    }

    showTitle(focus = true) {
      if (this.runInProgress()) {
        this.recordRunInterruption("exitCount");
        this.groveBridge?.abandonRun();
      }
      this.cancelFrame();
      this.input.clear("title");
      this.audio.disposeRun();
      this.clearUiTimers();
      this.mode = "title";
      this.elements.app.dataset.mode = "title";
      this.pausedFromMode = null;
      this.pausedFinaleElapsed = 0;
      this.elements.pauseButton.disabled = true;
      this.elements.leftPulse.disabled = true;
      this.elements.rightPulse.disabled = true;
      this.setOverlay(this.elements.pauseOverlay, false);
      this.setOverlay(this.elements.resultOverlay, false);
      this.setOverlay(this.elements.titleOverlay, true, focus ? this.elements.startSolo : null);
      this.participantMode = "solo";
      this.simulation = this.Simulation.createSimulation({ seed: 0x4d4f5448, routeId: "crown", participantMode: "solo" });
      this.Simulation.stepTicks(this.simulation, 120);
      this.Simulation.drainEvents(this.simulation);
      this.scheduler = this.Simulation.createScheduler();
      this.renderGateViews.length = 0;
      this.renderer.reset();
      this.updateBestCopy();
      this.updateHud();
      this.setObjective("↔", "Choose how you will tend the chorus.");
      this.setChordText("Pair opposite sides to form a Chord", false);
      this.renderNow(0);
    }

    startRun(mode, seed = generateSeed()) {
      if (this.destroyed) return;
      if (this.runInProgress()) {
        this.recordRunInterruption("restartCount");
        this.groveBridge?.abandonRun();
      }
      this.cancelFrame();
      this.input.clear("restart");
      this.audio.disposeRun();
      this.clearUiTimers();
      this.participantMode = mode === "together" ? "together" : "solo";
      this.simulation = this.Simulation.createSimulation({ seed, participantMode: this.participantMode });
      this.scheduler = this.Simulation.createScheduler();
      this.mode = "playing";
      this.elements.app.dataset.mode = "playing";
      this.lastTimestamp = null;
      this.finaleStartedAt = null;
      this.pausedFromMode = null;
      this.pausedFinaleElapsed = 0;
      this.frameStats = { samples: 0, totalMs: 0, worstMs: 0 };
      this.renderGateViews.length = 0;
      this.renderer.reset();
      this.setOverlay(this.elements.titleOverlay, false);
      this.setOverlay(this.elements.pauseOverlay, false);
      this.setOverlay(this.elements.resultOverlay, false);
      this.elements.pauseButton.disabled = false;
      this.elements.leftPulse.disabled = false;
      this.elements.rightPulse.disabled = false;
      this.updateHud();
      this.updateBestCopy();
      this.updateGuidance([]);
      this.renderNow(0);
      this.groveBridge?.startRun();
      this.announce(this.participantMode === "together"
        ? "Together run begun. Each player tends one side."
        : "Solo run begun. Tend both sides.");

      if (this.settings.sound) {
        this.audio.setEnabled(true);
        void this.audio.resume().then((running) => {
          if (!running || this.mode !== "playing") return;
          this.audio.startRun();
          this.audio.update(this.currentRenderState());
        });
      }
      this.scheduleFrame();
    }

    scheduleFrame() {
      if (this.destroyed || this.qaManual || this.animationFrame || !(this.mode === "playing" || this.mode === "finale")) return;
      this.animationFrame = this.window.requestAnimationFrame(this.boundFrame);
    }

    cancelFrame() {
      if (this.animationFrame) this.window.cancelAnimationFrame(this.animationFrame);
      this.animationFrame = 0;
      this.lastTimestamp = null;
    }

    frame(timestamp) {
      this.animationFrame = 0;
      if (this.destroyed) return;
      if (this.mode === "playing") this.playingFrame(timestamp);
      else if (this.mode === "finale") this.finaleFrame(timestamp);
      if (this.mode === "playing" || this.mode === "finale") this.scheduleFrame();
    }

    playingFrame(timestamp) {
      const intervalMs = this.lastTimestamp === null ? 0 : Math.max(0, Number(timestamp) - this.lastTimestamp);
      if (intervalMs > 0) {
        this.frameStats.samples += 1;
        this.frameStats.totalMs += Math.min(intervalMs, 10000);
        this.frameStats.worstMs = Math.max(this.frameStats.worstMs, Math.min(intervalMs, 10000));
      }
      const elapsed = clamp(intervalMs / 1000, 0, 0.1);
      this.lastTimestamp = timestamp;
      const actions = this.input.drain();
      const outcome = this.Simulation.advanceFrame(this.simulation, this.scheduler, elapsed, actions);
      const events = this.dispatchSimulationEvents();
      const renderState = this.currentRenderState(elapsed);
      this.renderer.render(renderState, outcome.accumulator / this.Simulation.STEP_SECONDS, timestamp);
      this.audio.update(renderState);
      this.updateHud();
      this.updateGuidance(events);
      if (this.simulation.completed) this.beginFinale(timestamp);
    }

    dispatchSimulationEvents() {
      const rawEvents = this.Simulation.drainEvents(this.simulation);
      if (!rawEvents.length) return [];
      const events = mapSimulationEvents(rawEvents, this.simulation, this.Simulation);
      const renderState = this.currentRenderState();
      this.renderer.handleEvents(events, renderState);
      this.audio.handleEvents(events, renderState);
      for (const event of events) {
        if (event.type === "pulse") this.flashPulse(event.side, event.accepted !== false);
        else if (event.type === "chord") this.announce(`${titleCase(event.quality)} Chord.`);
        else if (event.type === "scatter") this.announce("A voice scattered. Move close to its dim light to call it home.");
        else if (event.type === "rescue" && event.points > 0) this.announce("A lost voice is returning.");
        else if (event.type === "moon-bloom") this.announce("Moon-bloom awakened.");
        else if (event.type === "phase") this.announce(phaseInfo(event.phase).label);
      }
      return events;
    }

    beginFinale(timestamp = this.window.performance?.now?.() || 0) {
      if (this.mode === "finale") return;
      this.mode = "finale";
      this.elements.app.dataset.mode = "finale";
      this.elements.pauseButton.disabled = true;
      this.elements.leftPulse.disabled = true;
      this.elements.rightPulse.disabled = true;
      this.input.clear("finale");
      this.finaleStartedAt = timestamp;
      this.lastTimestamp = timestamp;
      this.setObjective("✦", "The chorus returns to the Choir Linden.");
      this.setChordText("Listen to the final answer", true);
    }

    finaleFrame(timestamp) {
      const elapsed = this.finaleStartedAt === null ? FINALE_SECONDS : (timestamp - this.finaleStartedAt) / 1000;
      const duration = this.settings.reducedMotion ? 1.15 : FINALE_SECONDS;
      const progress = clamp(elapsed / duration, 0, 1);
      const renderState = this.currentRenderState(1 / 60, progress);
      this.renderer.render(renderState, 0, timestamp);
      if (progress >= 1) this.showResult();
    }

    showResult() {
      if (!this.simulation?.result) return;
      this.cancelFrame();
      this.clearUiTimers();
      this.mode = "result";
      this.elements.app.dataset.mode = "result";
      this.audio.disposeRun();
      this.elements.pauseButton.disabled = true;
      const result = this.simulation.result;
      const counts = this.Simulation.voiceCounts(this.simulation);
      const previousBest = this.best.score;
      const newRecord = result.score > previousBest
        || (result.score === previousBest && counts.retained > this.best.voices);
      if (newRecord) {
        this.best = normalizeBest({
          score: result.score,
          voices: counts.retained,
          rank: result.rank?.name || "",
          mode: this.participantMode,
        });
        writeStorage(STORAGE_KEYS.best, this.best);
      }
      this.groveBridge?.completeRun({
        score: result.score,
        // The Grove owns its own accepted-run Best. Sending this run's score
        // prevents a standalone local Best from crossing the profile boundary.
        best: result.score,
        rank: canonicalGroveRank(result.score, this.Rules),
        finalVoiceCount: counts.retained,
        participantMode: this.participantMode,
      });
      const history = updateBoundedHistory(
        readStorage(STORAGE_KEYS.playtest, null),
        summarizeRun(this.simulation, {
          frameSamples: this.frameStats.samples,
          frameTotalMs: this.frameStats.totalMs,
          worstFrameMs: this.frameStats.worstMs,
          tickRate: this.Simulation.TUNING.tickRate,
        }),
      );
      writeStorage(STORAGE_KEYS.playtest, history);

      const e = this.elements;
      e.resultEyebrow.textContent = result.seed?.eligible ? "A CHOIR SEED STIRS" : "THE CHORUS RETURNS";
      e.resultHeading.textContent = titleCase(result.rank?.name);
      e.resultMessage.textContent = result.seed?.eligible
        ? "The Choir Linden holds your song. A Seed stirred among its heart-shaped leaves."
        : RESULT_MESSAGES[result.rank?.id] || RESULT_MESSAGES["first-voice"];
      e.resultScore.textContent = formatScore(result.score);
      e.resultVoices.textContent = `${counts.retained} / 24`;
      e.gateScore.textContent = formatScore(result.categories.gates + result.categories.fullChorus);
      e.chordScore.textContent = formatScore(result.categories.chords);
      e.bloomScore.textContent = formatScore(result.categories.moonBlooms);
      e.finaleScore.textContent = formatScore(result.categories.finale + result.categories.rescues);
      e.seedResult.classList.toggle("is-earned", Boolean(result.seed?.eligible));
      e.seedText.textContent = result.seed?.eligible
        ? "Standalone mastery candidate awakened: 6,500+ points and 18+ voices."
        : counts.retained < 18
          ? `Bring home ${18 - counts.retained} more ${18 - counts.retained === 1 ? "voice" : "voices"} to meet the provisional Seed trial.`
          : `Find ${formatScore(Math.max(0, 6500 - result.score))} more points to meet the provisional Seed trial.`;
      e.recordMessage.textContent = newRecord
        ? "A new best song for the Choir Linden."
        : previousBest > 0
          ? `Best chorus: ${formatScore(this.best.score)}.`
          : "The Choir Linden remembers this first song.";
      this.updateBestCopy();
      this.setOverlay(e.resultOverlay, true, e.playAgainButton);
      this.announce(`${titleCase(result.rank?.name)}. Score ${formatScore(result.score)}. ${counts.retained} voices home.`);
    }

    pause(fromVisibility = false) {
      if (this.mode !== "playing" && this.mode !== "finale") return;
      const sourceMode = this.mode;
      this.focusBeforeDialog = fromVisibility ? null : this.document.activeElement;
      this.pausedFromMode = sourceMode;
      if (sourceMode === "finale") {
        const now = this.window.performance?.now?.() || this.finaleStartedAt || 0;
        const started = Number.isFinite(this.finaleStartedAt) ? this.finaleStartedAt : now;
        this.pausedFinaleElapsed = Math.max(0, now - started);
      } else {
        this.pausedFinaleElapsed = 0;
      }
      this.cancelFrame();
      this.input.clear("pause");
      this.audio.pause();
      this.clearUiTimers();
      this.mode = "paused";
      this.elements.app.dataset.mode = "paused";
      this.elements.pauseButton.disabled = true;
      this.elements.leftPulse.disabled = true;
      this.elements.rightPulse.disabled = true;
      this.setOverlay(this.elements.pauseOverlay, true, this.elements.resumeButton);
      this.announce("Paused.");
    }

    resume() {
      if (this.mode !== "paused") return;
      const resumedMode = this.pausedFromMode === "finale" ? "finale" : "playing";
      const resumingFinale = resumedMode === "finale";
      this.mode = resumedMode;
      this.elements.app.dataset.mode = resumedMode;
      this.elements.pauseButton.disabled = resumingFinale;
      this.elements.leftPulse.disabled = resumingFinale;
      this.elements.rightPulse.disabled = resumingFinale;
      this.setOverlay(this.elements.pauseOverlay, false);
      if (resumingFinale) {
        const now = this.window.performance?.now?.() || 0;
        this.finaleStartedAt = now - this.pausedFinaleElapsed;
        this.lastTimestamp = now;
      } else {
        this.lastTimestamp = null;
      }
      this.pausedFromMode = null;
      this.pausedFinaleElapsed = 0;
      if (this.settings.sound) {
        void this.audio.resume().then((running) => {
          if (!running || (this.mode !== "playing" && this.mode !== "finale")) return;
          this.audio.resumeRun();
          this.audio.update(this.currentRenderState());
        });
      }
      this.scheduleFrame();
      if (this.focusBeforeDialog && typeof this.focusBeforeDialog.focus === "function") {
        this.focusBeforeDialog.focus({ preventScroll: true });
      }
      this.announce("Chorus resumed.");
    }

    handleGlobalKey(event) {
      if (event.ctrlKey || event.altKey || event.metaKey || editableTarget(event.target)) return;
      const key = String(event.key || "").toLowerCase();
      if (key === "m") {
        event.preventDefault();
        this.setSound(!this.settings.sound);
        return;
      }
      if (key !== "p" && key !== "escape") return;
      event.preventDefault();
      if (this.mode === "playing") this.pause();
      else if (this.mode === "paused") this.resume();
      else if (key === "escape" && this.mode === "result") this.showTitle();
    }

    flashPulse(side, accepted) {
      const button = side === "right" ? this.elements.rightPulse : this.elements.leftPulse;
      const previous = this.pulseTimers.get(side);
      if (previous) this.window.clearTimeout(previous);
      button.classList.toggle("is-active", accepted);
      button.classList.toggle("is-rejected", !accepted);
      const timer = this.window.setTimeout(() => {
        button.classList.remove("is-active", "is-rejected");
        this.pulseTimers.delete(side);
      }, accepted ? 150 : 90);
      this.pulseTimers.set(side, timer);
    }

    pulseRecharge(side) {
      try {
        return this.Rules.pulseRechargeRemaining(this.simulation.pulseState, side, this.simulation.tick);
      } catch (_error) {
        const key = side === "left" ? "leftReadyTick" : "rightReadyTick";
        return Math.max(0, integer(this.simulation.pulseState?.[key]) - this.simulation.tick);
      }
    }

    commitHud(key, value, apply) {
      const normalized = String(value);
      if (this.hudCache.get(key) === normalized) return false;
      this.hudCache.set(key, normalized);
      apply(normalized);
      return true;
    }

    updateHud() {
      if (!this.simulation) return;
      const e = this.elements;
      const counts = this.Simulation.voiceCounts(this.simulation);
      this.commitHud("phase", phaseInfo(this.simulation.phase).label, (value) => { e.phaseLabel.textContent = value; });
      this.commitHud("voices", counts.retained, (value) => { e.voiceCount.textContent = value; });
      this.commitHud("score", this.simulation.score, () => { e.scoreValue.textContent = formatScore(this.simulation.score); });
      const progress = `${clamp(this.simulation.tick / this.Simulation.TUNING.runTicks * 100, 0, 100).toFixed(2)}%`;
      this.commitHud("progress", progress, (value) => { e.runProgressFill.style.width = value; });
      for (const side of ["left", "right"]) {
        const remaining = this.pulseRecharge(side);
        const ready = clamp(1 - remaining / this.Simulation.TUNING.rechargeTicks, 0, 1);
        const transform = `scaleX(${ready.toFixed(3)})`;
        this.commitHud(`${side}-recharge`, transform, (value) => { e[`${side}Recharge`].style.transform = value; });
        const description = remaining
          ? `Recharging for ${(remaining / this.Simulation.TUNING.tickRate).toFixed(1)} seconds.`
          : "Ready.";
        this.commitHud(`${side}-description`, description, (value) => {
          e[`${side}Pulse`].setAttribute("aria-description", value);
        });
      }
      const mode = this.participantMode === "together" ? "Together · shared screen" : "Solo · both sides";
      this.commitHud("mode", mode, (value) => { e.modeLabel.textContent = value; });
    }

    updateBestCopy() {
      const label = this.best.score > 0 ? `Best ${formatScore(this.best.score)}` : "Best —";
      this.commitHud("best-label", label, (value) => { this.elements.bestLabel.textContent = value; });
      const titleBest = this.best.score > 0
        ? `Best chorus · ${formatScore(this.best.score)} · ${this.best.voices} voices · ${titleCase(this.best.rank)}`
        : "No chorus recorded yet.";
      this.commitHud("title-best", titleBest, (value) => { this.elements.titleBest.textContent = value; });
    }

    updateGuidance(events) {
      if (!this.simulation || this.mode !== "playing") return;
      const counts = this.Simulation.voiceCounts(this.simulation);
      const nextIndex = this.simulation.nextGateIndex;
      const gate = this.simulation.route.gates[nextIndex];
      const runtime = this.simulation.gates[nextIndex];
      const untilGate = gate ? gate.tick - this.simulation.tick : Infinity;

      if (counts.lost > 0) {
        const lostVoices = this.simulation.voices.filter((voice) => voice.status === "lost");
        const left = lostVoices.filter((voice) => (voice.lostX ?? voice.x) < this.simulation.center.x).length;
        const right = lostVoices.length - left;
        const direction = [left ? `${left} left` : "", right ? `${right} right` : ""].filter(Boolean).join(" · ");
        this.setObjective("✧", counts.lost === 1
          ? `Dim voice ${direction} — move close to call it home.`
          : `${counts.lost} dim voices · ${direction} — move close.`);
      } else if (gate?.chordOpportunity && !runtime?.chordQuality && untilGate <= this.Simulation.TUNING.chordOpportunityLeadTicks) {
        this.setObjective("◇◇", "Chord window — pair opposite pulses now.");
      } else if (this.simulation.tick < 240) {
        this.setObjective("↔", "Left bends right · Right bends left");
      } else if (gate) {
        const difference = gate.centerX - this.simulation.center.x;
        const direction = Math.abs(difference) < 65 ? "center" : difference < 0 ? "left" : "right";
        const bloom = gate.moonBloom && !runtime?.moonBloomCollected
          ? ` · brush the bloom on the ${gate.bloomX < gate.centerX ? "left" : "right"}`
          : "";
        this.setObjective(direction === "center" ? "○" : direction === "left" ? "‹" : "›", `Guide toward the ${direction} opening${bloom}.`);
      }

      const chordActive = this.simulation.tick < this.simulation.chord.untilTick;
      const chordEvent = [...events].reverse().find((event) => event.type === "chord");
      if (chordActive) {
        this.setChordText(`${titleCase(chordEvent?.quality || this.simulation.chord.quality)} Chord · chorus protected`, true);
      } else if (gate?.chordOpportunity && untilGate <= this.Simulation.TUNING.chordOpportunityLeadTicks) {
        this.setChordText("Chord ready · pair both sides", true);
      } else {
        this.setChordText("Pair opposite sides for a Chord", false);
      }
    }

    setObjective(symbol, text) {
      if (text === this.lastObjective) return;
      this.lastObjective = text;
      this.elements.objectiveSymbol.textContent = symbol;
      this.elements.objectiveText.textContent = text;
    }

    setChordText(text, ready) {
      if (text !== this.lastChordText) {
        this.lastChordText = text;
        this.elements.chordText.textContent = text;
      }
      if (this.lastChordReady !== Boolean(ready)) {
        this.lastChordReady = Boolean(ready);
        this.elements.chordReadout.classList.toggle("is-ready", this.lastChordReady);
      }
    }

    announce(text) {
      if (!text) return;
      if (this.announceTimer) this.window.clearTimeout(this.announceTimer);
      this.elements.liveRegion.textContent = "";
      this.announceTimer = this.window.setTimeout(() => {
        this.elements.liveRegion.textContent = text;
        this.announceTimer = 0;
      }, 20);
    }

    currentRenderState(renderDelta = 1 / 60, finaleProgress = 0) {
      return buildRenderState(this.simulation, this.Simulation, {
        renderDelta,
        finaleProgress,
        gateViews: this.renderGateViews,
      });
    }

    renderNow(finaleProgress = 0) {
      if (!this.simulation) return;
      this.renderer.render(this.currentRenderState(0, finaleProgress), 0, this.window.performance?.now?.() || 0);
    }

    qaApi() {
      return Object.freeze({
        start: (mode = "solo", seed = 0x4d4f5448) => {
          this.qaManual = true;
          this.startRun(mode, seed);
          this.cancelFrame();
          return this.Simulation.snapshotSimulation(this.simulation);
        },
        pulse: (side, offsetTicks = 0) => {
          if (this.mode !== "playing") throw new Error("Start a QA run before pulsing.");
          this.Simulation.enqueueActions(this.simulation, [{
            type: "pulse",
            side,
            tick: this.simulation.tick + integer(offsetTicks),
            sequence: this.simulation.eventSequence + this.simulation.actionQueue.length,
            source: "qa",
          }]);
          return this.simulation.actionQueue.length;
        },
        advanceTicks: (count) => {
          if (this.mode !== "playing") throw new Error("Start a QA run before advancing.");
          this.Simulation.stepTicks(this.simulation, integer(count));
          const events = this.dispatchSimulationEvents();
          this.updateHud();
          this.updateGuidance(events);
          if (this.simulation.completed) this.beginFinale(0);
          this.renderNow(this.simulation.completed ? 1 : 0);
          return this.Simulation.snapshotSimulation(this.simulation);
        },
        finish: () => {
          if (this.mode === "playing") {
            this.Simulation.stepTicks(this.simulation, this.Simulation.TUNING.runTicks - this.simulation.tick);
            this.dispatchSimulationEvents();
            this.beginFinale(0);
          }
          this.renderNow(1);
          this.showResult();
          return this.Simulation.snapshotSimulation(this.simulation);
        },
        snapshot: () => this.Simulation.snapshotSimulation(this.simulation),
        diagnostics: () => this.diagnostics(),
        destroy: () => this.destroy(),
      });
    }

    diagnostics() {
      return Object.freeze({
        mode: this.mode,
        participantMode: this.participantMode,
        tick: this.simulation?.tick || 0,
        routeId: this.simulation?.routeId || null,
        listeners: this.listenerRecords.length,
        animationScheduled: Boolean(this.animationFrame),
        scheduler: this.scheduler ? { ...this.scheduler } : null,
        input: this.input.diagnostics(),
        renderer: this.renderer.diagnostics(),
        audio: this.audio.diagnostics(),
        effects: this.settings.lowEffects ? "low" : "full",
        reducedMotion: this.settings.reducedMotion,
      });
    }

    destroy() {
      if (this.destroyed) return false;
      if (this.runInProgress()) {
        this.recordRunInterruption("exitCount");
        this.groveBridge?.abandonRun();
      }
      this.destroyed = true;
      this.cancelFrame();
      this.clearUiTimers();
      this.input.destroy();
      this.audio.destroy();
      this.renderer.destroy();
      this.resizeObserver?.disconnect();
      this.resizeObserver = null;
      for (const record of this.listenerRecords) record.target.removeEventListener(record.type, record.handler, record.options);
      this.listenerRecords.length = 0;
      return true;
    }
  }

  function assertModules() {
    const modules = {
      Rules: root.MothchorusRules,
      Simulation: root.MothchorusSimulation,
      Renderer: root.MothchorusRenderer,
      Audio: root.MothchorusAudio,
      Input: root.MothchorusInput,
    };
    const missing = Object.entries(modules).filter(([, value]) => !value).map(([name]) => name);
    if (missing.length) throw new Error(`Mothchorus modules failed to load: ${missing.join(", ")}.`);
    return modules;
  }

  function bootstrap(documentTarget) {
    if (!documentTarget) return null;
    return new MothchorusApp(documentTarget, assertModules());
  }

  function showFatalError(documentTarget, error) {
    if (!documentTarget?.body) return;
    const message = documentTarget.createElement("main");
    message.setAttribute("role", "alert");
    message.style.cssText = "min-height:100vh;display:grid;place-content:center;padding:2rem;background:#080817;color:#f7f3ff;font:18px/1.5 system-ui;text-align:center";
    const heading = documentTarget.createElement("h1");
    heading.textContent = "The chorus could not awaken";
    const copy = documentTarget.createElement("p");
    copy.textContent = "Reload the page. If this continues, open Mothchorus from its launcher again.";
    message.append(heading, copy);
    documentTarget.body.replaceChildren(message);
    return error;
  }

  return Object.freeze({
    STORAGE_KEYS,
    MAX_RECENT_RUNS,
    GROVE_PROTOCOL,
    parseGroveContext,
    canonicalGroveRank,
    createGroveBridge,
    normalizeSettings,
    normalizeBest,
    summarizeRun,
    updateBoundedHistory,
    updatePlaytestCounter,
    mapSimulationEvents,
    buildRenderState,
    MothchorusApp,
    bootstrap,
    showFatalError,
  });
});
