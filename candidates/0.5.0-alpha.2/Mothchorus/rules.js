(function initializeMothchorusRules(root, factory) {
  "use strict";

  const rules = factory();
  if (typeof module === "object" && module.exports) module.exports = rules;
  else root.MothchorusRules = rules;
})(typeof globalThis !== "undefined" ? globalThis : this, function createMothchorusRules() {
  "use strict";

  function deepFreeze(value) {
    if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
    Object.values(value).forEach(deepFreeze);
    return Object.freeze(value);
  }

  const CANON = deepFreeze({
    worldWidth: 1000,
    worldHeight: 1000,
    logicalVoiceCount: 24,
    seedMinimumVoices: 18,
    fixedTicksPerSecond: 60,
  });

  // D-026 Candidate values. They live in one frozen object so playtest tuning
  // is deliberate, reviewable, and unable to drift between runtime modules.
  const TUNING = deepFreeze({
    ticksPerSecond: CANON.fixedTicksPerSecond,
    runSeconds: 84,
    runTicks: 5040,
    phaseTicks: [1440, 1800, 1800],
    voiceCount: CANON.logicalVoiceCount,
    cosmeticMotesMaximum: 12,
    gateCount: 15,
    gatesPerPhase: [4, 5, 6],
    markedChordCount: 5,
    moonBloomCount: 5,
    pulseRechargeTicks: 26,
    chordWindows: {
      perfect: 5,
      clear: 11,
      soft: 19,
    },
    chordRefractoryTicks: 60,
    chordProtectionTicks: 54,
    seedScore: 6500,
    flawlessScore: 10000,
    scoring: {
      gatePerVoice: 10,
      fullChorusGate: 100,
      markedChord: {
        perfect: 250,
        clear: 175,
        soft: 100,
      },
      moonBloom: 300,
      finalePerVoice: 75,
      perfectFinale: 350,
      rescuePerVoice: 20,
      rescueDebtFraction: 0.5,
    },
    pools: {
      trailSegments: 192,
      normalParticles: 96,
      finaleParticles: 180,
    },
  });

  const PHASES = deepFreeze([
    { id: "call", name: "THE CALL", index: 0, startTick: 0, endTick: 1440, durationTicks: 1440, gateCount: 4 },
    { id: "answer", name: "THE ANSWER", index: 1, startTick: 1440, endTick: 3240, durationTicks: 1800, gateCount: 5 },
    { id: "chorus", name: "THE CHORUS", index: 2, startTick: 3240, endTick: 5040, durationTicks: 1800, gateCount: 6 },
  ]);

  const RANKS = deepFreeze([
    { threshold: 0, id: "first-voice", name: "FIRST VOICE" },
    { threshold: 4500, id: "mooncaller", name: "MOONCALLER" },
    { threshold: 6500, id: "linden-keeper", name: "LINDEN KEEPER" },
    { threshold: 8000, id: "heartlight-choir", name: "HEARTLIGHT CHOIR" },
    { threshold: 9500, id: "crown-chorus", name: "CROWN CHORUS" },
  ]);

  const SIDES = Object.freeze(["left", "right"]);
  const PARTICIPANT_MODES = Object.freeze(["solo", "together"]);
  const CHORD_QUALITIES = Object.freeze(["perfect", "clear", "soft"]);

  function isSafeInteger(value, minimum = 0, maximum = Number.MAX_SAFE_INTEGER) {
    return Number.isSafeInteger(value) && value >= minimum && value <= maximum;
  }

  function integer(value, name, minimum = 0, maximum = Number.MAX_SAFE_INTEGER) {
    if (!isSafeInteger(value, minimum, maximum)) {
      throw new RangeError(`${name} must be a safe integer from ${minimum} through ${maximum}.`);
    }
    return value;
  }

  function sideName(side) {
    if (!SIDES.includes(side)) throw new TypeError('side must be "left" or "right".');
    return side;
  }

  function isParticipantMode(value) {
    return PARTICIPANT_MODES.includes(value);
  }

  function phaseForTick(rawTick) {
    const tick = integer(rawTick, "tick");
    const phase = PHASES.find((candidate) => tick < candidate.endTick) || PHASES[PHASES.length - 1];
    const elapsedTicks = Math.min(phase.durationTicks, Math.max(0, tick - phase.startTick));
    return deepFreeze({
      ...phase,
      elapsedTicks,
      remainingTicks: Math.max(0, phase.endTick - tick),
      progress: elapsedTicks / phase.durationTicks,
      runComplete: tick >= TUNING.runTicks,
    });
  }

  function isRunComplete(tick) {
    return integer(tick, "tick") >= TUNING.runTicks;
  }

  function chordQuality(rawDifference) {
    if (typeof rawDifference !== "number" || !Number.isFinite(rawDifference)) return null;
    const difference = Math.abs(rawDifference);
    if (difference <= TUNING.chordWindows.perfect) return "perfect";
    if (difference <= TUNING.chordWindows.clear) return "clear";
    if (difference <= TUNING.chordWindows.soft) return "soft";
    return null;
  }

  function chordScore(quality, marked = true) {
    if (!marked || !CHORD_QUALITIES.includes(quality)) return 0;
    return TUNING.scoring.markedChord[quality];
  }

  function makePulseState(startTick = 0) {
    const tick = integer(startTick, "startTick");
    return deepFreeze({
      leftReadyTick: tick,
      rightReadyTick: tick,
      lastLeftTick: null,
      lastRightTick: null,
      lastAcceptedTick: null,
      chordReadyTick: tick,
      protectionUntilTick: tick,
      acceptedPulseCount: 0,
      chordCount: 0,
    });
  }

  function isPulseState(state) {
    if (!state || typeof state !== "object" || Array.isArray(state)) return false;
    if (!isSafeInteger(state.leftReadyTick) || !isSafeInteger(state.rightReadyTick)) return false;
    if (!(state.lastLeftTick === null || isSafeInteger(state.lastLeftTick))) return false;
    if (!(state.lastRightTick === null || isSafeInteger(state.lastRightTick))) return false;
    if (!(state.lastAcceptedTick === null || isSafeInteger(state.lastAcceptedTick))) return false;
    if (!isSafeInteger(state.chordReadyTick) || !isSafeInteger(state.protectionUntilTick)) return false;
    if (!isSafeInteger(state.acceptedPulseCount) || !isSafeInteger(state.chordCount)) return false;
    return true;
  }

  function pulseRechargeRemaining(state, rawSide, rawTick) {
    if (!isPulseState(state)) throw new TypeError("state is not a Mothchorus pulse state.");
    const side = sideName(rawSide);
    const tick = integer(rawTick, "tick");
    const readyTick = state[side === "left" ? "leftReadyTick" : "rightReadyTick"];
    return Math.max(0, readyTick - tick);
  }

  function applyPulse(state, rawSide, rawTick) {
    if (!isPulseState(state)) throw new TypeError("state is not a Mothchorus pulse state.");
    const side = sideName(rawSide);
    const tick = integer(rawTick, "tick");
    if (state.lastAcceptedTick !== null && tick < state.lastAcceptedTick) {
      throw new RangeError("pulse ticks must be monotonic.");
    }

    const ownReadyKey = side === "left" ? "leftReadyTick" : "rightReadyTick";
    if (tick < state[ownReadyKey]) {
      return deepFreeze({
        accepted: false,
        reason: "recharging",
        side,
        tick,
        forceDirection: 0,
        rechargeRemaining: state[ownReadyKey] - tick,
        chord: null,
        state,
      });
    }

    const ownLastKey = side === "left" ? "lastLeftTick" : "lastRightTick";
    const oppositeLastKey = side === "left" ? "lastRightTick" : "lastLeftTick";
    const oppositeTick = state[oppositeLastKey];
    const difference = oppositeTick === null ? null : Math.abs(tick - oppositeTick);
    const pairedQuality = difference === null ? null : chordQuality(difference);
    const chordAllowed = pairedQuality !== null && tick >= state.chordReadyTick;
    const protectionUntilTick = chordAllowed
      ? Math.max(state.protectionUntilTick, tick + TUNING.chordProtectionTicks)
      : state.protectionUntilTick;

    const nextState = deepFreeze({
      ...state,
      [ownReadyKey]: tick + TUNING.pulseRechargeTicks,
      [ownLastKey]: tick,
      lastAcceptedTick: tick,
      chordReadyTick: chordAllowed ? tick + TUNING.chordRefractoryTicks : state.chordReadyTick,
      protectionUntilTick,
      acceptedPulseCount: state.acceptedPulseCount + 1,
      chordCount: state.chordCount + (chordAllowed ? 1 : 0),
    });

    const chord = chordAllowed
      ? deepFreeze({
        quality: pairedQuality,
        differenceTicks: difference,
        atTick: tick,
        protectionUntilTick,
      })
      : null;

    return deepFreeze({
      accepted: true,
      reason: chord ? "chord" : (pairedQuality ? "chord-refractory" : "accepted"),
      side,
      tick,
      forceDirection: side === "left" ? 1 : -1,
      rechargeRemaining: TUNING.pulseRechargeTicks,
      chord,
      state: nextState,
    });
  }

  function normalizeVoiceCounts(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new TypeError("voice counts must be an object.");
    }
    const active = integer(value.active, "active voices", 0, CANON.logicalVoiceCount);
    const lost = integer(value.lost, "lost voices", 0, CANON.logicalVoiceCount);
    const returning = integer(value.returning, "returning voices", 0, CANON.logicalVoiceCount);
    if (active + lost + returning !== CANON.logicalVoiceCount) {
      throw new RangeError(`voice counts must conserve exactly ${CANON.logicalVoiceCount} logical voices.`);
    }
    return deepFreeze({ active, lost, returning });
  }

  function makeVoiceLedger() {
    return normalizeVoiceCounts({ active: CANON.logicalVoiceCount, lost: 0, returning: 0 });
  }

  function voiceTotal(ledger) {
    const counts = normalizeVoiceCounts(ledger);
    return counts.active + counts.lost + counts.returning;
  }

  function moveVoices(rawLedger, from, to, rawRequested) {
    const ledger = normalizeVoiceCounts(rawLedger);
    const requested = integer(rawRequested, "requested voices", 0, CANON.logicalVoiceCount);
    const moved = Math.min(requested, ledger[from]);
    const next = normalizeVoiceCounts({
      ...ledger,
      [from]: ledger[from] - moved,
      [to]: ledger[to] + moved,
    });
    return deepFreeze({ ledger: next, moved });
  }

  function scatterVoices(ledger, requested) {
    return moveVoices(ledger, "active", "lost", requested);
  }

  function beginRescue(ledger, requested) {
    return moveVoices(ledger, "lost", "returning", requested);
  }

  function completeRescue(ledger, requested) {
    return moveVoices(ledger, "returning", "active", requested);
  }

  function rescueVoices(ledger, requested) {
    return moveVoices(ledger, "lost", "active", requested);
  }

  function gateScore({ voiceCount, cleared = false, fullChorus } = {}) {
    // voiceCount is authoritative. The cleared/fullChorus fallback preserves
    // the original call shape for older callers, but can represent only the
    // minimum non-full passage and must not be used for final scoring.
    const passedVoices = voiceCount === undefined
      ? (cleared ? (fullChorus === true ? CANON.logicalVoiceCount : 1) : 0)
      : integer(voiceCount, "voiceCount", 0, CANON.logicalVoiceCount);
    const awardFullChorus = fullChorus === undefined
      ? passedVoices === CANON.logicalVoiceCount
      : fullChorus === true && passedVoices === CANON.logicalVoiceCount;
    return passedVoices * TUNING.scoring.gatePerVoice
      + (awardFullChorus ? TUNING.scoring.fullChorusGate : 0);
  }

  function moonBloomScore(collected = true) {
    return collected ? TUNING.scoring.moonBloom : 0;
  }

  function finaleScore(rawFinalVoiceCount, completed = true) {
    const finalVoiceCount = integer(rawFinalVoiceCount, "finalVoiceCount", 0, CANON.logicalVoiceCount);
    if (!completed) return 0;
    return finalVoiceCount * TUNING.scoring.finalePerVoice
      + (finalVoiceCount === CANON.logicalVoiceCount ? TUNING.scoring.perfectFinale : 0);
  }

  function rescueScore(rawRescuedVoices, rawGateDebt) {
    const rescuedVoices = integer(rawRescuedVoices, "rescuedVoices", 0, CANON.logicalVoiceCount);
    const gateDebt = integer(rawGateDebt, "gateDebt");
    const voiceCap = rescuedVoices * TUNING.scoring.rescuePerVoice;
    const debtCap = Math.floor(gateDebt * TUNING.scoring.rescueDebtFraction);
    return Math.min(voiceCap, debtCap);
  }

  function seedEvaluation({ score, finalVoiceCount, completed = true } = {}) {
    integer(score, "score");
    integer(finalVoiceCount, "finalVoiceCount", 0, CANON.logicalVoiceCount);
    if (typeof completed !== "boolean") throw new TypeError("completed must be a boolean.");
    const scoreMet = score >= TUNING.seedScore;
    const voicesMet = finalVoiceCount >= CANON.seedMinimumVoices;
    const reasons = [];
    if (!completed) reasons.push("run-incomplete");
    if (!scoreMet) reasons.push("below-score");
    if (!voicesMet) reasons.push("below-voices");
    return deepFreeze({
      eligible: completed && scoreMet && voicesMet,
      completed,
      scoreMet,
      voicesMet,
      score,
      finalVoiceCount,
      scoreThreshold: TUNING.seedScore,
      voiceThreshold: CANON.seedMinimumVoices,
      reasons: Object.freeze(reasons),
    });
  }

  function rankForScore(rawScore) {
    const score = integer(rawScore, "score");
    let rank = RANKS[0];
    for (const candidate of RANKS) if (score >= candidate.threshold) rank = candidate;
    return rank;
  }

  function gateVoiceCountsForScore(options, finalVoiceCount, completed) {
    let source;
    let counts;
    if (options.gateVoiceCounts !== undefined) {
      if (!Array.isArray(options.gateVoiceCounts) || options.gateVoiceCounts.length > TUNING.gateCount) {
        throw new RangeError(`gateVoiceCounts must contain no more than ${TUNING.gateCount} resolved gates.`);
      }
      counts = options.gateVoiceCounts.map((count, index) => integer(
        count,
        `gateVoiceCounts[${index}]`,
        0,
        CANON.logicalVoiceCount,
      ));
      source = "measured";
    } else {
      // Compatibility for pre-measurement callers. Non-full passages use the
      // final retained chorus as a conservative estimate; simulation results
      // must supply measured per-gate counts for authoritative scoring.
      const gatesCleared = integer(options.gatesCleared ?? 0, "gatesCleared", 0, TUNING.gateCount);
      const fullChorusGates = integer(options.fullChorusGates ?? 0, "fullChorusGates", 0, gatesCleared);
      const partialEstimate = Math.min(CANON.logicalVoiceCount - 1, Math.max(1, finalVoiceCount));
      counts = [
        ...Array(fullChorusGates).fill(CANON.logicalVoiceCount),
        ...Array(gatesCleared - fullChorusGates).fill(partialEstimate),
      ];
      source = "legacy-estimate";
    }

    const providedGateCount = counts.length;
    if (completed && counts.length < TUNING.gateCount) {
      // A completed run cannot erase missed gates by omitting them. Missing
      // entries are resolved zero-voice passages and therefore retain debt.
      counts = [...counts, ...Array(TUNING.gateCount - counts.length).fill(0)];
    }
    return deepFreeze({
      source,
      providedGateCount,
      counts: Object.freeze(counts),
    });
  }

  function scoreRun(options = {}) {
    const participantMode = options.participantMode ?? "solo";
    if (!isParticipantMode(participantMode)) throw new TypeError('participantMode must be "solo" or "together".');
    const completed = options.completed ?? true;
    if (typeof completed !== "boolean") throw new TypeError("completed must be a boolean.");

    const moonBlooms = integer(options.moonBlooms ?? 0, "moonBlooms", 0, TUNING.moonBloomCount);
    const finalVoiceCount = integer(options.finalVoiceCount ?? CANON.logicalVoiceCount, "finalVoiceCount", 0, CANON.logicalVoiceCount);
    const rescuedVoices = integer(options.rescuedVoices ?? 0, "rescuedVoices", 0, CANON.logicalVoiceCount);
    const gateInput = gateVoiceCountsForScore(options, finalVoiceCount, completed);
    const gateVoiceCounts = gateInput.counts;
    const gatesCleared = gateVoiceCounts.filter((count) => count > 0).length;
    const fullChorusGates = gateVoiceCounts.filter((count) => count === CANON.logicalVoiceCount).length;
    if (options.gateVoiceCounts !== undefined && options.gatesCleared !== undefined
      && integer(options.gatesCleared, "gatesCleared", 0, TUNING.gateCount) !== gatesCleared) {
      throw new RangeError("gatesCleared must match measured gateVoiceCounts.");
    }
    if (options.gateVoiceCounts !== undefined && options.fullChorusGates !== undefined
      && integer(options.fullChorusGates, "fullChorusGates", 0, TUNING.gateCount) !== fullChorusGates) {
      throw new RangeError("fullChorusGates must match measured gateVoiceCounts.");
    }
    const markedChordQualities = options.markedChordQualities ?? [];
    if (!Array.isArray(markedChordQualities) || markedChordQualities.length > TUNING.markedChordCount) {
      throw new RangeError(`markedChordQualities must contain no more than ${TUNING.markedChordCount} entries.`);
    }
    for (const quality of markedChordQualities) {
      if (!(quality === null || quality === "miss" || CHORD_QUALITIES.includes(quality))) {
        throw new TypeError("marked Chord qualities must be perfect, clear, soft, miss, or null.");
      }
    }

    const gatePassageScore = gateVoiceCounts.reduce(
      (sum, voiceCount) => sum + voiceCount * TUNING.scoring.gatePerVoice,
      0,
    );
    const fullChorusScore = fullChorusGates * TUNING.scoring.fullChorusGate;
    const flawlessGateValue = CANON.logicalVoiceCount * TUNING.scoring.gatePerVoice
      + TUNING.scoring.fullChorusGate;
    const gateMaximum = gateVoiceCounts.length * flawlessGateValue;
    const gateDebt = Math.max(0, gateMaximum - gatePassageScore - fullChorusScore);
    const rescueMaximum = rescueScore(rescuedVoices, gateDebt);
    const rescuePointsSource = options.rescuePoints === undefined ? "calculated-maximum" : "measured-ledger";
    const rescuePoints = options.rescuePoints === undefined
      ? rescueMaximum
      : integer(options.rescuePoints, "rescuePoints", 0, rescueMaximum);
    const categories = deepFreeze({
      gates: gatePassageScore,
      fullChorus: fullChorusScore,
      chords: markedChordQualities.reduce((sum, quality) => sum + chordScore(quality), 0),
      moonBlooms: moonBlooms * TUNING.scoring.moonBloom,
      finale: finaleScore(finalVoiceCount, completed),
      rescues: rescuePoints,
    });
    const rawScore = Object.values(categories).reduce((sum, value) => sum + value, 0);
    const score = Math.min(TUNING.flawlessScore, rawScore);
    const seed = seedEvaluation({ score, finalVoiceCount, completed });
    const rank = rankForScore(score);

    return deepFreeze({
      participantMode,
      completed,
      gateVoiceCounts,
      gateVoiceCountsSource: gateInput.source,
      providedGateCount: gateInput.providedGateCount,
      resolvedGateCount: gateVoiceCounts.length,
      gatesCleared,
      fullChorusGates,
      gateMaximum,
      gateDebt,
      rescueMaximum,
      rescuePointsSource,
      moonBlooms,
      finalVoiceCount,
      rescuedVoices,
      markedChordQualities: Object.freeze([...markedChordQualities]),
      categories,
      rawScore,
      score,
      rank,
      seed,
    });
  }

  return deepFreeze({
    CANON,
    TUNING,
    PHASES,
    RANKS,
    SIDES,
    PARTICIPANT_MODES,
    CHORD_QUALITIES,
    phaseForTick,
    isRunComplete,
    chordQuality,
    chordScore,
    makePulseState,
    isPulseState,
    pulseRechargeRemaining,
    applyPulse,
    normalizeVoiceCounts,
    makeVoiceLedger,
    voiceTotal,
    scatterVoices,
    beginRescue,
    completeRescue,
    rescueVoices,
    gateScore,
    moonBloomScore,
    finaleScore,
    rescueScore,
    seedEvaluation,
    rankForScore,
    scoreRun,
    isParticipantMode,
  });
});
