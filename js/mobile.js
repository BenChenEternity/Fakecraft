'use strict';
// ---------------------------------------------------------------------------
// Phones (game/UX_IDEAS.md「手机端适配」), on top of the touch layer (touch.js):
//   - landscape: rotate the game with CSS on portrait phones, and transform touch coordinates with it
//   - Bedrock's controls: a floating joystick (where the thumb lands is its centre; pushed all the way forward
//     sprints), a sneak button by it, drag the rest of the screen to look; Bedrock's "split" controls - a crosshair
//     with attack / use buttons (the only ones since 10-30; a tap on the world does nothing); jump (double tap in
//     creative flies, up / down while flying, swim up in water), hotbar tap / hold to
//     drop, the inventory button; pause, chat, quick chat and the view at the top
//   - vibration when a block breaks or the player is hurt; the buttons' layout edited by dragging
//   - 60 / 90 / 120 fps on high refresh phones, back to 60 when the phone heats up and cannot keep up
// ---------------------------------------------------------------------------
const Stage = {
  rot: false, el: null, inset: { top: 0, right: 0, bottom: 0, left: 0 },
  init() {
    if (this.el) return;
    const el = this.el = document.createElement('div'); el.id = 'stage';
    el.style.cssText = 'position:fixed;left:0;top:0;width:100%;height:100%;overflow:hidden';
    document.body.insertBefore(el, document.body.firstChild);
    for (const id of ['gl', 'ui', 'textinput']) { const c = document.getElementById(id); if (c) el.appendChild(c); }
    addEventListener('resize', () => this.update());
    addEventListener('orientationchange', () => setTimeout(() => this.update(), 200));
    this.update();
  },
  want() {
    const g = typeof game !== 'undefined' && game;
    return !!g && TouchDevice.kind === 'phone' && g.settings.rotatePortrait !== false && innerHeight > innerWidth * 1.05;
  },
  update() {
    if (!this.el) return;
    const rot = this.want(), s = this.el.style, I = this.inset;
    if (rot) {
      s.left = '0px'; s.top = '0px'; s.width = innerHeight + 'px'; s.height = innerWidth + 'px';
      s.transformOrigin = '0 0'; s.transform = `translateX(${innerWidth}px) rotate(90deg)`;
    } else {
      // (the whole screen: the safe area - a notch - only keeps the controls and the HUD clear,
      // UI.safe; leaving it all black put a long black bar along the top)
      s.transform = ''; s.left = '0px'; s.top = '0px'; s.width = '100%'; s.height = '100%';
    }
    const was = this.rot; this.rot = rot;
    if (was !== rot || true) { const g = typeof game !== 'undefined' && game; if (g && g.renderer) g.resize(); }
  },
  w() { return this.el ? this.el.clientWidth : innerWidth; },
  h() { return this.el ? this.el.clientHeight : innerHeight; },
  // a point on the page -> the stage's own (unturned) pixels
  toStage(cx, cy) { return this.rot ? [cy, innerWidth - cx] : [cx, cy]; },
};
// the safe area in interface pixels (none while the page is turned by CSS: the turned stage is all safe)
UI.prototype.safe = function () {
  const I = Stage.inset, k = this.dpr / this.scale;
  if (Stage.rot || !I) return { t: 0, l: 0, r: 0, b: 0 };
  return { t: Math.ceil(I.top * k), l: Math.ceil(I.left * k), r: Math.ceil(I.right * k), b: Math.ceil(I.bottom * k) };
};
(() => {
  // the HUD up off the bottom edge, the chat in from the left one
  const hud = UI.prototype.drawHUD, chat = UI.prototype.drawChat;
  UI.prototype.drawHUD = function () { const s = this.safe(); if (!s.b) return hud.call(this); const c = this.ctx; c.save(); c.translate(0, -s.b); try { return hud.call(this); } finally { c.restore(); } };
  UI.prototype.drawChat = function () { const s = this.safe(); if (!s.l) return chat.call(this); const c = this.ctx; c.save(); c.translate(s.l, 0); try { return chat.call(this); } finally { c.restore(); } };
})();
// the renderer and the interface size themselves from the stage
Renderer.prototype.resize = function () {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  let w = Math.floor(Stage.w() * dpr * this.resScale), h = Math.floor(Stage.h() * dpr * this.resScale);
  if (this.forceSize) [w, h] = this.forceSize; // panorama capture
  w = Math.max(1, w); h = Math.max(1, h);
  if (this.canvas.width !== w || this.canvas.height !== h) { this.canvas.width = w; this.canvas.height = h; }
};
UI.prototype.resize = function () {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  this.canvas.width = Math.floor(Stage.w() * dpr); this.canvas.height = Math.floor(Stage.h() * dpr);
  const auto = Math.max(1, Math.min(Math.floor(this.canvas.width / 320), Math.floor(this.canvas.height / 240)));
  const pref = this.game.settings.guiScale;
  this.scale = pref ? Math.min(pref * dpr, auto) : Math.min(auto, Math.round(3 * dpr));
  this.scale = Math.max(1, Math.floor(this.scale));
  this.w = Math.ceil(this.canvas.width / this.scale); this.h = Math.ceil(this.canvas.height / this.scale);
  this.dpr = dpr;
  if (this.screen && this.screen.layout) this.screen.layout();
};
// page points -> the stage's: mouse events here; touches once, as they come in (the touch layer and the clicks it
// makes up then work in stage pixels, marked so they are not turned again)
UI.prototype.toGui = function (ev) { const [x, y] = ev.stage ? [ev.clientX, ev.clientY] : Stage.toStage(ev.clientX, ev.clientY); return [x * this.dpr / this.scale, y * this.dpr / this.scale]; };
(() => {
  const P = TouchControls.prototype;
  P.gui = function (cx, cy) { const k = this.ui.dpr / this.ui.scale; return [cx * k, cy * k]; };
  const turn = (e) => ({ target: e.target, preventDefault: () => e.preventDefault(), changedTouches: [...e.changedTouches].map((t) => { const [x, y] = Stage.toStage(t.clientX, t.clientY); return { identifier: t.identifier, clientX: x, clientY: y }; }) });
  for (const k of ['onStart', 'onMove']) { const f = P[k]; P[k] = function (e) { return f.call(this, turn(e)); }; }
  const oe = P.onEnd; P.onEnd = function (e, cancel) { return oe.call(this, turn(e), cancel); };
  const sy = P.synth;
  P.synth = function (type, s, button, atStart) {
    const ev = { clientX: atStart ? s.sx : s.cx, clientY: atStart ? s.sy : s.cy, button, shiftKey: false, stage: true };
    if (type === 'down') this.ui.mouseDown(ev); else if (type === 'up') this.ui.mouseUp(ev); else this.ui.mouseMove(ev);
  };
  void sy;
})();
// ---- the controls ----
Object.assign(TOUCH_ICONS, {
  attack: ['.......##', '......###', '.....###.', '#...###..', '##.###...', '.####....', '..##.....', '.##.#....', '##...#...'],
  use: ['..#.#.#..', '..#.#.#..', '..#.#.#.#', '..#######', '.########', '.########', '..#######', '...#####.', '....###..'],
  emote: ['..#####..', '.#.....#.', '#..#.#..#', '#.......#', '#.#...#.#', '#..###..#', '.#.....#.', '..#####..', '.........'],
});
(() => {
  const P = TouchControls.prototype;
  const stickOn = (g) => g.settings.touchStick !== false;
  const lay = P.layout;
  P.layout = function () {
    const L = lay.call(this), g = this.g, { W, H } = this.metrics(), { B, gp } = L, m = Math.max(3, Math.round(B * 0.3)), st = g.settings;
    L.W = W; L.H = H;
    if (stickOn(g)) {
      // the joystick replaces the D-pad: the left part of the screen, above the hotbar
      L.cells = {}; L.dpad = null; L.x0 = L.y0 = -1e4; // (no D-pad cells left to hit)
      L.stickR = Math.round(B * 1.25);
      L.stickHome = { x: m + L.stickR, y: H - m - L.stickR };
      L.stickZone = { x: 0, y: Math.round(H * 0.28), w: Math.round(W * 0.42), h: H - Math.round(H * 0.28) };
      if (!g.player.flying) L.sneak = { x: Math.min(m + 2 * L.stickR + gp * 2, Math.floor(W / 2 - 91 - B - 4)), y: H - m - B, w: B, h: B };
    }
    const top = L.pause.y, ts = L.pause.w;
    L.emote = { x: L.view.x - ts - gp, y: top, w: ts, h: ts };
    if (g.mode !== 'spectator') {
      L.attack = { x: L.jump.x - B - gp, y: L.jump.y - B - gp, w: B, h: B };
      L.use = { x: L.jump.x, y: L.jump.y - B - gp, w: B, h: B };
      if (L.interact) L.interact.y = L.use.y - L.interact.h - gp;
    }
    // kept clear of the safe area (a notch, the home bar)
    const sf = this.ui.safe();
    for (const id of ['pause', 'chat', 'view', 'emote']) if (L[id]) { L[id].x -= sf.r; L[id].y += sf.t; }
    for (const id of ['jump', 'descend', 'sprint', 'attack', 'use', 'interact']) if (L[id]) { L[id].x -= sf.r; L[id].y -= sf.b; }
    if (L.stickHome) { L.stickHome.x += sf.l; L.stickHome.y -= sf.b; L.stickZone.x += sf.l; }
    if (L.sneak) { L.sneak.x += sf.l; L.sneak.y -= sf.b; }
    if (L.hotbar) { L.hotbar.y -= sf.b; L.inv.y -= sf.b; }
    // the player's own arrangement (the layout editor): offsets per control
    const off = st.touchLayout || {};
    for (const id in off) { const r = L[id], o = off[id]; if (r && o && r.x !== undefined) { r.x = clamp(r.x + o[0], 0, W - r.w); r.y = clamp(r.y + o[1], 0, H - r.h); } }
    if (off.stick && L.stickHome) { L.stickHome = { x: clamp(L.stickHome.x + off.stick[0], L.stickR, W - L.stickR), y: clamp(L.stickHome.y + off.stick[1], L.stickR, H - L.stickR) }; }
    // each control's own size (the layout editor: 50%-400%, the user 2026-11-01), grown about its centre
    const sc = st.touchScale || {};
    for (const id in sc) {
      const k = clamp(+sc[id] || 1, 0.5, 4); if (k === 1) continue;
      if (id === 'stick') { if (L.stickHome) { L.stickR = Math.round(L.stickR * k); L.stickHome = { x: clamp(L.stickHome.x, L.stickR, W - L.stickR), y: clamp(L.stickHome.y, L.stickR, H - L.stickR) }; } continue; }
      const r = L[id]; if (!r || r.x === undefined) continue;
      const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
      r.w = Math.min(W, Math.round(r.w * k)); r.h = Math.min(H, Math.round(r.h * k));
      r.x = clamp(Math.round(cx - r.w / 2), 0, W - r.w); r.y = clamp(Math.round(cy - r.h / 2), 0, H - r.h);
    }
    // a joystick moved or resized: where a thumb starts it goes with it (it stayed the bottom left - the stick drawn
    // somewhere else answered nothing, the player could not walk: players' feedback 2026-11-01)
    if (L.stickHome && ((off.stick && (off.stick[0] || off.stick[1])) || (sc.stick && sc.stick !== 1))) {
      const R2 = L.stickR * 2, x0 = Math.max(0, L.stickHome.x - R2), y0 = Math.max(0, L.stickHome.y - R2);
      L.stickZone = { x: x0, y: y0, w: Math.min(W, L.stickHome.x + R2) - x0, h: Math.min(H, L.stickHome.y + R2) - y0 };
    }
    return L;
  };
  // a screen's close button: kept clear of the safe area; inside Bilibili top left, as the container's capsule
  // (… and ✕) floats over the top right corner whatever the safe area says
  const cr = P.closeRect;
  P.closeRect = function () {
    const r = cr.call(this); if (!r) return r;
    const sf = this.ui.safe();
    if (Stage.inToy) {
      r.x = 4 + sf.l; r.y = 4 + sf.t;
      if (typeof Minimap !== 'undefined' && Minimap.on(this.g)) { const m = Minimap.rect(this.ui); r.x = m.x + m.w + 4; } // (beside the minimap)
    } else { r.x -= sf.r; r.y += sf.t; }
    return r;
  };
  const sp = P.startPlay;
  P.startPlay = function (s) {
    const g = this.g, th = g.touchHeld, L = this.layout(), x = s.x, y = s.y;
    if (this.hitL(L.emote, x, y)) { s.kind = 'button'; s.btn = 'emote'; return; }
    if (L.attack && this.hitL(L.attack, x, y)) { s.kind = 'abtn'; s.holdBtn = 0; g.mouseBtn[0] = true; g.mouseClicked0 = true; g.attackCd = Math.min(g.attackCd, 0); if (!g.target && !g.targetEntity) g.player.swing(); s.holding = true; return; }
    if (L.use && this.hitL(L.use, x, y)) { s.kind = 'abtn'; s.holdBtn = 2; g.mouseBtn[2] = true; g.useCd = 0; s.holding = true; return; }
    if (stickOn(g)) {
      if (L.sneak && this.hitL(L.sneak, x, y)) { s.kind = 'none'; th.sneak = !th.sneak; return; }
      for (const id of ['pause', 'chat', 'view', 'inv', 'interact']) if (this.hitL(L[id], x, y)) return sp.call(this, s);
      if (L.hotbar && this.hitL(L.hotbar, x, y, 0)) return sp.call(this, s);
      if (this.hitL(L.jump, x, y) || (L.descend && this.hitL(L.descend, x, y)) || (L.sprint && this.hitL(L.sprint, x, y))) return sp.call(this, s);
      const z = L.stickZone;
      if (x >= z.x && x < z.x + z.w && y >= z.y && y < z.y + z.h && ![...this.t.values()].some((o) => o !== s && o.kind === 'stick')) {
        // the stick's centre where the thumb lands (kept whole on the screen)
        s.kind = 'stick'; s.bx = clamp(x, L.stickR, L.W - L.stickR); s.by = clamp(y, L.stickR, L.H - L.stickR);
        this.stick(s); return;
      }
    }
    sp.call(this, s);
  };
  P.stick = function (s) {
    const g = this.g, th = g.touchHeld, L = this.L, R = L.stickR;
    let dx = (s.x - s.bx) / R, dy = (s.y - s.by) / R; const l = Math.hypot(dx, dy);
    if (l > 1) { dx /= l; dy /= l; }
    // (thumbs drift: past the rim the centre follows, so the stick never goes dead)
    if (l > 1.4) { s.bx = s.x - dx * R; s.by = s.y - dy * R; }
    const m = Math.min(1, l), dead = 0.18, k = m < dead ? 0 : (m - dead) / (1 - dead);
    th.joy = k ? { x: dx / Math.max(1e-6, Math.min(1, l)) * k, y: dy / Math.max(1e-6, Math.min(1, l)) * k } : null;
    const fwd = th.joy && -th.joy.y > 0.35;
    if (fwd && !th.forward) { th.forward = true; pressAction(g, 'forward'); }
    if (!fwd && th.forward) { th.forward = false; releaseAction(g, 'forward'); }
    // pushed all the way forward: sprint
    th.joySprint = !!(th.joy && m > 0.96 && -dy > 0.8);
  };
  const mp = P.movePlay;
  P.movePlay = function (s, dx, dy) {
    if (s.kind === 'stick') { this.stick(s); return; }
    // a finger on the attack / use button that moves turns the view as it goes (Bedrock), still mining / using
    if (s.kind === 'abtn') { s.kind = 'look'; try { mp.call(this, s, dx, dy); } finally { s.kind = 'abtn'; } return; }
    mp.call(this, s, dx, dy);
  };
  const ep = P.endPlay;
  P.endPlay = function (s, cancel) {
    const g = this.g, th = g.touchHeld;
    if (s.kind === 'stick') { th.joy = null; th.joySprint = false; if (th.forward) { th.forward = false; releaseAction(g, 'forward'); } return; }
    if (s.kind === 'abtn') { g.mouseBtn[s.holdBtn] = false; return; }
    if (s.kind === 'button' && s.btn === 'emote') { if (!cancel && this.hitL(this.L.emote, s.x, s.y)) g.ui.open(new QuickChatScreen(g)); return; }
    // a tap on the world does nothing: the attack / use buttons act, at the crosshair
    if (s.kind === 'look') { if (s.holding) g.mouseBtn[s.holdBtn] = false; return; }
    ep.call(this, s, cancel);
  };
  // holding the screen does not mine either (the attack button does)
  const up = P.update;
  P.update = function (now) {
    for (const s of this.t.values()) if (s.kind === 'look') s.holding = s.holding || 'none';
    up.call(this, now);
    for (const s of this.t.values()) if (s.holding === 'none') s.holding = false;
  };
  // drawing: the joystick, sneak, the attack / use buttons, quick chat
  const dr = P.draw;
  P.draw = function (ui) {
    dr.call(this, ui);
    const g = this.g;
    if (!this.on() || g.state !== 'play' || ui.screen || !this.L) return;
    const c = ui.ctx, L = this.L, th = g.touchHeld;
    c.save(); c.globalAlpha = g.settings.touchOpacity ?? 0.7;
    if (L.stickHome) {
      const s = [...this.t.values()].find((q) => q.kind === 'stick'), bx = s ? s.bx : L.stickHome.x, by = s ? s.by : L.stickHome.y, R = L.stickR;
      c.strokeStyle = 'rgba(255,255,255,0.55)'; c.lineWidth = 2; c.beginPath(); c.arc(bx, by, R, 0, Math.PI * 2); c.stroke();
      c.fillStyle = 'rgba(20,20,20,0.3)'; c.fill();
      const kx = s ? bx + clamp(s.x - bx, -R, R) : bx, ky = s ? by + clamp(s.y - by, -R, R) : by, kl = Math.hypot(kx - bx, ky - by), kk = kl > R ? R / kl : 1;
      c.fillStyle = th.joySprint ? 'rgba(255,230,120,0.75)' : 'rgba(255,255,255,0.55)'; c.beginPath(); c.arc(bx + (kx - bx) * kk, by + (ky - by) * kk, R * 0.42, 0, Math.PI * 2); c.fill();
      if (L.sneak) this.btn(c, L.sneak, th.sneak ? 'sneakOn' : 'sneak', !!th.sneak);
    }
    this.btn(c, L.emote, 'emote', false);
    if (L.attack) { this.btn(c, L.attack, 'attack', g.mouseBtn[0]); this.btn(c, L.use, 'use', g.mouseBtn[2]); }
    c.restore();
  };
  // the joystick moves analogue (half pushed = slower), like Bedrock's
  const ri = Game.prototype.readInput;
  Game.prototype.readInput = function () {
    const r = ri.call(this), th = this.touchHeld;
    if (th && th.joy) { r.fwd = clamp(-th.joy.y, -1, 1); r.strafe = clamp(th.joy.x, -1, 1); }
    if (th && th.joySprint) r.sprint = true;
    return r;
  };
})();

