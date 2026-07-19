(function initializeFirstBloomProtocolV2(root, factory) {
  "use strict";

  const modeRules = typeof module === "object" && module.exports
    ? require("../Lumenloom/modes.js")
    : root.LumenloomModes;
  const protocol = factory(modeRules);
  if (typeof module === "object" && module.exports) module.exports = protocol;
  else root.FirstBloomProtocolV2 = protocol;
})(typeof globalThis !== "undefined" ? globalThis : this, function createFirstBloomProtocolV2(modeRules) {
  "use strict";

  if (!modeRules
    || typeof modeRules.getMode !== "function"
    || typeof modeRules.validateStats !== "function"
    || typeof modeRules.recomputeResult !== "function") {
    throw new Error("Protocol v2 requires the canonical Lumenloom mode rules.");
  }

  function deepFreeze(value) {
    const freezeable = value && (typeof value === "object" || typeof value === "function");
    if (!freezeable || Object.isFrozen(value)) return value;
    Object.values(value).forEach(deepFreeze);
    return Object.freeze(value);
  }

  const VERSION = 2;
  const GAME_ID = "lumenloom";
  const CHILD_SOURCE = "first-bloom-game";
  const PARENT_SOURCE = "mastery-grove";
  const CHILD_TYPES = Object.freeze([
    "game-ready",
    "run-start",
    "run-abandon",
    "session-action",
    "run-complete"
  ]);
  const PARENT_TYPES = Object.freeze([
    "run-start-accepted",
    "run-start-rejected",
    "run-result-rejected",
    "session-action-accepted",
    "session-action-rejected",
    "run-result-saved",
    "run-result-pending",
    "run-result-unsaved"
  ]);
  const REASONS = Object.freeze([
    "invalid-message",
    "locked-mode",
    "duplicate-run",
    "out-of-order",
    "session-mismatch",
    "save-failed",
    "pending-result",
    "trial-locked"
  ]);
  const ACTIONS = Object.freeze(["restart", "grove"]);
  const SESSION_STATUSES = Object.freeze([
    "awaiting-ready",
    "ready",
    "running",
    "pending",
    "completed",
    "closed"
  ]);
  const RUN_STATES = Object.freeze(["running", "pending", "saved", "unsaved", "abandoned"]);
  const BASE_CHILD_KEYS = Object.freeze([
    "source",
    "version",
    "type",
    "gameId",
    "modeId",
    "sessionId"
  ]);
  const BASE_PARENT_KEYS = Object.freeze([
    "source",
    "version",
    "type",
    "gameId",
    "modeId",
    "sessionId",
    "runId"
  ]);
  const SESSION_KEYS = Object.freeze([
    "version",
    "gameId",
    "modeId",
    "sessionId",
    "trial",
    "status",
    "currentRunId",
    "runs"
  ]);
  const RUN_KEYS = Object.freeze(["runId", "state", "recording", "result"]);
  const RESULT_KEYS = Object.freeze(["score", "victory"]);

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

  function isSafeCounter(value) {
    return Number.isSafeInteger(value) && value >= 0;
  }

  function success(code, fields = {}) {
    return deepFreeze({ ok: true, code, ...fields });
  }

  function failure(reason, session = null, fields = {}) {
    return deepFreeze({ ok: false, code: reason, reason, session, ...fields });
  }

  function resultSummary(score, victory) {
    return deepFreeze({ score, victory });
  }

  function isRunRecord(run) {
    if (!hasExactKeys(run, RUN_KEYS)
      || !isToken(run.runId)
      || !RUN_STATES.includes(run.state)
      || typeof run.recording !== "boolean") return false;
    if (run.result === null) return run.state === "running" || run.state === "abandoned";
    return hasExactKeys(run.result, RESULT_KEYS)
      && isSafeCounter(run.result.score)
      && typeof run.result.victory === "boolean"
      && ["pending", "saved", "unsaved"].includes(run.state);
  }

  function isSession(session) {
    if (!hasExactKeys(session, SESSION_KEYS)
      || session.version !== VERSION
      || session.gameId !== GAME_ID
      || !modeRules.getMode(session.modeId)
      || !isToken(session.sessionId, 8)
      || typeof session.trial !== "boolean"
      || !SESSION_STATUSES.includes(session.status)
      || !(session.currentRunId === null || isToken(session.currentRunId))
      || !Array.isArray(session.runs)
      || !session.runs.every(isRunRecord)
      || new Set(session.runs.map((run) => run.runId)).size !== session.runs.length) {
      return false;
    }
    if (session.trial && session.modeId !== "standard") return false;
    const current = session.currentRunId === null
      ? null
      : session.runs.find((run) => run.runId === session.currentRunId) || null;
    if (["awaiting-ready", "ready", "closed"].includes(session.status)) {
      return session.currentRunId === null;
    }
    if (!current) return false;
    if (session.status === "running") return current.state === "running";
    if (session.status === "pending") return current.state === "pending";
    return session.status === "completed"
      && (current.state === "saved" || current.state === "unsaved");
  }

  function createSession(options) {
    if (!hasExactKeys(options, ["gameId", "modeId", "sessionId", "trial", "modeUnlocked"])) {
      return failure("invalid-message");
    }
    if (options.gameId !== GAME_ID
      || !modeRules.getMode(options.modeId)
      || !isToken(options.sessionId, 8)
      || typeof options.trial !== "boolean"
      || typeof options.modeUnlocked !== "boolean") {
      return failure("invalid-message");
    }
    if (!options.modeUnlocked) return failure("locked-mode");
    if (options.trial && options.modeId !== "standard") return failure("trial-locked");
    return success("ok", {
      session: deepFreeze({
        version: VERSION,
        gameId: GAME_ID,
        modeId: options.modeId,
        sessionId: options.sessionId,
        trial: options.trial,
        status: "awaiting-ready",
        currentRunId: null,
        runs: Object.freeze([])
      })
    });
  }

  function expectedChildKeys(type) {
    if (type === "game-ready") return BASE_CHILD_KEYS;
    if (type === "run-start" || type === "run-abandon") {
      return Object.freeze([...BASE_CHILD_KEYS, "runId"]);
    }
    if (type === "session-action") {
      return Object.freeze([...BASE_CHILD_KEYS, "runId", "action"]);
    }
    if (type === "run-complete") {
      return Object.freeze([
        ...BASE_CHILD_KEYS,
        "runId",
        "score",
        "victory",
        "stats",
        "assist"
      ]);
    }
    return null;
  }

  function isAssist(assist) {
    if (!hasExactKeys(assist, ["preset", "scoreChanging"])
      || typeof assist.preset !== "string"
      || typeof assist.scoreChanging !== "boolean") return false;
    return /^[a-z][a-z0-9-]{0,31}$/.test(assist.preset)
      && assist.preset !== "autoplay"
      && assist.preset !== "demo";
  }

  function validateChildMessage(session, rawMessage) {
    if (!isSession(session)) return failure("invalid-message", session);
    if (!isPlainObject(rawMessage)
      || rawMessage.source !== CHILD_SOURCE
      || rawMessage.version !== VERSION
      || rawMessage.gameId !== GAME_ID
      || !CHILD_TYPES.includes(rawMessage.type)) {
      return failure("invalid-message", session);
    }
    const expectedKeys = expectedChildKeys(rawMessage.type);
    if (!expectedKeys || !hasExactKeys(rawMessage, expectedKeys)) {
      return failure("invalid-message", session);
    }
    if (rawMessage.sessionId !== session.sessionId) return failure("session-mismatch", session);
    if (rawMessage.modeId !== session.modeId) return failure("locked-mode", session);

    if (rawMessage.type === "game-ready") {
      return success("ok", {
        session,
        message: deepFreeze({
          source: CHILD_SOURCE,
          version: VERSION,
          type: "game-ready",
          gameId: GAME_ID,
          modeId: session.modeId,
          sessionId: session.sessionId
        })
      });
    }

    if (!isToken(rawMessage.runId)) return failure("invalid-message", session);
    if (rawMessage.type === "run-start" || rawMessage.type === "run-abandon") {
      return success("ok", { session, message: deepFreeze({ ...rawMessage }) });
    }
    if (rawMessage.type === "session-action") {
      if (!ACTIONS.includes(rawMessage.action)) return failure("invalid-message", session);
      return success("ok", { session, message: deepFreeze({ ...rawMessage }) });
    }

    if (!isSafeCounter(rawMessage.score)
      || typeof rawMessage.victory !== "boolean"
      || !isAssist(rawMessage.assist)
      || !modeRules.validateStats(session.modeId, rawMessage.stats, rawMessage.victory)) {
      return failure("invalid-message", session);
    }
    const recomputedScore = session.modeId === "standard"
      ? rawMessage.score
      : modeRules.recomputeResult(session.modeId, rawMessage.stats, rawMessage.victory);
    if (!isSafeCounter(recomputedScore) || rawMessage.score !== recomputedScore) {
      return failure("invalid-message", session);
    }
    return success("ok", {
      session,
      message: deepFreeze({
        ...rawMessage,
        stats: deepFreeze({ ...rawMessage.stats }),
        assist: deepFreeze({ ...rawMessage.assist }),
        recomputedScore
      })
    });
  }

  function parentBase(session, type, runId) {
    return {
      source: PARENT_SOURCE,
      version: VERSION,
      type,
      gameId: GAME_ID,
      modeId: session.modeId,
      sessionId: session.sessionId,
      runId
    };
  }

  function startAcceptedResponse(session, runId, recording) {
    return deepFreeze({
      ...parentBase(session, "run-start-accepted", runId),
      recording
    });
  }

  function rejectedResponse(session, type, runId, reason, action = undefined) {
    const response = {
      ...parentBase(session, type, runId)
    };
    if (type.startsWith("session-action-")) response.action = action;
    response.reason = reason;
    return deepFreeze(response);
  }

  function resultResponse(session, type, runId, result) {
    return deepFreeze({
      ...parentBase(session, type, runId),
      score: result.score,
      victory: result.victory
    });
  }

  function actionAcceptedResponse(session, runId, action) {
    return rejectedResponse(session, "session-action-accepted", runId, "accepted", action);
  }

  function responseTypeForMessage(type) {
    if (type === "run-start") return "run-start-rejected";
    if (type === "run-complete") return "run-result-rejected";
    if (type === "session-action") return "session-action-rejected";
    return null;
  }

  function safeResponseRunId(session, rawMessage) {
    if (isToken(rawMessage?.runId)) return rawMessage.runId;
    if (isToken(session?.currentRunId)) return session.currentRunId;
    return null;
  }

  function rejectedReceive(session, rawMessage, reason) {
    const responseType = responseTypeForMessage(rawMessage?.type);
    const runId = safeResponseRunId(session, rawMessage);
    const action = ACTIONS.includes(rawMessage?.action) ? rawMessage.action : null;
    const response = responseType && runId && (!responseType.startsWith("session-action-") || action)
      ? rejectedResponse(session, responseType, runId, reason, action || undefined)
      : null;
    return failure(reason, session, { response });
  }

  function findRun(session, runId) {
    return session.runs.find((run) => run.runId === runId) || null;
  }

  function replaceRun(session, runId, replacement) {
    return Object.freeze(session.runs.map((run) => run.runId === runId ? deepFreeze(replacement) : run));
  }

  function sessionWith(session, patch) {
    return deepFreeze({ ...session, ...patch });
  }

  function replayResult(session, run) {
    const responseType = run.state === "pending"
      ? "run-result-pending"
      : run.state === "saved"
        ? "run-result-saved"
        : "run-result-unsaved";
    return success("result-replayed", {
      session,
      response: resultResponse(session, responseType, run.runId, run.result),
      result: run.result
    });
  }

  function receive(session, rawMessage) {
    const validated = validateChildMessage(session, rawMessage);
    if (!validated.ok) return rejectedReceive(session, rawMessage, validated.reason);
    const message = validated.message;

    if (message.type === "game-ready") {
      if (session.status !== "awaiting-ready") {
        return rejectedReceive(session, rawMessage, "out-of-order");
      }
      return success("ready", {
        session: sessionWith(session, { status: "ready" }),
        message,
        response: null
      });
    }

    if (message.type === "run-start") {
      if (findRun(session, message.runId)) {
        return rejectedReceive(session, rawMessage, "duplicate-run");
      }
      if (session.status === "pending") {
        return rejectedReceive(session, rawMessage, "pending-result");
      }
      if (session.status !== "ready") {
        return rejectedReceive(session, rawMessage, "out-of-order");
      }
      return success("start-requested", { session, message, response: null });
    }

    if (message.type === "run-abandon") {
      if (session.status === "pending") return failure("pending-result", session);
      const run = findRun(session, message.runId);
      if (session.status !== "running"
        || session.currentRunId !== message.runId
        || !run
        || run.state !== "running") {
        return failure("out-of-order", session);
      }
      const nextRun = { ...run, state: "abandoned", result: null };
      return success("run-abandoned", {
        session: sessionWith(session, {
          status: "ready",
          currentRunId: null,
          runs: replaceRun(session, run.runId, nextRun)
        }),
        message,
        response: null
      });
    }

    if (message.type === "session-action") {
      if (session.status === "pending") {
        return rejectedReceive(session, rawMessage, "pending-result");
      }
      if (session.currentRunId !== message.runId) {
        return rejectedReceive(session, rawMessage, "out-of-order");
      }
      if (message.action === "restart" && session.trial) {
        return rejectedReceive(session, rawMessage, "trial-locked");
      }
      if (!["running", "completed"].includes(session.status)) {
        return rejectedReceive(session, rawMessage, "out-of-order");
      }
      return success("action-requested", { session, message, response: null });
    }

    const run = findRun(session, message.runId);
    if (run && ["pending", "saved", "unsaved"].includes(run.state)) {
      if (!run.result
        || run.result.score !== message.recomputedScore
        || run.result.victory !== message.victory) {
        return rejectedReceive(session, rawMessage, "duplicate-run");
      }
      return replayResult(session, run);
    }
    if (session.status === "pending") {
      return rejectedReceive(session, rawMessage, "pending-result");
    }
    if (session.status !== "running"
      || session.currentRunId !== message.runId
      || !run
      || run.state !== "running") {
      return rejectedReceive(session, rawMessage, run ? "duplicate-run" : "out-of-order");
    }
    return success("result-requested", {
      session,
      message,
      result: resultSummary(message.recomputedScore, message.victory),
      response: null
    });
  }

  function acceptStart(session, runId, recording) {
    if (!isSession(session)
      || session.status !== "ready"
      || !isToken(runId)
      || typeof recording !== "boolean") {
      return failure("out-of-order", session);
    }
    if (findRun(session, runId)) return failure("duplicate-run", session);
    const run = deepFreeze({ runId, state: "running", recording, result: null });
    const next = sessionWith(session, {
      status: "running",
      currentRunId: runId,
      runs: Object.freeze([...session.runs, run])
    });
    return success("run-started", {
      session: next,
      response: startAcceptedResponse(next, runId, recording)
    });
  }

  function rejectStart(session, runId, reason) {
    if (!isSession(session)
      || !isToken(runId)
      || !REASONS.includes(reason)
      || reason === "accepted") {
      return failure("invalid-message", session);
    }
    return failure(reason, session, {
      response: rejectedResponse(session, "run-start-rejected", runId, reason)
    });
  }

  function markResultPending(session, runId, result) {
    if (!isSession(session)
      || session.status !== "running"
      || session.currentRunId !== runId
      || !hasExactKeys(result, RESULT_KEYS)
      || !isSafeCounter(result.score)
      || typeof result.victory !== "boolean") {
      return failure("out-of-order", session);
    }
    const run = findRun(session, runId);
    if (!run || run.state !== "running" || !run.recording) {
      return failure("out-of-order", session);
    }
    const frozenResult = resultSummary(result.score, result.victory);
    const nextRun = { ...run, state: "pending", result: frozenResult };
    const next = sessionWith(session, {
      status: "pending",
      runs: replaceRun(session, runId, nextRun)
    });
    return success("result-pending", {
      session: next,
      result: frozenResult,
      response: resultResponse(next, "run-result-pending", runId, frozenResult)
    });
  }

  function settlePendingResult(session, runId, disposition) {
    if (!isSession(session)
      || session.status !== "pending"
      || session.currentRunId !== runId
      || !["saved", "unsaved"].includes(disposition)) {
      return failure("out-of-order", session);
    }
    const run = findRun(session, runId);
    if (!run || run.state !== "pending" || !run.result) return failure("out-of-order", session);
    const nextRun = { ...run, state: disposition };
    const next = sessionWith(session, {
      status: "completed",
      runs: replaceRun(session, runId, nextRun)
    });
    return success(disposition === "saved" ? "result-saved" : "result-unsaved", {
      session: next,
      result: run.result,
      response: resultResponse(
        next,
        disposition === "saved" ? "run-result-saved" : "run-result-unsaved",
        runId,
        run.result
      )
    });
  }

  function completeUnsavedResult(session, runId, result) {
    if (!isSession(session)
      || session.status !== "running"
      || session.currentRunId !== runId
      || !hasExactKeys(result, RESULT_KEYS)
      || !isSafeCounter(result.score)
      || typeof result.victory !== "boolean") {
      return failure("out-of-order", session);
    }
    const run = findRun(session, runId);
    if (!run || run.state !== "running" || run.recording) return failure("out-of-order", session);
    const frozenResult = resultSummary(result.score, result.victory);
    const nextRun = { ...run, state: "unsaved", result: frozenResult };
    const next = sessionWith(session, {
      status: "completed",
      runs: replaceRun(session, runId, nextRun)
    });
    return success("result-unsaved", {
      session: next,
      result: frozenResult,
      response: resultResponse(next, "run-result-unsaved", runId, frozenResult)
    });
  }

  function rejectResult(session, runId, reason) {
    if (!isSession(session) || !isToken(runId) || !REASONS.includes(reason)) {
      return failure("invalid-message", session);
    }
    return failure(reason, session, {
      response: rejectedResponse(session, "run-result-rejected", runId, reason)
    });
  }

  function acceptAction(session, runId, action) {
    if (!isSession(session)
      || !isToken(runId)
      || !ACTIONS.includes(action)
      || session.currentRunId !== runId
      || !["running", "completed"].includes(session.status)
      || (action === "restart" && session.trial)) {
      return failure(action === "restart" && session?.trial ? "trial-locked" : "out-of-order", session);
    }
    let runs = session.runs;
    if (session.status === "running") {
      const run = findRun(session, runId);
      if (!run || run.state !== "running") return failure("out-of-order", session);
      runs = replaceRun(session, runId, { ...run, state: "abandoned", result: null });
    }
    const next = sessionWith(session, {
      status: action === "restart" ? "ready" : "closed",
      currentRunId: null,
      runs
    });
    return success("action-accepted", {
      session: next,
      action,
      response: actionAcceptedResponse(next, runId, action)
    });
  }

  function rejectAction(session, runId, action, reason) {
    if (!isSession(session)
      || !isToken(runId)
      || !ACTIONS.includes(action)
      || !REASONS.includes(reason)) {
      return failure("invalid-message", session);
    }
    return failure(reason, session, {
      response: rejectedResponse(session, "session-action-rejected", runId, reason, action)
    });
  }

  function expectedParentKeys(type) {
    if (type === "run-start-accepted") return Object.freeze([...BASE_PARENT_KEYS, "recording"]);
    if (type === "run-start-rejected" || type === "run-result-rejected") {
      return Object.freeze([...BASE_PARENT_KEYS, "reason"]);
    }
    if (type === "session-action-accepted" || type === "session-action-rejected") {
      return Object.freeze([...BASE_PARENT_KEYS, "action", "reason"]);
    }
    if (["run-result-saved", "run-result-pending", "run-result-unsaved"].includes(type)) {
      return Object.freeze([...BASE_PARENT_KEYS, "score", "victory"]);
    }
    return null;
  }

  function validateParentMessage(expected, rawMessage) {
    if (!isPlainObject(expected)
      || expected.gameId !== GAME_ID
      || !modeRules.getMode(expected.modeId)
      || !isToken(expected.sessionId, 8)
      || !isToken(expected.runId)
      || !isPlainObject(rawMessage)
      || rawMessage.source !== PARENT_SOURCE
      || rawMessage.version !== VERSION
      || !PARENT_TYPES.includes(rawMessage.type)) {
      return failure("invalid-message");
    }
    const expectedKeys = expectedParentKeys(rawMessage.type);
    if (!expectedKeys || !hasExactKeys(rawMessage, expectedKeys)) return failure("invalid-message");
    if (rawMessage.gameId !== expected.gameId
      || rawMessage.modeId !== expected.modeId
      || rawMessage.sessionId !== expected.sessionId
      || rawMessage.runId !== expected.runId) {
      return failure("session-mismatch");
    }
    if (rawMessage.type === "run-start-accepted") {
      if (typeof rawMessage.recording !== "boolean") return failure("invalid-message");
    } else if (rawMessage.type === "run-start-rejected" || rawMessage.type === "run-result-rejected") {
      if (!REASONS.includes(rawMessage.reason)) return failure("invalid-message");
    } else if (rawMessage.type.startsWith("session-action-")) {
      if (!ACTIONS.includes(rawMessage.action)
        || (expected.action !== undefined && rawMessage.action !== expected.action)
        || (rawMessage.type === "session-action-accepted"
          ? rawMessage.reason !== "accepted"
          : !REASONS.includes(rawMessage.reason))) {
        return failure("invalid-message");
      }
    } else if (!isSafeCounter(rawMessage.score) || typeof rawMessage.victory !== "boolean") {
      return failure("invalid-message");
    }
    return success("ok", { message: deepFreeze({ ...rawMessage }) });
  }

  return deepFreeze({
    VERSION,
    GAME_ID,
    CHILD_SOURCE,
    PARENT_SOURCE,
    CHILD_TYPES,
    PARENT_TYPES,
    REASONS,
    ACTIONS,
    createSession,
    isSession,
    validateChildMessage,
    validateParentMessage,
    receive,
    acceptStart,
    rejectStart,
    markResultPending,
    settlePendingResult,
    completeUnsavedResult,
    rejectResult,
    acceptAction,
    rejectAction
  });
});
