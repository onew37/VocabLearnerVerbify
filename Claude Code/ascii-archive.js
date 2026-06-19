/* Verbify — ARCHIVED ASCII animations (NOT loaded).
   Tunnel, Ripple, and Wave were retired because they fill the whole
   rectangle and expose the canvas border. Kept here for safekeeping.
   To re-enable: add <script src="ascii-archive.js"></script> after
   ascii-extra.js in index.html (this re-registers them into rotation). */
(function(){ if(!(window.Ascii&&window.Ascii.register)) return;
/* --- tunnel --- */
window.Ascii.register("tunnel", { frame:function(state,w,h,t){
  if(!state.anim) state.anim={};
  var ramp=" .,-~:;=!*#$@", rl=ramp.length;
  var cx=(w-1)/2, cy=(h-1)/2, asp=2.0;
  var maxr=Math.sqrt(cx*cx + (cy*asp)*(cy*asp));
  var out=new Array(h);
  for(var y=0;y<h;y++){ var row=new Array(w);
    for(var x=0;x<w;x++){
      var dx=(x-cx), dy=(y-cy)*asp, r=Math.sqrt(dx*dx+dy*dy);
      if(r<0.6) r=0.6;
      var ang=Math.atan2(dy,dx);
      var depth=8.0/r;                          // distance INTO the round tunnel
      var u=depth + t*2.2;                      // rings scroll toward the viewer
      var rings=0.5+0.5*Math.sin(u*5.0);        // concentric perspective rings (bunch toward centre)
      var wall=0.78+0.22*Math.cos(ang*2 - 0.6); // gentle one-sided wall shading (3D, no spokes)
      var near=Math.min(1, r/maxr);             // bright near the rim, dark at the far centre
      var b=rings*wall*(0.06+0.94*near);
      if(b<0)b=0; if(b>1)b=1;
      var ci=Math.floor(b*(rl-1)); if(ci<0)ci=0; if(ci>=rl)ci=rl-1;
      row[x]=ramp.charAt(ci);
    }
    out[y]=row.join("");
  }
  return out.join("\n");
}});
/* --- ripple --- */
window.Ascii.register("ripple", { frame: function(state, w, h, t) {
  if (!state.anim) { state.anim = {}; }
  var ramp = ".,-~:;=!*#$@"; var rl = ramp.length;
  var size = w * h; var buf = new Array(size);
  var cx = (w - 1) / 2; var cy = (h - 1) / 2;
  var aspect = 2.0;
  var s1x = cx * 0.55, s1y = cy * 0.55;
  var s2x = w - 1 - cx * 0.55, s2y = h - 1 - cy * 0.55;
  var x, y;
  for (y = 0; y < h; y++) {
    for (x = 0; x < w; x++) {
      var dx0 = (x - cx); var dy0 = (y - cy) * aspect;
      var r0 = Math.sqrt(dx0 * dx0 + dy0 * dy0);
      var dx1 = (x - s1x); var dy1 = (y - s1y) * aspect;
      var r1 = Math.sqrt(dx1 * dx1 + dy1 * dy1);
      var dx2 = (x - s2x); var dy2 = (y - s2y) * aspect;
      var r2 = Math.sqrt(dx2 * dx2 + dy2 * dy2);
      var k = 0.9;
      var w0 = Math.sin(r0 * k - t * 4.0) / (1.0 + r0 * 0.06);
      var w1 = Math.sin(r1 * k - t * 3.2) / (1.0 + r1 * 0.06);
      var w2 = Math.sin(r2 * k - t * 3.6) / (1.0 + r2 * 0.06);
      var val = (w0 + w1 * 0.7 + w2 * 0.7);
      val = (val + 1.6) / 3.2;
      if (val < 0) val = 0; if (val > 1) val = 1;
      var ci = Math.floor(val * (rl - 1));
      if (ci < 0) ci = 0; if (ci >= rl) ci = rl - 1;
      buf[y * w + x] = ramp.charAt(ci);
    }
  }
  var out = []; for (y = 0; y < h; y++) { out.push(buf.slice(y * w, y * w + w).join("")); }
  return out.join("\n");
} });
/* --- wave --- */
window.Ascii.register("wave", { init:function(state){ state.anim={}; },
  frame:function(state,w,h,t){
    var ramp=" .,-~:;=!*#$@", rl=ramp.length, buf=new Array(w*h), q;
    for(q=0;q<w*h;q++) buf[q]=" ";
    for(var y=0;y<h;y++) for(var x=0;x<w;x++){
      var nx=x/w*8, ny=y/h*8*0.5, dx=nx-4, dy=ny-2, dist=Math.sqrt(dx*dx+dy*dy);
      var v=Math.sin(nx*1.3+t*1.7)+Math.sin(ny*1.7-t*1.3)+Math.sin((nx+ny)*0.9+t)+Math.sin(dist*2.2-t*2.0);
      var b=(v+4)/8, ci=Math.floor(b*(rl-1)); if(ci<0)ci=0; if(ci>=rl)ci=rl-1; buf[y*w+x]=ramp.charAt(ci);
    }
    var out=new Array(h); for(y=0;y<h;y++) out[y]=buf.slice(y*w,y*w+w).join(""); return out.join("\n");
  }});
/* --- life --- */
window.Ascii.register("life", {
  init: function(state, w, h) {
    state.anim = {
      cols: w,
      rows: h,
      grid: null,
      next: null,
      prevHash: -1,
      stableCount: 0,
      age: 0,
      step: 0.12,
      acc: 0,
      lastT: 0,
      seeded: false
    };
  },
  frame: function(state, w, h, t) {
    if (!state.anim || state.anim.cols !== w || state.anim.rows !== h) {
      state.anim = {
        cols: w, rows: h, grid: null, next: null,
        prevHash: -1, stableCount: 0, age: 0,
        step: 0.12, acc: 0, lastT: t, seeded: false
      };
    }
    var a = state.anim;
    var size = w * h;
    var i, x, y;

    function seed() {
      a.grid = new Array(size);
      a.next = new Array(size);
      for (i = 0; i < size; i++) {
        a.grid[i] = Math.random() < 0.32 ? 1 : 0;
      }
      a.age = 0;
      a.stableCount = 0;
      a.prevHash = -1;
      a.seeded = true;
    }

    if (!a.seeded) {
      seed();
      a.lastT = t;
    }

    var dt = t - a.lastT;
    if (dt < 0) dt = 0;
    if (dt > 0.5) dt = 0.5;
    a.lastT = t;
    a.acc += dt;

    while (a.acc >= a.step) {
      a.acc -= a.step;
      var g = a.grid;
      var n = a.next;
      for (y = 0; y < h; y++) {
        var ym = ((y - 1) + h) % h;
        var yp = (y + 1) % h;
        var rowU = ym * w;
        var rowM = y * w;
        var rowD = yp * w;
        for (x = 0; x < w; x++) {
          var xm = ((x - 1) + w) % w;
          var xp = (x + 1) % w;
          var cnt = g[rowU + xm] + g[rowU + x] + g[rowU + xp]
                  + g[rowM + xm]            + g[rowM + xp]
                  + g[rowD + xm] + g[rowD + x] + g[rowD + xp];
          var alive = g[rowM + x];
          n[rowM + x] = (cnt === 3 || (alive && cnt === 2)) ? 1 : 0;
        }
      }
      a.grid = n;
      a.next = g;
      a.age++;

      var hash = 0;
      var live = 0;
      for (i = 0; i < size; i++) {
        if (a.grid[i]) { hash = (hash * 31 + i) | 0; live++; }
      }
      if (hash === a.prevHash || live === 0) {
        a.stableCount++;
      } else {
        a.stableCount = 0;
      }
      a.prevHash = hash;

      if (a.stableCount >= 6 || a.age >= 220 || live === 0) {
        seed();
      }
    }

    var glyph = "#";
    var dot = ".";
    var space = " ";
    var out = new Array(h);
    var grd = a.grid;
    for (y = 0; y < h; y++) {
      var rowOff = y * w;
      var line = "";
      for (x = 0; x < w; x++) {
        var v = grd[rowOff + x];
        if (v) {
          line += glyph;
        } else {
          line += space;
        }
      }
      if (line.length < w) {
        while (line.length < w) line += " ";
      } else if (line.length > w) {
        line = line.substring(0, w);
      }
      out[y] = line;
    }
    return out.join("\n");
  }
});
})();
