(function initializeLumenloomGroveProtocolV2(root, factory) {
  "use strict";

  const protocol = typeof module === "object" && module.exports
    ? require("../MasteryGrove/protocol-v2.js")
    : root.FirstBloomProtocolV2;
  const modeRules = typeof module === "object" && module.exports
    ? require("./modes.js")
    : root.LumenloomModes;
  const bridge = factory(protocol, modeRules, root);
  if (typeof module === "object" && module.exports) module.exports = bridge;
  else root.LumenloomGroveProtocolV2 = bridge;
})(typeof globalThis !== "undefined" ? globalThis : this, function createLumenloomGroveProtocolV2(
  protocol,
  modeRules,
  runtimeRoot
) {
  "use strict";

  if (!protocol
    || protocol.VERSION !== 2
    || typeof protocol.validateParentMessage !== "function"
    || !Array.isArray(protocol.REASONS)
    || !Array.isArray(protocol.ACTIONS)
    || !modeRules
    || typeof modeRules.getMode !== "function"
    || typeof modeRules.validateStats !== "function"
    || typeof modeRules.recomputeResult !== "function") {
    throw new Error("The Lumenloom Grove bridge requires the shared protocol-v2 and mode canon.");
  }

  function deepFreeze(value) {
    const freezeable = value && (typeof value === "object" || typeof value === "function");
    if (!freezeable || Object.isFrozen(value)) return value;
    Object.values(value).forEach(deepFreeze);
    return Object.freeze(value);
  }

  function isPlainObject(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  }

  function hasExactKeys(value, expectedKeys) {
    if (!isPlainObject(value)) return false;
    const actual = Object.keys(value).sort();
    const expected = [...expectedKeys].sort();
    return actual.length === expected.length
      && actual.every((key, index) => key === expected[index]);
  }

  function isToken(value, minimumLength = 4) {
    return typeof value === "string"
      && value.length >= minimumLength
      && value.length <= 128
      && /^[A-Za-z0-9._:-]+$/.test(value);
  }

  function isCounter(value) {
    return Number.isSafeInteger(value) && value >= 0;
  }

  const CONTEXT_KEYS = Object.freeze([
    "kind",
    "hosted",
    "version",
    "gameId",
    "modeId",
    "sessionId",
    "trial",
    "reason"
  ]);
  const STATE_KEYS = Object.freeze([
    "version",
    "context",
    "phase",
    "runId",
    "recording",
    "result",
    "pendingAction",
    "actionOrigin",
    "lastRejection"
  ]);
  const RESULT_KEYS = Object.freeze(["score", "victory"]);
  const PHASES = Object.freeze([
    "invalid",
    "standalone",
    "boot",
    "ready",
    "awaiting-start",
    "running",
    "saving",
    "pending",
    "saved",
    "unsaved",
    "awaiting-action",
    "closed"
  ]);
  const CLIENT_ACTIONS = deepFreeze({
    READY_SENT: "ready-sent",
    START_REQUESTED: "start-requested",
    RUN_FINISHED: "run-finished",
    SESSION_ACTION_REQUESTED: "session-action-requested",
    PARENT_MESSAGE: "parent-message"
  });

  function contextRecord(kind, fields = {}) {
    const hosted = kind === "hosted";
    return deepFreeze({
      kind,
      hosted,
      version: protocol.VERSION,
      gameId: hosted ? protocol.GAME_ID : null,
      modeId: hosted ? fields.modeId : null,
      sessionId: hosted ? fields.sessionId : null,
      trial: hosted ? fields.trial : false,
      reason: kind === "invalid" ? fields.reason || "invalid-context" : null
    });
  }

  function standaloneContext() {
    return contextRecord("standalone");
  }

  function invalidContext(reason = "invalid-context") {
    return contextRecord("invalid", { reason });
  }

  function parseContext(search, embedded = false) {
    if (typeof embedded !== "boolean" || typeof search !== "string") {
      return invalidContext();
    }
    if (!embedded) return standaloneContext();

    let params;
    try {
      params = new URLSearchParams(search);
    } catch (_) {
      return invalidContext();
    }

    const groveValues = params.getAll("grove");
    if (groveValues.length === 0) return standaloneContext();

    const sessionValues = params.getAll("session");
    const modeValues = params.getAll("mode");
    const trialValues = params.getAll("trial");
    const protocolValues = params.getAll("protocol");
    if (groveValues.length !== 1
      || groveValues[0] !== "1"
      || sessionValues.length !== 1
      || modeValues.length !== 1
      || trialValues.length !== 1
      || protocolValues.length !== 1
      || protocolValues[0] !== String(protocol.VERSION)) {
      return invalidContext();
    }

    const sessionId = sessionValues[0];
    const modeId = modeValues[0];
    const trialToken = trialValues[0];
    if (!isToken(sessionId, 8)
      || !modeRules.getMode(modeId)
      || !["0", "1"].includes(trialToken)) {
      return invalidContext();
    }
    const trial = trialToken === "1";
    if (trial && modeId !== "standard") return invalidContext("trial-mode-mismatch");
    return contextRecord("hosted", { sessionId, modeId, trial });
  }

  function isContext(context) {
    if (!hasExactKeys(context, CONTEXT_KEYS)
      || context.version !== protocol.VERSION
      || !["invalid", "standalone", "hosted"].includes(context.kind)
      || context.hosted !== (context.kind === "hosted")
      || typeof context.trial !== "boolean") {
      return false;
    }
    if (context.kind === "hosted") {
      return context.gameId === protocol.GAME_ID
        && Boolean(modeRules.getMode(context.modeId))
        && isToken(context.sessionId, 8)
        && context.reason === null
        && (!context.trial || context.modeId === "standard");
    }
    return context.gameId === null
      && context.modeId === null
      && context.sessionId === null
      && context.trial === false
      && (context.kind === "invalid"
        ? typeof context.reason === "string" && context.reason.length > 0
        : context.reason === null);
  }

  let fallbackRunSequence = 0;

  function createRunId(options = {}) {
    const settings = isPlainObject(options) ? options : {};
    const hasCryptoOverride = Object.prototype.hasOwnProperty.call(settings, "crypto");
    const cryptoSource = hasCryptoOverride ? settings.crypto : runtimeRoot?.crypto;
    if (cryptoSource && typeof cryptoSource.getRandomValues === "function") {
      try {
        const words = new Uint32Array(4);
        cryptoSource.getRandomValues(words);
        const entropy = [...words].map((word) => word.toString(16).padStart(8, "0")).join("");
        return `loom-${entropy}`;
      } catch (_) {
        // Privacy-restricted files and old webviews may expose a throwing crypto shim.
      }
    }

    fallbackRunSequence += 1;
    const nowSource = typeof settings.now === "function" ? settings.now : Date.now;
    const randomSource = typeof settings.random === "function" ? settings.random : Math.random;
    const rawNow = Number(nowSource());
    const now = Number.isFinite(rawNow) && rawNow >= 0 ? Math.floor(rawNow) : Date.now();
    const rawRandom = Number(randomSource());
    const boundedRandom = Number.isFinite(rawRandom)
      ? Math.max(0, Math.min(0.9999999999999999, rawRandom))
      : Math.random();
    const randomWord = Math.floor(boundedRandom * 0x100000000).toString(36);
    const scope = isToken(settings.scope || "", 4)
      ? settings.scope.slice(0, 32)
      : "session";
    return `loom-f-${scope}-${now.toString(36)}-${fallbackRunSequence.toString(36)}-${randomWord}`;
  }

  function resultRecord(score, victory) {
    return deepFreeze({ score, victory });
  }

  function isResult(result) {
    return hasExactKeys(result, RESULT_KEYS)
      && isCounter(result.score)
      && typeof result.victory === "boolean";
  }

  function stateRecord(context, phase, fields = {}) {
    return deepFreeze({
      version: protocol.VERSION,
      context,
      phase,
      runId: fields.runId ?? null,
      recording: fields.recording ?? null,
      result: fields.result ?? null,
      pendingAction: fields.pendingAction ?? null,
      actionOrigin: fields.actionOrigin ?? null,
      lastRejection: fields.lastRejection ?? null
    });
  }

  function createClient(context) {
    if (!isContext(context)) throw new TypeError("Lumenloom protocol client requires a valid context.");
    const phase = context.kind === "hosted"
      ? "boot"
      : context.kind === "standalone"
        ? "standalone"
        : "invalid";
    return stateRecord(context, phase);
  }

  function isClientState(state) {
    if (!hasExactKeys(state, STATE_KEYS)
      || state.version !== protocol.VERSION
      || !isContext(state.context)
      || !PHASES.includes(state.phase)
      || !(state.runId === null || isToken(state.runId))
      || !(state.recording === null || typeof state.recording === "boolean")
      || !(state.result === null || isResult(state.result))
      || !(state.pendingAction === null || protocol.ACTIONS.includes(state.pendingAction))
      || !(state.actionOrigin === null || ["running", "saved", "unsaved"].includes(state.actionOrigin))
      || !(state.lastRejection === null || protocol.REASONS.includes(state.lastRejection))) {
      return false;
    }

    if (state.phase === "invalid") {
      return state.context.kind === "invalid"
        && state.runId === null
        && state.recording === null
        && state.result === null;
    }
    if (state.phase === "standalone") {
      return state.context.kind === "standalone"
        && state.runId === null
        && state.recording === null
        && state.result === null;
    }
    if (state.context.kind !== "hosted") return false;
    if (["boot", "ready", "closed"].includes(state.phase)) {
      return state.runId === null
        && state.recording === null
        && state.result === null
        && state.pendingAction === null
        && state.actionOrigin === null;
    }
    if (state.phase === "awaiting-start") {
      return isToken(state.runId)
        && state.recording === null
        && state.result === null
        && state.pendingAction === null
        && state.actionOrigin === null;
    }
    if (state.phase === "running") {
      return isToken(state.runId)
        && typeof state.recording === "boolean"
        && state.result === null
        && state.pendingAction === null
        && state.actionOrigin === null;
    }
    if (["saving", "pending", "saved", "unsaved"].includes(state.phase)) {
      if (!isToken(state.runId)
        || typeof state.recording !== "boolean"
        || !isResult(state.result)
        || state.pendingAction !== null
        || state.actionOrigin !== null) return false;
      if (state.phase === "pending" || state.phase === "saved") return state.recording === true;
      return true;
    }
    return state.phase === "awaiting-action"
      && isToken(state.runId)
      && typeof state.recording === "boolean"
      && protocol.ACTIONS.includes(state.pendingAction)
      && ["running", "saved", "unsaved"].includes(state.actionOrigin)
      && (state.actionOrigin === "running" ? state.result === null : isResult(state.result));
  }

  function childBase(context, type) {
    if (!isContext(context) || !context.hosted) return null;
    return {
      source: protocol.CHILD_SOURCE,
      version: protocol.VERSION,
      type,
      gameId: protocol.GAME_ID,
      modeId: context.modeId,
      sessionId: context.sessionId
    };
  }

  function buildGameReady(state) {
    if (!isClientState(state) || state.phase !== "boot") return null;
    return deepFreeze(childBase(state.context, "game-ready"));
  }

  function buildRunStart(state) {
    if (!isClientState(state) || state.phase !== "awaiting-start") return null;
    return deepFreeze({ ...childBase(state.context, "run-start"), runId: state.runId });
  }

  function buildRunAbandon(state) {
    if (!isClientState(state) || state.phase !== "running") return null;
    return deepFreeze({ ...childBase(state.context, "run-abandon"), runId: state.runId });
  }

  function buildSessionAction(state) {
    if (!isClientState(state) || state.phase !== "awaiting-action") return null;
    return deepFreeze({
      ...childBase(state.context, "session-action"),
      runId: state.runId,
      action: state.pendingAction
    });
  }

  function isAssist(assist) {
    return hasExactKeys(assist, ["preset", "scoreChanging"])
      && typeof assist.preset === "string"
      && /^[a-z][a-z0-9-]{0,31}$/.test(assist.preset)
      && assist.preset !== "autoplay"
      && assist.preset !== "demo"
      && typeof assist.scoreChanging === "boolean";
  }

  function buildRunComplete(state, payload) {
    if (!isClientState(state)
      || state.phase !== "running"
      || !hasExactKeys(payload, ["score", "victory", "stats", "assist"])
      || !isCounter(payload.score)
      || typeof payload.victory !== "boolean"
      || !isAssist(payload.assist)
      || !modeRules.validateStats(state.context.modeId, payload.stats, payload.victory)) {
      return null;
    }
    if (state.context.modeId !== "standard"
      && modeRules.recomputeResult(state.context.modeId, payload.stats, payload.victory) !== payload.score) {
      return null;
    }
    return deepFreeze({
      ...childBase(state.context, "run-complete"),
      runId: state.runId,
      score: payload.score,
      victory: payload.victory,
      stats: { ...payload.stats },
      assist: { ...payload.assist }
    });
  }

  function withRejection(state, reason) {
    if (state.lastRejection === reason) return state;
    return stateRecord(state.context, state.phase, {
      runId: state.runId,
      recording: state.recording,
      result: state.result,
      pendingAction: state.pendingAction,
      actionOrigin: state.actionOrigin,
      lastRejection: reason
    });
  }

  function parentExpected(state) {
    const expected = {
      gameId: protocol.GAME_ID,
      modeId: state.context.modeId,
      sessionId: state.context.sessionId,
      runId: state.runId
    };
    if (state.phase === "awaiting-action") expected.action = state.pendingAction;
    return expected;
  }

  function resultMatches(state, message) {
    return isResult(state.result)
      && message.score === state.result.score
      && message.victory === state.result.victory;
  }

  function handleParentMessage(state, rawMessage) {
    if (!state.context.hosted || !isToken(state.runId)) return state;
    const validated = protocol.validateParentMessage(parentExpected(state), rawMessage);
    if (!validated.ok) return state;
    const message = validated.message;

    if (state.phase === "awaiting-start") {
      if (message.type === "run-start-accepted") {
        if (state.context.trial && message.recording === false) return state;
        return stateRecord(state.context, "running", {
          runId: state.runId,
          recording: message.recording
        });
      }
      if (message.type === "run-start-rejected") return withRejection(state, message.reason);
      return state;
    }

    if (state.phase === "saving") {
      if (message.type === "run-result-rejected") return withRejection(state, message.reason);
      if (!["run-result-saved", "run-result-pending", "run-result-unsaved"].includes(message.type)
        || !resultMatches(state, message)) return state;
      if (state.recording === false && message.type !== "run-result-unsaved") return state;
      const phase = message.type === "run-result-saved"
        ? "saved"
        : message.type === "run-result-pending"
          ? "pending"
          : "unsaved";
      return stateRecord(state.context, phase, {
        runId: state.runId,
        recording: state.recording,
        result: state.result
      });
    }

    if (state.phase === "pending") {
      if (!resultMatches(state, message)) return state;
      if (message.type === "run-result-pending") return state;
      if (message.type === "run-result-saved") {
        return stateRecord(state.context, "saved", {
          runId: state.runId,
          recording: true,
          result: state.result
        });
      }
      if (message.type === "run-result-unsaved") {
        return stateRecord(state.context, "unsaved", {
          runId: state.runId,
          recording: true,
          result: state.result
        });
      }
      return state;
    }

    if ((state.phase === "saved" && message.type === "run-result-saved")
      || (state.phase === "unsaved" && message.type === "run-result-unsaved")) {
      return state;
    }

    if (state.phase === "awaiting-action") {
      if (message.type === "session-action-accepted") {
        return message.action === "restart"
          ? stateRecord(state.context, "ready")
          : stateRecord(state.context, "closed");
      }
      if (message.type === "session-action-rejected") {
        return stateRecord(state.context, state.actionOrigin, {
          runId: state.runId,
          recording: state.recording,
          result: state.result,
          lastRejection: message.reason
        });
      }
    }
    return state;
  }

  function reduceClient(state, action) {
    if (!isClientState(state)) throw new TypeError("Lumenloom protocol reducer requires a valid state.");
    if (!isPlainObject(action) || typeof action.type !== "string") return state;
    if (state.phase === "invalid" || state.phase === "standalone" || state.phase === "closed") {
      return state;
    }

    if (action.type === CLIENT_ACTIONS.READY_SENT) {
      if (!hasExactKeys(action, ["type"]) || state.phase !== "boot") return state;
      return stateRecord(state.context, "ready");
    }
    if (action.type === CLIENT_ACTIONS.START_REQUESTED) {
      if (!hasExactKeys(action, ["type", "runId"])
        || state.phase !== "ready"
        || !isToken(action.runId)) return state;
      return stateRecord(state.context, "awaiting-start", { runId: action.runId });
    }
    if (action.type === CLIENT_ACTIONS.RUN_FINISHED) {
      if (!hasExactKeys(action, ["type", "score", "victory"])
        || state.phase !== "running"
        || !isCounter(action.score)
        || typeof action.victory !== "boolean") return state;
      return stateRecord(state.context, "saving", {
        runId: state.runId,
        recording: state.recording,
        result: resultRecord(action.score, action.victory)
      });
    }
    if (action.type === CLIENT_ACTIONS.SESSION_ACTION_REQUESTED) {
      if (!hasExactKeys(action, ["type", "action"])
        || !protocol.ACTIONS.includes(action.action)
        || !["running", "saved", "unsaved"].includes(state.phase)) return state;
      return stateRecord(state.context, "awaiting-action", {
        runId: state.runId,
        recording: state.recording,
        result: state.result,
        pendingAction: action.action,
        actionOrigin: state.phase
      });
    }
    if (action.type === CLIENT_ACTIONS.PARENT_MESSAGE) {
      if (!hasExactKeys(action, ["type", "message"])) return state;
      return handleParentMessage(state, action.message);
    }
    return state;
  }

  function canRequestSessionAction(state, action) {
    return isClientState(state)
      && protocol.ACTIONS.includes(action)
      && ["running", "saved", "unsaved"].includes(state.phase)
      && !(state.context.trial && action === "restart");
  }

  return deepFreeze({
    VERSION: protocol.VERSION,
    PHASES,
    CLIENT_ACTIONS,
    parseContext,
    isContext,
    createRunId,
    createClient,
    isClientState,
    buildGameReady,
    buildRunStart,
    buildRunAbandon,
    buildSessionAction,
    buildRunComplete,
    reduceClient,
    canRequestSessionAction
  });
});