// ---- vibration: a block broken, being hurt ----
const buzz = (g, ms) => { if (touchOn(g) && g.settings.vibrate !== false && navigator.vibrate) try { navigator.vibrate(ms); } catch (e) { } };
(() => {
  const bb = Game.prototype.breakBlock;
  Game.prototype.breakBlock = function (x, y, z, natural, silent) { const r = bb.call(this, x, y, z, natural, silent); if (!natural && !silent) buzz(this, 15); return r; };
  const h = Player.prototype.hurt;
  Player.prototype.hurt = function (a, src) { const r = h.call(this, a, src); if (r) buzz(this.game, 40); return r; };
})();

// ---- quick chat: a phrase or an emoticon in one tap (typing on a phone is slow) ----
const QUICK_PHRASES = ['过来！', '救命！', '这里有钻石', '跟我来', '等等我', '谢谢！', '好的', '天黑了，回家', '小心苦力怕！', '我去挖矿', '我饿了', '晚安'];
const QUICK_EMOTES = ['(^_^)', '(T_T)', '(o_O)', '(>_<)', '(*^▽^*)', '(╯°□°)╯', '♥', '233'];
class QuickChatScreen extends MenuScreen {
  constructor(game) { super(game, '快捷聊天'); this.pauses = false; this.bgDim = 0.3; this.blurBg = false; this.titleY = 10; }
  layout() {
    const u = this.game.ui, cx = u.w / 2, cols = 3, w = Math.min(110, Math.floor((u.w - 24) / cols) - 4);
    this.widgets = [];
    QUICK_PHRASES.forEach((t, i) => this.widgets.push({ x: cx - (cols * (w + 4)) / 2 + (i % cols) * (w + 4), y: 24 + Math.floor(i / cols) * 24, w, h: 20, label: t, onClick: () => this.send(t) }));
    const ew = 46, n = QUICK_EMOTES.length, y = 24 + Math.ceil(QUICK_PHRASES.length / cols) * 24 + 6;
    QUICK_EMOTES.forEach((t, i) => this.widgets.push({ x: cx - (Math.min(n, 6) * (ew + 4)) / 2 + (i % 6) * (ew + 4), y: y + Math.floor(i / 6) * 24, w: ew, h: 20, label: t, onClick: () => this.send(t) }));
    this.widgets.push({ x: cx - 60, y: u.h - 28, w: 120, h: 20, label: '关闭', onClick: () => this.game.ui.close() });
  }
  send(t) {
    const g = this.game;
    if (g.net) g.net.chat(t); else g.ui.message('<' + (g.settings.netName || '我') + '> ' + t);
    g.ui.close();
  }
  onEsc() { this.game.ui.close(); }
}

