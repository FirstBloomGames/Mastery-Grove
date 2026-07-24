(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const TAU = Math.PI * 2;
  const RUN_DURATION = 90;
  const MOBILE_GAMEPLAY_DPR_CAP = 1.5;
  const DESKTOP_GAMEPLAY_DPR_CAP = 2;
  const PLAYER_RADIUS = 0.36;
  const MUTATION_TIMES = [30, 60];
  const motionQuery = window.matchMedia?.('(prefers-reduced-motion: reduce)');
  const coarsePointerQuery = window.matchMedia?.('(pointer: coarse)');
  let reducedMotion = motionQuery?.matches ?? false;
  const pageParams = new URLSearchParams(window.location.search);
  const isTrialRun = pageParams.get('trial') === '1';
  const sessionId = pageParams.get('session') || '';
  const messageTargetOrigin = window.location.protocol === 'file:' ? '*' : window.location.origin;
  const isEmbedded = window.parent !== window;
  const isGroveHosted = isEmbedded && pageParams.get('grove') === '1';

  const fractalCanvas = $('fractalCanvas');
  const gameCanvas = $('gameCanvas');
  const ctx = gameCanvas.getContext('2d', { alpha: true });

  const ui = {
    hud: $('hud'),
    phaseName: $('phaseName'),
    timeValue: $('timeValue'),
    scoreValue: $('scoreValue'),
    bestValue: $('bestValue'),
    guideCard: $('guideCard'),
    guideText: $('guideText'),
    petalDisplay: $('petalDisplay'),
    shellIndicator: $('shellIndicator'),
    resonanceFill: $('resonanceFill'),
    resonanceValue: $('resonanceValue'),
    mutationStrip: $('mutationStrip'),
    comboBadge: $('comboBadge'),
    comboValue: $('comboValue'),
    toast: $('toast'),
    screenFlash: $('screenFlash'),
    startOverlay: $('startOverlay'),
    mutationOverlay: $('mutationOverlay'),
    pauseOverlay: $('pauseOverlay'),
    resultOverlay: $('resultOverlay'),
    mutationChoices: $('mutationChoices'),
    playButton: $('playButton'),
    replayButton: $('replayButton'),
    homeButton: $('homeButton'),
    resumeButton: $('resumeButton'),
    quitButton: $('quitButton'),
    pauseButton: $('pauseButton'),
    soundButton: $('soundButton'),
    soundIcon: $('soundIcon'),
    fullscreenButton: $('fullscreenButton'),
    startBest: $('startBest'),
    resultTitle: $('resultTitle'),
    bloomName: $('bloomName'),
    resultCopy: $('resultCopy'),
    lineage: $('lineage'),
    resultScore: $('resultScore'),
    resultRank: $('resultRank'),
    resultGates: $('resultGates'),
    resultPerfects: $('resultPerfects'),
    specimenCode: $('specimenCode')
  };

  const dialogOverlays = Object.freeze([
    ui.startOverlay,
    ui.mutationOverlay,
    ui.pauseOverlay,
    ui.resultOverlay
  ]);
  let focusBeforeDialog = null;

  if (isGroveHosted) {
    document.documentElement.dataset.groveHosted = 'true';
    ui.fullscreenButton.hidden = true;
    ui.fullscreenButton.disabled = true;
  }

  const view = {
    width: 0,
    height: 0,
    dpr: 1,
    cx: 0,
    cy: 0,
    scale: 0
  };

  const input = {
    keys: new Set(),
    pointerActive: false,
    pointerId: null,
    pointerType: '',
    targetAngle: -Math.PI / 2,
    turnVelocity: 0
  };

  const visual = {
    time: 0,
    symmetry: 5,
    targetSymmetry: 5,
    fold: .16,
    targetFold: .16,
    hue: .76,
    targetHue: .76,
    depth: 4,
    targetDepth: 4,
    energy: .18,
    targetEnergy: .18,
    damage: 0,
    freeze: 0,
    targetFreeze: 0,
    freezeTime: 0,
    pulse: 0
  };

  const storage = {
    getBest() {
      try { return Number(localStorage.getItem('bloomfold-best')) || 0; }
      catch (_) { return 0; }
    },
    saveBest(value) {
      try { localStorage.setItem('bloomfold-best', String(value)); }
      catch (_) { /* Local storage can be unavailable in hardened browsers. */ }
    },
    preserve(specimen) {
      try {
        const prior = JSON.parse(localStorage.getItem('bloomfold-specimens') || '[]');
        const next = [specimen, ...(Array.isArray(prior) ? prior : [])].slice(0, 8);
        localStorage.setItem('bloomfold-specimens', JSON.stringify(next));
      } catch (_) { /* The run remains fully playable without a gallery save. */ }
    }
  };

  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const lerp = (a, b, t) => a + (b - a) * t;
  const ease = (rate, dt) => 1 - Math.exp(-rate * dt);
  const deg = (value) => value * Math.PI / 180;
  const normAngle = (value) => ((value % TAU) + TAU) % TAU;
  const angleDelta = (target, current) => Math.atan2(Math.sin(target - current), Math.cos(target - current));
  const formatNumber = (value) => Math.round(value).toLocaleString('en-US');
  const smoothstep = (a, b, value) => {
    const t = clamp((value - a) / (b - a), 0, 1);
    return t * t * (3 - 2 * t);
  };

  function mulberry32(seed) {
    let value = seed >>> 0;
    return () => {
      value += 0x6D2B79F5;
      let t = value;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  class FractalRenderer {
    constructor(canvas) {
      this.canvas = canvas;
      this.gl = null;
      this.fallback = null;
      this.ready = false;
      this.pixelRatio = 1;

      const gl = canvas.getContext('webgl', {
        alpha: false,
        antialias: false,
        depth: false,
        stencil: false,
        powerPreference: 'high-performance',
        preserveDrawingBuffer: false
      });

      if (!gl) {
        this.fallback = canvas.getContext('2d');
        return;
      }

      this.gl = gl;
      try {
        this.initialize();
        this.ready = true;
      } catch (_) {
        this.activateFallbackCanvas();
      }
    }

    activateFallbackCanvas() {
      const replacement = document.createElement('canvas');
      replacement.id = this.canvas.id;
      replacement.setAttribute('aria-hidden', 'true');
      this.canvas.replaceWith(replacement);
      this.canvas = replacement;
      this.gl = null;
      this.ready = false;
      this.fallback = replacement.getContext('2d');
    }

    compile(type, source) {
      const shader = this.gl.createShader(type);
      this.gl.shaderSource(shader, source);
      this.gl.compileShader(shader);
      if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
        throw new Error(this.gl.getShaderInfoLog(shader) || 'Shader compilation failed');
      }
      return shader;
    }

    initialize() {
      const vertexSource = `
        attribute vec2 a_position;
        varying vec2 v_uv;
        void main() {
          v_uv = a_position * 0.5 + 0.5;
          gl_Position = vec4(a_position, 0.0, 1.0);
        }
      `;

      const fragmentSource = `
        #ifdef GL_FRAGMENT_PRECISION_HIGH
        precision highp float;
        #else
        precision mediump float;
        #endif

        varying vec2 v_uv;
        uniform vec2 u_resolution;
        uniform float u_time;
        uniform float u_symmetry;
        uniform float u_fold;
        uniform float u_hue;
        uniform float u_energy;
        uniform float u_depth;
        uniform float u_damage;
        uniform float u_freeze;
        uniform float u_freezeTime;

        #define TAU 6.28318530718

        mat2 rotate2D(float a) {
          float c = cos(a);
          float s = sin(a);
          return mat2(c, s, -s, c);
        }

        vec3 hsv2rgb(vec3 c) {
          vec3 p = abs(fract(c.xxx + vec3(0.0, 0.6666667, 0.3333333)) * 6.0 - 3.0);
          return c.z * mix(vec3(1.0), clamp(p - 1.0, 0.0, 1.0), c.y);
        }

        void main() {
          vec2 frag = v_uv * u_resolution;
          vec2 p = (2.0 * frag - u_resolution) / max(1.0, min(u_resolution.x, u_resolution.y));
          float radius = length(p);
          float rawAngle = atan(p.y, p.x);
          float t = mix(u_time, u_freezeTime, clamp(u_freeze, 0.0, 1.0));
          float symmetry = clamp(floor(u_symmetry + 0.5), 3.0, 12.0);
          float sector = TAU / symmetry;
          float foldedAngle = abs(mod(rawAngle + 0.5 * sector, sector) - 0.5 * sector);
          vec2 folded = vec2(cos(foldedAngle), sin(foldedAngle)) * radius;

          float logRadius = -log2(radius + 0.035);
          float inwardTwist = (0.08 + 0.30 * u_fold) * sin(logRadius * (1.35 + u_fold) - t * 0.28);
          vec2 z = rotate2D(inwardTwist) * folded;
          float glow = 0.0;
          float orbit = 10.0;
          float magnification = 1.0;

          for (int i = 0; i < 7; ++i) {
            float fi = float(i);
            float active = step(fi + 0.5, u_depth);
            z = abs(z);
            float turn = 0.54 + 0.42 * u_fold + 0.045 * sin(t * 0.19 + fi * 1.71);
            z = rotate2D(turn) * z;
            z -= vec2(
              0.38 + 0.045 * sin(t * 0.13 + fi * 2.07),
              0.15 + 0.050 * cos(t * 0.11 + fi * 1.63)
            );
            z *= 1.47;
            magnification *= 1.47;
            float branch = abs(z.y) / magnification;
            float shellRadius = 0.46 + 0.035 * sin(t * 0.17 + fi * 1.9);
            float shell = abs(length(z) - shellRadius) / magnification;
            float vein = min(branch, shell);
            orbit = min(orbit, mix(10.0, vein, active));
            float thin = 0.0025 + 0.0020 * (1.0 - u_energy);
            float wide = 0.0330 + 0.0160 * u_energy;
            float filament = 1.0 - smoothstep(thin, wide, vein);
            glow += active * filament * (0.86 - 0.075 * fi);
          }

          float ringPhase = fract(logRadius * 0.56 - t * 0.095);
          float ring = 1.0 - smoothstep(0.025, 0.145, abs(ringPhase - 0.5));
          float petal = 1.0 - smoothstep(0.18, 0.92, abs(sin(foldedAngle * symmetry)));
          float pulse = 0.88 + 0.12 * sin(t * 1.35 + logRadius * 2.1);
          float field = pulse * (0.58 * glow + 0.18 * ring + 0.10 * petal * (0.3 + glow));
          float hue = fract(u_hue + 0.065 * logRadius + 0.055 * sin(logRadius * 0.8 + orbit * 7.0));
          vec3 deep = hsv2rgb(vec3(fract(hue + 0.09), 0.72, 0.035));
          vec3 bloom = hsv2rgb(vec3(hue, 0.67 - 0.15 * u_freeze, 1.0));
          vec3 edge = hsv2rgb(vec3(fract(hue + 0.13), 0.48, 1.0));
          vec3 color = deep;
          color += bloom * field * (0.72 + 0.72 * u_energy);
          color += edge * glow * glow * 0.24;
          float core = 1.0 - smoothstep(0.0, 0.16, radius);
          color += bloom * core * (0.12 + 0.23 * u_energy);

          float facet = 0.5 + 0.5 * cos((folded.x - folded.y) * 34.0 + logRadius * 8.0);
          vec3 frozen = color.bgr * vec3(0.76, 1.03, 1.22) + vec3(0.035, 0.085, 0.13) * facet;
          color = mix(color, frozen, 0.52 * clamp(u_freeze, 0.0, 1.0));

          float crackWave = abs(sin(rawAngle * 5.0 + logRadius * 2.4 + sin(logRadius * 4.7)));
          float cracks = (1.0 - smoothstep(0.0, 0.075, crackWave)) * u_damage;
          float damageVignette = u_damage * smoothstep(0.20, 1.25, radius);
          color = mix(
            color,
            vec3(1.0, 0.025, 0.055) * (0.55 + field),
            clamp(cracks * 0.78 + damageVignette * 0.32, 0.0, 0.82)
          );
          color *= 1.0 - 0.28 * smoothstep(0.62, 1.48, radius);
          color = vec3(1.0) - exp(-color * 1.18);
          color = pow(max(color, 0.0), vec3(0.88));
          float dither = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))) - 0.5;
          color += dither / 255.0;
          gl_FragColor = vec4(color, 1.0);
        }
      `;

      const vertex = this.compile(this.gl.VERTEX_SHADER, vertexSource);
      const fragment = this.compile(this.gl.FRAGMENT_SHADER, fragmentSource);
      const program = this.gl.createProgram();
      this.gl.attachShader(program, vertex);
      this.gl.attachShader(program, fragment);
      this.gl.linkProgram(program);
      if (!this.gl.getProgramParameter(program, this.gl.LINK_STATUS)) {
        throw new Error(this.gl.getProgramInfoLog(program) || 'Shader linking failed');
      }

      this.program = program;
      this.gl.useProgram(program);
      const buffer = this.gl.createBuffer();
      this.gl.bindBuffer(this.gl.ARRAY_BUFFER, buffer);
      this.gl.bufferData(
        this.gl.ARRAY_BUFFER,
        new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
        this.gl.STATIC_DRAW
      );
      const position = this.gl.getAttribLocation(program, 'a_position');
      this.gl.enableVertexAttribArray(position);
      this.gl.vertexAttribPointer(position, 2, this.gl.FLOAT, false, 0, 0);

      this.uniforms = {};
      ['resolution', 'time', 'symmetry', 'fold', 'hue', 'energy', 'depth', 'damage', 'freeze', 'freezeTime'].forEach((name) => {
        this.uniforms[name] = this.gl.getUniformLocation(program, `u_${name}`);
      });
    }

    resize(width, height) {
      this.pixelRatio = Math.min(window.devicePixelRatio || 1, width < 820 ? 1.15 : 1.45);
      const internalWidth = Math.max(1, Math.floor(width * this.pixelRatio));
      const internalHeight = Math.max(1, Math.floor(height * this.pixelRatio));
      if (this.canvas.width !== internalWidth || this.canvas.height !== internalHeight) {
        this.canvas.width = internalWidth;
        this.canvas.height = internalHeight;
      }
      if (this.gl) this.gl.viewport(0, 0, internalWidth, internalHeight);
    }

    render(params) {
      if (this.ready && this.gl) {
        const gl = this.gl;
        gl.useProgram(this.program);
        gl.uniform2f(this.uniforms.resolution, this.canvas.width, this.canvas.height);
        gl.uniform1f(this.uniforms.time, params.time % 2048);
        gl.uniform1f(this.uniforms.symmetry, params.symmetry);
        gl.uniform1f(this.uniforms.fold, params.fold);
        gl.uniform1f(this.uniforms.hue, params.hue);
        gl.uniform1f(this.uniforms.energy, params.energy);
        gl.uniform1f(this.uniforms.depth, params.depth);
        gl.uniform1f(this.uniforms.damage, params.damage);
        gl.uniform1f(this.uniforms.freeze, params.freeze);
        gl.uniform1f(this.uniforms.freezeTime, params.freezeTime % 2048);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
        return;
      }
      this.renderFallback(params);
    }

    renderFallback(params) {
      if (!this.fallback) return;
      const fallback = this.fallback;
      const width = this.canvas.width;
      const height = this.canvas.height;
      const scale = Math.min(width, height);
      fallback.setTransform(1, 0, 0, 1, 0, 0);
      const gradient = fallback.createRadialGradient(width / 2, height / 2, 0, width / 2, height / 2, scale * .75);
      gradient.addColorStop(0, `hsla(${Math.round(params.hue * 360)}, 75%, 17%, 1)`);
      gradient.addColorStop(.6, '#0b0c28');
      gradient.addColorStop(1, '#040511');
      fallback.fillStyle = gradient;
      fallback.fillRect(0, 0, width, height);
      fallback.save();
      fallback.translate(width / 2, height / 2);
      fallback.globalCompositeOperation = 'lighter';
      const symmetry = Math.round(params.symmetry);
      for (let arm = 0; arm < symmetry; arm += 1) {
        fallback.save();
        fallback.rotate((arm / symmetry) * TAU + params.time * .025);
        for (let layer = 1; layer <= Math.round(params.depth); layer += 1) {
          const radius = scale * (.055 + layer * .055);
          fallback.strokeStyle = `hsla(${(params.hue * 360 + layer * 18) % 360}, 85%, 68%, ${.11 + params.energy * .08})`;
          fallback.lineWidth = Math.max(1, 3 / layer);
          fallback.beginPath();
          fallback.moveTo(radius * .35, 0);
          fallback.quadraticCurveTo(radius, radius * .32, radius * 1.4, 0);
          fallback.stroke();
        }
        fallback.restore();
      }
      fallback.restore();
    }
  }

  class AudioEngine {
    constructor() {
      this.context = null;
      this.master = null;
      this.filter = null;
      this.muted = false;
      this.started = false;
      this.ambient = [];
    }

    start() {
      if (!this.context) {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) return;
        this.context = new AudioContext();
        this.master = this.context.createGain();
        this.master.gain.value = this.muted ? 0 : .28;
        this.master.connect(this.context.destination);
        this.filter = this.context.createBiquadFilter();
        this.filter.type = 'lowpass';
        this.filter.frequency.value = 520;
        this.filter.Q.value = .45;
        this.filter.connect(this.master);
        this.createAmbient();
      }
      this.context.resume?.();
      this.started = true;
    }

    suspend() {
      if (this.context?.state === 'running') this.context.suspend().catch(() => {});
    }

    createAmbient() {
      if (!this.context || this.ambient.length) return;
      [55, 82.5, 110].forEach((frequency, index) => {
        const oscillator = this.context.createOscillator();
        const gain = this.context.createGain();
        oscillator.type = index === 1 ? 'triangle' : 'sine';
        oscillator.frequency.value = frequency;
        oscillator.detune.value = index === 2 ? 7 : -index * 4;
        gain.gain.value = index === 0 ? .032 : .014;
        oscillator.connect(gain);
        gain.connect(this.filter);
        oscillator.start();
        this.ambient.push({ oscillator, gain });
      });
    }

    tone(frequency, duration = .18, volume = .08, type = 'sine', delay = 0) {
      if (!this.context || this.muted) return;
      const now = this.context.currentTime + delay;
      const oscillator = this.context.createOscillator();
      const gain = this.context.createGain();
      oscillator.type = type;
      oscillator.frequency.setValueAtTime(frequency, now);
      gain.gain.setValueAtTime(.0001, now);
      gain.gain.exponentialRampToValueAtTime(Math.max(.0002, volume), now + .018);
      gain.gain.exponentialRampToValueAtTime(.0001, now + duration);
      oscillator.connect(gain);
      gain.connect(this.master);
      oscillator.start(now);
      oscillator.stop(now + duration + .03);
    }

    pass(combo, perfect, gold) {
      const root = 220 * Math.pow(2, (Math.min(combo, 8) % 5) / 12);
      this.tone(root * (gold ? 2 : 1), .22, gold ? .115 : .075, 'sine');
      if (perfect || gold) this.tone(root * 1.5, .3, .055, 'triangle', .045);
      if (gold) this.tone(root * 2.5, .34, .04, 'sine', .09);
    }

    hit() {
      if (!this.context || this.muted) return;
      const now = this.context.currentTime;
      const oscillator = this.context.createOscillator();
      const gain = this.context.createGain();
      oscillator.type = 'sawtooth';
      oscillator.frequency.setValueAtTime(120, now);
      oscillator.frequency.exponentialRampToValueAtTime(42, now + .32);
      gain.gain.setValueAtTime(.12, now);
      gain.gain.exponentialRampToValueAtTime(.0001, now + .35);
      oscillator.connect(gain);
      gain.connect(this.master);
      oscillator.start(now);
      oscillator.stop(now + .38);
    }

    mutate(index) {
      const roots = [174.61, 196, 220, 246.94, 261.63];
      const root = roots[index % roots.length];
      [1, 1.25, 1.5, 2].forEach((ratio, note) => this.tone(root * ratio, .55, .05, note % 2 ? 'triangle' : 'sine', note * .09));
    }

    finale() {
      [220, 277.18, 329.63, 440, 554.37, 659.25].forEach((frequency, index) => {
        this.tone(frequency, .65, .055, index % 2 ? 'triangle' : 'sine', index * .12);
      });
    }

    update(energy) {
      if (!this.context || !this.filter) return;
      const now = this.context.currentTime;
      this.filter.frequency.setTargetAtTime(420 + energy * 1050, now, .2);
      this.ambient.forEach((voice, index) => {
        voice.gain.gain.setTargetAtTime((index === 0 ? .028 : .012) + energy * (index === 2 ? .015 : .007), now, .3);
      });
    }

    toggle() {
      this.muted = !this.muted;
      if (this.master && this.context) {
        this.master.gain.setTargetAtTime(this.muted ? .0001 : .28, this.context.currentTime, .04);
      }
      ui.soundIcon.textContent = this.muted ? '×' : '♪';
      ui.soundButton.setAttribute('aria-label', this.muted ? 'Unmute sound' : 'Mute sound');
      ui.soundButton.title = this.muted ? 'Unmute sound (M)' : 'Mute sound (M)';
    }
  }

  const renderer = new FractalRenderer(fractalCanvas);
  const audio = new AudioEngine();

  function postToGrove(type, payload = {}) {
    if (!isEmbedded) return;
    window.parent.postMessage({
      source: 'first-bloom-game',
      version: 1,
      type,
      gameId: 'bloomfold',
      ...payload,
      sessionId
    }, messageTargetOrigin);
  }

  const mutations = [
    {
      id: 'spiral',
      symbol: '↻',
      name: 'Spiral Drift',
      type: 'MOTION MUTATION',
      description: 'The bloom learns to turn before danger arrives.',
      effect: '+25% orbit speed',
      color: '#82f4ee',
      preset: { symmetry: 5, fold: .12, hue: .76, depth: 5 },
      apply(mods) { mods.turnSpeed *= 1.25; }
    },
    {
      id: 'crystal',
      symbol: '◇',
      name: 'Crystal Mercy',
      type: 'GEOMETRY MUTATION',
      description: 'The pattern fractures into kinder, wider passages.',
      effect: 'Openings grow 18° wider',
      color: '#9ec8ff',
      preset: { symmetry: 8, fold: .86, hue: .54, depth: 6 },
      apply(mods) { mods.gateBonus += deg(18); }
    },
    {
      id: 'coral',
      symbol: '⌁',
      name: 'Coral Echo',
      type: 'RESONANCE MUTATION',
      description: 'Every flawless opening sends a second song through the branches.',
      effect: 'Perfect passes echo +50%',
      color: '#ff85a9',
      preset: { symmetry: 6, fold: .34, hue: .02, depth: 7 },
      apply(mods) { mods.perfectEcho += .5; }
    },
    {
      id: 'storm',
      symbol: 'ϟ',
      name: 'Storm Pulse',
      type: 'RISK MUTATION',
      description: 'Gold openings crackle with dangerous, extravagant power.',
      effect: 'Gold gates score ×2 again',
      color: '#ffd773',
      preset: { symmetry: 3, fold: .96, hue: .12, depth: 6 },
      apply(mods) { mods.goldMultiplier += 1; }
    },
    {
      id: 'petal',
      symbol: '✤',
      name: 'Petal Heart',
      type: 'LIFE MUTATION',
      description: 'A softer center grows around the traveling seed.',
      effect: 'Restore all petals · safer edges',
      color: '#e8a4ff',
      preset: { symmetry: 7, fold: .52, hue: .88, depth: 6 },
      apply(mods) {
        mods.personalGap *= 1.2;
        state.health = state.maxHealth;
      }
    }
  ];

  let state = createInitialState();
  let lastFrame = performance.now();
  let animationFrameId = 0;
  let toastTimer = 0;
  let uiTick = 0;

  function createInitialState() {
    const seed = ((Date.now() & 0xffffffff) ^ Math.floor(Math.random() * 0xffffffff)) >>> 0;
    return {
      mode: 'title',
      previousMode: 'playing',
      seed,
      rng: mulberry32(seed),
      best: storage.getBest(),
      score: 0,
      elapsed: 0,
      health: 3,
      maxHealth: 3,
      shell: 1,
      invulnerable: 0,
      resonance: 0,
      combo: 0,
      maxCombo: 0,
      perfects: 0,
      golds: 0,
      gates: 0,
      gatesSpawned: 0,
      successfulGates: 0,
      playerAngle: -Math.PI / 2,
      initialAngle: -Math.PI / 2,
      lastGateAngle: -Math.PI / 2,
      rings: [],
      particles: [],
      trail: [],
      spawnTimer: .35,
      grace: 1.5,
      mutationCount: 0,
      chosenMutations: [],
      choices: [],
      finaleSpawned: 0,
      finaleBase: 0,
      crescendoTimer: 0,
      victory: false,
      shake: 0,
      hitStop: 0,
      mods: {
        turnSpeed: 1,
        gateBonus: 0,
        perfectEcho: 0,
        goldMultiplier: 1,
        personalGap: 1
      }
    };
  }

  function setAriaHidden(element, hidden) {
    element.setAttribute('aria-hidden', String(Boolean(hidden)));
  }

  function activeDialog() {
    return dialogOverlays.find((overlay) => overlay.classList.contains('is-visible')) || null;
  }

  function syncDialogState() {
    const active = activeDialog();
    dialogOverlays.forEach((overlay) => {
      const visible = overlay === active;
      overlay.inert = !visible;
      setAriaHidden(overlay, !visible);
    });
    const backgroundHidden = Boolean(active);
    ui.hud.inert = backgroundHidden;
    gameCanvas.inert = backgroundHidden;
    setAriaHidden(ui.hud, backgroundHidden || ui.hud.classList.contains('is-hidden'));
    setAriaHidden(gameCanvas, backgroundHidden);
  }

  function openDialog(overlay, focusTarget = null) {
    if (!activeDialog()) focusBeforeDialog = document.activeElement;
    dialogOverlays.forEach((candidate) => candidate.classList.toggle('is-visible', candidate === overlay));
    syncDialogState();
    if (focusTarget && typeof focusTarget.focus === 'function') {
      window.setTimeout(() => {
        if (activeDialog() === overlay) focusTarget.focus({ preventScroll: true });
      }, 100);
    }
  }

  function closeDialogs(focusTarget = null) {
    dialogOverlays.forEach((overlay) => overlay.classList.remove('is-visible'));
    syncDialogState();
    const target = focusTarget || focusBeforeDialog;
    focusBeforeDialog = null;
    if (target && typeof target.focus === 'function') target.focus({ preventScroll: true });
  }

  function phaseAt(time) {
    if (time < 12) {
      const t = time / 12;
      return { name: 'FIRST FOLD', interval: 2.7, travel: 3.2, opening: deg(lerp(130, 110, t)) };
    }
    if (time < 30) {
      const t = (time - 12) / 18;
      return { name: 'SPIRAL WAKES', interval: 2.15, travel: 2.7, opening: deg(lerp(100, 86, t)) };
    }
    if (time < 60) {
      const t = (time - 30) / 30;
      return { name: 'BRANCHING', interval: 1.85, travel: 2.45, opening: deg(lerp(82, 70, t)) };
    }
    if (time < 82) {
      const t = (time - 60) / 22;
      return { name: 'DEEP BLOOM', interval: 1.6, travel: 2.25, opening: deg(lerp(68, 58, t)) };
    }
    return { name: 'HEARTGATE', interval: 1.25, travel: 2.1, opening: deg(58) };
  }

  function resetVisualForSeed(seed) {
    const seedHue = ((seed % 997) / 997 + .58) % 1;
    visual.symmetry = 5;
    visual.targetSymmetry = 5;
    visual.fold = .16;
    visual.targetFold = .16;
    visual.hue = seedHue;
    visual.targetHue = seedHue;
    visual.depth = 4;
    visual.targetDepth = 4;
    visual.energy = .16;
    visual.targetEnergy = .16;
    visual.damage = 0;
    visual.freeze = 0;
    visual.targetFreeze = 0;
    visual.pulse = 0;
  }

  function startRun() {
    if (isTrialRun && state.mode === 'result') return;
    const best = state.best;
    state = createInitialState();
    state.best = best;
    state.mode = 'playing';
    postToGrove('run-start');
    resetVisualForSeed(state.seed);
    input.keys.clear();
    input.turnVelocity = 0;
    input.pointerActive = false;
    input.pointerId = null;
    input.targetAngle = state.playerAngle;
    ui.hud.classList.remove('is-hidden');
    closeDialogs(gameCanvas);
    ui.guideCard.classList.remove('is-fading');
    ui.guideText.textContent = 'POINT AT THE CYAN OPENING';
    ui.mutationStrip.replaceChildren();
    updatePetals();
    audio.start();
    showToast('Follow the cyan opening. The first folds cannot hurt you.', false, 2.8);
    updateHud(true);
  }

  function spawnRing(options = {}) {
    const phase = phaseAt(state.elapsed);
    const index = state.gatesSpawned;
    let gateAngle;
    let opening = options.opening ?? phase.opening;

    if (index === 0) {
      gateAngle = state.initialAngle;
      opening = deg(135);
    } else if (index === 1) {
      gateAngle = state.initialAngle + deg(45);
      opening = deg(130);
    } else if (index === 2) {
      gateAngle = state.initialAngle - deg(70);
      opening = deg(115);
    } else if (options.angle !== undefined) {
      gateAngle = options.angle;
    } else {
      const direction = state.rng() > .5 ? 1 : -1;
      const jump = lerp(.42, state.elapsed > 60 ? 2.05 : 1.72, state.rng());
      gateAngle = state.playerAngle + direction * jump;
      const fromLast = Math.abs(angleDelta(gateAngle, state.lastGateAngle));
      if (fromLast > 2.45) gateAngle = state.lastGateAngle + direction * 2.25;
    }

    gateAngle = normAngle(gateAngle);
    const isGoldRing = !options.finale && state.elapsed >= 30 && index % 4 === 3;
    let gold = null;
    if (isGoldRing) {
      const direction = state.rng() > .5 ? 1 : -1;
      gold = {
        angle: normAngle(gateAngle + direction * lerp(1.05, 1.5, state.rng())),
        width: deg(lerp(32, 38, state.rng()))
      };
    }

    const travel = options.travel ?? phase.travel;
    const startRadius = .032;
    const ring = {
      id: `${state.seed}-${index}`,
      index,
      radius: startRadius,
      previousRadius: startRadius,
      speed: (PLAYER_RADIUS - startRadius) / travel,
      gateAngle,
      gateWidth: opening + state.mods.gateBonus,
      spin: options.finale ? 0 : (state.rng() - .5) * lerp(.08, .28, clamp(state.elapsed / RUN_DURATION, 0, 1)),
      gold,
      checked: false,
      finale: Boolean(options.finale),
      hue: (visual.targetHue + index * .031) % 1
    };

    state.rings.push(ring);
    state.gatesSpawned += 1;
    state.lastGateAngle = gateAngle;
  }

  function updatePlaying(dt) {
    if (state.hitStop > 0) {
      state.hitStop -= dt;
      updateParticles(dt * .25);
      return;
    }

    state.elapsed += dt;
    state.invulnerable = Math.max(0, state.invulnerable - dt);
    state.grace = Math.max(0, state.grace - dt);
    state.resonance = Math.max(0, state.resonance - dt * 2.4);
    state.shake = Math.max(0, state.shake - dt * 38);
    updatePlayer(dt);
    updateTrail(dt);
    updateRings(dt);
    updateParticles(dt);
    if (state.mode !== 'playing') return;

    if (state.mutationCount < MUTATION_TIMES.length && state.elapsed >= MUTATION_TIMES[state.mutationCount]) {
      showMutationChoice();
      return;
    }

    if (state.elapsed >= 82) updateFinaleSpawns();
    else updateNormalSpawns(dt);

    if (state.elapsed >= RUN_DURATION) startCrescendo(true);
  }

  function updatePlayer(dt) {
    const direction = (input.keys.has('arrowright') || input.keys.has('d') ? 1 : 0)
      - (input.keys.has('arrowleft') || input.keys.has('a') ? 1 : 0);
    const targetVelocity = direction * 3.2 * state.mods.turnSpeed;
    const response = direction ? .18 : .1;
    input.turnVelocity += (targetVelocity - input.turnVelocity) * ease(1 / response, dt);
    if (direction && Math.abs(input.turnVelocity) > .0001) {
      state.playerAngle = normAngle(state.playerAngle + input.turnVelocity * dt);
      input.targetAngle = state.playerAngle;
      return;
    }
    if (input.pointerActive) {
      const difference = angleDelta(input.targetAngle, state.playerAngle);
      const maxStep = 4.6 * state.mods.turnSpeed * dt;
      const assistedStep = clamp(difference * ease(14, dt), -maxStep, maxStep);
      state.playerAngle = normAngle(state.playerAngle + assistedStep);
    }
  }

  function updateNormalSpawns(dt) {
    if (state.grace > 0) return;
    state.spawnTimer -= dt;
    if (state.spawnTimer <= 0 && state.rings.length < 6) {
      const phase = phaseAt(state.elapsed);
      spawnRing();
      state.spawnTimer += phase.interval;
    }
  }

  function updateFinaleSpawns() {
    const timing = [82, 84.25, 86.5];
    const widths = [65, 55, 48];
    while (state.finaleSpawned < 3 && state.elapsed >= timing[state.finaleSpawned]) {
      if (state.finaleSpawned === 0) {
        state.finaleBase = normAngle(state.playerAngle + (state.rng() - .5) * 1.1);
        showToast('HEARTGATE · THREE OPENINGS REMAIN', true, 2.2);
      }
      const offsets = [0, .28, -.22];
      spawnRing({
        finale: true,
        angle: normAngle(state.finaleBase + offsets[state.finaleSpawned]),
        opening: deg(widths[state.finaleSpawned]),
        travel: 2.1
      });
      state.finaleSpawned += 1;
    }
  }

  function updateRings(dt) {
    for (const ring of state.rings) {
      ring.previousRadius = ring.radius;
      ring.radius += ring.speed * dt;
      ring.gateAngle = normAngle(ring.gateAngle + ring.spin * dt);
      if (ring.gold) ring.gold.angle = normAngle(ring.gold.angle + ring.spin * dt);
      if (!ring.checked && ring.previousRadius < PLAYER_RADIUS && ring.radius >= PLAYER_RADIUS) {
        resolveRing(ring);
      }
    }
    state.rings = state.rings.filter((ring) => ring.radius < .78);
  }

  function resolveRing(ring) {
    ring.checked = true;
    state.gates += 1;
    const personalGap = state.mods.personalGap;
    const safeDistance = Math.abs(angleDelta(state.playerAngle, ring.gateAngle));
    const safeHit = safeDistance <= (ring.gateWidth * .5 * personalGap);
    let goldHit = false;
    let goldDistance = Infinity;
    if (ring.gold) {
      goldDistance = Math.abs(angleDelta(state.playerAngle, ring.gold.angle));
      goldHit = goldDistance <= ring.gold.width * .5 * personalGap;
    }

    if (goldHit) {
      registerPass(ring, 'gold', goldDistance, ring.gold.width);
    } else if (safeHit) {
      registerPass(ring, 'safe', safeDistance, ring.gateWidth);
    } else {
      registerMiss(ring);
    }
  }

  function registerPass(ring, type, distance, width) {
    state.successfulGates += 1;
    state.combo += 1;
    state.maxCombo = Math.max(state.maxCombo, state.combo);
    const perfect = distance <= width * .115;
    if (perfect) state.perfects += 1;
    if (type === 'gold') state.golds += 1;
    const multiplier = 1 + Math.min(state.combo, 10) * .1;
    const base = type === 'gold' ? 300 * state.mods.goldMultiplier : 100;
    const perfectBonus = perfect ? 75 * (1 + state.mods.perfectEcho) : 0;
    const points = Math.round((base + perfectBonus) * multiplier);
    state.score += points;
    state.resonance = clamp(state.resonance + (type === 'gold' ? 23 : 11) + (perfect ? 9 : 0), 0, 100);
    visual.pulse = Math.min(1.4, visual.pulse + (type === 'gold' ? .9 : .5));
    const color = type === 'gold' ? '#ffd773' : perfect ? '#fff8df' : '#82f4ee';
    emitBurst(state.playerAngle, PLAYER_RADIUS, color, type === 'gold' ? 30 : perfect ? 23 : 15, type === 'gold' ? 115 : 80);
    emitText(state.playerAngle, PLAYER_RADIUS, type === 'gold' ? `GOLD +${formatNumber(points)}` : perfect ? `PERFECT +${formatNumber(points)}` : `+${formatNumber(points)}`, color);
    audio.pass(state.combo, perfect, type === 'gold');

    if (type === 'gold') showToast('GOLD OPENING · TRIPLE RESONANCE', true, 1.15);
    else if (perfect) showToast('PERFECT ALIGNMENT', false, .9);

    if (ring.index === 0) ui.guideText.textContent = 'KEEP THE SEED INSIDE THE CYAN ARC';
    if (ring.index === 2) ui.guideText.textContent = 'GOLD IS OPTIONAL · WORTH TRIPLE';
    if (ring.index >= 6) ui.guideCard.classList.add('is-fading');
  }

  function registerMiss(ring) {
    state.combo = 0;
    state.resonance = Math.max(0, state.resonance - 24);
    const tutorialSafe = ring.index < 3;
    if (tutorialSafe) {
      showToast('The first folds are gentle. Follow the cyan light.', false, 1.8);
      emitBurst(state.playerAngle, PLAYER_RADIUS, '#b693ff', 12, 55);
      return;
    }

    if (state.shell > 0) {
      state.shell = 0;
      state.invulnerable = .8;
      ui.shellIndicator.classList.add('is-spent');
      showToast('SEED SHELL ABSORBED THE FRACTURE', false, 1.6);
      emitBurst(state.playerAngle, PLAYER_RADIUS, '#c9fffa', 26, 110);
      audio.tone(165, .36, .07, 'triangle');
      return;
    }

    if (state.invulnerable > 0 || state.grace > 0) return;
    state.health -= 1;
    state.invulnerable = 1.25;
    state.shake = reducedMotion ? 0 : 6;
    state.hitStop = .07;
    visual.damage = 1;
    ui.screenFlash.classList.remove('is-hit');
    void ui.screenFlash.offsetWidth;
    ui.screenFlash.classList.add('is-hit');
    emitBurst(state.playerAngle, PLAYER_RADIUS, '#ff3d74', 30, 125);
    emitText(state.playerAngle, PLAYER_RADIUS, 'FRACTURED', '#ff8bad');
    showToast(state.health > 0 ? 'A petal was lost.' : 'The bloom closes early.', false, 1.4, true);
    audio.hit();
    updatePetals();
    if (state.health <= 0) startCrescendo(false);
  }

  function showMutationChoice() {
    state.mode = 'mutation';
    state.rings.length = 0;
    state.spawnTimer = .45;
    const available = mutations.filter((mutation) => !state.chosenMutations.some((chosen) => chosen.id === mutation.id));
    const shuffled = [...available].sort(() => state.rng() - .5);
    state.choices = shuffled.slice(0, 3);
    ui.mutationChoices.replaceChildren();

    state.choices.forEach((mutation) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'mutation-card';
      button.style.setProperty('--card-color', mutation.color);
      button.innerHTML = `
        <span class="mutation-symbol" aria-hidden="true">${mutation.symbol}</span>
        <small>${mutation.type}</small>
        <strong>${mutation.name}</strong>
        <p>${mutation.description}</p>
        <span class="effect">${mutation.effect}</span>
      `;
      button.addEventListener('click', () => chooseMutation(mutation));
      ui.mutationChoices.appendChild(button);
    });

    audio.mutate(state.mutationCount);
    openDialog(ui.mutationOverlay, ui.mutationChoices.querySelector('button'));
  }

  function chooseMutation(mutation) {
    if (state.mode !== 'mutation') return;
    mutation.apply(state.mods);
    if (mutation.id !== 'petal') state.health = Math.min(state.maxHealth, state.health + 1);
    state.chosenMutations.push(mutation);
    state.mutationCount += 1;
    visual.targetSymmetry = mutation.preset.symmetry;
    visual.targetFold = mutation.preset.fold;
    visual.targetHue = (mutation.preset.hue + (state.seed % 43) / 240) % 1;
    visual.targetDepth = mutation.preset.depth;
    visual.pulse = 1.4;
    addMutationChip(mutation);
    state.mode = 'playing';
    state.grace = 1.5;
    state.spawnTimer = 1.5;
    updatePetals();
    showToast(`${mutation.name.toUpperCase()} HAS TAKEN ROOT`, false, 1.8);
    closeDialogs();
  }

  function addMutationChip(mutation) {
    const chip = document.createElement('span');
    chip.className = 'mutation-chip';
    chip.style.setProperty('--chip-color', mutation.color);
    chip.textContent = mutation.symbol;
    chip.title = mutation.name;
    ui.mutationStrip.appendChild(chip);
  }

  function startCrescendo(victory) {
    if (state.mode === 'crescendo' || state.mode === 'result') return;
    state.mode = 'crescendo';
    state.victory = victory;
    state.rings.length = 0;
    state.crescendoTimer = victory ? 4.6 : 2.2;
    state.resonance = victory ? 100 : Math.max(20, state.resonance);
    visual.targetFreeze = 1;
    visual.freezeTime = visual.time;
    visual.pulse = 1.6;
    for (let i = 0; i < 8; i += 1) {
      emitBurst(i / 8 * TAU, lerp(.08, .34, state.rng()), i % 2 ? '#82f4ee' : '#ffd773', 18, 120);
    }
    if (victory) {
      showToast('THE BLOOM OPENS', true, 3.2);
      audio.finale();
    }
  }

  function updateCrescendo(dt) {
    state.crescendoTimer -= dt;
    state.shake = Math.max(0, state.shake - dt * 24);
    updateTrail(dt);
    updateParticles(dt);
    if (state.victory && Math.random() < dt * 18) {
      emitBurst(Math.random() * TAU, Math.random() * .34, Math.random() > .5 ? '#82f4ee' : '#ffd773', 4, 55);
    }
    if (state.crescendoTimer <= 0) finishRun(state.victory);
  }

  function finishRun(victory) {
    state.mode = 'result';
    state.victory = victory;
    state.best = Math.max(state.best, state.score);
    storage.saveBest(state.best);
    const name = generateBloomName();
    const rank = getRank(state.score, victory);
    const code = `BF-${state.seed.toString(16).toUpperCase().padStart(8, '0').slice(-8)}`;
    storage.preserve({
      name,
      score: state.score,
      seed: state.seed,
      mutations: state.chosenMutations.map((mutation) => mutation.id),
      victory,
      date: new Date().toISOString()
    });

    postToGrove('run-complete', {
      victory: Boolean(victory),
      score: Math.round(state.score),
      best: Math.round(state.best),
      rank,
      stats: {
        gates: state.successfulGates,
        perfects: state.perfects,
        golds: state.golds,
        maxCombo: state.maxCombo,
        seconds: Math.round(state.elapsed)
      },
      specimen: {
        name,
        code,
        seed: state.seed,
        mutations: state.chosenMutations.map((mutation) => mutation.id)
      },
      assist: { preset: 'standard', scoreChanging: false }
    });

    ui.hud.classList.add('is-hidden');
    ui.resultTitle.textContent = victory ? 'Your bloom has opened.' : 'Even unfinished, it remembers.';
    ui.bloomName.textContent = name;
    ui.resultCopy.textContent = victory
      ? 'A living pattern shaped by every opening, risk, and mutation you chose.'
      : 'A smaller specimen, still made from choices no other descent will repeat.';
    ui.resultScore.textContent = formatNumber(state.score);
    ui.resultRank.textContent = rank;
    ui.resultGates.textContent = String(state.successfulGates);
    ui.resultPerfects.textContent = String(state.perfects);
    ui.specimenCode.textContent = `SPECIMEN ${code}`;
    ui.lineage.replaceChildren();
    const lineage = state.chosenMutations.length ? state.chosenMutations : [{ name: 'Unmutated Seed' }];
    lineage.forEach((mutation) => {
      const span = document.createElement('span');
      span.textContent = mutation.name.toUpperCase();
      ui.lineage.appendChild(span);
    });
    ui.startBest.textContent = `PERSONAL BEST · ${formatNumber(state.best)}`;
    if (isTrialRun) {
      ui.replayButton.disabled = true;
      ui.replayButton.querySelector('span').textContent = 'TRIAL RUN COMPLETE · CONTINUE IN THE GROVE';
      ui.replayButton.querySelector('i')?.setAttribute('hidden', '');
      ui.replayButton.setAttribute('aria-label', 'Trial run complete. Continue in the Grove.');
    }
    openDialog(ui.resultOverlay, isTrialRun ? ui.homeButton : ui.replayButton);
  }

  function generateBloomName() {
    const prefixes = {
      spiral: ['THE TURNING', 'THE WANDERING', 'THE SILKEN'],
      crystal: ['THE CRYSTAL', 'THE FACETED', 'THE WINTER'],
      coral: ['THE CORAL', 'THE ECHOING', 'THE TIDAL'],
      storm: ['THE STORM', 'THE GOLDEN', 'THE VOLTAIC'],
      petal: ['THE PETALLED', 'THE TENDER', 'THE MANY-HEARTED']
    };
    const defaults = ['THE QUIET', 'THE FIRST', 'THE UNFOLDING'];
    const endings = ['SPIRAL', 'CROWN', 'LANTERN', 'REVERIE', 'ORCHID', 'CONSTELLATION', 'HEART', 'BELL'];
    const first = state.chosenMutations[0]?.id;
    const options = prefixes[first] || defaults;
    const prefix = options[state.seed % options.length];
    const ending = endings[(state.seed + state.perfects + state.golds * 3) % endings.length];
    return `${prefix} ${ending}`;
  }

  function getRank(score, victory) {
    if (victory && score >= 7000) return 'FRACTAL CROWN';
    if (score >= 4500) return 'BLOOMWALKER';
    if (score >= 2500) return 'SPIRALHEART';
    return 'SEEDLING';
  }

  function updateTrail(dt) {
    state.trail.forEach((point) => { point.life -= dt * 1.8; });
    state.trail = state.trail.filter((point) => point.life > 0);
    if (state.mode === 'playing' || state.mode === 'crescendo') {
      state.trail.push({ angle: state.playerAngle, life: 1 });
      if (state.trail.length > 42) state.trail.shift();
    }
  }

  function emitBurst(angle, radius, color, count, speed) {
    const originX = view.cx + Math.cos(angle) * radius * view.scale;
    const originY = view.cy + Math.sin(angle) * radius * view.scale;
    const amount = reducedMotion ? Math.ceil(count * .35) : count;
    for (let i = 0; i < amount; i += 1) {
      const direction = angle + Math.PI + (state.rng() - .5) * 2.4;
      const velocity = speed * lerp(.35, 1.2, state.rng());
      state.particles.push({
        kind: 'spark',
        x: originX,
        y: originY,
        vx: Math.cos(direction) * velocity,
        vy: Math.sin(direction) * velocity,
        life: lerp(.45, 1.05, state.rng()),
        maxLife: 1,
        size: lerp(1.2, 3.6, state.rng()),
        color
      });
    }
    const particleCap = reducedMotion ? 150 : 420;
    if (state.particles.length > particleCap) state.particles.splice(0, state.particles.length - particleCap);
  }

  function emitText(angle, radius, text, color) {
    state.particles.push({
      kind: 'text',
      x: view.cx + Math.cos(angle) * radius * view.scale,
      y: view.cy + Math.sin(angle) * radius * view.scale,
      vx: 0,
      vy: -24,
      life: 1.15,
      maxLife: 1.15,
      size: 12,
      color,
      text
    });
  }

  function updateParticles(dt) {
    for (const particle of state.particles) {
      particle.life -= dt;
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.vx *= Math.pow(.22, dt);
      particle.vy *= Math.pow(.22, dt);
    }
    state.particles = state.particles.filter((particle) => particle.life > 0);
  }

  function drawGame() {
    ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    ctx.clearRect(0, 0, view.width, view.height);
    if (state.mode === 'title' || state.mode === 'result') return;

    ctx.save();
    if (state.shake > 0) {
      ctx.translate((Math.random() - .5) * state.shake * 2, (Math.random() - .5) * state.shake * 2);
    }
    drawOrbit();
    drawCore();
    const nextRing = state.rings
      .filter((ring) => !ring.checked && ring.radius < PLAYER_RADIUS)
      .sort((a, b) => b.radius - a.radius)[0];
    state.rings.forEach((ring) => drawRing(ring, ring === nextRing));
    drawTrail();
    drawPlayer();
    drawParticles();
    ctx.restore();
  }

  function drawOrbit() {
    const radius = PLAYER_RADIUS * view.scale;
    ctx.save();
    ctx.translate(view.cx, view.cy);
    ctx.setLineDash([1, 8]);
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(201,255,250,.18)';
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, TAU);
    ctx.stroke();
    ctx.setLineDash([]);
    if (input.pointerActive && state.mode === 'playing') {
      const targetX = Math.cos(input.targetAngle) * radius;
      const targetY = Math.sin(input.targetAngle) * radius;
      ctx.globalAlpha = state.gates < 6 ? .9 : .34;
      ctx.strokeStyle = '#c9fffa';
      ctx.shadowColor = '#82f4ee';
      ctx.shadowBlur = 12;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(targetX, targetY, state.gates < 6 ? 6 : 4, 0, TAU);
      ctx.stroke();
      ctx.fillStyle = '#c9fffa';
      ctx.beginPath();
      ctx.arc(targetX, targetY, 1.5, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawCore() {
    const pulse = 1 + Math.sin(visual.time * 1.8) * .05 + visual.pulse * .12;
    const radius = view.scale * .035 * pulse;
    ctx.save();
    ctx.translate(view.cx, view.cy);
    ctx.globalCompositeOperation = 'lighter';
    const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, radius * 4.8);
    glow.addColorStop(0, `rgba(255,248,223,${.7 + visual.energy * .2})`);
    glow.addColorStop(.13, 'rgba(130,244,238,.58)');
    glow.addColorStop(.48, 'rgba(128,90,255,.17)');
    glow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(0, 0, radius * 4.8, 0, TAU);
    ctx.fill();
    ctx.rotate(visual.time * .12);
    const petals = Math.round(visual.symmetry);
    for (let i = 0; i < petals; i += 1) {
      ctx.rotate(TAU / petals);
      ctx.fillStyle = 'rgba(201,255,250,.28)';
      ctx.beginPath();
      ctx.ellipse(radius * 1.45, 0, radius * 1.2, radius * .34, 0, 0, TAU);
      ctx.fill();
    }
    ctx.fillStyle = '#fff8df';
    ctx.shadowColor = '#82f4ee';
    ctx.shadowBlur = 18;
    ctx.beginPath();
    ctx.arc(0, 0, radius * .48, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  function drawRing(ring, highlighted) {
    const radius = ring.radius * view.scale;
    if (radius < 3) return;
    const fadeIn = smoothstep(.025, .09, ring.radius);
    const fadeOut = 1 - smoothstep(.61, .78, ring.radius);
    const alpha = fadeIn * fadeOut;
    const proximity = 1 - clamp(Math.abs(ring.radius - PLAYER_RADIUS) / .18, 0, 1);
    const segmentCount = 84;

    ctx.save();
    ctx.translate(view.cx, view.cy);
    ctx.globalAlpha = alpha;

    ctx.strokeStyle = `rgba(210,179,255,${.1 + proximity * .09})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, TAU);
    ctx.stroke();

    ctx.lineWidth = lerp(5, 11, proximity);
    ctx.lineCap = 'round';
    ctx.strokeStyle = `rgba(30,7,48,${.62 + proximity * .22})`;
    ctx.shadowColor = '#d22c79';
    ctx.shadowBlur = highlighted ? 10 : 4;
    ctx.beginPath();
    for (let index = 0; index < segmentCount; index += 1) {
      const a0 = index / segmentCount * TAU;
      const a1 = (index + .72) / segmentCount * TAU;
      const middle = (a0 + a1) * .5;
      const inSafe = Math.abs(angleDelta(middle, ring.gateAngle)) < ring.gateWidth * .55;
      const inGold = ring.gold && Math.abs(angleDelta(middle, ring.gold.angle)) < ring.gold.width * .6;
      if (!inSafe && !inGold) {
        ctx.moveTo(Math.cos(a0) * radius, Math.sin(a0) * radius);
        ctx.arc(0, 0, radius, a0, a1);
      }
    }
    ctx.stroke();

    ctx.shadowBlur = 0;
    ctx.lineWidth = 1;
    ctx.strokeStyle = `rgba(255,93,165,${.2 + proximity * .22})`;
    ctx.beginPath();
    const glyphs = 26;
    for (let i = 0; i < glyphs; i += 1) {
      const angle = i / glyphs * TAU + ring.index * .13;
      const inSafe = Math.abs(angleDelta(angle, ring.gateAngle)) < ring.gateWidth * .56;
      const inGold = ring.gold && Math.abs(angleDelta(angle, ring.gold.angle)) < ring.gold.width * .64;
      if (inSafe || inGold) continue;
      const length = highlighted ? 7 : 4;
      ctx.moveTo(Math.cos(angle) * (radius - length), Math.sin(angle) * (radius - length));
      ctx.lineTo(Math.cos(angle) * (radius + length), Math.sin(angle) * (radius + length));
    }
    ctx.stroke();

    drawOpening(ring.gateAngle, ring.gateWidth, radius, '#82f4ee', highlighted, proximity);
    if (ring.gold) drawOpening(ring.gold.angle, ring.gold.width, radius, '#ffd773', highlighted, proximity, true);
    ctx.restore();
  }

  function drawOpening(angle, width, radius, color, highlighted, proximity, gold = false) {
    const start = angle - width * .5;
    const end = angle + width * .5;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.shadowColor = color;
    ctx.shadowBlur = highlighted ? 24 : 12;
    ctx.strokeStyle = color;
    ctx.globalAlpha *= highlighted ? 1 : .65;
    ctx.lineWidth = highlighted ? 4.5 : 3;
    ctx.beginPath();
    ctx.arc(0, 0, radius, start, end);
    ctx.stroke();

    ctx.globalAlpha *= .34;
    ctx.lineWidth = highlighted ? 15 : 10;
    ctx.beginPath();
    ctx.arc(0, 0, radius, start, end);
    ctx.stroke();

    ctx.globalAlpha = highlighted ? .88 : .48;
    ctx.lineWidth = 1;
    const perfectWidth = width * .23;
    ctx.beginPath();
    ctx.arc(0, 0, radius, angle - perfectWidth * .5, angle + perfectWidth * .5);
    ctx.stroke();

    const endpointRadius = highlighted ? 4.2 + proximity * 1.6 : 2.8;
    [start, end].forEach((endpoint) => {
      const x = Math.cos(endpoint) * radius;
      const y = Math.sin(endpoint) * radius;
      ctx.globalAlpha = highlighted ? 1 : .62;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x, y, endpointRadius, 0, TAU);
      ctx.fill();
    });

    if (gold && highlighted) {
      ctx.globalAlpha = .8;
      ctx.fillStyle = '#fff8df';
      ctx.font = '700 11px ui-sans-serif, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('×3', Math.cos(angle) * radius, Math.sin(angle) * radius);
    }
    ctx.restore();
  }

  function drawTrail() {
    const radius = PLAYER_RADIUS * view.scale;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < state.trail.length; i += 1) {
      const point = state.trail[i];
      const alpha = clamp(point.life, 0, 1) * (i / Math.max(1, state.trail.length)) * .3;
      ctx.fillStyle = `rgba(130,244,238,${alpha})`;
      ctx.beginPath();
      ctx.arc(
        view.cx + Math.cos(point.angle) * radius,
        view.cy + Math.sin(point.angle) * radius,
        1 + point.life * 2.2,
        0,
        TAU
      );
      ctx.fill();
    }
    ctx.restore();
  }

  function drawPlayer() {
    const radius = PLAYER_RADIUS * view.scale;
    const x = view.cx + Math.cos(state.playerAngle) * radius;
    const y = view.cy + Math.sin(state.playerAngle) * radius;
    const hitFade = state.invulnerable > 0 && Math.floor(state.invulnerable * 12) % 2 === 0 ? .35 : 1;
    const size = clamp(view.scale * .019, 8, 16);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(state.playerAngle + Math.PI / 2);
    ctx.globalAlpha = hitFade;
    ctx.globalCompositeOperation = 'lighter';

    const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, size * 3.8);
    glow.addColorStop(0, 'rgba(255,248,223,.92)');
    glow.addColorStop(.18, 'rgba(130,244,238,.62)');
    glow.addColorStop(1, 'rgba(130,244,238,0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(0, 0, size * 3.8, 0, TAU);
    ctx.fill();

    ctx.shadowColor = '#82f4ee';
    ctx.shadowBlur = 16;
    ctx.fillStyle = '#fff8df';
    ctx.beginPath();
    ctx.moveTo(0, -size * 1.25);
    ctx.quadraticCurveTo(size * .78, -size * .1, 0, size * 1.2);
    ctx.quadraticCurveTo(-size * .78, -size * .1, 0, -size * 1.25);
    ctx.fill();

    ctx.fillStyle = 'rgba(182,147,255,.72)';
    ctx.beginPath();
    ctx.ellipse(-size * .72, .1 * size, size * .64, size * .25, -.55, 0, TAU);
    ctx.ellipse(size * .72, .1 * size, size * .64, size * .25, .55, 0, TAU);
    ctx.fill();

    if (state.shell > 0) {
      ctx.shadowColor = '#c9fffa';
      ctx.shadowBlur = 18;
      ctx.strokeStyle = 'rgba(201,255,250,.8)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(0, 0, size * 1.85 + Math.sin(visual.time * 3) * 1.5, 0, TAU);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawParticles() {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const particle of state.particles) {
      const alpha = clamp(particle.life / particle.maxLife, 0, 1);
      if (particle.kind === 'text') {
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = alpha;
        ctx.fillStyle = particle.color;
        ctx.font = '800 13px ui-sans-serif, system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowColor = '#070817';
        ctx.shadowBlur = 8;
        ctx.fillText(particle.text, particle.x, particle.y);
        ctx.globalCompositeOperation = 'lighter';
      } else {
        ctx.globalAlpha = alpha * .9;
        ctx.fillStyle = particle.color;
        ctx.shadowColor = particle.color;
        ctx.shadowBlur = 7;
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, particle.size * (.5 + alpha * .5), 0, TAU);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  function updateVisuals(dt) {
    const active = state.mode === 'playing' || state.mode === 'crescendo';
    const speed = reducedMotion ? 0 : active ? 1 : .42;
    visual.time += dt * speed;
    visual.symmetry += (visual.targetSymmetry - visual.symmetry) * ease(3, dt);
    visual.fold += (visual.targetFold - visual.fold) * ease(1.8, dt);
    const hueDifference = angleDelta(visual.targetHue * TAU, visual.hue * TAU) / TAU;
    visual.hue = (visual.hue + hueDifference * ease(1.5, dt) + 1) % 1;
    visual.depth += (visual.targetDepth - visual.depth) * ease(2, dt);
    visual.targetEnergy = active ? clamp(.16 + state.resonance / 115 + visual.pulse * .35, .12, 1) : state.mode === 'result' ? .85 : .26;
    visual.energy += (visual.targetEnergy - visual.energy) * ease(4, dt);
    visual.damage *= Math.exp(-8 * dt);
    visual.freeze += (visual.targetFreeze - visual.freeze) * ease(1.2, dt);
    visual.pulse = Math.max(0, visual.pulse - dt * 1.55);
    audio.update(visual.energy);
  }

  function updateHud(force = false) {
    uiTick += 1;
    if (!force && uiTick % 3 !== 0) return;
    const phase = phaseAt(state.elapsed);
    ui.phaseName.textContent = phase.name;
    const remaining = Math.max(0, Math.ceil(RUN_DURATION - state.elapsed));
    ui.timeValue.textContent = `${String(Math.floor(remaining / 60)).padStart(2, '0')}:${String(remaining % 60).padStart(2, '0')}`;
    ui.scoreValue.textContent = formatNumber(state.score);
    ui.bestValue.textContent = `BEST ${formatNumber(Math.max(state.best, state.score))}`;
    ui.resonanceFill.style.width = `${Math.round(state.resonance)}%`;
    ui.resonanceValue.textContent = `${Math.round(state.resonance)}%`;
    if (state.combo > 1) {
      ui.comboBadge.classList.remove('is-hidden');
      ui.comboValue.textContent = `×${(1 + Math.min(state.combo, 10) * .1).toFixed(1)}`;
    } else {
      ui.comboBadge.classList.add('is-hidden');
    }
  }

  function updatePetals() {
    const petals = [...ui.petalDisplay.children];
    petals.forEach((petal, index) => petal.classList.toggle('is-empty', index >= state.health));
    ui.petalDisplay.setAttribute('aria-label', `${state.health} ${state.health === 1 ? 'petal' : 'petals'} remaining`);
    ui.shellIndicator.classList.toggle('is-spent', state.shell <= 0);
  }

  function showToast(message, gold = false, duration = 1.4, danger = false) {
    ui.toast.textContent = message;
    ui.toast.classList.toggle('is-gold', gold);
    ui.toast.classList.toggle('is-danger', danger);
    ui.toast.classList.add('is-visible');
    toastTimer = duration;
  }

  function updateToast(dt) {
    if (toastTimer <= 0) return;
    toastTimer -= dt;
    if (toastTimer <= 0) ui.toast.classList.remove('is-visible');
  }

  function pauseGame() {
    if (state.mode !== 'playing') return;
    state.previousMode = state.mode;
    state.mode = 'paused';
    stopFrameLoop();
    audio.suspend();
    input.keys.clear();
    input.pointerActive = false;
    openDialog(ui.pauseOverlay, ui.resumeButton);
  }

  function resumeGame() {
    if (state.mode !== 'paused') return;
    state.mode = 'playing';
    lastFrame = performance.now();
    audio.start();
    state.grace = Math.max(state.grace, 1.5);
    closeDialogs();
    scheduleFrame();
  }

  function goHome() {
    audio.suspend();
    state.mode = 'title';
    state.rings.length = 0;
    state.particles.length = 0;
    ui.hud.classList.add('is-hidden');
    ui.startBest.textContent = `PERSONAL BEST · ${formatNumber(state.best)}`;
    visual.targetFreeze = 0;
    visual.targetEnergy = .26;
    openDialog(ui.startOverlay, ui.playButton);
    lastFrame = performance.now();
    scheduleFrame();
  }

  function resolveGameplayDpr(width, height) {
    const touchPoints = Math.max(0, Number(navigator.maxTouchPoints) || 0);
    const mobileCanvas = Boolean(coarsePointerQuery?.matches)
      || (touchPoints > 0 && (width <= 1366 || height <= 1024));
    const cap = mobileCanvas ? MOBILE_GAMEPLAY_DPR_CAP : DESKTOP_GAMEPLAY_DPR_CAP;
    return Math.min(window.devicePixelRatio || 1, cap);
  }

  function resize() {
    view.width = window.innerWidth;
    view.height = window.innerHeight;
    view.dpr = resolveGameplayDpr(view.width, view.height);
    view.cx = view.width / 2;
    view.cy = view.height / 2;
    view.scale = Math.min(view.width, view.height);
    gameCanvas.width = Math.max(1, Math.floor(view.width * view.dpr));
    gameCanvas.height = Math.max(1, Math.floor(view.height * view.dpr));
    gameCanvas.style.width = `${view.width}px`;
    gameCanvas.style.height = `${view.height}px`;
    renderer.resize(view.width, view.height);
  }

  function setPointerTarget(event) {
    if (state.mode !== 'playing') return;
    const offsetX = event.clientX - view.cx;
    const offsetY = event.clientY - view.cy;
    if (Math.hypot(offsetX, offsetY) < view.scale * .07) return;
    input.targetAngle = normAngle(Math.atan2(offsetY, offsetX));
    input.pointerActive = true;
    input.pointerType = event.pointerType;
  }

  function setupQaControls() {
    const qaHostAllowed = window.location.protocol === 'file:'
      || ['localhost', '127.0.0.1', '::1', '[::1]'].includes(window.location.hostname);
    if (!pageParams.has('qa') || !qaHostAllowed) return;
    const panel = document.createElement('aside');
    panel.setAttribute('aria-label', 'QA controls');
    Object.assign(panel.style, {
      position: 'fixed', right: '8px', top: '90px', zIndex: 100,
      display: 'grid', gap: '4px', padding: '6px', background: 'rgba(0,0,0,.72)'
    });
    const add = (label, action) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = label;
      Object.assign(button.style, { padding: '6px', fontSize: '9px', background: '#171838', border: '1px solid #777', cursor: 'pointer' });
      button.addEventListener('click', action);
      panel.appendChild(button);
    };
    add('QA START', () => { if (state.mode === 'title' || state.mode === 'result') startRun(); });
    add('QA MUTATION 1', () => { if (state.mode !== 'playing') startRun(); state.elapsed = 30.01; });
    add('QA MUTATION 2', () => { if (state.mode !== 'playing') startRun(); state.mutationCount = 1; state.elapsed = 60.01; });
    add('QA FINISH', () => { if (state.mode === 'title' || state.mode === 'result') startRun(); startCrescendo(true); });
    add('QA FAIL', () => { if (state.mode === 'title' || state.mode === 'result') startRun(); state.health = 0; startCrescendo(false); });
    document.body.appendChild(panel);
  }

  function trapModalFocus(event) {
    if (event.key !== 'Tab') return false;
    const overlay = activeDialog();
    if (!overlay) return false;
    const focusable = [...overlay.querySelectorAll('button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])')]
      .filter((element) => element.getClientRects().length > 0);
    if (!focusable.length) return false;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (!overlay.contains(document.activeElement)) {
      event.preventDefault();
      const boundary = event.shiftKey ? last : first;
      boundary.focus();
      return true;
    }
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
      return true;
    }
    if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
      return true;
    }
    return false;
  }

  function scheduleFrame() {
    if (animationFrameId || document.hidden || state.mode === 'paused') return;
    animationFrameId = requestAnimationFrame(frame);
  }

  function stopFrameLoop() {
    if (!animationFrameId) return;
    cancelAnimationFrame(animationFrameId);
    animationFrameId = 0;
  }

  function frame(now) {
    animationFrameId = 0;
    const dt = Math.min(.033, Math.max(0, (now - lastFrame) / 1000));
    lastFrame = now;
    if (state.mode === 'playing') updatePlaying(dt);
    else if (state.mode === 'crescendo') updateCrescendo(dt);
    else if (state.mode !== 'paused' && state.mode !== 'mutation') updateParticles(dt);
    updateVisuals(dt);
    updateToast(dt);
    updateHud();
    renderer.render(visual);
    drawGame();
    scheduleFrame();
  }

  window.addEventListener('resize', resize);
  window.addEventListener('blur', () => {
    input.keys.clear();
    input.pointerActive = false;
    if (state.mode === 'playing') pauseGame();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      stopFrameLoop();
      if (state.mode === 'playing') pauseGame();
    } else {
      lastFrame = performance.now();
      scheduleFrame();
    }
  });

  window.addEventListener('keydown', (event) => {
    const key = event.key.toLowerCase();
    if (trapModalFocus(event)) return;
    const isButton = event.target instanceof Element && Boolean(event.target.closest('button'));
    if (isButton && (key === ' ' || key === 'enter')) return;
    if (['arrowleft', 'arrowright', 'a', 'd', ' '].includes(key)) event.preventDefault();
    if (key === 'm') {
      audio.toggle();
      return;
    }
    if (key === 'p' || key === 'escape' || key === ' ') {
      if (state.mode === 'paused') resumeGame();
      else pauseGame();
      return;
    }
    if (key === 'r' && state.mode === 'result' && !isTrialRun) {
      startRun();
      return;
    }
    input.keys.add(key);
  });

  window.addEventListener('keyup', (event) => input.keys.delete(event.key.toLowerCase()));

  gameCanvas.addEventListener('pointerdown', (event) => {
    if (state.mode !== 'playing') return;
    input.pointerId = event.pointerId;
    setPointerTarget(event);
    if (event.pointerType !== 'mouse') gameCanvas.setPointerCapture?.(event.pointerId);
  });

  gameCanvas.addEventListener('pointermove', (event) => {
    if (state.mode !== 'playing') return;
    if (event.pointerType === 'mouse' || event.pointerId === input.pointerId) setPointerTarget(event);
  });

  const releasePointer = (event) => {
    if (event.pointerId !== input.pointerId) return;
    // Keep the last touch destination active so a simple tap works like a command,
    // rather than requiring the player to hold a finger down while the seed travels.
    input.pointerId = null;
  };
  gameCanvas.addEventListener('pointerup', releasePointer);
  gameCanvas.addEventListener('pointercancel', releasePointer);
  gameCanvas.addEventListener('pointerleave', (event) => {
    if (event.pointerType === 'mouse') input.pointerActive = false;
  });
  gameCanvas.addEventListener('contextmenu', (event) => event.preventDefault());

  ui.playButton.addEventListener('click', startRun);
  ui.replayButton.addEventListener('click', startRun);
  ui.homeButton.addEventListener('click', goHome);
  ui.resumeButton.addEventListener('click', resumeGame);
  ui.quitButton.addEventListener('click', () => {
    postToGrove('run-abandon');
    goHome();
  });
  ui.pauseButton.addEventListener('click', pauseGame);
  ui.soundButton.addEventListener('click', () => audio.toggle());
  ui.fullscreenButton.addEventListener('click', async () => {
    if (isGroveHosted) return;
    try {
      if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
      else await document.exitFullscreen();
    } catch (_) {
      showToast('Fullscreen is not available in this browser.', false, 1.8, true);
    }
  });

  document.addEventListener('fullscreenchange', () => {
    const label = document.fullscreenElement ? 'Exit fullscreen' : 'Enter fullscreen';
    ui.fullscreenButton.setAttribute('aria-label', label);
    ui.fullscreenButton.title = label;
  });
  motionQuery?.addEventListener?.('change', (event) => {
    reducedMotion = event.matches;
    if (reducedMotion) {
      state.shake = 0;
      if (state.particles.length > 150) state.particles.splice(0, state.particles.length - 150);
    }
  });

  ui.startBest.textContent = `PERSONAL BEST · ${formatNumber(state.best)}`;
  resetVisualForSeed(state.seed);
  resize();
  setupQaControls();
  syncDialogState();
  postToGrove('game-ready');
  scheduleFrame();
})();
