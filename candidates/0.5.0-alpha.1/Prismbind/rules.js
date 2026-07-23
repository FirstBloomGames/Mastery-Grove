(function initializePrismbindRules(root, factory) {
  "use strict";

  const rules = factory();
  if (typeof module === "object" && module.exports) module.exports = rules;
  else root.PrismbindRules = rules;
})(typeof globalThis !== "undefined" ? globalThis : this, function createPrismbindRules() {
  "use strict";

  const DEFAULT_WINDOWS = Object.freeze({ perfect: 0.12, clean: 0.27, soft: 0.42 });

  function finiteNumber(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function clamp(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, value));
  }

  function qualityFromDifference(absDifference, windows = DEFAULT_WINDOWS) {
    const difference = Math.abs(finiteNumber(absDifference, Infinity));
    const perfectWindow = Math.max(0, finiteNumber(windows.perfect, DEFAULT_WINDOWS.perfect));
    const cleanWindow = Math.max(perfectWindow, finiteNumber(windows.clean, DEFAULT_WINDOWS.clean));
    const softWindow = Math.max(cleanWindow, finiteNumber(windows.soft, DEFAULT_WINDOWS.soft));

    if (difference <= perfectWindow) return "perfect";
    if (difference <= cleanWindow) return "clean";
    if (difference <= softWindow) return "soft";
    return "miss";
  }

  function contactBase(quality) {
    if (quality === "perfect") return 180;
    if (quality === "clean") return 100;
    if (quality === "soft") return 50;
    return 0;
  }

  function contactMultiplier(streak) {
    const acceptedContacts = Math.max(0, Math.floor(finiteNumber(streak)));
    const multiplierSteps = Math.min(10, Math.max(0, acceptedContacts - 1));
    return 1 + multiplierSteps * 0.1;
  }

  function contactScore({ quality, gold = false, streak = 0 } = {}) {
    const goldMultiplier = gold ? 3 : 1;
    return Math.round(contactBase(quality) * goldMultiplier * contactMultiplier(streak));
  }

  function sealBonus(anchorCount) {
    if (anchorCount === 3) return 300;
    if (anchorCount === 4) return 600;
    if (anchorCount === 5) return 1000;
    if (anchorCount === 6) return 1500;
    return 0;
  }

  function crownlightFor({ anchorCount = 3, perfects = 0, golds = 0, areaRatio = 0 } = {}) {
    const anchors = clamp(Math.floor(finiteNumber(anchorCount, 3)), 3, 6);
    const perfectCount = clamp(Math.floor(finiteNumber(perfects)), 0, anchors);
    const goldCount = clamp(Math.floor(finiteNumber(golds)), 0, anchors);
    const normalizedArea = clamp(finiteNumber(areaRatio), 0, 1);

    const extensionLight = (anchors - 3) * 5;
    const precisionLight = perfectCount * 1.5;
    const goldLight = goldCount * 1.5;
    const shapeLight = normalizedArea * 5;
    return clamp(Math.round(20 + extensionLight + precisionLight + goldLight + shapeLight), 20, 45);
  }

  function faultOutcome({ accepted = false, faultStreak = 0 } = {}) {
    const previousFaults = Math.max(0, Math.floor(finiteNumber(faultStreak)));
    if (accepted) {
      return Object.freeze({
        outcome: previousFaults > 0 ? "recovered" : "accepted",
        nextFaultStreak: 0,
      });
    }
    if (previousFaults > 0) {
      return Object.freeze({ outcome: "petal-loss", nextFaultStreak: 0 });
    }
    return Object.freeze({ outcome: "fray", nextFaultStreak: 1 });
  }

  function rankFor(score, awakened = false) {
    const points = Math.max(0, finiteNumber(score));
    if (awakened && points >= 36000) return "Concord Guardian";
    if (awakened && points >= 28000) return "Crown Awakener";
    if (points >= 20000) return "Sealwarden";
    if (points >= 12000) return "Pulseweaver";
    if (points >= 6000) return "Arc Keeper";
    return "Rootlistener";
  }

  return Object.freeze({
    qualityFromDifference,
    contactBase,
    contactMultiplier,
    contactScore,
    sealBonus,
    crownlightFor,
    faultOutcome,
    rankFor,
  });
});
