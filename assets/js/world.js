/* ============================================================
   沙井村 · 舆图 — 世界引擎
   纯原生 JS，无框架、无依赖。

   这一层只管「人在图上走」这件事：相机、瓦片、实体、移动、碰撞、
   接近提示。玩法（案卷、过月、村志）一律不管，那些留在 app.js，
   由 World.hooks 回调接进来。

   规矩（两条，破了会出人命）：
   1. 整个文件包在 IIFE 里，只往外挂 window.World。
      app.js 顶层占了 cv / ctx / parts / S / ICON … 二十多个名字，
      这里再声明同名顶层变量就是 SyntaxError，整个脚本不执行。
   2. 顶层不许引用 app.js 的 S（S 在本文件之后才加载）。
      要用就在函数里现取。
   ============================================================ */
(function () {
  'use strict';

  /* sites.js 里是顶层 const：它挂在全局**词法**环境上，不在 window 上，
     所以 window.SITES 是 undefined。要用 typeof 判，不能直接读。 */
  /* 单文件版没内联主图与立绘，退回总览与剪影 */
  var SINGLE = document.documentElement.hasAttribute('data-single');
  var SITE = (typeof SITES !== 'undefined' && SITES) ? SITES : {
    world: { w: 6144, h: 4080 },
    houses: [], places: [], props: [], colliders: [],
    river: { pts: [], width: 180, bridges: [] },
    chars: []
  };
  var WORLD = SITE.world || { w: 6144, h: 4080 };
  var TW = WORLD.w / 3, TH = WORLD.h / 3;

  var INTERACT_R = 90;        // 接近多近算「走到跟前了」（世界像素）
  var PLAYER_R = 16;          // 主角碰撞盒半径
  var SCREEN_SPEED = 220;     // 屏幕速度恒定（CSS 像素/秒）
  var Z_MAX = 1.0;            // 瓦片永不被放大超过 1:1
  var FOCUS_R = 26;           // 点实体时的命中半径

  /* ---------- 相机 ---------- */
  var cam = {
    x: WORLD.w / 2, y: WORLD.h / 2, z: 0.62,
    tx: WORLD.w / 2, ty: WORLD.h / 2, tz: 0.62
  };
  var zsteps = [0.3, 0.44, 0.62, 0.8, 1.0];
  var zidx = 2;

  var vw = 0, vh = 0;
  var el = {};                // DOM 引用
  var entities = [];
  var byId = new Map();
  var player = null;
  var keys = Object.create(null);
  var moveTarget = null;      // 点地走的目标点
  var focus = null;           // 当前可交互目标
  var blockedMsg = '';
  var raf = 0, lastT = 0, tickHook = null;
  var tiles = [];
  var started = false;

  var hooks = {
    describe: null,    // (entity) => 提示文字，没有就返回 null
    interact: null     // (entity) => 打开对应面板
  };

  /* ---------- 小工具 ---------- */
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function $(id) { return document.getElementById(id); }

  function normName(s) { return String(s || '').replace(/\s+/g, ''); }

  /* ============================================================
     实体
     ============================================================ */
  function placeEntity(e) {
    if (!e.el) return;
    e.el.style.transform =
      'translate3d(' + e.x + 'px,' + e.y + 'px,0) translate(-50%,-100%)';
  }

  function addEntity(e) {
    if (byId.has(e.id)) return byId.get(e.id);
    entities.push(e);
    byId.set(e.id, e);
    if (e.el) {
      e.el.style.zIndex = String(Math.round(e.y));
      placeEntity(e);
      el.figLayer.appendChild(e.el);
    }
    if (e.tag) el.tagLayer.appendChild(e.tag);
    return e;
  }

  function removeEntity(e) {
    var i = entities.indexOf(e);
    if (i >= 0) entities.splice(i, 1);
    byId.delete(e.id);
    if (e.el && e.el.parentNode) e.el.parentNode.removeChild(e.el);
    if (e.tag && e.tag.parentNode) e.tag.parentNode.removeChild(e.tag);
  }

  function entityAt(sx, sy) {
    var best = null, bestD = FOCUS_R * FOCUS_R;
    for (var i = 0; i < entities.length; i++) {
      var e = entities[i];
      if (!e.el) continue;
      var p = worldToScreen(e.x, e.y);
      var dx = p.x - sx, dy = p.y - sy;
      var d = dx * dx + dy * dy;
      if (d < bestD) { bestD = d; best = e; }
    }
    return best;
  }

  /* ============================================================
     坐标
     ============================================================ */
  function worldToScreen(wx, wy) {
    return { x: (wx - cam.x) * cam.z + vw / 2, y: (wy - cam.y) * cam.z + vh / 2 };
  }

  function screenToWorld(sx, sy) {
    return { x: (sx - vw / 2) / cam.z + cam.x, y: (sy - vh / 2) / cam.z + cam.y };
  }

  function clampCam() {
    var hw = vw / (2 * cam.z), hh = vh / (2 * cam.z);
    cam.x = hw >= WORLD.w / 2 ? WORLD.w / 2 : clamp(cam.x, hw, WORLD.w - hw);
    cam.y = hh >= WORLD.h / 2 ? WORLD.h / 2 : clamp(cam.y, hh, WORLD.h - hh);
  }

  function lookAt(wx, wy, snap) {
    cam.tx = clamp(wx, 0, WORLD.w);
    cam.ty = clamp(wy, 0, WORLD.h);
    if (snap) { cam.x = cam.tx; cam.y = cam.ty; }
  }

  function setZoom(i, ax, ay) {
    i = clamp(i, 0, zsteps.length - 1);
    var nz = zsteps[i];
    if (ax === undefined) { ax = vw / 2; ay = vh / 2; }
    var w = screenToWorld(ax, ay);
    zidx = i;
    cam.tz = nz;
    cam.tx = w.x - (ax - vw / 2) / nz;
    cam.ty = w.y - (ay - vh / 2) / nz;
  }

  /* ============================================================
     舆图：先上总览，主图到位再换
     ------------------------------------------------------------
     九块精修图接起来才是一张图。单块看各有接缝，逐块往页面上摆，
     屏幕上就会浮出一层格线。所以这里只摆**一张**：先用小总览顶着，
     主图加载完再整张换上去——换的是整张，不会有格。
     ============================================================ */
  function loadMap() {
    var plate = el.plate;
    var tip = $('worldTip');
    var done = function () { if (tip) tip.classList.add('off'); };
    if (!plate) { done(); return; }
    var img = new Image();
    img.onload = function () {
      plate.src = img.src;
      plate.classList.add('sharp');
      done();
    };
    img.onerror = function () {
      /* 单文件版里没有主图，总览顶着照样能玩 */
      done();
    };
    img.src = 'assets/map/world.jpg';
  }

  /* ============================================================
     碰撞
     ============================================================ */
  function blocked(x, y) {
    var i, c;
    var cols = SITE.colliders || [];
    for (i = 0; i < cols.length; i++) {
      c = cols[i];
      if (x + PLAYER_R > c.x && x - PLAYER_R < c.x + c.w &&
          y + PLAYER_R > c.y && y - PLAYER_R < c.y + c.h) return true;
    }
    var rv = SITE.river;
    if (rv && rv.pts && rv.pts.length > 1) {
      var bw = (rv.width || 180) / 2;
      var bridged = false;
      var bs = rv.bridges || [];
      for (i = 0; i < bs.length; i++) {
        var b = bs[i];
        /* 桥口要罩住整条河身的宽度：人是从岸边走上桥的，
           只给桥心开一小段，人就永远停在岸边过不去。 */
        if (x >= b.x0 && x <= b.x1 && Math.abs(y - b.y) < bw + 90) { bridged = true; break; }
      }
      if (!bridged && distToPolyline(x, y, rv.pts) < bw) return true;
    }
    return false;
  }

  function distToPolyline(x, y, pts) {
    var best = 1e9;
    for (var i = 0; i < pts.length - 1; i++) {
      var ax = pts[i][0], ay = pts[i][1], bx = pts[i + 1][0], by = pts[i + 1][1];
      var dx = bx - ax, dy = by - ay;
      var len2 = dx * dx + dy * dy;
      var t = len2 ? ((x - ax) * dx + (y - ay) * dy) / len2 : 0;
      t = clamp(t, 0, 1);
      var px = ax + t * dx, py = ay + t * dy;
      var d = (x - px) * (x - px) + (y - py) * (y - py);
      if (d < best) best = d;
    }
    return Math.sqrt(best);
  }

  /* 沿墙滑动：先试 x，再试 y */
  function moveWithCollision(x, y, dx, dy) {
    var nx = x + dx;
    if (!blocked(nx, y)) x = nx; else dx = 0;
    var ny = y + dy;
    if (!blocked(x, ny)) y = ny; else dy = 0;
    return { x: x, y: y, moved: Math.abs(dx) + Math.abs(dy) };
  }

  /* 出生点若卡在墙里，沿最小穿透轴推出来 */
  function unstick(x, y) {
    if (!blocked(x, y)) return { x: x, y: y };
    var cols = SITE.colliders || [];
    var best = null, bestD = 1e18;
    for (var i = 0; i < cols.length; i++) {
      var c = cols[i];
      var cx = (c.x + c.w / 2), cy = (c.y + c.h / 2);
      var d = (x - cx) * (x - cx) + (y - cy) * (y - cy);
      if (d < bestD) { bestD = d; best = c; }
    }
    if (!best) return { x: x, y: y };
    var outs = [
      { x: best.x - PLAYER_R - 2, y: y },
      { x: best.x + best.w + PLAYER_R + 2, y: y },
      { x: x, y: best.y - PLAYER_R - 2 },
      { x: x, y: best.y + best.h + PLAYER_R + 2 }
    ];
    for (var k = 0; k < outs.length; k++) {
      if (!blocked(outs[k].x, outs[k].y)) return outs[k];
    }
    return { x: x, y: y };
  }

  /* ============================================================
     移动
     ============================================================ */
  function updatePlayer(dt) {
    if (!player) return;
    var vx = 0, vy = 0;
    if (keys['w'] || keys['arrowup']) vy -= 1;
    if (keys['s'] || keys['arrowdown']) vy += 1;
    if (keys['a'] || keys['arrowleft']) vx -= 1;
    if (keys['d'] || keys['arrowright']) vx += 1;
    if (vx || vy) {
      moveTarget = null;
    } else if (moveTarget) {
      var tx = moveTarget.x - player.x, ty = moveTarget.y - player.y;
      var d = Math.sqrt(tx * tx + ty * ty);
      if (d < 8) {
        moveTarget = null;
      } else {
        vx = tx / d; vy = ty / d;
        // 走近目的地就别撞得跟墙似的
        if (d < 40) { vx *= d / 40; vy *= d / 40; }
      }
    }
    var mag = Math.sqrt(vx * vx + vy * vy);
    if (mag > 1) { vx /= mag; vy /= mag; }

    var target = SCREEN_SPEED / cam.z;
    var ax = vx * target, ay = vy * target;
    var k = Math.min(1, dt * 12);
    player.vx += (ax - player.vx) * k;
    player.vy += (ay - player.vy) * k;
    if (!vx && !vy && !moveTarget) {
      player.vx *= Math.max(0, 1 - dt * 10);
      player.vy *= Math.max(0, 1 - dt * 10);
    }
    var before = { x: player.x, y: player.y };
    var res = moveWithCollision(player.x, player.y, player.vx * dt, player.vy * dt);
    player.x = clamp(res.x, PLAYER_R, WORLD.w - PLAYER_R);
    player.y = clamp(res.y, PLAYER_R, WORLD.h - PLAYER_R);

    if (moveTarget) {
      var moved = Math.abs(player.x - before.x) + Math.abs(player.y - before.y);
      if (moved < 0.35 && player.stuckFor === undefined) player.stuckFor = 0;
      player.stuckFor = (player.stuckFor || 0) + dt;
      if (player.stuckFor > 0.6) {
        player.stuckFor = 0;
        moveTarget = null;
        if (hooks.blocked) hooks.blocked();
      }
    } else {
      player.stuckFor = 0;
    }

    var sp = Math.sqrt(player.vx * player.vx + player.vy * player.vy);
    player.walking = sp > 6;
    if (player.walking) {
      if (Math.abs(player.vx) > Math.abs(player.vy)) player.face = player.vx < 0 ? 'left' : 'right';
      else player.face = player.vy < 0 ? 'up' : 'down';
    }
  }

  /* ============================================================
     帧
     ============================================================ */
  function frame(now) {
    raf = requestAnimationFrame(frameWithPending);
    if (!lastT) lastT = now;
    var dt = Math.min(0.05, (now - lastT) / 1000);
    lastT = now;
    if (document.hidden) return;

    updatePlayer(dt);

    // 相机阻尼（帧率无关）
    var kz = 1 - Math.exp(-dt * 9);
    var ks = 1 - Math.exp(-dt * 11);
    cam.x += (cam.tx - cam.x) * kz;
    cam.y += (cam.ty - cam.y) * kz;
    cam.z += (cam.tz - cam.z) * ks;
    clampCam();

    // 跟随
    if (player) {
      cam.tx = player.x;
      cam.ty = player.y - 40;
    }

    // 写变换
    var ox = cam.x * cam.z - vw / 2;
    var oy = cam.y * cam.z - vh / 2;
    el.world.style.transform = 'translate3d(' + (-ox) + 'px,' + (-oy) + 'px,0) scale(' + cam.z + ')';
    el.world.style.setProperty('--iz', String(1 / cam.z));

    if (player && player.el) {
      player.el.style.transform =
        'translate3d(' + player.x + 'px,' + player.y + 'px,0) translate(-50%,-100%)';
      player.el.classList.toggle('walking', !!player.walking);
      player.el.classList.toggle('face-left', player.face === 'left');
      player.el.style.zIndex = String(Math.round(player.y));
    }

    // 走动的人：承办人从家门口走到地点去
    for (i = 0; i < entities.length; i++) {
      e = entities[i];
      var w = e.walkingTo;
      if (!w) continue;
      w.t += dt * 1000;
      var k = Math.min(1, w.t / w.dur);
      e.x = w.fx + (w.x - w.fx) * k;
      e.y = w.fy + (w.y - w.fy) * k;
      placeEntity(e);
      if (e.el) e.el.style.zIndex = String(Math.round(e.y));
      if (k >= 1) {
        e.walkingTo = null;
        if (e.el) e.el.classList.remove('walking');
        if (e.bubbleEl) {
          var be = e.bubbleEl;
          be.classList.remove('show');
          setTimeout(function () { if (be.parentNode) be.remove(); }, 600);
          e.bubbleEl = null;
        }
      }
    }

    // 名牌与提示在屏幕空间，缩小时字才不糊
    var i, e, p;
    for (i = 0; i < entities.length; i++) {
      e = entities[i];
      if (!e.tag) continue;
      p = worldToScreen(e.x, e.y);
      e.tag.style.transform = 'translate3d(' + p.x + 'px,' + (p.y - (e.tagUp || 58)) + 'px,0) translate(-50%,0)';
    }

    // 接近提示
    var near = nearestInteractable();
    if (near !== focus) {
      if (focus && focus.el) focus.el.classList.remove('near');
      focus = near;
      if (focus && focus.el) focus.el.classList.add('near');
    }
    if (focus) {
      p = worldToScreen(focus.x, focus.y);
      var label = hooks.describe ? hooks.describe(focus) : '';
      el.prompt.innerHTML = label || '';
      el.prompt.style.transform = 'translate3d(' + p.x + 'px,' + (p.y - 96) + 'px,0) translate(-50%,-100%)';
      el.prompt.classList.toggle('on', !!label);
    } else {
      el.prompt.classList.remove('on');
    }

    // 缩小了就藏人：看全局时不必看人头
    el.figLayer.classList.toggle('sparse', cam.z < 0.55);

    if (tickHook) tickHook(dt);
  }

  function nearestInteractable() {
    if (!player) return null;
    /* 先按种类各取最近的，再按种类定先后：
       地点是 landmark，人是到处都是 —— 站在庙门口时，
       不该被路过的邻居抢了交互。 */
    var best = {}, bd = {};
    for (var i = 0; i < entities.length; i++) {
      var e = entities[i];
      if (!e.el || e.kind === 'player') continue;
      var dx = e.x - player.x, dy = e.y - player.y;
      var d = dx * dx + dy * dy;
      if (d > INTERACT_R * INTERACT_R) continue;
      if (bd[e.kind] === undefined || d < bd[e.kind]) { bd[e.kind] = d; best[e.kind] = e; }
    }
    var kinds = ['place', 'prop', 'villager'];
    for (var k = 0; k < kinds.length; k++) {
      if (best[kinds[k]]) return best[kinds[k]];
    }
    return null;
  }

  /* ============================================================
     交互
     ============================================================ */
  function requestInteract(e) {
    if (!e) return;
    if (hooks.interact) hooks.interact(e);
  }

  function interactNearest() {
    if (focus) requestInteract(focus);
  }

  function walkEntity(e, x, y, opts) {
    opts = opts || {};
    e.walkingTo = { x: x, y: y, fx: e.x, fy: e.y, t: 0, dur: opts.ms || 2000 };
    if (e.el) e.el.classList.add('walking');
    if (opts.bubble && e.el) {
      var b = document.createElement('div');
      b.className = 'wbub';
      b.innerHTML = opts.bubble;
      e.el.appendChild(b);
      e.bubbleEl = b;
      setTimeout(function () { if (b) b.classList.add('show'); }, Math.round((opts.ms || 2000) * 0.55));
    }
  }

  /* ============================================================
     主角
     ============================================================ */
  function setPlayer(no, x, y, portrait) {
    if (player) {
      player.el.remove();
      removeEntity(player);
    }
    var d = document.createElement('div');
    d.className = 'ent ent--player';
    d.setAttribute('role', 'img');
    d.setAttribute('aria-label', '主角');
    if (portrait) {
      var img = document.createElement('img');
      img.className = 'ent-portrait';
      img.src = portrait;
      img.alt = '';
      img.addEventListener('error', function () { this.remove(); });
      d.appendChild(img);
    }
    var p = unstick(x, y);
    player = {
      kind: 'player', id: 'player', no: no,
      x: p.x, y: p.y, vx: 0, vy: 0, face: 'down', walking: false,
      el: d, tag: null
    };
    addEntity(player);
    lookAt(player.x, player.y, true);
    return player;
  }

  /* ============================================================
     启动
     ============================================================ */
  function resize() {
    vw = el.mapwrap.clientWidth;
    vh = el.mapwrap.clientHeight;
    // 首档随视口自适应，保证世界永远盖满视口（cover，不留边）
    var fit = Math.max(vw / WORLD.w, vh / WORLD.h);
    zsteps[0] = Math.max(0.18, fit);
    if (zidx === 0) { cam.z = zsteps[0]; cam.tz = zsteps[0]; }
    clampCam();
  }

  function init(opts) {
    opts = opts || {};
    el.mapwrap = $('mapwrap');
    el.world = $('world');
    el.plate = $('plate');
    el.figLayer = $('figLayer');
    el.tagLayer = $('tagLayer');
    el.prompt = $('prompt');
    if (!el.mapwrap || !el.world) return false;

    /* 世界容器按数据定尺寸：换了图，尺寸也跟着换 */
    el.world.style.width = WORLD.w + 'px';
    el.world.style.height = WORLD.h + 'px';

    if (!SINGLE) loadMap();
    resize();
    window.addEventListener('resize', resize);

    // 键盘
    window.addEventListener('keydown', function (e) {
      var tag = (e.target && e.target.tagName) || '';
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      var k = e.key.toLowerCase();
      if (k === 'arrowup' || k === 'arrowdown' || k === 'arrowleft' || k === 'arrowright') {
        e.preventDefault();
      }
      if (k === 'e') {
        var m = $('modal');
        if (m && m.classList.contains('on')) return;   // 弹层里不抢键
        e.preventDefault();
        interactNearest();
        return;
      }
      if (k === 'm' && !opts.allowM) { /* 寻人由 app.js 自己接 */ }
      keys[k] = true;
    });
    window.addEventListener('keyup', function (e) { keys[e.key.toLowerCase()] = false; });
    window.addEventListener('blur', function () { keys = Object.create(null); });

    // 点地走 / 点实体
    el.mapwrap.addEventListener('click', function (ev) {
      if (ev.target.closest && ev.target.closest('.ui')) return;
      var r = el.mapwrap.getBoundingClientRect();
      var sx = ev.clientX - r.left, sy = ev.clientY - r.top;
      var hit = entityAt(sx, sy);
      if (hit) {
        if (hit.kind === 'villager' || hit.kind === 'place' || hit.kind === 'prop') {
          // 走到跟前再打开，不打断正在做的事
          if (player) {
            var d = Math.sqrt((hit.x - player.x) * (hit.x - player.x) +
                              (hit.y - player.y) * (hit.y - player.y));
            if (d > 70) {
              moveTarget = { x: hit.x, y: hit.y + 24 };
              pendingInteract = hit;
            } else {
              requestInteract(hit);
            }
          } else {
            requestInteract(hit);
          }
          return;
        }
      }
      var w = screenToWorld(sx, sy);
      moveTarget = { x: w.x, y: w.y };
      pendingInteract = null;
    });

    // 滚轮缩放
    el.mapwrap.addEventListener('wheel', function (ev) {
      ev.preventDefault();
      var r = el.mapwrap.getBoundingClientRect();
      var ax = ev.clientX - r.left, ay = ev.clientY - r.top;
      setZoom(zidx + (ev.deltaY > 0 ? -1 : 1), ax, ay);
    }, { passive: false });

    // 双指捏合
    var pinch = null;
    el.mapwrap.addEventListener('touchstart', function (ev) {
      if (ev.touches.length === 2) {
        var d = Math.abs(ev.touches[0].clientX - ev.touches[1].clientX);
        pinch = { d: d, z: zidx };
      }
    }, { passive: true });
    el.mapwrap.addEventListener('touchmove', function (ev) {
      if (ev.touches.length === 2 && pinch) {
        ev.preventDefault();
        var d = Math.abs(ev.touches[0].clientX - ev.touches[1].clientX);
        var step = Math.round((d - pinch.d) / 60);
        setZoom(pinch.z + step, vw / 2, vh / 2);
      }
    }, { passive: false });
    el.mapwrap.addEventListener('touchend', function () { pinch = null; }, { passive: true });

    if (!started) { started = true; lastT = 0; raf = requestAnimationFrame(frame); }
    return true;
  }

  var pendingInteract = null;

  /* 走到目标跟前就自动打开 */
  function frameWithPending(now) {
    if (pendingInteract && player && moveTarget) {
      var d = Math.sqrt((pendingInteract.x - player.x) * (pendingInteract.x - player.x) +
                        (pendingInteract.y - player.y) * (pendingInteract.y - player.y));
      if (d < 74) {
        var e = pendingInteract;
        pendingInteract = null;
        moveTarget = null;
        requestInteract(e);
      }
    }
    frame(now);
  }

  /* ============================================================
     对外
     ============================================================ */
  window.World = {
    hooks: hooks,
    cam: cam,
    zsteps: zsteps,
    entities: entities,
    byId: byId,
    init: init,
    resize: resize,
    addEntity: addEntity,
    removeEntity: removeEntity,
    setPlayer: setPlayer,
    get player() { return player; },
    worldToScreen: worldToScreen,
    screenToWorld: screenToWorld,
    lookAt: lookAt,
    setZoom: setZoom,
    zoomBy: function (d) { setZoom(zidx + d, vw / 2, vh / 2); },
    zoomIdx: function () { return zidx; },
    requestInteract: requestInteract,
    interactNearest: interactNearest,
    walkEntity: walkEntity,
    entityAt: entityAt,
    nearestInteractable: nearestInteractable,
    blocked: blocked,
    normName: normName,
    get focus() { return focus; },
    set onTick(fn) { tickHook = fn; },
    WORLD: WORLD,
    TW: TW, TH: TH,
    INTERACT_R: INTERACT_R
  };
})();
