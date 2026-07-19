(function initializeLumenloomSessionCoordinator(root, factory) {
  "use strict";

  const protocol = typeof module === "object" && module.exports
    ? require("./protocol-v2.js")
    : root.FirstBloomProtocolV2;
  const progression = typeof module === "object" && module.exports
    ? require("./progression.js")
    : root.MasteryGroveProgression;
  const coordinator = factory(protocol, progression);
  if (typeof module === "object" && module.exports) module.exports = coordinator;
  else root.FirstBloomLumenloomSession = coordinator;
})(typeof globalThis !== "undefined" ? globalThis : this, function createLumenloomSessionCoordinator(
  protocol,
  progression
) {
  "use strict";

  if (!protocol || protocol.VERSION !== 2) {
    throw new Error("The Lumenloom session coordinator requires protocol v2.");
  }
  if (!progression
    || typeof progression.isCanonicalProfile !== "function"
    || typeof progression.isLumenloomModeAvailable !== "function") {
    throw new Error("The Lumenloom session coordinator requires Mastery progression.");
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

  function success(code, fields = {}) {
    return deepFreeze({ ok: true, code, ...fields });
  }

  function failure(code, state = null, fields = {}) {
    return deepFreeze({ ok: false, code, state, ...fields });
  }

  function isTimestamp(value) {
    return value === null || (typeof value === "string" && value.length <= 64);
  }

  function stampProfile(profile, updatedAt) {
    if (!isTimestamp(updatedAt)) return null;
    const stamped = JSON.parse(JSON.stringify(profile));
    stamped.updatedAt = updatedAt;
    return progression.isCanonicalProfile(stamped) ? deepFreeze(stamped) : null;
  }

  function isState(state) {
    return hasExactKeys(state, ["session", "profile", "pending"])
      && protocol.isSession(state.session)
      && progression.isCanonicalProfile(state.profile)
      && (state.pending === null || isPending(state.pending));
  }

  function isPending(pending) {
    if (!hasExactKeys(pending, [
      "key",
      "kind",
      "runId",
      "beforeProfile",
      "proposedProfile",
      "message",
      "result",
      "presentation"
    ])) return false;
    if (!["start", "result"].includes(pending.kind)
      || typeof pending.key !== "string"
      || typeof pending.runId !== "string"
      || !progression.isCanonicalProfile(pending.beforeProfile)
      || !progression.isCanonicalProfile(pending.proposedProfile)
      || !isPlainObject(pending.message)) return false;
    if (pending.kind === "start") {
      return pending.result === null && pending.presentation === null;
    }
    return hasExactKeys(pending.result, ["score", "victory"])
      && Number.isSafeInteger(pending.result.score)
      && pending.result.score >= 0
      && typeof pending.result.victory === "boolean"
      && isPlainObject(pending.presentation);
  }

  function stateWith(state, patch) {
    return deepFreeze({ ...state, ...patch });
  }

  function transactionKey(session, runId, kind) {
    return `${session.sessionId}:${runId}:${kind}`;
  }

  function create(options) {
    if (!hasExactKeys(options, ["profile", "modeId", "sessionId", "trial"])) {
      return failure("invalid-message");
    }
    if (!progression.isCanonicalProfile(options.profile)) return failure("invalid-profile");
    const modeUnlocked = progression.isLumenloomModeAvailable(options.profile, options.modeId);
    const created = protocol.createSession({
      gameId: "lumenloom",
      modeId: options.modeId,
      sessionId: options.sessionId,
      trial: options.trial,
      modeUnlocked
    });
    if (!created.ok) return failure(created.code);
    return success("ok", {
      state: deepFreeze({
        session: created.session,
        profile: options.profile,
        pending: null
      })
    });
  }

  function makePendingStart(state, message, proposedProfile) {
    return deepFreeze({
      key: transactionKey(state.session, message.runId, "start"),
      kind: "start",
      runId: message.runId,
      beforeProfile: state.profile,
      proposedProfile,
      message,
      result: null,
      presentation: null
    });
  }

  function makePendingResult(state, message, result, proposedProfile, presentation) {
    return deepFreeze({
      key: transactionKey(state.session, message.runId, "result"),
      kind: "result",
      runId: message.runId,
      beforeProfile: state.profile,
      proposedProfile,
      message,
      result,
      presentation
    });
  }

  function standardPresentation(state, message, applied) {
    const beforeRecord = state.profile.games.lumenloom;
    return deepFreeze({
      kind: "standard",
      gameId: "lumenloom",
      modeId: "standard",
      result: applied.result,
      rewards: applied.rewards,
      feedback: progression.classifyRunFeedback(beforeRecord, applied.result),
      previousTotal: beforeRecord.totalScore
    });
  }

  function remixPresentation(state, message, applied) {
    const record = state.profile.livingArcade.modes.lumenloom[message.modeId];
    return deepFreeze({
      kind: "remix",
      gameId: "lumenloom",
      modeId: message.modeId,
      result: applied.result,
      rewards: Object.freeze([]),
      feedback: deepFreeze({
        lane: applied.result.assisted ? "assisted" : "standard",
        priorBest: applied.result.assisted ? record.assistedBest : record.standardBest,
        isPersonalBest: applied.result.score > (
          applied.result.assisted ? record.assistedBest : record.standardBest
        ),
        matchedBest: applied.result.score > 0 && applied.result.score === (
          applied.result.assisted ? record.assistedBest : record.standardBest
        )
      }),
      previousTotal: state.profile.games.lumenloom.totalScore
    });
  }

  function prepareResultMutation(state, message, updatedAt) {
    if (message.modeId === "standard") {
      const rank = progression.canonicalLumenloomRank(message.recomputedScore, message.victory);
      const applied = progression.applyResult(state.profile, {
        gameId: "lumenloom",
        score: message.recomputedScore,
        victory: message.victory,
        assisted: message.assist.scoreChanging,
        rank
      });
      if (!applied.ok) return failure(applied.code, state);
      const proposedProfile = stampProfile(applied.profile, updatedAt);
      if (!proposedProfile) return failure("invalid-profile", state);
      return success("ok", {
        proposedProfile,
        presentation: standardPresentation(state, message, applied)
      });
    }

    const applied = progression.applyLumenloomRemixResult(state.profile, {
      modeId: message.modeId,
      score: message.recomputedScore,
      victory: message.victory,
      assisted: message.assist.scoreChanging
    });
    if (!applied.ok) return failure(applied.code, state);
    const proposedProfile = stampProfile(applied.profile, updatedAt);
    if (!proposedProfile) return failure("invalid-profile", state);
    return success("ok", {
      proposedProfile,
      presentation: remixPresentation(state, message, applied)
    });
  }

  function blockedByPending(state, rawMessage) {
    if (state.pending.kind === "start") {
      const runId = typeof rawMessage?.runId === "string" ? rawMessage.runId : state.pending.runId;
      const rejected = protocol.rejectStart(state.session, runId, "save-failed");
      return failure("save-failed", state, { response: rejected.response || null });
    }
    const transitioned = protocol.receive(state.session, rawMessage);
    return transitioned.ok
      ? success(transitioned.code, {
        state: stateWith(state, { session: transitioned.session }),
        response: transitioned.response || null,
        effect: "none",
        transaction: state.pending
      })
      : failure(transitioned.code, state, {
        response: transitioned.response || null,
        transaction: state.pending
      });
  }

  function receive(state, rawMessage, options = {}) {
    if (!isState(state)) return failure("invalid-state", state);
    if (!isPlainObject(options)
      || Object.keys(options).some((key) => key !== "updatedAt")
      || (options.updatedAt !== undefined && !isTimestamp(options.updatedAt))) {
      return failure("invalid-message", state);
    }
    if (state.pending) return blockedByPending(state, rawMessage);

    const transitioned = protocol.receive(state.session, rawMessage);
    if (!transitioned.ok) {
      return failure(transitioned.code, state, { response: transitioned.response || null });
    }

    if (["ready", "run-abandoned", "result-replayed"].includes(transitioned.code)) {
      return success(transitioned.code, {
        state: stateWith(state, { session: transitioned.session }),
        response: transitioned.response || null,
        effect: "none",
        transaction: null
      });
    }

    if (transitioned.code === "action-requested") {
      const accepted = protocol.acceptAction(
        transitioned.session,
        transitioned.message.runId,
        transitioned.message.action
      );
      if (!accepted.ok) {
        const rejected = protocol.rejectAction(
          transitioned.session,
          transitioned.message.runId,
          transitioned.message.action,
          accepted.code
        );
        return failure(accepted.code, state, { response: rejected.response || null });
      }
      return success("action-accepted", {
        state: stateWith(state, { session: accepted.session }),
        response: accepted.response,
        effect: transitioned.message.action,
        transaction: null
      });
    }

    if (transitioned.code === "start-requested") {
      if (state.session.modeId === "standard") {
        const accepted = protocol.acceptStart(state.session, transitioned.message.runId, true);
        if (!accepted.ok) return failure(accepted.code, state);
        return success("run-started", {
          state: stateWith(state, { session: accepted.session }),
          response: accepted.response,
          effect: "none",
          transaction: null
        });
      }
      const recorded = progression.recordLumenloomRemixStart(state.profile, state.session.modeId);
      if (!recorded.ok) {
        const rejected = protocol.rejectStart(
          state.session,
          transitioned.message.runId,
          recorded.code === "mode-locked" ? "locked-mode" : "save-failed"
        );
        return failure(rejected.code, state, { response: rejected.response });
      }
      const proposedProfile = stampProfile(
        recorded.profile,
        options.updatedAt ?? state.profile.updatedAt
      );
      if (!proposedProfile) return failure("invalid-profile", state);
      const pending = makePendingStart(state, transitioned.message, proposedProfile);
      return success("start-commit-required", {
        state: stateWith(state, { pending }),
        response: null,
        effect: "commit-start",
        transaction: pending
      });
    }

    if (transitioned.code !== "result-requested") {
      return failure("out-of-order", state);
    }
    const run = state.session.runs.find((candidate) => candidate.runId === transitioned.message.runId);
    if (!run) return failure("out-of-order", state);
    if (!run.recording) {
      const completed = protocol.completeUnsavedResult(
        state.session,
        transitioned.message.runId,
        transitioned.result
      );
      if (!completed.ok) return failure(completed.code, state);
      return success("result-unsaved", {
        state: stateWith(state, { session: completed.session }),
        response: completed.response,
        effect: "present-unsaved",
        transaction: null,
        presentation: deepFreeze({
          kind: state.session.modeId === "standard" ? "standard" : "remix",
          gameId: "lumenloom",
          modeId: state.session.modeId,
          result: deepFreeze({
            modeId: state.session.modeId,
            score: transitioned.result.score,
            victory: transitioned.result.victory,
            assisted: transitioned.message.assist.scoreChanging
          }),
          rewards: Object.freeze([]),
          feedback: null,
          previousTotal: state.profile.games.lumenloom.totalScore
        })
      });
    }

    const prepared = prepareResultMutation(
      state,
      transitioned.message,
      options.updatedAt ?? state.profile.updatedAt
    );
    if (!prepared.ok) {
      const rejected = protocol.rejectResult(
        state.session,
        transitioned.message.runId,
        prepared.code === "mode-locked" ? "locked-mode" : "invalid-message"
      );
      return failure(rejected.code, state, { response: rejected.response });
    }
    const marked = protocol.markResultPending(
      state.session,
      transitioned.message.runId,
      transitioned.result
    );
    if (!marked.ok) return failure(marked.code, state);
    const pending = makePendingResult(
      state,
      transitioned.message,
      transitioned.result,
      prepared.proposedProfile,
      prepared.presentation
    );
    return success("result-commit-required", {
      state: deepFreeze({
        session: marked.session,
        profile: state.profile,
        pending
      }),
      response: null,
      effect: "commit-result",
      transaction: pending,
      presentation: prepared.presentation
    });
  }

  function settlePending(state, pendingKey, disposition) {
    if (!isState(state)
      || !state.pending
      || state.pending.key !== pendingKey
      || !["saved", "failed", "unsaved", "discarded"].includes(disposition)) {
      return failure("out-of-order", state);
    }
    const pending = state.pending;

    if (pending.kind === "start") {
      if (disposition === "failed") {
        const rejected = protocol.rejectStart(state.session, pending.runId, "save-failed");
        return failure("save-failed", state, {
          response: rejected.response,
          transaction: pending
        });
      }
      if (disposition === "discarded") {
        return success("start-discarded", {
          state: stateWith(state, { pending: null }),
          response: null,
          effect: "return",
          transaction: null
        });
      }
      const recording = disposition === "saved";
      const accepted = protocol.acceptStart(state.session, pending.runId, recording);
      if (!accepted.ok) return failure(accepted.code, state);
      return success("run-started", {
        state: deepFreeze({
          session: accepted.session,
          profile: recording ? pending.proposedProfile : pending.beforeProfile,
          pending: null
        }),
        response: accepted.response,
        effect: recording ? "start-saved" : "start-unsaved",
        transaction: null
      });
    }

    if (disposition === "discarded") disposition = "unsaved";
    if (disposition === "failed") {
      const run = state.session.runs.find((candidate) => candidate.runId === pending.runId);
      return failure("save-failed", state, {
        response: run?.result
          ? {
            source: protocol.PARENT_SOURCE,
            version: protocol.VERSION,
            type: "run-result-pending",
            gameId: protocol.GAME_ID,
            modeId: state.session.modeId,
            sessionId: state.session.sessionId,
            runId: pending.runId,
            score: run.result.score,
            victory: run.result.victory
          }
          : null,
        transaction: pending
      });
    }
    const settled = protocol.settlePendingResult(state.session, pending.runId, disposition);
    if (!settled.ok) return failure(settled.code, state);
    return success(settled.code, {
      state: deepFreeze({
        session: settled.session,
        profile: disposition === "saved" ? pending.proposedProfile : pending.beforeProfile,
        pending: null
      }),
      response: settled.response,
      effect: disposition === "saved" ? "present-saved" : "present-unsaved",
      transaction: null,
      presentation: pending.presentation
    });
  }

  return deepFreeze({
    create,
    isState,
    receive,
    settlePending
  });
});
