(function initializeMothchorusAudio(root, factory) {
  "use strict";

  const api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.MothchorusAudio = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createAudioApi(root) {
  "use strict";

  const LAYER_FREQUENCIES = Object.freeze([146.83, 220, 293.66, 369.99]);
  const LAYER_TYPES = Object.freeze(["sine", "triangle", "sine", "triangle"]);
  const MAX_TRANSIENTS = 32;

  function clamp(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, Number(value) || 0));
  }

  function safeDisconnect(node) {
    try { node?.disconnect?.(); } catch (_error) { /* already disconnected */ }
  }

  function safeStop(node, when) {
    try { node?.stop?.(when); } catch (_error) { /* already stopped */ }
  }

  class ChorusAudio {
    constructor({ enabled = true } = {}) {
      this.enabled = Boolean(enabled);
      this.context = null;
      this.master = null;
      this.runGain = null;
      this.layers = [];
      this.transients = new Set();
      this.destroyed = false;
      this.paused = false;
      this.runStarted = false;
      this.lastVoiceCount = 24;
      this.createdContexts = 0;
      this.lastRejectedAt = -Infinity;
    }

    ensureContext() {
      if (this.destroyed || !this.enabled) return null;
      if (this.context) return this.context;
      const Context = root.AudioContext || root.webkitAudioContext;
      if (!Context) return null;
      try {
        this.context = new Context();
        this.createdContexts += 1;
        this.master = this.context.createGain();
        this.master.gain.value = 0.7;
        this.master.connect(this.context.destination);
      } catch (_error) {
        this.context = null;
        this.master = null;
      }
      return this.context;
    }

    async resume() {
      const context = this.ensureContext();
      if (!context) return false;
      try {
        if (context.state === "suspended") await context.resume();
      } catch (_error) {
        return false;
      }
      return context.state === "running";
    }

    setEnabled(value) {
      this.enabled = Boolean(value);
      if (!this.enabled) {
        this.disposeRun();
        if (this.master && this.context) {
          const now = this.context.currentTime;
          this.master.gain.cancelScheduledValues(now);
          this.master.gain.setTargetAtTime(0.0001, now, 0.015);
        }
        return;
      }
      const context = this.ensureContext();
      if (context && this.master) {
        const now = context.currentTime;
        this.master.gain.cancelScheduledValues(now);
        this.master.gain.setTargetAtTime(0.7, now, 0.025);
      }
    }

    startRun() {
      if (!this.enabled || this.destroyed) return false;
      const context = this.ensureContext();
      if (!context || !this.master) return false;
      this.disposeRun();
      const now = context.currentTime;
      this.runGain = context.createGain();
      this.runGain.gain.setValueAtTime(0.0001, now);
      this.runGain.gain.exponentialRampToValueAtTime(0.28, now + 0.9);
      this.runGain.connect(this.master);
      this.layers = LAYER_FREQUENCIES.map((frequency, index) => {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        const filter = context.createBiquadFilter();
        oscillator.type = LAYER_TYPES[index];
        oscillator.frequency.setValueAtTime(frequency, now);
        oscillator.detune.setValueAtTime(index % 2 ? 4 : -3, now);
        filter.type = "lowpass";
        filter.frequency.setValueAtTime(1150 + index * 390, now);
        filter.Q.setValueAtTime(0.4, now);
        gain.gain.setValueAtTime(0.0001, now);
        oscillator.connect(filter);
        filter.connect(gain);
        gain.connect(this.runGain);
        oscillator.start(now);
        return { oscillator, gain, filter, index };
      });
      this.runStarted = true;
      this.paused = false;
      this.update({ activeVoiceCount: this.lastVoiceCount, phaseIndex: 0 });
      return true;
    }

    update(state = {}) {
      if (!this.enabled || !this.context || !this.runStarted || this.paused) return;
      const voices = clamp(state.activeVoiceCount ?? state.finalVoiceCount ?? 24, 0, 24);
      const phase = clamp(state.phaseIndex, 0, 2);
      const health = voices / 24;
      const now = this.context.currentTime;
      this.lastVoiceCount = voices;
      this.layers.forEach((layer, index) => {
        const threshold = index * 0.19;
        const presence = clamp((health - threshold) / 0.45, 0, 1);
        const phaseLift = index <= phase ? 1 : 0.7;
        const target = Math.max(0.0001, presence * phaseLift * (0.075 - index * 0.008));
        layer.gain.gain.cancelScheduledValues(now);
        layer.gain.gain.setTargetAtTime(target, now, 0.16);
        const drift = Number(state.windX ?? state.wind) || 0;
        layer.oscillator.detune.cancelScheduledValues(now);
        layer.oscillator.detune.setTargetAtTime((index % 2 ? 1 : -1) * clamp(drift * 0.035, -9, 9), now, 0.18);
      });
    }

    transientTone({ frequency = 440, duration = 0.18, gain = 0.08, type = "sine", detune = 0, delay = 0, destination = null } = {}) {
      if (!this.enabled || !this.context || !this.master || this.destroyed) return null;
      const context = this.context;
      while (this.transients.size >= MAX_TRANSIENTS) {
        const oldest = this.transients.values().next().value;
        if (!oldest) break;
        this.transients.delete(oldest);
        safeStop(oldest.oscillator, context.currentTime + 0.005);
        safeDisconnect(oldest.oscillator);
        safeDisconnect(oldest.envelope);
      }
      const start = context.currentTime + Math.max(0, delay);
      const end = start + Math.max(0.035, duration);
      const oscillator = context.createOscillator();
      const envelope = context.createGain();
      oscillator.type = type;
      oscillator.frequency.setValueAtTime(Math.max(20, frequency), start);
      oscillator.detune.setValueAtTime(detune, start);
      envelope.gain.setValueAtTime(0.0001, start);
      envelope.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), start + Math.min(0.025, duration * 0.25));
      envelope.gain.exponentialRampToValueAtTime(0.0001, end);
      oscillator.connect(envelope);
      envelope.connect(destination || this.runGain || this.master);
      const record = { oscillator, envelope };
      this.transients.add(record);
      oscillator.addEventListener?.("ended", () => {
        this.transients.delete(record);
        safeDisconnect(oscillator);
        safeDisconnect(envelope);
      }, { once: true });
      oscillator.start(start);
      oscillator.stop(end + 0.025);
      return record;
    }

    pulse(side, accepted = true) {
      if (!accepted) {
        const now = this.context?.currentTime ?? 0;
        if (now - this.lastRejectedAt < 0.05) return;
        this.lastRejectedAt = now;
        this.transientTone({ frequency: side === "left" ? 261.63 : 329.63, duration: 0.07, gain: 0.018, type: "sine" });
        return;
      }
      if (side === "left") {
        this.transientTone({ frequency: 293.66, duration: 0.16, gain: 0.065, type: "triangle" });
        this.transientTone({ frequency: 440, duration: 0.22, gain: 0.025, delay: 0.025 });
      } else {
        this.transientTone({ frequency: 369.99, duration: 0.16, gain: 0.06, type: "triangle" });
        this.transientTone({ frequency: 554.37, duration: 0.22, gain: 0.023, delay: 0.025 });
      }
    }

    chord(quality = "soft") {
      const strength = quality === "perfect" ? 1 : quality === "clear" ? 0.78 : 0.58;
      [293.66, 369.99, 440].forEach((frequency, index) => {
        this.transientTone({
          frequency,
          duration: 0.62 + strength * 0.3,
          gain: (0.045 + strength * 0.025) / (index === 1 ? 1.12 : 1),
          type: index === 1 ? "triangle" : "sine",
          delay: index * 0.012,
        });
      });
    }

    gate(full = false) {
      this.transientTone({ frequency: full ? 587.33 : 493.88, duration: 0.24, gain: 0.055, type: "sine" });
      if (full) this.transientTone({ frequency: 880, duration: 0.34, gain: 0.025, delay: 0.04 });
    }

    scatter() {
      this.transientTone({ frequency: 196, duration: 0.24, gain: 0.038, type: "triangle", detune: -22 });
      this.transientTone({ frequency: 174.61, duration: 0.34, gain: 0.022, type: "sine", delay: 0.04 });
    }

    rescue() {
      this.transientTone({ frequency: 440, duration: 0.16, gain: 0.046, type: "sine" });
      this.transientTone({ frequency: 659.25, duration: 0.32, gain: 0.035, type: "triangle", delay: 0.055 });
    }

    bloom() {
      [523.25, 659.25, 783.99].forEach((frequency, index) => {
        this.transientTone({ frequency, duration: 0.42, gain: 0.035, delay: index * 0.055, type: "sine" });
      });
    }

    phase(index) {
      const rootFrequency = index >= 2 ? 220 : 196;
      [1, 1.25, 1.5].forEach((ratio, note) => {
        this.transientTone({ frequency: rootFrequency * ratio, duration: 0.55, gain: 0.036, delay: note * 0.08, type: "triangle" });
      });
    }

    finale(finalVoiceCount = 24) {
      const health = clamp(finalVoiceCount, 0, 24) / 24;
      const frequencies = [293.66, 369.99, 440, 587.33];
      frequencies.forEach((frequency, index) => {
        if (index > 0 && health < index * 0.2) return;
        this.transientTone({
          frequency,
          duration: 1.5 + health,
          gain: 0.04 + health * 0.02,
          delay: index * 0.11,
          type: index % 2 ? "triangle" : "sine",
        });
      });
    }

    handleEvents(events, state) {
      if (!Array.isArray(events) || !this.enabled) return;
      events.forEach((event) => {
        if (!event) return;
        if (event.type === "pulse") this.pulse(event.side, event.accepted !== false);
        else if (event.type === "chord") this.chord(event.quality);
        else if (event.type === "gate" || event.type === "gate-cleared") this.gate(Boolean(event.full || event.fullChorus));
        else if (event.type === "scatter") this.scatter();
        else if (event.type === "rescue") this.rescue();
        else if (event.type === "bloom" || event.type === "moon-bloom") this.bloom();
        else if (event.type === "phase") this.phase(event.phaseIndex ?? state?.phaseIndex ?? 0);
        else if (event.type === "complete" || event.type === "finale") this.finale(state?.activeVoiceCount ?? state?.finalVoiceCount ?? 24);
      });
    }

    pause() {
      this.disposeRun();
      this.paused = true;
    }

    resumeRun() {
      if (!this.runStarted) {
        this.paused = false;
        this.startRun();
        return;
      }
      this.paused = false;
      if (!this.context || !this.runGain) return;
      const now = this.context.currentTime;
      this.runGain.gain.cancelScheduledValues(now);
      this.runGain.gain.setTargetAtTime(0.28, now, 0.08);
    }

    disposeRun() {
      if (this.context) {
        const now = this.context.currentTime;
        this.layers.forEach((layer) => {
          safeStop(layer.oscillator, now + 0.015);
          safeDisconnect(layer.oscillator);
          safeDisconnect(layer.filter);
          safeDisconnect(layer.gain);
        });
        this.transients.forEach((record) => {
          safeStop(record.oscillator, now + 0.005);
          safeDisconnect(record.oscillator);
          safeDisconnect(record.envelope);
        });
      }
      this.layers.length = 0;
      this.transients.clear();
      safeDisconnect(this.runGain);
      this.runGain = null;
      this.runStarted = false;
      this.paused = false;
    }

    diagnostics() {
      return Object.freeze({
        enabled: this.enabled,
        contextState: this.context?.state || "none",
        createdContexts: this.createdContexts,
        sustainedLayers: this.layers.length,
        transientCount: this.transients.size,
        runStarted: this.runStarted,
        paused: this.paused,
        destroyed: this.destroyed,
      });
    }

    destroy() {
      if (this.destroyed) return;
      this.disposeRun();
      safeDisconnect(this.master);
      const context = this.context;
      this.context = null;
      this.master = null;
      this.destroyed = true;
      try { context?.close?.(); } catch (_error) { /* closing is best effort */ }
    }
  }

  return Object.freeze({ ChorusAudio, LAYER_FREQUENCIES, MAX_TRANSIENTS });
});
