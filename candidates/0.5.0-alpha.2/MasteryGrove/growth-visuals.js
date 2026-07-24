(function initializeMasteryGroveGrowthVisuals(root, factory) {
  "use strict";

  const progression = typeof module === "object" && module.exports
    ? require("./progression.js")
    : root.MasteryGroveProgression;
  const api = factory(progression);
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.MasteryGroveGrowthVisuals = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createMasteryGroveGrowthVisuals(progression) {
  "use strict";

  const MODEL_VERSION = 1;
  const TRANSFER_VERSION = 1;
  const TRANSFER_MAX_DURATION_MS = 2500;
  const REDUCED_MOTION_TRANSFER_MS = 180;
  const MODEL_CACHE_LIMIT = 128;
  const SLEEPING_POSITION_MIN = 6;
  const SLEEPING_POSITION_MAX = 10;

  function deepFreeze(value) {
    const freezeable = value && (typeof value === "object" || typeof value === "function");
    if (!freezeable || Object.isFrozen(value)) return value;
    Object.values(value).forEach(deepFreeze);
    return Object.freeze(value);
  }

  const RENDER_CAPS = deepFreeze({
    desktop: {
      branchSegments: 160,
      foliage: 120,
      treeParticles: 32,
      scoreMotes: 10,
      everbloomVisualTiers: 6
    },
    phone: {
      branchSegments: 96,
      foliage: 64,
      treeParticles: 16,
      scoreMotes: 6,
      everbloomVisualTiers: 6
    }
  });

  const TRANSFER_ACTIONS = Object.freeze({
    TICK: "tick",
    SKIP: "skip"
  });

  const TRANSFER_SKIP_REASONS = Object.freeze([
    "retry",
    "play",
    "tree-selection"
  ]);

  const TREE_PRESENTATIONS = deepFreeze({
    lumenloom: {
      speciesId: "lantern-willow",
      silhouette: "lantern-boughs",
      detail: "continuous",
      palette: ["#ffd773", "#a7ffda", "#9a82ff"],
      particleVocabulary: "lantern-pollen",
      branchBase: 0.06,
      branchSpan: 0.76,
      foliageBase: 0.04,
      foliageSpan: 0.72,
      bloomBase: 0.08,
      bloomSpan: 0.34,
      auraBase: 0.08,
      auraSpan: 0.78,
      lightBase: 0.16,
      lightSpan: 0.82,
      particleBase: 0.05,
      particleSpan: 0.56,
      reachBase: 0.16,
      reachSpan: 0.84,
      sway: 0.035,
      rhythmBase: 0.34,
      rhythmSpan: 0.5
    },
    bloomfold: {
      speciesId: "recursive-orchid",
      silhouette: "spiral-petals",
      detail: "stage",
      palette: ["#82f4ee", "#d5fff9", "#8e70ff"],
      particleVocabulary: "fractal-spores",
      branchBase: 0.04,
      branchSpan: 0.54,
      foliageBase: 0.04,
      foliageSpan: 0.68,
      bloomBase: 0.2,
      bloomSpan: 0.42,
      auraBase: 0.1,
      auraSpan: 0.76,
      lightBase: 0.18,
      lightSpan: 0.72,
      particleBase: 0.04,
      particleSpan: 0.48,
      reachBase: 0.18,
      reachSpan: 0.7,
      sway: 0.018,
      rhythmBase: 0.28,
      rhythmSpan: 0.42
    },
    ripplewake: {
      speciesId: "echo-alder",
      silhouette: "ripple-canopy",
      detail: "stage",
      palette: ["#ff9b85", "#9df5e4", "#5d8dff"],
      particleVocabulary: "water-rings",
      branchBase: 0.08,
      branchSpan: 0.66,
      foliageBase: 0.08,
      foliageSpan: 0.76,
      bloomBase: 0.04,
      bloomSpan: 0.22,
      auraBase: 0.08,
      auraSpan: 0.68,
      lightBase: 0.15,
      lightSpan: 0.66,
      particleBase: 0.04,
      particleSpan: 0.44,
      reachBase: 0.2,
      reachSpan: 0.8,
      sway: 0.026,
      rhythmBase: 0.2,
      rhythmSpan: 0.34
    },
    prismbind: {
      speciesId: "concord-banyan",
      silhouette: "root-arches",
      detail: "stage",
      palette: ["#d7c6ff", "#ffdd8f", "#72e8d2"],
      particleVocabulary: "prism-shards",
      branchBase: 0.1,
      branchSpan: 0.78,
      foliageBase: 0.04,
      foliageSpan: 0.62,
      bloomBase: 0.06,
      bloomSpan: 0.28,
      auraBase: 0.12,
      auraSpan: 0.84,
      lightBase: 0.22,
      lightSpan: 0.76,
      particleBase: 0.03,
      particleSpan: 0.58,
      reachBase: 0.22,
      reachSpan: 0.78,
      sway: 0.012,
      rhythmBase: 0.18,
      rhythmSpan: 0.3
    },
    mothchorus: {
      speciesId: "choir-linden",
      silhouette: "choir-crown",
      detail: "stage",
      palette: ["#80e5c4", "#f6d58f", "#ba8cff"],
      particleVocabulary: "choir-motes",
      branchBase: 0.07,
      branchSpan: 0.7,
      foliageBase: 0.07,
      foliageSpan: 0.75,
      bloomBase: 0.1,
      bloomSpan: 0.32,
      auraBase: 0.1,
      auraSpan: 0.74,
      lightBase: 0.2,
      lightSpan: 0.72,
      particleBase: 0.05,
      particleSpan: 0.52,
      reachBase: 0.2,
      reachSpan: 0.76,
      sway: 0.023,
      rhythmBase: 0.26,
      rhythmSpan: 0.46
    }
  });

  if (!progression
    || !Array.isArray(progression.ALL_GAME_IDS)
    || typeof progression.growthFor !== "function"
    || !progression.GAME_DEFINITIONS
    || !Array.isArray(progression.GROWTH_STAGES)
    || progression.ALL_GAME_IDS.some((gameId) => {
      const definition = progression.GAME_DEFINITIONS[gameId];
      return !TREE_PRESENTATIONS[gameId]
        || !definition
        || !Array.isArray(definition.thresholds)
        || definition.thresholds.length !== progression.GROWTH_STAGES.length;
    })) {
    throw new Error("Canonical Mastery Grove progression must load before growth visuals.");
  }

  const modelCache = new Map();
  const sleepingCache = new Map();
  const DEFAULT_RENDER_OPTIONS = Object.freeze({
    deviceClass: "desktop",
    reducedMotion: false
  });

  function hasOnlyKeys(value, allowedKeys) {
    return Object.keys(value).every((key) => allowedKeys.includes(key));
  }

  function hasExactKeys(value, expectedKeys) {
    const keys = Object.keys(value);
    return keys.length === expectedKeys.length
      && expectedKeys.every((key) => Object.prototype.hasOwnProperty.call(value, key));
  }

  function isCounter(value) {
    return Number.isSafeInteger(value) && value >= 0;
  }

  function isTimestamp(value) {
    return Number.isSafeInteger(value) && value >= 0;
  }

  function clampUnit(value) {
    return Math.max(0, Math.min(1, value));
  }

  function rounded(value, digits = 4) {
    const scale = 10 ** digits;
    return Math.round(value * scale) / scale;
  }

  function parseRenderOptions(options) {
    if (options === undefined) return DEFAULT_RENDER_OPTIONS;
    if (!options
      || typeof options !== "object"
      || Array.isArray(options)
      || !hasOnlyKeys(options, ["deviceClass", "reducedMotion"])) return null;
    const deviceClass = Object.prototype.hasOwnProperty.call(options, "deviceClass")
      ? options.deviceClass
      : DEFAULT_RENDER_OPTIONS.deviceClass;
    const reducedMotion = Object.prototype.hasOwnProperty.call(options, "reducedMotion")
      ? options.reducedMotion
      : DEFAULT_RENDER_OPTIONS.reducedMotion;
    if (!Object.prototype.hasOwnProperty.call(RENDER_CAPS, deviceClass)
      || typeof reducedMotion !== "boolean") return null;
    return { deviceClass, reducedMotion };
  }

  function cacheModel(cache, key, model) {
    if (cache.has(key)) cache.delete(key);
    cache.set(key, model);
    while (cache.size > MODEL_CACHE_LIMIT) {
      cache.delete(cache.keys().next().value);
    }
    return model;
  }

  function readCachedModel(cache, key) {
    const model = cache.get(key);
    if (!model) return null;
    cache.delete(key);
    cache.set(key, model);
    return model;
  }

  function stageFor(gameId, totalScore, detail) {
    const growth = progression.growthFor(gameId, totalScore);
    if (!growth) return null;
    const thresholds = progression.GAME_DEFINITIONS[gameId].thresholds;
    const lastStage = thresholds.length - 1;
    let withinProgress = null;
    if (detail === "continuous") {
      if (growth.level === lastStage) {
        withinProgress = 1;
      } else {
        const lower = thresholds[growth.level];
        const upper = thresholds[growth.level + 1];
        withinProgress = rounded((totalScore - lower) / (upper - lower), 6);
      }
    }
    return {
      index: growth.level,
      name: growth.name,
      withinProgress
    };
  }

  function everbloomParts(gameId, totalScore) {
    const definition = progression.GAME_DEFINITIONS[gameId];
    if (!definition || !isCounter(totalScore)) return null;
    const fullBloomThreshold = definition.thresholds.at(-1);
    const rings = totalScore < fullBloomThreshold
      ? 0
      : 1 + Math.floor((totalScore - fullBloomThreshold) / fullBloomThreshold);
    return {
      fullBloomThreshold,
      rings,
      renderTier: Math.min(RENDER_CAPS.desktop.everbloomVisualTiers, rings)
    };
  }

  function deriveEverbloom(gameId, totalScore) {
    const parts = everbloomParts(gameId, totalScore);
    return parts ? deepFreeze(parts) : null;
  }

  function deriveTreeModel(gameId, totalScore, options) {
    const presentation = TREE_PRESENTATIONS[gameId];
    const renderOptions = parseRenderOptions(options);
    if (!presentation || !isCounter(totalScore) || !renderOptions) return null;

    const stage = stageFor(gameId, totalScore, presentation.detail);
    const everbloom = everbloomParts(gameId, totalScore);
    if (!stage || !everbloom) return null;

    const continuousBasis = presentation.detail === "continuous" && stage.index < 5
      ? `score:${totalScore}`
      : `stage:${stage.index}:rings:${everbloom.rings}`;
    const cacheKey = [
      gameId,
      continuousBasis,
      renderOptions.deviceClass,
      renderOptions.reducedMotion ? "reduce" : "motion"
    ].join("|");
    const cached = readCachedModel(modelCache, cacheKey);
    if (cached) return cached;

    const caps = RENDER_CAPS[renderOptions.deviceClass];
    const withinProgress = stage.withinProgress === null ? 0 : stage.withinProgress;
    const maturity = clampUnit(
      (stage.index + (presentation.detail === "continuous" ? withinProgress : 0)) / 5,
    );
    const tier = everbloom.renderTier;
    const branchFraction = clampUnit(
      presentation.branchBase + presentation.branchSpan * maturity + tier * 0.018,
    );
    const foliageFraction = clampUnit(
      presentation.foliageBase + presentation.foliageSpan * maturity + tier * 0.016,
    );
    const foliageCount = Math.min(caps.foliage, Math.round(caps.foliage * foliageFraction));
    const bloomRatio = clampUnit(
      presentation.bloomBase + presentation.bloomSpan * maturity + tier * 0.012,
    );
    const flowerCount = Math.min(foliageCount, Math.round(foliageCount * bloomRatio));
    const branchSegments = Math.min(
      caps.branchSegments,
      Math.round(caps.branchSegments * branchFraction),
    );
    const particleCount = renderOptions.reducedMotion
      ? 0
      : Math.min(
        caps.treeParticles,
        Math.round(
          caps.treeParticles
          * clampUnit(presentation.particleBase + presentation.particleSpan * maturity + tier * 0.035),
        ),
      );
    const auraStrength = rounded(
      clampUnit(presentation.auraBase + presentation.auraSpan * maturity + tier * 0.025),
    );
    const lightIntensity = rounded(
      clampUnit(presentation.lightBase + presentation.lightSpan * maturity + tier * 0.018),
    );

    const model = deepFreeze({
      version: MODEL_VERSION,
      kind: "tree",
      gameId,
      speciesId: presentation.speciesId,
      silhouette: presentation.silhouette,
      detail: presentation.detail,
      palette: presentation.palette,
      particleVocabulary: presentation.particleVocabulary,
      stage,
      everbloom,
      geometry: {
        branchReach: rounded(
          clampUnit(presentation.reachBase + presentation.reachSpan * maturity + tier * 0.012),
        ),
        branchSegments,
        leafCount: foliageCount - flowerCount,
        flowerCount,
        auraStrength,
        auraLayers: Math.min(6, Math.max(1, 1 + stage.index + Math.floor(tier / 2))),
        lightIntensity,
        particleCount
      },
      motion: {
        reduced: renderOptions.reducedMotion,
        branchSway: renderOptions.reducedMotion
          ? 0
          : rounded(presentation.sway * (0.7 + maturity * 0.3)),
        auraPulse: renderOptions.reducedMotion
          ? 0
          : rounded(0.08 + auraStrength * 0.16),
        lightRhythmHz: renderOptions.reducedMotion
          ? 0
          : rounded(presentation.rhythmBase + presentation.rhythmSpan * maturity),
        transition: renderOptions.reducedMotion ? "crossfade" : "growth"
      },
      render: {
        deviceClass: renderOptions.deviceClass,
        selectedTreeOnly: true,
        caps,
        scoreMoteCapacity: caps.scoreMotes
      }
    });
    return cacheModel(modelCache, cacheKey, model);
  }

  function deriveSleepingSeed(position, options) {
    const renderOptions = parseRenderOptions(options);
    if (!Number.isSafeInteger(position)
      || position < SLEEPING_POSITION_MIN
      || position > SLEEPING_POSITION_MAX
      || !renderOptions) return null;
    const cacheKey = [
      position,
      renderOptions.deviceClass,
      renderOptions.reducedMotion ? "reduce" : "motion"
    ].join("|");
    const cached = readCachedModel(sleepingCache, cacheKey);
    if (cached) return cached;
    const caps = RENDER_CAPS[renderOptions.deviceClass];
    const model = deepFreeze({
      version: MODEL_VERSION,
      kind: "sleeping-seed",
      position,
      gameId: null,
      playable: false,
      quiet: true,
      speciesId: null,
      silhouette: "sleeping-seed",
      detail: "quiet",
      palette: ["#6f7186", "#45485b"],
      particleVocabulary: null,
      stage: {
        index: null,
        name: "SLEEPING",
        withinProgress: null
      },
      everbloom: {
        fullBloomThreshold: null,
        rings: 0,
        renderTier: 0
      },
      geometry: {
        seedScale: 0.22,
        branchReach: 0,
        branchSegments: 0,
        leafCount: 0,
        flowerCount: 0,
        auraStrength: 0.06,
        auraLayers: 1,
        lightIntensity: 0.08,
        particleCount: 0
      },
      motion: {
        reduced: renderOptions.reducedMotion,
        branchSway: 0,
        auraPulse: 0,
        lightRhythmHz: 0,
        transition: renderOptions.reducedMotion ? "crossfade" : "none"
      },
      render: {
        deviceClass: renderOptions.deviceClass,
        selectedTreeOnly: true,
        caps,
        scoreMoteCapacity: caps.scoreMotes
      }
    });
    return cacheModel(sleepingCache, cacheKey, model);
  }

  function durationForScoreDelta(delta, reducedMotion) {
    if (!isCounter(delta) || typeof reducedMotion !== "boolean") return null;
    if (delta === 0) return 0;
    if (reducedMotion) return REDUCED_MOTION_TRANSFER_MS;
    return Math.min(
      TRANSFER_MAX_DURATION_MS,
      900 + Math.round(Math.log10(delta + 1) * 400),
    );
  }

  const TRANSFER_KEYS = Object.freeze([
    "version",
    "gameId",
    "fromTotal",
    "toTotal",
    "delta",
    "startedAtMs",
    "durationMs",
    "deviceClass",
    "reducedMotion",
    "persistenceConfirmed",
    "status",
    "progress",
    "displayTotal",
    "moteCount",
    "crossfadeProgress",
    "skipped",
    "skipReason"
  ]);

  const TRANSFER_INPUT_KEYS = Object.freeze([
    "gameId",
    "fromTotal",
    "toTotal",
    "startedAtMs",
    "persisted",
    "deviceClass",
    "reducedMotion"
  ]);

  function makeCompleteTransfer(state, skipped, skipReason) {
    return deepFreeze({
      ...state,
      status: "complete",
      progress: 1,
      displayTotal: state.toTotal,
      moteCount: 0,
      crossfadeProgress: 1,
      skipped,
      skipReason
    });
  }

  function createScoreTransfer(input) {
    if (!input
      || typeof input !== "object"
      || Array.isArray(input)
      || !hasOnlyKeys(input, TRANSFER_INPUT_KEYS)
      || !Object.prototype.hasOwnProperty.call(input, "gameId")
      || !Object.prototype.hasOwnProperty.call(input, "fromTotal")
      || !Object.prototype.hasOwnProperty.call(input, "toTotal")
      || !Object.prototype.hasOwnProperty.call(input, "startedAtMs")
      || input.persisted !== true
      || !TREE_PRESENTATIONS[input.gameId]
      || !isCounter(input.fromTotal)
      || !isCounter(input.toTotal)
      || input.toTotal < input.fromTotal
      || !isTimestamp(input.startedAtMs)) return null;

    const renderOptions = parseRenderOptions({
      ...(Object.prototype.hasOwnProperty.call(input, "deviceClass")
        ? { deviceClass: input.deviceClass }
        : {}),
      ...(Object.prototype.hasOwnProperty.call(input, "reducedMotion")
        ? { reducedMotion: input.reducedMotion }
        : {})
    });
    if (!renderOptions) return null;

    const delta = input.toTotal - input.fromTotal;
    const durationMs = durationForScoreDelta(delta, renderOptions.reducedMotion);
    let state = deepFreeze({
      version: TRANSFER_VERSION,
      gameId: input.gameId,
      fromTotal: input.fromTotal,
      toTotal: input.toTotal,
      delta,
      startedAtMs: input.startedAtMs,
      durationMs,
      deviceClass: renderOptions.deviceClass,
      reducedMotion: renderOptions.reducedMotion,
      persistenceConfirmed: true,
      status: delta === 0 ? "complete" : "running",
      progress: delta === 0 ? 1 : 0,
      displayTotal: delta === 0 ? input.toTotal : input.fromTotal,
      moteCount: 0,
      crossfadeProgress: delta === 0 ? 1 : 0,
      skipped: false,
      skipReason: null
    });
    if (delta === 0) state = makeCompleteTransfer(state, false, null);
    return state;
  }

  function easeOutCubic(progress) {
    return 1 - (1 - progress) ** 3;
  }

  function expectedMoteCount(progress, deviceClass, reducedMotion) {
    if (reducedMotion || progress <= 0 || progress >= 1) return 0;
    const cap = RENDER_CAPS[deviceClass].scoreMotes;
    const triangularPulse = 1 - Math.abs(progress * 2 - 1);
    return Math.min(cap, Math.max(1, Math.ceil(cap * triangularPulse)));
  }

  function isScoreTransfer(state) {
    if (!state
      || typeof state !== "object"
      || Array.isArray(state)
      || !hasExactKeys(state, TRANSFER_KEYS)
      || state.version !== TRANSFER_VERSION
      || !TREE_PRESENTATIONS[state.gameId]
      || !isCounter(state.fromTotal)
      || !isCounter(state.toTotal)
      || state.toTotal < state.fromTotal
      || state.delta !== state.toTotal - state.fromTotal
      || !isTimestamp(state.startedAtMs)
      || !Object.prototype.hasOwnProperty.call(RENDER_CAPS, state.deviceClass)
      || typeof state.reducedMotion !== "boolean"
      || state.persistenceConfirmed !== true
      || state.durationMs !== durationForScoreDelta(state.delta, state.reducedMotion)
      || !Number.isFinite(state.progress)
      || state.progress < 0
      || state.progress > 1
      || !isCounter(state.displayTotal)
      || state.displayTotal < state.fromTotal
      || state.displayTotal > state.toTotal
      || !Number.isSafeInteger(state.moteCount)
      || state.moteCount < 0
      || state.moteCount > RENDER_CAPS[state.deviceClass].scoreMotes
      || !Number.isFinite(state.crossfadeProgress)
      || state.crossfadeProgress < 0
      || state.crossfadeProgress > 1
      || typeof state.skipped !== "boolean") return false;

    if (state.status === "complete") {
      return state.progress === 1
        && state.displayTotal === state.toTotal
        && state.moteCount === 0
        && state.crossfadeProgress === 1
        && (state.skipped
          ? TRANSFER_SKIP_REASONS.includes(state.skipReason)
          : state.skipReason === null);
    }
    if (state.status !== "running"
      || state.delta === 0
      || state.durationMs <= 0
      || state.progress >= 1
      || state.skipped
      || state.skipReason !== null) return false;

    const expectedDisplay = state.reducedMotion
      ? state.fromTotal
      : state.fromTotal + Math.floor(state.delta * easeOutCubic(state.progress));
    return state.displayTotal === expectedDisplay
      && state.moteCount === expectedMoteCount(
        state.progress,
        state.deviceClass,
        state.reducedMotion,
      )
      && state.crossfadeProgress === (state.reducedMotion ? state.progress : 0);
  }

  function reduceScoreTransfer(state, action) {
    if (!isScoreTransfer(state)) {
      throw new TypeError("Growth visuals require a valid score transfer.");
    }
    if (state.status === "complete"
      || !action
      || typeof action !== "object"
      || Array.isArray(action)) return state;

    if (action.type === TRANSFER_ACTIONS.SKIP) {
      if (!hasExactKeys(action, ["type", "reason"])
        || !TRANSFER_SKIP_REASONS.includes(action.reason)) return state;
      return makeCompleteTransfer(state, true, action.reason);
    }

    if (action.type !== TRANSFER_ACTIONS.TICK
      || !hasExactKeys(action, ["type", "nowMs"])
      || !isTimestamp(action.nowMs)) return state;

    const elapsedMs = action.nowMs - state.startedAtMs;
    if (elapsedMs <= 0) return state;
    if (elapsedMs >= state.durationMs) return makeCompleteTransfer(state, false, null);

    const progress = elapsedMs / state.durationMs;
    if (progress <= state.progress) return state;
    const displayTotal = state.reducedMotion
      ? state.fromTotal
      : state.fromTotal + Math.floor(state.delta * easeOutCubic(progress));
    return deepFreeze({
      ...state,
      progress,
      displayTotal,
      moteCount: expectedMoteCount(progress, state.deviceClass, state.reducedMotion),
      crossfadeProgress: state.reducedMotion ? progress : 0
    });
  }

  return deepFreeze({
    MODEL_VERSION,
    TRANSFER_VERSION,
    TRANSFER_MAX_DURATION_MS,
    REDUCED_MOTION_TRANSFER_MS,
    MODEL_CACHE_LIMIT,
    RENDER_CAPS,
    TREE_PRESENTATIONS,
    TRANSFER_ACTIONS,
    TRANSFER_SKIP_REASONS,
    deriveEverbloom,
    deriveTreeModel,
    deriveSleepingSeed,
    durationForScoreDelta,
    createScoreTransfer,
    isScoreTransfer,
    reduceScoreTransfer
  });
});