// ---- 编辑按钮布局: drag the controls where the thumbs want them ----
// a control touched is chosen: its size goes 50%-400% with - / +; 重置布局 puts every place and size back, 保存布局
// keeps them (done: what comes next - the first-start setup goes on from here), 不保存返回 puts back what was before
class TouchLayoutScreen extends MenuScreen {
  constructor(game, parent, done) {
    super(game, null); this.parent = parent; this.done = done || null; this.blurBg = false; this.bgDim = 0.35; this.pauses = false; this.drag = null; this.touchDrag = true; this.sel = null;
    const s = game.settings; this.was = { layout: JSON.stringify(s.touchLayout || {}), scale: JSON.stringify(s.touchScale || {}) };
  }
  scaleOf(id) { return (this.game.settings.touchScale || {})[id] || 1; }
  setScale(id, k) { const s = this.game.settings; s.touchScale = Object.assign({}, s.touchScale || {}, { [id]: Math.round(clamp(k, 0.5, 4) * 100) / 100 }); }
  save() { this.game.saveSettings(); if (this.done) { const d = this.done; this.done = null; d(); } else this.game.ui.open(this.parent); }
  discard() { const s = this.game.settings; s.touchLayout = JSON.parse(this.was.layout); s.touchScale = JSON.parse(this.was.scale); this.game.saveSettings(); this.game.ui.open(this.parent); }
  ids() { return ['stick', 'sneak', 'jump', 'sprint', 'attack', 'use', 'pause', 'chat', 'emote', 'view']; }
  rects() {
    const tc = this.game.ui.touch, L = tc.layout(), out = {};
    for (const id of this.ids()) {
      if (id === 'stick') { if (L.stickHome) out.stick = { x: L.stickHome.x - L.stickR, y: L.stickHome.y - L.stickR, w: 2 * L.stickR, h: 2 * L.stickR }; }
      else if (L[id]) out[id] = L[id];
    }
    return out;
  }
  layout() {
    const u = this.game.ui, cx = u.w / 2, g = this.game;
    this.widgets = [
      { x: cx - 154, y: 6, w: 100, h: 18, label: '重置布局', tip: ['所有按钮回到默认的位置和大小'], onClick: () => { g.settings.touchLayout = {}; g.settings.touchScale = {}; this.layout(); } },
      { x: cx - 50, y: 6, w: 100, h: 18, label: '保存布局', gold: true, onClick: () => this.save() },
    ];
    if (!this.done) this.widgets.push({ x: cx + 54, y: 6, w: 100, h: 18, label: '不保存返回', onClick: () => this.discard() });
    // the chosen control's size
    if (this.sel) {
      const id = this.sel, y = 44;
      this.widgets.push(
        { x: cx - 92, y, w: 30, h: 18, label: '－', enabled: this.scaleOf(id) > 0.5, onClick: () => { this.setScale(id, this.scaleOf(id) - 0.1); this.layout(); } },
        { x: cx - 60, y, w: 120, h: 18, label: () => '大小：' + Math.round(this.scaleOf(this.sel) * 100) + '%', enabled: false },
        { x: cx + 62, y, w: 30, h: 18, label: '＋', enabled: this.scaleOf(id) < 4, onClick: () => { this.setScale(id, this.scaleOf(id) + 0.1); this.layout(); } },
      );
    }
  }
  mouseDown(ui, mx, my, b) {
    for (const w of this.widgets) if (ui.hit(w, mx, my)) return super.mouseDown(ui, mx, my, b);
    const R = this.rects();
    for (const id in R) { const r = R[id]; if (mx >= r.x && mx < r.x + r.w && my >= r.y && my < r.y + r.h) { const o = (this.game.settings.touchLayout || {})[id] || [0, 0]; this.drag = { id, mx, my, o: [...o] }; if (this.sel !== id) { this.sel = id; this.layout(); } return; } }
  }
  mouseMove(ui, mx, my) {
    if (!this.drag || !ui.mouse.down) return;
    const s = this.game.settings, d = this.drag;
    s.touchLayout = Object.assign({}, s.touchLayout || {}, { [d.id]: [Math.round(d.o[0] + mx - d.mx), Math.round(d.o[1] + my - d.my)] });
  }
  mouseUp() { if (this.drag) this.drag = null; }
  drawExtra(ui) {
    const c = ui.ctx, R = this.rects(), names = { stick: '摇杆', sneak: '潜行', jump: '跳跃', sprint: '疾跑', attack: '攻击', use: '使用', pause: '暂停', chat: '聊天', emote: '快捷聊天', view: '视角' };
    Font.center(c, this.sel ? '拖动按钮换位置；用 － ＋ 调这个按钮的大小' : '拖动按钮到顺手的位置；点一个按钮可以调它的大小', ui.w / 2, 30, '#FFFFFF');
    for (const id in R) {
      const r = R[id];
      c.fillStyle = this.drag && this.drag.id === id ? 'rgba(255,210,74,0.5)' : this.sel === id ? 'rgba(255,210,74,0.3)' : 'rgba(255,255,255,0.25)'; c.fillRect(r.x, r.y, r.w, r.h);
      c.strokeStyle = '#FFD24A'; c.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
      Font.center(c, names[id], r.x + r.w / 2, r.y + r.h / 2 - 4, '#FFFFFF');
    }
  }
  onEsc() { if (this.done) this.save(); else this.discard(); }
}

