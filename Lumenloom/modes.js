(function initializeLumenloomModes(root, factory) {
  "use strict";

  const modes = factory();
  if (typeof module === "object" && module.exports) module.exports = modes;
  else root.LumenloomModes = modes;
})(typeof globalThis !== "undefined" ? globalThis : this, function createLumenloomModes() {
  "use strict";

  function deepFreeze(value) {
    const freezeable = value && (typeof value === "object" || typeof value === "function");
    if (!freezeable || Object.isFrozen(value)) return value;
    Object.values(value).forEach(deepFreeze);
    return Object.freeze(value);
  }

  const MODE_IDS = Object.freeze([
    "standard",
    "petalRush",
    "shiftingConstellation",
    "hollowRush",
  ]);

  const MODES = deepFreeze({
    standard: {
      id: "standard",
      name: "Night Garden",
      bloom: "standard",
      kind: "adventure",
      unlock: "always",
      durationMs: null,
      flowerCounts: [9, 13, 15, 17, 19],
      phaseTargets: [1, 7, 12, 18, 3],
      startPetals: 3,
      startLumen: 100,
      frayWindowMs: 2500,
      goldenFiberFrayWindowMs: 2900,
    },
    petalRush: {
      id: "petalRush",
      name: "Petal Rush",
      bloom: "quick",
      kind: "timed-remix",
      unlock: "firstBloom",
      durationMs: 90000,
      flowerCount: 11,
      startPetals: 3,
      startLumen: 100,
      frayWindowMs: 3200,
      loop: {
        minimumVertices: 3,
        maximumVertices: 8,
        maximumShadows: 3,
        maximumLoops: 60,
        chainWindowMs: 6000,
      },
      threat: {
        replacementDelayMs: 2500,
        ambientExtras: false,
        stages: [
          { atMs: 0, minimum: { drifter: 2, seeker: 0, rusher: 0 } },
          { atMs: 30000, minimum: { drifter: 2, seeker: 1, rusher: 0 } },
          { atMs: 60000, minimum: { drifter: 2, seeker: 1, rusher: 1 } },
        ],
      },
      scoring: {
        loops: 200,
        totalVertices: 40,
        shadows: 125,
        cleanLoops: 100,
        chainLinks: 150,
      },
    },
    shiftingConstellation: {
      id: "shiftingConstellation",
      name: "Shifting Constellation",
      bloom: "wild",
      kind: "timed-remix",
      unlock: "silver",
      durationMs: 120000,
      flowerCount: 13,
      startPetals: 3,
      startLumen: 100,
      frayWindowMs: 2500,
      targetVertices: [3, 4, 5],
      targetWindowMs: 18000,
      loop: {
        minimumVertices: 3,
        maximumVertices: 8,
        maximumShadows: 3,
        maximumLoops: 80,
        chainWindowMs: 6000,
      },
      threat: {
        replacementDelayMs: 2500,
        ambientExtras: false,
        stages: [
          { atMs: 0, minimum: { drifter: 3, seeker: 0, rusher: 0 } },
          { atMs: 30000, minimum: { drifter: 3, seeker: 2, rusher: 0 } },
          { atMs: 75000, minimum: { drifter: 3, seeker: 2, rusher: 1 } },
        ],
      },
      scoring: {
        loops: 150,
        totalVertices: 30,
        shadows: 100,
        cleanLoops: 75,
        chainLinks: 100,
        targetMatches: 900,
      },
    },
    hollowRush: {
      id: "hollowRush",
      name: "Hollow Rush",
      bloom: "crown",
      kind: "guardian-remix",
      unlock: "gold",
      durationMs: 150000,
      flowerCount: 19,
      startPetals: 3,
      startLumen: 100,
      frayWindowMs: 2500,
      requiredSeals: 3,
      loop: {
        minimumVertices: 3,
        maximumVertices: 8,
        maximumShadows: 3,
        maximumLoops: 75,
        chainWindowMs: 6000,
      },
      threat: {
        replacementDelayMs: 2500,
        ambientExtras: false,
        stages: [
          { atMs: 0, minimum: { drifter: 3, seeker: 2, rusher: 0 } },
        ],
        sealRelease: {
          afterSeals: [1, 2],
          bonus: { drifter: 1, seeker: 1, rusher: 0 },
          replaces: false,
          nonGuardianCap: 9,
        },
      },
      scoring: {
        loops: 200,
        totalVertices: 40,
        shadows: 125,
        cleanLoops: 100,
        chainLinks: 150,
        seals: 650,
        victory: {
          flat: 1500,
          perRemainingSecond: 25,
          perRemainingPetal: 500,
        },
      },
    },
  });

  const MAX_SCORES = deepFreeze({
    petalRush: 68550,
    shiftingConstellation: 141100,
    hollowRush: 94425,
  });

  const PROOF_KEYS = deepFreeze({
    standard: ["loops", "shadows", "phase"],
    petalRush: [
      "loops",
      "totalVertices",
      "shadows",
      "cleanLoops",
      "chainLinks",
      "elapsedMs",
      "petals",
    ],
    shiftingConstellation: [
      "loops",
      "totalVertices",
      "shadows",
      "cleanLoops",
      "chainLinks",
      "elapsedMs",
      "petals",
      "targetMatches",
    ],
    hollowRush: [
      "loops",
      "totalVertices",
      "shadows",
      "cleanLoops",
      "chainLinks",
      "elapsedMs",
      "petals",
      "seals",
      "remainingMs",
      "baseScore",
    ],
  });

  function getMode(modeId) {
    return typeof modeId === "string"
      && Object.prototype.hasOwnProperty.call(MODES, modeId)
      ? MODES[modeId]
      : null;
  }

  function createProof(modeId) {
    if (!getMode(modeId)) return null;
    if (modeId === "standard") {
      return deepFreeze({ loops: 0, shadows: 0, phase: 0 });
    }

    const proof = {
      loops: 0,
      totalVertices: 0,
      shadows: 0,
      cleanLoops: 0,
      chainLinks: 0,
      elapsedMs: 0,
      petals: MODES[modeId].startPetals,
    };
    if (modeId === "shiftingConstellation") proof.targetMatches = 0;
    if (modeId === "hollowRush") {
      proof.seals = 0;
      proof.remainingMs = MODES.hollowRush.durationMs;
      proof.baseScore = 0;
    }
    return deepFreeze(proof);
  }

  function hasExactKeys(value, expectedKeys) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    const actualKeys = Object.keys(value).sort();
    const requiredKeys = [...expectedKeys].sort();
    if (actualKeys.length !== requiredKeys.length) return false;
    return actualKeys.every((key, index) => key === requiredKeys[index]);
  }

  function areSafeCounters(stats, keys) {
    return keys.every((key) => Number.isSafeInteger(stats[key]) && stats[key] >= 0);
  }

  function validLoopProof(mode, stats) {
    if (stats.loops > mode.loop.maximumLoops) return false;
    if (stats.loops === 0) {
      if (stats.totalVertices !== 0) return false;
    } else if (
      stats.totalVertices < mode.loop.minimumVertices * stats.loops
      || stats.totalVertices > mode.loop.maximumVertices * stats.loops
    ) {
      return false;
    }
    if (stats.shadows > mode.loop.maximumShadows * stats.loops) return false;
    if (stats.cleanLoops > stats.loops) return false;
    if (stats.chainLinks > Math.max(0, stats.loops - 1)) return false;
    if (stats.elapsedMs > mode.durationMs) return false;
    if (stats.petals > mode.startPetals) return false;
    return true;
  }

  function weightedScore(scoring, stats) {
    return Object.entries(scoring).reduce((total, [key, weight]) => {
      if (typeof weight !== "number") return total;
      return total + weight * stats[key];
    }, 0);
  }

  function baseRemixScore(modeId, stats) {
    return weightedScore(MODES[modeId].scoring, stats);
  }

  function validTimedOutcome(mode, stats, victory) {
    if (victory) return stats.elapsedMs === mode.durationMs && stats.petals >= 1;
    return stats.elapsedMs < mode.durationMs && stats.petals === 0;
  }

  function validateStats(modeId, stats, victory) {
    const mode = getMode(modeId);
    if (!mode || typeof victory !== "boolean") return false;
    const keys = PROOF_KEYS[modeId];
    if (!hasExactKeys(stats, keys) || !areSafeCounters(stats, keys)) return false;

    if (modeId === "standard") return stats.phase <= 4;
    if (!validLoopProof(mode, stats)) return false;

    if (modeId === "petalRush") return validTimedOutcome(mode, stats, victory);

    if (modeId === "shiftingConstellation") {
      return stats.targetMatches <= stats.cleanLoops
        && validTimedOutcome(mode, stats, victory);
    }

    if (stats.seals > Math.min(mode.requiredSeals, stats.loops)) return false;
    if (stats.remainingMs !== mode.durationMs - stats.elapsedMs) return false;
    if (stats.baseScore !== baseRemixScore(modeId, stats)) return false;
    if (victory) {
      return stats.seals === mode.requiredSeals
        && stats.petals >= 1
        && stats.remainingMs > 0;
    }
    return stats.seals < mode.requiredSeals
      && (stats.petals === 0 || stats.remainingMs === 0);
  }

  function recomputeResult(modeId, stats, victory) {
    if (modeId === "standard" || !validateStats(modeId, stats, victory)) return null;
    const baseScore = baseRemixScore(modeId, stats);
    if (modeId !== "hollowRush" || !victory) return baseScore;

    const victoryScoring = MODES.hollowRush.scoring.victory;
    return baseScore
      + victoryScoring.flat
      + Math.floor(stats.remainingMs / 1000) * victoryScoring.perRemainingSecond
      + stats.petals * victoryScoring.perRemainingPetal;
  }

  return deepFreeze({
    MODE_IDS,
    MODES,
    MAX_SCORES,
    getMode,
    createProof,
    validateStats,
    recomputeResult,
  });
});
