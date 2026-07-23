(function attachMothchorusSimulation(root, factory) {
  if (typeof module === "object" && module.exports) {
    let rules = null;
    try {
      // The standalone keeps pure rules in a sibling UMD module.
      // eslint-disable-next-line global-require
      rules = require("./rules.js");
    } catch (_) {
      // The deterministic fallback keeps this module independently testable while
      // the browser still prefers the canonical rules module when it is present.
    }
    module.exports = factory(rules);
  } else {
    root.MothchorusSimulation = factory(root.MothchorusRules || null);
  }
}(typeof globalThis !== "undefined" ? globalThis : this, function buildSimulation(Rules) {
  "use strict";

  const TAU = Math.PI * 2;
  const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
  const RULE_TUNING = Rules && Rules.TUNING ? Rules.TUNING : {};
  const RULE_CANON = Rules && Rules.CANON ? Rules.CANON : {};
  const RULE_SCORING = RULE_TUNING.scoring || {};
  const RULE_CHORD_WINDOWS = RULE_TUNING.chordWindows || {};
  const RULE_PHASE_TICKS = Array.isArray(RULE_TUNING.phaseTicks) ? RULE_TUNING.phaseTicks : [];

  function finiteNumber(value, fallback) {
    return Number.isFinite(value) ? value : fallback;
  }

  function tuningNumber(names, fallback) {
    for (const name of names) {
      if (Number.isFinite(RULE_TUNING[name])) return RULE_TUNING[name];
    }
    return fallback;
  }

  const TUNING = Object.freeze({
    tickRate: tuningNumber(["tickRate", "ticksPerSecond", "TICK_RATE"], 60),
    logicalSize: finiteNumber(RULE_CANON.worldWidth, tuningNumber(["logicalSize", "worldSize", "LOGICAL_SIZE"], 1000)),
    voiceCount: tuningNumber(["voiceCount", "logicalVoices", "VOICE_COUNT"], 24),
    runTicks: tuningNumber(["runTicks", "RUN_TICKS"], 84 * 60),
    callTicks: finiteNumber(RULE_PHASE_TICKS[0], tuningNumber(["callTicks", "CALL_TICKS"], 24 * 60)),
    answerTicks: finiteNumber(RULE_PHASE_TICKS[1], tuningNumber(["answerTicks", "ANSWER_TICKS"], 30 * 60)),
    chorusTicks: finiteNumber(RULE_PHASE_TICKS[2], tuningNumber(["chorusTicks", "CHORUS_TICKS"], 30 * 60)),
    rechargeTicks: tuningNumber(["pulseRechargeTicks", "rechargeTicks", "RECHARGE_TICKS"], 26),
    perfectChordTicks: finiteNumber(RULE_CHORD_WINDOWS.perfect, tuningNumber(["perfectChordTicks", "PERFECT_CHORD_TICKS"], 5)),
    clearChordTicks: finiteNumber(RULE_CHORD_WINDOWS.clear, tuningNumber(["clearChordTicks", "CLEAR_CHORD_TICKS"], 11)),
    softChordTicks: finiteNumber(RULE_CHORD_WINDOWS.soft, tuningNumber(["softChordTicks", "SOFT_CHORD_TICKS"], 19)),
    chordRefractoryTicks: tuningNumber(["chordRefractoryTicks", "CHORD_REFRACTORY_TICKS"], 60),
    chordDurationTicks: tuningNumber(["chordProtectionTicks", "chordDurationTicks", "CHORD_DURATION_TICKS"], 54),
    chordOpportunityLeadTicks: tuningNumber(["chordOpportunityLeadTicks"], 45),
    pulseImpulse: tuningNumber(["pulseImpulse"], 78),
    lateralDrag: tuningNumber(["lateralDrag"], 2),
    maximumLateralSpeed: tuningNumber(["maximumLateralSpeed"], 185),
    gatePullCap: tuningNumber(["gatePullCap"], 18),
    formationRadiusX: tuningNumber(["formationRadiusX"], 74),
    formationRadiusY: tuningNumber(["formationRadiusY"], 58),
    chordFormationScale: tuningNumber(["chordFormationScale"], 0.58),
    formationSpring: tuningNumber(["formationSpring"], 16),
    formationDamping: tuningNumber(["formationDamping"], 8),
    returnSpring: tuningNumber(["returnSpring"], 22),
    returnDamping: tuningNumber(["returnDamping"], 9.5),
    returnTicks: tuningNumber(["returnTicks"], 39),
    separationRadius: tuningNumber(["separationRadius"], 20),
    separationStrength: tuningNumber(["separationStrength"], 90),
    minimumActiveVoices: tuningNumber(["minimumActiveVoices"], 8),
    rescueRadius: tuningNumber(["rescueRadius"], 90),
    chordRescueRadius: tuningNumber(["chordRescueRadius"], 160),
    bloomRadius: tuningNumber(["bloomRadius"], 58),
    flockY: tuningNumber(["flockY"], 700),
    gateApproachSpeed: tuningNumber(["gateApproachSpeed"], 125),
    maxCatchUpSteps: tuningNumber(["maxCatchUpSteps"], 4),
    maxEventQueue: tuningNumber(["maxEventQueue"], 512),
    rescuePerVoice: finiteNumber(RULE_SCORING.rescuePerVoice, 20)
  });

  const STEP_SECONDS = 1 / TUNING.tickRate;
  const PHASE_STARTS = Object.freeze({
    call: 0,
    answer: TUNING.callTicks,
    chorus: TUNING.callTicks + TUNING.answerTicks
  });

  const GATE_SECONDS = Object.freeze([6, 12, 18, 23, 28, 34, 40, 46, 53, 58, 63, 68, 73, 78, 82]);
  const GATE_HALF_WIDTHS = Object.freeze([210, 200, 175, 140, 155, 145, 130, 120, 115, 110, 105, 95, 90, 85, 78]);
  const CHORD_GATE_INDICES = new Set([3, 8, 11, 13, 14]);
  const BLOOM_GATE_INDICES = new Set([2, 5, 7, 10, 12]);
  const MAX_RESCUE_POINTS = TUNING.voiceCount * TUNING.rescuePerVoice;
  const MAX_METRIC_COUNT = 0xffff;
  const INPUT_SOURCE_KEYS = Object.freeze([
    "keyboard",
    "keyboard-activation",
    "pointer:mouse",
    "pointer:touch",
    "pointer:pen",
    "pointer:other",
    "qa",
    "test",
    "other"
  ]);

  function phaseForTickFallback(tick) {
    if (tick < PHASE_STARTS.answer) return "call";
    if (tick < PHASE_STARTS.chorus) return "answer";
    return "chorus";
  }

  function normalizePhase(value, tick) {
    if (typeof value === "string") {
      const lower = value.toLowerCase();
      if (lower.includes("call")) return "call";
      if (lower.includes("answer")) return "answer";
      if (lower.includes("chorus")) return "chorus";
    }
    if (value && typeof value === "object") {
      return normalizePhase(value.id || value.key || value.name, tick);
    }
    return phaseForTickFallback(tick);
  }

  function phaseForTick(tick) {
    if (Rules && typeof Rules.phaseForTick === "function") {
      try {
        return normalizePhase(Rules.phaseForTick(tick), tick);
      } catch (_) {
        // Fall through to the locally mirrored phase boundary.
      }
    }
    return phaseForTickFallback(tick);
  }

  function phaseIndexForGate(index) {
    if (index < 4) return 0;
    if (index < 9) return 1;
    return 2;
  }

  function makeRoute(id, centers, winds) {
    const gates = centers.map((centerX, index) => {
      const phaseIndex = phaseIndexForGate(index);
      const halfWidth = GATE_HALF_WIDTHS[index];
      const bloomSide = index % 2 === 0 ? -1 : 1;
      return Object.freeze({
        id: `${id}-${String(index + 1).padStart(2, "0")}`,
        index,
        tick: Math.round(GATE_SECONDS[index] * TUNING.tickRate),
        phase: ["call", "answer", "chorus"][phaseIndex],
        centerX,
        halfWidth,
        wind: winds[index],
        scatterCap: [1, 3, 4][phaseIndex],
        chordOpportunity: CHORD_GATE_INDICES.has(index),
        moonBloom: BLOOM_GATE_INDICES.has(index),
        bloomX: BLOOM_GATE_INDICES.has(index)
          ? centerX + bloomSide * halfWidth * 0.56
          : null
      });
    });
    return Object.freeze({ id, gates: Object.freeze(gates) });
  }

  // Only these authored, reviewable courses enter gameplay. A seed selects a
  // table; it never generates an unvalidated gate or wind combination.
  const ROUTES = Object.freeze([
    makeRoute(
      "weave",
      [610, 390, 560, 500, 330, 670, 450, 620, 380, 700, 300, 580, 420, 650, 500],
      [0, -8, 10, 0, 18, -20, 12, -16, 22, -24, 24, -18, 16, -22, 0]
    ),
    makeRoute(
      "echo",
      [390, 610, 440, 500, 670, 330, 550, 380, 620, 300, 700, 420, 580, 350, 500],
      [0, 8, -10, 0, -18, 20, -12, 16, -22, 24, -24, 18, -16, 22, 0]
    ),
    makeRoute(
      "crown",
      [600, 430, 570, 500, 360, 620, 700, 420, 320, 650, 450, 300, 620, 380, 500],
      [0, -6, 12, 0, 16, -14, -22, 20, 14, -20, 18, 24, -24, 20, 0]
    )
  ]);

  function unsignedSeed(seed) {
    const value = Number.isFinite(Number(seed)) ? Number(seed) : 0x4D4F5448;
    return value >>> 0;
  }

  function createSeededRandom(seed) {
    let state = unsignedSeed(seed) || 0x6D2B79F5;
    return function nextRandom() {
      state ^= state << 13;
      state ^= state >>> 17;
      state ^= state << 5;
      return (state >>> 0) / 4294967296;
    };
  }

  function routeForSeed(seed) {
    const random = createSeededRandom(unsignedSeed(seed) ^ 0xC4011D3);
    return ROUTES[Math.floor(random() * ROUTES.length) % ROUTES.length];
  }

  function clamp(value, minimum, maximum) {
    return Math.max(minimum, Math.min(maximum, value));
  }

  function formationSlot(id, tick, scale) {
    const normalizedRadius = Math.sqrt((id + 0.5) / TUNING.voiceCount);
    const angle = id * GOLDEN_ANGLE + tick * 0.0008;
    return {
      x: Math.cos(angle) * TUNING.formationRadiusX * normalizedRadius * scale,
      y: Math.sin(angle) * TUNING.formationRadiusY * normalizedRadius * scale
    };
  }

  function createVoice(id) {
    const slot = formationSlot(id, 0, 1);
    return {
      id,
      status: "active",
      x: 500 + slot.x,
      y: TUNING.flockY + slot.y,
      vx: 0,
      vy: 0,
      lostX: null,
      lostY: null,
      lostSinceTick: null,
      returnStartedTick: null,
      rescueCredit: 0,
      lossIncident: 0
    };
  }

  function localPulseState() {
    return {
      leftReadyTick: 0,
      rightReadyTick: 0,
      lastLeftTick: null,
      lastRightTick: null,
      chordReadyTick: 0
    };
  }

  function makePulseState() {
    if (Rules && typeof Rules.makePulseState === "function") {
      try {
        return Rules.makePulseState();
      } catch (_) {
        // Fall through to the compatible deterministic representation.
      }
    }
    return localPulseState();
  }

  function createGateRuntime(gate) {
    return {
      id: gate.id,
      resolved: false,
      passCount: 0,
      scatterCount: 0,
      chordQuality: null,
      chordTick: null,
      moonBloomCollected: false,
      score: 0
    };
  }

  function createSimulation(options) {
    const settings = options || {};
    const seed = unsignedSeed(settings.seed);
    const route = settings.routeId
      ? ROUTES.find((candidate) => candidate.id === settings.routeId) || routeForSeed(seed)
      : routeForSeed(seed);
    const voices = Array.from({ length: TUNING.voiceCount }, (_, id) => createVoice(id));

    return {
      version: 1,
      seed,
      routeId: route.id,
      participantMode: settings.participantMode === "together" ? "together" : "solo",
      route,
      tick: 0,
      phase: "call",
      completed: false,
      center: { x: 500, y: TUNING.flockY, vx: 0 },
      windX: 0,
      formationScale: 1,
      voices,
      gates: route.gates.map(createGateRuntime),
      nextGateIndex: 0,
      pulseState: makePulseState(),
      pairing: {
        leftTick: null,
        rightTick: null,
        chordReadyTick: 0
      },
      chord: {
        quality: null,
        startedTick: null,
        untilTick: -1,
        gateId: null
      },
      score: 0,
      scoreBreakdown: {
        gate: 0,
        fullGate: 0,
        chord: 0,
        moonBloom: 0,
        rescue: 0,
        finale: 0,
        perfectFinale: 0
      },
      rescueLedger: [],
      actionQueue: [],
      events: [],
      eventSequence: 0,
      droppedEvents: 0,
      nextLossIncident: 1,
      metrics: {
        pulsesAccepted: { left: 0, right: 0 },
        pulsesRejected: { left: 0, right: 0 },
        inputSources: Object.fromEntries(INPUT_SOURCE_KEYS.map((key) => [key, 0])),
        chordAttempts: 0,
        chords: { soft: 0, clear: 0, perfect: 0 },
        gatesResolved: 0,
        gatesMissed: 0,
        voicesScattered: 0,
        voicesRescued: 0,
        moonBlooms: 0
      },
      lastAcceptedPulseSide: null,
      result: null
    };
  }

  function emit(state, type, detail) {
    const event = Object.assign({
      type,
      tick: state.tick,
      sequence: state.eventSequence++
    }, detail || {});
    if (state.events.length >= TUNING.maxEventQueue) {
      state.events.shift();
      state.droppedEvents += 1;
    }
    state.events.push(event);
    return event;
  }

  function drainEvents(state) {
    const events = state.events.slice();
    state.events.length = 0;
    return events;
  }

  function normalizeAction(action, fallbackSequence) {
    if (!action || action.type !== "pulse" || (action.side !== "left" && action.side !== "right")) {
      return null;
    }
    return {
      type: "pulse",
      side: action.side,
      tick: Math.max(0, Math.floor(finiteNumber(action.tick, 0))),
      sequence: Math.max(0, Math.floor(finiteNumber(action.sequence, fallbackSequence))),
      source: typeof action.source === "string" ? action.source : "test"
    };
  }

  function enqueueActions(state, actions) {
    if (!Array.isArray(actions)) return state.actionQueue.length;
    let fallbackSequence = state.actionQueue.length
      ? state.actionQueue[state.actionQueue.length - 1].sequence + 1
      : 0;
    for (const action of actions) {
      const normalized = normalizeAction(action, fallbackSequence++);
      if (normalized) state.actionQueue.push(normalized);
    }
    state.actionQueue.sort((a, b) => a.tick - b.tick || a.sequence - b.sequence);
    return state.actionQueue.length;
  }

  function incrementBoundedMetric(container, key) {
    const current = Number.isSafeInteger(container[key]) ? container[key] : 0;
    container[key] = Math.min(MAX_METRIC_COUNT, current + 1);
  }

  function inputSourceKey(source) {
    const value = typeof source === "string" ? source.toLowerCase() : "other";
    if (INPUT_SOURCE_KEYS.includes(value)) return value;
    if (value.startsWith("pointer:")) return "pointer:other";
    return "other";
  }

  function readyTickFor(pulseState, side) {
    const key = side === "left" ? "leftReadyTick" : "rightReadyTick";
    return finiteNumber(pulseState && pulseState[key], 0);
  }

  function looksLikePulseState(value) {
    return Boolean(value && typeof value === "object" && (
      "leftReadyTick" in value || "rightReadyTick" in value || "chordReadyTick" in value
    ));
  }

  function applyPulseThroughRules(pulseState, side, tick) {
    const wasReady = tick >= readyTickFor(pulseState, side);
    if (Rules && typeof Rules.applyPulse === "function") {
      try {
        const outcome = Rules.applyPulse(pulseState, side, tick);
        const nextState = outcome && looksLikePulseState(outcome.state)
          ? outcome.state
          : outcome && looksLikePulseState(outcome.pulseState)
            ? outcome.pulseState
            : looksLikePulseState(outcome)
              ? outcome
              : pulseState;
        const accepted = outcome && typeof outcome.accepted === "boolean"
          ? outcome.accepted
          : outcome && outcome.event && typeof outcome.event.accepted === "boolean"
            ? outcome.event.accepted
            : wasReady;
        return {
          state: nextState,
          accepted,
          reason: outcome && (outcome.reason || (outcome.event && outcome.event.reason)) || (accepted ? "accepted" : "recharge"),
          forceDirection: outcome && Number.isFinite(outcome.forceDirection)
            ? outcome.forceDirection
            : (accepted ? (side === "left" ? 1 : -1) : 0),
          chord: outcome && outcome.chord ? outcome.chord : null
        };
      } catch (_) {
        // A browser can still fail safely into the same deterministic contract.
      }
    }

    if (!wasReady) return {
      state: pulseState,
      accepted: false,
      reason: "recharge",
      forceDirection: 0,
      chord: null
    };
    const nextState = Object.assign({}, pulseState);
    if (side === "left") {
      nextState.leftReadyTick = tick + TUNING.rechargeTicks;
      nextState.lastLeftTick = tick;
    } else {
      nextState.rightReadyTick = tick + TUNING.rechargeTicks;
      nextState.lastRightTick = tick;
    }
    return {
      state: nextState,
      accepted: true,
      reason: "accepted",
      forceDirection: side === "left" ? 1 : -1,
      chord: null
    };
  }

  function chordQuality(delta) {
    if (Rules && typeof Rules.chordQuality === "function") {
      try {
        const quality = Rules.chordQuality(delta);
        if (quality === "perfect" || quality === "clear" || quality === "soft") return quality;
        if (quality && typeof quality === "object") {
          const key = String(quality.id || quality.key || quality.quality || "").toLowerCase();
          if (key === "perfect" || key === "clear" || key === "soft") return key;
        }
      } catch (_) {
        // Use the mirrored Candidate timing bands below.
      }
    }
    if (delta <= TUNING.perfectChordTicks) return "perfect";
    if (delta <= TUNING.clearChordTicks) return "clear";
    if (delta <= TUNING.softChordTicks) return "soft";
    return null;
  }

  function expirePendingPulses(state) {
    const cutoff = state.tick - TUNING.softChordTicks;
    if (state.pairing.leftTick !== null && state.pairing.leftTick < cutoff) state.pairing.leftTick = null;
    if (state.pairing.rightTick !== null && state.pairing.rightTick < cutoff) state.pairing.rightTick = null;
  }

  function pendingChordGate(state) {
    for (let index = state.nextGateIndex; index < state.route.gates.length; index += 1) {
      const gate = state.route.gates[index];
      const runtime = state.gates[index];
      if (runtime.resolved) continue;
      if (gate.tick < state.tick) continue;
      if (gate.tick - state.tick > TUNING.chordOpportunityLeadTicks) return null;
      if (gate.chordOpportunity && !runtime.chordQuality) return { gate, runtime };
    }
    return null;
  }

  function createChord(state, quality, delta, protectionUntilTick) {
    state.pairing.leftTick = null;
    state.pairing.rightTick = null;
    state.pairing.chordReadyTick = state.tick + TUNING.chordRefractoryTicks;
    const opportunity = pendingChordGate(state);
    state.chord.quality = quality;
    state.chord.startedTick = state.tick;
    state.chord.untilTick = Number.isSafeInteger(protectionUntilTick)
      ? protectionUntilTick
      : state.tick + TUNING.chordDurationTicks;
    state.chord.gateId = opportunity ? opportunity.gate.id : null;
    if (opportunity) {
      opportunity.runtime.chordQuality = quality;
      opportunity.runtime.chordTick = state.tick;
      state.chord.untilTick = Math.max(state.chord.untilTick, opportunity.gate.tick + 1);
    }
    state.metrics.chords[quality] += 1;
    emit(state, "chord", {
      quality,
      deltaTicks: delta,
      gateId: opportunity ? opportunity.gate.id : null,
      scoredOpportunity: Boolean(opportunity)
    });
  }

  function activeChordQuality(state) {
    if (!state || state.tick >= finiteNumber(state.chord && state.chord.untilTick, -1)) return null;
    const quality = state.chord && state.chord.quality;
    return quality === "perfect" || quality === "clear" || quality === "soft" ? quality : null;
  }

  function registerAcceptedPulseForChord(state, side) {
    state.pairing[side === "left" ? "leftTick" : "rightTick"] = state.tick;
    expirePendingPulses(state);
    const left = state.pairing.leftTick;
    const right = state.pairing.rightTick;
    if (left === null || right === null || state.tick < state.pairing.chordReadyTick) return;
    const delta = Math.abs(left - right);
    const quality = chordQuality(delta);
    if (quality) createChord(state, quality, delta);
  }

  function processPulse(state, action) {
    incrementBoundedMetric(state.metrics.inputSources, inputSourceKey(action.source));
    const outcome = applyPulseThroughRules(state.pulseState, action.side, state.tick);
    state.pulseState = outcome.state;
    if (!outcome.accepted) {
      state.metrics.pulsesRejected[action.side] += 1;
      emit(state, "pulse-rejected", { side: action.side, reason: outcome.reason, source: action.source });
      return;
    }

    state.metrics.pulsesAccepted[action.side] += 1;
    if (state.lastAcceptedPulseSide && state.lastAcceptedPulseSide !== action.side) {
      incrementBoundedMetric(state.metrics, "chordAttempts");
    }
    state.lastAcceptedPulseSide = action.side;
    state.center.vx = clamp(
      state.center.vx + outcome.forceDirection * TUNING.pulseImpulse,
      -TUNING.maximumLateralSpeed,
      TUNING.maximumLateralSpeed
    );
    emit(state, "pulse", { side: action.side, source: action.source });
    if (outcome.chord) {
      createChord(
        state,
        outcome.chord.quality,
        outcome.chord.differenceTicks,
        outcome.chord.protectionUntilTick
      );
    } else if (!Rules || typeof Rules.applyPulse !== "function") {
      registerAcceptedPulseForChord(state, action.side);
    }
  }

  function processActionsForTick(state) {
    expirePendingPulses(state);
    while (state.actionQueue.length && state.actionQueue[0].tick <= state.tick) {
      processPulse(state, state.actionQueue.shift());
    }
  }

  function nextUnresolvedGate(state) {
    for (let index = state.nextGateIndex; index < state.route.gates.length; index += 1) {
      if (!state.gates[index].resolved) return state.route.gates[index];
    }
    return null;
  }

  function authoredWind(state, gate) {
    if (!gate) return 0;
    const previousTick = gate.index === 0 ? 0 : state.route.gates[gate.index - 1].tick;
    const interval = Math.max(1, gate.tick - previousTick);
    const progress = clamp((state.tick - previousTick) / interval, 0, 1);
    return gate.wind * Math.sin(progress * Math.PI);
  }

  function updateCenter(state) {
    const gate = nextUnresolvedGate(state);
    state.windX = authoredWind(state, gate);
    let acceleration = state.windX;
    if (gate) {
      const ticksUntil = gate.tick - state.tick;
      if (ticksUntil >= 0 && ticksUntil <= 2 * TUNING.tickRate) {
        acceleration += clamp((gate.centerX - state.center.x) * 0.07, -TUNING.gatePullCap, TUNING.gatePullCap);
      }
    }
    if (state.center.x < 120) acceleration += (120 - state.center.x) * 0.7;
    if (state.center.x > 880) acceleration -= (state.center.x - 880) * 0.7;

    state.center.vx += acceleration * STEP_SECONDS;
    state.center.vx *= Math.exp(-TUNING.lateralDrag * STEP_SECONDS);
    state.center.vx = clamp(state.center.vx, -TUNING.maximumLateralSpeed, TUNING.maximumLateralSpeed);
    state.center.x += state.center.vx * STEP_SECONDS;
    if (state.center.x < 70 || state.center.x > 930) {
      state.center.x = clamp(state.center.x, 70, 930);
      state.center.vx *= 0.25;
    }
  }

  function updateFormationScale(state) {
    const target = activeChordQuality(state) ? TUNING.chordFormationScale : 1;
    state.formationScale += (target - state.formationScale) * Math.min(1, STEP_SECONDS * 12);
  }

  function updateVoices(state) {
    const accelerations = state.voices.map(() => ({ x: 0, y: 0 }));

    for (const voice of state.voices) {
      const acceleration = accelerations[voice.id];
      if (voice.status === "lost") {
        acceleration.x = (voice.lostX - voice.x) * 5 - voice.vx * 4.5;
        acceleration.y = (voice.lostY - voice.y) * 5 - voice.vy * 4.5;
        continue;
      }

      const slot = formationSlot(voice.id, state.tick, state.formationScale);
      const targetX = state.center.x + slot.x;
      const targetY = state.center.y + slot.y;
      const spring = voice.status === "returning" ? TUNING.returnSpring : TUNING.formationSpring;
      const damping = voice.status === "returning" ? TUNING.returnDamping : TUNING.formationDamping;
      acceleration.x = (targetX - voice.x) * spring - (voice.vx - state.center.vx) * damping;
      acceleration.y = (targetY - voice.y) * spring - voice.vy * damping;
    }

    for (let i = 0; i < state.voices.length; i += 1) {
      const first = state.voices[i];
      if (first.status === "lost") continue;
      for (let j = i + 1; j < state.voices.length; j += 1) {
        const second = state.voices[j];
        if (second.status === "lost") continue;
        let dx = second.x - first.x;
        let dy = second.y - first.y;
        let distanceSquared = dx * dx + dy * dy;
        if (distanceSquared >= TUNING.separationRadius * TUNING.separationRadius) continue;
        if (distanceSquared < 0.000001) {
          const angle = ((first.id + 1) * 17 + (second.id + 1) * 29) % 360 / 360 * TAU;
          dx = Math.cos(angle);
          dy = Math.sin(angle);
          distanceSquared = 1;
        }
        const distance = Math.sqrt(distanceSquared);
        const strength = (1 - distance / TUNING.separationRadius) * TUNING.separationStrength;
        const fx = dx / distance * strength;
        const fy = dy / distance * strength;
        accelerations[first.id].x -= fx;
        accelerations[first.id].y -= fy;
        accelerations[second.id].x += fx;
        accelerations[second.id].y += fy;
      }
    }

    for (const voice of state.voices) {
      const acceleration = accelerations[voice.id];
      voice.vx += acceleration.x * STEP_SECONDS;
      voice.vy += acceleration.y * STEP_SECONDS;
      voice.vx = clamp(voice.vx, -300, 300);
      voice.vy = clamp(voice.vy, -260, 260);
      voice.x = clamp(voice.x + voice.vx * STEP_SECONDS, 30, 970);
      voice.y = clamp(voice.y + voice.vy * STEP_SECONDS, 520, 860);
      if (voice.status === "returning" && state.tick - voice.returnStartedTick >= TUNING.returnTicks) {
        if (Rules && typeof Rules.completeRescue === "function") {
          const counts = voiceCounts(state);
          const transition = Rules.completeRescue(
            { active: counts.active, lost: counts.lost, returning: counts.returning },
            1
          );
          if (!transition || transition.moved !== 1) continue;
        }
        voice.status = "active";
        voice.returnStartedTick = null;
        voice.lostX = null;
        voice.lostY = null;
        emit(state, "voice-returned", { voiceId: voice.id });
      }
    }
  }

  function voiceCounts(state) {
    const counts = { active: 0, lost: 0, returning: 0 };
    for (const voice of state.voices) counts[voice.status] += 1;
    counts.retained = counts.active + counts.returning;
    counts.total = counts.active + counts.lost + counts.returning;
    return counts;
  }

  function rescuePointValue(state, credit) {
    const incidentCredit = Math.max(0, Math.min(TUNING.rescuePerVoice, Math.floor(finiteNumber(credit, 0))));
    const remainingRunCredit = Math.max(0, MAX_RESCUE_POINTS - state.scoreBreakdown.rescue);
    return Math.min(incidentCredit, remainingRunCredit);
  }

  function rescueLedgerScore(state) {
    return state.rescueLedger.reduce((sum, entry) => sum + entry.points, 0);
  }

  function startRescue(state, voice, method) {
    if (voice.status !== "lost") return false;
    if (Rules && typeof Rules.beginRescue === "function") {
      const counts = voiceCounts(state);
      const transition = Rules.beginRescue(
        { active: counts.active, lost: counts.lost, returning: counts.returning },
        1
      );
      if (!transition || transition.moved !== 1) return false;
    }
    voice.status = "returning";
    voice.returnStartedTick = state.tick;
    const points = rescuePointValue(state, voice.rescueCredit);
    voice.rescueCredit = 0;
    state.score += points;
    state.scoreBreakdown.rescue += points;
    state.metrics.voicesRescued += 1;
    state.rescueLedger.push(Object.freeze({
      voiceId: voice.id,
      incident: voice.lossIncident,
      tick: state.tick,
      method,
      points
    }));
    emit(state, "voice-rescued", { voiceId: voice.id, method, points });
    return true;
  }

  function updateRescues(state) {
    const chordQuality = activeChordQuality(state);
    const radius = chordQuality ? TUNING.chordRescueRadius : TUNING.rescueRadius;
    const radiusSquared = radius * radius;
    for (const voice of state.voices) {
      if (voice.status !== "lost") continue;
      // Rescue against the authored resting place, not the voice's transitional
      // position. A newly scattered voice begins inside the flock's radius; using
      // its current position would make it rescue itself one tick later without
      // any player pursuit.
      const rescueX = finiteNumber(voice.lostX, voice.x);
      const rescueY = finiteNumber(voice.lostY, voice.y);
      const dx = rescueX - state.center.x;
      const dy = rescueY - state.center.y;
      if (dx * dx + dy * dy <= radiusSquared) {
        startRescue(state, voice, chordQuality ? "chord" : "proximity");
      }
    }
  }

  function numericRuleResult(value, fallback) {
    if (Number.isFinite(value)) return Math.max(0, Math.floor(value));
    if (value && Number.isFinite(value.total)) return Math.max(0, Math.floor(value.total));
    if (value && Number.isFinite(value.score)) return Math.max(0, Math.floor(value.score));
    return fallback;
  }

  function gatePointValues(passCount, fullChorus) {
    const cleared = passCount > 0;
    const fallback = { passage: passCount * 10, full: fullChorus ? 100 : 0 };
    if (!Rules || typeof Rules.gateScore !== "function") return fallback;
    try {
      const passage = numericRuleResult(Rules.gateScore({ voiceCount: passCount, cleared, fullChorus: false }), fallback.passage);
      const total = numericRuleResult(Rules.gateScore({ voiceCount: passCount, cleared, fullChorus }), passage + fallback.full);
      return { passage, full: Math.max(0, total - passage) };
    } catch (_) {
      // Use mirrored Candidate values.
    }
    return fallback;
  }

  function chordPointValue(quality) {
    const fallback = numericRuleResult(
      RULE_SCORING.markedChord && RULE_SCORING.markedChord[quality],
      { soft: 100, clear: 175, perfect: 250 }[quality] || 0
    );
    if (Rules && typeof Rules.chordScore === "function") {
      try {
        return numericRuleResult(Rules.chordScore(quality), fallback);
      } catch (_) {
        // Use mirrored Candidate values.
      }
    }
    return fallback;
  }

  function moonBloomPointValue() {
    if (Rules && typeof Rules.moonBloomScore === "function") {
      try {
        return numericRuleResult(Rules.moonBloomScore(), 300);
      } catch (_) {
        // Use mirrored Candidate value.
      }
    }
    return numericRuleResult(RULE_SCORING.moonBloom, 300);
  }

  function protectionScatterCount(baseCount, quality) {
    if (quality === "perfect") return 0;
    if (quality === "clear") return Math.ceil(baseCount * 0.25);
    if (quality === "soft") return Math.ceil(baseCount * 0.5);
    return baseCount;
  }

  function scatterCandidates(state, candidates, requested, incident, refundBudget) {
    const counts = voiceCounts(state);
    let permitted = Math.max(0, Math.min(requested, counts.active - TUNING.minimumActiveVoices));
    if (Rules && typeof Rules.scatterVoices === "function") {
      const transition = Rules.scatterVoices(
        { active: counts.active, lost: counts.lost, returning: counts.returning },
        permitted
      );
      permitted = transition && Number.isSafeInteger(transition.moved) ? transition.moved : permitted;
    }
    let remainingRefund = refundBudget;
    for (let index = 0; index < permitted; index += 1) {
      const voice = candidates[index];
      let side = voice.x < state.center.x ? -1 : 1;
      const scatterDistance = TUNING.rescueRadius + 35 + (voice.id % 3) * 14;
      let lostX = clamp(state.center.x + side * scatterDistance, 55, 945);
      if (Math.abs(lostX - state.center.x) <= TUNING.rescueRadius) {
        side *= -1;
        lostX = clamp(state.center.x + side * scatterDistance, 55, 945);
      }
      voice.status = "lost";
      voice.lostSinceTick = state.tick;
      voice.lossIncident = incident;
      voice.lostX = lostX;
      voice.lostY = clamp(TUNING.flockY + ((voice.id * 37 + incident * 19) % 151) - 75, 560, 840);
      voice.vx *= 0.35;
      voice.vy *= 0.35;
      voice.rescueCredit = Math.min(TUNING.rescuePerVoice, remainingRefund);
      remainingRefund -= voice.rescueCredit;
      state.metrics.voicesScattered += 1;
      emit(state, "voice-scattered", { voiceId: voice.id, incident });
    }
    return permitted;
  }

  function resolveGate(state, gate, runtime) {
    const active = state.voices.filter((voice) => voice.status === "active");
    const left = gate.centerX - gate.halfWidth;
    const right = gate.centerX + gate.halfWidth;
    const passed = active.filter((voice) => voice.x >= left && voice.x <= right);
    const outside = active
      .filter((voice) => voice.x < left || voice.x > right)
      .map((voice) => ({
        voice,
        missDistance: voice.x < left ? left - voice.x : voice.x - right
      }))
      .sort((a, b) => b.missDistance - a.missDistance || a.voice.id - b.voice.id);

    const fullChorus = passed.length === TUNING.voiceCount;
    const gatePoints = gatePointValues(passed.length, fullChorus);
    const chordPoints = gate.chordOpportunity && runtime.chordQuality
      ? chordPointValue(runtime.chordQuality)
      : 0;
    let bloomPoints = 0;
    if (gate.moonBloom) {
      runtime.moonBloomCollected = active.some((voice) => Math.abs(voice.x - gate.bloomX) <= TUNING.bloomRadius);
      if (runtime.moonBloomCollected) {
        bloomPoints = moonBloomPointValue();
        state.metrics.moonBlooms += 1;
        emit(state, "moon-bloom", { gateId: gate.id, points: bloomPoints });
      }
    }

    const requestedScatter = protectionScatterCount(
      Math.min(gate.scatterCap, outside.length),
      activeChordQuality(state)
    );
    const flawlessGatePoints = 340;
    const earnedGatePoints = gatePoints.passage + gatePoints.full;
    const gateDebt = Math.max(0, flawlessGatePoints - earnedGatePoints);
    const refundBudget = Math.min(requestedScatter * TUNING.rescuePerVoice, Math.floor(gateDebt * 0.5));
    const incident = state.nextLossIncident++;
    const scatterCount = scatterCandidates(
      state,
      outside.map((entry) => entry.voice),
      requestedScatter,
      incident,
      refundBudget
    );

    runtime.resolved = true;
    runtime.passCount = passed.length;
    runtime.scatterCount = scatterCount;
    runtime.score = gatePoints.passage + gatePoints.full + chordPoints + bloomPoints;
    state.score += runtime.score;
    state.scoreBreakdown.gate += gatePoints.passage;
    state.scoreBreakdown.fullGate += gatePoints.full;
    state.scoreBreakdown.chord += chordPoints;
    state.scoreBreakdown.moonBloom += bloomPoints;
    state.metrics.gatesResolved += 1;
    if (passed.length === 0) state.metrics.gatesMissed += 1;
    state.nextGateIndex = Math.max(state.nextGateIndex, gate.index + 1);

    emit(state, "gate", {
      gateId: gate.id,
      passCount: passed.length,
      fullChorus,
      scatterCount,
      chordQuality: runtime.chordQuality,
      moonBloomCollected: runtime.moonBloomCollected,
      points: runtime.score
    });
  }

  function resolveDueGates(state) {
    while (state.nextGateIndex < state.route.gates.length) {
      const gate = state.route.gates[state.nextGateIndex];
      if (gate.tick > state.tick) break;
      resolveGate(state, gate, state.gates[state.nextGateIndex]);
    }
  }

  function finalePointValues(finalVoiceCount) {
    const fallback = {
      voices: finalVoiceCount * 75,
      perfect: finalVoiceCount === TUNING.voiceCount ? 350 : 0
    };
    if (!Rules || typeof Rules.finaleScore !== "function") return fallback;
    const attempts = [
      () => Rules.finaleScore(finalVoiceCount),
      () => Rules.finaleScore({ finalVoiceCount })
    ];
    for (const attempt of attempts) {
      try {
        const value = attempt();
        if (Number.isFinite(value)) {
          const total = numericRuleResult(value, fallback.voices + fallback.perfect);
          return { voices: Math.min(total, fallback.voices), perfect: Math.max(0, total - Math.min(total, fallback.voices)) };
        }
        if (value && typeof value === "object") {
          return {
            voices: numericRuleResult(value.voices ?? value.voiceScore ?? value.finalVoices, fallback.voices),
            perfect: numericRuleResult(value.perfect ?? value.perfectBonus ?? value.bonus, fallback.perfect)
          };
        }
      } catch (_) {
        // Try the next compatible signature.
      }
    }
    return fallback;
  }

  function runCompleteAtTick(tick) {
    if (Rules && typeof Rules.isRunComplete === "function") {
      try {
        return Boolean(Rules.isRunComplete(tick));
      } catch (_) {
        // Use the mirrored 84-second boundary.
      }
    }
    return tick >= TUNING.runTicks;
  }

  function completeRun(state) {
    if (state.completed) return;
    const counts = voiceCounts(state);
    const finale = finalePointValues(counts.retained);
    state.scoreBreakdown.finale += finale.voices;
    state.scoreBreakdown.perfectFinale += finale.perfect;
    state.score += finale.voices + finale.perfect;
    if (Rules && typeof Rules.scoreRun === "function") {
      const exactRescuePoints = rescueLedgerScore(state);
      if (exactRescuePoints !== state.scoreBreakdown.rescue) {
        throw new Error("Mothchorus rescue ledger does not match the live rescue score.");
      }
      const scored = Rules.scoreRun({
        participantMode: state.participantMode,
        completed: true,
        gateVoiceCounts: state.gates.map((gate) => gate.passCount),
        gatesCleared: state.gates.filter((gate) => gate.passCount > 0).length,
        fullChorusGates: state.gates.filter((gate) => gate.passCount === TUNING.voiceCount).length,
        markedChordQualities: state.route.gates
          .map((gate, index) => gate.chordOpportunity ? (state.gates[index].chordQuality || "miss") : null)
          .filter((quality) => quality !== null),
        moonBlooms: state.gates.filter((gate) => gate.moonBloomCollected).length,
        finalVoiceCount: counts.retained,
        rescuedVoices: Math.min(TUNING.voiceCount, state.metrics.voicesRescued),
        rescuePoints: exactRescuePoints
      });
      state.result = scored;
      state.score = scored.score;
      state.scoreBreakdown.gate = scored.categories.gates;
      state.scoreBreakdown.fullGate = scored.categories.fullChorus;
      state.scoreBreakdown.chord = scored.categories.chords;
      state.scoreBreakdown.moonBloom = scored.categories.moonBlooms;
      state.scoreBreakdown.rescue = scored.categories.rescues;
      state.scoreBreakdown.finale = counts.retained * 75;
      state.scoreBreakdown.perfectFinale = counts.retained === TUNING.voiceCount ? 350 : 0;
    }
    state.completed = true;
    emit(state, "complete", {
      finalVoiceCount: counts.retained,
      score: state.score,
      scoreBreakdown: Object.assign({}, state.scoreBreakdown)
    });
  }

  function updatePhase(state) {
    const nextPhase = phaseForTick(state.tick);
    if (nextPhase !== state.phase) {
      state.phase = nextPhase;
      emit(state, "phase", { phase: nextPhase });
    }
  }

  function assertConservation(state) {
    const counts = voiceCounts(state);
    if (counts.total !== TUNING.voiceCount) {
      throw new Error(`Mothchorus voice conservation failed: expected ${TUNING.voiceCount}, received ${counts.total}.`);
    }
    return counts;
  }

  function stepSimulation(state, actions) {
    if (!state || state.completed) return state;
    if (actions) enqueueActions(state, actions);
    state.tick += 1;
    updatePhase(state);
    processActionsForTick(state);
    updateCenter(state);
    updateFormationScale(state);
    updateVoices(state);
    updateRescues(state);
    resolveDueGates(state);
    assertConservation(state);
    if (runCompleteAtTick(state.tick)) completeRun(state);
    return state;
  }

  function stepTicks(state, count, actions) {
    if (actions) enqueueActions(state, actions);
    const ticks = Math.max(0, Math.floor(finiteNumber(count, 0)));
    for (let index = 0; index < ticks && !state.completed; index += 1) stepSimulation(state);
    return state;
  }

  function createScheduler() {
    return { accumulator: 0, frames: 0, droppedSteps: 0, simulatedSteps: 0 };
  }

  function advanceFrame(state, scheduler, elapsedSeconds, actions) {
    if (!scheduler || typeof scheduler !== "object") throw new TypeError("A scheduler from createScheduler() is required.");
    if (actions) enqueueActions(state, actions);
    scheduler.frames += 1;
    scheduler.accumulator += Math.max(0, finiteNumber(elapsedSeconds, 0));
    let steps = 0;
    while (scheduler.accumulator + 1e-12 >= STEP_SECONDS && steps < TUNING.maxCatchUpSteps && !state.completed) {
      stepSimulation(state);
      scheduler.accumulator -= STEP_SECONDS;
      steps += 1;
      scheduler.simulatedSteps += 1;
    }
    if (scheduler.accumulator + 1e-12 >= STEP_SECONDS) {
      const dropped = Math.floor((scheduler.accumulator + 1e-12) / STEP_SECONDS);
      scheduler.accumulator -= dropped * STEP_SECONDS;
      scheduler.droppedSteps += dropped;
    }
    return { steps, droppedSteps: scheduler.droppedSteps, accumulator: scheduler.accumulator };
  }

  function gateRenderY(state, gate) {
    return TUNING.flockY - (gate.tick - state.tick) / TUNING.tickRate * TUNING.gateApproachSpeed;
  }

  function round(value) {
    return Math.round(value * 1e6) / 1e6;
  }

  function sortedPulseState(pulseState) {
    const result = {};
    for (const key of Object.keys(pulseState || {}).sort()) {
      const value = pulseState[key];
      if (value === null || typeof value === "string" || typeof value === "boolean" || Number.isFinite(value)) result[key] = value;
    }
    return result;
  }

  function snapshotSimulation(state) {
    const counts = voiceCounts(state);
    return {
      version: state.version,
      seed: state.seed,
      routeId: state.routeId,
      participantMode: state.participantMode,
      tick: state.tick,
      phase: state.phase,
      completed: state.completed,
      center: { x: round(state.center.x), y: round(state.center.y), vx: round(state.center.vx) },
      windX: round(state.windX),
      formationScale: round(state.formationScale),
      pulseState: sortedPulseState(state.pulseState),
      pairing: Object.assign({}, state.pairing),
      chord: Object.assign({}, state.chord),
      lastAcceptedPulseSide: state.lastAcceptedPulseSide,
      counts,
      voices: state.voices.map((voice) => ({
        id: voice.id,
        status: voice.status,
        x: round(voice.x),
        y: round(voice.y),
        vx: round(voice.vx),
        vy: round(voice.vy),
        lostX: voice.lostX === null ? null : round(voice.lostX),
        lostY: voice.lostY === null ? null : round(voice.lostY),
        lostSinceTick: voice.lostSinceTick,
        returnStartedTick: voice.returnStartedTick,
        rescueCredit: voice.rescueCredit,
        lossIncident: voice.lossIncident
      })),
      gates: state.gates.map((gate) => Object.assign({}, gate)),
      nextGateIndex: state.nextGateIndex,
      score: state.score,
      scoreBreakdown: Object.assign({}, state.scoreBreakdown),
      rescueLedger: state.rescueLedger.map((entry) => Object.assign({}, entry)),
      metrics: JSON.parse(JSON.stringify(state.metrics)),
      queuedActions: state.actionQueue.map((action) => Object.assign({}, action)),
      droppedEvents: state.droppedEvents
    };
  }

  function snapshotHash(state) {
    const text = JSON.stringify(snapshotSimulation(state));
    let hash = 2166136261;
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16).padStart(8, "0");
  }

  function validateRoutes() {
    const problems = [];
    for (const route of ROUTES) {
      if (route.gates.length !== 15) problems.push(`${route.id}: expected 15 gates`);
      const phaseCounts = { call: 0, answer: 0, chorus: 0 };
      let chords = 0;
      let blooms = 0;
      let previousTick = -1;
      for (const gate of route.gates) {
        phaseCounts[gate.phase] += 1;
        if (gate.chordOpportunity) chords += 1;
        if (gate.moonBloom) blooms += 1;
        if (gate.tick <= previousTick) problems.push(`${route.id}: gate ticks are not strictly increasing`);
        if (gate.centerX - gate.halfWidth < 30 || gate.centerX + gate.halfWidth > 970) {
          problems.push(`${route.id}/${gate.id}: opening exceeds the logical safe field`);
        }
        previousTick = gate.tick;
      }
      if (phaseCounts.call !== 4 || phaseCounts.answer !== 5 || phaseCounts.chorus !== 6) {
        problems.push(`${route.id}: expected phase split 4/5/6`);
      }
      if (chords !== 5) problems.push(`${route.id}: expected five Chord opportunities`);
      if (blooms !== 5) problems.push(`${route.id}: expected five moon-blooms`);
    }
    return Object.freeze({ ok: problems.length === 0, problems: Object.freeze(problems) });
  }

  const api = {
    TUNING,
    STEP_SECONDS,
    PHASE_STARTS,
    ROUTES,
    createSeededRandom,
    routeForSeed,
    phaseForTick,
    createSimulation,
    enqueueActions,
    stepSimulation,
    stepTicks,
    voiceCounts,
    drainEvents,
    createScheduler,
    advanceFrame,
    gateRenderY,
    snapshotSimulation,
    snapshotHash,
    validateRoutes,
    assertConservation
  };

  return Object.freeze(api);
}));