// ---- the touch options: joystick, vibration, layout, frame rate, turning the screen ----
(() => {
  const opts = OptionsListScreen.prototype.options;
  OptionsListScreen.prototype.options = function () {
    const list = opts.call(this);
    if (this.page !== 'touch') return list;
    const s = this.game.settings, g = this.game;
    const bt = (label, fn, extra) => ({ label, onClick: () => { fn(); g.applySettings(); g.saveSettings(); }, ...extra });
    const hz = g.pacer && g.pacer.refresh ? Math.round(1000 / g.pacer.refresh) : 60;
    const rates = [60, 90, 120].filter((r) => r <= hz + 5);
    return [
      bt(() => '移动：' + (s.touchStick === false ? '方向键' : '摇杆'), () => { s.touchStick = s.touchStick === false; }),
      ...list,
      bt(() => '震动：' + (s.vibrate === false ? '关' : '开'), () => { s.vibrate = s.vibrate === false; }),
      bt('编辑按钮布局…', () => g.ui.open(new TouchLayoutScreen(g, this))),
      Object.assign(bt(() => '帧率上限：' + (s.maxFps ? s.maxFps + ' 帧' : '跟随屏幕（' + hz + ' 帧）'), () => { const cur = rates.indexOf(s.maxFps); s.maxFps = cur < 0 ? rates[0] : cur === rates.length - 1 ? 0 : rates[cur + 1]; }),
        { tip: ['越高越流畅，但更耗电、手机更热', '手机热到跟不上时会自动降回 60 帧'] }),
      bt(() => '竖着拿手机时旋转画面：' + (s.rotatePortrait === false ? '关' : '开'), () => { s.rotatePortrait = s.rotatePortrait === false; Stage.update(); }),
    ];
  };
})();

// ---- a phone that cannot keep its high frame rate (heat): back to 60, once ----
(() => {
  let low = 0, last = performance.now();
  setInterval(() => {
    const g = typeof game !== 'undefined' && game;
    if (!g || g.state !== 'play' || !touchOn(g) || !(g.settings.maxFps > 60 || (!g.settings.maxFps && g.pacer && g.pacer.refresh < 14))) { low = 0; return; }
    const target = g.settings.maxFps || Math.round(1000 / g.pacer.refresh), now = performance.now();
    if (g.fps && g.fps < target * 0.7) low += now - last; else low = Math.max(0, low - (now - last) / 2);
    last = now;
    if (low > 30000) { g.settings.maxFps = 60; g.saveSettings(); g.ui.message('手机有点热，帧率上限降到 60 帧（触控设置里可以改回来）', '#FFAA00'); low = 0; }
  }, 2000);
})();

addEventListener('load', () => Stage.init());
