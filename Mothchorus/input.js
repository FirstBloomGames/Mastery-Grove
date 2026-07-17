(function initializeMothchorusInput(root, factory) {
  "use strict";

  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.MothchorusInput = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createMothchorusInput() {
  "use strict";

  const SIDES = Object.freeze({ LEFT: "left", RIGHT: "right" });
  const KEY_TO_SIDE = Object.freeze({
    a: SIDES.LEFT,
    arrowleft: SIDES.LEFT,
    d: SIDES.RIGHT,
    arrowright: SIDES.RIGHT,
  });

  function eventTargetOrNull(value, label) {
    if (value === null || value === undefined) return null;
    if (typeof value.addEventListener !== "function" || typeof value.removeEventListener !== "function") {
      throw new TypeError(`${label} must implement addEventListener and removeEventListener.`);
    }
    return value;
  }

  function requiredEventTarget(value, label) {
    const target = eventTargetOrNull(value, label);
    if (!target) throw new TypeError(`${label} is required.`);
    return target;
  }

  function normalizedTick(value) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.max(0, Math.trunc(number)) : 0;
  }

  function editableTarget(target) {
    if (!target || typeof target !== "object") return false;
    if (target.isContentEditable) return true;
    const tagName = typeof target.tagName === "string" ? target.tagName.toLowerCase() : "";
    return tagName === "input" || tagName === "textarea" || tagName === "select";
  }

  class InputController {
    constructor(options = {}) {
      this.leftTarget = requiredEventTarget(options.leftTarget, "leftTarget");
      this.rightTarget = requiredEventTarget(options.rightTarget, "rightTarget");
      this.windowTarget = eventTargetOrNull(
        options.windowTarget ?? (typeof window !== "undefined" ? window : null),
        "windowTarget",
      );
      this.documentTarget = eventTargetOrNull(
        options.documentTarget ?? (typeof document !== "undefined" ? document : null),
        "documentTarget",
      );
      this.getTick = typeof options.getTick === "function" ? options.getTick : () => 0;
      this.isEnabled = typeof options.isEnabled === "function" ? options.isEnabled : () => true;
      this.queueLimit = Number.isInteger(options.queueLimit) && options.queueLimit > 0
        ? options.queueLimit
        : 128;

      this.queue = [];
      this.activePointers = new Map();
      this.listeners = [];
      this.sequence = 0;
      this.attached = false;
      this.destroyed = false;
      this.metrics = {
        attachCalls: 0,
        listenerAdds: 0,
        listenerRemoves: 0,
        actionsQueued: 0,
        actionsDrained: 0,
        actionsDiscarded: 0,
        queueDrops: 0,
        ignoredRepeats: 0,
        ignoredClicks: 0,
        ignoredButtons: 0,
        ignoredDisabled: 0,
        ignoredEditable: 0,
        duplicatePointers: 0,
        pointerCaptures: 0,
        pointerReleases: 0,
        captureErrors: 0,
        pointerCancels: 0,
        lostCaptures: 0,
        blurClears: 0,
        visibilityClears: 0,
        manualClears: 0,
        destroyCalls: 0,
      };

      this.bound = Object.freeze({
        leftPointerDown: (event) => this.handlePointerDown(SIDES.LEFT, this.leftTarget, event),
        rightPointerDown: (event) => this.handlePointerDown(SIDES.RIGHT, this.rightTarget, event),
        pointerUp: (event) => this.releasePointer(event, "pointerup"),
        pointerCancel: (event) => this.releasePointer(event, "pointercancel"),
        lostPointerCapture: (event) => this.releasePointer(event, "lostpointercapture"),
        leftClick: (event) => this.handleClick(SIDES.LEFT, event),
        rightClick: (event) => this.handleClick(SIDES.RIGHT, event),
        keyDown: (event) => this.handleKeyDown(event),
        blur: () => this.clear("blur"),
        visibilityChange: () => {
          if (this.documentTarget?.hidden === true) this.clear("visibility");
        },
      });
    }

    listen(target, type, listener) {
      if (!target) return;
      target.addEventListener(type, listener);
      this.listeners.push({ target, type, listener });
      this.metrics.listenerAdds += 1;
    }

    attach() {
      this.metrics.attachCalls += 1;
      if (this.destroyed || this.attached) return false;

      this.listen(this.leftTarget, "pointerdown", this.bound.leftPointerDown);
      this.listen(this.rightTarget, "pointerdown", this.bound.rightPointerDown);
      for (const target of [this.leftTarget, this.rightTarget]) {
        this.listen(target, "pointerup", this.bound.pointerUp);
        this.listen(target, "pointercancel", this.bound.pointerCancel);
        this.listen(target, "lostpointercapture", this.bound.lostPointerCapture);
      }
      this.listen(this.leftTarget, "click", this.bound.leftClick);
      this.listen(this.rightTarget, "click", this.bound.rightClick);
      // Pointer capture is best-effort on older mobile browsers. Window-level
      // release handlers guarantee an ID cannot remain stuck when a finger ends
      // outside its semantic pulse zone.
      this.listen(this.windowTarget, "pointerup", this.bound.pointerUp);
      this.listen(this.windowTarget, "pointercancel", this.bound.pointerCancel);
      this.listen(this.windowTarget, "keydown", this.bound.keyDown);
      this.listen(this.windowTarget, "blur", this.bound.blur);
      this.listen(this.documentTarget, "visibilitychange", this.bound.visibilityChange);
      this.attached = true;
      return true;
    }

    enqueue(side, source, pointerId = null) {
      if (!this.isEnabled()) {
        this.metrics.ignoredDisabled += 1;
        return null;
      }
      if (this.queue.length >= this.queueLimit) {
        this.queue.shift();
        this.metrics.queueDrops += 1;
        this.metrics.actionsDiscarded += 1;
      }
      const action = Object.freeze({
        type: "pulse",
        side,
        tick: normalizedTick(this.getTick()),
        sequence: ++this.sequence,
        source,
        pointerId,
      });
      this.queue.push(action);
      this.metrics.actionsQueued += 1;
      return action;
    }

    handlePointerDown(side, target, event) {
      if (this.destroyed || !this.isEnabled()) {
        this.metrics.ignoredDisabled += 1;
        return;
      }
      if (!Number.isInteger(event?.pointerId)) return;
      if (typeof event.button === "number" && event.button > 0) {
        this.metrics.ignoredButtons += 1;
        return;
      }
      if (this.activePointers.has(event.pointerId)) {
        this.metrics.duplicatePointers += 1;
        return;
      }

      event.preventDefault?.();
      this.activePointers.set(event.pointerId, { side, target });
      try {
        target.setPointerCapture?.(event.pointerId);
        if (typeof target.setPointerCapture === "function") this.metrics.pointerCaptures += 1;
      } catch (_error) {
        this.metrics.captureErrors += 1;
      }
      const pointerType = typeof event.pointerType === "string" && event.pointerType
        ? event.pointerType
        : "unknown";
      this.enqueue(side, `pointer:${pointerType}`, event.pointerId);
    }

    releasePointer(event, reason) {
      const pointerId = event?.pointerId;
      if (!Number.isInteger(pointerId)) return false;
      const active = this.activePointers.get(pointerId);
      if (!active) return false;
      this.activePointers.delete(pointerId);

      if (reason === "pointercancel") this.metrics.pointerCancels += 1;
      if (reason === "lostpointercapture") this.metrics.lostCaptures += 1;
      if (reason !== "lostpointercapture") this.releaseCapture(active.target, pointerId);
      return true;
    }

    releaseCapture(target, pointerId) {
      if (typeof target?.releasePointerCapture !== "function") return;
      try {
        target.releasePointerCapture(pointerId);
        this.metrics.pointerReleases += 1;
      } catch (_error) {
        this.metrics.captureErrors += 1;
      }
    }

    handleClick(side, event) {
      if (this.destroyed) return;
      if (event?.detail !== 0) {
        this.metrics.ignoredClicks += 1;
        return;
      }
      if (!this.isEnabled()) {
        this.metrics.ignoredDisabled += 1;
        return;
      }
      event.preventDefault?.();
      this.enqueue(side, "keyboard-activation", null);
    }

    handleKeyDown(event) {
      if (this.destroyed) return;
      const key = typeof event?.key === "string" ? event.key.toLowerCase() : "";
      const side = KEY_TO_SIDE[key];
      if (!side) return;
      if (!this.isEnabled()) {
        this.metrics.ignoredDisabled += 1;
        return;
      }
      if (editableTarget(event.target)) {
        this.metrics.ignoredEditable += 1;
        return;
      }
      if (event.ctrlKey || event.altKey || event.metaKey) return;

      event.preventDefault?.();
      if (event.repeat) {
        this.metrics.ignoredRepeats += 1;
        return;
      }
      this.enqueue(side, "keyboard", null);
    }

    drain() {
      if (!this.queue.length) return [];
      const actions = this.queue.slice();
      this.queue.length = 0;
      this.metrics.actionsDrained += actions.length;
      return actions;
    }

    clear(reason = "manual") {
      for (const [pointerId, active] of this.activePointers) {
        this.releaseCapture(active.target, pointerId);
      }
      this.activePointers.clear();
      if (this.queue.length) {
        this.metrics.actionsDiscarded += this.queue.length;
        this.queue.length = 0;
      }
      if (reason === "blur") this.metrics.blurClears += 1;
      else if (reason === "visibility") this.metrics.visibilityClears += 1;
      else this.metrics.manualClears += 1;
    }

    diagnostics() {
      return Object.freeze({
        attached: this.attached,
        destroyed: this.destroyed,
        queueDepth: this.queue.length,
        activePointerCount: this.activePointers.size,
        sequence: this.sequence,
        ...this.metrics,
      });
    }

    destroy() {
      this.metrics.destroyCalls += 1;
      if (this.destroyed) return false;
      this.clear("destroy");
      for (const { target, type, listener } of this.listeners) {
        target.removeEventListener(type, listener);
        this.metrics.listenerRemoves += 1;
      }
      this.listeners.length = 0;
      this.attached = false;
      this.destroyed = true;
      return true;
    }
  }

  return Object.freeze({ InputController, SIDES });
});
