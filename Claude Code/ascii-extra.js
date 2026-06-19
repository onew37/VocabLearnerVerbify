/* Verbify — ASCII animation pack (plugs into window.Ascii.register). */
(function(){ if(!(window.Ascii&&window.Ascii.register)) return;
/* --- helix --- */
window.Ascii.register("helix", {
  init: function(state, w, h){
    state.anim = { depthGlyphs: " .,:-=+*oO@" };
  },
  frame: function(state, w, h, t){
    if(!state.anim){ state.anim = { depthGlyphs: " .,:-=+*oO@" }; }
    var depthGlyphs = state.anim.depthGlyphs;
    var dN = depthGlyphs.length - 1;
    var i, j;
    var buf = new Array(h);
    for(i=0;i<h;i++){
      var row = new Array(w);
      for(j=0;j<w;j++){ row[j] = " "; }
      buf[i] = row;
    }
    var cx = (w - 1) / 2;                 // horizontal center
    var amp = Math.min(cx - 1, w * 0.34); // swing amplitude
    var freq = 0.7;                       // vertical wave density
    var rot = t * 1.6;                    // rotation about vertical axis

    // per-row strand positions and depth (z in -1..1, +1 = nearest)
    var ax = new Array(h), bx = new Array(h);
    var az = new Array(h), bz = new Array(h);
    for(i=0;i<h;i++){
      var phase = i * freq + rot;
      ax[i] = cx + amp * Math.sin(phase);
      az[i] = Math.cos(phase);
      bx[i] = cx + amp * Math.sin(phase + Math.PI);
      bz[i] = Math.cos(phase + Math.PI);
    }

    // rungs (ladder) every other row, drawn first so strands overwrite ends
    for(i=0;i<h;i++){
      if(i % 2 !== 0){ continue; }
      var lo = Math.round(Math.min(ax[i], bx[i]));
      var hi = Math.round(Math.max(ax[i], bx[i]));
      var span = hi - lo;
      for(var x = lo + 1; x < hi; x++){
        if(x < 0 || x >= w){ continue; }
        var frac = span > 0 ? (x - lo) / span : 0;
        var zr = az[i] * (1 - frac) + bz[i] * frac;
        var ri = Math.floor(((zr + 1) / 2) * 5); // 0..5 dim set
        if(ri < 0){ ri = 0; } if(ri > 5){ ri = 5; }
        if(buf[i][x] === " "){ buf[i][x] = " .,:-="[ri]; }
      }
    }

    // strands; draw farther one first, nearer one second (painter's algorithm)
    for(i=0;i<h;i++){
      var order;
      if(az[i] >= bz[i]){ order = [[ax[i],az[i]],[bx[i],bz[i]]]; }
      else { order = [[bx[i],bz[i]],[ax[i],az[i]]]; }
      for(var s=0;s<2;s++){
        var px = Math.round(order[s][0]);
        var pz = order[s][1];
        if(px < 0 || px >= w){ continue; }
        var gi = Math.floor(((pz + 1) / 2) * dN);
        if(gi < 0){ gi = 0; } if(gi > dN){ gi = dN; }
        buf[i][px] = depthGlyphs[gi];
      }
    }

    var out = new Array(h);
    for(i=0;i<h;i++){ out[i] = buf[i].join(""); }
    return out.join("\n");
  }
});
/* --- fire --- */
window.Ascii.register("fire", {
  init:function(state,w,h){ var heat=new Array(w*h); for(var i=0;i<heat.length;i++)heat[i]=0; state.anim={heat:heat, ramp:" .,:;ir*#$@", max:10}; },
  frame:function(state,w,h,t){
    if(!state.anim){ var hh=new Array(w*h); for(var q=0;q<hh.length;q++)hh[q]=0; state.anim={heat:hh, ramp:" .,:;ir*#$@", max:10}; }
    var A=state.anim, heat=A.heat, ramp=A.ramp, rl=ramp.length, max=A.max;
    var cxw=Math.floor(w/2), half=Math.max(4, Math.floor(w*0.20)); // a contained hearth
    var x,y;
    for(x=0;x<w;x++){
      var off=Math.abs(x-cxw);
      var edge=1-off/(half+1);
      heat[(h-1)*w+x]= (off<=half)? Math.max(0, Math.round(max*edge) - (Math.random()<0.3?1:0)) : 0;
    }
    for(x=0;x<w;x++){ for(y=1;y<h;y++){
      var src=y*w+x, rnd=Math.floor(Math.random()*3.0)&3, dst=src-rnd+1-w;
      if(dst>=0 && dst<heat.length){ var v=heat[src]-(rnd&1)-(Math.random()<0.28?1:0); if(v<0)v=0; heat[dst]=v; }
    }}
    var out=new Array(h);
    for(y=0;y<h;y++){ var row=new Array(w);
      for(x=0;x<w;x++){ var hv=heat[y*w+x]; if(hv<0)hv=0; if(hv>max)hv=max; row[x]=ramp.charAt(Math.round(hv/max*(rl-1))); }
      out[y]=row.join("");
    }
    return out.join("\n");
  }
});
/* --- galaxy --- */
window.Ascii.register("galaxy", { frame:function(state,w,h,t){
  if(!state.anim) state.anim={};
  var ramp=" .,-~:;=!*#$@", rl=ramp.length;
  var cx=(w-1)/2, cy=(h-1)/2;
  var ax=w*0.52, ay=w*0.21, sq=ax/ay; // wide, short -> tilted OVAL disk
  var rot=t*0.4;
  var out=new Array(h);
  for(var y=0;y<h;y++){ var row=new Array(w);
    for(var x=0;x<w;x++){
      var dx=(x-cx), dy=(y-cy);
      var ex=dx/ax, ey=dy/ay, er=Math.sqrt(ex*ex+ey*ey);     // elliptical radius
      var ddy=dy*sq, rr=Math.sqrt(dx*dx+ddy*ddy), ang=Math.atan2(ddy,dx);
      // MANY tightly-wound arms -> blends into a continuous oval, never goes to 0
      var spiral=0.5+0.5*Math.sin(2*ang - 6.0*Math.log(rr+2.0) + rot*2.0);
      var disk=Math.exp(-er*er*2.1);                          // oval glow
      var core=Math.exp(-er*er*15);                           // bright bulge
      var v=disk*(0.5+0.5*spiral) + core*0.85;
      var hsh=Math.abs(Math.sin(x*12.9898+y*78.233)*43758.5453); hsh-=Math.floor(hsh);
      if(hsh>0.92 && er<1.05) v=Math.max(v, 0.42+(hsh-0.92)*7); // dense star field
      if(v<0)v=0; if(v>1)v=1;
      var ci=Math.floor(v*(rl-1)); if(ci<0)ci=0; if(ci>=rl)ci=rl-1;
      row[x]=ramp.charAt(ci);
    }
    out[y]=row.join("");
  }
  return out.join("\n");
}});
/* --- blackhole --- */
window.Ascii.register("blackhole", { frame:function(state,w,h,t){
  if(!state.anim) state.anim={};
  if(!state.anim.stars){ var st=[]; var seed=20260619|0;
    function rnd(){ seed=(seed*1103515245+12345)&0x7fffffff; return seed/0x7fffffff; }
    var n=Math.floor(w*h*0.04); for(var s=0;s<n;s++){ st.push([Math.floor(rnd()*w), Math.floor(rnd()*h), rnd()]); }
    state.anim.stars=st;
  }
  var ramp=" .,-~:;=!*#$@", rl=ramp.length;
  var cx=(w-1)/2, cy=(h-1)/2, asp=2.0;
  var Rs=Math.min(w*0.5, h*asp*0.5)*0.30;
  var size=w*h, buf=new Array(size), dep=new Array(size), i;
  for(i=0;i<size;i++){ buf[i]=" "; dep[i]=-1e9; }
  function sphR(px,py){ var ddx=px-cx, ddy=(py-cy)*asp; return Math.sqrt(ddx*ddx+ddy*ddy); }
  function plot(px,py,ch,z){ px=Math.round(px); py=Math.round(py); if(px<0||px>=w||py<0||py>=h) return;
    var k=py*w+px; if(z>=dep[k]){ dep[k]=z; buf[k]=ch; } }
  // faint starfield, behind everything
  var S=state.anim.stars;
  for(i=0;i<S.length;i++){ var sx=S[i][0], sy=S[i][1]; if(sphR(sx,sy)<Rs*3.0) continue;
    var tw=0.5+0.5*Math.sin(t*1.6+S[i][2]*6.283); plot(sx,sy, tw>0.82?".":(tw>0.55?"`":" "), -1e8); }

  // tilted accretion disk as a 3D plane: perspective foreshorten + z-buffer occlusion
  var tilt=0.32, pers=0.30, rin=Rs*1.16, rout=Rs*3.25, spin=t*0.9;
  for(var rr=rin; rr<=rout; rr+=0.22){
    var rfrac=(rr-rin)/(rout-rin);
    for(var deg=0; deg<360; deg+=1.3){
      var th=deg*Math.PI/180, sn=Math.sin(th), cs=Math.cos(th);
      var vy=sn*tilt*(1.0+pers*sn);                          // near edge (bottom) opens larger
      var px=cx+rr*cs, py=cy+rr*vy, z=sn;
      if(sn<0 && sphR(px,py)<Rs) continue;                   // far side hidden behind the ball
      var swirl=0.6+0.4*Math.sin(th - rr*0.5 - spin*2.6);
      var inner=Math.pow(1-rfrac,1.6);                       // bright rim hugging the shadow
      var wing =Math.pow(Math.abs(cs),2.5)*Math.pow(1-rfrac,0.5); // bright edge-on side wings
      var dopp =0.30+0.70*Math.max(0,cs);                    // strong beaming: right side blazes
      var b=swirl*(inner*1.0 + wing*0.7)*(0.32+dopp);
      if(sn<0) b*=0.78;                                      // far surface slightly dimmer
      if(b<0.24) continue;                                   // dark face -> clean against black
      var ci=Math.floor(b*(rl-1)); if(ci<1)ci=1; if(ci>=rl)ci=rl-1;
      plot(px,py,ramp.charAt(ci), z - rfrac*0.001);
    }
  }
  // pure-black event horizon
  for(var y=0;y<h;y++) for(var x=0;x<w;x++){ var k=y*w+x; if(sphR(x,y) < Rs){ buf[k]=" "; dep[k]=4; } }
  // lensed photon halo wrapped fully around the ball (THE 3D-sphere cue) — brightest top & bottom
  for(var d2=0; d2<360; d2+=1.0){ var hb=d2*Math.PI/180, lr=Rs*1.05;
    var halo=0.62+0.38*Math.abs(Math.sin(hb)) + 0.12*Math.sin(t*2.0+d2*0.09);
    var ci2=Math.min(rl-1,Math.max(6,Math.floor(halo*(rl-1))));
    var hx=Math.round(cx+lr*Math.cos(hb)), hy=Math.round(cy+lr*Math.sin(hb)/asp);
    if(hx>=0&&hx<w&&hy>=0&&hy<h){ var kk=hy*w+hx; if(6>=dep[kk]){ buf[kk]=ramp.charAt(ci2); dep[kk]=6; } } }
  // near rim of disk crosses IN FRONT of the lower ball (drawn on top of the void)
  for(var rr2=rin; rr2<=rout*0.6; rr2+=0.22){ var rf2=(rr2-rin)/(rout-rin);
    for(var dg=14; dg<=166; dg+=1.3){ var th2=dg*Math.PI/180, sn2=Math.sin(th2), cs2=Math.cos(th2);
      var vy2=sn2*tilt*(1.0+pers*sn2), px2=cx+rr2*cs2, py2=cy+rr2*vy2;
      if(sphR(px2,py2)>=Rs) continue;                        // only where it overlaps the void
      var sw=0.6+0.4*Math.sin(th2 - rr2*0.5 - spin*2.6);
      var inb=Math.pow(1-rf2,1.5)*(0.45+0.55*Math.max(0,cs2));
      var b2=sw*inb; if(b2<0.22) continue;
      var ci3=Math.floor(b2*(rl-1)); if(ci3<2)ci3=2; if(ci3>=rl)ci3=rl-1;
      var kk2=Math.round(py2)*w+Math.round(px2); if(kk2>=0&&kk2<size){ buf[kk2]=ramp.charAt(ci3); dep[kk2]=9; } } }
  var out=new Array(h); for(y=0;y<h;y++) out[y]=buf.slice(y*w,y*w+w).join(""); return out.join("\n");
}});
/* --- starfield --- */
window.Ascii.register("starfield", { init: function(state, w, h) { var N = Math.max(40, Math.floor(w * h * 0.18)); var stars = []; var i; for (i = 0; i < N; i++) { stars.push({ x: (Math.random() * 2 - 1), y: (Math.random() * 2 - 1), z: Math.random() * 0.96 + 0.04 }); } state.anim = { stars: stars, N: N, last: 0 }; }, frame: function(state, w, h, t) {
  if (!state.anim) { var N = Math.max(40, Math.floor(w * h * 0.18)); var s0 = []; var k; for (k = 0; k < N; k++) { s0.push({ x: (Math.random() * 2 - 1), y: (Math.random() * 2 - 1), z: Math.random() * 0.96 + 0.04 }); } state.anim = { stars: s0, N: N, last: t }; }
  var A = state.anim; var dt = t - A.last; if (dt < 0) dt = 0; if (dt > 0.1) dt = 0.1; A.last = t;
  var ramp = " .,-:;=+*xX#@"; var rl = ramp.length;
  var size = w * h; var buf = new Array(size); var i; for (i = 0; i < size; i++) buf[i] = " ";
  var cx = (w - 1) / 2; var cy = (h - 1) / 2;
  var aspect = 0.5; var speed = 0.55;
  var stars = A.stars; var n = stars.length;
  for (i = 0; i < n; i++) {
    var s = stars[i];
    s.z -= speed * dt;
    if (s.z <= 0.02) { s.x = Math.random() * 2 - 1; s.y = Math.random() * 2 - 1; s.z = 1.0; }
    var inv = 1.0 / s.z;
    var px = cx + s.x * inv * cx;
    var py = cy + s.y * inv * cy * aspect * 2.0 * (cy / (cx + 0.0001));
    py = cy + s.y * inv * cy;
    var ix = Math.round(px); var iy = Math.round(py);
    if (ix < 0 || ix >= w || iy < 0 || iy >= h) continue;
    var b = (1.0 - s.z);
    if (b < 0) b = 0; if (b > 1) b = 1;
    var ci = Math.floor(b * b * (rl - 1));
    if (ci < 0) ci = 0; if (ci >= rl) ci = rl - 1;
    var idx = iy * w + ix;
    if (ramp.charCodeAt(ci) > buf[idx].charCodeAt(0)) buf[idx] = ramp.charAt(ci);
  }
  var out = []; var y; for (y = 0; y < h; y++) { out.push(buf.slice(y * w, y * w + w).join("")); }
  return out.join("\n");
} });
/* --- wordfall --- */
window.Ascii.register("wordfall", {
  init:function(state,w,h){
    var _wl=(window.SSAT&&window.SSAT.WORDS)||[];
    var pool=_wl.length?_wl.map(function(o){return String(o.word||"").toUpperCase();}).filter(function(s){return s.length>=3&&s.length<=10;}):["LUCID","CANDID","ARDENT","BENIGN","ZEAL","SAGE","DEFT","WRY"];
    var pile=new Array(w); for(var i=0;i<w;i++) pile[i]=[];
    state.anim={pool:pool, pile:pile, drops:[], last:0, src:"", si:0, acc:0};
  },
  frame:function(state,w,h,t){
    if(!state.anim) return "";
    var A=state.anim, pile=A.pile, drops=A.drops, d, c, k;
    var dt=t-A.last; if(dt<0)dt=0; if(dt>0.1)dt=0.1; A.last=t;
    // spawn raining letters, drawn from real words (cycled letter by letter)
    A.acc+=dt;
    while(A.acc>=0.07){ A.acc-=0.07;
      if(!A.src || A.si>=A.src.length){ A.src=A.pool[(Math.random()*A.pool.length)|0]+"  "; A.si=0; }
      var ch=A.src.charAt(A.si++); if(ch===" ") continue;
      drops.push({x:(Math.random()*w)|0, y:-1, vy:9+Math.random()*9, ch:ch});
    }
    // fall + land on top of each column's pile
    for(d=drops.length-1; d>=0; d--){ var o=drops[d]; o.y+=o.vy*dt;
      var landY=h-1-pile[o.x].length;
      if(o.y>=landY){ if(pile[o.x].length < h) pile[o.x].push(o.ch); drops.splice(d,1); }
    }
    // when the heap reaches the top, let it collapse and start over
    var mx=0; for(c=0;c<w;c++) if(pile[c].length>mx) mx=pile[c].length;
    if(mx>=h-1){ for(c=0;c<w;c++) pile[c]=[]; drops.length=0; }
    var size=w*h, buf=new Array(size), i; for(i=0;i<size;i++) buf[i]=" ";
    function setp(x,y,cc){ x=Math.round(x); y=Math.round(y); if(x>=0&&x<w&&y>=0&&y<h && cc!==" ") buf[y*w+x]=cc; }
    for(c=0;c<w;c++){ for(k=0;k<pile[c].length;k++) setp(c, h-1-k, pile[c][k]); } // the heap on the ground
    for(d=0;d<drops.length;d++) setp(drops[d].x, drops[d].y, drops[d].ch);        // the rain
    var out=new Array(h); for(var yo=0;yo<h;yo++) out[yo]=buf.slice(yo*w,yo*w+w).join(""); return out.join("\n");
  }
});
/* --- bounce --- */
window.Ascii.register("bounce", { frame:function(state,w,h,t){
  var A=state.anim;
  function reset(grace){
    A.word=A.words[Math.floor(Math.random()*A.words.length)];
    var wl=A.word.length;
    A.x=Math.floor(w*0.30+Math.random()*w*0.40); A.y=Math.floor(h*0.30+Math.random()*h*0.40);
    if(A.x>w-2-wl)A.x=w-2-wl; if(A.x<1)A.x=1; if(A.y>h-3)A.y=h-3; if(A.y<1)A.y=1;
    A.vx=(Math.random()<0.5?-1:1)*(7.3+Math.random()*3.7);     // messy ratio -> wanders, no quick corner
    A.vy=(Math.random()<0.5?-1:1)*(4.1+Math.random()*2.9);
    A.cele=0; A.grace=grace; A.cx=0; A.cy=0;
  }
  if(!A){
    var words=[];
    try{ var src=(window.SSAT&&window.SSAT.WORDS)||[]; for(var i=0;i<src.length;i++){ var ww=String(src[i].word||"").toUpperCase(); if(ww.length>=3&&ww.length<=9) words.push(ww); } }catch(e){}
    if(words.length<4) words=["VERBIFY","LEXICON","ACUMEN","ZENITH","CANDID","LUCID","NADIR","ARDENT"];
    A={ words:words, last:t }; state.anim=A; reset(6.0);                       // 6s grace at start
  }
  var dt=t-A.last; if(dt<0)dt=0; if(dt>0.05)dt=0.05; A.last=t;
  if(A.grace>0) A.grace-=dt;
  var size=w*h, buf=new Array(size), k; for(k=0;k<size;k++) buf[k]=" ";
  function setp(x,y,ch){ x=Math.round(x); y=Math.round(y); if(x>=0&&x<w&&y>=0&&y<h && ch!==" ") buf[y*w+x]=ch; }
  function dW(x0,y,s){ var sx=Math.round(x0),q; for(q=0;q<s.length;q++) setp(sx+q,y,s.charAt(q)); }
  function border(){ var x,y; for(x=0;x<w;x++){ setp(x,0,"-"); setp(x,h-1,"-"); } for(y=1;y<h-1;y++){ setp(0,y,"|"); setp(w-1,y,"|"); } setp(0,0,"+"); setp(w-1,0,"+"); setp(0,h-1,"+"); setp(w-1,h-1,"+"); }

  if(A.cele>0){
    // ---- spacious, longer corner celebration ----
    A.cele-=dt; var dur=4.5, ct=dur-A.cele, my=Math.floor(h/2);
    var cs=[[2,2],[w-3,2],[2,h-3],[w-3,h-3]], gl="*+o.'";
    for(var bi=0;bi<cs.length;bi++){ var ph=ct-bi*0.12; if(ph<0)continue; var rad=2+ph*7;
      if(rad<13){ for(var r=0;r<10;r++){ var ang=r/10*6.283, px=cs[bi][0]+Math.cos(ang)*rad, py=cs[bi][1]+Math.sin(ang)*rad*0.5;
        if(px>0&&px<w-1&&py>0&&py<h-1) setp(px,py, gl.charAt((r+bi)%gl.length)); } } }
    for(var c=0;c<22;c++){ var fx=1+(c*53+7)%(w-2), fy=1+(c*29+Math.floor(ct*10))%(h-2);
      if(fy>=my-3 && fy<=my+3) continue; setp(fx,fy,"*'.,".charAt(c%4)); }     // confetti, kept off the message band
    dW(Math.floor(w*0.20), my-3, "\\o/"); dW(Math.floor(w*0.50)-1, my-3, "\\o/"); dW(Math.floor(w*0.80)-2, my-3, "\\o/");
    var msg=A.word; dW((w-msg.length)/2, my, msg);
    setp((w-msg.length)/2-3, my, "*"); setp((w+msg.length)/2+2, my, "*");
    dW((w-8)/2, my+2, "CORNER!!");
    border();
    if(A.cele<=0) reset(4.0);                                                  // grace after celebration too
  } else {
    // ---- bounce inside the visible border ----
    var wl=A.word.length, minX=1, maxX=w-1-wl, minY=1, maxY=h-2, hitX=false, hitY=false;
    A.x+=A.vx*dt; A.y+=A.vy*dt;
    if(A.x<=minX){ A.x=minX; A.vx=Math.abs(A.vx); hitX=true; } else if(A.x>=maxX){ A.x=maxX; A.vx=-Math.abs(A.vx); hitX=true; }
    if(A.y<=minY){ A.y=minY; A.vy=Math.abs(A.vy); hitY=true; } else if(A.y>=maxY){ A.y=maxY; A.vy=-Math.abs(A.vy); hitY=true; }
    if(hitX||hitY){
      var nearV=(A.x<=minX+0.7||A.x>=maxX-0.7), nearH=(A.y<=minY+0.7||A.y>=maxY-0.7);
      var corner=(A.grace<=0)&&((hitX&&hitY)||(hitX&&nearH)||(hitY&&nearV));
      if(corner){ A.cx=(A.x<w/2)?2:w-3; A.cy=(A.y<h/2)?2:h-3; A.cele=4.5; }
      else { A.word=A.words[Math.floor(Math.random()*A.words.length)]; wl=A.word.length; maxX=w-1-wl; if(A.x>maxX)A.x=maxX; if(A.x<1)A.x=1; }  // new word each bounce
    }
    dW(A.x, A.y, A.word);
    border();
  }
  var out=new Array(h); for(var yo=0;yo<h;yo++) out[yo]=buf.slice(yo*w,yo*w+w).join(""); return out.join("\n");
}});
/* --- fireworks --- */
window.Ascii.register("fireworks", { frame:function(state,w,h,t){
  var A=state.anim;
  function spawn(s){ s.x0=3+Math.random()*(w-6); s.peakY=2+Math.random()*(h*0.42); s.t0=t;
    s.rise=0.7+Math.random()*0.5; s.burst=1.6+Math.random()*0.9; s.g=2.0+Math.random()*1.8;
    var K=16+Math.floor(Math.random()*12); s.parts=[];
    for(var kk=0; kk<K; kk++){ s.parts.push({ ang:kk/K*6.283+(Math.random()-0.5)*0.40, spd:0.40+Math.random()*1.05 }); } // varied speeds -> ragged outburst
  }
  if(!A){ A={shells:[]}; for(var i=0;i<5;i++){ var s={}; spawn(s); s.t0=t-Math.random()*2.4; A.shells.push(s); } state.anim=A; }
  var size=w*h, buf=new Array(size), q; for(q=0;q<size;q++) buf[q]=" ";
  function setp(x,y,ch){ x=Math.round(x); y=Math.round(y); if(x>=0&&x<w&&y>=0&&y<h && ch!==" ") buf[y*w+x]=ch; }
  var ramp=" .,-+*oO@", rl=ramp.length, bottom=h-1;
  for(var si=0; si<A.shells.length; si++){ var s=A.shells[si], age=t-s.t0;
    if(age > s.rise+s.burst){ spawn(s); age=0; }
    if(age < s.rise){                                                  // rocket rising
      var ry=bottom-(bottom-s.peakY)*(age/s.rise);
      setp(s.x0, ry, "!"); setp(s.x0, ry+1, "|"); setp(s.x0, ry+2, ".");
    } else {                                                           // burst: ragged rays of varying length
      var bAge=age-s.rise, frac=bAge/s.burst, bright=1-frac*frac;
      if(frac<0.10) setp(s.x0, s.peakY, "@");
      var grav=0.5*s.g*bAge*bAge, expand=18*(1-Math.exp(-bAge*2.7));   // fast pop, then ease-out
      for(var kk=0; kk<s.parts.length; kk++){ var p=s.parts[kk], ux=Math.cos(p.ang), uy=Math.sin(p.ang)*0.5, reach=p.spd*expand;
        for(var seg=0; seg<4; seg++){ var rr=reach-seg*1.4; if(rr<0.3) break;       // head + trailing dots = a ray
          var px=s.x0+ux*rr, py=s.peakY+uy*rr+grav;
          var segB=bright*(1-seg*0.26)*(0.55+0.45*p.spd);
          var ci=Math.floor(segB*(rl-1)); if(ci>=rl)ci=rl-1;
          if(ci>0 && (seg===0 || (Math.floor(t*18+kk)%4)!==0)) setp(px,py, ramp.charAt(ci));
        }
      }
    }
  }
  var out=new Array(h); for(var yo=0;yo<h;yo++) out[yo]=buf.slice(yo*w,yo*w+w).join(""); return out.join("\n");
}});
/* --- wordlink --- */
window.Ascii.register("wordlink", {
  html:true,
  frame:function(state,w,h,t){
    var A=state.anim, i, j;
    var W1=w-1, H1=h-1, asp=2.0;
    function rnd(a,b){ return a+Math.random()*(b-a); }
    function dvis(x0,y0,x1,y1){ var dx=(x0-x1)*W1, dy=(y0-y1)*H1*asp; return Math.sqrt(dx*dx+dy*dy); }
    function edgePos(){ var s=Math.floor(Math.random()*4);
      if(s===0) return {x:-0.06, y:rnd(0.15,0.85)};
      if(s===1) return {x:1.06,  y:rnd(0.15,0.85)};
      if(s===2) return {x:rnd(0.15,0.85), y:-0.06};
      return {x:rnd(0.15,0.85), y:1.06}; }
    function newEnc(P, t0){
      var act2={}; for(var u=0;u<A.pairs.length;u++){ var U=A.pairs[u]; if(U===P||!U.a)continue; act2[U.a]=1; act2[U.b]=1; }
      var nf=0,ne=0; for(var cc=0;cc<A.pairs.length;cc++){ var U3=A.pairs[cc]; if(U3===P||!U3.rel)continue; if(U3.rel==="f")nf++; else ne++; }
      var friend=(nf<ne)?true:(ne<nf?false:(Math.random()<0.5)), pool=friend?A.syn:A.ant, pr=pool[Math.floor(Math.random()*pool.length)];
      for(var tr2=0;tr2<12;tr2++){ var cpr=pool[Math.floor(Math.random()*pool.length)]; if(!act2[cpr[0]]&&!act2[cpr[1]]){ pr=cpr; break; } }
      var ints=friend?A.FRI:A.FOE, kk=ints[Math.floor(Math.random()*ints.length)];
      P.a=pr[0]; P.b=pr[1]; P.rel=friend?"f":"e"; P.act=kk.act; P.emo=kk.emo;
      P.A.len=P.a.length; P.B.len=P.b.length; P.gap=(P.act==="hug")?2:7;
      var needL=(P.gap/2+P.A.len)/W1+0.04, needR=(P.gap/2+P.B.len)/W1+0.04;
      var best=null, bestD=-1;
      for(var tr=0;tr<10;tr++){ var cand={x:rnd(needL,1-needR), y:rnd(0.22,0.80)}, md=999;
        for(var q=0;q<A.pairs.length;q++){ var O=A.pairs[q]; if(O===P||!O.meetPt)continue; var dd=dvis(cand.x,cand.y,O.meetPt.x,O.meetPt.y); if(dd<md)md=dd; }
        if(md>bestD){ bestD=md; best=cand; } }
      P.meetPt=best;
      var ea=edgePos(), eb=edgePos();
      P.A.x=ea.x; P.A.y=ea.y; P.A.vx=0; P.A.vy=0;
      P.B.x=eb.x; P.B.y=eb.y; P.B.vx=0; P.B.vy=0;
      P.state="seek"; P.seekT=t0; P.tMeet=0; P.meetDur=rnd(4.0,10.0);
    }
    if(!A || !A.pairs){
      var bank=(window.ANALOGIES)||[], syn=[], ant=[], used={};
      for(i=0;i<bank.length;i++){ var it=bank[i]; if((it.rel==="synonym"||it.rel==="antonym") && String(it.a).length<=8 && String(it.b).length<=8){ var key=it.rel+it.a+it.b; if(used[key])continue; used[key]=1; (it.rel==="synonym"?syn:ant).push([String(it.a).toUpperCase(),String(it.b).toUpperCase()]); } }
      if(!syn.length) syn=[["CALM","SERENE"],["HAPPY","GLAD"],["VAST","HUGE"]];
      if(!ant.length) ant=[["BOLD","TIMID"],["SWIFT","SLOW"],["DARK","BRIGHT"]];
      A={ pairs:[], syn:syn, ant:ant,
          FRI:[{emo:":D",act:"highfive"},{emo:":)",act:"cheer"},{emo:"^^",act:"dance"},{emo:":3",act:"hug"}],
          FOE:[{emo:">:(",act:"sword"},{emo:">:O",act:"boxing"},{emo:">:[",act:"lightning"},{emo:">_<",act:"glare"}],
          SPRITES:{"sword":{"fps":5,"frames":[["  .    ",">/---\\<","    '  "],[" * , * ",">--X--<"," * ' * "],["'  .  '","<\\- -/>",",  '  ,"],["  ,    ",">-\\/-<<","   .   "],[" .  *  ",">-/X\\-<","  * .  "]]},"boxing":{"fps":5,"frames":[["       ","o<   >o","       "],["   .   "," o> <o ","   .   "],["  \\*/  ","  >X<  ","  /*\\  "],["  ,^.  "," <o o> ","  .^,  "]]},"lightning":{"fps":5,"frames":[["  .    ",">-/\\-< ","    '  "],[" *,    ",">/X\\<o ","  ',*  "],["  '*   ",">\\X/-< "," *.'   "],[".  * ' ",">=*=*<o"," ' *  ."],["   .   ",">-\\/-< ","  ,    "]]},"glare":{"fps":5,"frames":[[" '   ^ ","o>-!-<o","   *  ,"],["  ^ ' .","o)>!<(o"," ,   * "],[". ^   '","o>-x-<o","  * ,  "],[" '  ^ .","o)>!<(o",",   *  "]]},"highfive":{"fps":5,"frames":[["       ","o     o","       "],[" .   . "," \\   / ","       "],["  ' '  ","  o o  ","  ` `  "],[" *.,.* "," >oXo< "," *'`'* "],["  ,*,  ","  >X<  ","  '*'  "]]},"cheer":{"fps":5,"frames":[["*  .  *"," \\o/ + "," . ' . "],[" *' '* ","  \\o/  ","  ' '  "],["^ *+* ^"," =\\o/= ","* . . *"],[" . + . "," /o\\   ","' * + '"],["  ' '  "," \\o/ . "," *   * "]]},"dance":{"fps":4,"frames":[["o      ","o<.~.>o","  ' '  "],["  ~ ~  ","o>'~'<o","  ^ ^  "],["      o","o<.~.>o","  . .  "],["  + +  ","o>'~'<o","  ^ ^  "]]}}, last:t };
      for(i=0;i<4;i++) A.pairs.push({A:{},B:{}});
      state.anim=A;
      for(i=0;i<A.pairs.length;i++) newEnc(A.pairs[i], t - i*3.7);
    }
    var dt=t-A.last; if(dt<0)dt=0; if(dt>0.05)dt=0.05; A.last=t;

    // ---- state machine + goal selection ----
    for(i=0;i<A.pairs.length;i++){ var P=A.pairs[i], M=P.meetPt;
      var offA=(P.gap/2+P.A.len/2)/W1, offB=(P.gap/2+P.B.len/2)/W1;
      var slAx=M.x-offA, slBx=M.x+offB, slY=M.y;
      if(P.state==="seek"){
        P.A.gx=slAx; P.A.gy=slY; P.B.gx=slBx; P.B.gy=slY;
        var arr=dvis(P.A.x,P.A.y,slAx,slY)<4 && dvis(P.B.x,P.B.y,slBx,slY)<4;
        if(arr || (t-P.seekT)>13){ P.state="meet"; P.tMeet=t; P.A.x=slAx; P.A.y=slY; P.B.x=slBx; P.B.y=slY; P.A.vx=0; P.A.vy=0; P.B.vx=0; P.B.vy=0; }
      } else if(P.state==="meet"){
        P.A.gx=slAx; P.A.gy=slY; P.B.gx=slBx; P.B.gy=slY;
        if(t-P.tMeet>P.meetDur){ P.state="leave"; P.leaveT=t;
          if(P.rel==="f"){ var d=Math.random()<0.5?-0.25:1.25; P.A.gx=d; P.B.gx=d; }
          else { P.A.gx=-0.25; P.B.gx=1.25; }
          P.A.gy=P.A.y; P.B.gy=P.B.y; }
      } else {
        var aOff=(P.A.x<-0.12||P.A.x>1.12||P.A.y<-0.12||P.A.y>1.12);
        var bOff=(P.B.x<-0.12||P.B.x>1.12||P.B.y<-0.12||P.B.y>1.12);
        if((aOff&&bOff) || (t-P.leaveT)>10){ newEnc(P,t); }
      }
    }
    // ---- steering: arrive-at-goal + separation + meeting-spot avoidance (frame-rate independent) ----
    var ags=[];
    for(i=0;i<A.pairs.length;i++){ ags.push({p:A.pairs[i], o:A.pairs[i].A}); ags.push({p:A.pairs[i], o:A.pairs[i].B}); }
    var MAXS=0.42, kk=7*dt; if(kk>1)kk=1;
    for(i=0;i<ags.length;i++){ var ag=ags[i], o=ag.o, PP=ag.p;
      var dxg=o.gx-o.x, dyg=o.gy-o.y, dg=Math.sqrt(dxg*dxg+dyg*dyg)+1e-5;
      var spd=Math.min(MAXS, dg*1.8), desx=dxg/dg*spd, desy=dyg/dg*spd;      // arrive: slow down near the goal
      for(j=0;j<ags.length;j++){ if(j===i)continue; var o2=ags[j].o; if(ags[j].p===PP)continue;
        if(!(PP.state==="meet" && ags[j].p.state==="meet")) continue;   // walkers freely walk over other words & their interactions
        var dxC=(o.x-o2.x)*W1, dyR=(o.y-o2.y)*H1, halfW=(o.len+o2.len)/2+2, halfH=2.6;
        if(Math.abs(dxC)<halfW && Math.abs(dyR)<halfH){                       // keep clear of other words
          var pen=Math.max((halfW-Math.abs(dxC))/halfW,(halfH-Math.abs(dyR))/halfH);
          var ndx=o.x-o2.x, ndy=o.y-o2.y, nl=Math.sqrt(ndx*ndx+ndy*ndy)+1e-4;
          desx+=ndx/nl*0.5*pen; desy+=ndy/nl*0.5*pen;
          if(nl<1e-3){ desx+=(i<j?0.3:-0.3); } } }
      if(PP.state!=="leave"){ if(o.x<0.04)desx+=0.3; if(o.x>0.96)desx-=0.3; if(o.y<0.08)desy+=0.3; if(o.y>0.92)desy-=0.3; }
      o.vx+=(desx-o.vx)*kk; o.vy+=(desy-o.vy)*kk;
      var sp=Math.sqrt(o.vx*o.vx+o.vy*o.vy); if(sp>MAXS){ o.vx=o.vx/sp*MAXS; o.vy=o.vy/sp*MAXS; }
      o.x+=o.vx*dt; o.y+=o.vy*dt;
    }
    // ---- render ----
    var size=w*h, buf=new Array(size), colb=new Array(size), k;
    for(k=0;k<size;k++){ buf[k]=" "; colb[k]=0; }
    function setp(x,y,ch,col){ x=Math.round(x); y=Math.round(y); if(x<0||x>=w||y<0||y>=h||ch===" ")return; var pp=y*w+x; buf[pp]=ch; colb[pp]=col||0; }
    function dW(c,y,s,col){ var sx=Math.round(c-s.length/2),q; for(q=0;q<s.length;q++) setp(sx+q,y,s.charAt(q),col); }
    for(i=0;i<A.pairs.length;i++){ var P=A.pairs[i];
      var apx=P.A.x*W1, apy=P.A.y*H1, bpx=P.B.x*W1, bpy=P.B.y*H1;
      var col=(P.state==="meet")?(P.rel==="f"?1:2):0;
      if(P.state==="meet"){ var ly=Math.round((apy+bpy)/2), mx=Math.round((apx+bpx)/2);
        dW(apx, Math.round(apy)-2, P.emo, col); dW(bpx, Math.round(bpy)-2, P.emo, col);   // each word's feeling
        var sp=A.SPRITES[P.act];
        if(sp){ var fr=sp.frames[Math.floor(t*sp.fps)%sp.frames.length], ry, cc2;            // detailed animated interaction
          for(ry=0;ry<3;ry++){ var rowS=fr[ry]; for(cc2=0;cc2<rowS.length;cc2++){ var chh=rowS.charAt(cc2); if(chh!==" ") setp(mx-3+cc2, ly-1+ry, chh, col); } } }
        else { dW(mx,ly-1,"<3",col); }                                                      // hug: floating heart
      }
      dW(apx, Math.round(apy), P.a, col); dW(bpx, Math.round(bpy), P.b, col);
    }
    var COLR={1:"#1f9d57",2:"#d8453a"};
    function escc(ch){ return ch==="<"?"&lt;":ch===">"?"&gt;":ch==="&"?"&amp;":ch; }
    var rows=new Array(h);
    for(var yy=0;yy<h;yy++){ var line="",run="",cur=0,xx;
      for(xx=0;xx<w;xx++){ var p2=yy*w+xx, cc=colb[p2]||0;
        if(cc!==cur){ if(run!==""){ line+= cur?("<span style=\"color:"+COLR[cur]+"\">"+run+"</span>"):run; run=""; } cur=cc; }
        run+=escc(buf[p2]); }
      if(run!==""){ line+= cur?("<span style=\"color:"+COLR[cur]+"\">"+run+"</span>"):run; }
      rows[yy]=line;
    }
    return rows.join("\n");
  }
});
/* --- horizon --- */
window.Ascii.register("horizon", { frame:function(state,w,h,t){
  if(!state.anim) state.anim={};
  var ramp=" .,-~:;=!*#$@", rl=ramp.length;
  var cx=(w-1)/2, horizonY=Math.round(h*0.62), sunR=Math.max(6,Math.round(w*0.21));
  var sunX=cx + Math.round(Math.sin(t*0.12)*w*0.16);
  var sunY=horizonY-1 + Math.sin(t*0.3)*0.5;
  var size=w*h, buf=new Array(size), i; for(i=0;i<size;i++) buf[i]=" ";
  function setp(x,y,ch){ x=Math.round(x); y=Math.round(y); if(x>=0&&x<w&&y>=0&&y<h) buf[y*w+x]=ch; }
  var x,y;
  // stars in the upper sky
  for(y=0;y<horizonY-1;y++) for(x=0;x<w;x++){ var hs=Math.abs(Math.sin(x*12.9+y*78.2)*43758.5); hs-=Math.floor(hs); if(hs>0.975) setp(x,y, hs>0.99?"*":"."); }
  // soft glow gradient just above the horizon
  for(y=Math.max(0,horizonY-4); y<horizonY; y++){ var gf=(y-(horizonY-4))/4; for(x=0;x<w;x++){ if((x*7+y*3)%5===0) setp(x,y, ramp.charAt(2+Math.floor(gf*3))); } }
  // the sun: a soft glowing disc sitting on the horizon
  for(y=0;y<=horizonY;y++) for(x=0;x<w;x++){ var dx=x-sunX, dy=(y-sunY)*2, r=Math.sqrt(dx*dx+dy*dy); if(r<sunR){ var b=1-r/sunR; setp(x,y, b>0.6?"@":(b>0.32?"#":"*")); } }
  // the water line
  for(x=0;x<w;x++) setp(x,horizonY,"=");
  // water with gentle rolling ripples (closer rows = longer dashes)
  for(y=horizonY+1;y<h;y++){ var rowf=(y-horizonY)/(h-horizonY); for(x=0;x<w;x++){ var ph=Math.sin(x*0.45 - y*0.35 + t*2.0); setp(x,y, ph>0.55?"~":(ph>-0.2?"-":(rowf>0.6?".":" "))); } }
  // shimmering reflection of the sun on the water
  for(y=horizonY+1;y<h;y++){ var wav=Math.round(Math.sin(t*3+y*0.9)*1.6); for(var rx=sunX-Math.round(sunR*0.55); rx<=sunX+Math.round(sunR*0.55); rx++){ if((rx+y+Math.floor(t*4))%2===0) setp(rx+wav, y, "*"); } }
  var out=new Array(h); for(y=0;y<h;y++) out[y]=buf.slice(y*w,y*w+w).join(""); return out.join("\n");
}});
})();
