(function initializeMothchorusRenderer(root, factory) {
  "use strict";

  const api = factory(root.MothchorusProjection);
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.MothchorusRenderer = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createRendererApi(Projection) {
  "use strict";

  const WORLD_SIZE = 1000;
  const TAU = Math.PI * 2;
  const EFFECT_CAPS = Object.freeze({
    full: Object.freeze({ trails: 192, particles: 96, finale: 180, stars: 86, motes: 12 }),
    low: Object.freeze({ trails: 72, particles: 42, finale: 72, stars: 48, motes: 5 }),
    reduced: Object.freeze({ trails: 0, particles: 24, finale: 32, stars: 42, motes: 0 }),
  });

  function clamp(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, Number(value) || 0));
  }

  function lerp(a, b, amount) {
    return a + (b - a) * amount;
  }

  function easeOut(value) {
    const t = clamp(value, 0, 1);
    return 1 - (1 - t) * (1 - t) * (1 - t);
  }

  function smooth(value) {
    const t = clamp(value, 0, 1);
    return t * t * (3 - 2 * t);
  }

  function finite(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function makeRandom(seed) {
    let value = (Number(seed) >>> 0) || 0x6d2b79f5;
    return function random() {
      value = (Math.imul(value ^ (value >>> 15), 1 | value) + 0x6d2b79f5) >>> 0;
      value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);
      return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    };
  }

  function normalizeMode(mode, reducedMotion) {
    if (reducedMotion) return "reduced";
    return mode === "low" ? "low" : "full";
  }

  class ChorusRenderer {
    constructor({ canvas, effects = "full", reducedMotion = false, seed = 0x51d3a7 } = {}) {
      if (!canvas || typeof canvas.getContext !== "function") throw new TypeError("A canvas is required.");
      this.canvas = canvas;
      this.ctx = canvas.getContext("2d", { alpha: false, desynchronized: true });
      if (!this.ctx) throw new Error("Canvas 2D is unavailable.");
      this.effects = effects;
      this.reducedMotion = Boolean(reducedMotion);
      this.random = makeRandom(seed);
      this.cssWidth = 1;
      this.cssHeight = 1;
      this.dpr = 1;
      this.scale = 1;
      this.offsetX = 0;
      this.offsetY = 0;
      this.trails = [];
      this.particles = [];
      this.pulses = [];
      this.lastTrailTick = -1;
      this.frameCount = 0;
      this.destroyed = false;
      this.stars = [];
      this.motes = [];
      this.branches = [];
      this.leaves = [];
      this.buildScenery();
      this.worldGradientCache = null;
    }

    get caps() {
      return EFFECT_CAPS[normalizeMode(this.effects, this.reducedMotion)];
    }

    buildScenery() {
      this.stars.length = 0;
      for (let index = 0; index < EFFECT_CAPS.full.stars; index += 1) {
        this.stars.push({
          x: 35 + this.random() * 930,
          y: 18 + this.random() * 590,
          r: 0.45 + this.random() * 1.45,
          a: 0.2 + this.random() * 0.58,
          phase: this.random() * TAU,
        });
      }

      this.motes.length = 0;
      for (let index = 0; index < EFFECT_CAPS.full.motes; index += 1) {
        this.motes.push({
          x: 80 + this.random() * 840,
          y: 170 + this.random() * 660,
          size: 1 + this.random() * 1.8,
          phase: this.random() * TAU,
          speed: 0.2 + this.random() * 0.55,
        });
      }

      this.branches.length = 0;
      const addBranch = (x1, y1, x2, y2, width, depth, side) => {
        this.branches.push({ x1, y1, x2, y2, width, depth });
        if (depth <= 0) return;
        const dx = x2 - x1;
        const dy = y2 - y1;
        const length = Math.hypot(dx, dy) * (0.62 + this.random() * 0.08);
        const baseAngle = Math.atan2(dy, dx);
        const spread = 0.38 + this.random() * 0.23;
        const directions = depth > 2 ? [-1, 1] : [side || (this.random() < 0.5 ? -1 : 1)];
        directions.forEach((direction) => {
          const angle = baseAngle + direction * spread;
          const endX = x2 + Math.cos(angle) * length;
          const endY = y2 + Math.sin(angle) * length;
          addBranch(x2, y2, endX, endY, width * 0.68, depth - 1, -direction);
        });
      };
      addBranch(500, 1050, 500, 675, 48, 5, 1);
      addBranch(487, 860, 310, 664, 22, 4, -1);
      addBranch(513, 835, 700, 640, 24, 4, 1);

      this.leaves.length = 0;
      const leafRandom = makeRandom(0xc4017e);
      for (let index = 0; index < 132; index += 1) {
        const angle = leafRandom() * TAU;
        const radius = Math.sqrt(leafRandom()) * 370;
        const x = 500 + Math.cos(angle) * radius * (0.78 + leafRandom() * 0.28);
        const y = 610 + Math.sin(angle) * radius * 0.58 - radius * 0.16;
        if (y > 760 || x < 55 || x > 945) continue;
        this.leaves.push({
          x,
          y,
          size: 8 + leafRandom() * 17,
          rotation: angle + Math.PI * 0.5,
          depth: leafRandom(),
          phase: leafRandom() * TAU,
        });
      }
    }

    invalidateWorldGradientCache() {
      this.worldGradientCache = null;
    }

    ensureWorldGradientCache() {
      if (this.worldGradientCache) return this.worldGradientCache;
      const ctx = this.ctx;
      if (typeof ctx.createLinearGradient !== "function" || typeof ctx.createRadialGradient !== "function") {
        return null;
      }

      // Called immediately after worldTransform(). Canvas gradients capture
      // the current coordinate space, so a backing-store resize invalidates
      // this cache and the next frame rebuilds it in the new world transform.
      const palettes = [
        ["#0b0d25", "#17102f", "#291536"],
        ["#0b1028", "#1b1235", "#351a42"],
        ["#11102d", "#26163c", "#4a274e"],
      ];
      const skies = palettes.map((colors) => {
        const gradient = ctx.createLinearGradient(0, 0, 0, WORLD_SIZE);
        gradient.addColorStop(0, colors[0]);
        gradient.addColorStop(0.58, colors[1]);
        gradient.addColorStop(1, colors[2]);
        return gradient;
      });
      const moonGlow = ctx.createRadialGradient(500, 180, 5, 500, 180, 250);
      moonGlow.addColorStop(0, "rgba(255,244,210,.34)");
      moonGlow.addColorStop(0.25, "rgba(216,203,255,.12)");
      moonGlow.addColorStop(1, "rgba(0,0,0,0)");
      const vignette = ctx.createRadialGradient(500, 520, 290, 500, 520, 710);
      vignette.addColorStop(0, "rgba(0,0,0,0)");
      vignette.addColorStop(.68, "rgba(2,2,10,.08)");
      vignette.addColorStop(1, "rgba(2,2,10,.6)");
      const branches = [0, 1, 2].map((phase) => this.branches.map((branch) => {
        const gradient = ctx.createLinearGradient(branch.x1, branch.y1, branch.x2, branch.y2);
        gradient.addColorStop(0, "rgba(35,18,43,.95)");
        gradient.addColorStop(1, phase >= 2 ? "rgba(112,62,99,.78)" : "rgba(65,34,73,.82)");
        return gradient;
      }));

      this.worldGradientCache = Object.freeze({
        skies: Object.freeze(skies),
        moonGlow,
        vignette,
        branches: Object.freeze(branches.map((phase) => Object.freeze(phase))),
      });
      return this.worldGradientCache;
    }

    setPreferences({ effects = this.effects, reducedMotion = this.reducedMotion } = {}) {
      this.effects = effects === "low" ? "low" : "full";
      this.reducedMotion = Boolean(reducedMotion);
      const caps = this.caps;
      if (this.trails.length > caps.trails) this.trails.splice(0, this.trails.length - caps.trails);
      if (this.particles.length > caps.particles) this.particles.splice(0, this.particles.length - caps.particles);
    }

    resize(width, height, requestedDpr = 1) {
      if (this.destroyed) return null;
      const cssWidth = Math.max(1, Math.round(finite(width, this.canvas.clientWidth || 1)));
      const cssHeight = Math.max(1, Math.round(finite(height, this.canvas.clientHeight || 1)));
      const coarse = typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches;
      const dprCap = coarse ? 1.5 : 2;
      const budgetDpr = Math.sqrt(1500000 / Math.max(1, cssWidth * cssHeight));
      const dpr = clamp(Math.min(finite(requestedDpr, 1), dprCap, budgetDpr), 0.75, dprCap);

      this.cssWidth = cssWidth;
      this.cssHeight = cssHeight;
      this.dpr = dpr;
      this.canvas.width = Math.max(1, Math.round(cssWidth * dpr));
      this.canvas.height = Math.max(1, Math.round(cssHeight * dpr));
      this.canvas.style.width = `${cssWidth}px`;
      this.canvas.style.height = `${cssHeight}px`;

      let projection = null;
      if (Projection && typeof Projection.createProjection === "function") {
        try {
          projection = Projection.createProjection(cssWidth, cssHeight, {
            worldWidth: WORLD_SIZE,
            worldHeight: WORLD_SIZE,
          });
        } catch (_error) {
          projection = null;
        }
      }
      this.scale = finite(projection?.scale, Math.min(cssWidth, cssHeight) / WORLD_SIZE);
      this.offsetX = finite(projection?.offsetX, (cssWidth - WORLD_SIZE * this.scale) * 0.5);
      this.offsetY = finite(projection?.offsetY, (cssHeight - WORLD_SIZE * this.scale) * 0.5);
      this.ctx.imageSmoothingEnabled = true;
      this.invalidateWorldGradientCache();
      return this.diagnostics();
    }

    reset() {
      this.trails.length = 0;
      this.particles.length = 0;
      this.pulses.length = 0;
      this.lastTrailTick = -1;
      this.frameCount = 0;
    }

    worldTransform() {
      this.ctx.setTransform(
        this.dpr * this.scale,
        0,
        0,
        this.dpr * this.scale,
        this.dpr * this.offsetX,
        this.dpr * this.offsetY,
      );
    }

    handleEvents(events, state) {
      if (!Array.isArray(events) || this.destroyed) return;
      const nowTick = finite(state?.tick);
      events.forEach((event) => {
        if (!event || typeof event.type !== "string") return;
        if (event.type === "pulse") {
          this.pulses.push({
            type: event.side === "right" ? "right" : "left",
            x: finite(event.x, finite(state?.center?.x, 500)),
            y: finite(event.y, finite(state?.center?.y, 690)),
            age: 0,
            life: 0.54,
            strength: event.accepted === false ? 0.28 : 1,
          });
        } else if (event.type === "chord") {
          const x = finite(event.x, finite(state?.center?.x, 500));
          const y = finite(event.y, finite(state?.center?.y, 690));
          this.pulses.push({ type: "chord", x, y, age: 0, life: this.reducedMotion ? 0.28 : 0.76, strength: 1, quality: event.quality });
          this.spawnParticles(x, y, event.quality === "perfect" ? 34 : 22, "gold");
        } else if (event.type === "scatter") {
          const x = finite(event.x, finite(state?.center?.x, 500));
          const y = finite(event.y, finite(state?.center?.y, 690));
          this.spawnParticles(x, y, 13, "violet");
        } else if (event.type === "rescue") {
          this.spawnParticles(finite(event.x, 500), finite(event.y, 690), 15, "mint");
        } else if (event.type === "bloom" || event.type === "moon-bloom") {
          this.spawnParticles(finite(event.x, 500), finite(event.y, 420), 25, "gold");
        } else if (event.type === "gate" || event.type === "gate-cleared") {
          this.spawnParticles(finite(event.x, 500), finite(event.y, 690), 12, "pearl");
        } else if (event.type === "complete" || event.type === "finale") {
          this.spawnFinale(state);
        }
      });
      if (this.pulses.length > 12) this.pulses.splice(0, this.pulses.length - 12);
      this.lastEventTick = nowTick;
    }

    spawnParticles(x, y, count, palette) {
      const caps = this.caps;
      const room = Math.max(0, caps.particles - this.particles.length);
      const total = Math.min(room, this.reducedMotion ? Math.ceil(count * 0.35) : count);
      const colors = {
        gold: ["#fff4c3", "#ffe196", "#fffaf0"],
        violet: ["#d9cbff", "#a98bff", "#f3edff"],
        mint: ["#cbffe9", "#80e5c4", "#f1fff8"],
        pearl: ["#fffaf2", "#d9eaff", "#eadfff"],
      }[palette] || ["#ffffff"];
      for (let index = 0; index < total; index += 1) {
        const angle = this.random() * TAU;
        const speed = 26 + this.random() * 115;
        this.particles.push({
          x,
          y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 16,
          size: 1.4 + this.random() * 3.2,
          life: 0.45 + this.random() * 0.65,
          age: 0,
          color: colors[Math.floor(this.random() * colors.length)],
        });
      }
    }

    spawnFinale(state) {
      const caps = this.caps;
      const desired = Math.min(caps.finale, this.reducedMotion ? 28 : 116);
      const voices = clamp(state?.activeVoiceCount ?? state?.finalVoiceCount ?? 24, 0, 24);
      for (let index = 0; index < desired && this.particles.length < caps.finale; index += 1) {
        const angle = this.random() * TAU;
        const radius = 50 + this.random() * (120 + voices * 3);
        this.particles.push({
          x: 500 + Math.cos(angle) * radius,
          y: 480 + Math.sin(angle) * radius * 0.62,
          vx: Math.cos(angle) * (8 + this.random() * 36),
          vy: -16 - this.random() * 54,
          size: 1.5 + this.random() * 3.6,
          life: 1 + this.random() * 1.5,
          age: 0,
          color: index % 3 === 0 ? "#cbffe9" : index % 3 === 1 ? "#ffe6a3" : "#d8cbff",
        });
      }
    }

    updateEffects(dt) {
      for (let index = this.pulses.length - 1; index >= 0; index -= 1) {
        const pulse = this.pulses[index];
        pulse.age += dt;
        if (pulse.age >= pulse.life) this.pulses.splice(index, 1);
      }
      for (let index = this.particles.length - 1; index >= 0; index -= 1) {
        const particle = this.particles[index];
        particle.age += dt;
        particle.x += particle.vx * dt;
        particle.y += particle.vy * dt;
        particle.vx *= Math.pow(0.32, dt);
        particle.vy = particle.vy * Math.pow(0.45, dt) + 10 * dt;
        if (particle.age >= particle.life) this.particles.splice(index, 1);
      }
    }

    recordTrails(state) {
      const caps = this.caps;
      if (!caps.trails || !Array.isArray(state?.voices)) return;
      const tick = Math.floor(finite(state.tick));
      if (tick === this.lastTrailTick || tick % 3 !== 0) return;
      this.lastTrailTick = tick;
      const step = this.effects === "low" ? 3 : 2;
      for (let index = 0; index < state.voices.length; index += step) {
        const voice = state.voices[index];
        if (!voice || voice.status === "lost") continue;
        this.trails.push({ x: finite(voice.x, 500), y: finite(voice.y, 700), age: 0, id: index });
      }
      if (this.trails.length > caps.trails) this.trails.splice(0, this.trails.length - caps.trails);
    }

    updateTrails(dt) {
      for (let index = this.trails.length - 1; index >= 0; index -= 1) {
        this.trails[index].age += dt;
        if (this.trails[index].age > 0.82) this.trails.splice(index, 1);
      }
    }

    render(state, alpha = 0, timestamp = 0) {
      if (this.destroyed) return;
      const dt = clamp(finite(state?.renderDelta, 1 / 60), 0, 0.05);
      this.updateEffects(dt);
      this.updateTrails(dt);
      this.recordTrails(state);
      this.frameCount += 1;

      const ctx = this.ctx;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = "#080817";
      ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
      this.worldTransform();
      this.ensureWorldGradientCache();
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, WORLD_SIZE, WORLD_SIZE);
      ctx.clip();

      const time = finite(state?.time, finite(state?.tick) / 60);
      this.drawSky(time, state);
      this.drawDistantGarden(time, state);
      this.drawGates(time, state);
      this.drawTrails();
      this.drawVoices(time, state, alpha);
      this.drawPulses();
      this.drawParticles();
      this.drawCanopy(time, state);
      this.drawLostBeacons(time, state);
      this.drawVignette();
      ctx.restore();
    }

    drawSky(time, state) {
      const ctx = this.ctx;
      const phase = clamp(state?.phaseIndex, 0, 2);
      const palettes = [
        ["#0b0d25", "#17102f", "#291536"],
        ["#0b1028", "#1b1235", "#351a42"],
        ["#11102d", "#26163c", "#4a274e"],
      ];
      const colors = palettes[phase];
      ctx.fillStyle = this.worldGradientCache?.skies[phase] || colors[1];
      ctx.fillRect(0, 0, WORLD_SIZE, WORLD_SIZE);

      ctx.fillStyle = this.worldGradientCache?.moonGlow || "rgba(216,203,255,.12)";
      ctx.fillRect(240, -60, 520, 520);
      ctx.fillStyle = "rgba(255,247,221,.86)";
      ctx.beginPath();
      ctx.arc(500, 170, 31 + phase * 4, 0, TAU);
      ctx.fill();
      ctx.fillStyle = "rgba(37,24,63,.42)";
      ctx.beginPath();
      ctx.arc(512, 158, 28 + phase * 4, 0, TAU);
      ctx.fill();

      const starLimit = this.caps.stars;
      for (let index = 0; index < starLimit; index += 1) {
        const star = this.stars[index];
        const twinkle = this.reducedMotion ? 0.78 : 0.62 + Math.sin(time * 0.7 + star.phase) * 0.22;
        ctx.globalAlpha = star.a * twinkle;
        ctx.fillStyle = index % 5 === 0 ? "#ffe6a3" : index % 3 === 0 ? "#cbffe9" : "#efe8ff";
        ctx.beginPath();
        ctx.arc(star.x, star.y, star.r, 0, TAU);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    drawDistantGarden(time, state) {
      const ctx = this.ctx;
      ctx.fillStyle = "rgba(9,8,24,.65)";
      ctx.beginPath();
      ctx.moveTo(0, 620);
      for (let x = 0; x <= 1000; x += 50) {
        const y = 620 + Math.sin(x * 0.012 + 0.7) * 22 + Math.sin(x * 0.031) * 9;
        ctx.lineTo(x, y);
      }
      ctx.lineTo(1000, 1000);
      ctx.lineTo(0, 1000);
      ctx.closePath();
      ctx.fill();

      const moteLimit = this.caps.motes;
      for (let index = 0; index < moteLimit; index += 1) {
        const mote = this.motes[index];
        const x = this.reducedMotion ? mote.x : mote.x + Math.sin(time * mote.speed + mote.phase) * 17;
        const y = this.reducedMotion ? mote.y : (mote.y - time * (3 + mote.speed * 4) + 900) % 900;
        ctx.globalAlpha = .18 + Math.sin(time + mote.phase) * .05;
        ctx.fillStyle = index % 2 ? "#80e5c4" : "#a98bff";
        ctx.beginPath();
        ctx.arc(x, y, mote.size, 0, TAU);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      const wind = finite(state?.wind, finite(state?.windX));
      if (Math.abs(wind) > 1) {
        ctx.save();
        ctx.globalAlpha = clamp(Math.abs(wind) / 260, .08, .26);
        ctx.strokeStyle = wind > 0 ? "#b8a9f0" : "#9ae9d0";
        ctx.lineWidth = 1.3;
        for (let index = 0; index < 5; index += 1) {
          const y = 290 + index * 91;
          const offset = this.reducedMotion ? 0 : (time * 28 * Math.sign(wind) + index * 83) % 180;
          ctx.beginPath();
          ctx.moveTo(150 + offset, y);
          ctx.bezierCurveTo(310 + offset, y - 16, 480 + offset, y + 18, 650 + offset, y - 4);
          ctx.stroke();
        }
        ctx.restore();
      }
    }

    drawGates(time, state) {
      const ctx = this.ctx;
      const gates = Array.isArray(state?.gates) ? state.gates : state?.currentGate ? [state.currentGate] : [];
      gates.forEach((gate, index) => {
        if (!gate || gate.resolved || gate.passed) return;
        const x = finite(gate.x ?? gate.centerX, 500);
        const y = finite(gate.y ?? gate.screenY, 350 + index * 130);
        const width = clamp(gate.width ?? gate.openingWidth, 90, 620);
        if (y < -140 || y > 1120) return;
        const marked = Boolean(gate.markedChord || gate.chordOpportunity);
        const bloom = Boolean(gate.moonBloom || gate.hasBloom);
        const pulse = this.reducedMotion ? 0 : Math.sin(time * 2.2 + index) * 5;

        ctx.save();
        ctx.translate(x, y);
        ctx.lineCap = "round";
        ctx.lineWidth = marked ? 8 : 6;
        ctx.strokeStyle = marked ? "rgba(255,230,163,.72)" : "rgba(210,196,240,.55)";
        ctx.shadowColor = marked ? "#ffe6a3" : "#8e70c8";
        ctx.shadowBlur = marked ? 25 : 14;
        ctx.beginPath();
        ctx.arc(0, 0, width * .5 + pulse, Math.PI * 0.1, Math.PI * 0.9);
        ctx.stroke();

        ctx.shadowBlur = 0;
        ctx.lineWidth = 2;
        ctx.strokeStyle = marked ? "rgba(255,247,210,.72)" : "rgba(203,255,233,.34)";
        ctx.setLineDash(marked ? [5, 12] : [2, 14]);
        ctx.lineDashOffset = this.reducedMotion ? 0 : -time * 22;
        ctx.beginPath();
        ctx.arc(0, 0, width * .5 + 14, Math.PI * .1, Math.PI * .9);
        ctx.stroke();
        ctx.setLineDash([]);

        if (bloom) this.drawMoonBloom(finite(gate.bloomX, x) - x, -width * .28 - 30, time + index);
        if (marked) {
          ctx.fillStyle = "rgba(255,246,207,.88)";
          ctx.font = "600 18px Georgia";
          ctx.textAlign = "center";
          ctx.fillText("◇  ◇", 0, 30);
        }
        ctx.restore();
      });
    }

    drawMoonBloom(x, y, time) {
      const ctx = this.ctx;
      const scale = this.reducedMotion ? 1 : 1 + Math.sin(time * 2.5) * .08;
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(scale, scale);
      ctx.fillStyle = "rgba(255,230,163,.84)";
      ctx.shadowColor = "#ffe6a3";
      ctx.shadowBlur = 18;
      for (let index = 0; index < 5; index += 1) {
        ctx.save();
        ctx.rotate(index / 5 * TAU);
        ctx.beginPath();
        ctx.ellipse(0, -10, 6, 13, 0, 0, TAU);
        ctx.fill();
        ctx.restore();
      }
      ctx.fillStyle = "#fff9db";
      ctx.beginPath();
      ctx.arc(0, 0, 4, 0, TAU);
      ctx.fill();
      ctx.restore();
    }

    drawTrails() {
      if (!this.trails.length) return;
      const ctx = this.ctx;
      ctx.save();
      ctx.lineCap = "round";
      for (let index = 0; index < this.trails.length; index += 1) {
        const trail = this.trails[index];
        const life = 1 - trail.age / .82;
        if (life <= 0) continue;
        ctx.globalAlpha = life * .18;
        ctx.fillStyle = trail.id % 3 === 0 ? "#cbffe9" : trail.id % 3 === 1 ? "#d8cbff" : "#ffe6a3";
        ctx.beginPath();
        ctx.arc(trail.x, trail.y + trail.age * 14, 1 + life * 2.2, 0, TAU);
        ctx.fill();
      }
      ctx.restore();
    }

    drawVoices(time, state) {
      const voices = Array.isArray(state?.voices) ? state.voices : [];
      const protection = finite(state?.pulseState?.protectionUntilTick ?? state?.protectionUntilTick) > finite(state?.tick);
      const completion = clamp(state?.finaleProgress ?? state?.completionProgress, 0, 1);
      const resultMode = Boolean(state?.complete || state?.completed || completion > 0);
      const ctx = this.ctx;

      if (protection) {
        const center = state?.center || { x: 500, y: 690 };
        const ring = this.reducedMotion ? 118 : 112 + Math.sin(time * 7) * 7;
        ctx.save();
        ctx.strokeStyle = "rgba(255,235,176,.36)";
        ctx.lineWidth = 3;
        ctx.shadowColor = "#ffe6a3";
        ctx.shadowBlur = 28;
        ctx.beginPath();
        ctx.ellipse(finite(center.x, 500), finite(center.y, 690), ring, ring * .67, 0, 0, TAU);
        ctx.stroke();
        ctx.restore();
      }

      const visibleVoices = resultMode
        ? voices.filter((voice) => (voice?.status || (voice?.lost ? "lost" : "active")) !== "lost")
        : voices;
      for (let index = 0; index < visibleVoices.length; index += 1) {
        const voice = visibleVoices[index];
        if (!voice) continue;
        let x = finite(voice.x, 500);
        let y = finite(voice.y, 690);
        if (resultMode && completion > 0) {
          const angle = index / Math.max(1, visibleVoices.length) * TAU;
          const heartX = 500 + 115 * Math.pow(Math.sin(angle), 3);
          const heartY = 450 - (92 * Math.cos(angle) - 38 * Math.cos(2 * angle) - 18 * Math.cos(3 * angle) - 8 * Math.cos(4 * angle));
          x = lerp(x, heartX, smooth(completion));
          y = lerp(y, heartY, smooth(completion));
        }
        this.drawMoth(x, y, voice, index, time);
      }
    }

    drawMoth(x, y, voice, index, time) {
      const ctx = this.ctx;
      const status = voice.status || (voice.lost ? "lost" : "active");
      const lost = status === "lost";
      const returning = status === "returning";
      const velocityAngle = Math.atan2(finite(voice.vy, -1), finite(voice.vx, 0)) + Math.PI * .5;
      const flutter = this.reducedMotion ? .65 : .35 + Math.abs(Math.sin(time * (7.4 + index % 4) + index * .77)) * .72;
      const size = finite(voice.size, 7 + index % 3 * .45) * (returning ? 1.1 : 1);
      const color = index % 3 === 0 ? "#fff1bd" : index % 3 === 1 ? "#d9d0ff" : "#c7ffe8";

      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(Number.isFinite(velocityAngle) ? velocityAngle : 0);
      ctx.globalAlpha = lost ? .42 : returning ? .82 : .96;
      ctx.shadowColor = lost ? "#8b77a8" : color;
      ctx.shadowBlur = lost ? 9 : 15;

      ctx.fillStyle = lost ? "rgba(166,148,190,.52)" : color;
      ctx.save();
      ctx.rotate(-.45 * flutter);
      ctx.beginPath();
      ctx.ellipse(-size * .72, -size * .06, size * .72, size * .38, -.25, 0, TAU);
      ctx.fill();
      ctx.restore();
      ctx.save();
      ctx.rotate(.45 * flutter);
      ctx.beginPath();
      ctx.ellipse(size * .72, -size * .06, size * .72, size * .38, .25, 0, TAU);
      ctx.fill();
      ctx.restore();

      ctx.shadowBlur = 8;
      ctx.fillStyle = lost ? "#726283" : "#fffdf2";
      ctx.beginPath();
      ctx.ellipse(0, 0, size * .19, size * .74, 0, 0, TAU);
      ctx.fill();

      ctx.strokeStyle = lost ? "rgba(185,165,204,.42)" : "rgba(255,249,226,.72)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(-1, -size * .6);
      ctx.quadraticCurveTo(-size * .5, -size * 1.12, -size * .66, -size * 1.28);
      ctx.moveTo(1, -size * .6);
      ctx.quadraticCurveTo(size * .5, -size * 1.12, size * .66, -size * 1.28);
      ctx.stroke();

      if (lost) {
        ctx.setLineDash([2, 4]);
        ctx.strokeStyle = "rgba(204,190,222,.38)";
        ctx.beginPath();
        ctx.arc(0, 0, size * 1.8, 0, TAU);
        ctx.stroke();
      }
      ctx.restore();
    }

    drawPulses() {
      const ctx = this.ctx;
      this.pulses.forEach((pulse) => {
        const life = clamp(pulse.age / pulse.life, 0, 1);
        const alpha = (1 - life) * pulse.strength;
        ctx.save();
        ctx.globalAlpha = alpha;
        if (pulse.type === "chord") {
          ctx.strokeStyle = "#fff3bd";
          ctx.lineWidth = 4 - life * 2;
          ctx.shadowColor = "#ffe6a3";
          ctx.shadowBlur = 30;
          ctx.beginPath();
          ctx.ellipse(finite(pulse.x, 500), finite(pulse.y, 690), 45 + life * 180, 32 + life * 125, 0, 0, TAU);
          ctx.stroke();
        } else {
          const left = pulse.type === "left";
          ctx.strokeStyle = left ? "#b7a1ff" : "#9df3d4";
          ctx.lineWidth = 8 - life * 5;
          ctx.shadowColor = left ? "#a98bff" : "#80e5c4";
          ctx.shadowBlur = 24;
          const x = left ? -20 + life * 185 : 1020 - life * 185;
          ctx.beginPath();
          ctx.ellipse(x, 690, 70 + life * 180, 225 + life * 60, 0, 0, TAU);
          ctx.stroke();
        }
        ctx.restore();
      });
    }

    drawParticles() {
      const ctx = this.ctx;
      ctx.save();
      for (let index = 0; index < this.particles.length; index += 1) {
        const particle = this.particles[index];
        const life = 1 - particle.age / particle.life;
        if (life <= 0) continue;
        ctx.globalAlpha = life * life;
        ctx.fillStyle = particle.color;
        ctx.shadowColor = particle.color;
        ctx.shadowBlur = 9;
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, particle.size * (this.reducedMotion ? 1 : .45 + life * .55), 0, TAU);
        ctx.fill();
      }
      ctx.restore();
    }

    drawCanopy(time, state) {
      const ctx = this.ctx;
      const phase = clamp(state?.phaseIndex, 0, 2);
      ctx.save();
      ctx.lineCap = "round";
      for (let index = 0; index < this.branches.length; index += 1) {
        const branch = this.branches[index];
        ctx.strokeStyle = this.worldGradientCache?.branches[phase]?.[index]
          || (phase >= 2 ? "rgba(112,62,99,.78)" : "rgba(65,34,73,.82)");
        ctx.lineWidth = branch.width;
        ctx.beginPath();
        ctx.moveTo(branch.x1, branch.y1);
        ctx.quadraticCurveTo(
          (branch.x1 + branch.x2) * .5 + Math.sin(index * 2.1) * 9,
          (branch.y1 + branch.y2) * .5,
          branch.x2,
          branch.y2,
        );
        ctx.stroke();
      }

      const leafLimit = this.effects === "low" ? Math.ceil(this.leaves.length * .58) : this.leaves.length;
      for (let index = 0; index < leafLimit; index += 1) {
        const leaf = this.leaves[index];
        const sway = this.reducedMotion ? 0 : Math.sin(time * .42 + leaf.phase) * .08;
        const light = phase * .08 + leaf.depth * .12;
        this.drawHeartLeaf(leaf.x, leaf.y, leaf.size, leaf.rotation + sway, light, index);
      }
      ctx.restore();
    }

    drawLostBeacons(time, state) {
      const lostVoices = Array.isArray(state?.voices)
        ? state.voices.filter((voice) => voice?.status === "lost")
        : [];
      if (!lostVoices.length) return;
      const ctx = this.ctx;
      ctx.save();
      ctx.lineWidth = 1.6;
      ctx.setLineDash([3, 7]);
      for (let index = 0; index < lostVoices.length; index += 1) {
        const voice = lostVoices[index];
        const x = finite(voice.x, finite(voice.lostX, 500));
        const y = finite(voice.y, finite(voice.lostY, 700));
        const breathe = this.reducedMotion ? 0 : Math.sin(time * 2.8 + voice.id * .73) * 3;
        const radius = 17 + breathe;
        ctx.globalAlpha = .5;
        ctx.strokeStyle = index % 2 ? "#d8cbff" : "#cbffe9";
        ctx.shadowColor = ctx.strokeStyle;
        ctx.shadowBlur = 12;
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, TAU);
        ctx.stroke();

        ctx.setLineDash([]);
        ctx.globalAlpha = .72;
        ctx.fillStyle = "#fff7d2";
        ctx.beginPath();
        ctx.moveTo(x, y - 7);
        ctx.lineTo(x + 3, y - 1);
        ctx.lineTo(x + 8, y);
        ctx.lineTo(x + 3, y + 1);
        ctx.lineTo(x, y + 7);
        ctx.lineTo(x - 3, y + 1);
        ctx.lineTo(x - 8, y);
        ctx.lineTo(x - 3, y - 1);
        ctx.closePath();
        ctx.fill();
        ctx.setLineDash([3, 7]);
      }
      ctx.restore();
    }

    drawHeartLeaf(x, y, size, rotation, light, index) {
      const ctx = this.ctx;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rotation);
      const palette = index % 4;
      ctx.fillStyle = palette === 0
        ? `rgba(111,78,135,${.38 + light})`
        : palette === 1
          ? `rgba(73,116,112,${.32 + light})`
          : palette === 2
            ? `rgba(125,69,113,${.34 + light})`
            : `rgba(61,87,102,${.32 + light})`;
      ctx.beginPath();
      ctx.moveTo(0, size * .78);
      ctx.bezierCurveTo(-size * 1.05, size * .12, -size * .76, -size * .74, 0, -size * .16);
      ctx.bezierCurveTo(size * .76, -size * .74, size * 1.05, size * .12, 0, size * .78);
      ctx.fill();
      ctx.strokeStyle = "rgba(221,205,234,.13)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, size * .68);
      ctx.lineTo(0, -size * .1);
      ctx.stroke();
      ctx.restore();
    }

    drawVignette() {
      const ctx = this.ctx;
      ctx.fillStyle = this.worldGradientCache?.vignette || "rgba(2,2,10,.28)";
      ctx.fillRect(0, 0, WORLD_SIZE, WORLD_SIZE);
    }

    diagnostics() {
      return Object.freeze({
        cssWidth: this.cssWidth,
        cssHeight: this.cssHeight,
        dpr: this.dpr,
        backingWidth: this.canvas.width,
        backingHeight: this.canvas.height,
        backingPixels: this.canvas.width * this.canvas.height,
        scale: this.scale,
        offsetX: this.offsetX,
        offsetY: this.offsetY,
        effects: normalizeMode(this.effects, this.reducedMotion),
        trails: this.trails.length,
        particles: this.particles.length,
        pulses: this.pulses.length,
        frameCount: this.frameCount,
        destroyed: this.destroyed,
      });
    }

    destroy() {
      this.reset();
      this.invalidateWorldGradientCache();
      this.destroyed = true;
    }
  }

  function createRenderer(options) {
    return new ChorusRenderer(options);
  }

  return Object.freeze({ EFFECT_CAPS, ChorusRenderer, createRenderer });
});
