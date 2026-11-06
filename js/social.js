'use strict';
// Room invitations for an explicitly configured server.
class InviteCardScreen extends MenuScreen {
  constructor(game, parent) {
    super(game, '邀请朋友'); this.parent = parent; this.pauses = false; this.titleY = 8; this.note = '';
  }
  get R() { return this.game.net && this.game.net.room; }
  layout() {
    const u = this.game.ui, cx = u.w / 2, R = this.R;
    this.widgets = [];
    if (R) this.widgets.push(
      { x: cx - 100, y: u.h - 52, w: 98, h: 20, label: '复制链接', onClick: async () => { this.note = (await copyText(RoomService.link(R.code))) ? '链接已复制' : '复制失败'; } },
      { x: cx + 2, y: u.h - 52, w: 98, h: 20, label: '复制邀请码', onClick: async () => { this.note = (await copyText(R.code)) ? '邀请码已复制' : '复制失败'; } }
    );
    this.widgets.push({ x: cx - 100, y: u.h - 28, w: 200, h: 20, label: '完成', onClick: () => this.game.ui.open(this.parent) });
  }
  drawExtra(ui) {
    const R = this.R, c = ui.ctx, cx = ui.w / 2;
    if (!R) { Font.center(c, '不在房间里', cx, 60, '#A0A0A0'); return; }
    drawCard(c, cx - 115, 28, 230, ui.h - 100, true);
    Font.center(c, fitText(R.name, 214), cx, 38, '#FFFFFF');
    Font.center(c, '房主 ' + R.owner, cx, 54, '#A0A0A0');
    c.save(); c.translate(cx, ui.h / 2); c.scale(2, 2); Font.center(c, R.code, 0, 0, '#FFD24A'); c.restore();
    if (this.note) Font.center(c, this.note, cx, ui.h - 64, '#80FF80');
  }
  onEsc() { this.game.ui.open(this.parent); }
}
(() => {
  // the room screen's invite buttons: a gold one opening the card
  const lay = RoomScreen.prototype.layout;
  RoomScreen.prototype.layout = function () {
    lay.call(this);
    const R = this.R; if (!R) return;
    const i = this.widgets.findIndex((w) => w.label === '复制邀请码'), j = this.widgets.findIndex((w) => w.label === '复制链接');
    if (i >= 0 && j >= 0) {
      const a = this.widgets[i], b = this.widgets[j];
      this.widgets.splice(Math.max(i, j), 1); this.widgets.splice(Math.min(i, j), 1);
      this.widgets.push({ x: a.x, y: a.y, w: b.x + b.w - a.x, h: a.h, gold: true, label: '邀请朋友…', onClick: () => this.game.ui.open(new InviteCardScreen(this.game, this)) });
    }
  };
})();

// ---- announcements from the administrators (rooms/server.js announce): in the chat in gold and over the hotbar, for
// everyone playing - in a room they come at once, otherwise the page asks once a minute; each shown once (the last
// one seen kept in this browser), and on a page just opened only those of the last 10 minutes ----
function showAnnounce(g, a) {
  let seen = 0; try { seen = +localStorage.getItem('mcjs-announce') || 0; } catch (e) { }
  if (!a || a.id <= seen) return;
  try { localStorage.setItem('mcjs-announce', String(a.id)); } catch (e) { }
  g.ui.message('[公告] ' + a.text, '#FFAA00');
  g.ui.actionBar = { text: '公告：' + a.text, t: performance.now(), color: '#FFAA00' };
  Sound.ev && Sound.ev('block.note_block.bell', null, 0.6, 1.2);
}
(() => {
  const opened = Date.now();
  setInterval(async () => {
    const g = typeof game !== 'undefined' && game;
    if (!g || g.state !== 'play' || g.net || typeof RoomService === 'undefined' || !RoomService.base()) return;
    let seen = 0; try { seen = +localStorage.getItem('mcjs-announce') || 0; } catch (e) { }
    try {
      const r = await RoomService.api('/api/announce?after=' + Math.max(seen, opened - 10 * 60e3));
      for (const a of r.list || []) showAnnounce(g, a);
    } catch (e) { }
  }, 60e3);
})();
