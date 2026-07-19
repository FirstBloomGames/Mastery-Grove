(function initializeMasteryGroveCarousel(root, factory) {
  "use strict";

  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.MasteryGroveCarousel = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createMasteryGroveCarousel() {
  "use strict";

  const STATE_VERSION = 1;
  const POSITION_COUNT = 10;
  const MOBILE_BREAKPOINT_PX = 600;
  const MOBILE_PAGE_SIZE = 5;
  const SWIPE_THRESHOLD_PX = 36;
  const SWIPE_AXIS_RATIO = 1.25;
  const LUMENLOOM_MODE_IDS = Object.freeze([
    "standard",
    "petalRush",
    "shiftingConstellation",
    "hollowRush"
  ]);

  const ACTIONS = Object.freeze({
    SELECT_POSITION: "select-position",
    SELECT_GAME: "select-game",
    MOVE_SELECTION: "move-selection",
    SET_PAGE: "set-page",
    SELECT_MODE: "select-mode"
  });

  function deepFreeze(value) {
    const freezeable = value && (typeof value === "object" || typeof value === "function");
    if (!freezeable || Object.isFrozen(value)) return value;
    Object.values(value).forEach(deepFreeze);
    return Object.freeze(value);
  }

  const IMPLEMENTED_TREES = [
    {
      position: 1,
      number: "TREE 01",
      gameId: "lumenloom",
      title: "LUMENLOOM",
      tree: "THE LANTERN WILLOW",
      description: "Stitch flowers into luminous shapes and wake a garden from shadow.",
      runLabel: "3–5 MINUTES · MOVE & WEAVE",
      path: "../Lumenloom/index.html",
      standaloneKey: "lumenloom-best",
      importStandaloneBest: true,
      color: "#ffd773",
      symbol: "✦",
      accessibleLabel: "Tree 01, Lumenloom, the Lantern Willow",
      implemented: true
    },
    {
      position: 2,
      number: "TREE 02",
      gameId: "bloomfold",
      title: "BLOOMFOLD",
      tree: "THE RECURSIVE ORCHID",
      description: "Orbit through a living fractal and preserve the pattern your choices create.",
      runLabel: "90 SECONDS · POINT TO ORBIT",
      path: "../Bloomfold/index.html",
      standaloneKey: "bloomfold-best",
      importStandaloneBest: true,
      color: "#82f4ee",
      symbol: "◇",
      accessibleLabel: "Tree 02, Bloomfold, the Recursive Orchid",
      implemented: true
    },
    {
      position: 3,
      number: "TREE 03",
      gameId: "ripplewake",
      title: "RIPPLEWAKE",
      tree: "THE ECHO ALDER",
      description: "Skip moonstones across a living lake and bloom the water with every perfect touch.",
      runLabel: "70–75 SECONDS · AIM & TIME",
      path: "../Ripplewake/index.html",
      standaloneKey: "ripplewake-best",
      importStandaloneBest: true,
      color: "#ff9b85",
      symbol: "≋",
      accessibleLabel: "Tree 03, Ripplewake, the Echo Alder",
      implemented: true
    },
    {
      position: 4,
      number: "TREE 04 · GUARDIAN",
      gameId: "prismbind",
      title: "PRISMBIND",
      tree: "THE CONCORD BANYAN",
      description: "Prove all three foundational disciplines, then awaken the living Crownheart.",
      runLabel: null,
      path: "../Prismbind/index.html",
      standaloneKey: "prismbind-best",
      importStandaloneBest: true,
      color: "#d7c6ff",
      symbol: "◆",
      accessibleLabel: "Tree 04, Prismbind, the Concord Banyan",
      implemented: true
    },
    {
      position: 5,
      number: "TREE 05 · SECOND GROVE",
      gameId: "mothchorus",
      title: "MOTHCHORUS",
      tree: "THE CHOIR LINDEN",
      description: "Pulse from opposite sides, guide a luminous flock, and bring its many voices home as one song.",
      runLabel: null,
      path: "../Mothchorus/index.html",
      standaloneKey: "mothchorus-best-v1",
      importStandaloneBest: false,
      color: "#80e5c4",
      symbol: "♡",
      accessibleLabel: "Tree 05, Mothchorus, the Choir Linden",
      implemented: true
    }
  ];

  const SLEEPING_TREES = Array.from({ length: 5 }, (_, index) => {
    const position = index + 6;
    const number = String(position).padStart(2, "0");
    return {
      position,
      number: `TREE ${number}`,
      gameId: null,
      title: null,
      tree: null,
      description: null,
      runLabel: null,
      path: null,
      standaloneKey: null,
      importStandaloneBest: false,
      color: null,
      symbol: "•",
      accessibleLabel: `Sleeping Tree ${number}`,
      implemented: false
    };
  });

  const REGISTRY = deepFreeze([...IMPLEMENTED_TREES, ...SLEEPING_TREES]);
  const ENTRY_BY_GAME_ID = new Map(
    REGISTRY.filter((entry) => entry.gameId).map((entry) => [entry.gameId, entry])
  );

  function clampPosition(value) {
    if (!Number.isFinite(value)) return null;
    return Math.min(POSITION_COUNT, Math.max(1, Math.trunc(value)));
  }

  function pageForPosition(position) {
    const safePosition = clampPosition(position);
    return safePosition === null ? null : Math.floor((safePosition - 1) / MOBILE_PAGE_SIZE);
  }

  function isState(state) {
    return Boolean(
      state
      && typeof state === "object"
      && !Array.isArray(state)
      && Object.keys(state).length === 4
      && state.version === STATE_VERSION
      && Number.isInteger(state.selectedPosition)
      && state.selectedPosition >= 1
      && state.selectedPosition <= POSITION_COUNT
      && state.selectedModes
      && typeof state.selectedModes === "object"
      && !Array.isArray(state.selectedModes)
      && Object.keys(state.selectedModes).length === 1
      && typeof state.selectedModes.lumenloom === "string"
      && LUMENLOOM_MODE_IDS.includes(state.selectedModes.lumenloom)
      && state.rail
      && typeof state.rail === "object"
      && !Array.isArray(state.rail)
      && Object.keys(state.rail).length === 2
      && Number.isInteger(state.rail.page)
      && state.rail.page >= 0
      && state.rail.page <= 1
      && Number.isInteger(state.rail.rovingPosition)
      && state.rail.rovingPosition >= 1
      && state.rail.rovingPosition <= POSITION_COUNT
      && pageForPosition(state.rail.rovingPosition) === state.rail.page
    );
  }

  function finalize(state) {
    if (!isState(state)) throw new TypeError("Living Carousel requires a valid state.");
    return deepFreeze(state);
  }

  function createInitialState() {
    return finalize({
      version: STATE_VERSION,
      selectedPosition: 1,
      selectedModes: { lumenloom: "petalRush" },
      rail: {
        page: 0,
        rovingPosition: 1
      }
    });
  }

  function selectPosition(state, rawPosition) {
    if (!isState(state)) throw new TypeError("Living Carousel requires a valid state.");
    const position = clampPosition(rawPosition);
    if (position === null) return state;
    const page = pageForPosition(position);
    if (position === state.selectedPosition
      && position === state.rail.rovingPosition
      && page === state.rail.page) return state;
    return finalize({
      ...state,
      selectedPosition: position,
      rail: {
        page,
        rovingPosition: position
      }
    });
  }

  function selectGame(state, gameId) {
    if (!isState(state)) throw new TypeError("Living Carousel requires a valid state.");
    const entry = ENTRY_BY_GAME_ID.get(gameId);
    return entry ? selectPosition(state, entry.position) : state;
  }

  function moveSelection(state, direction) {
    if (!isState(state)) throw new TypeError("Living Carousel requires a valid state.");
    if (!Number.isFinite(direction) || direction === 0) return state;
    const step = direction < 0 ? -1 : 1;
    return selectPosition(state, state.selectedPosition + step);
  }

  function setPage(state, rawPage) {
    if (!isState(state)) throw new TypeError("Living Carousel requires a valid state.");
    if (!Number.isFinite(rawPage)) return state;
    const page = Math.min(1, Math.max(0, Math.trunc(rawPage)));
    const rovingPosition = page * MOBILE_PAGE_SIZE + 1;
    if (state.rail.page === page && state.rail.rovingPosition === rovingPosition) return state;
    return finalize({
      ...state,
      rail: {
        page,
        rovingPosition
      }
    });
  }

  function selectMode(state, gameId, modeId, modeRules) {
    if (!isState(state)) throw new TypeError("Living Carousel requires a valid state.");
    if (gameId !== "lumenloom"
      || typeof modeId !== "string"
      || !Array.isArray(modeRules?.MODE_IDS)
      || !modeRules.MODE_IDS.includes(modeId)
      || state.selectedModes.lumenloom === modeId) return state;
    return finalize({
      ...state,
      selectedModes: {
        ...state.selectedModes,
        lumenloom: modeId
      }
    });
  }

  function reduce(state, action, dependencies = {}) {
    if (!isState(state)) throw new TypeError("Living Carousel requires a valid state.");
    if (!action || typeof action !== "object") return state;
    if (action.type === ACTIONS.SELECT_POSITION) return selectPosition(state, action.position);
    if (action.type === ACTIONS.SELECT_GAME) return selectGame(state, action.gameId);
    if (action.type === ACTIONS.MOVE_SELECTION) return moveSelection(state, action.direction);
    if (action.type === ACTIONS.SET_PAGE) return setPage(state, action.page);
    if (action.type === ACTIONS.SELECT_MODE) {
      return selectMode(state, action.gameId, action.modeId, dependencies.modeRules);
    }
    return state;
  }

  function assertViewDependencies(profile, dependencies) {
    const progression = dependencies?.progression;
    const modeRules = dependencies?.modeRules;
    if (!profile || typeof profile !== "object") {
      throw new TypeError("Living Carousel view projection requires a profile.");
    }
    for (const name of [
      "isGameUnlocked",
      "growthFor",
      "nextRewardFor",
      "isLumenloomModeAvailable"
    ]) {
      if (typeof progression?.[name] !== "function") {
        throw new TypeError(`Living Carousel requires progression.${name}().`);
      }
    }
    if (!Array.isArray(modeRules?.MODE_IDS) || !modeRules.MODES) {
      throw new TypeError("Living Carousel requires canonical Lumenloom mode rules.");
    }
    if (!Array.isArray(progression.FOUNDATIONAL_GAME_IDS)) {
      throw new TypeError("Living Carousel requires canonical foundational game IDs.");
    }
    return { progression, modeRules };
  }

  function isTrialAvailable(profile, dependencies) {
    const { progression } = assertViewDependencies(profile, dependencies);
    return progression.FOUNDATIONAL_GAME_IDS.length === 3
      && progression.FOUNDATIONAL_GAME_IDS.every(
        (gameId) => profile.games?.[gameId]?.completed === true
      );
  }

  function effectiveMode(state, profile, dependencies, options = {}) {
    if (!isState(state)) throw new TypeError("Living Carousel requires a valid state.");
    const { progression } = assertViewDependencies(profile, dependencies);
    if (options.trial === true) return "standard";
    const entry = REGISTRY[state.selectedPosition - 1];
    if (entry.gameId !== "lumenloom") return "standard";
    const remembered = state.selectedModes.lumenloom;
    return progression.isLumenloomModeAvailable(profile, remembered)
      ? remembered
      : "standard";
  }

  function bestFor(profile, entry, modeId) {
    if (!entry.gameId) return deepFreeze({ standard: 0, assisted: 0, display: 0 });
    let record = profile.games?.[entry.gameId];
    if (entry.gameId === "lumenloom" && modeId !== "standard") {
      record = profile.livingArcade?.modes?.lumenloom?.[modeId];
    }
    const standard = Number.isSafeInteger(record?.standardBest) && record.standardBest >= 0
      ? record.standardBest
      : 0;
    const assisted = Number.isSafeInteger(record?.assistedBest) && record.assistedBest >= 0
      ? record.assistedBest
      : 0;
    return deepFreeze({
      standard,
      assisted,
      display: Math.max(standard, assisted)
    });
  }

  function visiblePositions(state, viewportWidth) {
    if (!isState(state)) throw new TypeError("Living Carousel requires a valid state.");
    const width = Number.isFinite(viewportWidth) ? viewportWidth : MOBILE_BREAKPOINT_PX;
    if (width >= MOBILE_BREAKPOINT_PX) {
      return Object.freeze(REGISTRY.map((entry) => entry.position));
    }
    const start = state.rail.page * MOBILE_PAGE_SIZE + 1;
    return Object.freeze(Array.from({ length: MOBILE_PAGE_SIZE }, (_, index) => start + index));
  }

  function deriveView(state, profile, dependencies, options = {}) {
    if (!isState(state)) throw new TypeError("Living Carousel requires a valid state.");
    const { progression, modeRules } = assertViewDependencies(profile, dependencies);
    const entry = REGISTRY[state.selectedPosition - 1];
    const implemented = entry.implemented === true;
    const unlocked = implemented && progression.isGameUnlocked(profile, entry.gameId);
    const record = implemented ? profile.games?.[entry.gameId] : null;
    const totalScore = Number.isSafeInteger(record?.totalScore) && record.totalScore >= 0
      ? record.totalScore
      : 0;
    const growth = implemented ? progression.growthFor(entry.gameId, totalScore) : null;
    const reward = implemented ? progression.nextRewardFor(profile, entry.gameId) : null;
    const modeId = effectiveMode(state, profile, dependencies, options);
    const mode = entry.gameId === "lumenloom"
      ? modeRules.MODES[modeId] || modeRules.MODES.standard
      : null;
    const viewportWidth = Number.isFinite(options.viewportWidth)
      ? options.viewportWidth
      : MOBILE_BREAKPOINT_PX;
    const visible = new Set(visiblePositions(state, viewportWidth));
    const rail = REGISTRY.map((candidate) => {
      const candidateUnlocked = candidate.implemented
        && progression.isGameUnlocked(profile, candidate.gameId);
      return {
        position: candidate.position,
        label: candidate.accessibleLabel,
        symbol: candidate.symbol,
        selected: candidate.position === state.selectedPosition,
        roving: candidate.position === state.rail.rovingPosition,
        visible: visible.has(candidate.position),
        implemented: candidate.implemented,
        unlocked: candidateUnlocked,
        playable: candidateUnlocked && Boolean(candidate.path)
      };
    });

    return deepFreeze({
      version: STATE_VERSION,
      selected: entry,
      implemented,
      unlocked,
      playable: unlocked && Boolean(entry.path),
      stage: unlocked ? growth?.name || "SEED" : "SLEEPING",
      totalScore,
      growth,
      reward,
      modeId,
      modeName: mode?.name || null,
      best: bestFor(profile, entry, modeId),
      trialAvailable: isTrialAvailable(profile, dependencies),
      viewport: {
        width: viewportWidth,
        pageCount: viewportWidth < MOBILE_BREAKPOINT_PX ? 2 : 1,
        page: viewportWidth < MOBILE_BREAKPOINT_PX ? state.rail.page : 0,
        positions: visiblePositions(state, viewportWidth)
      },
      rail
    });
  }

  function launchIntent(state, profile, dependencies, options = {}) {
    const view = deriveView(state, profile, dependencies, options);
    if (!view.playable) return null;
    if (options.trial === true) {
      const foundational = dependencies.progression.FOUNDATIONAL_GAME_IDS;
      if (!view.trialAvailable || !foundational.includes(view.selected.gameId)) return null;
    }
    return deepFreeze({
      gameId: view.selected.gameId,
      modeId: options.trial === true ? "standard" : view.modeId,
      trial: options.trial === true
    });
  }

  function interpretSwipe(gesture) {
    if (!gesture || typeof gesture !== "object") return 0;
    const values = [
      gesture.startX,
      gesture.startY,
      gesture.endX,
      gesture.endY
    ];
    if (!values.every(Number.isFinite)) return 0;
    const deltaX = gesture.endX - gesture.startX;
    const deltaY = gesture.endY - gesture.startY;
    const horizontal = Math.abs(deltaX);
    const vertical = Math.abs(deltaY);
    if (horizontal < SWIPE_THRESHOLD_PX
      || horizontal < vertical * SWIPE_AXIS_RATIO) return 0;
    return deltaX < 0 ? 1 : -1;
  }

  return deepFreeze({
    STATE_VERSION,
    POSITION_COUNT,
    MOBILE_BREAKPOINT_PX,
    MOBILE_PAGE_SIZE,
    SWIPE_THRESHOLD_PX,
    SWIPE_AXIS_RATIO,
    ACTIONS,
    REGISTRY,
    createInitialState,
    isState,
    pageForPosition,
    selectPosition,
    selectGame,
    moveSelection,
    setPage,
    selectMode,
    reduce,
    effectiveMode,
    isTrialAvailable,
    visiblePositions,
    deriveView,
    launchIntent,
    interpretSwipe
  });
});
