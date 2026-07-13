(function initializeRipplewakeRules(root, factory) {
  "use strict";

  const rules = factory();
  if (typeof module === "object" && module.exports) module.exports = rules;
  else root.RipplewakeRules = rules;
})(typeof globalThis !== "undefined" ? globalThis : this, function createRipplewakeRules() {
  "use strict";

  function contactOutcome({ hasAcceptedInput, noInputStreak }) {
    if (hasAcceptedInput) return "timed";
    return noInputStreak >= 1 ? "sink" : "fading";
  }

  function basePoints(quality) {
    if (quality === "perfect") return 180;
    if (quality === "clean") return 100;
    if (quality === "soft") return 20;
    return 0;
  }

  function completionBonus(stonesSunk) {
    return stonesSunk === 0 ? 500 : 0;
  }

  return Object.freeze({ contactOutcome, basePoints, completionBonus });
});
