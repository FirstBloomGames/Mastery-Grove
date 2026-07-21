(() => {
  'use strict';

  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';

  const $ = (id) => document.getElementById(id);
  const progression = window.MasteryGroveProgression;
  if (!progression) throw new Error('Mastery Grove progression engine did not load.');
  const protocolV2 = window.FirstBloomProtocolV2;
  if (!protocolV2) throw new Error('Mastery Grove protocol v2 did not load.');
  const lumenloomSession = window.FirstBloomLumenloomSession;
  if (!lumenloomSession) throw new Error('Mastery Grove Lumenloom session coordinator did not load.');
  if (!window.MasteryGroveProfileStorage) throw new Error('Mastery Grove profile storage did not load.');
  const firstBloom = window.MasteryGroveFirstBloom;
  if (!firstBloom) throw new Error('Mastery Grove First Bloom engine did not load.');
  const carousel = window.MasteryGroveCarousel || null;
  const growthVisuals = window.MasteryGroveGrowthVisuals || null;
  const lumenloomModes = window.LumenloomModes || null;
  const carouselDependencies = carousel && lumenloomModes
    ? Object.freeze({ progression, modeRules: lumenloomModes })
    : null;
  const storageAdapter = Object.freeze({
    getItem(key) { return window.localStorage.getItem(key); },
    setItem(key, value) { window.localStorage.setItem(key, value); }
  });
  const profileStorageController = window.MasteryGroveProfileStorage.createProfileStorage(
    storageAdapter,
    { progression }
  );
  const GROVE_SOUND_KEY = 'first-bloom-grove-audio-v1';
  const COLLECTION_SIZE = 10;
  const TAU = Math.PI * 2;
  const SCORE_COUNT_MAX_WRITES = 20;
  const RELEASE_VERSION = document.querySelector('meta[name="first-bloom-release"]')?.content?.trim() || 'unavailable';

  const TREE_VOICES = Object.freeze({
    lumenloom: Object.freeze({ select: Object.freeze([392, 587.33]), growth: Object.freeze([587.33, 783.99]), wave: 'sine' }),
    bloomfold: Object.freeze({ select: Object.freeze([329.63, 493.88]), growth: Object.freeze([493.88, 659.25]), wave: 'triangle' }),
    ripplewake: Object.freeze({ select: Object.freeze([261.63, 392]), growth: Object.freeze([392, 523.25]), wave: 'sine' }),
    prismbind: Object.freeze({ select: Object.freeze([293.66, 440]), growth: Object.freeze([440, 659.25]), wave: 'triangle' }),
    mothchorus: Object.freeze({ select: Object.freeze([349.23, 523.25]), growth: Object.freeze([523.25, 698.46]), wave: 'sine' })
  });

  const GAMES = {
    lumenloom: {
      id: 'lumenloom',
      title: 'LUMENLOOM',
      tree: 'THE LANTERN WILLOW',
      number: 'TREE 01',
      path: '../Lumenloom/index.html',
      standaloneKey: 'lumenloom-best',
      importStandaloneBest: true,
      color: '#ffd773',
      symbol: '✦'
    },
    bloomfold: {
      id: 'bloomfold',
      title: 'BLOOMFOLD',
      tree: 'THE RECURSIVE ORCHID',
      number: 'TREE 02',
      path: '../Bloomfold/index.html',
      standaloneKey: 'bloomfold-best',
      importStandaloneBest: true,
      color: '#82f4ee',
      symbol: '◇'
    },
    ripplewake: {
      id: 'ripplewake',
      title: 'RIPPLEWAKE',
      tree: 'THE ECHO ALDER',
      number: 'TREE 03',
      path: '../Ripplewake/index.html',
      standaloneKey: 'ripplewake-best',
      importStandaloneBest: true,
      color: '#ff9b85',
      symbol: '≋'
    },
    prismbind: {
      id: 'prismbind',
      title: 'PRISMBIND',
      tree: 'THE CONCORD BANYAN',
      number: 'TREE 04 · GUARDIAN',
      path: '../Prismbind/index.html',
      standaloneKey: 'prismbind-best',
      importStandaloneBest: true,
      color: '#d7c6ff',
      symbol: '◆'
    },
    mothchorus: {
      id: 'mothchorus',
      title: 'MOTHCHORUS',
      tree: 'THE CHOIR LINDEN',
      number: 'TREE 05 · SECOND GROVE',
      path: '../Mothchorus/index.html',
      standaloneKey: 'mothchorus-best-v1',
      importStandaloneBest: false,
      color: '#80e5c4',
      symbol: '♡'
    }
  };

  const GROWTH_STAGES = progression.GROWTH_STAGES;
  const FOUNDATIONAL_GAME_IDS = progression.FOUNDATIONAL_GAME_IDS;
  const GAME_IDS = progression.ALL_GAME_IDS;
  const FIRST_TREE_PART_COUNT = progression.FIRST_TREE_PART_COUNT || 4;
  const MAX_BLOOM_MARKS = FOUNDATIONAL_GAME_IDS.length * (GROWTH_STAGES.length - 1);

  const ui = {
    groveScreen: $('groveScreen'),
    livingCarousel: $('livingCarousel'),
    livingCarouselNumber: $('livingCarouselNumber'),
    livingCarouselGame: $('livingCarouselGame'),
    livingCarouselSpecies: $('livingCarouselSpecies'),
    livingCarouselRank: $('livingCarouselRank'),
    livingCarouselSeeds: $('livingCarouselSeeds'),
    livingCarouselHelpButton: $('livingCarouselHelpButton'),
    livingCarouselJournalButton: $('livingCarouselJournalButton'),
    livingCarouselStage: $('livingCarouselStage'),
    livingCarouselTreeVisual: $('livingCarouselTreeVisual'),
    livingCarouselTreeAuraRings: [...document.querySelectorAll('.living-carousel-tree-aura > i')],
    livingCarouselTreeBranches: [...document.querySelectorAll('.living-carousel-tree-branches > i')],
    livingCarouselTreeBlooms: [...document.querySelectorAll('.living-carousel-tree-blooms > i')],
    livingCarouselTreeSymbol: document.querySelector('.living-carousel-tree-symbol'),
    livingCarouselGrowthStage: $('livingCarouselGrowthStage'),
    livingCarouselEverbloom: $('livingCarouselEverbloom'),
    livingCarouselTransfer: $('livingCarouselTransfer'),
    livingCarouselTransferLabel: $('livingCarouselTransferLabel'),
    livingCarouselTransferScore: $('livingCarouselTransferScore'),
    livingCarouselTransferTotal: $('livingCarouselTransferTotal'),
    livingCarouselTransferRetry: $('livingCarouselTransferRetry'),
    livingCarouselTransferMotes: [...document.querySelectorAll('.living-carousel-transfer-motes > i')],
    livingCarouselTransferLive: $('livingCarouselTransferLive'),
    livingCarouselBest: $('livingCarouselBest'),
    livingCarouselTarget: $('livingCarouselTarget'),
    livingCarouselModes: $('livingCarouselModes'),
    livingCarouselModeButtons: [...document.querySelectorAll('[data-carousel-mode]')],
    livingCarouselPlayButton: $('livingCarouselPlayButton'),
    livingCarouselTrialButton: $('livingCarouselTrialButton'),
    livingCarouselTrialStatus: $('livingCarouselTrialStatus'),
    livingCarouselHarmony: $('livingCarouselHarmony'),
    livingCarouselHarmonyPips: $('livingCarouselHarmony')?.querySelector('strong'),
    livingCarouselRail: $('livingCarouselRail'),
    livingCarouselTreeOptions: [...document.querySelectorAll('.living-carousel-option[data-carousel-position]')],
    livingCarouselPageDots: $('livingCarouselPageDots'),
    livingCarouselPageButtons: [...document.querySelectorAll('[data-carousel-page-button]')],
    livingCarouselLive: $('livingCarouselLive'),
    legacyCatalogue: $('legacyCatalogue'),
    sleepingGrove: document.querySelector('.sleeping-grove'),
    groveFooter: document.querySelector('.grove-footer'),
    headerRank: $('headerRank'),
    headerBloomCount: $('headerBloomCount'),
    groveRank: $('groveRank'),
    groveMessage: $('groveMessage'),
    firstTree: document.querySelector('.first-tree'),
    visitHarmony: $('visitHarmony'),
    visitHarmonyStatus: $('visitHarmonyStatus'),
    lumenloomVisitPip: $('lumenloomVisitPip'),
    bloomfoldVisitPip: $('bloomfoldVisitPip'),
    ripplewakeVisitPip: $('ripplewakeVisitPip'),
    lumenloomCard: $('lumenloomCard'),
    lumenloomMastery: $('lumenloomMastery'),
    lumenloomTotal: $('lumenloomTotal'),
    lumenloomBest: $('lumenloomBest'),
    lumenloomProgress: $('lumenloomProgress'),
    lumenloomNextGrowth: $('lumenloomNextGrowth'),
    lumenloomNextSkill: $('lumenloomNextSkill'),
    lumenloomVisitMark: $('lumenloomVisitMark'),
    bloomfoldCard: $('bloomfoldCard'),
    bloomfoldMastery: $('bloomfoldMastery'),
    bloomfoldTotal: $('bloomfoldTotal'),
    bloomfoldBest: $('bloomfoldBest'),
    bloomfoldProgress: $('bloomfoldProgress'),
    bloomfoldNextGrowth: $('bloomfoldNextGrowth'),
    bloomfoldNextSkill: $('bloomfoldNextSkill'),
    bloomfoldVisitMark: $('bloomfoldVisitMark'),
    ripplewakeCard: $('ripplewakeCard'),
    ripplewakeMastery: $('ripplewakeMastery'),
    ripplewakeTotal: $('ripplewakeTotal'),
    ripplewakeBest: $('ripplewakeBest'),
    ripplewakeProgress: $('ripplewakeProgress'),
    ripplewakeNextGrowth: $('ripplewakeNextGrowth'),
    ripplewakeNextSkill: $('ripplewakeNextSkill'),
    ripplewakeVisitMark: $('ripplewakeVisitMark'),
    prismbindCard: $('prismbindCard'),
    prismbindMastery: $('prismbindMastery'),
    prismbindTotal: $('prismbindTotal'),
    prismbindBest: $('prismbindBest'),
    prismbindProgress: $('prismbindProgress'),
    prismbindNextGrowth: $('prismbindNextGrowth'),
    prismbindNextSkill: $('prismbindNextSkill'),
    prismbindVisitMark: $('prismbindVisitMark'),
    prismbindButton: $('prismbindButton'),
    prismbindButtonLabel: $('prismbindButtonLabel'),
    prismbindRequirement: $('prismbindRequirement'),
    mothchorusCard: $('mothchorusCard'),
    mothchorusMastery: $('mothchorusMastery'),
    mothchorusTotal: $('mothchorusTotal'),
    mothchorusBest: $('mothchorusBest'),
    mothchorusProgress: $('mothchorusProgress'),
    mothchorusNextGrowth: $('mothchorusNextGrowth'),
    mothchorusNextSkill: $('mothchorusNextSkill'),
    mothchorusVisitMark: $('mothchorusVisitMark'),
    mothchorusGate: $('mothchorusGate'),
    mothchorusGateCopy: $('mothchorusGateCopy'),
    mothchorusSeedStatus: $('mothchorusSeedStatus'),
    mothchorusSeedState: $('mothchorusSeedState'),
    mothchorusButton: $('mothchorusButton'),
    mothchorusButtonLabel: $('mothchorusButtonLabel'),
    mothchorusRequirement: $('mothchorusRequirement'),
    lumenloomSeed: $('lumenloomSeed'),
    bloomfoldSeed: $('bloomfoldSeed'),
    ripplewakeSeed: $('ripplewakeSeed'),
    trialButton: $('trialButton'),
    trialLabel: $('trialLabel'),
    saplingRow: $('saplingRow'),
    sleepingCount: $('sleepingCount'),
    regionStatus: $('regionStatus'),
    regionStatusTitle: $('regionStatusTitle'),
    regionStatusCopy: $('regionStatusCopy'),
    profileStatus: $('profileStatus'),
    storageWarning: $('storageWarning'),
    storageWarningText: $('storageWarningText'),
    saveRecoveryOverlay: $('saveRecoveryOverlay'),
    pendingSaveTitle: $('pendingSaveTitle'),
    pendingSaveCopy: $('pendingSaveCopy'),
    pendingRetryButton: $('pendingRetryButton'),
    pendingSessionButton: $('pendingSessionButton'),
    pendingReturnButton: $('pendingReturnButton'),
    firstBloomOverlay: $('firstBloomOverlay'),
    firstBloomStage: $('firstBloomStage'),
    firstBloomLoomwing: $('firstBloomLoomwing'),
    firstBloomThreadSvg: $('firstBloomThreadSvg'),
    firstBloomThreadPath: $('firstBloomThreadPath'),
    firstBloomCuePath: $('firstBloomCuePath'),
    firstBloomFlowerButtons: [
      $('firstBloomFlower1'),
      $('firstBloomFlower2'),
      $('firstBloomFlower3')
    ],
    firstBloomCue: $('firstBloomCue'),
    firstBloomTreeReveal: $('firstBloomTreeReveal'),
    firstBloomHint: $('firstBloomHint'),
    firstBloomSaveStatus: $('firstBloomSaveStatus'),
    firstBloomLive: $('firstBloomLive'),
    firstBloomSkipButton: $('firstBloomSkipButton'),
    firstBloomDirectionButtons: [
      $('firstBloomMoveUp'),
      $('firstBloomMoveLeft'),
      $('firstBloomMoveRight'),
      $('firstBloomMoveDown')
    ],
    growthOverlay: $('growthOverlay'),
    growthPanel: $('growthPanel'),
    growthSymbol: $('growthSymbol'),
    ceremonyKicker: $('ceremonyKicker'),
    growthTitle: $('growthTitle'),
    growthCopy: $('growthCopy'),
    growthOutcome: $('growthOutcome'),
    growthRunLabel: $('growthRunLabel'),
    growthRunScore: $('growthRunScore'),
    growthScoreLabel: $('growthScoreLabel'),
    growthScore: $('growthScore'),
    growthMasteryLabel: $('growthMasteryLabel'),
    growthMastery: $('growthMastery'),
    ceremonyNextReward: $('ceremonyNextReward'),
    growthNextReward: $('growthNextReward'),
    growthContinueButton: $('growthContinueButton'),
    trialResultOverlay: $('trialResultOverlay'),
    trialLumenScore: $('trialLumenScore'),
    trialBloomScore: $('trialBloomScore'),
    trialRippleScore: $('trialRippleScore'),
    trialCombinedScore: $('trialCombinedScore'),
    trialResultCopy: $('trialResultCopy'),
    trialDoneButton: $('trialDoneButton'),
    settingsButton: $('settingsButton'),
    settingsOverlay: $('settingsOverlay'),
    closeSettingsButton: $('closeSettingsButton'),
    groveSoundButton: $('groveSoundButton'),
    resetProgressButton: $('resetProgressButton'),
    exportProgressButton: $('exportProgressButton'),
    importProgressButton: $('importProgressButton'),
    importProgressInput: $('importProgressInput'),
    dataManagementStatus: $('dataManagementStatus'),
    releaseInfoButton: $('releaseInfoButton'),
    releaseInfoOverlay: $('releaseInfoOverlay'),
    releaseInfoTitle: $('releaseInfoTitle'),
    releaseBuildIdentity: $('releaseBuildIdentity'),
    copyDiagnosticsButton: $('copyDiagnosticsButton'),
    diagnosticsStatus: $('diagnosticsStatus'),
    diagnosticsOutput: $('diagnosticsOutput'),
    closeReleaseInfoButton: $('closeReleaseInfoButton'),
    returnConfirmOverlay: $('returnConfirmOverlay'),
    stayInGameButton: $('stayInGameButton'),
    confirmReturnButton: $('confirmReturnButton'),
    gameShell: $('gameShell'),
    gameFrame: $('gameFrame'),
    frameLoading: $('frameLoading'),
    frameLoadingTitle: $('frameLoadingTitle'),
    frameLoadingCopy: $('frameLoadingCopy'),
    frameLoadingActions: $('frameLoadingActions'),
    retryGameButton: $('retryGameButton'),
    loadingReturnButton: $('loadingReturnButton'),
    returnButton: $('returnButton'),
    activeTreeLabel: $('activeTreeLabel'),
    activeGameTitle: $('activeGameTitle'),
    trialProgress: $('trialProgress'),
    nextGameButton: $('nextGameButton'),
    groveToast: $('groveToast'),
    groveLive: $('groveLive')
  };

  const canvas = $('groveCanvas');
  const ctx = canvas.getContext('2d');
  const view = {
    width: 0,
    height: 0,
    dpr: 1,
    time: 0,
    mobileRenderer: false,
    frameInterval: 1000 / 45,
    effectsScale: 1
  };
  const rendererState = {
    fireflies: [],
    stars: [],
    growthPulse: 0,
    growthPulseColor: '#82f4ee',
    breeze: 0,
    lastRenderAt: 0,
    interactionQuietUntil: 0
  };
  const rendererMetrics = {
    startedAt: performance.now(),
    draws: 0,
    skipped: 0,
    modelBuilds: 0,
    lastDrawMs: 0,
    totalDrawMs: 0,
    longestDrawMs: 0,
    lastQaPublishAt: 0,
    lastQaState: ''
  };
  const qaHostAllowed = location.protocol === 'file:'
    || ['localhost', '127.0.0.1', '::1'].includes(location.hostname);

  let storageAvailable = true;
  let storageReadOnly = false;
  let storageRecovered = false;
  let storageCleanupIncomplete = false;
  let storageNotice = '';
  let profile;
  let carouselState = null;
  let carouselActive = false;
  let carouselFailed = false;
  let carouselPointer = null;
  let carouselSuppressClickUntil = 0;
  const carouselGamepadState = new Map();
  let carouselLastGamepadMoveAt = 0;
  let releaseInfoReturnsToSettings = false;
  let pendingSave = null;
  let recoveryRequiresReload = false;
  let firstBloomState = null;
  let firstBloomTickTimer = 0;
  let firstBloomLastTickAt = 0;
  let firstBloomPointerId = null;
  let firstBloomPointerFrame = 0;
  let firstBloomPointerPosition = null;
  let firstBloomCompleting = false;
  let firstBloomRevealCommitted = false;
  let firstBloomRevealTimer = 0;
  let firstBloomGeneration = 0;
  let firstBloomLastAnnouncementKey = '';
  let firstBloomSessionOnly = false;
  let activeGameId = null;
  let activeSession = null;
  let activeLumenloomState = null;
  let activeLumenloomModeId = null;
  let activeSessionId = null;
  let readyTimer = 0;
  let ceremonyQueue = [];
  let currentCeremony = null;
  let trialSession = null;
  let pendingGrowthTransfer = null;
  let activeGrowthTransfer = null;
  let growthTransferHideTimer = 0;
  let growthVisualsFailed = false;
  let pendingVisitHarmony = false;
  let toastTimer = 0;
  let resetArmed = false;
  let resetTimer = 0;
  let selectionReleaseTimer = 0;
  let launchGuard = false;
  const visitState = {
    played: new Set(),
    improved: new Set(),
    harmonyQueued: false
  };
  let groveSoundEnabled = loadGroveSoundPreference();
  let groveAudioContext = null;
  let lastSelectionCueAt = 0;
  let lastSelectionCueGame = '';
  const activeAudioNodes = new Set();
  const audioQa = { lastCue: null, maxActiveNodes: 0 };
  const motionQuery = window.matchMedia?.('(prefers-reduced-motion: reduce)');
  let reducedMotion = Boolean(motionQuery?.matches);
  let lastFrame = performance.now();
  let rendererFrameId = 0;
  let rendererTimerId = 0;
  let resizeTimerId = 0;
  let renderModelProfile = null;
  let renderModel = null;

  function safeInteger(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return 0;
    return Math.min(Number.MAX_SAFE_INTEGER, Math.max(0, Math.round(number)));
  }

  function safeAdd(left, right) {
    return Math.min(Number.MAX_SAFE_INTEGER, safeInteger(left) + safeInteger(right));
  }

  function loadGroveSoundPreference() {
    try { return localStorage.getItem(GROVE_SOUND_KEY) !== 'off'; }
    catch (_) { return true; }
  }

  function persistGroveSoundPreference() {
    try { localStorage.setItem(GROVE_SOUND_KEY, groveSoundEnabled ? 'on' : 'off'); }
    catch (_) { /* A presentation preference never blocks play. */ }
  }

  function updateGroveSoundUI() {
    if (!ui.groveSoundButton) return;
    ui.groveSoundButton.setAttribute('aria-pressed', String(groveSoundEnabled));
    ui.groveSoundButton.textContent = groveSoundEnabled ? 'SOUND ON' : 'SOUND OFF';
    ui.groveSoundButton.setAttribute('aria-label', `Grove tree voices ${groveSoundEnabled ? 'on' : 'off'}`);
  }

  function stopActiveAudioNodes() {
    for (const oscillator of [...activeAudioNodes]) {
      try { oscillator.stop(); } catch (_) { /* Already stopped. */ }
    }
    activeAudioNodes.clear();
  }

  function ensureGroveAudioContext() {
    if (!groveSoundEnabled) return null;
    const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextCtor) return null;
    try {
      if (!groveAudioContext || groveAudioContext.state === 'closed') groveAudioContext = new AudioContextCtor();
      return groveAudioContext;
    } catch (_) {
      return null;
    }
  }

  function scheduleTreeVoice(context, gameId, kind) {
    if (!groveSoundEnabled || !context || context.state !== 'running') return;
    const voice = TREE_VOICES[gameId];
    const frequencies = voice?.[kind] || voice?.select;
    if (!voice || !frequencies) return;
    stopActiveAudioNodes();
    const now = context.currentTime + .012;
    const duration = kind === 'growth' ? .28 : .22;
    frequencies.slice(0, 2).forEach((frequency, index) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const start = now + index * .036;
      const stop = start + duration;
      oscillator.type = voice.wave;
      oscillator.frequency.setValueAtTime(frequency, start);
      gain.gain.setValueAtTime(.0001, start);
      gain.gain.exponentialRampToValueAtTime(kind === 'growth' ? .024 : .018, start + .035);
      gain.gain.exponentialRampToValueAtTime(.0001, stop);
      oscillator.connect(gain);
      gain.connect(context.destination);
      activeAudioNodes.add(oscillator);
      audioQa.maxActiveNodes = Math.max(audioQa.maxActiveNodes, activeAudioNodes.size);
      oscillator.onended = () => {
        activeAudioNodes.delete(oscillator);
        try { oscillator.disconnect(); gain.disconnect(); } catch (_) { /* Best-effort cleanup. */ }
      };
      oscillator.start(start);
      oscillator.stop(stop + .01);
    });
    audioQa.lastCue = Object.freeze({ gameId, kind, frequencies: [...frequencies], at: Date.now() });
  }

  function playTreeVoice(gameId, kind = 'select') {
    if (!groveSoundEnabled || !TREE_VOICES[gameId]) return;
    const now = performance.now();
    if (kind === 'select' && lastSelectionCueGame === gameId && now - lastSelectionCueAt < 160) return;
    if (kind === 'select') {
      lastSelectionCueGame = gameId;
      lastSelectionCueAt = now;
    }
    const context = ensureGroveAudioContext();
    if (!context) return;
    if (context.state === 'running') scheduleTreeVoice(context, gameId, kind);
    else context.resume().then(() => scheduleTreeVoice(context, gameId, kind)).catch(() => {});
  }

  function playGroveHarmony() {
    if (!groveSoundEnabled) return;
    FOUNDATIONAL_GAME_IDS.forEach((gameId, index) => {
      window.setTimeout(() => playTreeVoice(gameId, 'select'), index * 290);
    });
    audioQa.lastCue = Object.freeze({ gameId: 'grove-harmony', kind: 'harmony', at: Date.now() });
  }

  function toggleGroveSound() {
    groveSoundEnabled = !groveSoundEnabled;
    if (!groveSoundEnabled) stopActiveAudioNodes();
    persistGroveSoundPreference();
    updateGroveSoundUI();
    announce(`Grove tree voices ${groveSoundEnabled ? 'on' : 'off'}.`);
    if (groveSoundEnabled) playTreeVoice('lumenloom', 'select');
  }

  function resetVisitState() {
    visitState.played.clear();
    visitState.improved.clear();
    visitState.harmonyQueued = false;
  }

  function updateVisitUI() {
    for (const gameId of GAME_IDS) {
      const card = ui[`${gameId}Card`];
      const mark = ui[`${gameId}VisitMark`];
      const played = visitState.played.has(gameId);
      const improved = visitState.improved.has(gameId);
      card?.classList.toggle('is-session-played', played);
      card?.classList.toggle('is-session-improved', improved);
      if (card) card.dataset.visitState = improved ? 'improved' : played ? 'played' : 'resting';
      if (mark) {
        mark.textContent = improved ? 'PERSONAL BEST THIS VISIT' : 'AWAKE THIS VISIT';
        mark.setAttribute('aria-hidden', String(!played));
      }
    }
    const foundationalPlayed = FOUNDATIONAL_GAME_IDS.filter((gameId) => visitState.played.has(gameId));
    for (const gameId of FOUNDATIONAL_GAME_IDS) ui[`${gameId}VisitPip`]?.classList.toggle('is-awake', visitState.played.has(gameId));
    const harmonyAwake = foundationalPlayed.length === FOUNDATIONAL_GAME_IDS.length;
    ui.visitHarmony?.classList.toggle('is-awake', harmonyAwake);
    if (ui.visitHarmonyStatus) ui.visitHarmonyStatus.textContent = harmonyAwake
      ? 'GROVE HARMONY AWAKE'
      : `${foundationalPlayed.length} / 3 TREES TO GROVE HARMONY`;
  }

  function recordVisitCompletion(gameId, feedback) {
    visitState.played.add(gameId);
    if (feedback?.isPersonalBest) visitState.improved.add(gameId);
    const harmonyReady = FOUNDATIONAL_GAME_IDS.every((id) => visitState.played.has(id));
    if (harmonyReady && !visitState.harmonyQueued) {
      visitState.harmonyQueued = true;
      return true;
    }
    return false;
  }

  function highlightReturnedTree(gameId) {
    const card = ui[`${gameId}Card`];
    if (!card || reducedMotion) return;
    card.classList.remove('is-score-received');
    requestAnimationFrame(() => card.classList.add('is-score-received'));
    window.setTimeout(() => card.classList.remove('is-score-received'), 900);
  }

  function defaultProfile() {
    return progression.defaultProfile();
  }

  function readStandaloneBests() {
    const standaloneBests = {};
    try {
      for (const game of Object.values(GAMES)) {
        if (!game.importStandaloneBest) continue;
        const value = Number(localStorage.getItem(game.standaloneKey));
        if (Number.isSafeInteger(value) && value >= 0) standaloneBests[game.id] = value;
      }
    } catch (_) { /* The storage controller reports authoritative availability. */ }
    return standaloneBests;
  }

  function cloneProfile(source = profile) {
    return JSON.parse(JSON.stringify(source));
  }

  function canonicalizeProfile(draft) {
    const migrated = progression.migrateProfile(draft);
    if (!migrated.ok) throw new Error(`Could not canonicalize profile: ${migrated.code}`);
    return migrated.profile;
  }

  function proposeProfile(mutator, options = {}) {
    const draft = cloneProfile(options.source || profile);
    mutator(draft);
    if (options.timestamp !== false) draft.updatedAt = new Date().toISOString();
    return canonicalizeProfile(draft);
  }

  function sessionProfileResult(candidate, fields = {}) {
    return Object.freeze({
      ok: true,
      code: 'session-only',
      state: 'read-only',
      saved: false,
      readOnly: true,
      profile: candidate,
      ...fields
    });
  }

  function installProfileResult(result) {
    if (!result?.ok || !progression.isCanonicalProfile(result.profile)) return false;
    profile = result.profile;
    return true;
  }

  function blockedSaveResult(code, readOnly = storageReadOnly) {
    return Object.freeze({
      ok: false,
      code,
      state: readOnly ? 'read-only' : 'retryable',
      readOnly,
      recovered: false,
      profile: null,
      retryPayload: pendingSave?.retryPayload || null,
      pendingLabel: pendingSave?.label || null
    });
  }

  function storageFailureNotice(result, label = 'Progress') {
    if (result?.code === 'future-profile' || result?.code === 'future-recovery-profile') {
      return `This save belongs to a newer Grove (profile v${result.sourceVersion}). It has been preserved without changes.`;
    }
    if (result?.code === 'future-current') {
      return `A newer Grove save appeared in another tab (profile v${result.sourceVersion}). It was preserved. Reload before saving again.`;
    }
    if (result?.code === 'stale-current') {
      return 'Another tab changed this Grove. Its progress was preserved. Reload this page before saving again.';
    }
    if (result?.code === 'storage-unavailable') {
      return 'This browser blocked local saves. This session will still play, but progress will be lost when it closes.';
    }
    if (result?.code === 'no-valid-profile') {
      return 'Neither local save copy could be verified. The damaged data was preserved; Reset is available if you want a fresh Grove.';
    }
    if (result?.recovered) {
      return `The previous safe copy was restored after ${label.toLowerCase()} could not be verified. Retry uses the exact same save.`;
    }
    if (result?.retryPayload) {
      return `${label} is paused because local storage could not be verified. Retry Save will use the exact same result and timestamp.`;
    }
    return `${label} could not be saved. The installed Grove profile was not changed.`;
  }

  function reflectStorageFailure(result, label) {
    storageReadOnly = Boolean(result?.readOnly);
    storageRecovered = storageRecovered || Boolean(result?.recovered);
    storageAvailable = result?.code !== 'storage-unavailable';
    storageNotice = storageFailureNotice(result, label);
    if (ui.profileStatus) {
      ui.profileStatus.textContent = result?.retryPayload
        ? 'LOCAL KEEPER PROFILE · SAVE PAUSED'
        : storageReadOnly
          ? 'PROTECTED PROFILE · SESSION ONLY'
          : 'SESSION PROFILE · STORAGE UNAVAILABLE';
    }
    updateStorageWarning();
  }

  function reflectStorageSuccess() {
    storageAvailable = true;
    storageReadOnly = false;
    if (!storageRecovered && !storageCleanupIncomplete) storageNotice = '';
    if (ui.profileStatus) ui.profileStatus.textContent = 'LOCAL KEEPER PROFILE · SAVED';
    updateStorageWarning();
  }

  function rememberPendingSave(result, resume, label, options = {}) {
    const retryPayload = result?.retryPayload || null;
    if (!retryPayload && !options.allowNoRetry) return;
    recoveryRequiresReload = false;
    pendingSave = Object.freeze({
      retryPayload,
      resume: typeof resume === 'function' ? resume : null,
      label,
      allowSessionEscape: Boolean(options.allowSessionEscape),
      sessionEscapeLabel: typeof options.sessionEscapeLabel === 'string'
        ? options.sessionEscapeLabel
        : 'PLAY THIS VISIT · NOT SAVED',
      onSessionEscape: typeof options.onSessionEscape === 'function'
        ? options.onSessionEscape
        : null,
      allowReturn: Boolean(options.allowReturn),
      returnLabel: typeof options.returnLabel === 'string'
        ? options.returnLabel
        : 'RETURN WITHOUT SAVING',
      onReturn: typeof options.onReturn === 'function' ? options.onReturn : null,
      sessionProfile: progression.isCanonicalProfile(options.sessionProfile)
        ? options.sessionProfile
        : null
    });
    ui.pendingSaveTitle.textContent = `${label} is waiting safely.`;
    ui.pendingSaveCopy.textContent = typeof options.pendingCopy === 'string'
      ? options.pendingCopy
      : pendingSave.allowSessionEscape
        ? `The Grove has not installed or presented ${label.toLowerCase()} yet. Retry the exact save, or play this visit without saving it.`
        : `The Grove has not installed or presented ${label.toLowerCase()} yet.`;
    ui.pendingRetryButton.querySelector('span').textContent = 'RETRY SAVE';
    ui.pendingRetryButton.hidden = !pendingSave.retryPayload;
    ui.pendingRetryButton.disabled = !pendingSave.retryPayload;
    ui.pendingSessionButton.querySelector('span').textContent = pendingSave.sessionEscapeLabel;
    ui.pendingSessionButton.hidden = !pendingSave.allowSessionEscape;
    ui.pendingSessionButton.disabled = !pendingSave.allowSessionEscape;
    ui.pendingReturnButton.querySelector('span').textContent = pendingSave.returnLabel;
    ui.pendingReturnButton.hidden = !pendingSave.allowReturn;
    ui.pendingReturnButton.disabled = !pendingSave.allowReturn;
    setOverlay(ui.saveRecoveryOverlay, true);
    const recoveryFocus = pendingSave.retryPayload
      ? ui.pendingRetryButton
      : pendingSave.allowSessionEscape
        ? ui.pendingSessionButton
        : ui.pendingReturnButton;
    window.setTimeout(() => recoveryFocus.focus({ preventScroll: true }), 80);
  }

  function showReloadRecovery(result, label) {
    recoveryRequiresReload = true;
    const concurrentChange = ['future-current', 'stale-current'].includes(result?.code);
    ui.pendingSaveTitle.textContent = concurrentChange
      ? 'Another Grove save was preserved.'
      : 'The saved Grove needs a fresh check.';
    ui.pendingSaveCopy.textContent = result?.code === 'future-current'
      ? 'A newer-version Grove appeared before this change could be saved.'
      : result?.code === 'stale-current'
        ? `Another tab changed the Grove before ${label.toLowerCase()} could be saved.`
        : `The browser could not safely finish ${label.toLowerCase()}. Previously saved progress was left untouched.`;
    ui.pendingRetryButton.querySelector('span').textContent = 'RELOAD THE GROVE';
    ui.pendingRetryButton.hidden = false;
    ui.pendingSessionButton.hidden = true;
    ui.pendingSessionButton.disabled = true;
    ui.pendingReturnButton.hidden = true;
    ui.pendingReturnButton.disabled = true;
    setOverlay(ui.saveRecoveryOverlay, true);
    window.setTimeout(() => ui.pendingRetryButton.focus({ preventScroll: true }), 80);
  }

  function commitProfile(proposed, options = {}) {
    if (pendingSave) return blockedSaveResult('commit-pending');
    if (storageReadOnly) {
      if (!options.allowSessionOnly) return blockedSaveResult('storage-read-only', true);
      const sessionResult = sessionProfileResult(proposed);
      if (!installProfileResult(sessionResult)) return blockedSaveResult('invalid-session-profile', true);
      updateStorageWarning();
      return sessionResult;
    }
    const committed = profileStorageController.commit(profile, proposed);
    if (!installProfileResult(committed)) {
      rememberPendingSave(
        committed,
        options.resume,
        options.label || 'Progress',
        {
          allowSessionEscape: options.allowSessionEscape,
          sessionEscapeLabel: options.sessionEscapeLabel,
          onSessionEscape: options.onSessionEscape,
          allowReturn: options.allowReturn,
          returnLabel: options.returnLabel,
          onReturn: options.onReturn,
          pendingCopy: options.pendingCopy,
          sessionProfile: options.sessionProfile
        }
      );
      reflectStorageFailure(committed, options.label || 'Progress');
      if (!committed.retryPayload && committed.readOnly && !options.allowNoRetryChoice) {
        showReloadRecovery(committed, options.label || 'Progress');
      }
      return committed;
    }
    pendingSave = null;
    reflectStorageSuccess();
    return committed;
  }

  function resetProfileStorage(options = {}) {
    if (pendingSave) return blockedSaveResult('commit-pending');
    const committed = profileStorageController.reset();
    if (!installProfileResult(committed)) {
      rememberPendingSave(committed, options.resume, options.label || 'Reset');
      reflectStorageFailure(committed, options.label || 'Reset');
      return committed;
    }
    pendingSave = null;
    storageRecovered = false;
    reflectStorageSuccess();
    return committed;
  }

  function retryPendingSave() {
    if (!pendingSave) {
      if (recoveryRequiresReload) window.location.reload();
      return;
    }
    const waiting = pendingSave;
    ui.pendingRetryButton.disabled = true;
    const retried = profileStorageController.retry(waiting.retryPayload);
    if (!installProfileResult(retried)) {
      if (retried.retryPayload) {
        pendingSave = Object.freeze({ ...waiting, retryPayload: retried.retryPayload });
      } else {
        pendingSave = null;
      }
      reflectStorageFailure(retried, waiting.label);
      ui.pendingRetryButton.disabled = false;
      if (!pendingSave) {
        if (retried.readOnly) {
          showReloadRecovery(retried, waiting.label);
        } else {
          setOverlay(ui.saveRecoveryOverlay, false);
          showToast('That save can no longer be applied safely. Existing browser progress was preserved.');
        }
      }
      return;
    }
    pendingSave = null;
    recoveryRequiresReload = false;
    storageRecovered = false;
    reflectStorageSuccess();
    ui.pendingRetryButton.disabled = false;
    ui.pendingRetryButton.querySelector('span').textContent = 'RETRY SAVE';
    ui.pendingSessionButton.hidden = true;
    ui.pendingSessionButton.disabled = true;
    ui.pendingReturnButton.hidden = true;
    ui.pendingReturnButton.disabled = true;
    setOverlay(ui.saveRecoveryOverlay, false);
    waiting.resume?.(retried);
    announce(`${waiting.label} saved.`);
  }

  function continuePendingSessionOnly() {
    if (!pendingSave?.allowSessionEscape) return;
    const waiting = pendingSave;
    ui.pendingRetryButton.disabled = true;
    ui.pendingSessionButton.disabled = true;
    ui.pendingReturnButton.disabled = true;
    const abandoned = waiting.retryPayload
      ? profileStorageController.abandon(waiting.retryPayload)
      : { ok: true, code: 'abandoned-session' };
    if (!abandoned?.ok || abandoned.code !== 'abandoned-session') {
      ui.pendingRetryButton.disabled = false;
      ui.pendingSessionButton.disabled = false;
      ui.pendingReturnButton.disabled = !waiting.allowReturn;
      ui.pendingSaveCopy.textContent = 'That pending save can no longer be released safely. Reload the Grove to preserve the browser profile.';
      announce('The pending save could not be released safely.');
      return;
    }

    const sessionResult = sessionProfileResult(
      waiting.sessionProfile || profile,
      { code: 'abandoned-session', state: 'session-read-only' }
    );
    if (!installProfileResult(sessionResult)) {
      pendingSave = null;
      recoveryRequiresReload = true;
      showReloadRecovery(blockedSaveResult('invalid-session-profile', true), waiting.label);
      return;
    }

    pendingSave = null;
    recoveryRequiresReload = false;
    storageReadOnly = true;
    storageNotice = `${waiting.label} is active for this visit only. It was not saved to this device.`;
    if (ui.profileStatus) ui.profileStatus.textContent = 'SESSION PROFILE · NOT SAVED';
    updateStorageWarning();
    ui.pendingRetryButton.disabled = false;
    ui.pendingSessionButton.hidden = true;
    ui.pendingSessionButton.disabled = true;
    ui.pendingReturnButton.hidden = true;
    ui.pendingReturnButton.disabled = true;
    setOverlay(ui.saveRecoveryOverlay, false);
    if (waiting.onSessionEscape) waiting.onSessionEscape(sessionResult);
    else waiting.resume?.(sessionResult);
    announce(`${waiting.label} is active for this visit only and was not saved.`);
  }

  function returnPendingWithoutSaving() {
    if (!pendingSave?.allowReturn) return;
    const waiting = pendingSave;
    ui.pendingRetryButton.disabled = true;
    ui.pendingSessionButton.disabled = true;
    ui.pendingReturnButton.disabled = true;
    const abandoned = waiting.retryPayload
      ? profileStorageController.abandon(waiting.retryPayload)
      : { ok: true, code: 'abandoned-session' };
    if (!abandoned?.ok || abandoned.code !== 'abandoned-session') {
      ui.pendingRetryButton.disabled = false;
      ui.pendingSessionButton.disabled = !waiting.allowSessionEscape;
      ui.pendingReturnButton.disabled = false;
      ui.pendingSaveCopy.textContent = 'That pending save can no longer be released safely. Reload the Grove to preserve the browser profile.';
      announce('The pending save could not be released safely.');
      return;
    }

    const sessionResult = sessionProfileResult(
      waiting.sessionProfile || profile,
      { code: 'abandoned-session', state: 'session-read-only' }
    );
    if (!installProfileResult(sessionResult)) {
      pendingSave = null;
      recoveryRequiresReload = true;
      showReloadRecovery(blockedSaveResult('invalid-session-profile', true), waiting.label);
      return;
    }

    pendingSave = null;
    recoveryRequiresReload = false;
    storageReadOnly = true;
    storageNotice = `${waiting.label} was not saved. Previously recorded Grove progress remains available for this visit.`;
    if (ui.profileStatus) ui.profileStatus.textContent = 'SESSION PROFILE · NOT SAVED';
    updateStorageWarning();
    ui.pendingRetryButton.disabled = false;
    ui.pendingSessionButton.hidden = true;
    ui.pendingSessionButton.disabled = true;
    ui.pendingReturnButton.hidden = true;
    ui.pendingReturnButton.disabled = true;
    setOverlay(ui.saveRecoveryOverlay, false);
    waiting.onReturn?.(sessionResult);
    announce(`${waiting.label} was left unsaved.`);
  }

  function refreshAfterDeferredStartup() {
    ceremonyQueue = [];
    currentCeremony = null;
    resetVisitState();
    clearScorePresentation();
    enqueuePersistentRewards();
    updateProfileUI();
    buildSaplings();
    rendererState.growthPulse = reducedMotion ? 0 : .8;
    syncFirstBloomVisibility({ restart: true, focus: true });
  }

  function startProfileStorage() {
    const startup = profileStorageController.inspectStartup({
      standaloneBests: readStandaloneBests()
    });
    storageReadOnly = Boolean(startup.readOnly);
    storageRecovered = Boolean(startup.recovered);

    if (startup.code === 'future-profile' || startup.code === 'future-recovery-profile') {
      storageNotice = storageFailureNotice(startup, 'Profile startup');
    } else if (startup.code === 'storage-unavailable' || startup.code === 'no-valid-profile') {
      storageNotice = storageFailureNotice(startup, 'Profile startup');
    } else if (startup.recovered) {
      storageNotice = 'The previous safe copy was recovered and verified. Export a backup before continuing.';
    }

    if (startup.readOnly) {
      installProfileResult(sessionProfileResult(startup.profile || defaultProfile()));
      storageAvailable = startup.code !== 'storage-unavailable';
      if (ui.profileStatus) ui.profileStatus.textContent = startup.code.includes('future')
        ? 'NEWER SAVE PRESERVED · SESSION ONLY'
        : 'SESSION PROFILE · STORAGE UNAVAILABLE';
      updateStorageWarning();
      return startup;
    }

    if (!startup.installRequired) {
      if (!installProfileResult(startup)) {
        installProfileResult(sessionProfileResult(defaultProfile()));
        storageReadOnly = true;
        storageAvailable = false;
        storageNotice = 'The local profile could not be installed safely. Reset is available for a fresh Grove.';
        if (ui.profileStatus) ui.profileStatus.textContent = 'SESSION PROFILE · STORAGE UNAVAILABLE';
        updateStorageWarning();
        return blockedSaveResult('startup-install-failed', true);
      }
      storageAvailable = true;
      reflectStorageSuccess();
      return startup;
    }

    const committed = profileStorageController.retry(startup.commitPayload);
    if (!installProfileResult(committed)) {
      rememberPendingSave(
        committed,
        refreshAfterDeferredStartup,
        'Profile startup',
        {
          allowSessionEscape: true,
          sessionProfile: startup.profile
        }
      );
      reflectStorageFailure(committed, 'Profile startup');
      installProfileResult(sessionProfileResult(defaultProfile()));
      return committed;
    }
    storageAvailable = true;
    storageReadOnly = false;
    if (startup.recovered) {
      storageRecovered = true;
      storageNotice = 'The previous safe copy was recovered and verified. Export a backup before continuing.';
    }
    reflectStorageSuccess();
    return committed;
  }

  function updateStorageWarning() {
    if (!ui.storageWarning) return;
    const directFile = location.protocol === 'file:';
    const visible = directFile
      || !storageAvailable
      || storageReadOnly
      || storageRecovered
      || storageCleanupIncomplete
      || Boolean(pendingSave);
    ui.storageWarning.classList.toggle('is-hidden', !visible);
    if (!visible) return;
    ui.storageWarningText.textContent = storageNotice || (directFile
      ? 'Direct-file saves vary by browser. Use PLAY MASTERY GROVE.cmd for one stable local save origin.'
      : 'Export a profile backup before clearing browser data or changing devices.');
  }

  function firstBloomNeeded() {
    return profile?.livingArcade?.onboarding?.firstBloomCompleted === false;
  }

  function firstBloomInstruction(state = firstBloomState) {
    if (!state) return 'Move';
    if (state.phase === firstBloom.PHASES.MOVEMENT) return 'Move';
    if (state.phase === firstBloom.PHASES.AWAKENING) return 'Awaken';
    if (state.phase === firstBloom.PHASES.CLOSURE) return 'Close';
    if (state.phase === firstBloom.PHASES.STITCH) {
      return state.thread.length === 0 ? 'Begin' : 'Touch';
    }
    return 'Bloom';
  }

  function firstBloomSpokenInstruction(state = firstBloomState) {
    if (!state) return 'Move the loomwing.';
    if (state.phase === firstBloom.PHASES.MOVEMENT) return 'Move the loomwing.';
    if (state.phase === firstBloom.PHASES.AWAKENING) return 'Three light flowers are waking.';
    if (state.phase === firstBloom.PHASES.CLOSURE) {
      return 'Return to the first flower to close the shape.';
    }
    if (state.phase === firstBloom.PHASES.STITCH) {
      if (state.layout === 'easy-triangle' && state.thread.length === 0) {
        return 'The flowers moved closer. Choose any flower to begin again.';
      }
      return state.thread.length === 0
        ? 'Choose any flower to begin a thread.'
        : 'Choose another glowing flower.';
    }
    return 'First Bloom is ready.';
  }

  function announceFirstBloom(previous, next) {
    const key = [
      next.phase,
      next.thread.length,
      next.closureFailures,
      next.assist,
      next.layout
    ].join('|');
    if (key === firstBloomLastAnnouncementKey) return;
    firstBloomLastAnnouncementKey = key;
    let message = firstBloomSpokenInstruction(next);
    if (next.phase === firstBloom.PHASES.CLOSURE
      && previous?.closureFailures !== next.closureFailures
      && next.closureFailures > 0) {
      message = next.closureFailures < 3
        ? 'That flower does not close this shape. Return to the first flower.'
        : firstBloomSpokenInstruction(next);
    } else if (next.assist === 'strong' && previous?.assist !== 'strong') {
      message = `${message} The brighter pulse shows what to try.`;
    } else if (next.phase === firstBloom.PHASES.REVEAL) {
      message = 'Saving First Bloom.';
    }
    ui.firstBloomLive.textContent = message;
  }

  function firstBloomPath(points, close = false) {
    if (!Array.isArray(points) || points.length < 2) return '';
    const commands = points.map((point, index) => (
      `${index === 0 ? 'M' : 'L'} ${Math.round(point.x * 1000)} ${Math.round(point.y * 1000)}`
    ));
    if (close) commands.push('Z');
    return commands.join(' ');
  }

  function renderFirstBloom() {
    const state = firstBloomState;
    if (!state) return;
    const busy = firstBloomCompleting || firstBloomRevealCommitted;
    const overlay = ui.firstBloomOverlay;
    Object.values(firstBloom.PHASES).forEach((phase) => {
      overlay.classList.remove(`phase-${phase}`);
    });
    overlay.classList.add(`phase-${state.phase}`);
    overlay.classList.toggle('assist-strong', state.assist === 'strong');
    overlay.classList.toggle('is-saving', firstBloomCompleting && !firstBloomRevealCommitted);
    overlay.classList.toggle('is-revealing', firstBloomRevealCommitted);
    overlay.classList.toggle('is-session-only', firstBloomSessionOnly);
    overlay.dataset.reveal = firstBloomRevealCommitted
      ? state.presentation.completionReveal
      : 'none';

    ui.firstBloomStage.dataset.phase = state.phase;
    ui.firstBloomStage.dataset.cue = state.presentation.cue;
    ui.firstBloomStage.dataset.cueStrength = state.presentation.cueStrength;
    ui.firstBloomStage.setAttribute('aria-label', firstBloomSpokenInstruction(state));

    ui.firstBloomLoomwing.style.left = `${state.loomwing.x * 100}%`;
    ui.firstBloomLoomwing.style.top = `${state.loomwing.y * 100}%`;
    ui.firstBloomLoomwing.style.setProperty('--loom-x', String(state.loomwing.x));
    ui.firstBloomLoomwing.style.setProperty('--loom-y', String(state.loomwing.y));

    const selectedFlowers = state.thread
      .map((flowerId) => state.flowers.find((flower) => flower.id === flowerId))
      .filter(Boolean);
    let threadPoints = selectedFlowers;
    if (selectedFlowers.length === 1 && !firstBloomRevealCommitted) {
      threadPoints = [state.loomwing, selectedFlowers[0]];
    } else if (firstBloomRevealCommitted
      && state.outcome?.method === 'played'
      && selectedFlowers.length === state.flowers.length) {
      threadPoints = [...selectedFlowers, selectedFlowers[0]];
    }
    ui.firstBloomThreadPath.setAttribute('d', firstBloomPath(threadPoints));

    let cueTarget = state.loomwing;
    if (state.presentation.cue === 'begin-thread') {
      cueTarget = state.flowers[0];
    } else if (state.presentation.cue === 'touch-flower') {
      cueTarget = state.flowers.find((flower) => !state.thread.includes(flower.id))
        || state.flowers[0];
    } else if (state.presentation.cue === 'close-shape') {
      cueTarget = state.flowers.find((flower) => flower.id === state.thread[0])
        || state.flowers[0];
    }
    ui.firstBloomCue.style.left = `${cueTarget.x * 100}%`;
    ui.firstBloomCue.style.top = `${cueTarget.y * 100}%`;
    const closureStart = state.flowers.find((flower) => flower.id === state.thread[0]);
    const closureEnd = state.flowers.find(
      (flower) => flower.id === state.thread[state.thread.length - 1]
    );
    ui.firstBloomCuePath.setAttribute(
      'd',
      state.phase === firstBloom.PHASES.CLOSURE && closureStart && closureEnd
        ? firstBloomPath([closureEnd, closureStart])
        : ''
    );

    state.flowers.forEach((flower, index) => {
      const button = ui.firstBloomFlowerButtons[index];
      const threaded = state.thread.includes(flower.id);
      const threadStart = state.thread[0] === flower.id;
      const closureTarget = state.phase === firstBloom.PHASES.CLOSURE && threadStart;
      const nextTouch = state.phase === firstBloom.PHASES.STITCH
        && flower.awake
        && !threaded;
      const beginCue = state.phase === firstBloom.PHASES.STITCH
        && state.thread.length === 0
        && flower.awake;
      button.style.left = `${flower.x * 100}%`;
      button.style.top = `${flower.y * 100}%`;
      button.classList.toggle('awake', flower.awake);
      button.classList.toggle('threaded', threaded);
      button.classList.toggle('thread-start', threadStart);
      button.classList.toggle('closure-target', closureTarget);
      button.classList.toggle('is-cued', beginCue || nextTouch || closureTarget);
      button.disabled = !flower.awake || busy;
      button.setAttribute(
        'aria-label',
        `Light flower ${index + 1}${threaded ? ', threaded' : ''}${closureTarget ? ', close the shape here' : ''}`
      );
    });

    ui.firstBloomHint.textContent = firstBloomInstruction(state);
    ui.firstBloomSaveStatus.textContent = firstBloomRevealCommitted
      ? firstBloomSessionOnly ? 'THIS VISIT · NOT SAVED' : 'SAVED'
      : firstBloomCompleting
        ? 'SAVING'
        : storageReadOnly ? 'THIS VISIT · NOT SAVED' : 'LOCAL SAVE';
    ui.firstBloomSkipButton.disabled = busy;
    ui.firstBloomDirectionButtons.forEach((button) => { button.disabled = busy; });
    ui.firstBloomTreeReveal.setAttribute('aria-hidden', 'true');
  }

  function tickFirstBloom() {
    firstBloomTickTimer = 0;
    const now = performance.now();
    const elapsed = Math.max(1, Math.min(250, Math.round(now - firstBloomLastTickAt)));
    firstBloomLastTickAt = now;
    if (document.hidden
      || !ui.firstBloomOverlay.classList.contains('is-visible')
      || ui.firstBloomOverlay.inert
      || firstBloomCompleting
      || !firstBloomState
      || firstBloomState.phase === firstBloom.PHASES.REVEAL) return;
    dispatchFirstBloom({
      type: firstBloom.ACTIONS.ELAPSE,
      deltaMs: elapsed
    });
    if (!document.hidden
      && ui.firstBloomOverlay.classList.contains('is-visible')
      && !ui.firstBloomOverlay.inert
      && !firstBloomCompleting
      && !firstBloomRevealCommitted) {
      firstBloomTickTimer = window.setTimeout(tickFirstBloom, 100);
    }
  }

  function startFirstBloomTicker() {
    if (firstBloomTickTimer) window.clearTimeout(firstBloomTickTimer);
    firstBloomLastTickAt = performance.now();
    firstBloomTickTimer = window.setTimeout(tickFirstBloom, 100);
  }

  function pauseFirstBloomActivity() {
    if (firstBloomTickTimer) window.clearTimeout(firstBloomTickTimer);
    if (firstBloomPointerFrame) cancelAnimationFrame(firstBloomPointerFrame);
    if (firstBloomPointerId !== null) {
      try { ui.firstBloomStage.releasePointerCapture(firstBloomPointerId); }
      catch (_) { /* Pointer capture may already have ended. */ }
    }
    firstBloomTickTimer = 0;
    firstBloomPointerFrame = 0;
    firstBloomPointerId = null;
    firstBloomPointerPosition = null;
    firstBloomLastTickAt = 0;
  }

  function stopFirstBloom() {
    firstBloomGeneration += 1;
    pauseFirstBloomActivity();
    if (firstBloomRevealTimer) window.clearTimeout(firstBloomRevealTimer);
    firstBloomRevealTimer = 0;
  }

  function dismissFirstBloomReveal(revealGeneration) {
    if (revealGeneration !== firstBloomGeneration || !firstBloomRevealCommitted) return false;
    firstBloomRevealTimer = 0;
    if (document.hidden) return false;
    setOverlay(ui.firstBloomOverlay, false);
    stopFirstBloom();
    window.scrollTo(0, 0);
    if (ceremonyQueue.length) {
      showNextCeremony();
    } else {
      focusGamePlayControl('lumenloom');
    }
    return true;
  }

  function finishFirstBloomReveal(method, commitResult = null) {
    if (firstBloomRevealCommitted) return;
    firstBloomRevealCommitted = true;
    firstBloomCompleting = false;
    firstBloomSessionOnly = commitResult?.saved === false
      || commitResult?.code === 'session-only';
    renderFirstBloom();
    ui.firstBloomLive.textContent = firstBloomSessionOnly
      ? 'First Bloom complete for this visit. Local saving is unavailable.'
      : method === 'skipped'
        ? 'First Bloom skipped. The Lantern Willow is ready.'
        : 'First Bloom complete. The Lantern Willow is ready.';
    updateProfileUI();
    buildSaplings();
    rendererState.growthPulse = reducedMotion ? 0 : 1;
    rendererState.growthPulseColor = '#a7ffda';

    // Motion preference changes the animation, not the amount of time the
    // player or assistive technology has to understand the committed result.
    const revealDuration = method === 'skipped' ? 900 : 1280;
    const revealGeneration = firstBloomGeneration;
    firstBloomRevealTimer = window.setTimeout(() => {
      dismissFirstBloomReveal(revealGeneration);
    }, revealDuration);
  }

  function completeFirstBloom(method) {
    if (firstBloomCompleting || firstBloomRevealCommitted) return;
    firstBloomCompleting = true;
    renderFirstBloom();
    const completed = progression.completeFirstBloom(profile);
    if (!completed.ok && completed.code !== 'already-complete') {
      firstBloomCompleting = false;
      renderFirstBloom();
      ui.firstBloomLive.textContent = 'First Bloom could not be completed safely.';
      return;
    }
    if (completed.code === 'already-complete') {
      finishFirstBloomReveal(method, { ok: true, code: 'already-complete', saved: true });
      return;
    }
    const committed = commitProfile(completed.profile, {
      label: 'First Bloom',
      allowSessionOnly: true,
      allowSessionEscape: true,
      sessionProfile: completed.profile,
      resume: (result) => finishFirstBloomReveal(method, result)
    });
    if (!committed.ok) {
      renderFirstBloom();
      return;
    }
    finishFirstBloomReveal(method, committed);
  }

  function dispatchFirstBloom(action) {
    if (!firstBloomState || firstBloomRevealCommitted) return firstBloomState;
    const previous = firstBloomState;
    const next = firstBloom.reduce(previous, action);
    if (next === previous) return previous;
    firstBloomState = next;
    renderFirstBloom();
    announceFirstBloom(previous, next);
    if (firstBloom.isComplete(next)) {
      completeFirstBloom(next.outcome.method);
    }
    return next;
  }

  function startFirstBloom(options = {}) {
    stopFirstBloom();
    const startGeneration = firstBloomGeneration;
    firstBloomState = firstBloom.createInitialState({ reducedMotion });
    firstBloomCompleting = false;
    firstBloomRevealCommitted = false;
    firstBloomSessionOnly = false;
    firstBloomLastAnnouncementKey = '';
    renderFirstBloom();
    setOverlay(ui.firstBloomOverlay, true);
    startFirstBloomTicker();
    announceFirstBloom(null, firstBloomState);
    if (options.focus !== false) {
      window.setTimeout(() => {
        if (startGeneration === firstBloomGeneration
          && !ui.firstBloomOverlay.inert
          && ui.firstBloomOverlay.classList.contains('is-visible')) {
          ui.firstBloomStage.focus({ preventScroll: true });
        }
      }, 80);
    }
  }

  function syncFirstBloomVisibility(options = {}) {
    if (firstBloomNeeded()) {
      if (options.restart || !firstBloomState || firstBloomRevealCommitted) {
        startFirstBloom(options);
      } else {
        setOverlay(ui.firstBloomOverlay, true);
        startFirstBloomTicker();
      }
      return true;
    }
    stopFirstBloom();
    setOverlay(ui.firstBloomOverlay, false);
    if (options.focus) {
      window.setTimeout(() => {
        focusGamePlayControl('lumenloom');
      }, 80);
    }
    return false;
  }

  function moveFirstBloomBy(deltaX, deltaY) {
    if (!firstBloomState || firstBloomCompleting || firstBloomRevealCommitted) return;
    dispatchFirstBloom({
      type: firstBloom.ACTIONS.MOVE,
      x: firstBloomState.loomwing.x + deltaX,
      y: firstBloomState.loomwing.y + deltaY
    });
  }

  function firstBloomPointFromEvent(event) {
    const bounds = ui.firstBloomStage.getBoundingClientRect();
    if (bounds.width <= 0 || bounds.height <= 0) return null;
    return {
      x: (event.clientX - bounds.left) / bounds.width,
      y: (event.clientY - bounds.top) / bounds.height
    };
  }

  function queueFirstBloomPointer(event) {
    const point = firstBloomPointFromEvent(event);
    if (!point) return;
    const pointerGeneration = firstBloomGeneration;
    firstBloomPointerPosition = point;
    if (firstBloomPointerFrame) return;
    firstBloomPointerFrame = requestAnimationFrame(() => {
      firstBloomPointerFrame = 0;
      const nextPoint = firstBloomPointerPosition;
      firstBloomPointerPosition = null;
      if (!nextPoint
        || pointerGeneration !== firstBloomGeneration
        || ui.firstBloomOverlay.inert
        || document.hidden) return;
      dispatchFirstBloom({
        type: firstBloom.ACTIONS.MOVE,
        x: nextPoint.x,
        y: nextPoint.y
      });
    });
  }

  function releaseFirstBloomPointer(event) {
    if (event.pointerId !== firstBloomPointerId) return;
    if (event.type === 'pointerup') {
      // Keep the final queued position; capture releases automatically.
      firstBloomPointerId = null;
      return;
    }
    if (firstBloomPointerFrame) cancelAnimationFrame(firstBloomPointerFrame);
    firstBloomPointerFrame = 0;
    firstBloomPointerPosition = null;
    try { ui.firstBloomStage.releasePointerCapture(event.pointerId); }
    catch (_) { /* Pointer capture may already have ended. */ }
    firstBloomPointerId = null;
  }

  function handleFirstBloomKeydown(event) {
    if (!ui.firstBloomOverlay.classList.contains('is-visible')
      || firstBloomCompleting
      || firstBloomRevealCommitted
      || event.target !== ui.firstBloomStage
      || event.altKey
      || event.ctrlKey
      || event.metaKey) return;
    const step = event.shiftKey ? .11 : .065;
    const movement = {
      ArrowUp: [0, -step],
      w: [0, -step],
      ArrowLeft: [-step, 0],
      a: [-step, 0],
      ArrowRight: [step, 0],
      d: [step, 0],
      ArrowDown: [0, step],
      s: [0, step]
    }[event.key.length === 1 ? event.key.toLowerCase() : event.key];
    if (!movement) return;
    event.preventDefault();
    moveFirstBloomBy(movement[0], movement[1]);
  }

  function installFirstBloomControls() {
    ui.firstBloomOverlay.addEventListener('pointerdown', (event) => {
      if (firstBloomPointerId !== null
        && event.pointerId !== firstBloomPointerId
        && event.target.closest?.('button')) {
        event.preventDefault();
        event.stopPropagation();
      }
    }, { capture: true });
    ui.firstBloomStage.addEventListener('pointerdown', (event) => {
      if (firstBloomCompleting
        || firstBloomRevealCommitted
        || firstBloomPointerId !== null
        || event.target.closest?.('button')
        || (event.pointerType === 'mouse' && event.button !== 0)) return;
      event.preventDefault();
      firstBloomPointerId = event.pointerId;
      try { ui.firstBloomStage.setPointerCapture(event.pointerId); }
      catch (_) { /* Movement still works when pointer capture is unavailable. */ }
      queueFirstBloomPointer(event);
    });
    ui.firstBloomStage.addEventListener('pointermove', (event) => {
      const mouseHover = event.pointerType === 'mouse'
        && firstBloomPointerId === null
        && event.buttons === 0
        && !event.target.closest?.('button');
      if (!mouseHover && event.pointerId !== firstBloomPointerId) return;
      event.preventDefault();
      queueFirstBloomPointer(event);
    });
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach((type) => {
      ui.firstBloomStage.addEventListener(type, releaseFirstBloomPointer);
    });
    ui.firstBloomOverlay.addEventListener('keydown', handleFirstBloomKeydown);
    ui.firstBloomFlowerButtons.forEach((button) => {
      button.addEventListener('click', () => {
        const flowerId = button.dataset.firstBloomFlower;
        dispatchFirstBloom({
          type: firstBloomState?.phase === firstBloom.PHASES.CLOSURE
            ? firstBloom.ACTIONS.CLOSE
            : firstBloom.ACTIONS.STITCH,
          flowerId
        });
      });
    });
    ui.firstBloomDirectionButtons.forEach((button) => {
      button.addEventListener('click', () => {
        moveFirstBloomBy(
          Number(button.dataset.dx),
          Number(button.dataset.dy)
        );
      });
    });
    ui.firstBloomSkipButton.addEventListener('click', () => {
      dispatchFirstBloom({ type: firstBloom.ACTIONS.SKIP });
    });
  }

  function handleFirstBloomVisibilityChange() {
    if (document.hidden) {
      pauseFirstBloomActivity();
    } else if (firstBloomRevealCommitted
      && !firstBloomRevealTimer
      && ui.firstBloomOverlay.classList.contains('is-visible')) {
      dismissFirstBloomReveal(firstBloomGeneration);
    } else if (ui.firstBloomOverlay.classList.contains('is-visible')
      && !ui.firstBloomOverlay.inert
      && !firstBloomCompleting
      && !firstBloomRevealCommitted) {
      startFirstBloomTicker();
    }
    restartRenderer(!document.hidden && !document.body.classList.contains('modal-open'));
  }

  function growthFor(gameId, score = profile.games[gameId].totalScore) {
    return progression.growthFor(gameId, score);
  }

  function combinedMarks() {
    return progression.foundationalMarks(profile);
  }

  function groveRenderModel() {
    if (renderModelProfile === profile && renderModel) return renderModel;
    const lumenGrowth = growthFor('lumenloom');
    const bloomGrowth = growthFor('bloomfold');
    const rippleGrowth = growthFor('ripplewake');
    const marks = lumenGrowth.level + bloomGrowth.level + rippleGrowth.level;
    renderModel = Object.freeze({
      lumenGrowth,
      bloomGrowth,
      rippleGrowth,
      marks,
      // Preserve the shipping First Tree scale: three foundational disciplines
      // plus the separately drawn Guardian crown. Later registries must never
      // shrink an existing player's tree by increasing this denominator.
      overallGrowth: (lumenGrowth.progress + bloomGrowth.progress + rippleGrowth.progress) / (FIRST_TREE_PART_COUNT * 100),
      guardianUnlocked: Boolean(profile?.unlocks?.prismbind),
      guardianAwakened: Boolean(profile?.regions?.secondGroveUnlocked),
      secondGroveRevealed: Boolean(profile?.regions?.trees05To07Revealed)
    });
    renderModelProfile = profile;
    rendererMetrics.modelBuilds += 1;
    return renderModel;
  }

  function groveRankFor(marks) {
    return progression.groveRankForMarks(marks);
  }

  function formatNumber(value) {
    return safeInteger(value).toLocaleString('en-US');
  }

  function carouselModeUnlockLabel(modeId) {
    if (modeId === 'petalRush') return 'First Bloom';
    if (modeId === 'shiftingConstellation') return 'Silver';
    if (modeId === 'hollowRush') return 'Gold';
    return 'always';
  }

  function carouselGateLabel(entry, view, seedCount) {
    if (!entry?.implemented) return 'NOT YET ANNOUNCED';
    if (view.unlocked) return view.reward?.growthLabel || 'TREE IN FULL BLOOM';
    if (entry.gameId === 'prismbind') return `${seedCount} / 3 MASTERY SEEDS`;
    if (entry.gameId === 'mothchorus') return 'DEFEAT PRISMBIND';
    return view.reward?.skillLabel || 'TREE SLEEPING';
  }

  function growthRenderOptions() {
    return Object.freeze({
      deviceClass: isLikelyMobileRenderer() ? 'phone' : 'desktop',
      reducedMotion
    });
  }

  function setPooledVisibility(elements, visibleCount) {
    const count = Math.max(0, Math.min(elements.length, Math.round(visibleCount)));
    elements.forEach((element, index) => { element.hidden = index >= count; });
  }

  function hideGrowthTransferSurface() {
    window.clearTimeout(growthTransferHideTimer);
    growthTransferHideTimer = 0;
    ui.livingCarouselStage?.classList.remove('has-transfer');
    if (ui.livingCarouselTransfer) {
      ui.livingCarouselTransfer.classList.remove('is-visible', 'is-streaming');
      ui.livingCarouselTransfer.hidden = true;
    }
    ui.livingCarouselTransferMotes.forEach((mote) => {
      mote.hidden = true;
      mote.classList.remove('is-active');
    });
  }

  function failGrowthVisuals(error, descriptor = null) {
    if (growthVisualsFailed) {
      if (descriptor?.delta > 0) {
        showToast(`${formatNumber(descriptor.delta)} points were saved to ${GAMES[descriptor.gameId]?.tree || 'the selected tree'}.`);
      }
      return false;
    }
    growthVisualsFailed = true;
    const result = descriptor || activeGrowthTransfer?.descriptor || pendingGrowthTransfer;
    pendingGrowthTransfer = null;
    activeGrowthTransfer = null;
    hideGrowthTransferSurface();
    if (ui.livingCarousel) ui.livingCarousel.dataset.growthVisualState = 'static-fallback';
    if (result?.delta > 0) {
      showToast(`${formatNumber(result.delta)} points were saved to ${GAMES[result.gameId]?.tree || 'the selected tree'}.`);
    }
    if (error) console.error('Score growth stayed on its static, playable fallback.', error);
    return false;
  }

  function modelForCarouselEntry(entry, totalScore) {
    if (!growthVisuals || growthVisualsFailed) return null;
    const options = growthRenderOptions();
    return entry?.gameId
      ? growthVisuals.deriveTreeModel(entry.gameId, safeInteger(totalScore), options)
      : growthVisuals.deriveSleepingSeed(entry?.position, options);
  }

  function applyGrowthVisualModel(model, entry) {
    if (!model || !ui.livingCarouselTreeVisual || !ui.livingCarouselStage) return false;
    const visual = ui.livingCarouselTreeVisual;
    const geometry = model.geometry;
    const branchFraction = geometry.branchSegments / Math.max(1, model.render.caps.branchSegments);
    const foliageTotal = geometry.leafCount + geometry.flowerCount;
    const foliageFraction = foliageTotal / Math.max(1, model.render.caps.foliage);
    const bloomFraction = geometry.flowerCount / Math.max(1, model.render.caps.foliage);
    const stageIndex = Number.isSafeInteger(model.stage.index) ? model.stage.index : null;

    visual.dataset.growthSpecies = model.speciesId || 'sleeping-seed';
    visual.dataset.growthSilhouette = model.silhouette;
    visual.dataset.growthContinuous = String(model.detail === 'continuous');
    visual.style.setProperty('--growth-branch-reach', String(geometry.branchReach));
    visual.style.setProperty('--growth-branch-opacity', String(.08 + branchFraction * .82));
    visual.style.setProperty('--growth-crown-scale', String(.46 + foliageFraction * .54));
    visual.style.setProperty('--growth-crown-opacity', String(.12 + foliageFraction * .88));
    visual.style.setProperty('--growth-trunk-height', `${34 + branchFraction * 42}%`);
    visual.style.setProperty('--growth-bloom-opacity', String(geometry.flowerCount ? .22 + bloomFraction * .78 : 0));
    visual.style.setProperty('--growth-bloom-scale', String(.64 + bloomFraction * .36));
    visual.style.setProperty('--growth-aura-opacity', String(.06 + geometry.auraStrength * .78));
    visual.style.setProperty('--growth-light-shadow', `${Math.round(3 + geometry.lightIntensity * 23)}px`);
    ui.livingCarouselStage.style.setProperty('--growth-stage-aura-opacity', String(.24 + geometry.auraStrength * .55));
    ui.livingCarouselStage.dataset.growthStage = model.stage.name.toLowerCase().replace(/\s+/g, '-');
    ui.livingCarouselGrowthStage.textContent = model.stage.name;

    const branchCount = model.kind === 'tree'
      ? Math.ceil(ui.livingCarouselTreeBranches.length * branchFraction)
      : 0;
    const bloomCount = model.kind === 'tree'
      ? Math.ceil(ui.livingCarouselTreeBlooms.length * bloomFraction)
      : 0;
    setPooledVisibility(ui.livingCarouselTreeBranches, branchCount);
    setPooledVisibility(ui.livingCarouselTreeBlooms, bloomCount);
    setPooledVisibility(ui.livingCarouselTreeAuraRings, model.everbloom.renderTier);

    const exactRings = model.everbloom.rings;
    if (ui.livingCarouselEverbloom) {
      ui.livingCarouselEverbloom.hidden = exactRings === 0;
      ui.livingCarouselEverbloom.textContent = exactRings === 1
        ? 'EVERBLOOM RING 1'
        : `EVERBLOOM RINGS ${formatNumber(exactRings)}`;
    }
    const positionLabel = String(entry?.position || 1).padStart(2, '0');
    visual.setAttribute(
      'aria-label',
      model.kind === 'sleeping-seed'
        ? `Sleeping Tree ${positionLabel}. No game has been announced.`
        : `${entry.tree} at ${model.stage.name} growth${exactRings ? ` with ${formatNumber(exactRings)} Everbloom ${exactRings === 1 ? 'ring' : 'rings'}` : ''}.`
    );
    if (ui.livingCarousel) {
      ui.livingCarousel.dataset.growthVisualState = 'deterministic';
      ui.livingCarousel.dataset.growthStageIndex = stageIndex === null ? 'sleeping' : String(stageIndex);
    }
    return true;
  }

  function renderSelectedGrowthModel(entry, canonicalTotal, unlocked = true) {
    if (!growthVisuals || growthVisualsFailed) return false;
    try {
      if (entry?.gameId && !unlocked) {
        ui.livingCarouselTreeVisual.dataset.growthSpecies = 'sleeping-seed';
        ui.livingCarouselTreeVisual.dataset.growthSilhouette = 'sleeping-seed';
        ui.livingCarouselTreeVisual.dataset.growthContinuous = 'false';
        ui.livingCarouselTreeVisual.style.setProperty('--growth-branch-reach', '0');
        ui.livingCarouselTreeVisual.style.setProperty('--growth-branch-opacity', '0');
        ui.livingCarouselTreeVisual.style.setProperty('--growth-crown-scale', '.46');
        ui.livingCarouselTreeVisual.style.setProperty('--growth-crown-opacity', '.12');
        ui.livingCarouselTreeVisual.style.setProperty('--growth-trunk-height', '34%');
        ui.livingCarouselTreeVisual.style.setProperty('--growth-bloom-opacity', '0');
        ui.livingCarouselTreeVisual.style.setProperty('--growth-aura-opacity', '.06');
        ui.livingCarouselStage.style.setProperty('--growth-stage-aura-opacity', '.24');
        setPooledVisibility(ui.livingCarouselTreeBranches, 0);
        setPooledVisibility(ui.livingCarouselTreeBlooms, 0);
        setPooledVisibility(ui.livingCarouselTreeAuraRings, 0);
        ui.livingCarouselEverbloom.hidden = true;
        ui.livingCarousel.dataset.growthVisualState = 'deterministic';
        ui.livingCarousel.dataset.growthStageIndex = 'sleeping';
        return true;
      }
      const transferTotal = activeGrowthTransfer?.descriptor.gameId === entry?.gameId
        ? activeGrowthTransfer.state.displayTotal
        : canonicalTotal;
      const model = modelForCarouselEntry(entry, transferTotal);
      if (!model) throw new Error('The deterministic tree model was unavailable.');
      return applyGrowthVisualModel(model, entry);
    } catch (error) {
      return failGrowthVisuals(error);
    }
  }

  function growthTransferLabel(feedback) {
    if (feedback?.isPersonalBest) return 'SAVED · NEW BEST';
    if (feedback?.matchedBest) return 'SAVED · BEST MATCHED';
    if (feedback?.nearBest) return 'SAVED · NEAR BEST';
    return 'SAVED';
  }

  function queueGrowthTransfer(context) {
    if (trialSession?.active || context?.result?.score <= 0) return false;
    const gameId = context.gameId;
    const fromTotal = safeInteger(context.previousTotal);
    const toTotal = safeInteger(profile.games?.[gameId]?.totalScore);
    if (!GAMES[gameId] || toTotal <= fromTotal) return false;
    pendingGrowthTransfer = Object.freeze({
      gameId,
      modeId: gameId === 'lumenloom' ? activeLumenloomModeId || 'standard' : null,
      fromTotal,
      toTotal,
      delta: toTotal - fromTotal,
      label: growthTransferLabel(context.feedback)
    });
    return true;
  }

  function updateGrowthTransferSurface(force = false) {
    if (!activeGrowthTransfer || !ui.livingCarouselTransfer) return false;
    const transfer = activeGrowthTransfer.state;
    const writeStep = transfer.status === 'complete'
      ? SCORE_COUNT_MAX_WRITES
      : Math.min(SCORE_COUNT_MAX_WRITES, Math.floor(transfer.progress * SCORE_COUNT_MAX_WRITES));
    if (!force && writeStep === activeGrowthTransfer.lastWriteStep) return false;
    activeGrowthTransfer.lastWriteStep = writeStep;
    ui.livingCarouselTransferLabel.textContent = activeGrowthTransfer.descriptor.label;
    ui.livingCarouselTransferScore.textContent = `+${formatNumber(activeGrowthTransfer.descriptor.delta)}`;
    ui.livingCarouselTransferTotal.textContent = `TREE TOTAL ${formatNumber(transfer.displayTotal)}`;
    ui.livingCarouselTransfer.dataset.transferState = transfer.status;
    ui.livingCarouselTransfer.classList.toggle('is-streaming', transfer.status === 'running' && transfer.moteCount > 0);
    const moteCapacity = growthVisuals.RENDER_CAPS[transfer.deviceClass].scoreMotes;
    ui.livingCarouselTransferMotes.forEach((mote, index) => {
      mote.hidden = index >= moteCapacity;
      mote.classList.toggle('is-active', index < transfer.moteCount);
    });

    const entry = carousel?.REGISTRY?.find((candidate) => candidate.gameId === transfer.gameId);
    try {
      const model = modelForCarouselEntry(entry, transfer.displayTotal);
      if (!model) throw new Error('The score transfer tree model was unavailable.');
      applyGrowthVisualModel(model, entry);
    } catch (error) {
      failGrowthVisuals(error, activeGrowthTransfer.descriptor);
      return false;
    }
    return true;
  }

  function presentPendingVisitHarmony() {
    if (!pendingVisitHarmony || activeGameId || currentCeremony || activeGrowthTransfer) return false;
    pendingVisitHarmony = false;
    rendererState.growthPulse = reducedMotion ? 0 : .8;
    rendererState.growthPulseColor = '#ffd773';
    ui.firstTree?.classList.remove('is-harmony-received');
    ui.livingCarouselHarmony?.classList.remove('is-harmony-received');
    if (!reducedMotion) requestAnimationFrame(() => {
      ui.firstTree?.classList.add('is-harmony-received');
      ui.livingCarouselHarmony?.classList.add('is-harmony-received');
    });
    window.setTimeout(() => {
      ui.firstTree?.classList.remove('is-harmony-received');
      ui.livingCarouselHarmony?.classList.remove('is-harmony-received');
    }, 900);
    playGroveHarmony();
    showToast('Grove Harmony awakened — three tree voices, one visit.', 3);
    announceCarousel('Grove Harmony awakened. All three foundational trees were played this visit.');
    return true;
  }

  function settleGrowthPresentation(returnGame, options = {}) {
    presentPendingVisitHarmony();
    if (ceremonyQueue.length) {
      window.setTimeout(showNextCeremony, 100);
    } else if (!options.suppressFocus && !activeGameId && !currentCeremony) {
      window.setTimeout(() => focusGamePlayControl(returnGame || 'lumenloom'), 100);
    }
  }

  function closeGrowthTransferSurface(active, options = {}) {
    if (!active || activeGrowthTransfer !== active) return;
    const retryHadFocus = document.activeElement === ui.livingCarouselTransferRetry;
    hideGrowthTransferSurface();
    activeGrowthTransfer = null;
    renderLivingCarousel();
    if (retryHadFocus && !options.suppressFocus && !ceremonyQueue.length) {
      ui.livingCarouselPlayButton?.focus({ preventScroll: true });
    }
    settleGrowthPresentation(active.descriptor.gameId, { suppressFocus: Boolean(options.suppressFocus) });
    if (options.announce === false) ui.livingCarouselTransferLive.textContent = '';
  }

  function finishGrowthTransfer(active) {
    if (!active || activeGrowthTransfer !== active || active.settled) return;
    active.settled = true;
    updateGrowthTransferSurface(true);
    rendererState.growthPulse = reducedMotion ? 0 : .9;
    rendererState.growthPulseColor = GAMES[active.descriptor.gameId].color;
    playTreeVoice(active.descriptor.gameId, 'growth');
    ui.livingCarouselTransferLive.textContent = `${formatNumber(active.descriptor.delta)} points saved. ${GAMES[active.descriptor.gameId].tree} total is ${formatNumber(active.state.toTotal)}.`;
    const elapsedMs = Math.max(0, performance.now() - active.presentationStartedAt);
    const holdMs = Math.min(500, Math.max(0, growthVisuals.TRANSFER_MAX_DURATION_MS - elapsedMs));
    growthTransferHideTimer = window.setTimeout(() => closeGrowthTransferSurface(active), holdMs);
  }

  function tickGrowthTransfer(now) {
    if (!activeGrowthTransfer || activeGrowthTransfer.state.status !== 'running') return;
    try {
      activeGrowthTransfer.state = growthVisuals.reduceScoreTransfer(activeGrowthTransfer.state, {
        type: 'tick',
        nowMs: Math.max(0, Math.floor(now))
      });
      updateGrowthTransferSurface();
      if (activeGrowthTransfer?.state.status === 'complete') finishGrowthTransfer(activeGrowthTransfer);
    } catch (error) {
      failGrowthVisuals(error);
    }
  }

  function activatePendingGrowthTransfer(returningGame) {
    if (!pendingGrowthTransfer || pendingGrowthTransfer.gameId !== returningGame) return false;
    const descriptor = pendingGrowthTransfer;
    pendingGrowthTransfer = null;
    if (!growthVisuals || growthVisualsFailed || !carouselActive || !ui.livingCarouselTransfer) {
      return failGrowthVisuals(null, descriptor);
    }
    try {
      const startedAtMs = Math.max(0, Math.floor(performance.now()));
      const transfer = growthVisuals.createScoreTransfer({
        gameId: descriptor.gameId,
        fromTotal: descriptor.fromTotal,
        toTotal: descriptor.toTotal,
        startedAtMs,
        persisted: true,
        ...growthRenderOptions()
      });
      if (!transfer) throw new Error('The saved score could not create a deterministic transfer.');
      activeGrowthTransfer = {
        descriptor,
        state: transfer,
        presentationStartedAt: startedAtMs,
        lastWriteStep: -1,
        settled: false
      };
      ui.livingCarouselTransfer.hidden = false;
      ui.livingCarouselStage.classList.add('has-transfer');
      ui.livingCarouselTransferRetry.setAttribute('aria-label', `Retry ${GAMES[descriptor.gameId].title}`);
      updateGrowthTransferSurface(true);
      requestAnimationFrame(() => {
        if (activeGrowthTransfer?.descriptor === descriptor) ui.livingCarouselTransfer.classList.add('is-visible');
      });
      ui.livingCarouselTransferLive.textContent = `${formatNumber(descriptor.delta)} saved points are growing ${GAMES[descriptor.gameId].tree}.`;
      if (transfer.status === 'complete') finishGrowthTransfer(activeGrowthTransfer);
      return true;
    } catch (error) {
      return failGrowthVisuals(error, descriptor);
    }
  }

  function skipGrowthTransfer(reason) {
    const allowedReasons = growthVisuals?.TRANSFER_SKIP_REASONS || ['retry', 'play', 'tree-selection'];
    if (!allowedReasons.includes(reason)) return false;
    let skipped = false;
    if (pendingGrowthTransfer) {
      pendingGrowthTransfer = null;
      skipped = true;
    }
    if (!activeGrowthTransfer) return skipped;
    const active = activeGrowthTransfer;
    try {
      if (active.state.status === 'running') {
        active.state = growthVisuals.reduceScoreTransfer(active.state, { type: 'skip', reason });
        updateGrowthTransferSurface(true);
      }
    } catch (error) {
      return failGrowthVisuals(error, active.descriptor);
    }
    closeGrowthTransferSurface(active, { announce: false, suppressFocus: true });
    return true;
  }

  function announceCarousel(message) {
    if (!ui.livingCarouselLive) return;
    ui.livingCarouselLive.textContent = '';
    window.setTimeout(() => {
      if (ui.livingCarouselLive) ui.livingCarouselLive.textContent = message;
    }, 20);
  }

  function setCarouselFallbackSurface(surface, carouselIsPrimary) {
    if (!surface) return;
    surface.hidden = carouselIsPrimary;
    surface.inert = carouselIsPrimary;
    surface.setAttribute('aria-hidden', String(carouselIsPrimary));
  }

  function deactivateLivingCarousel() {
    if (!ui.livingCarousel) return;
    ui.livingCarousel.hidden = true;
    ui.livingCarousel.inert = true;
    ui.livingCarousel.setAttribute('aria-hidden', 'true');
    ui.livingCarousel.dataset.carouselState = 'fallback';
    delete ui.groveScreen.dataset.carouselActive;
    [ui.legacyCatalogue, ui.sleepingGrove, ui.groveFooter]
      .forEach((surface) => setCarouselFallbackSurface(surface, false));
    carouselActive = false;
  }

  function activateLivingCarousel() {
    if (carouselActive || !ui.livingCarousel) return;
    ui.livingCarousel.hidden = false;
    ui.livingCarousel.inert = false;
    ui.livingCarousel.setAttribute('aria-hidden', 'false');
    ui.livingCarousel.dataset.carouselState = 'active';
    ui.groveScreen.dataset.carouselActive = 'true';
    [ui.legacyCatalogue, ui.sleepingGrove, ui.groveFooter]
      .forEach((surface) => setCarouselFallbackSurface(surface, true));
    carouselActive = true;
  }

  function renderLivingCarousel() {
    if (carouselFailed) return false;
    if (!carousel || !carouselDependencies || !ui.livingCarousel) {
      carouselFailed = true;
      deactivateLivingCarousel();
      return false;
    }

    try {
      if (!carouselState) carouselState = carousel.createInitialState();
      const carouselView = carousel.deriveView(
        carouselState,
        profile,
        carouselDependencies,
        { viewportWidth: window.innerWidth }
      );
      const entry = carouselView.selected;
      const positionLabel = String(entry.position).padStart(2, '0');
      const sleeping = !entry.implemented;
      const seedCount = FOUNDATIONAL_GAME_IDS.filter(
        (gameId) => profile.games[gameId].masterySeed
      ).length;
      const marks = combinedMarks();
      const rank = groveRankFor(marks);
      const gameTitle = sleeping ? `SLEEPING TREE ${positionLabel}` : entry.title;
      const species = sleeping ? 'NO GAME ANNOUNCED' : entry.tree;
      const stage = sleeping ? 'SLEEPING' : carouselView.stage;
      const accent = entry.color || '#8f91a8';
      const accentSoft = /^#[0-9a-f]{6}$/i.test(accent) ? `${accent}2e` : 'rgba(143, 145, 168, .18)';
      const target = carouselGateLabel(entry, carouselView, seedCount);
      const modeSuffix = entry.gameId === 'lumenloom'
        ? ` ${carouselView.modeName || 'Night Garden'}`
        : '';

      ui.livingCarousel.dataset.carouselPosition = String(entry.position);
      ui.livingCarousel.style.setProperty('--carousel-accent', accent);
      ui.livingCarousel.style.setProperty('--carousel-accent-soft', accentSoft);
      ui.livingCarouselNumber.textContent = entry.number || `TREE ${positionLabel}`;
      ui.livingCarouselGame.textContent = gameTitle;
      ui.livingCarouselSpecies.textContent = species;
      ui.livingCarouselRank.textContent = rank.name;
      ui.livingCarouselRank.setAttribute('aria-label', `Grove rank ${rank.name}`);
      ui.livingCarouselSeeds.textContent = `${seedCount} / 3 SEEDS`;
      ui.livingCarouselSeeds.setAttribute(
        'aria-label',
        `${seedCount} of three foundational Mastery Seeds earned`
      );
      ui.livingCarouselStage.dataset.growthStage = stage.toLowerCase().replace(/\s+/g, '-');
      ui.livingCarouselGrowthStage.textContent = stage;
      ui.livingCarouselTreeSymbol.textContent = entry.symbol || '•';
      ui.livingCarouselTreeVisual.setAttribute(
        'aria-label',
        sleeping
          ? `Sleeping Tree ${positionLabel}. No game has been announced.`
          : carouselView.unlocked
            ? `${entry.tree} at ${stage} growth.`
            : `${entry.tree} is sleeping. ${target}.`
      );
      renderSelectedGrowthModel(entry, carouselView.totalScore, carouselView.unlocked);
      ui.livingCarouselBest.textContent = formatNumber(carouselView.best.display);
      ui.livingCarouselBest.title = carouselView.best.assisted > carouselView.best.standard
        ? `Standard best ${formatNumber(carouselView.best.standard)}; assisted best ${formatNumber(carouselView.best.assisted)}`
        : `Standard-play best ${formatNumber(carouselView.best.standard)}`;
      ui.livingCarouselTarget.textContent = target;
      ui.livingCarouselTarget.title = carouselView.reward?.skillLabel || target;

      const modeAvailable = lumenloomModes.MODE_IDS.filter(
        (modeId) => progression.isLumenloomModeAvailable(profile, modeId)
      );
      const showModes = entry.gameId === 'lumenloom' && modeAvailable.length > 1;
      ui.livingCarouselModes.hidden = !showModes;
      ui.livingCarouselModes.inert = !showModes;
      ui.livingCarouselModes.setAttribute('aria-hidden', String(!showModes));
      ui.livingCarouselModeButtons.forEach((button) => {
        const modeId = button.dataset.carouselMode;
        const mode = lumenloomModes.MODES[modeId];
        const available = progression.isLumenloomModeAvailable(profile, modeId);
        const selected = showModes && modeId === carouselView.modeId;
        const unlockLabel = carouselModeUnlockLabel(modeId);
        button.classList.toggle('is-selected', selected);
        button.classList.toggle('is-locked', !available);
        button.setAttribute('aria-checked', String(selected));
        button.setAttribute('aria-disabled', String(!available));
        button.setAttribute(
          'aria-label',
          available
            ? `${mode.name}, ${mode.bloom} mode${selected ? ', selected' : ''}`
            : `${mode.name}, locked until ${unlockLabel}`
        );
        button.tabIndex = selected ? 0 : -1;
      });

      const playLabel = carouselView.playable
        ? entry.gameId === 'lumenloom'
          ? `PLAY ${(carouselView.modeName || entry.title).toUpperCase()}`
          : `PLAY ${entry.title}`
        : sleeping ? 'SLEEPING' : 'LOCKED';
      ui.livingCarouselPlayButton.querySelector('span').textContent = playLabel;
      ui.livingCarouselPlayButton.setAttribute('aria-disabled', String(!carouselView.playable));
      ui.livingCarouselPlayButton.setAttribute(
        'aria-label',
        carouselView.playable
          ? `Play${modeSuffix} in ${entry.title}`
          : sleeping
            ? `Sleeping Tree ${positionLabel}. No game has been announced.`
            : `${entry.title} locked. ${target}.`
      );

      const trialAvailable = carouselView.trialAvailable;
      ui.livingCarouselTrialButton.hidden = !trialAvailable;
      ui.livingCarouselTrialButton.inert = !trialAvailable;
      ui.livingCarouselTrialButton.setAttribute('aria-hidden', String(!trialAvailable));
      ui.livingCarouselTrialButton.setAttribute('aria-disabled', String(!trialAvailable));
      ui.livingCarouselTrialStatus.textContent = profile.trialsCompleted > 0
        ? `BEST ${formatNumber(profile.trialBest)}`
        : 'READY';
      ui.livingCarouselTrialButton.setAttribute(
        'aria-label',
        trialAvailable
          ? profile.trialsCompleted > 0
            ? `Begin Threefold Trial. Best score ${formatNumber(profile.trialBest)}.`
            : 'Begin Threefold Trial.'
          : 'Threefold Trial locked. Complete Lumenloom, Bloomfold, and Ripplewake.'
      );
      ui.livingCarouselHarmony.parentElement?.classList.toggle('is-trial-hidden', !trialAvailable);

      const visitCount = FOUNDATIONAL_GAME_IDS.filter((gameId) => visitState.played.has(gameId)).length;
      ui.livingCarouselHarmonyPips.textContent = FOUNDATIONAL_GAME_IDS
        .map((gameId) => visitState.played.has(gameId) ? '●' : '○')
        .join(' ');
      ui.livingCarouselHarmony.setAttribute(
        'aria-label',
        `Visit Harmony, ${visitCount} of three foundational trees played`
      );

      ui.livingCarouselRail.dataset.carouselPage = String(carouselState.rail.page);
      carouselView.rail.forEach((item, index) => {
        const option = ui.livingCarouselTreeOptions[index];
        const candidate = carousel.REGISTRY[index];
        if (!option || !candidate) return;
        option.hidden = !item.visible;
        option.inert = !item.visible;
        option.setAttribute('aria-hidden', String(!item.visible));
        option.setAttribute('aria-selected', String(item.selected));
        option.setAttribute('aria-posinset', String(item.position));
        option.setAttribute('aria-setsize', String(carousel.POSITION_COUNT));
        option.tabIndex = item.visible && item.roving ? 0 : -1;
        option.classList.toggle('is-selected', item.selected);
        option.classList.toggle('is-locked', item.implemented && !item.unlocked);
        option.classList.toggle('is-sleeping', !item.implemented);
        option.removeAttribute('aria-disabled');
        const candidateView = item.implemented
          ? carousel.deriveView(
            carousel.selectPosition(carouselState, item.position),
            profile,
            carouselDependencies,
            { viewportWidth: window.innerWidth }
          )
          : null;
        const candidateGate = candidateView
          ? carouselGateLabel(candidate, candidateView, seedCount)
          : 'NOT YET ANNOUNCED';
        option.setAttribute(
          'aria-label',
          !item.implemented
            ? `Sleeping Tree ${String(item.position).padStart(2, '0')}. No game announced.`
            : item.unlocked
              ? `${candidate.accessibleLabel}. ${candidateView.stage} growth.`
              : `${candidate.accessibleLabel}. Locked. ${candidateGate}.`
        );
      });

      const paged = carouselView.viewport.pageCount > 1;
      ui.livingCarouselPageDots.hidden = !paged;
      ui.livingCarouselPageDots.inert = !paged;
      ui.livingCarouselPageDots.setAttribute('aria-hidden', String(!paged));
      ui.livingCarouselPageButtons.forEach((button) => {
        const page = Number(button.dataset.carouselPageButton);
        button.setAttribute('aria-pressed', String(page === carouselView.viewport.page));
        button.tabIndex = paged ? 0 : -1;
      });

      rendererState.growthPulseColor = accent;
      activateLivingCarousel();
      return true;
    } catch (error) {
      carouselFailed = true;
      deactivateLivingCarousel();
      console.error('Living Carousel stayed on its safe catalogue fallback.', error);
      return false;
    }
  }

  function currentCarouselView() {
    if (!carouselState || !carousel || !carouselDependencies) return null;
    try {
      return carousel.deriveView(
        carouselState,
        profile,
        carouselDependencies,
        { viewportWidth: window.innerWidth }
      );
    } catch (_) {
      return null;
    }
  }

  function carouselSelectionAnnouncement(carouselView) {
    if (!carouselView) return 'The selected tree could not be inspected.';
    const entry = carouselView.selected;
    if (!entry.implemented) {
      return `Sleeping Tree ${String(entry.position).padStart(2, '0')}. No game has been announced.`;
    }
    if (!carouselView.unlocked) {
      const seedCount = FOUNDATIONAL_GAME_IDS.filter(
        (gameId) => profile.games[gameId].masterySeed
      ).length;
      return `${entry.title} is locked. ${carouselGateLabel(entry, carouselView, seedCount)}.`;
    }
    const mode = entry.gameId === 'lumenloom' && carouselView.modeName
      ? ` ${carouselView.modeName} selected.`
      : '';
    return `${entry.title}. ${carouselView.stage} growth. Best ${formatNumber(carouselView.best.display)}.${mode}`;
  }

  function focusCarouselTree(position) {
    const option = ui.livingCarouselTreeOptions[position - 1];
    if (option && !option.hidden) option.focus({ preventScroll: true });
  }

  function selectCarouselPosition(position, options = {}) {
    if (!carouselState || !carousel) return false;
    const previousPosition = carouselState.selectedPosition;
    const nextState = carousel.selectPosition(carouselState, position);
    if (nextState.selectedPosition !== previousPosition) skipGrowthTransfer('tree-selection');
    carouselState = nextState;
    if (!renderLivingCarousel()) return false;
    const selected = currentCarouselView();
    if (options.announce !== false) announceCarousel(carouselSelectionAnnouncement(selected));
    if (previousPosition !== carouselState.selectedPosition && selected?.selected.gameId) {
      playTreeVoice(selected.selected.gameId, 'select');
    }
    if (options.focus) focusCarouselTree(carouselState.rail.rovingPosition);
    return previousPosition !== carouselState.selectedPosition;
  }

  function moveCarouselFromRoving(direction, options = {}) {
    if (!carouselState || !carousel || !Number.isFinite(direction) || direction === 0) return;
    const nextPosition = Math.min(
      carousel.POSITION_COUNT,
      Math.max(1, carouselState.rail.rovingPosition + (direction < 0 ? -1 : 1))
    );
    selectCarouselPosition(nextPosition, {
      announce: options.announce !== false,
      focus: options.focus !== false
    });
  }

  function showCarouselPage(page, options = {}) {
    if (!carouselState || !carousel) return;
    const nextState = carousel.setPage(carouselState, page);
    if (nextState.rail.page !== carouselState.rail.page) skipGrowthTransfer('tree-selection');
    carouselState = nextState;
    if (!renderLivingCarousel()) return;
    if (options.announce !== false) {
      const first = carouselState.rail.page * carousel.MOBILE_PAGE_SIZE + 1;
      announceCarousel(`Showing Trees ${String(first).padStart(2, '0')} through ${String(first + 4).padStart(2, '0')}.`);
    }
    if (options.focus !== false) focusCarouselTree(carouselState.rail.rovingPosition);
  }

  function chooseCarouselMode(modeId, options = {}) {
    if (!carouselState || !carousel || !lumenloomModes?.MODE_IDS.includes(modeId)) return false;
    if (!progression.isLumenloomModeAvailable(profile, modeId)) {
      const mode = lumenloomModes.MODES[modeId];
      announceCarousel(`${mode.name} is locked until ${carouselModeUnlockLabel(modeId)}.`);
      showToast(`${mode.name} awakens at ${carouselModeUnlockLabel(modeId)}.`);
      return false;
    }
    carouselState = carousel.selectMode(carouselState, 'lumenloom', modeId, lumenloomModes);
    if (!renderLivingCarousel()) return false;
    if (options.announce !== false) {
      announceCarousel(`${lumenloomModes.MODES[modeId].name} selected.`);
    }
    if (options.focus) {
      ui.livingCarouselModeButtons
        .find((button) => button.dataset.carouselMode === modeId)
        ?.focus({ preventScroll: true });
    }
    return true;
  }

  function moveCarouselMode(modeId, direction) {
    const available = lumenloomModes.MODE_IDS.filter(
      (candidate) => progression.isLumenloomModeAvailable(profile, candidate)
    );
    if (!available.length) return;
    const currentIndex = Math.max(0, available.indexOf(modeId));
    const nextIndex = (currentIndex + (direction < 0 ? -1 : 1) + available.length) % available.length;
    chooseCarouselMode(available[nextIndex], { focus: true });
  }

  function launchCarouselSelection() {
    if (!carouselState || !carousel || !carouselDependencies) return;
    const intent = carousel.launchIntent(carouselState, profile, carouselDependencies);
    if (!intent) {
      const carouselView = currentCarouselView();
      announceCarousel(carouselSelectionAnnouncement(carouselView));
      showToast(carouselView?.implemented
        ? 'That tree is still sleeping. Inspect its Target to see the gate.'
        : 'That sleeping tree has not been announced yet.');
      return;
    }
    trialSession = null;
    openGame(intent.gameId, { modeId: intent.modeId });
  }

  function beginCarouselPointer(event) {
    if (!carouselActive || carouselPointer || event.isPrimary === false) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    carouselPointer = {
      id: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      endX: event.clientX,
      endY: event.clientY,
      cancelled: false,
      captureTarget: event.currentTarget
    };
    try { event.currentTarget.setPointerCapture(event.pointerId); }
    catch (_) { /* Pointer capture is an enhancement, not an input requirement. */ }
  }

  function moveCarouselPointer(event) {
    if (!carouselPointer || event.pointerId !== carouselPointer.id) return;
    carouselPointer.endX = event.clientX;
    carouselPointer.endY = event.clientY;
    const horizontal = Math.abs(carouselPointer.endX - carouselPointer.startX);
    const vertical = Math.abs(carouselPointer.endY - carouselPointer.startY);
    if (vertical >= carousel.SWIPE_THRESHOLD_PX && vertical > horizontal) {
      carouselPointer.cancelled = true;
    }
  }

  function endCarouselPointer(event) {
    if (!carouselPointer || event.pointerId !== carouselPointer.id) return;
    const gesture = carouselPointer;
    carouselPointer = null;
    try {
      if (gesture.captureTarget.hasPointerCapture(event.pointerId)) {
        gesture.captureTarget.releasePointerCapture(event.pointerId);
      }
    } catch (_) { /* Capture may already have ended. */ }
    if (event.type === 'pointercancel' || gesture.cancelled) return;
    gesture.endX = event.clientX;
    gesture.endY = event.clientY;
    const direction = carousel.interpretSwipe(gesture);
    if (!direction) return;
    carouselSuppressClickUntil = Date.now() + 450;
    event.preventDefault();
    const nextState = carousel.moveSelection(carouselState, direction);
    if (nextState === carouselState) return;
    selectCarouselPosition(nextState.selectedPosition);
  }

  function installLivingCarouselControls() {
    if (!ui.livingCarousel || !carousel || !carouselDependencies) return;

    ui.livingCarousel.addEventListener('click', (event) => {
      if (Date.now() >= carouselSuppressClickUntil) return;
      const suppressibleSwipeClick = event.target?.closest?.('.living-carousel-stage, .living-carousel-rail');
      if (!suppressibleSwipeClick) return;
      carouselSuppressClickUntil = 0;
      event.preventDefault();
      event.stopPropagation();
    }, true);

    ui.livingCarouselTreeOptions.forEach((option) => {
      option.addEventListener('click', () => {
        selectCarouselPosition(Number(option.dataset.carouselPosition));
      });
      option.addEventListener('keydown', (event) => {
        const left = ['ArrowLeft', 'a', 'A', 'GamepadLeftShoulder'].includes(event.key);
        const right = ['ArrowRight', 'd', 'D', 'GamepadRightShoulder'].includes(event.key);
        if (left || right) {
          event.preventDefault();
          event.stopPropagation();
          moveCarouselFromRoving(left ? -1 : 1);
        } else if (event.key === 'Home' || event.key === 'End') {
          event.preventDefault();
          event.stopPropagation();
          selectCarouselPosition(event.key === 'Home' ? 1 : carousel.POSITION_COUNT, { focus: true });
        }
      });
    });

    ui.livingCarouselPageButtons.forEach((button) => {
      button.addEventListener('click', () => {
        showCarouselPage(Number(button.dataset.carouselPageButton));
      });
      button.addEventListener('keydown', (event) => {
        if (!['ArrowLeft', 'ArrowRight', 'a', 'A', 'd', 'D'].includes(event.key)) return;
        event.preventDefault();
        const moveRight = ['ArrowRight', 'd', 'D'].includes(event.key);
        showCarouselPage(moveRight ? 1 : 0);
      });
    });

    ui.livingCarouselModeButtons.forEach((button) => {
      button.addEventListener('click', () => chooseCarouselMode(button.dataset.carouselMode));
      button.addEventListener('keydown', (event) => {
        const previous = ['ArrowLeft', 'ArrowUp', 'a', 'A'].includes(event.key);
        const next = ['ArrowRight', 'ArrowDown', 'd', 'D'].includes(event.key);
        if (!previous && !next) return;
        event.preventDefault();
        event.stopPropagation();
        moveCarouselMode(button.dataset.carouselMode, previous ? -1 : 1);
      });
    });

    ui.livingCarouselPlayButton.addEventListener('click', launchCarouselSelection);
    ui.livingCarouselTrialButton.addEventListener('click', startTrial);
    [ui.livingCarouselStage, ui.livingCarouselRail].forEach((surface) => {
      surface.addEventListener('pointerdown', beginCarouselPointer, { passive: true });
      surface.addEventListener('pointermove', moveCarouselPointer, { passive: true });
      surface.addEventListener('pointerup', endCarouselPointer);
      surface.addEventListener('pointercancel', endCarouselPointer);
    });
  }

  function pollLivingCarouselGamepads(now) {
    if (!carouselActive
      || activeGameId
      || document.hidden
      || document.body.classList.contains('modal-open')
      || typeof navigator.getGamepads !== 'function') {
      carouselGamepadState.clear();
      return;
    }
    const pads = navigator.getGamepads() || [];
    for (const pad of pads) {
      if (!pad) continue;
      const left = Boolean(pad.buttons?.[4]?.pressed || pad.buttons?.[14]?.pressed || pad.axes?.[0] < -.65);
      const right = Boolean(pad.buttons?.[5]?.pressed || pad.buttons?.[15]?.pressed || pad.axes?.[0] > .65);
      const previous = carouselGamepadState.get(pad.index) || { left: false, right: false };
      const direction = left && !previous.left ? -1 : right && !previous.right ? 1 : 0;
      carouselGamepadState.set(pad.index, { left, right });
      if (!direction || now - carouselLastGamepadMoveAt < 180) continue;
      carouselLastGamepadMoveAt = now;
      moveCarouselFromRoving(direction, { focus: false });
      break;
    }
  }

  function updateProfileUI() {
    const marks = combinedMarks();
    const rank = groveRankFor(marks);
    for (const gameId of GAME_IDS) renderGameStats(gameId);
    ui.headerRank.textContent = rank.name;
    ui.headerBloomCount.textContent = `${marks} / ${MAX_BLOOM_MARKS} BLOOM MARKS`;
    ui.groveRank.textContent = rank.name;
    ui.groveMessage.textContent = profile.regions.secondGroveUnlocked
      ? 'The Crownheart is awake. The Choir Linden now listens in the Second Grove.'
      : profile.unlocks.prismbind
        ? 'Three Mastery Seeds answer as one. The Crownheart Guardian is ready.'
        : rank.message;

    const seedCount = FOUNDATIONAL_GAME_IDS.filter((gameId) => profile.games[gameId].masterySeed).length;
    for (const gameId of FOUNDATIONAL_GAME_IDS) {
      const socket = ui[`${gameId}Seed`];
      const earned = profile.games[gameId].masterySeed;
      socket.classList.toggle('is-earned', earned);
      socket.setAttribute('aria-label', `${GAMES[gameId].title} Mastery Seed ${earned ? 'earned' : 'not yet earned'}`);
    }

    const prismUnlocked = progression.isGameUnlocked(profile, 'prismbind');
    ui.prismbindCard.classList.toggle('is-locked', !prismUnlocked);
    ui.prismbindCard.setAttribute('aria-disabled', String(!prismUnlocked));
    ui.prismbindButton.disabled = !prismUnlocked;
    const seedsRemaining = 3 - seedCount;
    ui.prismbindButtonLabel.textContent = prismUnlocked
      ? 'FACE THE GUARDIAN'
      : `EARN ${seedsRemaining} MORE MASTERY ${seedsRemaining === 1 ? 'SEED' : 'SEEDS'}`;
    ui.prismbindRequirement.textContent = prismUnlocked
      ? profile.regions.secondGroveUnlocked
        ? 'CROWNHEART AWAKENED · NEXT CLEARING REVEALED'
        : 'GUARDIAN AWAKE · THREE DISCIPLINES, ONE RUN'
      : `${seedCount} / 3 MASTERY SEEDS · PEAK SKILL, NOT TREE TOTAL`;

    const mothUnlocked = progression.isGameUnlocked(profile, 'mothchorus');
    const mothSeedEarned = Boolean(profile.games.mothchorus.masterySeed);
    ui.mothchorusCard.classList.toggle('is-locked', !mothUnlocked);
    ui.mothchorusCard.setAttribute('aria-disabled', String(!mothUnlocked));
    ui.mothchorusButton.disabled = !mothUnlocked;
    ui.mothchorusButtonLabel.textContent = mothUnlocked ? 'PLAY MOTHCHORUS' : 'DEFEAT PRISMBIND';
    ui.mothchorusGate.classList.toggle('is-open', mothUnlocked);
    ui.mothchorusGateCopy.textContent = mothUnlocked
      ? 'CROWNHEART AWAKENED · CHOIR PATH OPEN'
      : 'DEFEAT PRISMBIND TO AWAKEN';
    ui.mothchorusSeedStatus.classList.toggle('is-earned', mothSeedEarned);
    ui.mothchorusSeedState.textContent = mothSeedEarned
      ? 'CHOIR SEED EARNED · PERMANENT'
      : 'LISTENING FOR 6,500 + 18 VOICES';
    ui.mothchorusRequirement.textContent = mothUnlocked
      ? mothSeedEarned
        ? 'CHOIR SEED EARNED · SOLO AND TOGETHER BOTH FEED THIS TREE'
        : 'CHOIR SEED: 6,500 SCORE · 18 / 24 VOICES HOME · SOLO OR TOGETHER'
      : 'LOCKED · DEFEAT PRISMBIND AND AWAKEN THE CROWNHEART';

    ui.regionStatus.classList.toggle('is-revealed', profile.regions.trees05To07Revealed);
    ui.regionStatusTitle.textContent = profile.regions.trees05To07Revealed
      ? 'THE CHOIR LINDEN IS LISTENING'
      : 'SLEEPING BEYOND THE CROWNHEART';
    ui.regionStatusCopy.textContent = profile.regions.trees05To07Revealed
      ? 'Tree 05 is awake. Trees 06–07 remain visible as future disciplines in the Second Grove.'
      : 'Defeat Prismbind to awaken Tree 05 and reveal the next clearing.';

    const trialReady = FOUNDATIONAL_GAME_IDS.every((gameId) => profile.games[gameId].completed);
    ui.trialButton.disabled = !trialReady;
    ui.trialLabel.textContent = trialReady
      ? profile.trialsCompleted > 0
        ? `BEST ${formatNumber(profile.trialBest)} · BEGIN AGAIN`
        : 'PLAY ALL THREE TREES BACK TO BACK'
      : 'COMPLETE ALL THREE TREES TO AWAKEN';
    updateVisitUI();
    updateStorageWarning();
    renderLivingCarousel();
  }

  function renderGameStats(gameId) {
    const record = profile.games[gameId];
    const growth = growthFor(gameId);
    const mastery = ui[`${gameId}Mastery`];
    const total = ui[`${gameId}Total`];
    const best = ui[`${gameId}Best`];
    const progressBar = ui[`${gameId}Progress`];
    const visibleBest = Math.max(record.standardBest, record.assistedBest);
    mastery.textContent = progression.isGameUnlocked(profile, gameId) ? growth.name : 'SLEEPING';
    total.textContent = formatNumber(record.totalScore);
    best.textContent = formatNumber(visibleBest);
    best.title = record.assistedBest > record.standardBest
      ? `Standard best ${formatNumber(record.standardBest)}; assisted best ${formatNumber(record.assistedBest)}`
      : `Standard-play best ${formatNumber(record.standardBest)}`;
    progressBar.style.width = `${growth.progress}%`;
    const nextReward = progression.nextRewardFor(profile, gameId);
    const track = progressBar.parentElement;
    track.setAttribute('aria-valuenow', String(Math.round(growth.progress)));
    track.setAttribute('aria-valuetext', !progression.isGameUnlocked(profile, gameId) && nextReward
      ? `${nextReward.growthLabel}. ${nextReward.skillLabel}.`
      : growth.nextThreshold === null
        ? `${growth.name}, maximum growth`
        : `${growth.name}, ${formatNumber(growth.pointsToNext)} points to ${GROWTH_STAGES[growth.level + 1]}`);
    const nextGrowth = ui[`${gameId}NextGrowth`];
    const nextSkill = ui[`${gameId}NextSkill`];
    if (nextReward && nextGrowth && nextSkill) {
      nextGrowth.textContent = nextReward.growthLabel;
      nextSkill.textContent = nextReward.skillLabel;
      const rewardGroup = nextGrowth.closest('.next-reward');
      rewardGroup?.setAttribute('aria-label', `${GAMES[gameId].title} next growth: ${nextReward.growthLabel}. Next skill reward: ${nextReward.skillLabel}.`);
    }
  }

  function buildSaplings() {
    const symbols = ['◌', '⌇', '△', '≈', '◈', '∿', '○', '✧'];
    const firstSleepingTree = Math.max(6, GAME_IDS.length + 1);
    const sleepingCount = Math.max(0, COLLECTION_SIZE - firstSleepingTree + 1);
    const numberWords = ['Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten'];
    ui.sleepingCount.textContent = numberWords[sleepingCount] || String(sleepingCount);
    ui.saplingRow.replaceChildren();
    for (let index = 0; index < sleepingCount; index += 1) {
      const treeNumber = firstSleepingTree + index;
      const revealed = profile.regions.trees05To07Revealed && treeNumber <= 7;
      const sapling = document.createElement('div');
      sapling.className = `sapling${revealed ? ' is-revealed' : ''}`;
      sapling.setAttribute('aria-label', `${revealed ? 'Revealed' : 'Sleeping'} sapling ${treeNumber}`);
      sapling.innerHTML = `<small>${String(treeNumber).padStart(2, '0')}</small><span aria-hidden="true">${symbols[index % symbols.length]}</span>`;
      ui.saplingRow.appendChild(sapling);
    }
  }

  function createSessionId() {
    try {
      const values = new Uint32Array(3);
      crypto.getRandomValues(values);
      return `grove-${[...values].map((value) => value.toString(36)).join('-')}`;
    } catch (_) {
      return `grove-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
    }
  }

  function resetLoadingState() {
    ui.frameLoading.classList.remove('is-loaded');
    ui.frameLoadingTitle.textContent = 'ENTERING THE TREE';
    ui.frameLoadingCopy.textContent = 'Waiting for the game to answer…';
    ui.frameLoadingActions.classList.add('is-hidden');
  }

  function setRunChromeActive(active) {
    ui.gameShell.classList.toggle('is-run-active', Boolean(active));
    ui.gameShell.dataset.runState = active ? 'running' : 'idle';
  }

  function activeSessionStatus() {
    return activeLumenloomState?.session.status || activeSession?.status || null;
  }

  function focusGamePlayControl(gameId = 'lumenloom') {
    if (carouselActive && carouselState && carousel && GAMES[gameId]) {
      carouselState = carousel.selectGame(carouselState, gameId);
      renderLivingCarousel();
      ui.livingCarouselPlayButton.focus({ preventScroll: true });
      return;
    }
    document.querySelector(`[data-play="${gameId}"]`)?.focus({ preventScroll: true });
  }

  function lumenloomPlatformProfile() {
    const forcedProfile = new URLSearchParams(location.search).get('profile');
    if (forcedProfile === 'mobile' || forcedProfile === 'desktop') return forcedProfile;
    return isLikelyMobileRenderer() ? 'mobile' : 'desktop';
  }

  function isLikelyMobileRenderer() {
    const coarsePointer = Boolean(window.matchMedia?.('(pointer: coarse)')?.matches);
    const noHover = Boolean(window.matchMedia?.('(hover: none)')?.matches);
    const touchDevice = Number(navigator.maxTouchPoints || 0) > 0;
    const viewportLooksHandheld = Math.min(window.innerWidth, window.innerHeight) <= 600
      && Math.max(window.innerWidth, window.innerHeight) <= 1000;
    return coarsePointer || noHover || touchDevice || viewportLooksHandheld;
  }

  function openGame(gameId, options = {}) {
    if (pendingSave) {
      showToast('Finish Retry Save before beginning another run.');
      ui.pendingRetryButton.focus({ preventScroll: true });
      return;
    }
    if (launchGuard) return;
    launchGuard = true;
    window.setTimeout(() => { launchGuard = false; }, 240);
    const game = GAMES[gameId];
    if (!game || !progression.isGameUnlocked(profile, gameId)) {
      showToast('That tree is still sleeping. Earn its required Mastery Seeds first.');
      return;
    }
    clearTimeout(readyTimer);
    activeGameId = gameId;
    activeSessionId = createSessionId();
    const requestedModeId = gameId === 'lumenloom'
      ? trialSession?.active
        ? 'standard'
        : options.modeId || 'standard'
      : null;
    const created = gameId === 'lumenloom'
      ? lumenloomSession.create({
        profile,
        modeId: requestedModeId,
        sessionId: activeSessionId,
        trial: Boolean(trialSession?.active)
      })
      : progression.createSession(gameId, activeSessionId, profile);
    if (!created.ok) {
      showToast(created.code === 'locked-mode'
        ? 'That Lumenloom mode is still sleeping.'
        : 'The tree could not create a safe play session. Please try again.');
      activeGameId = null;
      activeSessionId = null;
      return;
    }
    skipGrowthTransfer(options.growthSkipReason || 'play');
    activeSession = gameId === 'lumenloom' ? null : created.session;
    activeLumenloomState = gameId === 'lumenloom' ? created.state : null;
    activeLumenloomModeId = gameId === 'lumenloom' ? requestedModeId : null;
    ui.groveScreen.classList.add('is-hidden');
    ui.gameShell.classList.remove('is-hidden');
    ui.gameShell.setAttribute('aria-hidden', 'false');
    setRunChromeActive(false);
    resetLoadingState();
    ui.activeTreeLabel.textContent = game.number;
    ui.activeGameTitle.textContent = game.title;
    ui.returnButton.innerHTML = '<span aria-hidden="true">←</span> RETURN TO GROVE';
    ui.nextGameButton.classList.add('is-hidden');
    if (trialSession?.active) {
      ui.trialProgress.classList.remove('is-hidden');
      ui.trialProgress.textContent = `GROVE TRIAL · ${trialSession.index + 1} / ${trialSession.order.length}`;
    } else {
      ui.trialProgress.classList.add('is-hidden');
    }
    ui.gameFrame.title = `${game.title} inside the Mastery Grove`;
    const gameParams = new URLSearchParams({
      grove: '1',
      trial: trialSession?.active ? '1' : '0',
      session: activeSessionId
    });
    if (gameId === 'lumenloom') {
      gameParams.set('protocol', '2');
      gameParams.set('mode', requestedModeId);
      gameParams.set('profile', lumenloomPlatformProfile());
    }
    ui.gameFrame.src = `${game.path}?${gameParams}`;
    syncModalState();
    const expectedSession = activeSessionId;
    readyTimer = window.setTimeout(() => {
      const status = activeLumenloomState?.session.status || activeSession?.status;
      if (activeSessionId !== expectedSession || status !== 'awaiting-ready') return;
      ui.frameLoadingTitle.textContent = 'THE TREE DID NOT ANSWER';
      ui.frameLoadingCopy.textContent = 'The game may have been moved or blocked. Retry it, or return without losing prior progress.';
      ui.frameLoadingActions.classList.remove('is-hidden');
      announce('The game did not finish loading. Retry and Return to Grove controls are available.');
      ui.retryGameButton.focus();
    }, 12000);
    if (gameId !== 'lumenloom') {
      window.setTimeout(() => ui.returnButton.focus({ preventScroll: true }), 80);
    }
  }

  function requestCloseGame() {
    if (pendingSave) {
      showToast('This result has not been saved. Use Retry Save before leaving the tree.');
      ui.pendingRetryButton.focus({ preventScroll: true });
      return;
    }
    if (activeSessionStatus() === 'running') {
      setOverlay(ui.returnConfirmOverlay, true);
      window.setTimeout(() => ui.stayInGameButton.focus(), 80);
      return;
    }
    closeGame({ cancelTrial: Boolean(trialSession?.active) });
  }

  function closeGame(options = {}) {
    if (pendingSave) {
      showToast('A save is still pending. Retry it before leaving this screen.');
      return;
    }
    const returningGame = activeGameId;
    clearTimeout(readyTimer);
    readyTimer = 0;
    ui.gameFrame.src = 'about:blank';
    ui.gameShell.classList.add('is-hidden');
    ui.gameShell.setAttribute('aria-hidden', 'true');
    setRunChromeActive(false);
    ui.groveScreen.classList.remove('is-hidden');
    ui.nextGameButton.classList.add('is-hidden');
    ui.trialProgress.classList.add('is-hidden');
    activeGameId = null;
    activeSession = null;
    activeLumenloomState = null;
    activeLumenloomModeId = null;
    activeSessionId = null;
    restartRenderer(true);

    if (returningGame && carousel && carouselState) {
      carouselState = carousel.selectGame(carouselState, returningGame);
    }

    if (options.cancelTrial && trialSession?.active) {
      trialSession = null;
      showToast('The Grove Trial was set aside. Completed tree scores remain safe.');
    }

    updateProfileUI();
    buildSaplings();
    syncModalState();
    window.scrollTo(0, 0);
    const transferStarted = activatePendingGrowthTransfer(returningGame);
    if (transferStarted) {
      if (!options.suppressFocus) {
        window.setTimeout(() => ui.livingCarouselTransferRetry?.focus({ preventScroll: true }), 100);
      }
    } else if (!options.suppressCeremonies && ceremonyQueue.length) {
      window.setTimeout(showNextCeremony, 120);
    } else if (!options.suppressFocus) {
      presentPendingVisitHarmony();
      window.setTimeout(() => focusGamePlayControl(returningGame || 'lumenloom'), 100);
    }
  }

  function isTrustedGameMessageEvent(event) {
    if (!activeGameId || event.source !== ui.gameFrame.contentWindow) return false;
    if (location.protocol === 'file:') {
      return !event.origin || event.origin === 'null';
    }
    return event.origin === location.origin;
  }

  function validateMessage(event) {
    if (!activeSession || event.source !== ui.gameFrame.contentWindow) return null;
    if (location.protocol === 'file:') {
      if (event.origin && event.origin !== 'null') return null;
    } else if (event.origin !== location.origin) return null;
    if (pendingSave && event.data?.type === 'run-start') return null;
    if (trialSession?.active && activeSession.status === 'completed' && event.data?.type === 'run-start') return null;
    const transitioned = progression.transitionSession(activeSession, event.data);
    return transitioned.ok ? transitioned : null;
  }

  function postV2Response(response) {
    if (!response || !activeLumenloomState || activeGameId !== 'lumenloom') return false;
    const targetOrigin = location.protocol === 'file:' ? '*' : location.origin;
    ui.gameFrame.contentWindow?.postMessage(response, targetOrigin);
    return true;
  }

  function presentV2RecordedResult(transaction, presentation) {
    if (!transaction || !presentation || presentation.gameId !== 'lumenloom') return;
    const previousTotal = transaction.beforeProfile.games.lumenloom.totalScore;
    const context = Object.freeze({
      result: presentation.result,
      gameId: 'lumenloom',
      game: GAMES.lumenloom,
      feedback: presentation.feedback,
      previousTotal,
      oldGrowth: growthFor('lumenloom', previousTotal),
      applied: Object.freeze({ rewards: presentation.rewards || Object.freeze([]) })
    });
    // The saved response is queued first. Grove spectacle begins on the next
    // task so neither the parent nor child can present an unacknowledged score.
    window.setTimeout(() => finishRecordedResult(context), 0);
  }

  function settleActiveV2Pending(pendingKey, disposition, options = {}) {
    if (!activeLumenloomState?.pending || activeLumenloomState.pending.key !== pendingKey) return null;
    const transaction = activeLumenloomState.pending;
    const settled = lumenloomSession.settlePending(activeLumenloomState, pendingKey, disposition);
    if (settled.state && lumenloomSession.isState(settled.state)) activeLumenloomState = settled.state;
    if (settled.response) postV2Response(settled.response);

    if (!settled.ok) return settled;
    if (settled.code === 'run-started') {
      prepareForRun();
      if (settled.effect === 'start-unsaved') {
        showToast('This run is playing without saving. Its result will be marked Unsaved.');
      }
    } else if (settled.code === 'result-saved') {
      setRunChromeActive(false);
      presentV2RecordedResult(transaction, settled.presentation);
    } else if (settled.code === 'result-unsaved') {
      setRunChromeActive(false);
      showToast('This result was left unsaved. Previously recorded Grove progress did not change.');
    }

    if (settled.effect === 'return' || options.closeAfter) {
      window.setTimeout(() => closeGame({
        cancelTrial: Boolean(options.cancelTrial),
        suppressCeremonies: Boolean(options.suppressCeremonies)
      }), 0);
    }
    return settled;
  }

  function commitV2Transaction(transaction) {
    if (!transaction || !activeLumenloomState?.pending
      || transaction.key !== activeLumenloomState.pending.key) return;
    const isStart = transaction.kind === 'start';
    const label = isStart
      ? `${GAMES.lumenloom.title} ${activeLumenloomModeId} start`
      : `${GAMES.lumenloom.title} ${activeLumenloomModeId} result`;
    const recoveryOptions = Object.freeze({
      sessionProfile: transaction.beforeProfile,
      allowSessionEscape: isStart && !trialSession?.active,
      sessionEscapeLabel: 'PLAY WITHOUT SAVING',
      onSessionEscape: () => settleActiveV2Pending(transaction.key, 'unsaved'),
      allowReturn: isStart || transaction.kind === 'result',
      returnLabel: isStart ? 'RETURN TO GROVE' : 'RETURN WITHOUT SAVING',
      onReturn: () => settleActiveV2Pending(
        transaction.key,
        isStart ? 'discarded' : 'unsaved',
        {
          closeAfter: true,
          cancelTrial: Boolean(trialSession?.active),
          suppressCeremonies: true
        }
      ),
      pendingCopy: isStart
        ? 'The mode has not started and its play was not recorded. Retry the exact save, return safely, or explicitly play this run without saving.'
        : 'The score is paused before presentation. Retry this exact result, or return without saving it.',
      resume: () => settleActiveV2Pending(transaction.key, 'saved'),
      allowNoRetryChoice: true
    });
    const committed = commitProfile(transaction.proposedProfile, {
      label,
      ...recoveryOptions
    });
    if (!committed.ok) {
      const failed = settleActiveV2Pending(transaction.key, 'failed');
      if (!committed.retryPayload) {
        rememberPendingSave(committed, null, label, {
          ...recoveryOptions,
          allowNoRetry: true,
          pendingCopy: isStart
            ? 'Local saving is unavailable. Explicitly play this run without saving, or return to the Grove with earlier progress untouched.'
            : 'Local saving is unavailable. Return without saving this result; earlier Grove progress remains untouched.'
        });
      }
      return failed;
    }
    return settleActiveV2Pending(transaction.key, 'saved');
  }

  function handleV2Message(event) {
    if (!activeLumenloomState || activeGameId !== 'lumenloom' || !isTrustedGameMessageEvent(event)) return;
    const transitioned = lumenloomSession.receive(
      activeLumenloomState,
      event.data,
      { updatedAt: new Date().toISOString() }
    );
    if (transitioned.state && lumenloomSession.isState(transitioned.state)) {
      activeLumenloomState = transitioned.state;
    }
    if (transitioned.response) postV2Response(transitioned.response);
    if (!transitioned.ok) return;

    if (transitioned.code === 'ready') {
      clearTimeout(readyTimer);
      readyTimer = 0;
      ui.frameLoading.classList.add('is-loaded');
      announce(`${GAMES.lumenloom.title} ${activeLumenloomModeId} is ready.`);
      ui.gameFrame.focus({ preventScroll: true });
      return;
    }
    if (transitioned.code === 'run-started') {
      prepareForRun();
      return;
    }
    if (transitioned.code === 'start-commit-required'
      || transitioned.code === 'result-commit-required') {
      commitV2Transaction(transitioned.transaction);
      return;
    }
    if (transitioned.code === 'run-abandoned') {
      setRunChromeActive(false);
      ui.returnButton.innerHTML = '<span aria-hidden="true">←</span> RETURN TO GROVE';
      ui.nextGameButton.classList.add('is-hidden');
      showToast('Run abandoned. No score was recorded.');
      return;
    }
    if (transitioned.code === 'result-unsaved') {
      setRunChromeActive(false);
      showToast('Unsaved result shown. The Grove profile did not change.');
      return;
    }
    if (transitioned.code === 'action-accepted') {
      if (transitioned.effect === 'restart') {
        skipGrowthTransfer('retry');
        setRunChromeActive(false);
        ui.returnButton.innerHTML = '<span aria-hidden="true">←</span> RETURN TO GROVE';
      } else if (transitioned.effect === 'grove') {
        window.setTimeout(() => closeGame({
          cancelTrial: Boolean(trialSession?.active),
          suppressCeremonies: false
        }), 0);
      }
    }
  }

  function handleSessionTransition(transitioned) {
    activeSession = transitioned.session;
    if (transitioned.code === 'ready') {
      clearTimeout(readyTimer);
      readyTimer = 0;
      ui.frameLoading.classList.add('is-loaded');
      announce(`${GAMES[activeGameId].title} is ready.`);
      window.setTimeout(() => ui.gameFrame.focus({ preventScroll: true }), 80);
      return;
    }
    if (transitioned.code === 'run-started') {
      prepareForRun();
      return;
    }
    if (transitioned.code === 'run-abandoned') {
      setRunChromeActive(false);
      ui.returnButton.innerHTML = '<span aria-hidden="true">←</span> RETURN TO GROVE';
      ui.nextGameButton.classList.add('is-hidden');
      showToast('Run abandoned. No score was recorded.');
      return;
    }
    if (transitioned.code === 'run-completed') {
      setRunChromeActive(false);
      recordResult(transitioned.result);
    }
  }

  function prepareForRun() {
    skipGrowthTransfer('retry');
    setRunChromeActive(true);
    ui.returnButton.innerHTML = '<span aria-hidden="true">←</span> RETURN TO GROVE';
    ui.nextGameButton.classList.add('is-hidden');
    if (trialSession?.active) {
      ui.trialProgress.classList.remove('is-hidden');
      ui.trialProgress.textContent = `GROVE TRIAL · ${trialSession.index + 1} / ${trialSession.order.length}`;
    }
  }

  function enqueueCeremony(ceremony) {
    if (ceremony.ceremonyKey && (currentCeremony?.ceremonyKey === ceremony.ceremonyKey
      || ceremonyQueue.some((queued) => queued.ceremonyKey === ceremony.ceremonyKey))) return;
    ceremonyQueue.push(ceremony);
  }

  function enqueuePersistentRewards() {
    progression.pendingRewards(profile).forEach(enqueueCeremony);
  }

  function recordResult(result) {
    if (!result || result.gameId !== activeGameId) return;
    const gameId = result.gameId;
    const game = GAMES[gameId];
    const beforeRecord = profile.games[gameId];
    const feedback = progression.classifyRunFeedback(beforeRecord, result);
    const previousTotal = beforeRecord.totalScore;
    const oldGrowth = growthFor(gameId, beforeRecord.totalScore);
    const applied = progression.applyResult(profile, result);
    if (!applied.ok) {
      showToast('The run ended, but its score did not pass Grove validation. No progress changed.');
      return;
    }
    const proposed = proposeProfile(() => {}, { source: applied.profile });
    const context = Object.freeze({
      result,
      gameId,
      game,
      feedback,
      previousTotal,
      oldGrowth,
      applied
    });
    const committed = commitProfile(proposed, {
      label: `${game.title} result`,
      resume: () => finishRecordedResult(context)
    });
    if (!committed.ok) {
      showToast(committed.retryPayload
        ? 'Score is waiting for a verified save. Choose Retry Save; no growth has been shown yet.'
        : 'This run remains unsaved. The installed Grove profile did not change.');
      return;
    }
    finishRecordedResult(context);
  }

  function finishRecordedResult(context) {
    const {
      result,
      gameId,
      game,
      feedback,
      previousTotal,
      applied
    } = context;
    const nextReward = progression.nextRewardFor(profile, gameId);
    const growthStages = applied.rewards.filter((reward) => reward.type === 'growth-stage');
    const harmonyAwakened = recordVisitCompletion(gameId, feedback);
    const transferQueued = queueGrowthTransfer(context);
    const highestGrowthStage = growthStages.at(-1);
    if (highestGrowthStage) {
      enqueueCeremony({
        type: 'growth-stage',
        gameId,
        sourceGameId: gameId,
        level: highestGrowthStage.level,
        stage: highestGrowthStage.stage,
        added: result.score,
        totalScore: profile.games[gameId].totalScore,
        nextReward
      });
    }
    applied.rewards
      .filter((reward) => reward.type !== 'growth-stage')
      .forEach((reward) => enqueueCeremony({ ...reward, sourceGameId: gameId }));
    if (harmonyAwakened) pendingVisitHarmony = true;
    updateProfileUI();
    buildSaplings();

    ui.returnButton.innerHTML = result.score > 0
      ? '<span aria-hidden="true">←</span> RETURN WITH SCORE'
      : '<span aria-hidden="true">←</span> RETURN TO GROVE';
    const resultToast = feedback?.isPersonalBest
      ? `${formatNumber(result.score)} took root — a new ${feedback.lane} personal best.`
      : feedback?.matchedBest
        ? `${formatNumber(result.score)} took root and matched your ${feedback.lane} best.`
        : feedback?.nearBest
          ? `${formatNumber(result.score)} took root — only ${formatNumber(feedback.gap)} from your ${feedback.lane} best.`
          : result.score > 0
            ? `${formatNumber(result.score)} added to ${game.tree}.`
            : `The run completed. No points took root in ${game.tree} this time.`;
    if (!transferQueued) showToast(resultToast);

    if (trialSession?.active) {
      trialSession.scores[gameId] = result.score;
      ui.trialProgress.classList.add('is-hidden');
      if (trialSession.index < trialSession.order.length - 1) {
        const nextId = trialSession.order[trialSession.index + 1];
        ui.nextGameButton.textContent = `CONTINUE TO ${GAMES[nextId].title} →`;
      } else {
        ui.nextGameButton.textContent = 'COMPLETE GROVE TRIAL →';
      }
      ui.nextGameButton.classList.remove('is-hidden');
      announce(`${GAMES[gameId].title} Trial run complete. Continue Trial is ready.`);
      window.setTimeout(() => ui.nextGameButton.focus({ preventScroll: true }), 80);
    }
  }

  function configureCeremony(ceremony) {
    const game = ceremony.gameId ? GAMES[ceremony.gameId] : null;
    const record = game ? profile.games[ceremony.gameId] : null;
    const gameReward = game ? progression.nextRewardFor(profile, ceremony.gameId) : null;
    const seedCount = FOUNDATIONAL_GAME_IDS.filter((gameId) => profile.games[gameId].masterySeed).length;
    ui.growthSymbol.style.color = game?.color || '#d7c6ff';
    ui.growthSymbol.textContent = game?.symbol || '◆';
    ui.growthPanel.style.setProperty('--ceremony-color', game?.color || '#d7c6ff');
    ui.growthPanel.classList.remove('is-personal-best', 'is-near-best');
    ui.growthOutcome.classList.add('is-hidden');
    ui.growthOutcome.textContent = '';
    ui.growthScore.removeAttribute('aria-label');
    ui.ceremonyNextReward.classList.remove('is-hidden');
    ui.growthNextReward.textContent = 'KEEP GROWING';
    ui.growthContinueButton.dataset.returnGame = ceremony.sourceGameId || ceremony.gameId || 'lumenloom';
    ui.growthContinueButton.querySelector('span').textContent = 'SEE THE GROVE';

    if (ceremony.type === 'growth-stage') {
      ui.growthOutcome.classList.remove('is-hidden');
      ui.growthOutcome.textContent = 'PERMANENT TREE FORM';
      ui.ceremonyKicker.textContent = 'NEW GROWTH STAGE';
      ui.growthTitle.textContent = `${game.tree} reached ${ceremony.stage}.`;
      ui.growthCopy.textContent = 'Its lifetime score opened a permanent new silhouette in the Living Carousel.';
      ui.growthRunLabel.textContent = 'RUN SCORE';
      ui.growthRunScore.textContent = formatNumber(ceremony.added);
      ui.growthScoreLabel.textContent = 'TREE TOTAL';
      ui.growthScore.textContent = formatNumber(ceremony.totalScore);
      ui.growthMasteryLabel.textContent = 'GROWTH';
      ui.growthMastery.textContent = ceremony.stage;
      ui.growthNextReward.textContent = [ceremony.nextReward?.growthLabel, ceremony.nextReward?.skillLabel]
        .filter(Boolean)
        .join(' · ') || 'KEEP GROWING';
      return;
    }

    if (ceremony.type === 'mastery-seed') {
      if (ceremony.gameId === 'mothchorus') {
        ui.ceremonyKicker.textContent = 'CHOIR SEED EARNED';
        ui.growthTitle.textContent = 'The Choir Linden holds your song.';
        ui.growthCopy.textContent = 'A complete chorus returned with both score and voices in balance. This advanced-discipline Seed is permanent.';
        ui.growthRunLabel.textContent = 'BEST SCORE';
        ui.growthRunScore.textContent = formatNumber(Math.max(record.standardBest, record.assistedBest));
        ui.growthScoreLabel.textContent = 'VOICE THRESHOLD';
        ui.growthScore.textContent = `${ceremony.voiceThreshold || 18} / 24`;
        ui.growthMasteryLabel.textContent = 'ADVANCED SEED';
        ui.growthMastery.textContent = 'CHOIR SEED';
        ui.growthNextReward.textContent = [gameReward?.growthLabel, 'RETURN TO THE CHORUS'].filter(Boolean).join(' · ');
        return;
      }
      ui.ceremonyKicker.textContent = 'MASTERY SEED EARNED';
      ui.growthTitle.textContent = `${game.tree} yielded its Seed.`;
      ui.growthCopy.textContent = 'Peak human-controlled skill awakened this permanent key. Accessibility assists remain content-eligible, and the Seed can never be lost.';
      ui.growthRunLabel.textContent = 'QUALIFYING BEST';
      ui.growthRunScore.textContent = formatNumber(Math.max(record.standardBest, record.assistedBest));
      ui.growthScoreLabel.textContent = 'SEED THRESHOLD';
      ui.growthScore.textContent = formatNumber(ceremony.threshold);
      ui.growthMasteryLabel.textContent = 'SEEDS HELD';
      ui.growthMastery.textContent = `${seedCount} / 3`;
      ui.growthNextReward.textContent = [gameReward?.growthLabel, gameReward?.skillLabel].filter(Boolean).join(' · ') || 'KEEP GROWING';
      return;
    }

    if (ceremony.type === 'tree-unlocked') {
      ui.ceremonyKicker.textContent = 'THREE MASTERY SEEDS BOUND';
      ui.growthTitle.textContent = 'Prismbind has awakened.';
      ui.growthCopy.textContent = 'Tree 04 is the Grove’s first Guardian: movement, orbit, and timing joined into one trial of mastery.';
      ui.growthRunLabel.textContent = 'SEEDS JOINED';
      ui.growthRunScore.textContent = '3 / 3';
      ui.growthScoreLabel.textContent = 'GUARDIAN';
      ui.growthScore.textContent = 'TREE 04';
      ui.growthMasteryLabel.textContent = 'STATUS';
      ui.growthMastery.textContent = 'AWAKE';
      const prismReward = progression.nextRewardFor(profile, 'prismbind');
      ui.growthNextReward.textContent = [prismReward?.growthLabel, prismReward?.skillLabel].filter(Boolean).join(' · ') || 'FACE THE GUARDIAN';
      return;
    }

    if (ceremony.type === 'session-harmony') {
      ui.growthPanel.style.setProperty('--ceremony-color', '#ffd773');
      ui.growthSymbol.style.color = '#ffd773';
      ui.growthSymbol.textContent = '✤';
      ui.ceremonyKicker.textContent = 'GROVE HARMONY';
      ui.growthTitle.textContent = 'Three tree voices answer.';
      ui.growthCopy.textContent = 'Lumen, pattern, and ripple were all awakened in one visit. The Grove remembers the breadth of your practice until this page rests.';
      ui.growthOutcome.classList.remove('is-hidden');
      ui.growthOutcome.textContent = 'THREE FOUNDATIONAL TREES · ONE VISIT';
      ui.growthRunLabel.textContent = 'TREES PLAYED';
      ui.growthRunScore.textContent = '3 / 3';
      ui.growthScoreLabel.textContent = 'THIS VISIT';
      ui.growthScore.textContent = 'AWAKENED';
      ui.growthMasteryLabel.textContent = 'GROVE STATE';
      ui.growthMastery.textContent = 'HARMONY';
      ui.growthNextReward.textContent = 'RETURN TO ANY TREE · REACH FOR ANOTHER PERSONAL BEST';
      ui.growthContinueButton.querySelector('span').textContent = 'HEAR THE GROVE';
      return;
    }

    ui.ceremonyKicker.textContent = 'THE CROWNHEART ANSWERS';
    ui.growthTitle.textContent = 'The Choir Linden is listening.';
    ui.growthCopy.textContent = 'Prismbind’s Guardian has been overcome. A violet path reaches Tree 05, where twenty-four luminous voices wait for a Keeper.';
    ui.growthRunLabel.textContent = 'GUARDIAN';
    ui.growthRunScore.textContent = 'AWAKENED';
    ui.growthScoreLabel.textContent = 'REGION';
    ui.growthScore.textContent = 'SECOND GROVE';
    ui.growthMasteryLabel.textContent = 'PATH';
    ui.growthMastery.textContent = 'REVEALED';
    ui.growthNextReward.textContent = 'TREE 05 · MOTHCHORUS NOW PLAYABLE · TREES 06–07 REVEALED';
  }

  function showNextCeremony() {
    if (activeGameId || activeGrowthTransfer || currentCeremony || !ceremonyQueue.length) return;
    currentCeremony = ceremonyQueue.shift();
    configureCeremony(currentCeremony);
    setOverlay(ui.growthOverlay, true);
    announce(`${ui.ceremonyKicker.textContent}. ${ui.growthTitle.textContent}`);
    window.setTimeout(() => ui.growthContinueButton.focus(), 80);
  }

  function completeCurrentCeremony() {
    const ceremony = currentCeremony;
    if (!ceremony) return;
    if (ceremony.ceremonyKey) {
      const acknowledged = progression.acknowledgeCeremony(profile, ceremony.ceremonyKey);
      if (!acknowledged.ok) {
        showToast('This reward could not be acknowledged safely. It remains ready.');
        return;
      }
      const proposed = proposeProfile(() => {}, { source: acknowledged.profile });
      const committed = commitProfile(proposed, {
        label: 'Reward acknowledgement',
        resume: () => finishCurrentCeremony(ceremony)
      });
      if (!committed.ok) {
        showToast('The reward remains open until its acknowledgement is safely stored.');
        return;
      }
    }
    finishCurrentCeremony(ceremony);
  }

  function finishCurrentCeremony(ceremony) {
    currentCeremony = null;
    setOverlay(ui.growthOverlay, false);
    updateProfileUI();
    buildSaplings();
    rendererState.growthPulse = reducedMotion ? 0 : .8;
    const returnGame = ceremony.sourceGameId || ceremony.gameId || 'lumenloom';
    if (ceremony.type === 'session-harmony') {
      rendererState.growthPulseColor = '#ffd773';
      ui.firstTree?.classList.remove('is-harmony-received');
      if (!reducedMotion) requestAnimationFrame(() => ui.firstTree?.classList.add('is-harmony-received'));
      window.setTimeout(() => ui.firstTree?.classList.remove('is-harmony-received'), 1000);
      playGroveHarmony();
      showToast('Grove Harmony awakened — three tree voices, one visit.', 3);
    } else if (GAMES[returnGame]) {
      rendererState.growthPulseColor = GAMES[returnGame].color;
      highlightReturnedTree(returnGame);
      playTreeVoice(returnGame, 'growth');
    }
    if (ceremonyQueue.length) window.setTimeout(showNextCeremony, 100);
    else {
      presentPendingVisitHarmony();
      window.setTimeout(() => {
        focusGamePlayControl(returnGame);
      }, 100);
    }
  }

  function startTrial() {
    const trialReady = carousel && carouselDependencies
      ? carousel.isTrialAvailable(profile, carouselDependencies)
      : FOUNDATIONAL_GAME_IDS.every((gameId) => profile.games[gameId].completed);
    if (!trialReady) {
      showToast('Complete Lumenloom, Bloomfold, and Ripplewake to awaken the Threefold Trial.');
      announceCarousel('Threefold Trial locked. Complete all three foundational trees.');
      return;
    }
    trialSession = {
      active: true,
      index: 0,
      order: [...FOUNDATIONAL_GAME_IDS],
      scores: {}
    };
    openGame(trialSession.order[0]);
  }

  function continueTrial() {
    if (!trialSession?.active || activeSessionStatus() !== 'completed') return;
    if (trialSession.index < trialSession.order.length - 1) {
      trialSession.index += 1;
      openGame(trialSession.order[trialSession.index]);
      return;
    }
    finishTrial();
  }

  function finishTrial() {
    if (!trialSession) return;
    const scored = progression.scoreTrial(trialSession.scores);
    if (!scored.ok) {
      showToast('The Trial could not verify all three scores. Completed tree progress remains safe.');
      return;
    }
    const proposed = proposeProfile((draft) => {
      draft.trialBest = Math.max(draft.trialBest, scored.combined);
      draft.trialsCompleted = safeAdd(draft.trialsCompleted, 1);
    });
    const committed = commitProfile(proposed, {
      label: 'Threefold Trial',
      resume: () => finishTrialPresentation(scored)
    });
    if (!committed.ok) {
      showToast('The Trial result is waiting for a verified save. Its mark has not been shown or counted yet.');
      return;
    }
    finishTrialPresentation(scored);
  }

  function finishTrialPresentation(scored) {
    trialSession = null;
    closeGame({ suppressCeremonies: true, suppressFocus: true });
    rendererState.growthPulse = reducedMotion ? 0 : 1.3;
    rendererState.growthPulseColor = '#ffd773';
    ui.trialLumenScore.textContent = formatNumber(scored.normalized.lumenloom);
    ui.trialBloomScore.textContent = formatNumber(scored.normalized.bloomfold);
    ui.trialRippleScore.textContent = formatNumber(scored.normalized.ripplewake);
    ui.trialCombinedScore.textContent = formatNumber(scored.combined);
    const weakerTitle = GAMES[scored.weakestGameId].title.toLowerCase();
    ui.trialResultCopy.textContent = scored.combined >= 800
      ? 'Three disciplines, held in uncommon balance. A Threefold Bloom has opened on the First Tree.'
      : `The Threefold Bloom has taken root. ${weakerTitle.charAt(0).toUpperCase() + weakerTitle.slice(1)} offers the clearest path to stronger balance.`;
    setOverlay(ui.trialResultOverlay, true);
    window.setTimeout(() => ui.trialDoneButton.focus(), 80);
  }

  function resetProgress() {
    if (pendingSave) {
      showToast(`${pendingSave.label} is already waiting. Retry that exact save before resetting.`);
      ui.pendingRetryButton.focus({ preventScroll: true });
      return;
    }
    const now = Date.now();
    if (!resetArmed || now > resetTimer) {
      resetArmed = true;
      resetTimer = now + 8000;
      ui.resetProgressButton.textContent = 'Click again to confirm reset';
      showToast('This will erase Grove totals, Seeds, Trials, gallery specimens, and all five standalone bests in this browser.');
      return;
    }
    const committed = resetProfileStorage({
      label: 'Grove reset',
      resume: finishResetPresentation
    });
    if (!committed.ok) {
      showToast(committed.retryPayload
        ? 'Reset is waiting for a verified save. No visible progress has been erased yet.'
        : 'Reset could not begin while another save is pending.');
      return;
    }
    finishResetPresentation();
  }

  function finishResetPresentation() {
    const optionalKeys = [
      'bloomfold-specimens',
      'mothchorus-playtest-v1',
      ...Object.values(GAMES).map((game) => game.standaloneKey)
    ];
    let cleanupFailures = 0;
    storageCleanupIncomplete = false;
    optionalKeys.forEach((key) => {
      try { localStorage.removeItem(key); }
      catch (_) { cleanupFailures += 1; }
    });
    if (cleanupFailures > 0) {
      storageCleanupIncomplete = true;
      storageNotice = `The Grove profile was reset, but ${cleanupFailures} optional gallery or standalone record${cleanupFailures === 1 ? '' : 's'} could not be removed.`;
    } else {
      storageNotice = '';
    }
    ceremonyQueue = [];
    currentCeremony = null;
    resetVisitState();
    clearScorePresentation();
    resetArmed = false;
    resetTimer = 0;
    ui.resetProgressButton.textContent = 'Reset all local progress';
    setOverlay(ui.settingsOverlay, false);
    rendererState.growthPulse = reducedMotion ? 0 : .7;
    rendererState.growthPulseColor = '#82f4ee';
    updateProfileUI();
    buildSaplings();
    showToast(cleanupFailures === 0
      ? 'The clearing is quiet again. All three foundational trees remain playable.'
      : 'The Grove is fresh. An optional standalone record could not be removed.');
    updateStorageWarning();
    syncFirstBloomVisibility({ restart: true, focus: true });
  }

  function sanitizeSpecimens(value) {
    if (!Array.isArray(value) || value.length > 8) return null;
    const specimens = [];
    for (const item of value) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
      const score = item.score;
      const seed = item.seed;
      if (typeof item.name !== 'string' || !item.name || item.name.length > 80
        || !Number.isSafeInteger(score) || score < 0
        || !Number.isSafeInteger(seed) || seed < 0
        || typeof item.victory !== 'boolean'
        || typeof item.date !== 'string' || item.date.length > 64
        || !Array.isArray(item.mutations) || item.mutations.length > 16
        || !item.mutations.every((mutation) => typeof mutation === 'string' && mutation.length <= 64)) return null;
      specimens.push({
        name: item.name,
        score,
        seed,
        mutations: [...item.mutations],
        victory: item.victory,
        date: item.date
      });
    }
    return specimens;
  }

  function exportProgress() {
    const created = progression.createExportBundle(profile, new Date().toISOString());
    if (!created.ok) {
      ui.dataManagementStatus.textContent = 'The current profile could not be validated for export.';
      return;
    }
    let specimens = [];
    try {
      const parsed = JSON.parse(localStorage.getItem('bloomfold-specimens') || '[]');
      specimens = sanitizeSpecimens(parsed) || [];
    } catch (_) { /* A damaged optional gallery does not block the core backup. */ }
    const documentBundle = { ...created.bundle, bloomfoldSpecimens: specimens };
    const blob = new Blob([`${JSON.stringify(documentBundle, null, 2)}\n`], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `first-bloom-grove-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    ui.dataManagementStatus.textContent = 'Progress backup exported. Keep it somewhere safe.';
    announce('Progress backup exported.');
  }

  async function importProgressFile(file) {
    if (!file) return;
    if (pendingSave) {
      ui.dataManagementStatus.textContent = `${pendingSave.label} is already waiting. Retry that exact save before importing another backup.`;
      ui.pendingRetryButton.focus({ preventScroll: true });
      return;
    }
    if (storageReadOnly) {
      ui.dataManagementStatus.textContent = 'A newer-version save is protected. Reset explicitly before importing an older profile.';
      return;
    }
    if (file.size > 512 * 1024) {
      ui.dataManagementStatus.textContent = 'That file is too large to be a Grove backup.';
      return;
    }
    try {
      const parsed = JSON.parse(await file.text());
      const allowed = ['kind', 'bundleVersion', 'profileVersion', 'exportedAt', 'profile', 'bloomfoldSpecimens'];
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)
        || Object.keys(parsed).some((key) => !allowed.includes(key))) throw new Error('unexpected-fields');
      const coreBundle = {
        kind: parsed.kind,
        bundleVersion: parsed.bundleVersion,
        profileVersion: parsed.profileVersion,
        exportedAt: parsed.exportedAt,
        profile: parsed.profile
      };
      const validated = progression.validateExportBundle(coreBundle);
      if (!validated.ok) throw new Error(validated.code);
      const specimens = parsed.bloomfoldSpecimens === undefined ? [] : sanitizeSpecimens(parsed.bloomfoldSpecimens);
      if (specimens === null) throw new Error('invalid-specimens');
      const proposed = proposeProfile(() => {}, { source: validated.profile });
      const committed = commitProfile(proposed, {
        label: 'Profile import',
        resume: () => finishImportProgress(specimens)
      });
      if (!committed.ok) {
        ui.dataManagementStatus.textContent = committed.retryPayload
          ? 'Import validated; Retry Save to install this exact backup.'
          : 'Import could not replace the protected profile. Reset explicitly first.';
        return;
      }
      finishImportProgress(specimens);
    } catch (_) {
      ui.dataManagementStatus.textContent = 'Import failed: choose an unmodified First Bloom Grove backup.';
    } finally {
      ui.importProgressInput.value = '';
    }
  }

  function finishImportProgress(specimens) {
    let gallerySaved = true;
    try { localStorage.setItem('bloomfold-specimens', JSON.stringify(specimens)); }
    catch (_) { gallerySaved = false; }
    ceremonyQueue = [];
    currentCeremony = null;
    resetVisitState();
    clearScorePresentation();
    enqueuePersistentRewards();
    updateProfileUI();
    buildSaplings();
    rendererState.growthPulse = reducedMotion ? 0 : .8;
    ui.dataManagementStatus.textContent = gallerySaved
      ? 'Backup imported and validated. The Grove has been refreshed.'
      : 'Core Grove progress imported. The optional Bloomfold gallery could not be stored.';
    announce(gallerySaved
      ? 'Progress backup imported and validated.'
      : 'Core progress imported; optional gallery storage was unavailable.');
    if (firstBloomNeeded()) {
      setOverlay(ui.settingsOverlay, false);
      syncFirstBloomVisibility({ restart: true, focus: true });
    }
  }

  function announce(message) {
    ui.groveLive.textContent = '';
    window.setTimeout(() => { ui.groveLive.textContent = message; }, 20);
  }

  function buildReleaseDiagnostics() {
    const orientation = window.screen?.orientation?.type
      || (window.innerWidth >= window.innerHeight ? 'landscape' : 'portrait');
    const storageState = !storageAvailable
      ? 'unavailable'
      : storageReadOnly
        ? 'available (read-only protection active)'
        : 'available';
    const rendererTier = canvas.dataset.rendererProfile || (view.mobileRenderer ? 'mobile-balanced' : 'desktop-balanced');
    const devicePixelRatio = Number(window.devicePixelRatio || 1);
    const userAgent = String(navigator.userAgent || 'unavailable').replace(/[\r\n]+/g, ' ').trim().slice(0, 320);

    return [
      'First Bloom: The Mastery Grove diagnostics',
      `Build: ${RELEASE_VERSION}`,
      `Viewport: ${Math.round(window.innerWidth)} x ${Math.round(window.innerHeight)} CSS px`,
      `Device pixel ratio: ${Number.isFinite(devicePixelRatio) ? devicePixelRatio.toFixed(2) : 'unavailable'}`,
      `Orientation: ${orientation}`,
      `Reduced motion: ${reducedMotion ? 'yes' : 'no'}`,
      `Renderer tier: ${rendererTier}`,
      `Storage availability: ${storageState}`,
      `User agent: ${userAgent}`
    ].join('\n');
  }

  function resetDiagnosticsOutput() {
    ui.diagnosticsOutput.value = '';
    ui.diagnosticsOutput.classList.add('is-hidden');
    ui.diagnosticsStatus.textContent = 'Diagnostics are created only when you choose Copy diagnostics.';
  }

  async function copyReleaseDiagnostics() {
    const diagnostics = buildReleaseDiagnostics();
    ui.diagnosticsOutput.value = diagnostics;
    ui.diagnosticsOutput.classList.remove('is-hidden');

    try {
      if (!navigator.clipboard?.writeText) throw new Error('clipboard-unavailable');
      await navigator.clipboard.writeText(diagnostics);
      ui.diagnosticsStatus.textContent = 'Diagnostics copied. Paste them into a GitHub issue when useful.';
      announce('Safe release diagnostics copied.');
    } catch (_) {
      ui.diagnosticsOutput.focus({ preventScroll: true });
      ui.diagnosticsOutput.select();
      ui.diagnosticsOutput.setSelectionRange(0, diagnostics.length);
      ui.diagnosticsStatus.textContent = 'Automatic copy is unavailable. The diagnostics are selected; use your device copy command.';
      announce('Diagnostics selected for manual copying.');
    }
  }

  function openReleaseInformation() {
    releaseInfoReturnsToSettings = ui.settingsOverlay.classList.contains('is-visible');
    if (releaseInfoReturnsToSettings) setOverlay(ui.settingsOverlay, false);
    ui.releaseBuildIdentity.textContent = RELEASE_VERSION;
    resetDiagnosticsOutput();
    setOverlay(ui.releaseInfoOverlay, true);
    const releasePanel = ui.releaseInfoOverlay.querySelector('.release-info-panel');
    window.setTimeout(() => {
      if (releasePanel) releasePanel.scrollTop = 0;
      ui.releaseInfoTitle.focus({ preventScroll: true });
    }, 80);
  }

  function closeReleaseInformation() {
    setOverlay(ui.releaseInfoOverlay, false);
    resetDiagnosticsOutput();
    const returnToSettings = releaseInfoReturnsToSettings;
    releaseInfoReturnsToSettings = false;
    if (returnToSettings) setOverlay(ui.settingsOverlay, true);
    window.setTimeout(() => {
      if (returnToSettings) ui.releaseInfoButton.focus({ preventScroll: true });
      else ui.settingsButton.focus({ preventScroll: true });
    }, 100);
  }

  function showToast(message, duration = 2.3) {
    ui.groveToast.textContent = message;
    ui.groveToast.classList.add('is-visible');
    toastTimer = duration;
  }

  function syncModalState() {
    const overlays = [ui.saveRecoveryOverlay, ui.firstBloomOverlay, ui.growthOverlay, ui.trialResultOverlay, ui.settingsOverlay, ui.releaseInfoOverlay, ui.returnConfirmOverlay];
    const topOverlay = overlays.find((overlay) => overlay.classList.contains('is-visible')) || null;
    const modalOpen = Boolean(topOverlay);
    overlays.forEach((overlay) => {
      const visible = overlay.classList.contains('is-visible');
      const interactive = visible && overlay === topOverlay;
      overlay.inert = !interactive;
      overlay.setAttribute('aria-hidden', String(!interactive));
    });
    const gameOpen = !ui.gameShell.classList.contains('is-hidden');
    ui.groveScreen.inert = modalOpen || gameOpen;
    ui.gameShell.inert = modalOpen;
    document.body.classList.toggle('modal-open', modalOpen);
    ui.groveScreen.setAttribute('aria-hidden', String(modalOpen || gameOpen));
    ui.gameShell.setAttribute('aria-hidden', String(!gameOpen || modalOpen));
    return modalOpen;
  }

  function setOverlay(overlay, visible) {
    overlay.classList.toggle('is-visible', visible);
    const modalOpen = syncModalState();
    restartRenderer(!modalOpen && !document.hidden);
  }

  function trapModalFocus(event) {
    if (event.key !== 'Tab') return false;
    const overlay = [ui.saveRecoveryOverlay, ui.firstBloomOverlay, ui.growthOverlay, ui.trialResultOverlay, ui.settingsOverlay, ui.releaseInfoOverlay, ui.returnConfirmOverlay]
      .find((candidate) => candidate.classList.contains('is-visible') && !candidate.inert);
    if (!overlay) return false;
    const focusable = [...overlay.querySelectorAll('button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])')]
      .filter((element) => element.getClientRects().length > 0);
    if (!focusable.length) return false;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const activeIndex = focusable.indexOf(document.activeElement);
    if (event.shiftKey && (activeIndex <= 0 || !overlay.contains(document.activeElement))) {
      event.preventDefault();
      last.focus();
      return true;
    }
    if (!event.shiftKey && (activeIndex < 0 || document.activeElement === last || !overlay.contains(document.activeElement))) {
      event.preventDefault();
      first.focus();
      return true;
    }
    return false;
  }

  function resizeCanvas() {
    const width = Math.max(1, window.innerWidth);
    const height = Math.max(1, window.innerHeight);
    const mobileRenderer = isLikelyMobileRenderer();
    const dprLimit = mobileRenderer ? 1.25 : 1.6;
    const pixelBudget = mobileRenderer ? 550000 : 2200000;
    const budgetDpr = Math.sqrt(pixelBudget / Math.max(1, width * height));
    const dpr = Math.max(.75, Math.min(window.devicePixelRatio || 1, dprLimit, budgetDpr));
    const unchanged = view.width === width
      && view.height === height
      && Math.abs(view.dpr - dpr) < .01
      && view.mobileRenderer === mobileRenderer;

    view.width = width;
    view.height = height;
    view.dpr = dpr;
    view.mobileRenderer = mobileRenderer;
    view.frameInterval = mobileRenderer ? 1000 / 24 : 1000 / 45;
    view.effectsScale = mobileRenderer ? .62 : 1;
    canvas.dataset.rendererProfile = mobileRenderer ? 'mobile-balanced' : 'desktop-balanced';
    canvas.dataset.rendererDpr = dpr.toFixed(3);
    canvas.dataset.rendererTargetFps = String(Math.round(1000 / view.frameInterval));
    canvas.dataset.rendererFrameIntervalMs = view.frameInterval.toFixed(2);
    canvas.dataset.rendererEffectsScale = view.effectsScale.toFixed(2);
    if (!ctx || unchanged) return false;
    canvas.width = Math.max(1, Math.floor(width * dpr));
    canvas.height = Math.max(1, Math.floor(height * dpr));
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    seedAtmosphere();
    rendererState.lastRenderAt = 0;
    return true;
  }

  function queueCanvasResize() {
    clearTimeout(resizeTimerId);
    resizeTimerId = window.setTimeout(() => {
      resizeTimerId = 0;
      const resized = resizeCanvas();
      if (carouselActive) renderLivingCarousel();
      if (resized) restartRenderer(true);
    }, view.mobileRenderer ? 120 : 60);
  }

  function seededRandom(seed) {
    let value = seed >>> 0;
    return () => {
      value += 0x6D2B79F5;
      let t = value;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function seedAtmosphere() {
    const random = seededRandom(0xF1B1007);
    const fireflyPalette = ['#ffd773', '#82f4ee', '#ff9b85'];
    const starLimit = view.mobileRenderer ? 64 : 160;
    const fireflyCount = view.mobileRenderer ? 16 : 24;
    rendererState.stars = Array.from({ length: Math.min(starLimit, Math.round(view.width * view.height / 8500)) }, () => ({
      x: random() * view.width,
      y: random() * view.height * .72,
      size: .35 + random() * 1.2,
      phase: random() * TAU
    }));
    rendererState.fireflies = Array.from({ length: fireflyCount }, () => ({
      x: random() * view.width,
      y: view.height * (.28 + random() * .58),
      speed: .18 + random() * .45,
      drift: .5 + random() * 1.4,
      phase: random() * TAU,
      color: fireflyPalette[Math.floor(random() * fireflyPalette.length)]
    }));
  }

  function drawGrove(dt) {
    if (!ctx) return;
    ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    ctx.clearRect(0, 0, view.width, view.height);
    view.time += dt;
    rendererState.growthPulse = Math.max(0, rendererState.growthPulse - dt * .42);
    rendererState.breeze = reducedMotion ? 0 : Math.sin(view.time * .27) * .04;

    const sky = ctx.createLinearGradient(0, 0, 0, view.height);
    sky.addColorStop(0, '#090a23');
    sky.addColorStop(.46, '#12143b');
    sky.addColorStop(1, '#050715');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, view.width, view.height);

    drawMoon();
    drawStars();
    drawGround();
    drawFirstTree();
    drawFireflies(dt);
    if (rendererState.growthPulse > 0) drawGrowthPulse();
  }

  function drawMoon() {
    const x = view.width * .5;
    const y = view.height * .24;
    const radius = Math.min(view.width, view.height) * .13;
    const glow = ctx.createRadialGradient(x, y, 0, x, y, radius * 2.8);
    glow.addColorStop(0, 'rgba(201,255,250,.12)');
    glow.addColorStop(.35, 'rgba(130,144,255,.055)');
    glow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(x - radius * 3, y - radius * 3, radius * 6, radius * 6);
  }

  function drawStars() {
    ctx.save();
    for (const star of rendererState.stars) {
      const alpha = .2 + .32 * (.5 + .5 * Math.sin(view.time * .6 + star.phase));
      ctx.fillStyle = `rgba(235,235,255,${alpha})`;
      ctx.beginPath();
      ctx.arc(star.x, star.y, star.size, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawGround() {
    const model = groveRenderModel();
    const horizon = view.height * .72;
    const ground = ctx.createLinearGradient(0, horizon, 0, view.height);
    ground.addColorStop(0, 'rgba(15,35,39,.35)');
    ground.addColorStop(1, 'rgba(3,8,12,.94)');
    ctx.fillStyle = ground;
    ctx.beginPath();
    ctx.moveTo(0, horizon + Math.sin(view.time * .1) * 3);
    ctx.quadraticCurveTo(view.width * .22, horizon - 25, view.width * .5, horizon + 5);
    ctx.quadraticCurveTo(view.width * .78, horizon - 30, view.width, horizon);
    ctx.lineTo(view.width, view.height);
    ctx.lineTo(0, view.height);
    ctx.closePath();
    ctx.fill();

    const path = ctx.createRadialGradient(view.width * .5, view.height * .84, 0, view.width * .5, view.height * .84, view.width * .32);
    path.addColorStop(0, 'rgba(255,215,115,.055)');
    path.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = path;
    ctx.fillRect(0, horizon, view.width, view.height - horizon);

    if (model.secondGroveRevealed) {
      ctx.save();
      const clearingX = view.width * .83;
      const clearingY = horizon * .98;
      const clearingGlow = ctx.createRadialGradient(clearingX, clearingY, 0, clearingX, clearingY, Math.min(view.width, view.height) * .24);
      clearingGlow.addColorStop(0, 'rgba(184,154,255,.13)');
      clearingGlow.addColorStop(.45, 'rgba(130,244,238,.045)');
      clearingGlow.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = clearingGlow;
      ctx.fillRect(clearingX - view.width * .25, clearingY - view.height * .2, view.width * .5, view.height * .4);
      ctx.strokeStyle = 'rgba(215,198,255,.16)';
      ctx.lineWidth = Math.max(1, Math.min(view.width, view.height) * .002);
      ctx.setLineDash([5, 10]);
      ctx.beginPath();
      ctx.moveTo(view.width * .55, view.height * .94);
      ctx.quadraticCurveTo(view.width * .7, view.height * .85, clearingX, clearingY);
      ctx.stroke();
      ctx.restore();
    }
  }

  function drawFirstTree() {
    const model = groveRenderModel();
    const { lumenGrowth, bloomGrowth, rippleGrowth } = model;
    const lumenLevel = lumenGrowth.level;
    const bloomLevel = bloomGrowth.level;
    const rippleLevel = rippleGrowth.level;
    const marks = model.marks;
    const overallGrowth = model.overallGrowth;
    const centerX = view.width * .5;
    const baseY = view.height * .74;
    const scale = Math.min(view.width, view.height);
    const trunkHeight = scale * (.2 + overallGrowth * .09);
    const trunkTopY = baseY - trunkHeight;

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    const rootGlow = ctx.createRadialGradient(centerX, baseY, 0, centerX, baseY, scale * .32);
    rootGlow.addColorStop(0, `rgba(130,244,238,${.035 + overallGrowth * .06 + rendererState.growthPulse * .1})`);
    rootGlow.addColorStop(.45, 'rgba(255,215,115,.025)');
    rootGlow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = rootGlow;
    ctx.fillRect(centerX - scale * .38, baseY - scale * .25, scale * .76, scale * .5);

    drawRoots(centerX, baseY, scale, Math.round(overallGrowth * 7));

    ctx.shadowColor = 'rgba(130,244,238,.16)';
    ctx.shadowBlur = (12 + overallGrowth * 20) * view.effectsScale;
    ctx.strokeStyle = '#372b3c';
    ctx.lineWidth = Math.max(8, scale * .022);
    ctx.beginPath();
    ctx.moveTo(centerX, baseY);
    ctx.bezierCurveTo(
      centerX - scale * .018,
      baseY - trunkHeight * .32,
      centerX + scale * .02,
      baseY - trunkHeight * .72,
      centerX,
      trunkTopY
    );
    ctx.stroke();

    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(255,215,170,.14)';
    ctx.lineWidth = Math.max(1, scale * .003);
    ctx.beginPath();
    ctx.moveTo(centerX - scale * .006, baseY - 4);
    ctx.bezierCurveTo(centerX - 4, baseY - trunkHeight * .36, centerX + 4, baseY - trunkHeight * .72, centerX - 2, trunkTopY);
    ctx.stroke();

    const leftGrowth = .28 + lumenGrowth.progress / 100 * .72;
    const rightGrowth = .28 + bloomGrowth.progress / 100 * .72;
    const crownGrowth = .28 + rippleGrowth.progress / 100 * .72;
    const leftEndpoints = [];
    const rightEndpoints = [];
    const crownEndpoints = [];
    drawBranch(centerX, trunkTopY + scale * .012, scale * .145, -1.57, scale * .012, 4, crownGrowth, '#72514f', '#ff9b85', crownEndpoints, .45);
    drawBranch(centerX, trunkTopY + scale * .035, scale * .155, -2.28, scale * .013, 4, leftGrowth, '#816341', '#ffd773', leftEndpoints, 1);
    drawBranch(centerX, trunkTopY + scale * .02, scale * .155, -0.86, scale * .013, 4, rightGrowth, '#3d6972', '#82f4ee', rightEndpoints, -1);

    drawCanopyDetails(leftEndpoints, lumenLevel, '#ffd773', 'flower');
    drawCanopyDetails(rightEndpoints, bloomLevel, '#82f4ee', 'fractal');
    drawCanopyDetails(crownEndpoints, rippleLevel, '#ff9b85', 'ripple');

    if (marks >= 4) drawSharedCanopy(centerX, trunkTopY, scale, marks);
    drawGuardianCrown(centerX, trunkTopY - scale * .012, scale, model);
    ctx.restore();
  }

  function drawGuardianCrown(x, y, scale, model) {
    const unlocked = model.guardianUnlocked;
    const awakened = model.guardianAwakened;
    if (!unlocked && model.marks < 10) return;

    const strength = awakened ? 1 : unlocked ? .66 : .18;
    const radius = scale * (awakened ? .042 : .034);
    ctx.save();
    ctx.translate(x, y);
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = strength;
    ctx.lineWidth = Math.max(.8, scale * .0015);
    const colors = ['#ffd773', '#82f4ee', '#ff9b85'];
    for (let index = 0; index < 3; index += 1) {
      ctx.save();
      ctx.rotate(view.time * (awakened ? .08 : .025) * (index % 2 ? -1 : 1) + index * TAU / 3);
      ctx.strokeStyle = colors[index];
      ctx.shadowColor = colors[index];
      ctx.shadowBlur = (awakened ? 14 : 7) * view.effectsScale;
      ctx.beginPath();
      ctx.ellipse(0, 0, radius * 1.55, radius * .48, index * .34, 0, TAU);
      ctx.stroke();
      ctx.restore();
    }

    ctx.rotate(Math.PI / 4);
    ctx.fillStyle = awakened ? '#eee7ff' : 'rgba(215,198,255,.72)';
    ctx.shadowColor = '#b89aff';
    ctx.shadowBlur = (awakened ? 26 : 12) * view.effectsScale;
    ctx.fillRect(-radius * .18, -radius * .18, radius * .36, radius * .36);
    if (awakened) {
      ctx.rotate(-Math.PI / 4);
      const aura = ctx.createRadialGradient(0, 0, 0, 0, 0, radius * 3.5);
      aura.addColorStop(0, 'rgba(231,220,255,.28)');
      aura.addColorStop(.35, 'rgba(184,154,255,.09)');
      aura.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = aura;
      ctx.fillRect(-radius * 3.5, -radius * 3.5, radius * 7, radius * 7);
    }
    ctx.restore();
  }

  function drawRoots(x, y, scale, litRoots) {
    ctx.save();
    ctx.lineCap = 'round';
    for (let index = 0; index < 7; index += 1) {
      const direction = index % 2 ? 1 : -1;
      const spread = (.08 + index * .026) * scale;
      ctx.strokeStyle = index < litRoots ? 'rgba(130,244,238,.16)' : 'rgba(82,66,74,.38)';
      ctx.lineWidth = Math.max(1, scale * (.005 - index * .00035));
      ctx.beginPath();
      ctx.moveTo(x + direction * index, y - index * 2);
      ctx.quadraticCurveTo(x + direction * spread * .45, y + scale * .035, x + direction * spread, y + scale * .065 + index * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawBranch(x, y, length, angle, width, depth, growth, wood, accent, endpoints, direction) {
    if (depth < 0 || growth <= .02) return;
    const stage = Math.min(1, growth * 1.28);
    const actualLength = length * (.32 + stage * .68);
    const wind = rendererState.breeze * (5 - depth) * direction;
    const endX = x + Math.cos(angle + wind) * actualLength;
    const endY = y + Math.sin(angle + wind) * actualLength;
    const controlX = (x + endX) * .5 + Math.sin(angle) * actualLength * .08;
    const controlY = (y + endY) * .5 - Math.cos(angle) * actualLength * .08;

    ctx.strokeStyle = wood;
    ctx.lineWidth = Math.max(.8, width * (.55 + stage * .45));
    ctx.shadowColor = accent;
    ctx.shadowBlur = growth > .7 ? 4 * view.effectsScale : 0;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(controlX, controlY, endX, endY);
    ctx.stroke();
    ctx.shadowBlur = 0;

    if (growth > .38 && depth <= 2) {
      drawLeaf(endX, endY, angle, width * 1.9, accent, direction);
    }
    if (depth === 0 || growth < .2) {
      endpoints.push({ x: endX, y: endY, angle });
      return;
    }

    const nextGrowth = growth - .105;
    drawBranch(endX, endY, length * .72, angle - .46, width * .72, depth - 1, nextGrowth, wood, accent, endpoints, direction);
    drawBranch(endX, endY, length * .68, angle + .54, width * .68, depth - 1, nextGrowth - .025, wood, accent, endpoints, direction);
  }

  function drawLeaf(x, y, angle, size, color, direction) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle + direction * .55);
    const leafColors = {
      '#ffd773': 'rgba(117,191,133,.48)',
      '#82f4ee': 'rgba(130,244,238,.28)',
      '#ff9b85': 'rgba(120,226,193,.4)'
    };
    ctx.fillStyle = leafColors[color] || 'rgba(130,215,164,.32)';
    ctx.beginPath();
    ctx.ellipse(0, 0, Math.max(2, size * 1.7), Math.max(1, size * .66), 0, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  function drawCanopyDetails(endpoints, level, color, type) {
    if (level <= 0) return;
    const visible = Math.min(endpoints.length, level * 3 + 2);
    for (let index = 0; index < visible; index += 1) {
      const point = endpoints[(index * 3 + level) % endpoints.length];
      if (!point) continue;
      const size = 2.5 + level * .45;
      ctx.save();
      ctx.translate(point.x, point.y);
      ctx.globalCompositeOperation = 'lighter';
      ctx.shadowColor = color;
      ctx.shadowBlur = (11 + level * 2) * view.effectsScale;
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      if (type === 'fractal') {
        for (let petal = 0; petal < 6; petal += 1) {
          ctx.rotate(TAU / 6);
          ctx.globalAlpha = .35 + level * .07;
          ctx.beginPath();
          ctx.ellipse(size * 1.2, 0, size, size * .28, 0, 0, TAU);
          ctx.stroke();
        }
      } else if (type === 'ripple') {
        ctx.lineWidth = Math.max(.7, level * .24);
        for (let ring = 1; ring <= 3; ring += 1) {
          ctx.globalAlpha = .18 + level * .055 - ring * .025;
          ctx.beginPath();
          ctx.ellipse(0, 0, size * ring * .9, size * ring * .34, 0, 0, TAU);
          ctx.stroke();
        }
        ctx.globalAlpha = .46 + level * .06;
        ctx.beginPath();
        ctx.arc(0, 0, Math.max(1.2, size * .38), 0, TAU);
        ctx.fill();
      } else {
        ctx.globalAlpha = .48 + level * .07;
        ctx.beginPath();
        ctx.arc(0, 0, size, 0, TAU);
        ctx.fill();
        ctx.globalAlpha = .28;
        ctx.beginPath();
        ctx.arc(0, 0, size * 2.5, 0, TAU);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  function drawSharedCanopy(x, y, scale, marks) {
    ctx.save();
    ctx.translate(x, y - scale * .02);
    ctx.globalCompositeOperation = 'lighter';
    const sharedColors = ['rgba(255,215,115,.2)', 'rgba(130,244,238,.2)', 'rgba(255,155,133,.2)'];
    const petals = Math.min(12, 4 + marks);
    for (let index = 0; index < petals; index += 1) {
      ctx.rotate(TAU / petals);
      ctx.strokeStyle = sharedColors[index % sharedColors.length];
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(scale * .055, 0, scale * .045, scale * .011, 0, 0, TAU);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawFireflies(dt) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const firefly of rendererState.fireflies) {
      firefly.phase += dt * firefly.speed;
      const x = firefly.x + Math.sin(firefly.phase * firefly.drift) * 18;
      const y = firefly.y + Math.cos(firefly.phase * .8) * 11;
      const alpha = .18 + .5 * (.5 + .5 * Math.sin(firefly.phase * 3));
      ctx.fillStyle = firefly.color;
      ctx.globalAlpha = alpha;
      ctx.shadowColor = firefly.color;
      ctx.shadowBlur = 9 * view.effectsScale;
      ctx.beginPath();
      ctx.arc(x, y, 1.2, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawGrowthPulse() {
    const progress = 1 - Math.min(1, rendererState.growthPulse);
    const radius = Math.min(view.width, view.height) * (.1 + progress * .48);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = Math.min(1, rendererState.growthPulse) * .34;
    ctx.strokeStyle = rendererState.growthPulseColor;
    ctx.lineWidth = 2;
    ctx.shadowColor = ctx.strokeStyle;
    ctx.shadowBlur = 18 * view.effectsScale;
    ctx.beginPath();
    ctx.arc(view.width * .5, view.height * .62, radius, 0, TAU);
    ctx.stroke();
    ctx.restore();
  }

  function scheduleRenderer(delay = 0) {
    if (rendererFrameId || rendererTimerId) return;
    if (delay > 0) {
      rendererTimerId = window.setTimeout(() => {
        rendererTimerId = 0;
        rendererFrameId = requestAnimationFrame(frame);
      }, delay);
      return;
    }
    rendererFrameId = requestAnimationFrame(frame);
  }

  function restartRenderer(forceDraw = false) {
    if (rendererTimerId) clearTimeout(rendererTimerId);
    if (rendererFrameId) cancelAnimationFrame(rendererFrameId);
    rendererTimerId = 0;
    rendererFrameId = 0;
    lastFrame = performance.now();
    if (forceDraw) rendererState.lastRenderAt = 0;
    scheduleRenderer(document.hidden ? 1000 : 0);
  }

  function quietRendererFor(duration = 180) {
    if (!view.mobileRenderer || activeGameId) return;
    rendererState.interactionQuietUntil = Math.max(
      rendererState.interactionQuietUntil,
      performance.now() + duration
    );
  }

  function rendererSnapshot() {
    const now = performance.now();
    const sampleSeconds = Math.max(.001, (now - rendererMetrics.startedAt) / 1000);
    const modalOpen = document.body.classList.contains('modal-open');
    return Object.freeze({
      mobileRenderer: view.mobileRenderer,
      cssSize: Object.freeze({ width: view.width, height: view.height }),
      backingSize: Object.freeze({ width: canvas.width, height: canvas.height }),
      backingPixels: canvas.width * canvas.height,
      dpr: Number(view.dpr.toFixed(3)),
      targetFps: Math.round(1000 / view.frameInterval),
      effectiveDrawFps: Number((rendererMetrics.draws / sampleSeconds).toFixed(2)),
      draws: rendererMetrics.draws,
      skipped: rendererMetrics.skipped,
      modelBuilds: rendererMetrics.modelBuilds,
      lastDrawMs: Number(rendererMetrics.lastDrawMs.toFixed(2)),
      averageDrawMs: Number((rendererMetrics.totalDrawMs / Math.max(1, rendererMetrics.draws)).toFixed(2)),
      longestDrawMs: Number(rendererMetrics.longestDrawMs.toFixed(2)),
      profileModelCached: renderModelProfile === profile,
      suspended: Object.freeze({
        hidden: document.hidden,
        gameOpen: Boolean(activeGameId),
        modalOpen,
        interaction: now < rendererState.interactionQuietUntil
      })
    });
  }

  function resetRendererMetrics() {
    rendererMetrics.startedAt = performance.now();
    rendererMetrics.draws = 0;
    rendererMetrics.skipped = 0;
    rendererMetrics.modelBuilds = 0;
    rendererMetrics.lastDrawMs = 0;
    rendererMetrics.totalDrawMs = 0;
    rendererMetrics.longestDrawMs = 0;
    rendererMetrics.lastQaPublishAt = 0;
  }

  function satisfactionSnapshot() {
    const rewards = {};
    for (const gameId of GAME_IDS) rewards[gameId] = progression.nextRewardFor(profile, gameId);
    return Object.freeze({
      playedThisVisit: Object.freeze([...visitState.played]),
      improvedThisVisit: Object.freeze([...visitState.improved]),
      harmonyQueued: visitState.harmonyQueued,
      soundEnabled: groveSoundEnabled,
      activeAudioNodes: activeAudioNodes.size,
      maxActiveAudioNodes: audioQa.maxActiveNodes,
      lastAudioCue: audioQa.lastCue,
      activeCeremony: currentCeremony?.type || null,
      scoreMoteCount: ui.livingCarouselTransferMotes.filter((mote) => !mote.hidden).length,
      scoreCountActive: activeGrowthTransfer?.state.status === 'running',
      scoreCountDurationMs: activeGrowthTransfer?.state.durationMs || 0,
      scoreCountMaxWrites: SCORE_COUNT_MAX_WRITES,
      moteCaps: Object.freeze({
        desktop: growthVisuals?.RENDER_CAPS.desktop.scoreMotes || 0,
        mobile: growthVisuals?.RENDER_CAPS.phone.scoreMotes || 0,
        reducedMotion: 0
      }),
      rewards: Object.freeze(rewards)
    });
  }

  function previewRunFeedbackForQa(gameId, score, assisted = false, victory = false) {
    if (!GAME_IDS.includes(gameId)) return null;
    return progression.classifyRunFeedback(profile.games[gameId], {
      gameId,
      score: safeInteger(score),
      assisted: Boolean(assisted),
      victory: Boolean(victory)
    });
  }

  function setVisitStateForQa(played = [], improved = []) {
    resetVisitState();
    for (const gameId of played) if (GAME_IDS.includes(gameId)) visitState.played.add(gameId);
    for (const gameId of improved) if (visitState.played.has(gameId)) visitState.improved.add(gameId);
    visitState.harmonyQueued = FOUNDATIONAL_GAME_IDS.every((gameId) => visitState.played.has(gameId));
    updateVisitUI();
    return satisfactionSnapshot();
  }

  function finishSatisfactionEffectsForQa() {
    skipGrowthTransfer('tree-selection');
    document.querySelectorAll('.is-selecting, .is-score-received, .is-harmony-received')
      .forEach((element) => element.classList.remove('is-selecting', 'is-score-received', 'is-harmony-received'));
    return satisfactionSnapshot();
  }

  function publishRendererQa(now, state) {
    if (!qaHostAllowed) return;
    if (state === rendererMetrics.lastQaState && now - rendererMetrics.lastQaPublishAt < 500) return;
    const sampleSeconds = Math.max(.001, (now - rendererMetrics.startedAt) / 1000);
    canvas.dataset.rendererState = state;
    canvas.dataset.rendererDrawCount = String(rendererMetrics.draws);
    canvas.dataset.rendererEffectiveFps = (rendererMetrics.draws / sampleSeconds).toFixed(2);
    canvas.dataset.rendererLastDrawMs = rendererMetrics.lastDrawMs.toFixed(2);
    rendererMetrics.lastQaState = state;
    rendererMetrics.lastQaPublishAt = now;
  }

  function frame(now) {
    rendererFrameId = 0;
    const elapsed = Math.min(.25, Math.max(0, (now - lastFrame) / 1000));
    lastFrame = now;
    pollLivingCarouselGamepads(now);
    if (!document.hidden && !activeGameId) tickGrowthTransfer(now);
    const modalOpen = document.body.classList.contains('modal-open');
    const interactionPaused = view.mobileRenderer && now < rendererState.interactionQuietUntil;
    const animationPaused = activeGameId || document.hidden || interactionPaused
      || (modalOpen && rendererState.lastRenderAt > 0);
    if (!animationPaused) {
      const renderInterval = reducedMotion ? 250 : view.frameInterval;
      const timeSinceRender = rendererState.lastRenderAt ? now - rendererState.lastRenderAt : renderInterval;
      if (timeSinceRender >= renderInterval - 1) {
        const dt = reducedMotion ? 0 : Math.min(.05, timeSinceRender / 1000);
        const drawStartedAt = performance.now();
        drawGrove(dt);
        const drawMs = performance.now() - drawStartedAt;
        rendererMetrics.draws += 1;
        rendererMetrics.lastDrawMs = drawMs;
        rendererMetrics.totalDrawMs += drawMs;
        rendererMetrics.longestDrawMs = Math.max(rendererMetrics.longestDrawMs, drawMs);
        rendererState.lastRenderAt = now;
      }
    } else {
      rendererMetrics.skipped += 1;
    }
    if (toastTimer > 0) {
      toastTimer -= elapsed;
      if (toastTimer <= 0) ui.groveToast.classList.remove('is-visible');
    }
    if (resetArmed) {
      if (Date.now() > resetTimer) {
        resetArmed = false;
        resetTimer = 0;
        ui.resetProgressButton.textContent = 'Reset all local progress';
      }
    }
    const qaState = document.hidden
      ? 'hidden'
      : activeGameId
        ? 'game-open'
        : interactionPaused
          ? 'interaction'
          : modalOpen
            ? 'modal'
            : 'rendering';
    publishRendererQa(now, qaState);
    const nextInterval = animationPaused
      ? 500
      : reducedMotion
        ? 250
        : view.frameInterval;
    const workTime = Math.max(0, performance.now() - now);
    scheduleRenderer(Math.max(4, nextInterval - workTime));
  }

  document.querySelectorAll('[data-play]').forEach((button) => {
    const card = button.closest('.game-card');
    const releaseSelection = () => {
      clearTimeout(selectionReleaseTimer);
      selectionReleaseTimer = window.setTimeout(() => card?.classList.remove('is-selecting'), 90);
    };
    button.addEventListener('pointerdown', (event) => {
      if (button.disabled) return;
      clearTimeout(selectionReleaseTimer);
      card?.classList.add('is-selecting');
      playTreeVoice(button.dataset.play, 'select');
      if (!reducedMotion && event.pointerType === 'touch' && typeof navigator.vibrate === 'function') {
        try { navigator.vibrate(8); } catch (_) { /* Haptics are optional. */ }
      }
    }, { passive: true });
    button.addEventListener('pointerup', releaseSelection, { passive: true });
    button.addEventListener('pointercancel', releaseSelection, { passive: true });
    button.addEventListener('pointerleave', releaseSelection, { passive: true });
    button.addEventListener('click', (event) => {
      if (event.detail === 0) {
        card?.classList.add('is-selecting');
        releaseSelection();
        playTreeVoice(button.dataset.play, 'select');
      }
      trialSession = null;
      openGame(button.dataset.play);
    });
  });

  ui.gameFrame.addEventListener('load', () => {
    if (activeSessionStatus() === 'awaiting-ready') {
      ui.frameLoadingCopy.textContent = 'Game document opened; waiting for its secure ready signal…';
    }
  });
  ui.returnButton.addEventListener('click', requestCloseGame);
  ui.loadingReturnButton.addEventListener('click', () => closeGame({ cancelTrial: Boolean(trialSession?.active) }));
  ui.retryGameButton.addEventListener('click', () => {
    const gameId = activeGameId;
    const modeId = activeLumenloomModeId;
    if (gameId) openGame(gameId, { modeId, growthSkipReason: 'retry' });
  });
  ui.livingCarouselTransferRetry?.addEventListener('click', () => {
    const descriptor = activeGrowthTransfer?.descriptor;
    if (!descriptor) return;
    skipGrowthTransfer('retry');
    trialSession = null;
    openGame(descriptor.gameId, {
      modeId: descriptor.modeId,
      growthSkipReason: 'retry'
    });
  });
  ui.stayInGameButton.addEventListener('click', () => {
    setOverlay(ui.returnConfirmOverlay, false);
    window.setTimeout(() => ui.gameFrame.focus({ preventScroll: true }), 80);
  });
  ui.confirmReturnButton.addEventListener('click', () => {
    setOverlay(ui.returnConfirmOverlay, false);
    closeGame({ cancelTrial: Boolean(trialSession?.active) });
  });
  ui.nextGameButton.addEventListener('click', continueTrial);
  ui.trialButton.addEventListener('click', startTrial);

  ui.growthContinueButton.addEventListener('click', completeCurrentCeremony);

  ui.trialDoneButton.addEventListener('click', () => {
    setOverlay(ui.trialResultOverlay, false);
    updateProfileUI();
    buildSaplings();
    if (ceremonyQueue.length) window.setTimeout(showNextCeremony, 100);
    else window.setTimeout(() => {
      presentPendingVisitHarmony();
      if (carouselActive && !ui.livingCarouselTrialButton.hidden) {
        ui.livingCarouselTrialButton.focus({ preventScroll: true });
      } else {
        ui.trialButton.focus({ preventScroll: true });
      }
    }, 100);
  });

  ui.settingsButton.addEventListener('click', () => {
    setOverlay(ui.settingsOverlay, true);
    setTimeout(() => ui.closeSettingsButton.focus(), 100);
  });
  ui.closeSettingsButton.addEventListener('click', () => {
    setOverlay(ui.settingsOverlay, false);
    resetArmed = false;
    ui.resetProgressButton.textContent = 'Reset all local progress';
    setTimeout(() => ui.settingsButton.focus(), 100);
  });
  ui.groveSoundButton.addEventListener('click', toggleGroveSound);
  ui.pendingRetryButton.addEventListener('click', retryPendingSave);
  ui.pendingSessionButton.addEventListener('click', continuePendingSessionOnly);
  ui.pendingReturnButton.addEventListener('click', returnPendingWithoutSaving);
  ui.resetProgressButton.addEventListener('click', resetProgress);
  ui.exportProgressButton.addEventListener('click', exportProgress);
  ui.importProgressButton.addEventListener('click', () => ui.importProgressInput.click());
  ui.importProgressInput.addEventListener('change', () => importProgressFile(ui.importProgressInput.files?.[0]));
  ui.releaseInfoButton.addEventListener('click', openReleaseInformation);
  ui.copyDiagnosticsButton.addEventListener('click', copyReleaseDiagnostics);
  ui.closeReleaseInfoButton.addEventListener('click', closeReleaseInformation);

  window.addEventListener('message', (event) => {
    if (activeLumenloomState) {
      handleV2Message(event);
      return;
    }
    const transitioned = validateMessage(event);
    if (transitioned) handleSessionTransition(transitioned);
  });

  window.addEventListener('keydown', (event) => {
    if (trapModalFocus(event)) return;
    if (event.key === 'Escape' && ui.saveRecoveryOverlay.classList.contains('is-visible')) {
      event.preventDefault();
      ui.pendingRetryButton.focus({ preventScroll: true });
    } else if (event.key === 'Escape' && ui.releaseInfoOverlay.classList.contains('is-visible')) {
      closeReleaseInformation();
    } else if (event.key === 'Escape' && ui.settingsOverlay.classList.contains('is-visible')) {
      ui.closeSettingsButton.click();
    } else if (event.key === 'Escape' && ui.returnConfirmOverlay.classList.contains('is-visible')) {
      ui.stayInGameButton.click();
    }
  });

  window.addEventListener('resize', queueCanvasResize, { passive: true });
  window.addEventListener('beforeunload', (event) => {
    if (!pendingSave) return;
    event.preventDefault();
    event.returnValue = '';
  });
  window.addEventListener('scroll', () => quietRendererFor(180), { passive: true });
  ui.groveScreen.addEventListener('pointerdown', () => quietRendererFor(140), { passive: true, capture: true });
  document.addEventListener('visibilitychange', () => {
    handleFirstBloomVisibilityChange();
    if (document.hidden) stopActiveAudioNodes();
  });
  motionQuery?.addEventListener?.('change', (event) => {
    reducedMotion = event.matches;
    rendererState.growthPulse = reducedMotion ? 0 : rendererState.growthPulse;
    if (reducedMotion && activeGrowthTransfer?.state.status === 'running') {
      const active = activeGrowthTransfer;
      const replacement = growthVisuals?.createScoreTransfer({
        gameId: active.state.gameId,
        fromTotal: active.state.displayTotal,
        toTotal: active.state.toTotal,
        startedAtMs: Math.max(0, Math.floor(performance.now())),
        persisted: true,
        deviceClass: active.state.deviceClass,
        reducedMotion: true
      });
      if (replacement) {
        active.state = replacement;
        active.lastWriteStep = -1;
        updateGrowthTransferSurface(true);
      } else failGrowthVisuals(new Error('Reduced-motion transfer adaptation failed.'), active.descriptor);
    }
    restartRenderer(true);
  });
  installFirstBloomControls();
  installLivingCarouselControls();
  startProfileStorage();
  enqueuePersistentRewards();
  buildSaplings();
  updateGroveSoundUI();
  updateProfileUI();
  resizeCanvas();
  if (pendingSave) {
    stopFirstBloom();
    setOverlay(ui.firstBloomOverlay, false);
  } else if (!syncFirstBloomVisibility({ restart: true, focus: true })) {
    window.scrollTo(0, 0);
    requestAnimationFrame(() => window.scrollTo(0, 0));
    setTimeout(() => window.scrollTo(0, 0), 120);
    if (ceremonyQueue.length) setTimeout(showNextCeremony, 180);
  }
  syncModalState();
  if (qaHostAllowed) {
    window.__MASTERY_GROVE_QA__ = Object.freeze({
      getRendererSnapshot: rendererSnapshot,
      resetRendererMetrics,
      getSatisfactionSnapshot: satisfactionSnapshot,
      previewRunFeedback: previewRunFeedbackForQa,
      setVisitState: setVisitStateForQa,
      finishSatisfactionEffects: finishSatisfactionEffectsForQa,
      treeVoices: TREE_VOICES
    });
  }
  scheduleRenderer();
})();
