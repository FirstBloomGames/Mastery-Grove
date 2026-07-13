(() => {
  'use strict';

  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';

  const $ = (id) => document.getElementById(id);
  const progression = window.MasteryGroveProgression;
  if (!progression) throw new Error('Mastery Grove progression engine did not load.');
  const STORAGE_KEY = 'first-bloom-grove-v1';
  const BACKUP_STORAGE_KEY = 'first-bloom-grove-v1-backup';
  const PROFILE_VERSION = progression.PROFILE_VERSION;
  const COLLECTION_SIZE = 10;
  const TAU = Math.PI * 2;

  const GAMES = {
    lumenloom: {
      id: 'lumenloom',
      title: 'LUMENLOOM',
      tree: 'THE LANTERN WILLOW',
      number: 'TREE 01',
      path: '../Lumenloom/index.html',
      standaloneKey: 'lumenloom-best',
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
      color: '#d7c6ff',
      symbol: '◆'
    }
  };

  const GROWTH_STAGES = progression.GROWTH_STAGES;
  const FOUNDATIONAL_GAME_IDS = progression.FOUNDATIONAL_GAME_IDS;
  const GAME_IDS = progression.ALL_GAME_IDS;
  const MAX_BLOOM_MARKS = FOUNDATIONAL_GAME_IDS.length * (GROWTH_STAGES.length - 1);

  const ui = {
    groveScreen: $('groveScreen'),
    headerRank: $('headerRank'),
    headerBloomCount: $('headerBloomCount'),
    groveRank: $('groveRank'),
    groveMessage: $('groveMessage'),
    lumenloomMastery: $('lumenloomMastery'),
    lumenloomTotal: $('lumenloomTotal'),
    lumenloomBest: $('lumenloomBest'),
    lumenloomProgress: $('lumenloomProgress'),
    bloomfoldMastery: $('bloomfoldMastery'),
    bloomfoldTotal: $('bloomfoldTotal'),
    bloomfoldBest: $('bloomfoldBest'),
    bloomfoldProgress: $('bloomfoldProgress'),
    ripplewakeMastery: $('ripplewakeMastery'),
    ripplewakeTotal: $('ripplewakeTotal'),
    ripplewakeBest: $('ripplewakeBest'),
    ripplewakeProgress: $('ripplewakeProgress'),
    prismbindCard: $('prismbindCard'),
    prismbindMastery: $('prismbindMastery'),
    prismbindTotal: $('prismbindTotal'),
    prismbindBest: $('prismbindBest'),
    prismbindProgress: $('prismbindProgress'),
    prismbindButton: $('prismbindButton'),
    prismbindButtonLabel: $('prismbindButtonLabel'),
    prismbindRequirement: $('prismbindRequirement'),
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
    growthSymbol: $('growthSymbol'),
    ceremonyKicker: $('ceremonyKicker'),
    growthTitle: $('growthTitle'),
    growthCopy: $('growthCopy'),
    growthRunLabel: $('growthRunLabel'),
    growthRunScore: $('growthRunScore'),
    growthScoreLabel: $('growthScoreLabel'),
    growthScore: $('growthScore'),
    growthMasteryLabel: $('growthMasteryLabel'),
    growthMastery: $('growthMastery'),
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
    resetProgressButton: $('resetProgressButton'),
    exportProgressButton: $('exportProgressButton'),
    importProgressButton: $('importProgressButton'),
    importProgressInput: $('importProgressInput'),
    dataManagementStatus: $('dataManagementStatus'),
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
  const view = { width: 0, height: 0, dpr: 1, time: 0 };
  const rendererState = {
    fireflies: [],
    stars: [],
    growthPulse: 0,
    growthPulseColor: '#82f4ee',
    breeze: 0
  };

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
  const motionQuery = window.matchMedia?.('(prefers-reduced-motion: reduce)');
  let reducedMotion = Boolean(motionQuery?.matches);
  let lastFrame = performance.now();

  function safeInteger(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return 0;
    return Math.min(Number.MAX_SAFE_INTEGER, Math.max(0, Math.round(number)));
  }

  function safeAdd(left, right) {
    return Math.min(Number.MAX_SAFE_INTEGER, safeInteger(left) + safeInteger(right));
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
      ? 'The Crownheart is awake. A violet path now reaches toward the next clearing.'
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

    ui.regionStatus.classList.toggle('is-revealed', profile.regions.trees05To07Revealed);
    ui.regionStatusTitle.textContent = profile.regions.trees05To07Revealed
      ? 'THE VIOLET PATH IS VISIBLE'
      : 'SLEEPING BEYOND THE CROWNHEART';
    ui.regionStatusCopy.textContent = profile.regions.trees05To07Revealed
      ? 'Trees 05–07 wait in the next clearing. Their games are still being cultivated.'
      : 'Awaken Prismbind to reveal the path toward Trees 05–07.';

    const trialReady = FOUNDATIONAL_GAME_IDS.every((gameId) => profile.games[gameId].completed);
    ui.trialButton.disabled = !trialReady;
    ui.trialLabel.textContent = trialReady
      ? profile.trialsCompleted > 0
        ? `BEST ${formatNumber(profile.trialBest)} · BEGIN AGAIN`
        : 'PLAY ALL THREE TREES BACK TO BACK'
      : 'COMPLETE ALL THREE TREES TO AWAKEN';
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
    mastery.textContent = gameId === 'prismbind' && !profile.unlocks.prismbind ? 'SLEEPING' : growth.name;
    total.textContent = formatNumber(record.totalScore);
    best.textContent = formatNumber(visibleBest);
    best.title = record.assistedBest > record.standardBest
      ? `Standard best ${formatNumber(record.standardBest)}; assisted best ${formatNumber(record.assistedBest)}`
      : `Standard-play best ${formatNumber(record.standardBest)}`;
    progressBar.style.width = `${growth.progress}%`;
    const track = progressBar.parentElement;
    track.setAttribute('aria-valuenow', String(Math.round(growth.progress)));
    track.setAttribute('aria-valuetext', growth.nextThreshold === null
      ? `${growth.name}, maximum growth`
      : `${growth.name}, ${formatNumber(growth.pointsToNext)} points to ${GROWTH_STAGES[growth.level + 1]}`);
  }

  function buildSaplings() {
    const symbols = ['◌', '⌇', '△', '≈', '◈', '∿', '○', '✧'];
    const sleepingCount = Math.max(0, COLLECTION_SIZE - GAME_IDS.length);
    const numberWords = ['Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten'];
    ui.sleepingCount.textContent = numberWords[sleepingCount] || String(sleepingCount);
    ui.saplingRow.replaceChildren();
    for (let index = 0; index < sleepingCount; index += 1) {
      const treeNumber = GAME_IDS.length + index + 1;
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

    const coarsePointer = Boolean(window.matchMedia?.('(pointer: coarse)')?.matches);
    const noHover = Boolean(window.matchMedia?.('(hover: none)')?.matches);
    const touchDevice = Number(navigator.maxTouchPoints || 0) > 0;
    const viewportLooksHandheld = Math.min(window.innerWidth, window.innerHeight) <= 600
      && Math.max(window.innerWidth, window.innerHeight) <= 1000;
    return coarsePointer || noHover || touchDevice || viewportLooksHandheld ? 'mobile' : 'desktop';
  }

  function openGame(gameId) {
    const game = GAMES[gameId];
    if (!game || !progression.isGameUnlocked(profile, gameId)) {
      showToast('That tree is still sleeping. Earn its required Mastery Seeds first.');
      return;
    }
    clearTimeout(readyTimer);
    activeGameId = gameId;
    activeSessionId = createSessionId();
    const created = progression.createSession(gameId, activeSessionId);
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
    const oldGrowth = growthFor(gameId, beforeRecord.totalScore);
    const applied = progression.applyResult(profile, result);
    if (!applied.ok) {
      showToast('The run ended, but its score did not pass Grove validation. No progress changed.');
      return;
    }
    profile = applied.profile;
    const newGrowth = growthFor(gameId);
    const growthStages = applied.rewards.filter((reward) => reward.type === 'growth-stage');
    const shouldShowRunGrowth = result.score > 0 && (!trialSession?.active || growthStages.length > 0);
    if (shouldShowRunGrowth) {
      enqueueCeremony({
        type: 'run-growth',
        gameId,
        added: result.score,
        totalScore: profile.games[gameId].totalScore,
        oldLevel: oldGrowth.level,
        newLevel: newGrowth.level,
        mastery: newGrowth.name
      });
    }
    applied.rewards.filter((reward) => reward.type !== 'growth-stage').forEach(enqueueCeremony);
    saveProfile();
    updateProfileUI();
    buildSaplings();
    rendererState.growthPulse = reducedMotion ? 0 : 1;
    rendererState.growthPulseColor = game.color;

    ui.returnButton.innerHTML = result.score > 0
      ? '<span aria-hidden="true">←</span> RETURN WITH SCORE'
      : '<span aria-hidden="true">←</span> RETURN TO GROVE';
    showToast(result.score > 0
      ? `${formatNumber(result.score)} added to ${game.tree}.`
      : `The run completed. No points took root in ${game.tree} this time.`);

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
    const seedCount = FOUNDATIONAL_GAME_IDS.filter((gameId) => profile.games[gameId].masterySeed).length;
    ui.growthSymbol.style.color = game?.color || '#d7c6ff';
    ui.growthSymbol.textContent = game?.symbol || '◆';
    ui.growthContinueButton.dataset.returnGame = ceremony.gameId || 'prismbind';

    if (ceremony.type === 'run-growth') {
      ui.ceremonyKicker.textContent = 'THE GROVE REMEMBERS';
      ui.growthTitle.textContent = ceremony.newLevel > ceremony.oldLevel
        ? `${game.tree} reached ${ceremony.mastery}.`
        : `${formatNumber(ceremony.added)} points took root.`;
      ui.growthCopy.textContent = ceremony.newLevel > ceremony.oldLevel
        ? 'Its cumulative score opened a permanent growth stage. Every completed run continues feeding this tree.'
        : `This run joined the tree’s lifetime total. ${game.tree} is closer to its next permanent form.`;
      ui.growthRunLabel.textContent = 'RUN SCORE';
      ui.growthRunScore.textContent = formatNumber(ceremony.added);
      ui.growthScoreLabel.textContent = 'TREE TOTAL';
      ui.growthScore.textContent = formatNumber(ceremony.totalScore);
      ui.growthMasteryLabel.textContent = 'GROWTH';
      ui.growthMastery.textContent = ceremony.mastery;
      return;
    }

    if (ceremony.type === 'mastery-seed') {
      ui.ceremonyKicker.textContent = 'MASTERY SEED EARNED';
      ui.growthTitle.textContent = `${game.tree} yielded its Seed.`;
      ui.growthCopy.textContent = 'Peak human-controlled skill awakened this permanent key. Accessibility assists remain content-eligible, and the Seed can never be lost.';
      ui.growthRunLabel.textContent = 'QUALIFYING BEST';
      ui.growthRunScore.textContent = formatNumber(Math.max(record.standardBest, record.assistedBest));
      ui.growthScoreLabel.textContent = 'SEED THRESHOLD';
      ui.growthScore.textContent = formatNumber(ceremony.threshold);
      ui.growthMasteryLabel.textContent = 'SEEDS HELD';
      ui.growthMastery.textContent = `${seedCount} / 3`;
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
      return;
    }

    ui.ceremonyKicker.textContent = 'THE CROWNHEART ANSWERS';
    ui.growthTitle.textContent = 'The next clearing is revealed.';
    ui.growthCopy.textContent = 'Prismbind’s Guardian has been overcome. A violet path now marks the future homes of Trees 05–07.';
    ui.growthRunLabel.textContent = 'GUARDIAN';
    ui.growthRunScore.textContent = 'AWAKENED';
    ui.growthScoreLabel.textContent = 'REGION';
    ui.growthScore.textContent = 'SECOND GROVE';
    ui.growthMasteryLabel.textContent = 'PATH';
    ui.growthMastery.textContent = 'REVEALED';
  }

  function showNextCeremony() {
    if (currentCeremony || !ceremonyQueue.length) return;
    currentCeremony = ceremonyQueue.shift();
    configureCeremony(currentCeremony);
    setOverlay(ui.growthOverlay, true);
    window.setTimeout(() => ui.growthContinueButton.focus(), 80);
  }

  function completeCurrentCeremony() {
    const ceremony = currentCeremony;
    if (!ceremony) return;
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
    if (ceremonyQueue.length) window.setTimeout(showNextCeremony, 100);
    else {
      const returnGame = ceremony.gameId || 'prismbind';
      window.setTimeout(() => {
        if (!ui.trialButton.disabled && FOUNDATIONAL_GAME_IDS.includes(returnGame)) ui.trialButton.focus();
        else document.querySelector(`[data-play="${returnGame}"]`)?.focus();
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
      showToast('This will erase Grove totals, Seeds, Trials, gallery specimens, and all four standalone bests in this browser.');
      return;
    }
    try {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(BACKUP_STORAGE_KEY);
      localStorage.removeItem('bloomfold-specimens');
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

  function showToast(message, duration = 2.3) {
    ui.groveToast.textContent = message;
    ui.groveToast.classList.add('is-visible');
    toastTimer = duration;
  }

  function syncModalState() {
    const overlays = [ui.introOverlay, ui.growthOverlay, ui.trialResultOverlay, ui.settingsOverlay, ui.returnConfirmOverlay];
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
  }

  function trapModalFocus(event) {
    if (event.key !== 'Tab') return false;
    const overlay = [ui.introOverlay, ui.growthOverlay, ui.trialResultOverlay, ui.settingsOverlay, ui.returnConfirmOverlay]
      .find((candidate) => candidate.classList.contains('is-visible'));
    if (!overlay) return false;
    const focusable = [...overlay.querySelectorAll('button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])')]
      .filter((element) => element.getClientRects().length > 0);
    if (!focusable.length) return false;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && (document.activeElement === first || !overlay.contains(document.activeElement))) {
      event.preventDefault();
      last.focus();
      return true;
    }
    if (!event.shiftKey && (document.activeElement === last || !overlay.contains(document.activeElement))) {
      event.preventDefault();
      first.focus();
      return true;
    }
    return false;
  }

  function resizeCanvas() {
    view.width = window.innerWidth;
    view.height = window.innerHeight;
    view.dpr = Math.min(window.devicePixelRatio || 1, 1.7);
    if (!ctx) return;
    canvas.width = Math.max(1, Math.floor(view.width * view.dpr));
    canvas.height = Math.max(1, Math.floor(view.height * view.dpr));
    canvas.style.width = `${view.width}px`;
    canvas.style.height = `${view.height}px`;
    seedAtmosphere();
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
    rendererState.stars = Array.from({ length: Math.min(160, Math.round(view.width * view.height / 8500)) }, () => ({
      x: random() * view.width,
      y: random() * view.height * .72,
      size: .35 + random() * 1.2,
      phase: random() * TAU
    }));
    rendererState.fireflies = Array.from({ length: 24 }, () => ({
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

    if (profile?.regions?.trees05To07Revealed) {
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
    const lumenGrowth = growthFor('lumenloom');
    const bloomGrowth = growthFor('bloomfold');
    const rippleGrowth = growthFor('ripplewake');
    const lumenLevel = lumenGrowth.level;
    const bloomLevel = bloomGrowth.level;
    const rippleLevel = rippleGrowth.level;
    const marks = combinedMarks();
    const overallGrowth = (lumenGrowth.progress + bloomGrowth.progress + rippleGrowth.progress) / (GAME_IDS.length * 100);
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
    ctx.shadowBlur = 12 + overallGrowth * 20;
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
    drawGuardianCrown(centerX, trunkTopY - scale * .012, scale);
    ctx.restore();
  }

  function drawGuardianCrown(x, y, scale) {
    const unlocked = Boolean(profile?.unlocks?.tree04);
    const awakened = Boolean(profile?.regions?.secondGroveUnlocked);
    if (!unlocked && combinedMarks() < 10) return;

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
      ctx.shadowBlur = awakened ? 14 : 7;
      ctx.beginPath();
      ctx.ellipse(0, 0, radius * 1.55, radius * .48, index * .34, 0, TAU);
      ctx.stroke();
      ctx.restore();
    }

    ctx.rotate(Math.PI / 4);
    ctx.fillStyle = awakened ? '#eee7ff' : 'rgba(215,198,255,.72)';
    ctx.shadowColor = '#b89aff';
    ctx.shadowBlur = awakened ? 26 : 12;
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
    ctx.shadowBlur = growth > .7 ? 4 : 0;
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
      ctx.shadowBlur = 11 + level * 2;
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
      ctx.shadowBlur = 9;
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
    ctx.shadowBlur = 18;
    ctx.beginPath();
    ctx.arc(view.width * .5, view.height * .62, radius, 0, TAU);
    ctx.stroke();
    ctx.restore();
  }

  function frame(now) {
    const elapsed = Math.min(.25, Math.max(0, (now - lastFrame) / 1000));
    const dt = reducedMotion ? 0 : Math.min(.033, elapsed);
    lastFrame = now;
    if (!activeGameId) drawGrove(dt);
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
    if (reducedMotion) window.setTimeout(() => requestAnimationFrame(frame), 250);
    else requestAnimationFrame(frame);
  }

  document.querySelectorAll('[data-play]').forEach((button) => {
    button.addEventListener('click', () => {
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
  ui.resetProgressButton.addEventListener('click', resetProgress);
  ui.exportProgressButton.addEventListener('click', exportProgress);
  ui.importProgressButton.addEventListener('click', () => ui.importProgressInput.click());
  ui.importProgressInput.addEventListener('change', () => importProgressFile(ui.importProgressInput.files?.[0]));

  window.addEventListener('message', (event) => {
    const transitioned = validateMessage(event);
    if (transitioned) handleSessionTransition(transitioned);
  });

  window.addEventListener('keydown', (event) => {
    if (trapModalFocus(event)) return;
    if (event.key === 'Escape' && ui.settingsOverlay.classList.contains('is-visible')) {
      ui.closeSettingsButton.click();
    } else if (event.key === 'Escape' && ui.returnConfirmOverlay.classList.contains('is-visible')) {
      ui.stayInGameButton.click();
    }
  });

  window.addEventListener('resize', resizeCanvas);
  motionQuery?.addEventListener?.('change', (event) => {
    reducedMotion = event.matches;
    rendererState.growthPulse = reducedMotion ? 0 : rendererState.growthPulse;
    lastFrame = performance.now();
    if (!activeGameId) drawGrove(0);
  });
  saveProfile({ timestamp: false });
  enqueuePersistentRewards();
  buildSaplings();
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
  requestAnimationFrame(frame);
})();
