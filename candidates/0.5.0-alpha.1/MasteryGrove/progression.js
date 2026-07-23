(function initializeMasteryGroveProgression(root, factory) {
  "use strict";

  const lumenloomModes = typeof module === "object" && module.exports
    ? require("../Lumenloom/modes.js")
    : root.LumenloomModes;
  const api = factory(lumenloomModes);
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.MasteryGroveProgression = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createMasteryGroveProgression(lumenloomModes) {
  "use strict";

  const PROFILE_VERSION = 6;
  const PROFILE_V5_VERSION = 5;
  const LEGACY_PROFILE_VERSION = 4;
  // The collection's existing bridge is version 1. D-020 hardens that
  // contract with a parent-issued sessionId without needlessly breaking all
  // four clients on an identifier-only version bump.
  const SESSION_VERSION = 1;
  const EXPORT_KIND = "first-bloom-grove-profile";
  const EXPORT_VERSION = 1;
  const MAX_COUNTER = Number.MAX_SAFE_INTEGER;
  const FIRST_TREE_PART_COUNT = 4;

  const FOUNDATIONAL_GAME_IDS = Object.freeze(["lumenloom", "bloomfold", "ripplewake"]);
  const LEGACY_GAME_IDS = Object.freeze([...FOUNDATIONAL_GAME_IDS, "prismbind"]);
  const ALL_GAME_IDS = Object.freeze([...LEGACY_GAME_IDS, "mothchorus"]);
  if (!lumenloomModes
    || !Array.isArray(lumenloomModes.MODE_IDS)
    || !lumenloomModes.MAX_SCORES) {
    throw new Error("Lumenloom mode rules must load before Mastery Grove progression.");
  }
  const LUMENLOOM_MODE_IDS = lumenloomModes.MODE_IDS;
  const LUMENLOOM_REMIX_MODE_IDS = Object.freeze(LUMENLOOM_MODE_IDS.slice(1));
  const LUMENLOOM_MODE_MAX_SCORES = lumenloomModes.MAX_SCORES;
  const GROWTH_STAGES = Object.freeze(["SEED", "BUD", "BRONZE", "SILVER", "GOLD", "FULL BLOOM"]);
  const MOTHCHORUS_RANKS = deepFreeze([
    { minimum: 0, name: "FIRST VOICE" },
    { minimum: 4500, name: "MOONCALLER" },
    { minimum: 6500, name: "LINDEN KEEPER" },
    { minimum: 8000, name: "HEARTLIGHT CHOIR" },
    { minimum: 9500, name: "CROWN CHORUS" }
  ]);

  function deepFreeze(value) {
    if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
    Object.values(value).forEach(deepFreeze);
    return Object.freeze(value);
  }

  const GAME_DEFINITIONS = deepFreeze({
    lumenloom: {
      id: "lumenloom",
      tree: "THE LANTERN WILLOW",
      thresholds: [0, 1000, 2500, 5500, 9500, 14000],
      trialBenchmark: 14000,
      seedThreshold: 9500,
      seedRequiresVictory: true,
      seedEligible: true,
      foundational: true
    },
    bloomfold: {
      id: "bloomfold",
      tree: "THE RECURSIVE ORCHID",
      thresholds: [0, 800, 2500, 4500, 6000, 7000],
      trialBenchmark: 7000,
      seedThreshold: 4500,
      seedRequiresVictory: true,
      seedEligible: true,
      foundational: true
    },
    ripplewake: {
      id: "ripplewake",
      tree: "THE ECHO ALDER",
      thresholds: [0, 3000, 8000, 18000, 34000, 54000],
      trialBenchmark: 18000,
      seedThreshold: 12000,
      seedRequiresVictory: false,
      seedEligible: true,
      foundational: true
    },
    prismbind: {
      id: "prismbind",
      tree: "THE CONCORD BANYAN",
      thresholds: [0, 6000, 12000, 20000, 28000, 36000],
      trialBenchmark: 36000,
      seedThreshold: null,
      seedRequiresVictory: false,
      seedEligible: false,
      foundational: false
    },
    mothchorus: {
      id: "mothchorus",
      tree: "THE CHOIR LINDEN",
      thresholds: [0, 6500, 18000, 36000, 65000, 100000],
      trialBenchmark: null,
      seedThreshold: 6500,
      seedVoiceThreshold: 18,
      seedRequiresVictory: true,
      seedEligible: true,
      foundational: false
    }
  });

  const SEED_ELIGIBLE_GAME_IDS = Object.freeze(
    ALL_GAME_IDS.filter((gameId) => GAME_DEFINITIONS[gameId].seedEligible)
  );

  const GROVE_RANKS = deepFreeze([
    { marks: 0, name: "FIRST SPROUT", message: "Three arcade seeds are awake. Every finished run feeds its own tree." },
    { marks: 2, name: "ROOTKEEPER", message: "The First Tree has recognized your returning footsteps." },
    { marks: 4, name: "YOUNG GROVE", message: "Your mastery is becoming part of the landscape." },
    { marks: 6, name: "BRANCHKEEPER", message: "The awakened boughs have begun sharing light across the clearing." },
    { marks: 8, name: "BLOOMKEEPER", message: "Rare blossoms now answer one another across the clearing." },
    { marks: 10, name: "GROVEHEART", message: "A complete crown endures while the Echo Alder learns the language of the lake." },
    { marks: 15, name: "THREECROWN", message: "Three crowns are awake. Gold, cyan, and coral move as one living canopy." }
  ]);

  const PROFILE_V5_KEYS = Object.freeze([
    "version", "introSeen", "games", "trialBest", "trialsCompleted",
    "legacyTrialBest", "legacyTrialsCompleted", "unlocks", "regions", "updatedAt"
  ]);
  const PROFILE_KEYS = Object.freeze([...PROFILE_V5_KEYS, "livingArcade"]);
  const GAME_RECORD_KEYS = Object.freeze([
    "totalScore", "standardBest", "assistedBest", "plays", "completed",
    "victories", "lastScore", "lastRank", "masterySeed", "seedCeremonySeen"
  ]);
  const LIVING_ARCADE_KEYS = Object.freeze(["onboarding", "modes"]);
  const ONBOARDING_KEYS = Object.freeze(["firstBloomCompleted"]);
  const LIVING_ARCADE_MODE_GROUP_KEYS = Object.freeze(["lumenloom"]);
  const LUMENLOOM_MODE_RECORD_KEYS = Object.freeze([
    "standardBest", "assistedBest", "plays", "completions", "victories"
  ]);
  const UNLOCK_KEYS = Object.freeze(["prismbind", "prismbindCeremonySeen"]);
  const REGION_KEYS = Object.freeze(["secondGroveUnlocked", "trees05To07Revealed", "ceremonySeen"]);
  const SESSION_STATUSES = Object.freeze(["awaiting-ready", "ready", "running", "completed"]);

  function isPlainObject(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  }

  function hasExactKeys(value, expected) {
    if (!isPlainObject(value)) return false;
    const actual = Object.keys(value).sort();
    const wanted = [...expected].sort();
    return actual.length === wanted.length && actual.every((key, index) => key === wanted[index]);
  }

  function isCounter(value) {
    return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
  }

  function sanitizeStoredCounter(value) {
    if (typeof value !== "number" || !Number.isFinite(value) || !Number.isInteger(value)) return 0;
    if (value <= 0) return 0;
    return Math.min(MAX_COUNTER, value);
  }

  function safeAdd(left, right) {
    const safeLeft = sanitizeStoredCounter(left);
    const safeRight = sanitizeStoredCounter(right);
    if (safeLeft >= MAX_COUNTER - safeRight) return MAX_COUNTER;
    return safeLeft + safeRight;
  }

  function strictBoolean(value) {
    return value === true;
  }

  function safeText(value, fallback, maximumLength) {
    return typeof value === "string" ? value.slice(0, maximumLength) : fallback;
  }

  function makeGameRecord() {
    return {
      totalScore: 0,
      standardBest: 0,
      assistedBest: 0,
      plays: 0,
      completed: false,
      victories: 0,
      lastScore: 0,
      lastRank: "SEED",
      masterySeed: false,
      seedCeremonySeen: false
    };
  }

  function makeLumenloomModeRecord() {
    return {
      standardBest: 0,
      assistedBest: 0,
      plays: 0,
      completions: 0,
      victories: 0
    };
  }

  function makeLivingArcade() {
    return {
      onboarding: {
        firstBloomCompleted: false
      },
      modes: {
        lumenloom: Object.fromEntries(
          LUMENLOOM_REMIX_MODE_IDS.map((modeId) => [modeId, makeLumenloomModeRecord()])
        )
      }
    };
  }

  function makeDefaultProfileV5() {
    return {
      version: PROFILE_V5_VERSION,
      introSeen: false,
      games: Object.fromEntries(ALL_GAME_IDS.map((gameId) => [gameId, makeGameRecord()])),
      trialBest: 0,
      trialsCompleted: 0,
      legacyTrialBest: 0,
      legacyTrialsCompleted: 0,
      unlocks: {
        prismbind: false,
        prismbindCeremonySeen: false
      },
      regions: {
        secondGroveUnlocked: false,
        trees05To07Revealed: false,
        ceremonySeen: false
      },
      updatedAt: null
    };
  }

  function makeDefaultProfile() {
    return {
      ...makeDefaultProfileV5(),
      version: PROFILE_VERSION,
      livingArcade: makeLivingArcade()
    };
  }

  function defaultProfile() {
    return deepFreeze(makeDefaultProfile());
  }

  function cloneCanonicalProfileV5(profile) {
    return {
      version: PROFILE_V5_VERSION,
      introSeen: profile.introSeen,
      games: Object.fromEntries(ALL_GAME_IDS.map((gameId) => [gameId, { ...profile.games[gameId] }])),
      trialBest: profile.trialBest,
      trialsCompleted: profile.trialsCompleted,
      legacyTrialBest: profile.legacyTrialBest,
      legacyTrialsCompleted: profile.legacyTrialsCompleted,
      unlocks: { ...profile.unlocks },
      regions: { ...profile.regions },
      updatedAt: profile.updatedAt
    };
  }

  function cloneCanonicalProfile(profile) {
    return {
      ...cloneCanonicalProfileV5(profile),
      version: PROFILE_VERSION,
      livingArcade: {
        onboarding: {
          firstBloomCompleted: profile.livingArcade.onboarding.firstBloomCompleted
        },
        modes: {
          lumenloom: Object.fromEntries(
            LUMENLOOM_REMIX_MODE_IDS.map((modeId) => [
              modeId,
              { ...profile.livingArcade.modes.lumenloom[modeId] }
            ])
          )
        }
      }
    };
  }

  function standaloneBestFor(standaloneBests, gameId) {
    if (!isPlainObject(standaloneBests)) return 0;
    return isCounter(standaloneBests[gameId]) ? standaloneBests[gameId] : 0;
  }

  function failed(code, details = {}) {
    // Error results may reference a caller-owned profile/session so the core
    // can report what was rejected. Freeze only the result wrapper; freezing
    // the nested input would itself be an observable mutation.
    return Object.freeze({ ok: false, code, ...details });
  }

  function canonicalMothchorusRank(score) {
    if (!isCounter(score) || score > 10000) return null;
    let rank = MOTHCHORUS_RANKS[0].name;
    for (const candidate of MOTHCHORUS_RANKS) {
      if (score >= candidate.minimum) rank = candidate.name;
    }
    return rank;
  }

  function canonicalLumenloomRank(score, victory) {
    if (!isCounter(score) || typeof victory !== "boolean") return null;
    if (victory && score >= 14000) return "DAWN ARCHITECT";
    if (victory && score >= 9500) return "MOONLOOM MASTER";
    if (victory) return "NIGHT WEAVER";
    if (score >= 5500) return "GOLDEN THREAD";
    if (score >= 2500) return "LOOMWING";
    return "FIRST FIREFLY";
  }

  function isCanonicalGameRecord(record, gameId) {
    if (!hasExactKeys(record, GAME_RECORD_KEYS)) return false;
    if (![record.totalScore, record.standardBest, record.assistedBest, record.plays, record.victories, record.lastScore].every(isCounter)) return false;
    if (record.totalScore < record.standardBest || record.totalScore < record.assistedBest || record.totalScore < record.lastScore) return false;
    if (typeof record.completed !== "boolean" || typeof record.masterySeed !== "boolean" || typeof record.seedCeremonySeen !== "boolean") return false;
    if (typeof record.lastRank !== "string" || !record.lastRank || record.lastRank.length > 48) return false;
    if (!GAME_DEFINITIONS[gameId].seedEligible && record.masterySeed) return false;
    if (!record.masterySeed && record.seedCeremonySeen) return false;
    if ((record.victories > 0 || record.masterySeed) && !record.completed) return false;
    return true;
  }

  function hasCanonicalProfileShell(profile, version, gameIds, allowVictoryLatchRepair = false) {
    const profileKeys = version === PROFILE_VERSION ? PROFILE_KEYS : PROFILE_V5_KEYS;
    if (!hasExactKeys(profile, profileKeys) || profile.version !== version) return false;
    if (typeof profile.introSeen !== "boolean") return false;
    if (!hasExactKeys(profile.games, gameIds)) return false;
    if (![profile.trialBest, profile.trialsCompleted, profile.legacyTrialBest, profile.legacyTrialsCompleted].every(isCounter)) return false;
    if (!(profile.updatedAt === null || (typeof profile.updatedAt === "string" && profile.updatedAt.length <= 64))) return false;
    if (!gameIds.every((gameId) => isCanonicalGameRecord(profile.games[gameId], gameId))) return false;

    if (!hasExactKeys(profile.unlocks, UNLOCK_KEYS)) return false;
    if (typeof profile.unlocks.prismbind !== "boolean" || typeof profile.unlocks.prismbindCeremonySeen !== "boolean") return false;
    if (!profile.unlocks.prismbind && profile.unlocks.prismbindCeremonySeen) return false;
    if (FOUNDATIONAL_GAME_IDS.every((gameId) => profile.games[gameId].masterySeed) && !profile.unlocks.prismbind) return false;

    if (!hasExactKeys(profile.regions, REGION_KEYS)) return false;
    if (typeof profile.regions.secondGroveUnlocked !== "boolean"
      || typeof profile.regions.trees05To07Revealed !== "boolean"
      || typeof profile.regions.ceremonySeen !== "boolean") return false;
    const regionLatchMismatch = profile.regions.secondGroveUnlocked !== profile.regions.trees05To07Revealed;
    if (regionLatchMismatch) {
      const repairableStoredVictory = allowVictoryLatchRepair
        && profile.games.prismbind?.victories > 0
        && !profile.regions.ceremonySeen;
      if (!repairableStoredVictory) return false;
    }
    if (!profile.regions.secondGroveUnlocked && profile.regions.ceremonySeen) return false;
    return true;
  }

  function isCanonicalProfileV4(profile, allowVictoryLatchRepair = false) {
    if (!hasCanonicalProfileShell(profile, LEGACY_PROFILE_VERSION, LEGACY_GAME_IDS, allowVictoryLatchRepair)) return false;
    const prismVictoryRecorded = profile.games.prismbind.victories > 0;
    const crownheartLatched = profile.regions.secondGroveUnlocked && profile.regions.trees05To07Revealed;
    if (!prismVictoryRecorded) return !profile.regions.secondGroveUnlocked && !profile.regions.trees05To07Revealed;
    if (!crownheartLatched) {
      return allowVictoryLatchRepair && !profile.regions.ceremonySeen;
    }
    return true;
  }

  function migrateCanonicalV4(profile) {
    const migrated = makeDefaultProfileV5();
    migrated.introSeen = profile.introSeen;
    for (const gameId of LEGACY_GAME_IDS) migrated.games[gameId] = { ...profile.games[gameId] };
    migrated.trialBest = profile.trialBest;
    migrated.trialsCompleted = profile.trialsCompleted;
    migrated.legacyTrialBest = profile.legacyTrialBest;
    migrated.legacyTrialsCompleted = profile.legacyTrialsCompleted;
    migrated.unlocks = { ...profile.unlocks };
    migrated.regions = { ...profile.regions };
    if (migrated.games.prismbind.victories > 0) {
      migrated.regions.secondGroveUnlocked = true;
      migrated.regions.trees05To07Revealed = true;
    }
    migrated.updatedAt = profile.updatedAt;
    return migrated;
  }

  function migrateCanonicalV5(profile) {
    const migrated = {
      ...cloneCanonicalProfileV5(profile),
      version: PROFILE_VERSION,
      livingArcade: makeLivingArcade()
    };
    migrated.livingArcade.onboarding.firstBloomCompleted = hasCanonicalProgressEvidence(profile);
    return migrated;
  }

  function migrateProfile(rawProfile, standaloneBests = {}) {
    const warnings = [];
    const rawIsObject = isPlainObject(rawProfile);
    const rawVersion = rawIsObject ? rawProfile.version : null;

    if (typeof rawVersion === "number"
      && (rawVersion > PROFILE_VERSION
        || (rawVersion > PROFILE_V5_VERSION && rawVersion !== PROFILE_VERSION))) {
      return failed("future-profile", { sourceVersion: rawVersion, profile: null, warnings: Object.freeze([]) });
    }

    const sourceVersion = rawIsObject && Number.isInteger(rawVersion) && rawVersion >= 1 && rawVersion <= PROFILE_VERSION
      ? rawVersion
      : null;
    if (sourceVersion === null && rawProfile !== null && rawProfile !== undefined) warnings.push("malformed-profile");

    if (sourceVersion === PROFILE_VERSION) {
      if (!isCanonicalProfile(rawProfile)) {
        return failed("invalid-profile-v6", { sourceVersion, profile: null, warnings: Object.freeze([]) });
      }
      return deepFreeze({
        ok: true,
        code: "ok",
        sourceVersion,
        migrated: false,
        warnings: Object.freeze([]),
        profile: deepFreeze(cloneCanonicalProfile(rawProfile))
      });
    }

    if (sourceVersion === PROFILE_V5_VERSION) {
      if (!isCanonicalProfileV5(rawProfile)) {
        return failed("invalid-profile-v5", { sourceVersion, profile: null, warnings: Object.freeze([]) });
      }
      const migrated = migrateCanonicalV5(rawProfile);
      if (!isCanonicalProfile(migrated)) {
        return failed("invalid-profile-v5", { sourceVersion, profile: null, warnings: Object.freeze([]) });
      }
      return deepFreeze({
        ok: true,
        code: "ok",
        sourceVersion,
        migrated: true,
        warnings: Object.freeze([]),
        profile: deepFreeze(migrated)
      });
    }

    if (sourceVersion === LEGACY_PROFILE_VERSION) {
      if (!isCanonicalProfileV4(rawProfile, true)) {
        return failed("invalid-profile-v4", { sourceVersion, profile: null, warnings: Object.freeze([]) });
      }
      const migratedV5 = migrateCanonicalV4(rawProfile);
      if (!isCanonicalProfileV5(migratedV5)) {
        return failed("invalid-profile-v4", { sourceVersion, profile: null, warnings: Object.freeze([]) });
      }
      const migrated = migrateCanonicalV5(migratedV5);
      if (!isCanonicalProfile(migrated)) {
        return failed("invalid-profile-v4", { sourceVersion, profile: null, warnings: Object.freeze([]) });
      }
      return deepFreeze({
        ok: true,
        code: "ok",
        sourceVersion,
        migrated: true,
        warnings: Object.freeze([]),
        profile: deepFreeze(migrated)
      });
    }

    const source = sourceVersion === null ? {} : rawProfile;
    const sourceGames = isPlainObject(source.games) ? source.games : {};
    const profile = makeDefaultProfile();
    profile.introSeen = strictBoolean(source.introSeen);

    for (const gameId of ALL_GAME_IDS) {
      const definition = GAME_DEFINITIONS[gameId];
      // Mothchorus first entered the canonical profile in v5. Older payloads
      // cannot contain trustworthy history for a game that did not exist.
      const incoming = gameId === "mothchorus" && sourceVersion !== null && sourceVersion <= 3
        ? {}
        : (isPlainObject(sourceGames[gameId]) ? sourceGames[gameId] : {});
      // Standalone Mothchorus history is deliberately outside Grove progress.
      // Trees 01-04 retain their established legacy-import behavior for v1-v3.
      const standaloneBest = gameId === "mothchorus" ? 0 : standaloneBestFor(standaloneBests, gameId);
      const historicalBest = sourceVersion !== null && sourceVersion <= 3
        ? sanitizeStoredCounter(incoming.best)
        : sanitizeStoredCounter(incoming.standardBest);
      const standardBest = Math.max(historicalBest, standaloneBest);
      const assistedBest = 0;
      const record = profile.games[gameId];

      record.standardBest = standardBest;
      record.assistedBest = assistedBest;
      record.victories = sanitizeStoredCounter(incoming.victories);
      record.lastScore = sanitizeStoredCounter(incoming.lastScore);
      record.totalScore = Math.max(
        sanitizeStoredCounter(incoming.totalScore),
        standardBest,
        assistedBest,
        record.lastScore
      );
      record.plays = sanitizeStoredCounter(incoming.plays);
      record.completed = strictBoolean(incoming.completed) || record.totalScore > 0 || record.victories > 0;
      record.lastRank = safeText(incoming.lastRank, "SEED", 48) || "SEED";

      if (definition.foundational && standardBest >= definition.seedThreshold) {
        // Historical profiles cannot prove victory/assist state. D-020 grandfathers
        // qualifying recorded bests and suppresses three retroactive Seed popups.
        record.masterySeed = true;
        record.seedCeremonySeen = true;
      }
      if (record.masterySeed) record.completed = true;
    }

    const oldTrialBest = sanitizeStoredCounter(source.trialBest);
    const oldTrialsCompleted = sanitizeStoredCounter(source.trialsCompleted);
    const oldLegacyBest = sanitizeStoredCounter(source.legacyTrialBest);
    const oldLegacyCompleted = sanitizeStoredCounter(source.legacyTrialsCompleted);
    if (sourceVersion !== null && sourceVersion < 3) {
      profile.trialBest = 0;
      profile.trialsCompleted = 0;
      profile.legacyTrialBest = Math.max(oldLegacyBest, oldTrialBest);
      profile.legacyTrialsCompleted = Math.max(oldLegacyCompleted, oldTrialsCompleted);
    } else {
      profile.trialBest = oldTrialBest;
      profile.trialsCompleted = oldTrialsCompleted;
      profile.legacyTrialBest = oldLegacyBest;
      profile.legacyTrialsCompleted = oldLegacyCompleted;
    }

    const allFoundationalSeeds = FOUNDATIONAL_GAME_IDS.every((gameId) => profile.games[gameId].masterySeed);
    profile.unlocks.prismbind = allFoundationalSeeds;
    profile.unlocks.prismbindCeremonySeen = false;

    const prismVictoryRecorded = profile.games.prismbind.victories > 0;
    profile.regions.secondGroveUnlocked = prismVictoryRecorded;
    profile.regions.trees05To07Revealed = prismVictoryRecorded;
    profile.regions.ceremonySeen = false;

    profile.updatedAt = source.updatedAt === null
      ? null
      : (typeof source.updatedAt === "string" ? source.updatedAt.slice(0, 64) : null);
    profile.livingArcade.onboarding.firstBloomCompleted = hasCanonicalProgressEvidence(profile);
    if (!isCanonicalProfile(profile)) {
      return failed("invalid-legacy-profile", {
        sourceVersion,
        profile: null,
        warnings: Object.freeze(warnings)
      });
    }

    return deepFreeze({
      ok: true,
      code: "ok",
      sourceVersion,
      migrated: sourceVersion !== PROFILE_VERSION,
      warnings: Object.freeze(warnings),
      profile: deepFreeze(profile)
    });
  }

  function hasCanonicalV5Semantics(profile, version) {
    if (!hasCanonicalProfileShell(profile, version, ALL_GAME_IDS)) return false;
    const prismVictoryRecorded = profile.games.prismbind.victories > 0;
    if (profile.regions.secondGroveUnlocked !== prismVictoryRecorded
      || profile.regions.trees05To07Revealed !== prismVictoryRecorded) return false;

    const moth = profile.games.mothchorus;
    const hasMothProgress = moth.totalScore > 0
      || moth.standardBest > 0
      || moth.assistedBest > 0
      || moth.plays > 0
      || moth.completed
      || moth.victories > 0
      || moth.lastScore > 0
      || moth.masterySeed
      || moth.seedCeremonySeen;
    if (hasMothProgress && !profile.regions.secondGroveUnlocked) return false;
    if (moth.assistedBest !== 0) return false;
    if (moth.standardBest > 10000 || moth.lastScore > 10000) return false;
    if (moth.plays !== moth.victories) return false;
    const maximumMothTotal = moth.plays > Math.floor(MAX_COUNTER / 10000)
      ? MAX_COUNTER
      : moth.plays * 10000;
    if (moth.totalScore > maximumMothTotal) return false;
    if (moth.completed !== (moth.plays > 0)) return false;
    if (moth.completed && moth.lastRank !== canonicalMothchorusRank(moth.lastScore)) return false;
    if (!moth.completed && moth.lastRank !== "SEED") return false;
    if (moth.masterySeed && moth.standardBest < GAME_DEFINITIONS.mothchorus.seedThreshold) return false;
    return true;
  }

  function isCanonicalProfileV5(profile) {
    return hasCanonicalV5Semantics(profile, PROFILE_V5_VERSION);
  }

  function isCanonicalLumenloomModeRecord(record, modeId, lumenloomTotal) {
    if (!hasExactKeys(record, LUMENLOOM_MODE_RECORD_KEYS)) return false;
    if (!LUMENLOOM_MODE_RECORD_KEYS.every((key) => isCounter(record[key]))) return false;
    if (record.victories > record.completions || record.completions > record.plays) return false;
    const positiveBestLanes = Number(record.standardBest > 0) + Number(record.assistedBest > 0);
    if (positiveBestLanes > record.completions) return false;
    if (record.standardBest > lumenloomTotal || record.assistedBest > lumenloomTotal) return false;
    const maximum = LUMENLOOM_MODE_MAX_SCORES[modeId];
    if (record.standardBest > maximum || record.assistedBest > maximum) return false;
    return true;
  }

  function hasAnyModeActivity(record) {
    return LUMENLOOM_MODE_RECORD_KEYS.some((key) => record[key] > 0);
  }

  function hasCanonicalProgressEvidence(profile) {
    const hasGameProgress = ALL_GAME_IDS.some((gameId) => {
      const record = profile.games[gameId];
      return record.totalScore > 0
        || record.standardBest > 0
        || record.assistedBest > 0
        || record.plays > 0
        || record.completed
        || record.victories > 0
        || record.lastScore > 0
        || record.masterySeed
        || record.seedCeremonySeen;
    });
    return hasGameProgress
      || profile.trialBest > 0
      || profile.trialsCompleted > 0
      || profile.legacyTrialBest > 0
      || profile.legacyTrialsCompleted > 0
      || profile.unlocks.prismbind
      || profile.unlocks.prismbindCeremonySeen
      || profile.regions.secondGroveUnlocked
      || profile.regions.trees05To07Revealed
      || profile.regions.ceremonySeen;
  }

  function hasCanonicalLivingArcade(profile) {
    const livingArcade = profile.livingArcade;
    if (!hasExactKeys(livingArcade, LIVING_ARCADE_KEYS)) return false;
    if (!hasExactKeys(livingArcade.onboarding, ONBOARDING_KEYS)
      || typeof livingArcade.onboarding.firstBloomCompleted !== "boolean") return false;
    if (!hasExactKeys(livingArcade.modes, LIVING_ARCADE_MODE_GROUP_KEYS)) return false;
    const lumenloomModes = livingArcade.modes.lumenloom;
    if (!hasExactKeys(lumenloomModes, LUMENLOOM_REMIX_MODE_IDS)) return false;

    const lumenloomTotal = profile.games.lumenloom.totalScore;
    for (const modeId of LUMENLOOM_REMIX_MODE_IDS) {
      if (!isCanonicalLumenloomModeRecord(lumenloomModes[modeId], modeId, lumenloomTotal)) return false;
    }

    const firstBloomCompleted = livingArcade.onboarding.firstBloomCompleted;
    const hasRemixActivity = LUMENLOOM_REMIX_MODE_IDS.some((modeId) => hasAnyModeActivity(lumenloomModes[modeId]));
    if (!firstBloomCompleted && (hasCanonicalProgressEvidence(profile) || hasRemixActivity)) return false;
    if (hasAnyModeActivity(lumenloomModes.shiftingConstellation)
      && lumenloomTotal < GAME_DEFINITIONS.lumenloom.thresholds[3]) return false;
    if (hasAnyModeActivity(lumenloomModes.hollowRush)
      && lumenloomTotal < GAME_DEFINITIONS.lumenloom.thresholds[4]) return false;
    return true;
  }

  function isCanonicalProfile(profile) {
    return hasCanonicalV5Semantics(profile, PROFILE_VERSION) && hasCanonicalLivingArcade(profile);
  }

  function completeFirstBloom(profile) {
    if (!isCanonicalProfile(profile)) return failed("invalid-profile", { profile });
    if (profile.livingArcade.onboarding.firstBloomCompleted) {
      return deepFreeze({
        ok: true,
        code: "already-complete",
        profile: deepFreeze(cloneCanonicalProfile(profile))
      });
    }
    const next = cloneCanonicalProfile(profile);
    next.livingArcade.onboarding.firstBloomCompleted = true;
    return deepFreeze({ ok: true, code: "ok", profile: deepFreeze(next) });
  }

  function isLumenloomModeAvailable(profile, modeId) {
    if (!isCanonicalProfile(profile) || !LUMENLOOM_MODE_IDS.includes(modeId)) return false;
    if (modeId === "standard") return true;
    if (modeId === "petalRush") return profile.livingArcade.onboarding.firstBloomCompleted;
    const totalScore = profile.games.lumenloom.totalScore;
    if (modeId === "shiftingConstellation") {
      return totalScore >= GAME_DEFINITIONS.lumenloom.thresholds[3];
    }
    return totalScore >= GAME_DEFINITIONS.lumenloom.thresholds[4];
  }

  function recordLumenloomRemixStart(profile, modeId) {
    if (!isCanonicalProfile(profile)) return failed("invalid-profile", { profile });
    if (!LUMENLOOM_REMIX_MODE_IDS.includes(modeId)) return failed("invalid-mode", { profile });
    if (!isLumenloomModeAvailable(profile, modeId)) return failed("mode-locked", { profile });
    const record = profile.livingArcade.modes.lumenloom[modeId];
    if (record.plays === MAX_COUNTER) return failed("counter-overflow", { profile });
    const next = cloneCanonicalProfile(profile);
    next.livingArcade.modes.lumenloom[modeId].plays += 1;
    return deepFreeze({
      ok: true,
      code: "ok",
      modeId,
      profile: deepFreeze(next)
    });
  }

  function validateLumenloomRemixResult(rawResult) {
    if (!hasExactKeys(rawResult, ["modeId", "score", "victory", "assisted"])) {
      return failed("invalid-remix-result");
    }
    if (!LUMENLOOM_REMIX_MODE_IDS.includes(rawResult.modeId)) return failed("invalid-mode");
    if (!isCounter(rawResult.score)
      || rawResult.score > LUMENLOOM_MODE_MAX_SCORES[rawResult.modeId]) return failed("invalid-score");
    if (typeof rawResult.victory !== "boolean") return failed("invalid-victory");
    if (typeof rawResult.assisted !== "boolean") return failed("invalid-assisted");
    return deepFreeze({
      ok: true,
      code: "ok",
      result: deepFreeze({
        modeId: rawResult.modeId,
        score: rawResult.score,
        victory: rawResult.victory,
        assisted: rawResult.assisted
      })
    });
  }

  function applyLumenloomRemixResult(profile, rawResult) {
    if (!isCanonicalProfile(profile)) return failed("invalid-profile", { profile });
    const validated = validateLumenloomRemixResult(rawResult);
    if (!validated.ok) return failed(validated.code, { profile });
    const result = validated.result;
    if (!isLumenloomModeAvailable(profile, result.modeId)) return failed("mode-locked", { profile });
    const currentRecord = profile.livingArcade.modes.lumenloom[result.modeId];
    if (currentRecord.completions >= currentRecord.plays) return failed("run-not-started", { profile });

    const next = cloneCanonicalProfile(profile);
    const game = next.games.lumenloom;
    const record = next.livingArcade.modes.lumenloom[result.modeId];
    game.totalScore = safeAdd(game.totalScore, result.score);
    record.completions += 1;
    if (result.victory) record.victories += 1;
    if (result.assisted) record.assistedBest = Math.max(record.assistedBest, result.score);
    else record.standardBest = Math.max(record.standardBest, result.score);
    if (!isCanonicalProfile(next)) return failed("invalid-remix-result", { profile });

    return deepFreeze({
      ok: true,
      code: "ok",
      profile: deepFreeze(next),
      result
    });
  }

  function growthFor(gameId, totalScore) {
    const definition = GAME_DEFINITIONS[gameId];
    if (!definition || !isCounter(totalScore)) return null;
    const thresholds = definition.thresholds;
    let level = 0;
    for (let index = 1; index < thresholds.length; index += 1) {
      if (totalScore >= thresholds[index]) level = index;
    }
    let fractional = level;
    if (level < thresholds.length - 1) {
      const lower = thresholds[level];
      const upper = thresholds[level + 1];
      fractional += Math.max(0, Math.min(1, (totalScore - lower) / Math.max(1, upper - lower)));
    }
    const nextThreshold = level < thresholds.length - 1 ? thresholds[level + 1] : null;
    return deepFreeze({
      gameId,
      level,
      name: GROWTH_STAGES[level],
      progress: Math.min(100, fractional / (thresholds.length - 1) * 100),
      nextThreshold,
      pointsToNext: nextThreshold === null ? 0 : Math.max(0, nextThreshold - totalScore)
    });
  }

  function foundationalMarks(profile) {
    if (!isCanonicalProfile(profile)) return null;
    return FOUNDATIONAL_GAME_IDS.reduce((marks, gameId) => {
      return marks + growthFor(gameId, profile.games[gameId].totalScore).level;
    }, 0);
  }

  function groveRankForMarks(marks) {
    if (!Number.isInteger(marks) || marks < 0 || marks > 15) return null;
    let rank = GROVE_RANKS[0];
    for (const candidate of GROVE_RANKS) {
      if (marks >= candidate.marks) rank = candidate;
    }
    return rank;
  }

  function isGameUnlocked(profile, gameId) {
    if (!isCanonicalProfile(profile) || !ALL_GAME_IDS.includes(gameId)) return false;
    if (gameId === "prismbind") return profile.unlocks.prismbind;
    if (gameId === "mothchorus") return profile.regions.secondGroveUnlocked;
    return true;
  }

  function validateRunResult(result) {
    if (!isPlainObject(result) || !ALL_GAME_IDS.includes(result.gameId)) return failed("invalid-game-result");
    if (result.gameId === "mothchorus" && !hasExactKeys(result, [
      "gameId", "score", "best", "victory", "assisted", "rank", "finalVoiceCount", "participantMode"
    ])) return failed("invalid-game-result");
    if (!isCounter(result.score)) return failed("invalid-score");
    if (typeof result.victory !== "boolean") return failed("invalid-victory");
    if (typeof result.assisted !== "boolean") return failed("invalid-assisted");

    if (result.gameId === "mothchorus") {
      if (result.score > 10000) return failed("invalid-score");
      if (!isCounter(result.best) || result.best < result.score || result.best > 10000) return failed("invalid-best");
      if (result.victory !== true) return failed("invalid-victory");
      if (result.assisted !== false) return failed("invalid-assisted");
      const canonicalRank = canonicalMothchorusRank(result.score);
      if (result.rank !== canonicalRank) return failed("invalid-rank");
      if (!isCounter(result.finalVoiceCount) || result.finalVoiceCount > 24) return failed("invalid-voice-count");
      if (result.participantMode !== "solo" && result.participantMode !== "together") return failed("invalid-participant-mode");
      return deepFreeze({
        ok: true,
        code: "ok",
        result: deepFreeze({
          gameId: result.gameId,
          score: result.score,
          best: result.best,
          victory: true,
          assisted: false,
          rank: canonicalRank,
          finalVoiceCount: result.finalVoiceCount,
          participantMode: result.participantMode
        })
      });
    }

    if (result.rank !== undefined && (typeof result.rank !== "string" || !result.rank || result.rank.length > 48)) {
      return failed("invalid-rank");
    }
    if (result.best !== undefined && !isCounter(result.best)) return failed("invalid-best");
    return deepFreeze({
      ok: true,
      code: "ok",
      result: deepFreeze({
        gameId: result.gameId,
        score: result.score,
        victory: result.victory,
        assisted: result.assisted,
        rank: result.rank || null
      })
    });
  }

  function seedEligibilityCanonical(profile, result) {
    const definition = GAME_DEFINITIONS[result.gameId];
    if (!definition.seedEligible) {
      return deepFreeze({ eligible: false, reason: "not-seed-eligible", gameId: result.gameId, threshold: null, requiresVictory: false });
    }
    if (profile.games[result.gameId].masterySeed) {
      return deepFreeze({ eligible: false, reason: "already-earned", gameId: result.gameId, threshold: definition.seedThreshold, requiresVictory: definition.seedRequiresVictory });
    }
    if (result.score < definition.seedThreshold) {
      return deepFreeze({ eligible: false, reason: "below-threshold", gameId: result.gameId, threshold: definition.seedThreshold, requiresVictory: definition.seedRequiresVictory });
    }
    if (definition.seedRequiresVictory && !result.victory) {
      return deepFreeze({ eligible: false, reason: "victory-required", gameId: result.gameId, threshold: definition.seedThreshold, requiresVictory: true });
    }
    if (result.gameId === "mothchorus" && result.finalVoiceCount < definition.seedVoiceThreshold) {
      return deepFreeze({
        eligible: false,
        reason: "voices-required",
        gameId: result.gameId,
        threshold: definition.seedThreshold,
        voiceThreshold: definition.seedVoiceThreshold,
        requiresVictory: true
      });
    }
    return deepFreeze({
      eligible: true,
      reason: "eligible",
      gameId: result.gameId,
      threshold: definition.seedThreshold,
      voiceThreshold: definition.seedVoiceThreshold || null,
      requiresVictory: definition.seedRequiresVictory
    });
  }

  function seedEligibility(profile, rawResult) {
    if (!isCanonicalProfile(profile)) return failed("invalid-profile");
    const validated = validateRunResult(rawResult);
    if (!validated.ok) return validated;
    return deepFreeze({ ok: true, code: "ok", ...seedEligibilityCanonical(profile, validated.result) });
  }

  function classifyRunFeedback(beforeRecord, rawResult) {
    if (!isPlainObject(beforeRecord)
      || !isCounter(beforeRecord.standardBest)
      || !isCounter(beforeRecord.assistedBest)) return null;
    const validated = validateRunResult(rawResult);
    if (!validated.ok) return null;
    const result = validated.result;
    const lane = result.assisted ? "assisted" : "standard";
    const priorBest = result.assisted ? beforeRecord.assistedBest : beforeRecord.standardBest;
    // Subtracting floor(best / 10) is an overflow-safe ceil(best * 0.9).
    const nearBestThreshold = priorBest > 0
      ? priorBest - Math.floor(priorBest / 10)
      : 0;
    const isPersonalBest = result.score > priorBest;
    const matchedBest = priorBest > 0 && result.score === priorBest;
    const nearBest = priorBest > 0
      && result.score < priorBest
      && result.score >= nearBestThreshold;
    return deepFreeze({
      priorBest,
      isPersonalBest,
      matchedBest,
      nearBest,
      gap: result.score < priorBest ? priorBest - result.score : 0,
      lane
    });
  }

  function formatCounter(value) {
    return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  }

  function rewardDescriptor(fields) {
    return deepFreeze(fields);
  }

  function nextRewardFor(profile, gameId) {
    if (!isCanonicalProfile(profile) || !ALL_GAME_IDS.includes(gameId)) return null;

    const definition = GAME_DEFINITIONS[gameId];
    const record = profile.games[gameId];
    const growth = growthFor(gameId, record.totalScore);
    const nextGrowthStage = growth.nextThreshold === null ? null : GROWTH_STAGES[growth.level + 1];
    const growthLabel = growth.nextThreshold === null
      ? "TREE IN FULL BLOOM"
      : `${formatCounter(growth.pointsToNext)} TREE ${growth.pointsToNext === 1 ? "POINT" : "POINTS"} TO ${nextGrowthStage}`;
    const growthFields = {
      growthCurrent: record.totalScore,
      growthTarget: growth.nextThreshold,
      growthRemaining: growth.pointsToNext,
      nextGrowthStage
    };

    if (gameId === "prismbind" && !profile.unlocks.prismbind) {
      const seedCount = FOUNDATIONAL_GAME_IDS.filter((id) => profile.games[id].masterySeed).length;
      const remaining = Math.max(0, FOUNDATIONAL_GAME_IDS.length - seedCount);
      const skillLabel = `${remaining} MASTERY ${remaining === 1 ? "SEED" : "SEEDS"} TO AWAKEN PRISMBIND`;
      return rewardDescriptor({
        gameId,
        kind: "tree-unlock",
        metric: "mastery-seeds",
        current: seedCount,
        target: FOUNDATIONAL_GAME_IDS.length,
        remaining,
        nextStage: "PRISMBIND",
        requiresVictory: false,
        growthLabel: "TREE SLEEPING",
        skillLabel,
        ...growthFields
      });
    }

    if (gameId === "mothchorus" && !profile.regions.secondGroveUnlocked) {
      return rewardDescriptor({
        gameId,
        kind: "tree-unlock",
        metric: "guardian-victory",
        current: 0,
        target: 1,
        remaining: 1,
        nextStage: "CHOIR LINDEN",
        requiresVictory: true,
        growthLabel: "TREE SLEEPING",
        skillLabel: "DEFEAT PRISMBIND AND AWAKEN THE CROWNHEART",
        ...growthFields
      });
    }

    if (gameId === "prismbind" && !profile.regions.secondGroveUnlocked) {
      const skillLabel = "DEFEAT THE GUARDIAN TO REVEAL THE NEXT CLEARING";
      return rewardDescriptor({
        gameId,
        kind: "guardian-victory",
        metric: "victory",
        current: 0,
        target: 1,
        remaining: 1,
        nextStage: "SECOND GROVE",
        requiresVictory: true,
        growthLabel,
        skillLabel,
        ...growthFields
      });
    }

    if (definition.seedEligible && !record.masterySeed) {
      const currentBest = Math.max(record.standardBest, record.assistedBest);
      const remaining = Math.max(0, definition.seedThreshold - currentBest);
      const skillLabel = gameId === "mothchorus"
        ? `SCORE ${formatCounter(definition.seedThreshold)} + RETURN ${definition.seedVoiceThreshold} VOICES IN ONE CHORUS`
        : definition.seedRequiresVictory
        ? remaining > 0
          ? `${formatCounter(remaining)} BEST-RUN ${remaining === 1 ? "POINT" : "POINTS"} TO SEED · VICTORY REQUIRED`
          : `WIN WITH ${formatCounter(definition.seedThreshold)} OR MORE TO EARN THE SEED`
        : remaining > 0
          ? `${formatCounter(remaining)} BEST-RUN ${remaining === 1 ? "POINT" : "POINTS"} TO MASTERY SEED`
          : `SCORE ${formatCounter(definition.seedThreshold)} OR MORE IN ONE RUN`;
      return rewardDescriptor({
        gameId,
        kind: "mastery-seed",
        metric: "best-run",
        current: currentBest,
        target: definition.seedThreshold,
        remaining,
        nextStage: "MASTERY SEED",
        requiresVictory: definition.seedRequiresVictory,
        voiceTarget: definition.seedVoiceThreshold || null,
        growthLabel,
        skillLabel,
        ...growthFields
      });
    }

    if (growth.nextThreshold === null) {
      return rewardDescriptor({
        gameId,
        kind: "full-bloom",
        metric: "complete",
        current: record.totalScore,
        target: null,
        remaining: 0,
        nextStage: null,
        requiresVictory: false,
        growthLabel,
        skillLabel: gameId === "prismbind" ? "NEXT CLEARING REVEALED" : "MASTERY SEED EARNED",
        ...growthFields
      });
    }

    return rewardDescriptor({
      gameId,
      kind: "growth-stage",
      metric: "tree-total",
      current: record.totalScore,
      target: growth.nextThreshold,
      remaining: growth.pointsToNext,
      nextStage: nextGrowthStage,
      requiresVictory: false,
      growthLabel,
      skillLabel: gameId === "prismbind" ? "NEXT CLEARING REVEALED" : "MASTERY SEED EARNED",
      ...growthFields
    });
  }

  function growthReward(gameId, level) {
    return deepFreeze({
      type: "growth-stage",
      ceremonyKey: `growth:${gameId}:${level}`,
      gameId,
      level,
      stage: GROWTH_STAGES[level]
    });
  }

  function seedReward(gameId) {
    const reward = {
      type: "mastery-seed",
      ceremonyKey: `seed:${gameId}`,
      gameId,
      threshold: GAME_DEFINITIONS[gameId].seedThreshold
    };
    if (gameId === "mothchorus") reward.voiceThreshold = GAME_DEFINITIONS.mothchorus.seedVoiceThreshold;
    return deepFreeze(reward);
  }

  function prismbindUnlockReward() {
    return deepFreeze({
      type: "tree-unlocked",
      ceremonyKey: "unlock:prismbind",
      gameId: "prismbind"
    });
  }

  function regionReward() {
    return deepFreeze({
      type: "region-revealed",
      ceremonyKey: "region:second-grove",
      regionId: "second-grove",
      treeIds: Object.freeze(["tree05", "tree06", "tree07"])
    });
  }

  function applyResult(profile, rawResult) {
    if (!isCanonicalProfile(profile)) return failed("invalid-profile", { profile, rewards: Object.freeze([]) });
    const validated = validateRunResult(rawResult);
    if (!validated.ok) return failed(validated.code, { profile, rewards: Object.freeze([]) });

    const result = validated.result;
    if (!isGameUnlocked(profile, result.gameId)) {
      return failed("game-locked", { profile, rewards: Object.freeze([]) });
    }
    const next = cloneCanonicalProfile(profile);
    // During the staged v6 rollout, a successfully accepted legacy Standard
    // result is itself definitive evidence that onboarding was already
    // traversed. Keeping this latch causal preserves the rc.8 result reducer
    // while ensuring every produced v6 profile remains canonical.
    next.livingArcade.onboarding.firstBloomCompleted = true;
    const record = next.games[result.gameId];
    const priorGrowth = growthFor(result.gameId, record.totalScore);
    const eligibility = seedEligibilityCanonical(profile, result);
    const rewards = [];

    record.totalScore = safeAdd(record.totalScore, result.score);
    record.plays = safeAdd(record.plays, 1);
    record.completed = true;
    record.lastScore = result.score;
    if (result.rank) record.lastRank = result.rank;
    if (result.victory) record.victories = safeAdd(record.victories, 1);
    if (result.assisted) record.assistedBest = Math.max(record.assistedBest, result.score);
    else record.standardBest = Math.max(record.standardBest, result.score);

    const nextGrowth = growthFor(result.gameId, record.totalScore);
    for (let level = priorGrowth.level + 1; level <= nextGrowth.level; level += 1) {
      rewards.push(growthReward(result.gameId, level));
    }

    if (eligibility.eligible) {
      record.masterySeed = true;
      record.seedCeremonySeen = false;
      rewards.push(seedReward(result.gameId));
    }

    const allSeeds = FOUNDATIONAL_GAME_IDS.every((gameId) => next.games[gameId].masterySeed);
    if (allSeeds && !next.unlocks.prismbind) {
      next.unlocks.prismbind = true;
      next.unlocks.prismbindCeremonySeen = false;
      rewards.push(prismbindUnlockReward());
    }

    if (result.gameId === "prismbind" && result.victory
      && (!next.regions.secondGroveUnlocked || !next.regions.trees05To07Revealed)) {
      next.regions.secondGroveUnlocked = true;
      next.regions.trees05To07Revealed = true;
      next.regions.ceremonySeen = false;
      rewards.push(regionReward());
    }

    return deepFreeze({
      ok: true,
      code: "ok",
      profile: deepFreeze(next),
      result,
      rewards: Object.freeze(rewards)
    });
  }

  function pendingRewards(profile) {
    if (!isCanonicalProfile(profile)) return Object.freeze([]);
    const rewards = [];
    for (const gameId of SEED_ELIGIBLE_GAME_IDS) {
      const record = profile.games[gameId];
      if (record.masterySeed && !record.seedCeremonySeen) rewards.push(seedReward(gameId));
    }
    if (profile.unlocks.prismbind && !profile.unlocks.prismbindCeremonySeen) rewards.push(prismbindUnlockReward());
    if ((profile.regions.secondGroveUnlocked || profile.regions.trees05To07Revealed) && !profile.regions.ceremonySeen) {
      rewards.push(regionReward());
    }
    return Object.freeze(rewards);
  }

  function acknowledgeCeremony(profile, ceremonyKey) {
    if (!isCanonicalProfile(profile)) return failed("invalid-profile", { profile });
    if (typeof ceremonyKey !== "string") return failed("invalid-ceremony", { profile });
    const next = cloneCanonicalProfile(profile);
    let recognized = false;
    if (ceremonyKey.startsWith("seed:")) {
      const gameId = ceremonyKey.slice(5);
      if (SEED_ELIGIBLE_GAME_IDS.includes(gameId) && next.games[gameId].masterySeed) {
        next.games[gameId].seedCeremonySeen = true;
        recognized = true;
      }
    } else if (ceremonyKey === "unlock:prismbind" && next.unlocks.prismbind) {
      next.unlocks.prismbindCeremonySeen = true;
      recognized = true;
    } else if (ceremonyKey === "region:second-grove" && next.regions.secondGroveUnlocked) {
      next.regions.ceremonySeen = true;
      recognized = true;
    }
    if (!recognized) return failed("unknown-ceremony", { profile });
    return deepFreeze({ ok: true, code: "ok", profile: deepFreeze(next) });
  }

  function normalizeTrialScore(gameId, score) {
    const definition = GAME_DEFINITIONS[gameId];
    if (!definition || !definition.foundational || !isCounter(score)) return null;
    return Math.min(1000, Math.round(score / definition.trialBenchmark * 1000));
  }

  function scoreTrial(scores) {
    if (!hasExactKeys(scores, FOUNDATIONAL_GAME_IDS)) return failed("invalid-trial-scores");
    const normalized = {};
    for (const gameId of FOUNDATIONAL_GAME_IDS) {
      const value = normalizeTrialScore(gameId, scores[gameId]);
      if (value === null) return failed("invalid-trial-score", { gameId });
      normalized[gameId] = value;
    }
    const entries = FOUNDATIONAL_GAME_IDS.map((gameId) => ({ gameId, value: normalized[gameId] }));
    const average = entries.reduce((total, entry) => total + entry.value, 0) / entries.length;
    const weakest = entries.reduce((current, entry) => entry.value < current.value ? entry : current);
    return deepFreeze({
      ok: true,
      code: "ok",
      normalized: deepFreeze(normalized),
      average,
      weakestGameId: weakest.gameId,
      weakest: weakest.value,
      combined: Math.round(average * 0.8 + weakest.value * 0.2)
    });
  }

  function isToken(value, minimumLength) {
    return typeof value === "string"
      && value.length >= minimumLength
      && value.length <= 128
      && /^[A-Za-z0-9._:-]+$/.test(value);
  }

  function createSession(gameId, sessionId, profile = undefined) {
    if (!ALL_GAME_IDS.includes(gameId)) return failed("invalid-game-id");
    if (!isToken(sessionId, 8)) return failed("invalid-session-id");
    if (gameId === "mothchorus") {
      if (profile === undefined) return failed("profile-required");
      if (!isCanonicalProfile(profile)) return failed("invalid-profile");
      if (!isGameUnlocked(profile, gameId)) return failed("game-locked");
    }
    return deepFreeze({
      ok: true,
      code: "ok",
      session: deepFreeze({
        gameId,
        sessionId,
        status: "awaiting-ready",
        currentRunId: null,
        seenRunIds: Object.freeze([]),
        runSequence: 0
      })
    });
  }

  function isSession(session) {
    if (!isPlainObject(session) || !ALL_GAME_IDS.includes(session.gameId) || !isToken(session.sessionId, 8)) return false;
    if (!SESSION_STATUSES.includes(session.status)) return false;
    if (!(session.currentRunId === null || isToken(session.currentRunId, 4))) return false;
    if (!Array.isArray(session.seenRunIds) || !session.seenRunIds.every((runId) => isToken(runId, 4))) return false;
    if (new Set(session.seenRunIds).size !== session.seenRunIds.length) return false;
    if (!isCounter(session.runSequence)) return false;
    return true;
  }

  function validateSessionMessage(session, message) {
    if (!isSession(session)) return failed("invalid-session");
    if (!isPlainObject(message)) return failed("invalid-message");
    if (message.source !== "first-bloom-game" || message.version !== SESSION_VERSION) return failed("protocol-mismatch");
    if (message.gameId !== session.gameId) return failed("game-mismatch");
    if (message.sessionId !== session.sessionId) return failed("session-mismatch");
    if (!["game-ready", "run-start", "run-complete", "run-abandon"].includes(message.type)) return failed("invalid-message-type");
    if (message.gameId === "mothchorus" && message.type !== "game-ready" && message.runId === undefined) {
      return failed("run-id-required");
    }

    if (message.gameId === "mothchorus") {
      const baseKeys = ["source", "version", "type", "gameId", "sessionId"];
      const expectedKeys = message.type === "game-ready"
        ? baseKeys
        : message.type === "run-start" || message.type === "run-abandon"
          ? [...baseKeys, "runId"]
          : [...baseKeys, "runId", "score", "best", "victory", "rank", "finalVoiceCount", "participantMode", "assist"];
      if (!hasExactKeys(message, expectedKeys)) return failed("invalid-message");
    }

    if (message.type === "game-ready") {
      return deepFreeze({ ok: true, code: "ok", message: deepFreeze({ type: "game-ready", gameId: message.gameId, sessionId: message.sessionId }) });
    }
    if (message.runId !== undefined && !isToken(message.runId, 4)) return failed("invalid-run-id");
    const runId = message.runId || null;
    if (message.type === "run-start" || message.type === "run-abandon") {
      return deepFreeze({
        ok: true,
        code: "ok",
        message: deepFreeze({ type: message.type, gameId: message.gameId, sessionId: message.sessionId, runId })
      });
    }

    const exactMothAssist = message.gameId === "mothchorus"
      && hasExactKeys(message.assist, ["preset", "scoreChanging"])
      && message.assist.preset === "standard"
      && message.assist.scoreChanging === false;
    const assistPreset = isPlainObject(message.assist) && typeof message.assist.preset === "string"
      ? message.assist.preset.trim().toLowerCase()
      : "";
    if ((message.gameId === "mothchorus" && !exactMothAssist)
      || !isPlainObject(message.assist)
      || typeof message.assist.preset !== "string"
      || !assistPreset
      || message.assist.preset.length > 32
      || typeof message.assist.scoreChanging !== "boolean"
      || assistPreset === "autoplay"
      || assistPreset === "demo") {
      return failed("invalid-assist");
    }

    const validatedResult = validateRunResult({
      gameId: message.gameId,
      score: message.score,
      best: message.best,
      victory: message.victory,
      assisted: message.assist.scoreChanging,
      rank: message.rank,
      finalVoiceCount: message.finalVoiceCount,
      participantMode: message.participantMode
    });
    if (!validatedResult.ok) return validatedResult;
    return deepFreeze({
      ok: true,
      code: "ok",
      message: deepFreeze({
        type: "run-complete",
        gameId: message.gameId,
        sessionId: message.sessionId,
        runId,
        result: validatedResult.result
      })
    });
  }

  function transitionSession(session, rawMessage) {
    const validated = validateSessionMessage(session, rawMessage);
    if (!validated.ok) return Object.freeze({ ...validated, session });
    const message = validated.message;

    if (message.type === "game-ready") {
      if (session.status === "ready") return failed("duplicate-ready", { session });
      if (session.status !== "awaiting-ready") return failed("out-of-order", { session });
      return deepFreeze({ ok: true, code: "ready", session: deepFreeze({ ...session, status: "ready" }), result: null });
    }

    if (message.type === "run-start") {
      if (message.runId && session.seenRunIds.includes(message.runId)) return failed("duplicate-run-start", { session });
      if (session.status !== "ready" && session.status !== "completed") {
        return failed("out-of-order", { session });
      }
      const runSequence = safeAdd(session.runSequence, 1);
      const activeRunId = message.runId || `implicit:${runSequence}`;
      return deepFreeze({
        ok: true,
        code: "run-started",
        session: deepFreeze({
          ...session,
          status: "running",
          currentRunId: activeRunId,
          seenRunIds: message.runId
            ? Object.freeze([...session.seenRunIds, message.runId])
            : session.seenRunIds,
          runSequence
        }),
        result: null
      });
    }

    if (message.type === "run-abandon") {
      if (session.status !== "running") return failed("out-of-order", { session });
      if (message.runId && session.currentRunId !== message.runId) return failed("out-of-order", { session });
      return deepFreeze({
        ok: true,
        code: "run-abandoned",
        session: deepFreeze({ ...session, status: "ready", currentRunId: null }),
        result: null
      });
    }

    if (session.status === "completed" && (!message.runId || session.currentRunId === message.runId)) {
      return failed("duplicate-run-complete", { session });
    }
    if (session.status !== "running" || (message.runId && session.currentRunId !== message.runId)) {
      return failed("out-of-order", { session });
    }
    return deepFreeze({
      ok: true,
      code: "run-completed",
      session: deepFreeze({ ...session, status: "completed" }),
      result: message.result
    });
  }

  function createExportBundle(profile, exportedAt = null) {
    if (!isCanonicalProfile(profile)) return failed("invalid-profile");
    if (!(exportedAt === null || (typeof exportedAt === "string" && exportedAt.length <= 64))) {
      return failed("invalid-export-time");
    }
    return deepFreeze({
      ok: true,
      code: "ok",
      bundle: deepFreeze({
        kind: EXPORT_KIND,
        bundleVersion: EXPORT_VERSION,
        profileVersion: PROFILE_VERSION,
        exportedAt,
        profile: deepFreeze(cloneCanonicalProfile(profile))
      })
    });
  }

  function validateExportBundle(bundle) {
    if (!hasExactKeys(bundle, ["kind", "bundleVersion", "profileVersion", "exportedAt", "profile"])) {
      return failed("invalid-export-bundle");
    }
    if (bundle.kind !== EXPORT_KIND) return failed("invalid-export-kind");
    if (bundle.bundleVersion !== EXPORT_VERSION) return failed("unsupported-export-version");
    if (![PROFILE_VERSION, PROFILE_V5_VERSION, LEGACY_PROFILE_VERSION].includes(bundle.profileVersion)) {
      return failed("unsupported-profile-version");
    }
    if (!(bundle.exportedAt === null || (typeof bundle.exportedAt === "string" && bundle.exportedAt.length <= 64))) {
      return failed("invalid-export-time");
    }
    if (bundle.profileVersion === LEGACY_PROFILE_VERSION) {
      if (!isCanonicalProfileV4(bundle.profile, false)) return failed("invalid-export-profile");
      const migratedV5 = migrateCanonicalV4(bundle.profile);
      if (!isCanonicalProfileV5(migratedV5)) return failed("invalid-export-profile");
      const migrated = migrateCanonicalV5(migratedV5);
      if (!isCanonicalProfile(migrated)) return failed("invalid-export-profile");
      return deepFreeze({
        ok: true,
        code: "ok",
        sourceProfileVersion: LEGACY_PROFILE_VERSION,
        migrated: true,
        profile: deepFreeze(migrated)
      });
    }
    if (bundle.profileVersion === PROFILE_V5_VERSION) {
      if (!isCanonicalProfileV5(bundle.profile)) return failed("invalid-export-profile");
      const migrated = migrateCanonicalV5(bundle.profile);
      if (!isCanonicalProfile(migrated)) return failed("invalid-export-profile");
      return deepFreeze({
        ok: true,
        code: "ok",
        sourceProfileVersion: PROFILE_V5_VERSION,
        migrated: true,
        profile: deepFreeze(migrated)
      });
    }
    if (!isCanonicalProfile(bundle.profile)) return failed("invalid-export-profile");
    return deepFreeze({
      ok: true,
      code: "ok",
      sourceProfileVersion: PROFILE_VERSION,
      migrated: false,
      profile: deepFreeze(cloneCanonicalProfile(bundle.profile))
    });
  }

  return Object.freeze({
    PROFILE_VERSION,
    SESSION_VERSION,
    EXPORT_KIND,
    EXPORT_VERSION,
    MAX_COUNTER,
    FIRST_TREE_PART_COUNT,
    FOUNDATIONAL_GAME_IDS,
    SEED_ELIGIBLE_GAME_IDS,
    ALL_GAME_IDS,
    LUMENLOOM_MODE_IDS,
    LUMENLOOM_REMIX_MODE_IDS,
    LUMENLOOM_MODE_MAX_SCORES,
    GROWTH_STAGES,
    GAME_DEFINITIONS,
    MOTHCHORUS_RANKS,
    GROVE_RANKS,
    defaultProfile,
    migrateProfile,
    isCanonicalProfile,
    completeFirstBloom,
    isLumenloomModeAvailable,
    recordLumenloomRemixStart,
    applyLumenloomRemixResult,
    growthFor,
    foundationalMarks,
    groveRankForMarks,
    isGameUnlocked,
    canonicalLumenloomRank,
    canonicalMothchorusRank,
    validateRunResult,
    seedEligibility,
    classifyRunFeedback,
    nextRewardFor,
    applyResult,
    pendingRewards,
    acknowledgeCeremony,
    normalizeTrialScore,
    scoreTrial,
    createSession,
    validateSessionMessage,
    transitionSession,
    createExportBundle,
    validateExportBundle
  });
});
