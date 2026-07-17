(() => {
  'use strict';

  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';

  const $ = (id) => document.getElementById(id);
  const progression = window.MasteryGroveProgression;
  if (!progression) throw new Error('Mastery Grove progression engine did not load.');
  const STORAGE_KEY = 'first-bloom-grove-v1';
  const BACKUP_STORAGE_KEY = 'first-bloom-grove-v1-backup';
  const GROVE_SOUND_KEY = 'first-bloom-grove-audio-v1';
  const PROFILE_VERSION = progression.PROFILE_VERSION;
  const COLLECTION_SIZE = 10;
  const TAU = Math.PI * 2;
  const SCORE_COUNT_DURATION_MS = 680;
  const SCORE_COUNT_MAX_WRITES = 20;
  const SCORE_MOTE_CAP_DESKTOP = 10;
  const SCORE_MOTE_CAP_MOBILE = 6;
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
    introOverlay: $('introOverlay'),
    enterGroveButton: $('enterGroveButton'),
    growthOverlay: $('growthOverlay'),
    growthPanel: $('growthPanel'),
    scoreStream: $('scoreStream'),
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
  let storageNotice = '';
  let profile = loadProfile();
  let activeGameId = null;
  let activeSession = null;
  let activeSessionId = null;
  let readyTimer = 0;
  let ceremonyQueue = [];
  let currentCeremony = null;
  let trialSession = null;
  let toastTimer = 0;
  let resetArmed = false;
  let resetTimer = 0;
  let scoreCounterFrame = 0;
  let scoreStreamTimer = 0;
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

  function clearScorePresentation(finalValue) {
    if (scoreCounterFrame) cancelAnimationFrame(scoreCounterFrame);
    scoreCounterFrame = 0;
    clearTimeout(scoreStreamTimer);
    scoreStreamTimer = 0;
    ui.scoreStream?.replaceChildren();
    if (finalValue !== undefined && ui.growthScore) ui.growthScore.textContent = formatNumber(finalValue);
  }

  function startScorePresentation(ceremony) {
    clearScorePresentation();
    const previousTotal = safeInteger(ceremony.previousTotal);
    const totalScore = safeInteger(ceremony.totalScore);
    ui.growthScore.setAttribute('aria-label', `Updated tree total ${formatNumber(totalScore)}`);
    if (reducedMotion || previousTotal === totalScore) {
      ui.growthScore.textContent = formatNumber(totalScore);
      return;
    }

    const moteCount = isLikelyMobileRenderer() ? SCORE_MOTE_CAP_MOBILE : SCORE_MOTE_CAP_DESKTOP;
    const offsets = [-54, 38, -22, 62, 8, -70, 48, -36, 76, 20];
    for (let index = 0; index < moteCount; index += 1) {
      const mote = document.createElement('i');
      mote.style.setProperty('--start-x', `${offsets[index]}px`);
      mote.style.setProperty('--delay', `${index * 42}ms`);
      ui.scoreStream.appendChild(mote);
    }
    scoreStreamTimer = window.setTimeout(() => ui.scoreStream.replaceChildren(), 1100);

    const startedAt = performance.now();
    let lastWrite = -1;
    const tick = (now) => {
      const progressValue = Math.min(1, Math.max(0, (now - startedAt) / SCORE_COUNT_DURATION_MS));
      const eased = 1 - Math.pow(1 - progressValue, 3);
      const writeIndex = Math.min(SCORE_COUNT_MAX_WRITES, Math.floor(progressValue * SCORE_COUNT_MAX_WRITES));
      if (writeIndex !== lastWrite) {
        lastWrite = writeIndex;
        ui.growthScore.textContent = formatNumber(previousTotal + Math.round((totalScore - previousTotal) * eased));
      }
      if (progressValue < 1) scoreCounterFrame = requestAnimationFrame(tick);
      else {
        scoreCounterFrame = 0;
        ui.growthScore.textContent = formatNumber(totalScore);
      }
    };
    ui.growthScore.textContent = formatNumber(previousTotal);
    scoreCounterFrame = requestAnimationFrame(tick);
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

  function loadProfile() {
    let source = null;
    let sourceText = null;
    let backupText = null;
    const standaloneBests = {};
    try {
      const probeKey = `${STORAGE_KEY}-probe`;
      localStorage.setItem(probeKey, '1');
      localStorage.removeItem(probeKey);
      sourceText = localStorage.getItem(STORAGE_KEY);
      backupText = localStorage.getItem(BACKUP_STORAGE_KEY);
      for (const game of Object.values(GAMES)) {
        if (!game.importStandaloneBest) continue;
        const value = Number(localStorage.getItem(game.standaloneKey));
        if (Number.isSafeInteger(value) && value >= 0) standaloneBests[game.id] = value;
      }
    } catch (_) {
      storageAvailable = false;
      storageNotice = 'This browser blocked local saves. This session will still play, but progress will be lost when it closes.';
    }

    if (sourceText) {
      try { source = JSON.parse(sourceText); }
      catch (_) {
        storageRecovered = true;
        storageNotice = 'The newest save was damaged. The Grove is attempting to recover its previous safe copy.';
      }
    }

    let migrated = progression.migrateProfile(source, standaloneBests);
    if (!migrated.ok && migrated.code === 'future-profile') {
      storageReadOnly = true;
      storageNotice = `This save belongs to a newer Grove (profile v${migrated.sourceVersion}). It has been preserved without changes.`;
    }
    if ((!migrated.ok || storageRecovered) && backupText) {
      try {
        const recovered = progression.migrateProfile(JSON.parse(backupText), standaloneBests);
        if (recovered.ok) {
          migrated = recovered;
          storageRecovered = true;
          if (!storageReadOnly) storageNotice = 'The previous safe copy was recovered. Export a backup before continuing.';
        }
      } catch (_) { /* A damaged recovery slot is ignored. */ }
    }
    if (!migrated.ok) migrated = progression.migrateProfile(null, standaloneBests);
    return migrated.profile;
  }

  function cloneProfile(source = profile) {
    return JSON.parse(JSON.stringify(source));
  }

  function canonicalizeProfile(draft) {
    const migrated = progression.migrateProfile(draft);
    if (!migrated.ok) throw new Error(`Could not canonicalize profile: ${migrated.code}`);
    return migrated.profile;
  }

  function updateProfile(mutator, options = {}) {
    const draft = cloneProfile();
    mutator(draft);
    if (options.timestamp !== false) draft.updatedAt = new Date().toISOString();
    profile = canonicalizeProfile(draft);
    return profile;
  }

  function saveProfile(options = {}) {
    if (options.timestamp !== false) {
      const draft = cloneProfile();
      draft.updatedAt = new Date().toISOString();
      profile = canonicalizeProfile(draft);
    }
    if (!storageAvailable || storageReadOnly) {
      if (ui.profileStatus) ui.profileStatus.textContent = storageReadOnly
        ? 'NEWER SAVE PRESERVED · SESSION ONLY'
        : 'SESSION PROFILE · STORAGE UNAVAILABLE';
      updateStorageWarning();
      return false;
    }
    try {
      const previous = localStorage.getItem(STORAGE_KEY);
      if (previous) {
        try {
          const parsed = JSON.parse(previous);
          if (Number.isInteger(parsed?.version) && parsed.version <= PROFILE_VERSION) {
            localStorage.setItem(BACKUP_STORAGE_KEY, previous);
          }
        } catch (_) { /* Never promote a damaged save into the recovery slot. */ }
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
      if (ui.profileStatus) ui.profileStatus.textContent = 'LOCAL KEEPER PROFILE · SAVED';
      return true;
    } catch (_) {
      storageAvailable = false;
      storageNotice = 'This browser stopped accepting local saves. Export your profile before leaving.';
      if (ui.profileStatus) ui.profileStatus.textContent = 'SESSION PROFILE · STORAGE UNAVAILABLE';
      updateStorageWarning();
      return false;
    }
  }

  function updateStorageWarning() {
    if (!ui.storageWarning) return;
    const directFile = location.protocol === 'file:';
    const visible = directFile || !storageAvailable || storageReadOnly || storageRecovered;
    ui.storageWarning.classList.toggle('is-hidden', !visible);
    if (!visible) return;
    ui.storageWarningText.textContent = storageNotice || (directFile
      ? 'Direct-file saves vary by browser. Use PLAY MASTERY GROVE.cmd for one stable local save origin.'
      : 'Export a profile backup before clearing browser data or changing devices.');
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

  function openGame(gameId) {
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
    const created = progression.createSession(gameId, activeSessionId, profile);
    if (!created.ok) {
      showToast('The tree could not create a safe play session. Please try again.');
      activeGameId = null;
      return;
    }
    activeSession = created.session;
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
    if (gameId === 'lumenloom') gameParams.set('profile', lumenloomPlatformProfile());
    ui.gameFrame.src = `${game.path}?${gameParams}`;
    syncModalState();
    const expectedSession = activeSessionId;
    readyTimer = window.setTimeout(() => {
      if (activeSessionId !== expectedSession || activeSession?.status !== 'awaiting-ready') return;
      ui.frameLoadingTitle.textContent = 'THE TREE DID NOT ANSWER';
      ui.frameLoadingCopy.textContent = 'The game may have been moved or blocked. Retry it, or return without losing prior progress.';
      ui.frameLoadingActions.classList.remove('is-hidden');
      announce('The game did not finish loading. Retry and Return to Grove controls are available.');
      ui.retryGameButton.focus();
    }, 12000);
    window.setTimeout(() => ui.returnButton.focus(), 80);
  }

  function requestCloseGame() {
    if (activeSession?.status === 'running') {
      setOverlay(ui.returnConfirmOverlay, true);
      window.setTimeout(() => ui.stayInGameButton.focus(), 80);
      return;
    }
    closeGame({ cancelTrial: Boolean(trialSession?.active) });
  }

  function closeGame(options = {}) {
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
    activeSessionId = null;
    restartRenderer(true);

    if (options.cancelTrial && trialSession?.active) {
      trialSession = null;
      showToast('The Grove Trial was set aside. Completed tree scores remain safe.');
    }

    updateProfileUI();
    buildSaplings();
    syncModalState();
    window.scrollTo(0, 0);
    if (!options.suppressCeremonies && ceremonyQueue.length) {
      window.setTimeout(showNextCeremony, 120);
    } else if (!options.suppressFocus) {
      window.setTimeout(() => document.querySelector(`[data-play="${returningGame || 'lumenloom'}"]`)?.focus(), 100);
    }
  }

  function validateMessage(event) {
    if (!activeGameId || !activeSession || event.source !== ui.gameFrame.contentWindow) return null;
    if (location.protocol === 'file:') {
      if (event.origin && event.origin !== 'null') return null;
    } else if (event.origin !== location.origin) return null;
    if (trialSession?.active && activeSession.status === 'completed' && event.data?.type === 'run-start') return null;
    const transitioned = progression.transitionSession(activeSession, event.data);
    return transitioned.ok ? transitioned : null;
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
    profile = applied.profile;
    saveProfile();
    const newGrowth = growthFor(gameId);
    const nextReward = progression.nextRewardFor(profile, gameId);
    const growthStages = applied.rewards.filter((reward) => reward.type === 'growth-stage');
    const shouldShowRunGrowth = result.score > 0 && (!trialSession?.active || growthStages.length > 0);
    const harmonyAwakened = recordVisitCompletion(gameId, feedback);
    if (shouldShowRunGrowth) {
      enqueueCeremony({
        type: 'run-growth',
        gameId,
        added: result.score,
        previousTotal,
        totalScore: profile.games[gameId].totalScore,
        oldLevel: oldGrowth.level,
        newLevel: newGrowth.level,
        mastery: newGrowth.name,
        nextReward,
        priorBest: feedback?.priorBest || 0,
        isPersonalBest: Boolean(feedback?.isPersonalBest),
        matchedBest: Boolean(feedback?.matchedBest),
        nearBest: Boolean(feedback?.nearBest),
        gap: feedback?.gap || 0,
        lane: feedback?.lane || (result.assisted ? 'assisted' : 'standard')
      });
    }
    applied.rewards
      .filter((reward) => reward.type !== 'growth-stage')
      .forEach((reward) => enqueueCeremony({ ...reward, sourceGameId: gameId }));
    if (harmonyAwakened) enqueueCeremony({ type: 'session-harmony', sourceGameId: gameId });
    updateProfileUI();
    buildSaplings();
    rendererState.growthPulse = reducedMotion ? 0 : 1;
    rendererState.growthPulseColor = game.color;

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
    showToast(resultToast);

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
    clearScorePresentation();
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

    if (ceremony.type === 'run-growth') {
      const laneLabel = ceremony.lane === 'assisted' ? 'ASSISTED' : 'STANDARD';
      let outcome = 'POINTS TOOK ROOT';
      if (ceremony.isPersonalBest) outcome = ceremony.priorBest > 0
        ? `NEW ${laneLabel} PERSONAL BEST · +${formatNumber(ceremony.added - ceremony.priorBest)}`
        : `FIRST ${laneLabel} PERSONAL BEST`;
      else if (ceremony.matchedBest) outcome = `MATCHED ${laneLabel} PERSONAL BEST`;
      else if (ceremony.nearBest) outcome = `NEAR BEST · ${formatNumber(ceremony.gap)} AWAY`;
      ui.growthPanel.classList.toggle('is-personal-best', ceremony.isPersonalBest);
      ui.growthPanel.classList.toggle('is-near-best', ceremony.nearBest);
      ui.growthOutcome.classList.remove('is-hidden');
      ui.growthOutcome.textContent = outcome;
      ui.ceremonyKicker.textContent = ceremony.isPersonalBest ? 'THE TREE REMEMBERS YOUR BEST' : 'THE GROVE REMEMBERS';
      ui.growthTitle.textContent = ceremony.newLevel > ceremony.oldLevel
        ? `${game.tree} reached ${ceremony.mastery}.`
        : ceremony.isPersonalBest
          ? `${game.tree} remembers a new best.`
        : `${formatNumber(ceremony.added)} points took root.`;
      ui.growthCopy.textContent = ceremony.newLevel > ceremony.oldLevel
        ? 'Its cumulative score opened a permanent growth stage. Every completed run continues feeding this tree.'
        : ceremony.nearBest
          ? `This run joined the lifetime total and came within ${formatNumber(ceremony.gap)} of your ${ceremony.lane} best.`
          : `This run joined the tree’s lifetime total. ${game.tree} is closer to its next permanent form.`;
      ui.growthRunLabel.textContent = 'RUN SCORE';
      ui.growthRunScore.textContent = formatNumber(ceremony.added);
      ui.growthScoreLabel.textContent = 'TREE TOTAL';
      ui.growthScore.textContent = formatNumber(ceremony.previousTotal);
      ui.growthMasteryLabel.textContent = 'GROWTH';
      ui.growthMastery.textContent = ceremony.mastery;
      ui.growthNextReward.textContent = [ceremony.nextReward?.growthLabel, ceremony.nextReward?.skillLabel].filter(Boolean).join(' · ') || 'KEEP GROWING';
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
    if (currentCeremony || !ceremonyQueue.length) return;
    currentCeremony = ceremonyQueue.shift();
    configureCeremony(currentCeremony);
    setOverlay(ui.growthOverlay, true);
    if (currentCeremony.type === 'run-growth') {
      startScorePresentation(currentCeremony);
      const outcome = ui.growthOutcome.textContent ? ` ${ui.growthOutcome.textContent}.` : '';
      announce(`${GAMES[currentCeremony.gameId].title} run score ${formatNumber(currentCeremony.added)}. Updated tree total ${formatNumber(currentCeremony.totalScore)}.${outcome}`);
    } else announce(`${ui.ceremonyKicker.textContent}. ${ui.growthTitle.textContent}`);
    window.setTimeout(() => ui.growthContinueButton.focus(), 80);
  }

  function completeCurrentCeremony() {
    const ceremony = currentCeremony;
    if (!ceremony) return;
    clearScorePresentation(ceremony.type === 'run-growth' ? ceremony.totalScore : undefined);
    if (ceremony.ceremonyKey) {
      const acknowledged = progression.acknowledgeCeremony(profile, ceremony.ceremonyKey);
      if (acknowledged.ok) {
        profile = acknowledged.profile;
        saveProfile();
      }
    }
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
      window.setTimeout(() => {
        document.querySelector(`[data-play="${returnGame}"]`)?.focus();
      }, 100);
    }
  }

  function startTrial() {
    if (ui.trialButton.disabled) return;
    trialSession = {
      active: true,
      index: 0,
      order: [...FOUNDATIONAL_GAME_IDS],
      scores: {}
    };
    openGame(trialSession.order[0]);
  }

  function continueTrial() {
    if (!trialSession?.active || activeSession?.status !== 'completed') return;
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
    updateProfile((draft) => {
      draft.trialBest = Math.max(draft.trialBest, scored.combined);
      draft.trialsCompleted = safeAdd(draft.trialsCompleted, 1);
    });
    saveProfile({ timestamp: false });
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
    const now = Date.now();
    if (!resetArmed || now > resetTimer) {
      resetArmed = true;
      resetTimer = now + 8000;
      ui.resetProgressButton.textContent = 'Click again to confirm reset';
      showToast('This will erase Grove totals, Seeds, Trials, gallery specimens, and all five standalone bests in this browser.');
      return;
    }
    try {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(BACKUP_STORAGE_KEY);
      localStorage.removeItem('bloomfold-specimens');
      localStorage.removeItem('mothchorus-playtest-v1');
      Object.values(GAMES).forEach((game) => localStorage.removeItem(game.standaloneKey));
      storageAvailable = true;
      storageReadOnly = false;
      storageRecovered = false;
      storageNotice = '';
    } catch (_) {
      storageAvailable = false;
      storageNotice = 'The browser blocked part of the reset. This session was reset, but stored data may remain.';
    }
    profile = defaultProfile();
    updateProfile((draft) => { draft.introSeen = true; });
    saveProfile({ timestamp: false });
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
    showToast('The clearing is quiet again. All three foundational trees remain playable.');
    window.setTimeout(() => ui.settingsButton.focus(), 100);
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
      profile = validated.profile;
      saveProfile();
      try { localStorage.setItem('bloomfold-specimens', JSON.stringify(specimens)); }
      catch (_) { /* The core profile may still have imported successfully. */ }
      ceremonyQueue = [];
      currentCeremony = null;
      resetVisitState();
      clearScorePresentation();
      enqueuePersistentRewards();
      updateProfileUI();
      buildSaplings();
      rendererState.growthPulse = reducedMotion ? 0 : .8;
      ui.dataManagementStatus.textContent = 'Backup imported and validated. The Grove has been refreshed.';
      announce('Progress backup imported and validated.');
    } catch (_) {
      ui.dataManagementStatus.textContent = 'Import failed: choose an unmodified First Bloom Grove backup.';
    } finally {
      ui.importProgressInput.value = '';
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
    window.setTimeout(() => ui.releaseInfoButton.focus({ preventScroll: true }), 100);
  }

  function showToast(message, duration = 2.3) {
    ui.groveToast.textContent = message;
    ui.groveToast.classList.add('is-visible');
    toastTimer = duration;
  }

  function syncModalState() {
    const overlays = [ui.introOverlay, ui.growthOverlay, ui.trialResultOverlay, ui.settingsOverlay, ui.releaseInfoOverlay, ui.returnConfirmOverlay];
    const modalOpen = overlays.some((overlay) => overlay.classList.contains('is-visible'));
    const gameOpen = !ui.gameShell.classList.contains('is-hidden');
    ui.groveScreen.inert = modalOpen || gameOpen;
    ui.gameShell.inert = modalOpen;
    document.body.classList.toggle('modal-open', modalOpen);
    ui.groveScreen.setAttribute('aria-hidden', String(modalOpen || gameOpen));
    ui.gameShell.setAttribute('aria-hidden', String(!gameOpen || modalOpen));
  }

  function setOverlay(overlay, visible) {
    overlay.classList.toggle('is-visible', visible);
    overlay.setAttribute('aria-hidden', String(!visible));
    overlay.inert = !visible;
    syncModalState();
    restartRenderer(!visible);
  }

  function trapModalFocus(event) {
    if (event.key !== 'Tab') return false;
    const overlay = [ui.introOverlay, ui.growthOverlay, ui.trialResultOverlay, ui.settingsOverlay, ui.releaseInfoOverlay, ui.returnConfirmOverlay]
      .find((candidate) => candidate.classList.contains('is-visible'));
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
      if (resizeCanvas()) restartRenderer(true);
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
      scoreMoteCount: ui.scoreStream?.childElementCount || 0,
      scoreCountActive: Boolean(scoreCounterFrame),
      scoreCountDurationMs: SCORE_COUNT_DURATION_MS,
      scoreCountMaxWrites: SCORE_COUNT_MAX_WRITES,
      moteCaps: Object.freeze({ desktop: SCORE_MOTE_CAP_DESKTOP, mobile: SCORE_MOTE_CAP_MOBILE, reducedMotion: 0 }),
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
    clearScorePresentation(currentCeremony?.type === 'run-growth' ? currentCeremony.totalScore : undefined);
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
    if (activeSession?.status === 'awaiting-ready') ui.frameLoadingCopy.textContent = 'Game document opened; waiting for its secure ready signal…';
  });
  ui.returnButton.addEventListener('click', requestCloseGame);
  ui.loadingReturnButton.addEventListener('click', () => closeGame({ cancelTrial: Boolean(trialSession?.active) }));
  ui.retryGameButton.addEventListener('click', () => {
    const gameId = activeGameId;
    if (gameId) openGame(gameId);
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

  ui.enterGroveButton.addEventListener('click', () => {
    updateProfile((draft) => { draft.introSeen = true; });
    saveProfile({ timestamp: false });
    ui.enterGroveButton.blur();
    setOverlay(ui.introOverlay, false);
    rendererState.growthPulse = reducedMotion ? 0 : .7;
    window.scrollTo(0, 0);
    requestAnimationFrame(() => window.scrollTo(0, 0));
    setTimeout(() => {
      if (ceremonyQueue.length) showNextCeremony();
      else document.querySelector('[data-play="lumenloom"]')?.focus({ preventScroll: true });
      window.scrollTo(0, 0);
    }, 100);
  });

  ui.growthContinueButton.addEventListener('click', completeCurrentCeremony);

  ui.trialDoneButton.addEventListener('click', () => {
    setOverlay(ui.trialResultOverlay, false);
    updateProfileUI();
    buildSaplings();
    if (ceremonyQueue.length) window.setTimeout(showNextCeremony, 100);
    else window.setTimeout(() => ui.trialButton.focus(), 100);
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
  ui.resetProgressButton.addEventListener('click', resetProgress);
  ui.exportProgressButton.addEventListener('click', exportProgress);
  ui.importProgressButton.addEventListener('click', () => ui.importProgressInput.click());
  ui.importProgressInput.addEventListener('change', () => importProgressFile(ui.importProgressInput.files?.[0]));
  ui.releaseInfoButton.addEventListener('click', openReleaseInformation);
  ui.copyDiagnosticsButton.addEventListener('click', copyReleaseDiagnostics);
  ui.closeReleaseInfoButton.addEventListener('click', closeReleaseInformation);

  window.addEventListener('message', (event) => {
    const transitioned = validateMessage(event);
    if (transitioned) handleSessionTransition(transitioned);
  });

  window.addEventListener('keydown', (event) => {
    if (trapModalFocus(event)) return;
    if (event.key === 'Escape' && ui.releaseInfoOverlay.classList.contains('is-visible')) {
      closeReleaseInformation();
    } else if (event.key === 'Escape' && ui.settingsOverlay.classList.contains('is-visible')) {
      ui.closeSettingsButton.click();
    } else if (event.key === 'Escape' && ui.returnConfirmOverlay.classList.contains('is-visible')) {
      ui.stayInGameButton.click();
    }
  });

  window.addEventListener('resize', queueCanvasResize, { passive: true });
  window.addEventListener('scroll', () => quietRendererFor(180), { passive: true });
  ui.groveScreen.addEventListener('pointerdown', () => quietRendererFor(140), { passive: true, capture: true });
  document.addEventListener('visibilitychange', () => restartRenderer(!document.hidden));
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stopActiveAudioNodes();
  });
  motionQuery?.addEventListener?.('change', (event) => {
    reducedMotion = event.matches;
    rendererState.growthPulse = reducedMotion ? 0 : rendererState.growthPulse;
    if (reducedMotion && currentCeremony?.type === 'run-growth') clearScorePresentation(currentCeremony.totalScore);
    restartRenderer(true);
  });
  saveProfile({ timestamp: false });
  enqueuePersistentRewards();
  buildSaplings();
  updateGroveSoundUI();
  updateProfileUI();
  resizeCanvas();
  if (profile.introSeen) {
    setOverlay(ui.introOverlay, false);
    window.scrollTo(0, 0);
    requestAnimationFrame(() => window.scrollTo(0, 0));
    setTimeout(() => window.scrollTo(0, 0), 120);
    if (ceremonyQueue.length) setTimeout(showNextCeremony, 180);
  }
  else setTimeout(() => ui.enterGroveButton.focus(), 100);
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
