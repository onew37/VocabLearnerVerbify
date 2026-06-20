/* fx.js — self-contained, ES5-safe full-screen particle effects.
 * Public API: window.FX.start(kind), window.FX.stop()
 * kinds: "snow", "fireworks"
 * No imports, no build step. Pure Canvas 2D + Math.
 */
(function (window, document) {
  "use strict";

  /* ----------------------------------------------------------------------
   * Cross-browser requestAnimationFrame / cancel with setTimeout fallback
   * -------------------------------------------------------------------- */
  var raf =
    window.requestAnimationFrame ||
    window.webkitRequestAnimationFrame ||
    window.mozRequestAnimationFrame ||
    window.oRequestAnimationFrame ||
    window.msRequestAnimationFrame ||
    function (cb) {
      return window.setTimeout(function () {
        cb(now());
      }, 1000 / 60);
    };

  var caf =
    window.cancelAnimationFrame ||
    window.webkitCancelAnimationFrame ||
    window.mozCancelAnimationFrame ||
    window.oCancelAnimationFrame ||
    window.msCancelAnimationFrame ||
    function (id) {
      window.clearTimeout(id);
    };

  /* Bind to window so `this` is correct in browsers that need it. */
  function requestFrame(cb) {
    return raf.call(window, cb);
  }
  function cancelFrame(id) {
    return caf.call(window, id);
  }

  function now() {
    if (window.performance && typeof window.performance.now === "function") {
      return window.performance.now();
    }
    return new Date().getTime();
  }

  /* ----------------------------------------------------------------------
   * Small helpers
   * -------------------------------------------------------------------- */
  function rand(min, max) {
    return min + Math.random() * (max - min);
  }
  function randInt(min, max) {
    return Math.floor(rand(min, max + 1));
  }
  function pick(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }
  function clamp(v, lo, hi) {
    return v < lo ? lo : v > hi ? hi : v;
  }

  function prefersReducedMotion() {
    try {
      return (
        window.matchMedia &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches
      );
    } catch (e) {
      return false;
    }
  }

  /* ----------------------------------------------------------------------
   * Module-level state (single canvas, single active effect)
   * -------------------------------------------------------------------- */
  var state = {
    canvas: null,
    ctx: null,
    dpr: 1,
    width: 0, // CSS pixels
    height: 0, // CSS pixels
    kind: null,
    effect: null, // current effect instance
    rafId: null,
    lastTime: 0,
    running: false,
    resizeHandler: null,
    reduced: false
  };

  /* ----------------------------------------------------------------------
   * Canvas creation / sizing
   * -------------------------------------------------------------------- */
  function createCanvas() {
    if (state.canvas) {
      return state.canvas;
    }
    var c = document.createElement("canvas");
    c.id = "fx-canvas";
    var s = c.style;
    s.position = "fixed";
    s.top = "0";
    s.left = "0";
    s.right = "0";
    s.bottom = "0";
    /* `inset` shorthand for browsers that support it; the explicit
       top/left/right/bottom above guarantee coverage everywhere. */
    s.width = "100%";
    s.height = "100%";
    s.margin = "0";
    s.padding = "0";
    s.border = "0";
    s.display = "block";
    s.zIndex = "-1"; // behind UI content, above the page background gradient
    s.pointerEvents = "none"; // never block clicks
    s.userSelect = "none";

    // Append once. Body may not exist yet in pathological cases; guard.
    var parent = document.body || document.documentElement;
    parent.appendChild(c);

    state.canvas = c;
    state.ctx = c.getContext("2d");
    return c;
  }

  function sizeCanvas() {
    var c = state.canvas;
    if (!c) {
      return;
    }
    var dpr = window.devicePixelRatio || 1;
    // Clamp DPR so huge retina + 4K screens don't tank performance.
    dpr = clamp(dpr, 1, 2.5);

    var w = window.innerWidth || document.documentElement.clientWidth || 0;
    var h = window.innerHeight || document.documentElement.clientHeight || 0;

    state.dpr = dpr;
    state.width = w;
    state.height = h;

    // Backing store in device pixels.
    c.width = Math.max(1, Math.floor(w * dpr));
    c.height = Math.max(1, Math.floor(h * dpr));
    // CSS size in layout pixels.
    c.style.width = w + "px";
    c.style.height = h + "px";

    // Draw using CSS-pixel coordinates; scale the context to DPR.
    state.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  /* ----------------------------------------------------------------------
   * Effect: SNOW
   * -------------------------------------------------------------------- */
  function SnowEffect() {
    this.flakes = [];
    this.built = false;
  }

  SnowEffect.prototype.flakeCount = function () {
    // ~120-180 flakes scaled to screen area (baseline ~1920x1080).
    var area = state.width * state.height;
    var base = 1920 * 1080;
    var ratio = area / base;
    var n = Math.round(rand(120, 180) * clamp(ratio, 0.45, 1.25));
    return clamp(n, 70, 220);
  };

  SnowEffect.prototype.makeFlake = function (atTop) {
    var w = state.width;
    var h = state.height;
    var r = rand(0.8, 3.4); // varied radii
    return {
      x: rand(0, w),
      y: atTop ? rand(-h * 0.15, 0) : rand(0, h),
      r: r,
      // bigger flakes fall a bit faster (parallax feel)
      vy: rand(18, 42) * (0.6 + r / 3.4) * 0.7, // px/sec
      sway: rand(8, 26), // horizontal sway amplitude (px)
      swaySpeed: rand(0.4, 1.4), // radians/sec
      phase: rand(0, Math.PI * 2),
      drift: rand(-8, 8), // gentle constant horizontal drift px/sec
      alpha: rand(0.25, 0.7) // modest so text stays readable
    };
  };

  SnowEffect.prototype.build = function () {
    this.flakes.length = 0;
    var count = this.flakeCount();
    for (var i = 0; i < count; i++) {
      this.flakes.push(this.makeFlake(false));
    }
    this.built = true;
  };

  SnowEffect.prototype.onResize = function () {
    // Rebuild to rescale flake population to new screen size.
    this.build();
  };

  SnowEffect.prototype.update = function (dt, t) {
    var w = state.width;
    var h = state.height;
    var flakes = this.flakes;
    for (var i = 0; i < flakes.length; i++) {
      var f = flakes[i];
      f.y += f.vy * dt;
      f.phase += f.swaySpeed * dt;
      f.x += f.drift * dt;
      // Wrap horizontally so drift never empties a side.
      if (f.x < -10) {
        f.x = w + 10;
      } else if (f.x > w + 10) {
        f.x = -10;
      }
      // Wrap to the top once fully off the bottom.
      if (f.y - f.r > h) {
        var nf = this.makeFlake(true);
        f.x = nf.x;
        f.y = nf.y;
        f.r = nf.r;
        f.vy = nf.vy;
        f.sway = nf.sway;
        f.swaySpeed = nf.swaySpeed;
        f.phase = nf.phase;
        f.drift = nf.drift;
        f.alpha = nf.alpha;
      }
    }
  };

  SnowEffect.prototype.drawFlake = function (ctx, f) {
    var x = f.x + Math.sin(f.phase) * f.sway;
    var y = f.y;
    // subtle glow
    ctx.beginPath();
    ctx.globalAlpha = f.alpha;
    ctx.fillStyle = "#ffffff";
    ctx.shadowColor = "rgba(255,255,255,0.8)";
    ctx.shadowBlur = f.r * 2.2;
    ctx.arc(x, y, f.r, 0, Math.PI * 2);
    ctx.fill();
  };

  SnowEffect.prototype.render = function (ctx) {
    ctx.save();
    for (var i = 0; i < this.flakes.length; i++) {
      this.drawFlake(ctx, this.flakes[i]);
    }
    ctx.restore();
  };

  // A single calm static frame for reduced-motion users.
  SnowEffect.prototype.renderStatic = function (ctx) {
    if (!this.built) {
      this.build();
    }
    // Hard clear then place flakes once, no motion.
    ctx.clearRect(0, 0, state.width, state.height);
    ctx.save();
    for (var i = 0; i < this.flakes.length; i++) {
      var f = this.flakes[i];
      // freeze a representative sway offset
      f._frozenX = f.x + Math.sin(f.phase) * f.sway;
      ctx.beginPath();
      ctx.globalAlpha = f.alpha * 0.85;
      ctx.fillStyle = "#ffffff";
      ctx.shadowColor = "rgba(255,255,255,0.7)";
      ctx.shadowBlur = f.r * 2;
      ctx.arc(f._frozenX, f.y, f.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  };

  // Trailing-fade clear used during animation.
  SnowEffect.prototype.fadeClear = function (ctx) {
    ctx.save();
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
    ctx.globalCompositeOperation = "source-over";
    // Very light trailing fade keeps snow crisp but smooth.
    ctx.fillStyle = "rgba(0,0,0,0.18)";
    // For snow we don't want to darken the background, so instead of
    // painting black we simply clear with a soft fade via destination-out.
    ctx.globalCompositeOperation = "destination-out";
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.fillRect(0, 0, state.width, state.height);
    ctx.restore();
  };

  /* ----------------------------------------------------------------------
   * Effect: FIREWORKS
   * -------------------------------------------------------------------- */
  var FW_COLORS = [
    "255,215,130", // champagne gold
    "255,196,72", // deep gold
    "80,170,255", // electric blue
    "120,200,255", // light blue
    "255,255,255" // white
  ];

  function FireworksEffect() {
    this.rockets = [];
    this.sparks = [];
    this.launchTimer = 0;
    this.nextLaunch = 0.4;
  }

  FireworksEffect.prototype.onResize = function () {
    // Nothing persistent to rebuild; existing particles just continue.
  };

  FireworksEffect.prototype.spawnRocket = function () {
    var w = state.width;
    var h = state.height;
    var targetY = rand(h * 0.15, h * 0.45); // explosion altitude
    var x = rand(w * 0.15, w * 0.85);
    this.rockets.push({
      x: x,
      y: h + 8,
      vx: rand(-20, 20),
      vy: -rand(260, 360), // upward (px/sec)
      targetY: targetY,
      color: pick(FW_COLORS),
      trail: 0
    });
  };

  FireworksEffect.prototype.explode = function (x, y, baseColor) {
    var count = randInt(36, 64);
    var speedBase = rand(90, 170);
    for (var i = 0; i < count; i++) {
      var ang = (Math.PI * 2 * i) / count + rand(-0.12, 0.12);
      var spd = speedBase * rand(0.45, 1.05);
      // Mostly the rocket color, with sparkles of the other accents.
      var color = Math.random() < 0.7 ? baseColor : pick(FW_COLORS);
      this.sparks.push({
        x: x,
        y: y,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd,
        color: color,
        life: 0,
        ttl: rand(0.9, 1.8),
        size: rand(1.2, 2.6),
        px: x, // previous position for trailing line
        py: y
      });
    }
  };

  FireworksEffect.prototype.update = function (dt, t) {
    var h = state.height;
    var gravity = 90; // px/sec^2 for sparks
    var i, r, p;

    // Launch scheduling: a few launches every couple seconds.
    this.launchTimer += dt;
    if (this.launchTimer >= this.nextLaunch) {
      this.launchTimer = 0;
      this.nextLaunch = rand(0.5, 1.2);
      var burst = randInt(1, 2);
      for (var b = 0; b < burst; b++) {
        this.spawnRocket();
      }
    }

    // Rockets.
    for (i = this.rockets.length - 1; i >= 0; i--) {
      r = this.rockets[i];
      r.x += r.vx * dt;
      r.y += r.vy * dt;
      r.vy += 60 * dt; // slight deceleration as it climbs
      r.trail += dt;
      if (r.y <= r.targetY || r.vy >= -10) {
        this.explode(r.x, r.y, r.color);
        this.rockets.splice(i, 1);
      }
    }

    // Sparks.
    for (i = this.sparks.length - 1; i >= 0; i--) {
      p = this.sparks[i];
      p.px = p.x;
      p.py = p.y;
      p.vx *= 0.985; // air drag
      p.vy *= 0.985;
      p.vy += gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life += dt;
      if (p.life >= p.ttl || p.y > h + 20) {
        this.sparks.splice(i, 1);
      }
    }
  };

  FireworksEffect.prototype.render = function (ctx) {
    var i, r, p;
    ctx.save();
    ctx.globalCompositeOperation = "lighter"; // additive glow

    // Rockets (bright head + short trail).
    for (i = 0; i < this.rockets.length; i++) {
      r = this.rockets[i];
      ctx.globalAlpha = 0.9;
      ctx.strokeStyle = "rgba(" + r.color + ",0.5)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(r.x, r.y);
      ctx.lineTo(r.x, r.y + 10);
      ctx.stroke();

      ctx.beginPath();
      ctx.fillStyle = "rgba(" + r.color + ",0.95)";
      ctx.shadowColor = "rgba(" + r.color + ",0.9)";
      ctx.shadowBlur = 8;
      ctx.arc(r.x, r.y, 2.2, 0, Math.PI * 2);
      ctx.fill();
    }

    // Sparks (fading trailing lines + dots).
    for (i = 0; i < this.sparks.length; i++) {
      p = this.sparks[i];
      var k = 1 - p.life / p.ttl; // 1 -> 0
      if (k <= 0) {
        continue;
      }
      var a = clamp(k, 0, 1) * 0.85; // modest alpha for readability
      ctx.globalAlpha = a;
      ctx.strokeStyle = "rgba(" + p.color + "," + a.toFixed(3) + ")";
      ctx.lineWidth = p.size * 0.8;
      ctx.beginPath();
      ctx.moveTo(p.px, p.py);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();

      ctx.beginPath();
      ctx.fillStyle = "rgba(" + p.color + "," + a.toFixed(3) + ")";
      ctx.shadowColor = "rgba(" + p.color + "," + a.toFixed(3) + ")";
      ctx.shadowBlur = 6;
      ctx.arc(p.x, p.y, p.size * k + 0.4, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  };

  // Trailing-fade clear: paint a translucent black so old frames decay.
  FireworksEffect.prototype.fadeClear = function (ctx) {
    ctx.save();
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
    ctx.fillStyle = "rgba(0,0,0,0.22)";
    ctx.fillRect(0, 0, state.width, state.height);
    ctx.restore();
  };

  // Single static frame for reduced motion: one frozen, gentle burst.
  FireworksEffect.prototype.renderStatic = function (ctx) {
    ctx.clearRect(0, 0, state.width, state.height);
    var cx = state.width * 0.5;
    var cy = state.height * 0.4;
    var count = 48;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (var i = 0; i < count; i++) {
      var ang = (Math.PI * 2 * i) / count;
      var rad = rand(40, 120);
      var x = cx + Math.cos(ang) * rad;
      var y = cy + Math.sin(ang) * rad;
      var color = pick(FW_COLORS);
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = "rgba(" + color + ",0.6)";
      ctx.shadowColor = "rgba(" + color + ",0.6)";
      ctx.shadowBlur = 6;
      ctx.beginPath();
      ctx.arc(x, y, 2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  };

  /* ----------------------------------------------------------------------
   * Effect factory
   * -------------------------------------------------------------------- */
  function makeEffect(kind) {
    if (kind === "snow") {
      return new SnowEffect();
    }
    if (kind === "fireworks") {
      return new FireworksEffect();
    }
    return null;
  }

  /* ----------------------------------------------------------------------
   * Animation loop
   * -------------------------------------------------------------------- */
  function frame(ts) {
    if (!state.running || !state.effect) {
      return;
    }
    if (!state.lastTime) {
      state.lastTime = ts;
    }
    var dt = (ts - state.lastTime) / 1000;
    state.lastTime = ts;
    // Guard against huge gaps (tab backgrounded) — cap delta.
    if (dt > 0.05) {
      dt = 0.05;
    }
    if (dt < 0) {
      dt = 0;
    }

    var ctx = state.ctx;
    var t = ts / 1000;

    // Trailing-fade clear for nice motion.
    if (state.effect.fadeClear) {
      state.effect.fadeClear(ctx);
    } else {
      ctx.clearRect(0, 0, state.width, state.height);
    }

    state.effect.update(dt, t);
    state.effect.render(ctx);

    state.rafId = requestFrame(frame);
  }

  /* ----------------------------------------------------------------------
   * Resize handling (debounced via rAF)
   * -------------------------------------------------------------------- */
  function handleResize() {
    if (!state.canvas) {
      return;
    }
    sizeCanvas();
    if (state.effect && state.effect.onResize) {
      state.effect.onResize();
    }
    // For reduced motion we must repaint the single static frame.
    if (state.reduced && state.effect) {
      var ctx = state.ctx;
      ctx.clearRect(0, 0, state.width, state.height);
      if (state.effect.renderStatic) {
        state.effect.renderStatic(ctx);
      } else {
        state.effect.render(ctx);
      }
    }
  }

  function attachListeners() {
    if (state.resizeHandler) {
      return;
    }
    state.resizeHandler = function () {
      handleResize();
    };
    window.addEventListener("resize", state.resizeHandler, false);
    try {
      window.addEventListener("orientationchange", state.resizeHandler, false);
    } catch (e) {}
  }

  function detachListeners() {
    if (state.resizeHandler) {
      window.removeEventListener("resize", state.resizeHandler, false);
      try {
        window.removeEventListener(
          "orientationchange",
          state.resizeHandler,
          false
        );
      } catch (e) {}
      state.resizeHandler = null;
    }
  }

  /* ----------------------------------------------------------------------
   * Public API
   * -------------------------------------------------------------------- */
  function start(kind) {
    if (kind !== "snow" && kind !== "fireworks") {
      // Unknown kind: do nothing (keeps current effect if any).
      return;
    }

    // Ensure canvas exists & is sized.
    createCanvas();
    sizeCanvas();
    attachListeners();

    state.reduced = prefersReducedMotion();

    // Switch effects cleanly: stop loop, swap instance, reset clock.
    if (state.rafId != null) {
      cancelFrame(state.rafId);
      state.rafId = null;
    }
    state.kind = kind;
    state.effect = makeEffect(kind);
    state.lastTime = 0;

    // Hard clear before the new effect paints.
    state.ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
    state.ctx.clearRect(0, 0, state.width, state.height);

    if (state.reduced) {
      // Render a single subtle static frame; do NOT animate.
      state.running = false;
      if (state.effect.renderStatic) {
        state.effect.renderStatic(state.ctx);
      } else {
        state.effect.render(state.ctx);
      }
      return;
    }

    state.running = true;
    state.rafId = requestFrame(frame);
  }

  function stop() {
    state.running = false;
    if (state.rafId != null) {
      cancelFrame(state.rafId);
      state.rafId = null;
    }
    detachListeners();
    if (state.canvas && state.canvas.parentNode) {
      state.canvas.parentNode.removeChild(state.canvas);
    }
    state.canvas = null;
    state.ctx = null;
    state.effect = null;
    state.kind = null;
    state.lastTime = 0;
  }

  /* Expose. */
  window.FX = {
    start: start,
    stop: stop
  };
})(window, document);