'use strict';
// Local, bounded performance diagnostics. No uploads or remote feedback.
const Telemetry = {
  g: null, t0: performance.now(),
  hist: new Uint16Array(201), frames: 0, sum: { cpu: 0, chunk: 0, render: 0, gpu: 0, gpuN: 0 }, minuteAt: 0, playMs: 0,
  points: [], stalls: [], errors: new Map(), counts: {}, events: [], rtt: [], 
  pings: new Map(), pingSeq: 0, lastPing: 0, prevState: null, loadStart: 0,
  count(k, n = 1) { if (Object.keys(this.counts).length < 300 || this.counts[k] !== undefined) this.counts[k] = (this.counts[k] || 0) + n; },
  event(type, data) { if (this.events.length < 200) this.events.push({ t: Math.round((performance.now() - this.t0) / 1000), type, ...data }); },
  error(where, msg, stack) {
    // (just the message and the first file:line - no page address, nothing typed by the player)
    const at = String(stack || '').split('\n').map(s => s.trim()).find(s => /\.js:\d+/.test(s)) || '';
    const loc = (at.match(/([\w.-]+\.js):(\d+)/) || []).slice(1, 3).join(':');
    const k = (where ? where + ': ' : '') + String(msg || '').replace(/https?:\/\/\S+/g, '<url>').slice(0, 200) + (loc ? ' @' + loc : '');
    const e = this.errors.get(k);
    if (e) e.n++; else if (this.errors.size < 50) this.errors.set(k, { n: 1, first: Math.round((performance.now() - this.t0) / 1000) });
  },
  // every frame (perf.js PerfMon.frame): a few additions while playing
  frame(dt, cpu, chunk, render) {
    const g = this.g; if (!g) return;
    if (g.state !== this.prevState) this.stateChanged(this.prevState, g.state);
    if (document.hidden) { this.away = true; return; }
    // the first frame back from a hidden tab carries the whole time away (a 36 s "stall" in the first real data);
    // a frame of more than 10 s is a suspended page, not a stall either
    if (this.away || dt > 10000) { this.away = false; return; }
    if (g.state !== 'play' || (g.ui.screen && g.ui.screen.pauses)) return;
    this.hist[Math.min(200, dt | 0)]++; this.frames++; this.playMs += dt;
    this.sum.cpu += cpu; this.sum.chunk += chunk; this.sum.render += render;
    if (PerfMon.gpuOn && PerfMon.lastGpu != null) { this.sum.gpu += PerfMon.lastGpu; this.sum.gpuN++; }
    if (dt > 100 && this.stalls.length < 100) this.stalls.push({ t: Math.round((performance.now() - this.t0) / 1000), ms: Math.round(dt), cpu: Math.round(cpu), chunk: Math.round(chunk), ents: g.entities ? g.entities.length : 0, dim: g.dim, net: !!g.net, screen: g.ui.screen ? g.ui.screen.constructor.name : '' });
    if (this.playMs - this.minuteAt >= 60000) { this.minuteAt = this.playMs; this.point(); }
  },
  stateChanged(from, to) {
    const now = performance.now();
    this.prevState = to;
    if (to === 'title' && !this.titleAt) { this.titleAt = now; this.event('title', { ms: Math.round(now) }); }
    if (to === 'loading' || to === 'switching') this.loadStart = now;
    if (to === 'play' && this.loadStart) { this.event('enter', { ms: Math.round(now - this.loadStart), net: !!this.g.net, dim: this.g.dim }); this.loadStart = 0; }
  },
  // one minute of play: the frame time distribution and what the game was doing
  point() {
    const g = this.g, h = this.hist, n = this.frames;
    if (!n) return;
    const pct = (q) => { let k = Math.ceil(n * q), i = 0; for (; i < 201; i++) { k -= h[i]; if (k <= 0) break; } return i; };
    const mem = performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null;
    const s = g.settings;
    this.points.push({
      m: Math.round(this.playMs / 60000), fps: Math.round(n / (this.playMs - (this.lastPointMs || 0)) * 1000 * 10) / 10,
      p50: pct(0.5), p95: pct(0.95), p99: pct(0.99), cpu: +(this.sum.cpu / n).toFixed(2), chunk: +(this.sum.chunk / n).toFixed(2), render: +(this.sum.render / n).toFixed(2),
      gpu: this.sum.gpuN ? +(this.sum.gpu / this.sum.gpuN).toFixed(2) : null, mem,
      ents: g.entities ? g.entities.length : 0, chunks: g.world && g.world.chunks ? g.world.chunks.size : 0, rd: s.renderDist,
      dyn: typeof DynRes !== 'undefined' ? DynRes.scale : 1, res: s.resScale, preset: s.preset || '', shaders: s.shaders || 0, maxFps: s.maxFps || 0, vsync: s.vsync !== false,
      mode: g.net ? 'room' : 'single', dim: g.dim, gm: g.mode,
    });
    this.lastPointMs = this.playMs;
    h.fill(0); this.frames = 0; this.sum = { cpu: 0, chunk: 0, render: 0, gpu: 0, gpuN: 0 };
    if (this.points.length > 60) this.points.shift();
  },
  // Periodic pings only while explicitly connected to a server.
  tick() {
    const g = this.g, now = performance.now();
    if (g && g.net && now - this.lastPing > 10000 && g.net.ws && g.net.ws.readyState === 1) {
      this.lastPing = now; const i = ++this.pingSeq; this.pings.set(i, now); g.net.send({ t: 'ping', i });
      if (this.pings.size > 20) this.pings.delete(this.pings.keys().next().value);
    }
  },
  init(g) {
    this.g = g; this.prevState = g.state;
    setInterval(() => { try { this.tick(); } catch (e) { } }, 1000);
    addEventListener('error', (e) => this.error('page', e.message, e.error && e.error.stack || (e.filename ? `${e.filename}:${e.lineno}` : '')));
    addEventListener('unhandledrejection', (e) => this.error('promise', e.reason && e.reason.message || String(e.reason), e.reason && e.reason.stack));
    try { g.renderer.canvas.addEventListener('webglcontextlost', () => this.event('contextlost', {})); } catch (e) { }
    // (the title screen was already up when this started: the time it took from opening the page)
    if (g.state === 'title' && !this.titleAt) { this.titleAt = performance.now(); this.event('title', { ms: Math.round(this.titleAt) }); }
  },
};

