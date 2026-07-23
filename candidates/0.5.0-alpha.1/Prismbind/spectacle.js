(function initializePrismbindSpectacle(root, factory) {
  "use strict";

  const spectacle = factory();
  if (typeof module === "object" && module.exports) module.exports = spectacle;
  else root.PrismbindSpectacle = spectacle;
})(typeof globalThis !== "undefined" ? globalThis : this, function createPrismbindSpectacle() {
  "use strict";

  const TAU = Math.PI * 2;
  const BLINK_CYCLE = 4.4;
  const BLINK_START = 4.16;
  const BLINK_DURATION = 0.2;

  const REACTION_DURATIONS = Object.freeze({
    contact: 0.46,
    fray: 0.82,
    recovery: 1.04,
    petalLoss: 1.24,
    seal: 1.48,
    phase: 1.72,
  });

  const TIMER_FIELDS = Object.freeze([
    "contactTimer",
    "frayTimer",
    "recoveryTimer",
    "petalLossTimer",
    "sealTimer",
    "phaseTimer",
  ]);

  function finiteNumber(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function clamp(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, value));
  }

  function normalizeAngle(value) {
    const angle = finiteNumber(value);
    return ((angle + Math.PI) % TAU + TAU) % TAU - Math.PI;
  }

  function shortestAngleDifference(from, to) {
    return normalizeAngle(to - from);
  }

  function approach(current, target, rate, elapsed) {
    if (elapsed <= 0) return current;
    const blend = 1 - Math.exp(-rate * elapsed);
    return current + (target - current) * blend;
  }

  function createGuardianState() {
    return {
      contactTimer: 0,
      frayTimer: 0,
      recoveryTimer: 0,
      petalLossTimer: 0,
      sealTimer: 0,
      phaseTimer: 0,
      awareness: 0,
      phaseBlend: 0,
      gazeAngle: 0,
      blink: 0,
      blinkClock: 0,
      crownOpen: 0,
      phaseIndex: 0,
    };
  }

  function resetGuardianState(state) {
    const reset = createGuardianState();
    if (!state || typeof state !== "object") return reset;
    Object.keys(state).forEach((key) => { delete state[key]; });
    Object.assign(state, reset);
    return state;
  }

  function reactionDefinition(kind) {
    const normalized = String(kind || "").toLowerCase().replace(/[\s_-]+/g, "");
    if (normalized === "contact" || normalized === "accepted") {
      return { timer: "contactTimer", duration: "contact", awareness: 0.1 };
    }
    if (normalized === "fray") {
      return { timer: "frayTimer", duration: "fray", awareness: 0.18 };
    }
    if (normalized === "recovery" || normalized === "recover" || normalized === "recovered") {
      return { timer: "recoveryTimer", duration: "recovery", awareness: 0.24 };
    }
    if (normalized === "petalloss" || normalized === "petalfall") {
      return { timer: "petalLossTimer", duration: "petalLoss", awareness: 0.34 };
    }
    if (normalized === "seal" || normalized === "sealed") {
      return { timer: "sealTimer", duration: "seal", awareness: 0.42 };
    }
    if (normalized === "phase" || normalized === "unfurl") {
      return { timer: "phaseTimer", duration: "phase", awareness: 0.5 };
    }
    return null;
  }

  function triggerReaction(state, kind, { intensity = 1, gazeAngle } = {}) {
    if (!state || typeof state !== "object") return state;
    const reaction = reactionDefinition(kind);
    if (!reaction) return state;

    const strength = clamp(finiteNumber(intensity, 1), 0, 1);
    const duration = REACTION_DURATIONS[reaction.duration] * strength;
    state[reaction.timer] = Math.max(
      clamp(finiteNumber(state[reaction.timer]), 0, REACTION_DURATIONS[reaction.duration]),
      duration,
    );
    state.awareness = clamp(finiteNumber(state.awareness) + reaction.awareness * strength, 0, 1);
    if (gazeAngle !== undefined && Number.isFinite(Number(gazeAngle))) {
      state.gazeAngle = normalizeAngle(gazeAngle);
    }
    return state;
  }

  function beginPhase(state, phaseIndex) {
    if (!state || typeof state !== "object") return state;
    const currentPhase = clamp(Math.floor(finiteNumber(state.phaseIndex)), 0, 2);
    state.phaseIndex = clamp(Math.floor(finiteNumber(phaseIndex, currentPhase)), 0, 2);
    state.phaseTimer = REACTION_DURATIONS.phase;
    state.awareness = clamp(Math.max(finiteNumber(state.awareness), 0.2 + state.phaseIndex * 0.12), 0, 1);
    return state;
  }

  function blinkAmount(clock) {
    if (clock < BLINK_START || clock >= BLINK_START + BLINK_DURATION) return 0;
    const progress = (clock - BLINK_START) / BLINK_DURATION;
    return clamp(1 - Math.abs(progress * 2 - 1), 0, 1);
  }

  function updateGuardian(
    state,
    dt,
    { phaseIndex, crownlight = 0, aimAngle, reducedMotion = false, paused = false } = {},
  ) {
    if (!state || typeof state !== "object" || paused) return state;

    const elapsed = Math.max(0, finiteNumber(dt));
    TIMER_FIELDS.forEach((field) => {
      state[field] = Math.max(0, finiteNumber(state[field]) - elapsed);
    });

    const nextPhase = phaseIndex === undefined
      ? clamp(Math.floor(finiteNumber(state.phaseIndex)), 0, 2)
      : clamp(Math.floor(finiteNumber(phaseIndex)), 0, 2);
    state.phaseIndex = nextPhase;

    const light = clamp(finiteNumber(crownlight), 0, 100);
    const phaseTarget = nextPhase / 2;
    const awarenessTarget = clamp(0.08 + light * 0.0074 + nextPhase * 0.08, 0, 1);
    const crownTarget = light / 100;

    state.awareness = reducedMotion
      ? awarenessTarget
      : clamp(approach(clamp(finiteNumber(state.awareness), 0, 1), awarenessTarget, 2.4, elapsed), 0, 1);
    state.phaseBlend = reducedMotion
      ? phaseTarget
      : clamp(approach(clamp(finiteNumber(state.phaseBlend), 0, 1), phaseTarget, 2.8, elapsed), 0, 1);
    state.crownOpen = reducedMotion
      ? crownTarget
      : clamp(approach(clamp(finiteNumber(state.crownOpen), 0, 1), crownTarget, 3.2, elapsed), 0, 1);

    state.gazeAngle = normalizeAngle(state.gazeAngle);
    if (reducedMotion) {
      state.blink = 0;
    } else {
      if (aimAngle !== undefined && Number.isFinite(Number(aimAngle))) {
        const difference = shortestAngleDifference(state.gazeAngle, normalizeAngle(aimAngle));
        const travel = difference * (1 - Math.exp(-7.5 * elapsed));
        state.gazeAngle = normalizeAngle(state.gazeAngle + travel);
      }
      const clock = Math.max(0, finiteNumber(state.blinkClock)) + elapsed;
      state.blinkClock = ((clock % BLINK_CYCLE) + BLINK_CYCLE) % BLINK_CYCLE;
      state.blink = blinkAmount(state.blinkClock);
    }

    state.blinkClock = clamp(finiteNumber(state.blinkClock), 0, BLINK_CYCLE);
    state.blink = clamp(finiteNumber(state.blink), 0, 1);
    return state;
  }

  function phaseStage(crownlight) {
    const light = clamp(finiteNumber(crownlight), 0, 100);
    if (light >= 100) return "acceptance";
    if (light >= 75) return "invitation";
    if (light >= 50) return "challenge";
    if (light >= 25) return "recognition";
    return "watching";
  }

  function awakeningDuration(reducedMotion) {
    return reducedMotion ? 2.8 : 5.2;
  }

  function awakeningCue(elapsed, duration) {
    const safeElapsed = Math.max(0, finiteNumber(elapsed));
    const safeDuration = Math.max(0, finiteNumber(duration));
    const progress = safeDuration > 0
      ? clamp(safeElapsed / safeDuration, 0, 1)
      : safeElapsed > 0 ? 1 : 0;

    let cue = "recognition";
    if (progress < 0.2) cue = "hush";
    else if (progress < 0.4) cue = "gather";
    else if (progress < 0.6) cue = "open";
    else if (progress < 0.8) cue = "bloom";
    return Object.freeze({ progress, cue });
  }

  function beatCueStage(age, contactAt, approachLead = 0.38) {
    const current = Number(age);
    const contact = Number(contactAt);
    if (!Number.isFinite(current) || !Number.isFinite(contact)) return "none";
    if (current >= contact) return "contact";
    const lead = Math.max(0, finiteNumber(approachLead, 0.38));
    return contact - current <= lead ? "approach" : "none";
  }

  return Object.freeze({
    REACTION_DURATIONS,
    createGuardianState,
    resetGuardianState,
    triggerReaction,
    beginPhase,
    updateGuardian,
    phaseStage,
    awakeningDuration,
    awakeningCue,
    beatCueStage,
  });
});
