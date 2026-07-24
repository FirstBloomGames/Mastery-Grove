(function initializeMasteryGroveFirstBloom(root, factory) {
  "use strict";

  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.MasteryGroveFirstBloom = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createMasteryGroveFirstBloom() {
  "use strict";

  const STATE_VERSION = 1;
  const ASSIST_DELAY_MS = 6000;
  const FLOWER_AWAKEN_INTERVAL_MS = 180;
  const MAX_ELAPSED_MS = Number.MAX_SAFE_INTEGER;
  const TRIANGLE_RADIUS = 0.14;
  const TRIANGLE_EDGE_MARGIN = 0.15;
  const LOOMWING_MIN = 0.18;
  const LOOMWING_MAX = 0.82;

  const ACTIONS = Object.freeze({
    ELAPSE: "elapse",
    MOVE: "move",
    STITCH: "stitch",
    CLOSE: "close",
    SKIP: "skip"
  });

  const PHASES = Object.freeze({
    MOVEMENT: "await-movement",
    AWAKENING: "awakening-flowers",
    STITCH: "await-stitch",
    CLOSURE: "await-closure",
    REVEAL: "reveal"
  });

  const FLOWER_IDS = Object.freeze(["flower-1", "flower-2", "flower-3"]);
  const PHASE_VALUES = new Set(Object.values(PHASES));

  const CLEARING_FLOWERS = Object.freeze([
    Object.freeze({ id: FLOWER_IDS[0], awake: false, x: 0.24, y: 0.3 }),
    Object.freeze({ id: FLOWER_IDS[1], awake: false, x: 0.78, y: 0.4 }),
    Object.freeze({ id: FLOWER_IDS[2], awake: false, x: 0.34, y: 0.78 })
  ]);
  const STATE_KEYS = Object.freeze([
    "version",
    "phase",
    "reducedMotion",
    "loomwing",
    "flowers",
    "awakeningOrder",
    "awakeningCount",
    "awakeningMs",
    "thread",
    "closureFailures",
    "layout",
    "idleMs",
    "assist",
    "outcome",
    "presentation"
  ]);

  function deepFreeze(value) {
    const freezeable = value && (typeof value === "object" || typeof value === "function");
    if (!freezeable || Object.isFrozen(value)) return value;
    Object.values(value).forEach(deepFreeze);
    return Object.freeze(value);
  }

  function clamp(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, value));
  }

  function boundedCoordinate(value, fallback) {
    return Number.isFinite(value)
      ? clamp(value, LOOMWING_MIN, LOOMWING_MAX)
      : fallback;
  }

  function rounded(value) {
    return Math.round(value * 1000000) / 1000000;
  }

  function cueFor(state) {
    if (state.phase === PHASES.MOVEMENT) return "move";
    if (state.phase === PHASES.AWAKENING) return "none";
    if (state.phase === PHASES.CLOSURE) return "close-shape";
    if (state.phase === PHASES.STITCH) {
      return state.thread.length === 0 ? "begin-thread" : "touch-flower";
    }
    return "none";
  }

  function presentationFor(state) {
    const reducedMotion = state.reducedMotion;
    let completionReveal = "none";
    if (state.outcome) {
      if (reducedMotion) {
        completionReveal = state.outcome.method === "played"
          ? "steady-glow-crossfade"
          : "crossfade";
      } else {
        completionReveal = state.outcome.method === "played"
          ? "light-burst-pullback"
          : "pullback";
      }
    }

    return {
      reducedMotion,
      cue: cueFor(state),
      cueStrength: state.phase === PHASES.REVEAL || state.phase === PHASES.AWAKENING
        ? "none"
        : state.assist,
      cueMotion: reducedMotion
        ? "steady"
        : state.assist === "strong" ? "expanding-ring" : "drift",
      flowerReveal: reducedMotion ? "crossfade" : "staggered",
      completionReveal
    };
  }

  function finalize(state) {
    return deepFreeze({
      ...state,
      presentation: presentationFor(state)
    });
  }

  function createInitialState(options = {}) {
    return finalize({
      version: STATE_VERSION,
      phase: PHASES.MOVEMENT,
      reducedMotion: options.reducedMotion === true,
      loomwing: { x: 0.5, y: 0.58 },
      flowers: CLEARING_FLOWERS.map((flower) => ({ ...flower })),
      awakeningOrder: FLOWER_IDS,
      awakeningCount: 0,
      awakeningMs: 0,
      thread: [],
      closureFailures: 0,
      layout: "clearing",
      idleMs: 0,
      assist: "soft",
      outcome: null
    });
  }

  function elapsed(state, action) {
    if (state.phase === PHASES.REVEAL
      || !Number.isFinite(action.deltaMs)
      || action.deltaMs <= 0) return state;

    const deltaMs = Math.floor(action.deltaMs);
    if (deltaMs < 1) return state;
    if (state.phase === PHASES.AWAKENING) {
      const awakeningMs = Math.min(MAX_ELAPSED_MS, state.awakeningMs + deltaMs);
      const awakeningCount = Math.min(
        FLOWER_IDS.length,
        1 + Math.floor(awakeningMs / FLOWER_AWAKEN_INTERVAL_MS)
      );
      return finalize({
        ...state,
        phase: awakeningCount === FLOWER_IDS.length ? PHASES.STITCH : PHASES.AWAKENING,
        flowers: state.flowers.map((flower, index) => ({
          ...flower,
          awake: index < awakeningCount
        })),
        awakeningCount,
        awakeningMs: awakeningCount === FLOWER_IDS.length ? 0 : awakeningMs,
        idleMs: 0,
        assist: "soft"
      });
    }
    const idleMs = Math.min(MAX_ELAPSED_MS, state.idleMs + deltaMs);
    const assist = idleMs >= ASSIST_DELAY_MS ? "strong" : "soft";
    if (idleMs === state.idleMs && assist === state.assist) return state;
    return finalize({ ...state, idleMs, assist });
  }

  function moved(state, action) {
    if (state.phase === PHASES.REVEAL) return state;
    if (!Number.isFinite(action.x) || !Number.isFinite(action.y)) return state;

    const requestedLoomwing = {
      x: boundedCoordinate(action.x, state.loomwing.x),
      y: boundedCoordinate(action.y, state.loomwing.y)
    };
    const loomwing = state.layout === "easy-triangle"
      ? safeTriangleCenter(requestedLoomwing)
      : requestedLoomwing;
    const changed = loomwing.x !== state.loomwing.x || loomwing.y !== state.loomwing.y;
    if (!changed) return state;

    if (state.phase !== PHASES.MOVEMENT) {
      return finalize({
        ...state,
        loomwing,
        flowers: state.layout === "easy-triangle"
          ? easyTriangle(loomwing)
          : state.flowers
      });
    }

    return finalize({
      ...state,
      phase: PHASES.AWAKENING,
      loomwing,
      flowers: state.flowers.map((flower, index) => ({ ...flower, awake: index === 0 })),
      awakeningCount: 1,
      awakeningMs: 0,
      idleMs: 0,
      assist: "soft"
    });
  }

  function stitched(state, action) {
    if (state.phase !== PHASES.STITCH
      || !FLOWER_IDS.includes(action.flowerId)
      || state.thread.includes(action.flowerId)) return state;

    const thread = [...state.thread, action.flowerId];
    return finalize({
      ...state,
      phase: thread.length === FLOWER_IDS.length ? PHASES.CLOSURE : PHASES.STITCH,
      thread,
      idleMs: 0,
      assist: "soft"
    });
  }

  function safeTriangleCenter(loomwing) {
    const horizontal = TRIANGLE_RADIUS * Math.sqrt(3) / 2;
    return {
      x: rounded(clamp(
        loomwing.x,
        TRIANGLE_EDGE_MARGIN + horizontal,
        1 - TRIANGLE_EDGE_MARGIN - horizontal
      )),
      y: rounded(clamp(
        loomwing.y,
        TRIANGLE_EDGE_MARGIN + TRIANGLE_RADIUS,
        1 - TRIANGLE_EDGE_MARGIN - TRIANGLE_RADIUS / 2
      ))
    };
  }

  function easyTriangle(loomwing) {
    const horizontal = TRIANGLE_RADIUS * Math.sqrt(3) / 2;
    const lowerY = loomwing.y + TRIANGLE_RADIUS / 2;
    return [
      {
        id: FLOWER_IDS[0],
        awake: true,
        x: rounded(loomwing.x),
        y: rounded(loomwing.y - TRIANGLE_RADIUS)
      },
      {
        id: FLOWER_IDS[1],
        awake: true,
        x: rounded(loomwing.x - horizontal),
        y: rounded(lowerY)
      },
      {
        id: FLOWER_IDS[2],
        awake: true,
        x: rounded(loomwing.x + horizontal),
        y: rounded(lowerY)
      }
    ];
  }

  function completed(state, method) {
    return finalize({
      ...state,
      phase: PHASES.REVEAL,
      idleMs: 0,
      assist: "soft",
      outcome: {
        kind: "onboarding-complete",
        method
      }
    });
  }

  function isPoint(value, minimum = 0, maximum = 1) {
    return Boolean(value
      && typeof value === "object"
      && Number.isFinite(value.x)
      && Number.isFinite(value.y)
      && value.x >= minimum
      && value.x <= maximum
      && value.y >= minimum
      && value.y <= maximum);
  }

  function hasExactStringValues(actual, expected) {
    return Array.isArray(actual)
      && actual.length === expected.length
      && actual.every((value, index) => value === expected[index]);
  }

  function hasExactKeys(value, expected) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    const actual = Object.keys(value).sort();
    const wanted = [...expected].sort();
    return actual.length === wanted.length
      && actual.every((key, index) => key === wanted[index]);
  }

  function flowersMatchGeometry(state) {
    const geometry = state.layout === "easy-triangle"
      ? easyTriangle(state.loomwing)
      : CLEARING_FLOWERS;
    return state.flowers.every((flower, index) => (
      flower.id === geometry[index].id
      && flower.x === geometry[index].x
      && flower.y === geometry[index].y
    ));
  }

  function hasExpectedPresentation(state) {
    if (!state.presentation || typeof state.presentation !== "object") return false;
    const expected = presentationFor(state);
    const keys = Object.keys(expected);
    return Object.keys(state.presentation).length === keys.length
      && keys.every((key) => state.presentation[key] === expected[key]);
  }

  function isValidState(state) {
    try {
      if (!state
        || typeof state !== "object"
        || Array.isArray(state)
        || !hasExactKeys(state, STATE_KEYS)
        || state.version !== STATE_VERSION
        || !PHASE_VALUES.has(state.phase)
        || typeof state.reducedMotion !== "boolean"
        || !isPoint(state.loomwing, LOOMWING_MIN, LOOMWING_MAX)
        || !Array.isArray(state.flowers)
        || state.flowers.length !== FLOWER_IDS.length
        || !hasExactStringValues(state.awakeningOrder, FLOWER_IDS)
        || !Number.isSafeInteger(state.awakeningCount)
        || state.awakeningCount < 0
        || state.awakeningCount > FLOWER_IDS.length
        || !Number.isSafeInteger(state.awakeningMs)
        || state.awakeningMs < 0
        || !Array.isArray(state.thread)
        || new Set(state.thread).size !== state.thread.length
        || !state.thread.every((flowerId) => FLOWER_IDS.includes(flowerId))
        || !Number.isSafeInteger(state.closureFailures)
        || state.closureFailures < 0
        || state.closureFailures > 3
        || !["clearing", "easy-triangle"].includes(state.layout)
        || !Number.isSafeInteger(state.idleMs)
        || state.idleMs < 0
        || !["soft", "strong"].includes(state.assist)) return false;

      if (state.flowers.some((flower, index) => (
        !flower
        || typeof flower !== "object"
        || flower.id !== FLOWER_IDS[index]
        || typeof flower.awake !== "boolean"
        || !isPoint(flower)
      ))) return false;

      if (!flowersMatchGeometry(state)) return false;

      const expectedAssist = state.idleMs >= ASSIST_DELAY_MS ? "strong" : "soft";
      if (state.phase !== PHASES.AWAKENING && state.assist !== expectedAssist) return false;
      if (state.phase === PHASES.AWAKENING && (state.idleMs !== 0 || state.assist !== "soft")) {
        return false;
      }

      const awakePatternMatches = state.flowers.every(
        (flower, index) => flower.awake === (index < state.awakeningCount)
      );
      if (!awakePatternMatches) return false;
      if (state.layout === "clearing" && state.closureFailures === 3) return false;

      if (state.phase === PHASES.MOVEMENT
        && (state.loomwing.x !== 0.5
          || state.loomwing.y !== 0.58
          || state.layout !== "clearing"
          || state.closureFailures !== 0
          || state.awakeningCount !== 0
          || state.awakeningMs !== 0
          || state.thread.length !== 0)) {
        return false;
      }
      if (state.phase === PHASES.AWAKENING
        && (state.awakeningCount < 1
          || state.awakeningCount >= FLOWER_IDS.length
          || state.layout !== "clearing"
          || state.closureFailures !== 0
          || state.awakeningCount !== 1 + Math.floor(state.awakeningMs / FLOWER_AWAKEN_INTERVAL_MS)
          || state.awakeningMs >= FLOWER_AWAKEN_INTERVAL_MS * 2
          || state.thread.length !== 0)) return false;
      if (state.phase === PHASES.STITCH
        && (state.awakeningCount !== FLOWER_IDS.length
          || state.awakeningMs !== 0
          || (state.layout === "clearing" && state.closureFailures !== 0)
          || state.thread.length >= FLOWER_IDS.length)) return false;
      if (state.phase === PHASES.CLOSURE
        && (state.awakeningCount !== FLOWER_IDS.length
          || state.awakeningMs !== 0
          || state.thread.length !== FLOWER_IDS.length)) return false;
      if (state.layout === "easy-triangle"
        && (state.closureFailures !== 3 || state.awakeningCount !== FLOWER_IDS.length)) return false;
      if (state.layout === "easy-triangle"
        && state.phase === PHASES.STITCH
        && state.thread.length === 0
        && (state.idleMs < ASSIST_DELAY_MS || state.assist !== "strong")) return false;

      if (state.phase === PHASES.REVEAL) {
        if (!state.outcome
          || typeof state.outcome !== "object"
          || Object.keys(state.outcome).length !== 2
          || state.outcome.kind !== "onboarding-complete"
          || !["played", "skipped"].includes(state.outcome.method)
          || state.idleMs !== 0
          || state.assist !== "soft") return false;
        if (state.outcome.method === "played"
          && (state.thread.length !== FLOWER_IDS.length
            || state.awakeningCount !== FLOWER_IDS.length
            || state.awakeningMs !== 0
            || state.flowers.some((flower) => !flower.awake))) return false;
        if (state.outcome.method === "skipped") {
          if (state.awakeningCount === 0
            && (state.loomwing.x !== 0.5
              || state.loomwing.y !== 0.58
              || state.layout !== "clearing"
              || state.closureFailures !== 0
              || state.awakeningMs !== 0
              || state.thread.length !== 0)) return false;
          if (state.awakeningCount > 0 && state.awakeningCount < FLOWER_IDS.length
            && (state.layout !== "clearing"
              || state.closureFailures !== 0
              || state.thread.length !== 0
              || state.awakeningCount !== 1 + Math.floor(state.awakeningMs / FLOWER_AWAKEN_INTERVAL_MS)
              || state.awakeningMs >= FLOWER_AWAKEN_INTERVAL_MS * 2)) return false;
          if (state.awakeningCount === FLOWER_IDS.length && state.awakeningMs !== 0) return false;
          if (state.layout === "clearing"
            && state.closureFailures > 0
            && state.thread.length !== FLOWER_IDS.length) return false;
        }
      } else if (state.outcome !== null) return false;

      return hasExpectedPresentation(state);
    } catch (_) {
      return false;
    }
  }

  function closed(state, action) {
    if (state.phase !== PHASES.CLOSURE) return state;
    if (!FLOWER_IDS.includes(action.flowerId)) return state;
    if (action.flowerId === state.thread[0]) return completed(state, "played");

    const closureFailures = Math.min(3, state.closureFailures + 1);
    if (closureFailures < 3) {
      return finalize({
        ...state,
        closureFailures,
        idleMs: 0,
        assist: "soft"
      });
    }

    const loomwing = safeTriangleCenter(state.loomwing);
    return finalize({
      ...state,
      phase: PHASES.STITCH,
      loomwing,
      flowers: easyTriangle(loomwing),
      awakeningCount: FLOWER_IDS.length,
      awakeningMs: 0,
      thread: [],
      closureFailures,
      layout: "easy-triangle",
      idleMs: ASSIST_DELAY_MS,
      assist: "strong"
    });
  }

  function reduce(state, action) {
    if (!isValidState(state)) {
      throw new TypeError("First Bloom reducer requires a valid state.");
    }
    if (!action || typeof action !== "object") return state;

    switch (action.type) {
      case ACTIONS.ELAPSE:
        return elapsed(state, action);
      case ACTIONS.MOVE:
        return moved(state, action);
      case ACTIONS.STITCH:
        return stitched(state, action);
      case ACTIONS.CLOSE:
        return closed(state, action);
      case ACTIONS.SKIP:
        return state.phase === PHASES.REVEAL ? state : completed(state, "skipped");
      default:
        return state;
    }
  }

  function isComplete(state) {
    return Boolean(isValidState(state)
      && state.phase === PHASES.REVEAL
      && state.outcome
      && state.outcome.kind === "onboarding-complete"
      && (state.outcome.method === "played" || state.outcome.method === "skipped"));
  }

  return deepFreeze({
    STATE_VERSION,
    ASSIST_DELAY_MS,
    FLOWER_AWAKEN_INTERVAL_MS,
    ACTIONS,
    PHASES,
    FLOWER_IDS,
    createInitialState,
    reduce,
    isValidState,
    isComplete
  });
});
