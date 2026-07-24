(function initializeMasteryGroveProfileStorage(root, factory) {
  "use strict";

  const progression = typeof module === "object" && module.exports
    ? require("./progression.js")
    : root.MasteryGroveProgression;
  const api = factory(progression);
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.MasteryGroveProfileStorage = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createProfileStorageApi(defaultProgression) {
  "use strict";

  const STORAGE_KEY = "first-bloom-grove-v1";
  const BACKUP_STORAGE_KEY = "first-bloom-grove-v1-backup";
  const COMMIT_PAYLOAD_KIND = "mastery-grove-profile-commit";
  const COMMIT_PAYLOAD_VERSION = 1;
  const COMMIT_PAYLOAD_KEYS = Object.freeze([
    "kind",
    "version",
    "recoveryText",
    "currentText",
    "profile"
  ]);

  function deepFreeze(value) {
    if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
    Object.values(value).forEach(deepFreeze);
    return Object.freeze(value);
  }

  function isPlainObject(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  }

  function hasExactKeys(value, expected) {
    if (!isPlainObject(value)) return false;
    const actual = Object.keys(value).sort();
    const wanted = [...expected].sort();
    return actual.length === wanted.length
      && actual.every((key, index) => key === wanted[index]);
  }

  function jsonEquivalent(left, right) {
    if (Object.is(left, right)) return true;
    if (Array.isArray(left) || Array.isArray(right)) {
      if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
      return left.every((value, index) => jsonEquivalent(value, right[index]));
    }
    if (!isPlainObject(left) || !isPlainObject(right)) return false;
    const leftKeys = Object.keys(left).sort();
    const rightKeys = Object.keys(right).sort();
    if (leftKeys.length !== rightKeys.length) return false;
    return leftKeys.every((key, index) => (
      key === rightKeys[index] && jsonEquivalent(left[key], right[key])
    ));
  }

  function assertProgressionApi(candidate) {
    if (!candidate
      || typeof candidate.defaultProfile !== "function"
      || typeof candidate.migrateProfile !== "function"
      || typeof candidate.isCanonicalProfile !== "function"
      || !Number.isSafeInteger(candidate.PROFILE_VERSION)) {
      throw new TypeError("A complete Mastery Grove progression API is required.");
    }
    return candidate;
  }

  function assertStorageAdapter(storage) {
    if (!storage
      || typeof storage.getItem !== "function"
      || typeof storage.setItem !== "function") {
      throw new TypeError("A Storage-compatible getItem/setItem adapter is required.");
    }
    return storage;
  }

  function createProfileStorage(storageAdapter, options = {}) {
    const storage = assertStorageAdapter(storageAdapter);
    const progression = assertProgressionApi(options.progression || defaultProgression);
    const payloadStates = new WeakMap();
    const payloadOperations = new WeakMap();
    const payloadPreconditions = new WeakMap();
    let startupInspected = false;
    let controllerState = "startup-required";
    let activePayload = null;

    function result(fields) {
      return deepFreeze(fields);
    }

    function invalidCommit(code, details = {}) {
      return result({
        ok: false,
        code,
        state: "invalid",
        readOnly: false,
        recovered: false,
        profile: null,
        retryPayload: null,
        ...details
      });
    }

    function isReadOnlyState(state = controllerState) {
      return state === "protected-read-only"
        || state === "session-read-only"
        || state === "read-only-recovery";
    }

    function blockedCommit(code) {
      return result({
        ok: false,
        code,
        state: controllerState,
        readOnly: isReadOnlyState(),
        recovered: false,
        profile: null,
        retryPayload: null
      });
    }

    function invalidRetry(code) {
      return result({
        ok: false,
        code,
        state: controllerState,
        readOnly: isReadOnlyState(),
        recovered: false,
        profile: null,
        retryPayload: null
      });
    }

    function mutationGuard() {
      if (!startupInspected) return blockedCommit("startup-not-inspected");
      if (activePayload) return blockedCommit("commit-pending");
      if (controllerState !== "writable") return blockedCommit("storage-read-only");
      return null;
    }

    function commitFailure(code, state, payload, details = {}) {
      if (payload === activePayload
        && (payloadStates.get(payload) === "pending"
          || payloadStates.get(payload) === "executing")) {
        payloadStates.set(payload, "pending");
        controllerState = state;
      }
      return result({
        ok: false,
        code,
        state,
        readOnly: state === "read-only-recovery",
        recovered: false,
        profile: null,
        retryPayload: payload,
        ...details
      });
    }

    function startupResult(fields) {
      return result({
        ok: false,
        code: "no-valid-profile",
        state: "read-only-recovery",
        readOnly: true,
        recovered: false,
        installRequired: false,
        source: null,
        sourceVersion: null,
        profile: progression.defaultProfile(),
        commitPayload: null,
        ...fields
      });
    }

    function parseText(text) {
      if (typeof text !== "string") return { ok: false, code: "not-text" };
      try {
        return { ok: true, value: JSON.parse(text) };
      } catch (_) {
        return { ok: false, code: "invalid-json" };
      }
    }

    function validateMigratable(rawProfile, standaloneBests = {}) {
      const migrated = progression.migrateProfile(rawProfile, standaloneBests);
      if (!migrated.ok) {
        return {
          ok: false,
          code: migrated.code,
          sourceVersion: migrated.sourceVersion ?? null
        };
      }
      // progression.migrateProfile(null) intentionally creates a new default
      // for legacy callers. Stored transaction inputs have a stricter trust
      // boundary: they must identify an actual, supported profile version.
      if (!isPlainObject(rawProfile) || migrated.sourceVersion === null) {
        return {
          ok: false,
          code: "invalid-profile",
          sourceVersion: null
        };
      }
      return {
        ok: true,
        profile: migrated.profile,
        migrated: Boolean(migrated.migrated),
        sourceVersion: migrated.sourceVersion
      };
    }

    function exactStoragePrecondition(currentText, checkBackup = false, backupText = null) {
      return deepFreeze({
        kind: "exact-storage",
        currentText,
        checkBackup,
        backupText
      });
    }

    function profilePrecondition(profile) {
      return deepFreeze({ kind: "profile", profile });
    }

    function replaceAllPrecondition() {
      return Object.freeze({ kind: "replace-all" });
    }

    function prepareCommitPayload(
      unchangedProfile,
      proposedProfile,
      payloadOptions = {},
      internalPrecondition = null
    ) {
      const unchanged = validateMigratable(
        unchangedProfile,
        payloadOptions.standaloneBests || {}
      );
      if (!unchanged.ok) {
        return invalidCommit(
          unchanged.code === "future-profile"
            ? "future-unchanged-profile"
            : "invalid-unchanged-profile",
          { sourceVersion: unchanged.sourceVersion }
        );
      }

      if (!progression.isCanonicalProfile(proposedProfile)) {
        return invalidCommit("invalid-proposed-profile");
      }
      const proposed = validateMigratable(proposedProfile);
      if (!proposed.ok || proposed.migrated || proposed.sourceVersion !== progression.PROFILE_VERSION) {
        return invalidCommit("invalid-proposed-profile");
      }

      let recoveryText;
      if (Object.prototype.hasOwnProperty.call(payloadOptions, "recoveryText")) {
        recoveryText = payloadOptions.recoveryText;
        const parsedRecovery = parseText(recoveryText);
        if (!parsedRecovery.ok
          || !jsonEquivalent(parsedRecovery.value, unchangedProfile)
          || !validateMigratable(
            parsedRecovery.value,
            payloadOptions.standaloneBests || {}
          ).ok) {
          return invalidCommit("invalid-recovery-text");
        }
      } else {
        try {
          recoveryText = JSON.stringify(unchangedProfile);
        } catch (_) {
          return invalidCommit("invalid-unchanged-profile");
        }
      }

      let currentText;
      try {
        // Serialize progression's canonical clone, not the caller's key order.
        // A profile with reordered-but-exact keys is valid and must verify
        // against the same normalized bytes returned for memory installation.
        currentText = JSON.stringify(proposed.profile);
      } catch (_) {
        return invalidCommit("invalid-proposed-profile");
      }
      const parsedCurrent = parseText(currentText);
      if (!parsedCurrent.ok || !progression.isCanonicalProfile(parsedCurrent.value)) {
        return invalidCommit("invalid-proposed-profile");
      }

      const payload = deepFreeze({
        kind: COMMIT_PAYLOAD_KIND,
        version: COMMIT_PAYLOAD_VERSION,
        recoveryText,
        currentText,
        profile: proposed.profile
      });
      payloadPreconditions.set(
        payload,
        internalPrecondition || profilePrecondition(unchanged.profile)
      );
      return result({
        ok: true,
        code: "payload-ready",
        payload
      });
    }

    function issuePayload(payload, pendingState = "commit-pending", operation = "commit") {
      payloadStates.set(payload, "pending");
      payloadOperations.set(payload, operation);
      activePayload = payload;
      controllerState = pendingState;
      return payload;
    }

    function createCommitPayload(unchangedProfile, proposedProfile, payloadOptions = {}) {
      const blocked = mutationGuard();
      if (blocked) return blocked;
      const prepared = prepareCommitPayload(unchangedProfile, proposedProfile, payloadOptions);
      if (!prepared.ok) return prepared;
      issuePayload(prepared.payload);
      return prepared;
    }

    function readExact(key, expectedText) {
      try {
        const value = storage.getItem(key);
        return value === expectedText
          ? { ok: true }
          : { ok: false, reason: "mismatch" };
      } catch (_) {
        return { ok: false, reason: "read-failed" };
      }
    }

    function payloadConflict(payload, code, details = {}) {
      const state = code === "future-current"
        ? "protected-read-only"
        : "read-only-recovery";
      if (payload === activePayload) {
        payloadStates.set(payload, "conflicted");
        activePayload = null;
      }
      controllerState = state;
      return result({
        ok: false,
        code,
        state,
        readOnly: true,
        recovered: false,
        profile: null,
        retryPayload: null,
        ...details
      });
    }

    function conflictForObservedText(payload, slot, observedText) {
      if (typeof observedText === "string") {
        const inspected = inspectStoredText(observedText, {});
        if (!inspected.ok && inspected.code === "future-profile") {
          return payloadConflict(
            payload,
            "future-current",
            { sourceVersion: inspected.sourceVersion, slot }
          );
        }
      }
      return payloadConflict(payload, "stale-current", { slot });
    }

    function readPreconditionSlot(payload, key) {
      const read = readStartupKey(key);
      if (read.ok) return read;
      return commitFailure("precondition-read-failed", "retryable", payload, {
        currentUntouched: true,
        slot: key === BACKUP_STORAGE_KEY ? "recovery" : "current"
      });
    }

    function verifyPayloadPrecondition(payload) {
      const precondition = payloadPreconditions.get(payload);
      if (!precondition) return invalidRetry("invalid-retry-payload");
      if (precondition.kind === "replace-all") return null;

      const currentRead = readPreconditionSlot(payload, STORAGE_KEY);
      if (!currentRead.ok) return currentRead;

      if (precondition.kind === "profile") {
        if (!currentRead.exists) {
          return payloadConflict(payload, "stale-current", { slot: "current" });
        }
        const inspected = inspectStoredText(currentRead.text, {});
        if (!inspected.ok) {
          return inspected.code === "future-profile"
            ? payloadConflict(payload, "future-current", {
              sourceVersion: inspected.sourceVersion,
              slot: "current"
            })
            : payloadConflict(payload, "stale-current", { slot: "current" });
        }
        return jsonEquivalent(inspected.profile, precondition.profile)
          ? null
          : payloadConflict(payload, "stale-current", { slot: "current" });
      }

      const currentMatches = precondition.currentText === null
        ? !currentRead.exists
        : currentRead.exists && currentRead.text === precondition.currentText;
      if (!currentMatches) {
        return conflictForObservedText(
          payload,
          "current",
          currentRead.exists ? currentRead.text : null
        );
      }
      if (!precondition.checkBackup) return null;

      const backupRead = readPreconditionSlot(payload, BACKUP_STORAGE_KEY);
      if (!backupRead.ok) return backupRead;
      const backupMatches = precondition.backupText === null
        ? !backupRead.exists
        : backupRead.exists && backupRead.text === precondition.backupText;
      return backupMatches
        ? null
        : conflictForObservedText(
          payload,
          "recovery",
          backupRead.exists ? backupRead.text : null
        );
    }

    function relaxBackupPrecondition(payload) {
      const precondition = payloadPreconditions.get(payload);
      if (precondition?.kind !== "exact-storage" || !precondition.checkBackup) return;
      payloadPreconditions.set(
        payload,
        exactStoragePrecondition(precondition.currentText)
      );
    }

    function rememberVerifiedRecoveryAsCurrent(payload) {
      payloadPreconditions.set(
        payload,
        exactStoragePrecondition(
          payload.recoveryText,
          true,
          payload.recoveryText
        )
      );
    }

    function captureCurrentAfterRestoreFailure(payload) {
      const currentRead = readStartupKey(STORAGE_KEY);
      if (!currentRead.ok) {
        return payloadConflict(payload, "restore-state-unreadable");
      }
      if (currentRead.exists) {
        const inspected = inspectStoredText(currentRead.text, {});
        if (!inspected.ok && inspected.code === "future-profile") {
          return payloadConflict(payload, "future-current", {
            sourceVersion: inspected.sourceVersion,
            slot: "current"
          });
        }
        if (inspected.ok) {
          const recovery = inspectStoredText(payload.recoveryText, {});
          const current = inspectStoredText(payload.currentText, {});
          const isKnownTransactionValue = (recovery.ok
            && jsonEquivalent(inspected.profile, recovery.profile))
            || (current.ok && jsonEquivalent(inspected.profile, current.profile));
          if (!isKnownTransactionValue) {
            return payloadConflict(payload, "stale-current", { slot: "current" });
          }
        }
      }
      payloadPreconditions.set(
        payload,
        exactStoragePrecondition(
          currentRead.exists ? currentRead.text : null,
          true,
          payload.recoveryText
        )
      );
      return null;
    }

    function restoreCurrent(payload, failureKind) {
      const alreadyRestored = readExact(STORAGE_KEY, payload.recoveryText);
      if (alreadyRestored.ok) {
        rememberVerifiedRecoveryAsCurrent(payload);
        return commitFailure(
          `${failureKind}-restored`,
          "read-only-recovery",
          payload,
          { recovered: true, restoration: "already-safe" }
        );
      }

      try {
        storage.setItem(STORAGE_KEY, payload.recoveryText);
      } catch (_) {
        const conflict = captureCurrentAfterRestoreFailure(payload);
        if (conflict) return conflict;
        return commitFailure(
          "restore-failed",
          "read-only-recovery",
          payload,
          { cause: failureKind, restoration: "write-failed" }
        );
      }

      const restored = readExact(STORAGE_KEY, payload.recoveryText);
      if (!restored.ok) {
        const conflict = captureCurrentAfterRestoreFailure(payload);
        if (conflict) return conflict;
        return commitFailure(
          "restore-failed",
          "read-only-recovery",
          payload,
          { cause: failureKind, restoration: restored.reason }
        );
      }
      rememberVerifiedRecoveryAsCurrent(payload);
      return commitFailure(
        `${failureKind}-restored`,
        "read-only-recovery",
        payload,
        { recovered: true, restoration: "verified" }
      );
    }

    function isIssuedPayload(payload) {
      return Boolean(
        payload
        && typeof payload === "object"
        && payloadStates.has(payload)
        && payloadOperations.has(payload)
        && payloadPreconditions.has(payload)
        && Object.isFrozen(payload)
        && hasExactKeys(payload, COMMIT_PAYLOAD_KEYS)
        && payload.kind === COMMIT_PAYLOAD_KIND
        && payload.version === COMMIT_PAYLOAD_VERSION
        && typeof payload.recoveryText === "string"
        && typeof payload.currentText === "string"
        && progression.isCanonicalProfile(payload.profile)
        && JSON.stringify(payload.profile) === payload.currentText
      );
    }

    function completePayload(payload, details = {}) {
      const operation = payloadOperations.get(payload);
      payloadStates.set(payload, "consumed");
      activePayload = null;
      controllerState = "writable";
      return result({
        ok: true,
        code: operation === "reset" ? "reset" : "committed",
        state: "writable",
        readOnly: false,
        recovered: false,
        profile: payload.profile,
        retryPayload: null,
        ...details
      });
    }

    function restoreReset(payload, failureKind) {
      const alreadyFresh = readExact(STORAGE_KEY, payload.recoveryText);
      if (alreadyFresh.ok) {
        return completePayload(payload, {
          recovered: true,
          cause: failureKind,
          restoration: "already-safe"
        });
      }

      try {
        storage.setItem(STORAGE_KEY, payload.recoveryText);
      } catch (_) {
        return commitFailure(
          "restore-failed",
          "read-only-recovery",
          payload,
          { cause: failureKind, restoration: "write-failed" }
        );
      }
      const restored = readExact(STORAGE_KEY, payload.recoveryText);
      if (!restored.ok) {
        return commitFailure(
          "restore-failed",
          "read-only-recovery",
          payload,
          { cause: failureKind, restoration: restored.reason }
        );
      }
      return completePayload(payload, {
        recovered: true,
        cause: failureKind,
        restoration: "verified"
      });
    }

    function retry(payload) {
      if (payloadStates.get(payload) === "consumed") {
        return invalidRetry("commit-already-applied");
      }
      if (!isIssuedPayload(payload)) return invalidRetry("invalid-retry-payload");
      if (payloadStates.get(payload) === "executing") {
        return invalidRetry("commit-in-progress");
      }
      if (payload !== activePayload || payloadStates.get(payload) !== "pending") {
        return invalidRetry("invalid-retry-payload");
      }
      const operation = payloadOperations.get(payload);
      payloadStates.set(payload, "executing");

      // Revalidate both serialized sides immediately before any write. This is
      // intentionally redundant with payload construction: the commit boundary
      // remains safe even if it is called much later.
      const parsedRecovery = parseText(payload.recoveryText);
      const parsedCurrent = parseText(payload.currentText);
      if (!parsedRecovery.ok || !validateMigratable(parsedRecovery.value).ok) {
        payloadStates.set(payload, "pending");
        return invalidRetry("invalid-retry-payload");
      }
      if (!parsedCurrent.ok || !progression.isCanonicalProfile(parsedCurrent.value)) {
        payloadStates.set(payload, "pending");
        return invalidRetry("invalid-retry-payload");
      }

      const preconditionFailure = verifyPayloadPrecondition(payload);
      if (preconditionFailure) return preconditionFailure;

      try {
        storage.setItem(BACKUP_STORAGE_KEY, payload.recoveryText);
      } catch (_) {
        relaxBackupPrecondition(payload);
        return commitFailure("recovery-write-failed", "retryable", payload, {
          currentUntouched: true
        });
      }
      const recoveryVerified = readExact(BACKUP_STORAGE_KEY, payload.recoveryText);
      if (!recoveryVerified.ok) {
        relaxBackupPrecondition(payload);
        return commitFailure("recovery-verification-failed", "retryable", payload, {
          currentUntouched: true,
          verification: recoveryVerified.reason
        });
      }

      try {
        storage.setItem(STORAGE_KEY, payload.currentText);
      } catch (_) {
        return operation === "reset"
          ? restoreReset(payload, "current-write-failed")
          : restoreCurrent(payload, "current-write-failed");
      }
      const currentVerified = readExact(STORAGE_KEY, payload.currentText);
      if (!currentVerified.ok) {
        return operation === "reset"
          ? restoreReset(payload, "current-verification-failed")
          : restoreCurrent(payload, "current-verification-failed");
      }

      // Consume authority before exposing success. Reentrant or later replay
      // cannot perform even the recovery write.
      return completePayload(payload);
    }

    function abandon(payload) {
      if (!startupInspected) return invalidRetry("startup-not-inspected");
      if (payloadStates.get(payload) === "abandoned") {
        return invalidRetry("commit-already-abandoned");
      }
      if (!isIssuedPayload(payload)
        || payload !== activePayload
        || payloadStates.get(payload) !== "pending") {
        return invalidRetry("invalid-retry-payload");
      }

      // This is an explicit choice to continue without persistence. Consume
      // the exact transaction authority without touching either storage slot,
      // so neither Retry nor a replayed abandon can apply it later.
      payloadStates.set(payload, "abandoned");
      activePayload = null;
      controllerState = "session-read-only";
      return result({
        ok: true,
        code: "abandoned-session",
        state: "session-read-only",
        readOnly: true,
        recovered: false,
        profile: null,
        retryPayload: null
      });
    }

    function commit(unchangedProfile, proposedProfile) {
      const blocked = mutationGuard();
      if (blocked) return blocked;
      const prepared = prepareCommitPayload(unchangedProfile, proposedProfile);
      if (!prepared.ok) return prepared;
      issuePayload(prepared.payload);
      return retry(prepared.payload);
    }

    function reset() {
      if (!startupInspected) return blockedCommit("startup-not-inspected");
      if (activePayload) return blockedCommit("commit-pending");

      // Reset intentionally differs from a normal commit: both sides contain
      // the canonical fresh profile. The erased profile therefore cannot
      // survive as a recovery copy, and verified restoration of fresh current
      // is itself a successful replace-all transaction.
      const fresh = progression.defaultProfile();
      const prepared = prepareCommitPayload(
        fresh,
        fresh,
        {},
        replaceAllPrecondition()
      );
      if (!prepared.ok) return prepared;
      issuePayload(prepared.payload, "commit-pending", "reset");
      return retry(prepared.payload);
    }

    function readStartupKey(key) {
      try {
        const value = storage.getItem(key);
        if (value === null) return { ok: true, exists: false, text: null };
        if (typeof value !== "string") return { ok: false, code: "invalid-storage-value" };
        return { ok: true, exists: true, text: value };
      } catch (_) {
        return { ok: false, code: "storage-read-failed" };
      }
    }

    function inspectStoredText(text, standaloneBests) {
      const parsed = parseText(text);
      if (!parsed.ok) return { ok: false, code: parsed.code, sourceVersion: null };
      const migrated = validateMigratable(parsed.value, standaloneBests);
      if (!migrated.ok) return migrated;
      return {
        ok: true,
        rawProfile: parsed.value,
        profile: migrated.profile,
        migrated: migrated.migrated,
        sourceVersion: migrated.sourceVersion
      };
    }

    function startupPayload(candidate, standaloneBests, precondition) {
      return prepareCommitPayload(candidate.rawProfile, candidate.profile, {
        recoveryText: candidate.text,
        standaloneBests
      }, precondition);
    }

    function finishStartup(fields) {
      const pendingPayload = fields.commitPayload || null;
      startupInspected = true;
      if (pendingPayload) issuePayload(pendingPayload, fields.state);
      else controllerState = fields.state;
      return startupResult(fields);
    }

    function inspectStartup(inspectOptions = {}) {
      if (startupInspected) {
        return startupResult({
          code: "startup-already-inspected",
          state: controllerState,
          readOnly: isReadOnlyState(),
          profile: null
        });
      }
      const standaloneBests = isPlainObject(inspectOptions.standaloneBests)
        ? inspectOptions.standaloneBests
        : {};
      const currentRead = readStartupKey(STORAGE_KEY);
      if (!currentRead.ok) {
        return finishStartup({
          code: "storage-unavailable",
          state: "session-read-only",
          readOnly: true
        });
      }

      if (currentRead.exists) {
        const current = inspectStoredText(currentRead.text, standaloneBests);
        if (!current.ok && current.code === "future-profile") {
          return finishStartup({
            code: "future-profile",
            state: "protected-read-only",
            readOnly: true,
            source: "current",
            sourceVersion: current.sourceVersion
          });
        }
        if (current.ok && !current.migrated) {
          return finishStartup({
            ok: true,
            code: "current",
            state: "writable",
            readOnly: false,
            source: "current",
            sourceVersion: current.sourceVersion,
            profile: current.profile
          });
        }
        if (current.ok) {
          const candidate = { ...current, text: currentRead.text };
          const prepared = startupPayload(
            candidate,
            standaloneBests,
            exactStoragePrecondition(currentRead.text)
          );
          if (!prepared.ok) {
            return finishStartup({
              code: "migration-payload-invalid",
              state: "read-only-recovery",
              readOnly: true,
              source: "current",
              sourceVersion: current.sourceVersion
            });
          }
          return finishStartup({
            ok: true,
            code: "migration-ready",
            state: "install-required",
            readOnly: false,
            installRequired: true,
            source: "current",
            sourceVersion: current.sourceVersion,
            profile: current.profile,
            commitPayload: prepared.payload
          });
        }
      }

      const backupRead = readStartupKey(BACKUP_STORAGE_KEY);
      if (!backupRead.ok) {
        return finishStartup({
          code: "storage-unavailable",
          state: "session-read-only",
          readOnly: true
        });
      }
      if (backupRead.exists) {
        const backup = inspectStoredText(backupRead.text, standaloneBests);
        if (!backup.ok && backup.code === "future-profile") {
          return finishStartup({
            code: "future-recovery-profile",
            state: "protected-read-only",
            readOnly: true,
            source: "recovery",
            sourceVersion: backup.sourceVersion
          });
        }
        if (backup.ok) {
          const candidate = { ...backup, text: backupRead.text };
          const prepared = startupPayload(
            candidate,
            standaloneBests,
            exactStoragePrecondition(
              currentRead.exists ? currentRead.text : null,
              true,
              backupRead.text
            )
          );
          if (!prepared.ok) {
            return finishStartup({
              code: "recovery-payload-invalid",
              state: "read-only-recovery",
              readOnly: true,
              source: "recovery",
              sourceVersion: backup.sourceVersion
            });
          }
          return finishStartup({
            ok: true,
            code: "recovery-ready",
            state: "recovery-required",
            readOnly: false,
            recovered: true,
            installRequired: true,
            source: "recovery",
            sourceVersion: backup.sourceVersion,
            profile: backup.profile,
            commitPayload: prepared.payload
          });
        }
      }

      if (!currentRead.exists && !backupRead.exists) {
        const fresh = progression.defaultProfile();
        const prepared = prepareCommitPayload(
          fresh,
          fresh,
          {},
          exactStoragePrecondition(null, true, null)
        );
        if (!prepared.ok) {
          return finishStartup({
            code: "fresh-payload-invalid",
            state: "session-read-only",
            readOnly: true
          });
        }
        return finishStartup({
          ok: true,
          code: "fresh-ready",
          state: "install-required",
          readOnly: false,
          installRequired: true,
          source: "fresh",
          sourceVersion: progression.PROFILE_VERSION,
          profile: fresh,
          commitPayload: prepared.payload
        });
      }

      return finishStartup({
        code: "no-valid-profile",
        state: "read-only-recovery",
        readOnly: true
      });
    }

    return Object.freeze({
      inspectStartup,
      createCommitPayload,
      commit,
      retry,
      abandon,
      reset
    });
  }

  return Object.freeze({
    STORAGE_KEY,
    BACKUP_STORAGE_KEY,
    COMMIT_PAYLOAD_KIND,
    COMMIT_PAYLOAD_VERSION,
    createProfileStorage
  });
});