// ---- the hooks ----
(() => {
  const _init = Game.prototype.init;
  Game.prototype.init = async function (...a) { const r = await _init.apply(this, a); try { Telemetry.init(this); } catch (e) { } return r; };
  const _frame = PerfMon.frame;
  PerfMon.frame = function (dt, cpu, chunk, g) { const r = _frame.call(this, dt, cpu, chunk, g); try { Telemetry.frame(dt, cpu, chunk, this.renderMs || 0); } catch (e) { } return r; };
  const _err = Game.prototype.reportError;
  Game.prototype.reportError = function (where, e, quiet) { Telemetry.error(where, e && e.message || e, e && e.stack); return _err.call(this, where, e, quiet); };
  const _open = UI.prototype.open;
  UI.prototype.open = function (screen) { if (screen && screen.constructor) Telemetry.count('screen:' + screen.constructor.name); return _open.call(this, screen); };
  const _death = Game.prototype.onPlayerDeath;
  Game.prototype.onPlayerDeath = function (src) { Telemetry.count('death:' + (src && src.type || 'other')); return _death.call(this, src); };
  const _load = Game.prototype.loadWorld;
  Game.prototype.loadWorld = function (...a) { Telemetry.count('world:load'); return _load.apply(this, a); };
  const _create = Game.prototype.createWorld;
  Game.prototype.createWorld = function (...a) { Telemetry.count('world:create:' + (a[2] || '')); return _create.apply(this, a); };
  if (typeof cmdExec === 'function') {
    const _cmd = cmdExec;
    // (a command block's commands aren't counted: a repeating one would run 20 a second)
    cmdExec = function (g, text, src) { if (!src) Telemetry.count('cmd:' + String(text).slice(1).split(/\s+/)[0].replace(/^minecraft:/, '').slice(0, 20)); return _cmd(g, text, src); };
  }
  if (typeof NetClient !== 'undefined') {
    const _om = NetClient.prototype.onMessage;
    NetClient.prototype.onMessage = function (m) {
      if (m && m.t === 'pong') { const t = Telemetry.pings.get(m.i); if (t) { Telemetry.pings.delete(m.i); if (Telemetry.rtt.length < 500) Telemetry.rtt.push(Math.round(performance.now() - t)); } return; }
      if (m && m.t === 'notice' && !this.roomWaitAt) this.roomWaitAt = performance.now();
      if (m && m.t === 'room') { Telemetry.event('room', { wait: this.roomWaitAt ? Math.round(performance.now() - this.roomWaitAt) : 0 }); Telemetry.count('net:room'); }
      return _om.call(this, m);
    };
    const _fail = NetClient.prototype.fail;
    NetClient.prototype.fail = function (reason) { Telemetry.count('net:fail'); Telemetry.event('netfail', { why: String(reason || '').slice(0, 80) }); return _fail.call(this, reason); };
  }
})();

