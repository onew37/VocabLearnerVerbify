/*!
 * ascii-anim.js — a small library of looping ASCII animations.
 * Self-contained, ES5-safe (no imports, no build step).
 * Public API: window.Ascii { names, start, random, stop }
 *
 * Each animation is rendered as text into a <pre>-style DOM element.
 * Color inherits the theme via `currentColor` unless opts.color is given.
 */
(function (global) {
  'use strict';

  /* ----------------------------------------------------------------------
   * Cross-browser requestAnimationFrame / cancelAnimationFrame with a
   * setTimeout fallback (~60fps). We throttle to the requested fps inside
   * the loop, so this just needs to be "a frame source".
   * -------------------------------------------------------------------- */
  var raf =
    (global.requestAnimationFrame ||
      global.webkitRequestAnimationFrame ||
      global.mozRequestAnimationFrame ||
      function (cb) {
        return global.setTimeout(function () {
          cb(now());
        }, 1000 / 60);
      });

  var caf =
    (global.cancelAnimationFrame ||
      global.webkitCancelAnimationFrame ||
      global.mozCancelAnimationFrame ||
      function (id) {
        global.clearTimeout(id);
      });

  // Bind to the host object so `this` is correct in browsers that care.
  function requestFrame(cb) {
    return raf.call(global, cb);
  }
  function cancelFrame(id) {
    return caf.call(global, id);
  }

  function now() {
    return (global.Date && Date.now) ? Date.now() : new Date().getTime();
  }

  /* ----------------------------------------------------------------------
   * Defaults / shared helpers
   * -------------------------------------------------------------------- */
  var DEFAULT_W = 40;
  var DEFAULT_H = 20;
  var DEFAULT_FPS = 30;

  // Luminance ramp from dark -> bright. Shared by donut/wave; index by
  // a 0..1 brightness value.
  var RAMP = '.,-~:;=!*#$@';

  function rampChar(t) {
    // t in [0,1]; clamp and map to ramp index.
    if (t < 0) t = 0;
    if (t > 1) t = 1;
    var i = (t * (RAMP.length - 1)) | 0;
    return RAMP.charAt(i);
  }

  function clamp(v, lo, hi) {
    return v < lo ? lo : (v > hi ? hi : v);
  }

  function prefersReducedMotion() {
    try {
      return !!(global.matchMedia &&
        global.matchMedia('(prefers-reduced-motion: reduce)').matches);
    } catch (e) {
      return false;
    }
  }



  // Build an empty width*height char buffer (single Array, row-major).
  function makeBuffer(w, h, fill) {
    var buf = new Array(w * h);
    var blank = (fill == null) ? ' ' : fill;
    for (var i = 0; i < buf.length; i++) buf[i] = blank;
    return buf;
  }

  // Join a row-major char buffer into a newline-separated string.
  function bufferToString(buf, w, h) {
    var lines = new Array(h);
    for (var y = 0; y < h; y++) {
      lines[y] = buf.slice(y * w, y * w + w).join('');
    }
    return lines.join('\n');
  }

  // Simple integer line plot (Bresenham) into a char buffer.
  function plotLine(buf, w, h, x0, y0, x1, y1, ch) {
    x0 = Math.round(x0); y0 = Math.round(y0);
    x1 = Math.round(x1); y1 = Math.round(y1);
    var dx = Math.abs(x1 - x0);
    var dy = Math.abs(y1 - y0);
    var sx = x0 < x1 ? 1 : -1;
    var sy = y0 < y1 ? 1 : -1;
    var err = dx - dy;
    var guard = 0;
    var maxSteps = (dx + dy) + 4; // safety bound, never infinite
    while (guard++ <= maxSteps) {
      if (x0 >= 0 && x0 < w && y0 >= 0 && y0 < h) {
        buf[y0 * w + x0] = ch;
      }
      if (x0 === x1 && y0 === y1) break;
      var e2 = 2 * err;
      if (e2 > -dy) { err -= dy; x0 += sx; }
      if (e2 < dx) { err += dx; y0 += sy; }
    }
  }

  /* ----------------------------------------------------------------------
   * Animations.
   *
   * Each animation is an object with:
   *   init(state, w, h)            -> set up persistent fields on state.anim
   *   frame(state, w, h, t)        -> return the rendered string for time t
   *
   * `t` is seconds since the animation started (float).
   * Persistent per-animation scratch lives on state.anim.
   * -------------------------------------------------------------------- */
  var ANIMS = {};

  /* ---- 1) DONUT: the classic rotating ASCII torus -------------------- */
  ANIMS.donut = {
    init: function (state) {
      state.anim = { A: 0, B: 0 };
    },
    frame: function (state, w, h, t) {
      var a = state.anim;
      // Advance rotation angles. Drive by elapsed time so speed is
      // independent of frame rate.
      a.A = t * 1.0;
      a.B = t * 0.5;

      var sinA = Math.sin(a.A), cosA = Math.cos(a.A);
      var sinB = Math.sin(a.B), cosB = Math.cos(a.B);

      var output = makeBuffer(w, h, ' ');
      var zbuf = new Array(w * h);
      for (var z = 0; z < zbuf.length; z++) zbuf[z] = 0;

      // Torus parameters (donut.c style).
      var R1 = 1;   // tube radius
      var R2 = 2;   // center-to-tube radius
      var K2 = 5;   // distance from viewer

      // K1 scales the projection to fit BOTH dimensions. ASPECT corrects for the
      // character cell shape (our cells are nearly square, not the 2:1 of a classic
      // terminal) so the torus renders ROUND instead of flat/wide.
      var ASPECT = 0.92;
      var K1 = Math.min(w * 0.33, h * 0.72);

      // theta sweeps the tube cross-section; phi sweeps around the center.
      var thetaStep = 0.07;
      var phiStep = 0.02;

      for (var theta = 0; theta < 6.283185307; theta += thetaStep) {
        var costheta = Math.cos(theta), sintheta = Math.sin(theta);
        for (var phi = 0; phi < 6.283185307; phi += phiStep) {
          var cosphi = Math.cos(phi), sinphi = Math.sin(phi);

          // Coordinate of the point on the unrotated torus surface.
          var circlex = R2 + R1 * costheta;
          var circley = R1 * sintheta;

          // 3D coords after rotation about X (A) and Z (B).
          var x = circlex * (cosB * cosphi + sinA * sinB * sinphi) -
            circley * cosA * sinB;
          var y = circlex * (sinB * cosphi - sinA * cosB * sinphi) +
            circley * cosA * cosB;
          var z3 = K2 + cosA * circlex * sinphi + circley * sinA;
          var ooz = 1 / z3; // one-over-z for perspective + z-buffer

          // Project to screen coordinates (ASPECT keeps it round on near-square cells).
          var xp = (w / 2 + K1 * ooz * x) | 0;
          var yp = (h / 2 - K1 * ASPECT * ooz * y) | 0;

          if (xp < 0 || xp >= w || yp < 0 || yp >= h) continue;

          // Luminance: surface-normal dotted with light direction.
          var L =
            cosphi * costheta * sinB -
            cosA * costheta * sinphi -
            sinA * sintheta +
            cosB * (cosA * sintheta - costheta * sinA * sinphi);

          var idx = yp * w + xp;
          if (ooz > zbuf[idx]) {
            zbuf[idx] = ooz;
            if (L > 0) {
              // Map L (0..~1.4) onto the ramp.
              var li = (L * 8) | 0;
              if (li < 0) li = 0;
              if (li > RAMP.length - 1) li = RAMP.length - 1;
              output[idx] = RAMP.charAt(li);
            } else {
              output[idx] = RAMP.charAt(0);
            }
          }
        }
      }

      return bufferToString(output, w, h);
    }
  };

  /* ---- 3) CUBE: rotating wireframe ----------------------------------- */
  ANIMS.cube = {
    init: function (state) {
      // Unit cube vertices.
      state.anim = {
        verts: [
          [-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1],
          [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]
        ],
        // Edges as vertex-index pairs (12 edges).
        edges: [
          [0, 1], [1, 2], [2, 3], [3, 0], // back face
          [4, 5], [5, 6], [6, 7], [7, 4], // front face
          [0, 4], [1, 5], [2, 6], [3, 7]  // connectors
        ]
      };
    },
    frame: function (state, w, h, t) {
      var a = state.anim;
      var ax = t * 0.9; // rotation about X
      var ay = t * 1.3; // rotation about Y

      var cx = Math.cos(ax), sx = Math.sin(ax);
      var cy = Math.cos(ay), sy = Math.sin(ay);

      var buf = makeBuffer(w, h, ' ');

      var dist = 4;           // camera distance
      var scale = (h < w ? h : w) * 0.62;
      var aspect = 1.05;      // near-square cells — only a touch of horizontal stretch

      // Project all 8 vertices once.
      var proj = new Array(8);
      for (var i = 0; i < 8; i++) {
        var v = a.verts[i];
        var X = v[0], Y = v[1], Z = v[2];

        // Rotate about Y, then X.
        var x1 = cy * X + sy * Z;
        var z1 = -sy * X + cy * Z;
        var y1 = Y;

        var y2 = cx * y1 - sx * z1;
        var z2 = sx * y1 + cx * z1;
        var x2 = x1;

        var z = z2 + dist;
        var ooz = 1 / z;
        var px = w / 2 + scale * ooz * x2 * aspect;
        var py = h / 2 - scale * ooz * y2;
        proj[i] = [px, py];
      }

      // Draw the 12 edges.
      for (var e = 0; e < a.edges.length; e++) {
        var p0 = proj[a.edges[e][0]];
        var p1 = proj[a.edges[e][1]];
        plotLine(buf, w, h, p0[0], p0[1], p1[0], p1[1], '#');
      }

      // Mark the vertices a little more strongly.
      for (var k = 0; k < 8; k++) {
        var px2 = Math.round(proj[k][0]);
        var py2 = Math.round(proj[k][1]);
        if (px2 >= 0 && px2 < w && py2 >= 0 && py2 < h) {
          buf[py2 * w + px2] = '@';
        }
      }

      return bufferToString(buf, w, h);
    }
  };

  /* WAVE was archived (filled the full rectangle / showed the border).
     Its code now lives in ascii-archive.js. */


  /* ----------------------------------------------------------------------
   * Rendering / lifecycle
   * -------------------------------------------------------------------- */

  function styleElement(el, color) {
    var s = el.style;
    s.fontFamily =
      'Menlo, Consolas, "DejaVu Sans Mono", "Courier New", monospace';
    s.fontSize = '10px';
    s.lineHeight = '6.5px';
    s.letterSpacing = '0';
    s.whiteSpace = 'pre';
    s.color = color ? color : 'currentColor';
    // user-select: none across vendors.
    s.webkitUserSelect = 'none';
    s.mozUserSelect = 'none';
    s.msUserSelect = 'none';
    s.userSelect = 'none';
    s.margin = '0';
    s.overflow = 'hidden';
    s.display = 'block';
  }

  // Deterministic-enough PRNG seeded per element so multiple elements
  // running the same effect look independent. Uses the runtime Math.random
  // to seed (the runtime PRNG is acceptable for picking effects/visuals).
  function makeRng() {
    // Mulberry32 — small, fast, no deps. Seed from Math.random.
    var s = (Math.random() * 0xffffffff) >>> 0;
    return function () {
      s |= 0;
      s = (s + 0x6D2B79F5) | 0;
      var x = Math.imul(s ^ (s >>> 15), 1 | s);
      x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
      return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
    };
  }

  function stop(el) {
    if (!el) return;
    if (el.__asciiRAF != null) {
      cancelFrame(el.__asciiRAF);
      el.__asciiRAF = null;
    }
    el.__asciiState = null;
  }

  function start(el, name, opts) {
    if (!el) throw new Error('Ascii.start: element is required');
    if (!ANIMS[name]) {
      throw new Error('Ascii.start: unknown animation "' + name + '"');
    }
    opts = opts || {};

    // Restart cleanly: cancel any prior animation on this element.
    stop(el);

    var w = opts.width > 0 ? (opts.width | 0) : DEFAULT_W;
    var h = opts.height > 0 ? (opts.height | 0) : DEFAULT_H;
    var fps = opts.fps > 0 ? opts.fps : DEFAULT_FPS;
    var frameInterval = 1000 / fps;

    styleElement(el, opts.color);

    var state = {
      name: name,
      w: w,
      h: h,
      rng: makeRng(),
      anim: null,
      startTime: now(),
      lastDraw: 0
    };
    el.__asciiState = state;

    var def = ANIMS[name];
    if (typeof def.init === 'function') def.init(state, w, h); // some packs init lazily in frame()

    // Painting: most animations are plain monochrome text (textContent).
    // An animation may opt into rich output by setting `html: true` on its def
    // (e.g. wordlink colors individual words green/red during interactions).
    // The canvas is a <pre>, so newlines + spaces are preserved either way.
    var paint = def.html
      ? function (s) { el.innerHTML = s; }
      : function (s) { el.textContent = s; };

    // Reduced motion: render a single static frame and stop.
    if (prefersReducedMotion()) {
      paint(def.frame(state, w, h, 0));
      return;
    }

    // Draw the very first frame immediately so there's no blank flash.
    paint(def.frame(state, w, h, 0));
    state.lastDraw = now();

    function loop() {
      // Guard: if this element was stopped/restarted, bail out. We check
      // identity so a restart's new state doesn't get driven by an old loop.
      if (el.__asciiState !== state) return;

      var tNow = now();
      if (tNow - state.lastDraw >= frameInterval) {
        state.lastDraw = tNow;
        var elapsed = (tNow - state.startTime) / 1000;
        paint(def.frame(state, w, h, elapsed));
      }
      el.__asciiRAF = requestFrame(loop);
    }

    el.__asciiRAF = requestFrame(loop);
  }

  function random(el, opts) {
    var rnd = Math.random; // runtime PRNG is fine for picking the effect
    var idx = (rnd() * NAMES.length) | 0;
    if (idx >= NAMES.length) idx = NAMES.length - 1;
    start(el, NAMES[idx], opts);
    return NAMES[idx];
  }

  var NAMES = ['donut'];

  // Allow add-on animation packs to plug in (ascii-extra.js). Overrides an
  // existing animation (e.g. a revamped "cube") without duplicating the name.
  function register(name, def) {
    if (!def || typeof def.frame !== 'function') return;
    if (!ANIMS[name]) NAMES.push(name);
    ANIMS[name] = def;
    if (global.Ascii) global.Ascii.names = NAMES.slice();
  }

  global.Ascii = {
    names: NAMES.slice(),
    start: start,
    random: random,
    stop: stop,
    register: register,
    _anims: ANIMS   // debug handle: render a specific frame/time in tests
  };

})(typeof window !== 'undefined' ? window : this);