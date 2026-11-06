'use strict';
// ---------------------------------------------------------------------------
// Vanilla's special crafting recipes (the ones without a recipe file): shield decoration, banner and book
// copying, firework stars and their fade colours, firework rockets with stars, tipped arrows, dyed leather;
// shields drawn with their banner patterns; decorated pots with their sherds on the four sides; firework
// explosions in their stars' colours.
// ---------------------------------------------------------------------------
const STAR_SHAPE = { fire_charge: 'large_ball', gold_nugget: 'star', feather: 'burst' };
const isHead = (k) => /_(head|skull)$/.test(k);
const DYE_RGB_ARR = (c) => { const v = DYE_RGB[c] || 0xffffff; return v; };
// the special recipe for a grid, or null: { result, keep: grid index left in place }
function specialRecipe(grid) {
  const items = grid.map((s, i) => s ? { s, i, k: ITEMS[s.id].key } : null).filter(Boolean);
  if (!items.length) return null;
  const by = (re) => items.filter(o => re.test(o.k));
  const dyes = by(/_dye$/);
  // shield + banner: the shield takes the banner's colour and patterns
  if (items.length === 2) {
    const sh = items.find(o => o.k === 'shield'), bn = items.find(o => /_banner$/.test(o.k));
    if (sh && bn && !sh.s.base) return { result: { ...sh.s, count: 1, base: bn.k.replace(/_banner$/, ''), patterns: (bn.s.patterns || []).map(p => [...p]) } };
    // banner copy: a patterned banner and a blank one of the same colour
    const bs = by(/_banner$/);
    if (bs.length === 2 && bs[0].k === bs[1].k) { const src = bs.find(o => o.s.patterns && o.s.patterns.length), blank = bs.find(o => !(o.s.patterns && o.s.patterns.length)); if (src && blank) return { result: { ...src.s, count: 1 }, keep: src.i }; }
  }
  // book copying: a written book (original or copy) and books and quills
  const wb = items.find(o => o.k === 'written_book'), wq = by(/^writable_book$/);
  if (wb && wq.length && wq.length + 1 === items.length && (wb.s.gen | 0) < 2) return { result: { ...wb.s, count: wq.length, gen: (wb.s.gen | 0) + 1 }, keep: wb.i };
  // filled map copying: a map and empty maps
  const fm = items.find(o => o.k === 'filled_map'), em = by(/^map$/);
  if (fm && em.length && em.length + 1 === items.length) return { result: { ...fm.s, count: em.length + 1 } };
  // tipped arrows: eight arrows round a lingering potion
  if (items.length === 9 && grid[4] && ITEMS[grid[4].id].key === 'lingering_potion' && items.filter(o => o.k === 'arrow').length === 8) return { result: { ...makeStack('tipped_arrow', 8), pot: grid[4].pot } };
  // firework star: gunpowder, dyes, maybe a shape, a diamond (trail) and glowstone dust (twinkle)
  const gp = by(/^gunpowder$/);
  if (gp.length === 1 && dyes.length && !items.some(o => o.k === 'paper' || o.k === 'firework_star')) {
    const shapeIt = items.filter(o => STAR_SHAPE[o.k] || isHead(o.k));
    const rest = items.filter(o => !/_dye$/.test(o.k) && o.k !== 'gunpowder' && !STAR_SHAPE[o.k] && !isHead(o.k) && o.k !== 'diamond' && o.k !== 'glowstone_dust');
    if (shapeIt.length <= 1 && !rest.length && by(/^diamond$/).length <= 1 && by(/^glowstone_dust$/).length <= 1) {
      const sk = shapeIt[0] ? (STAR_SHAPE[shapeIt[0].k] || 'creeper') : 'small_ball';
      return { result: { ...makeStack('firework_star', 1), fw: { shape: sk, colors: dyes.map(o => o.k.replace(/_dye$/, '')), fade: [], trail: !!by(/^diamond$/).length, twinkle: !!by(/^glowstone_dust$/).length } } };
    }
  }
  // fade colours on a star
  const fs = items.filter(o => o.k === 'firework_star');
  if (fs.length === 1 && dyes.length && dyes.length + 1 === items.length && fs[0].s.fw) return { result: { ...fs[0].s, count: 1, fw: { ...fs[0].s.fw, fade: dyes.map(o => o.k.replace(/_dye$/, '')) } } };
  // rocket: paper, 1-3 gunpowder, any stars
  const pp = by(/^paper$/);
  if (pp.length === 1 && gp.length >= 1 && gp.length <= 3 && pp.length + gp.length + fs.length === items.length) return { result: { ...makeStack('firework_rocket', 3), flight: gp.length, explosions: fs.map(o => o.s.fw).filter(Boolean) } };
  // dyed leather (armour, horse armour, wolf armour): the colours averaged like vanilla
  const lt = items.filter(o => /^leather_(helmet|chestplate|leggings|boots|horse_armor)$|^wolf_armor$/.test(o.k));
  if (lt.length === 1 && dyes.length && dyes.length + 1 === items.length) {
    const cols = dyes.map(o => DYE_RGB_ARR(o.k.replace(/_dye$/, '')));
    if (lt[0].s.color != null) cols.push(lt[0].s.color);
    let r = 0, g = 0, b = 0, mx = 0;
    for (const c of cols) { const cr = c >> 16 & 255, cg = c >> 8 & 255, cb = c & 255; mx += Math.max(cr, cg, cb); r += cr; g += cg; b += cb; }
    const n = cols.length; r /= n; g /= n; b /= n; const avgMax = mx / n, cur = Math.max(r, g, b) || 1;
    r = r * avgMax / cur; g = g * avgMax / cur; b = b * avgMax / cur;
    return { result: { ...lt[0].s, count: 1, color: (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b) } };
  }
  return null;
}
(() => {
  const _ch = CraftingScreen.prototype.changed;
  CraftingScreen.prototype.changed = function () {
    _ch.call(this); this.specialKeep = null;
    if (this.result && !this.result.unk) {
      // a decorated pot keeps its sherds
      if (ITEMS[this.result.id].key === 'decorated_pot') { const at = (i) => this.grid[i] && ITEMS[this.grid[i].id].key; const s = this.size === 3 ? [at(1), at(3), at(5), at(7)] : null; if (s && s.some(k => k && /_pottery_sherd$/.test(k))) this.result = { ...this.result, sherds: s.map(k => k && /_pottery_sherd$/.test(k) ? k : 'brick') }; }
      return;
    }
    const sp = specialRecipe(this.grid);
    if (sp) { this.result = sp.result; if (sp.keep !== undefined) this.specialKeep = [sp.keep, { ...this.grid[sp.keep] }]; }
  };
  const _co = CraftingScreen.prototype.consume;
  CraftingScreen.prototype.consume = function () {
    const keep = this.specialKeep;
    _co.call(this);
    if (keep && !this.grid[keep[0]]) { this.grid[keep[0]] = keep[1]; this.changed(); }
    else if (keep && this.grid[keep[0]] && sameKind(this.grid[keep[0]], keep[1])) { this.grid[keep[0]].count++; this.changed(); }
  };
  const _il = UI.prototype.itemLines;
  UI.prototype.itemLines = function (st) {
    const lines = _il.call(this, st);
    const shapeCn = { small_ball: '小型球状', large_ball: '大型球状', star: '星形', creeper: '苦力怕状', burst: '爆裂状' };
    const fwLines = (fw, ind) => { lines.push({ text: ind + (shapeCn[fw.shape] || fw.shape), color: '#AAAAAA' }); if (fw.colors && fw.colors.length) lines.push({ text: ind + ' ' + fw.colors.map(c => zhT('item.minecraft.firework_star.' + c, c)).join('、'), color: '#AAAAAA' }); if (fw.fade && fw.fade.length) lines.push({ text: ind + ' 淡化成' + fw.fade.map(c => zhT('item.minecraft.firework_star.' + c, c)).join('、'), color: '#AAAAAA' }); if (fw.trail) lines.push({ text: ind + ' 踪迹', color: '#AAAAAA' }); if (fw.twinkle) lines.push({ text: ind + ' 闪烁', color: '#AAAAAA' }); };
    if (st.fw) fwLines(st.fw, '');
    if (st.flight) { lines.push({ text: '飞行时间：' + st.flight, color: '#AAAAAA' }); for (const e of st.explosions || []) fwLines(e, '  '); }
    if (st.color != null && /leather|wolf_armor/.test(ITEMS[st.id].key)) lines.push({ text: '已染色', color: '#AAAAAA' });
    if (st.sherds) for (const s of st.sherds) lines.push({ text: ITEMS[ITEM_KEY[s]] ? ITEMS[ITEM_KEY[s]].cn : s, color: '#AAAAAA' });
    return lines;
  };
})();
// firework rockets burst in their stars' colours (and shapes, roughly)
(() => {
  if (typeof FireworkRocket === 'undefined') return;
  const _ctor = FireworkRocket.prototype.tick;
  FireworkRocket.prototype.tick = function () {
    const wasDead = this.dead;
    const ex = this.stackRef && this.stackRef.explosions;
    if (ex && ex.length && !wasDead && (this.age + 1 >= this.life || this.world.getBlock(Math.floor(this.pos[0]), Math.floor(this.pos[1]), Math.floor(this.pos[2])))) {
      this.dead = true; Sound.ev(ex.some(e => e.shape === 'large_ball') ? 'entity.firework_rocket.large_blast' : 'entity.firework_rocket.blast', this.pos, 3, 1);
      for (const e of ex) {
        const cols = (e.colors || ['white']).map(c => { const v = DYE_RGB[c] || 0xffffff; return [v >> 16 & 255, v >> 8 & 255, v & 255]; });
        const n = e.shape === 'large_ball' ? 120 : 60, s = e.shape === 'large_ball' ? 0.5 : 0.25;
        for (let i = 0; i < n; i++) {
          let a = Math.random() * Math.PI * 2, b = Math.acos(Math.random() * 2 - 1), k = s;
          if (e.shape === 'star' && i % 2) k *= 0.5;
          const pt = this.game.particles.spawn('glint', ...this.pos, Math.sin(b) * Math.cos(a) * k, Math.cos(b) * k, Math.sin(b) * Math.sin(a) * k);
          if (pt) { pt.col = cols[i % cols.length]; pt.life = 30 + Math.random() * 20; pt.size = 0.12; pt.grav = 0.003; }
        }
        if (e.twinkle) Sound.ev('entity.firework_rocket.twinkle', this.pos, 3, 1);
      }
      return;
    }
    return _ctor.call(this);
  };
  const _use = Game.prototype.use;
  Game.prototype.use = function () {
    const held = this.player.inv.held, before = new Set(this.entities);
    const r = _use.call(this);
    if (held && ITEMS[held.id].key === 'firework_rocket') for (const e of this.entities) if (e instanceof FireworkRocket && !before.has(e)) e.stackRef = { ...held };
    return r;
  };
})();
// shields show their banner (equip.js draws them with this texture)
function shieldTex(r, st) {
  if (st && (st.base || (st.patterns && st.patterns.length))) { const t = r.patternTex('shield', st.base || 'white', st.patterns); if (t) return t; }
  return r.beTex('shield_base');
}
// decorated pots: placed with their sherds, broken back into a pot with them, each side drawn with its pattern
(() => {
  const _pa = Game.prototype.placeAt;
  Game.prototype.placeAt = function (x, y, z, id, meta, held, ...rest) {
    const r = _pa.call(this, x, y, z, id, meta, held, ...rest);
    if (held && held.sherds && BLOCKS[this.world.getBlock(x, y, z)].key === 'decorated_pot') this.getBlockEntity(x, y, z, 'pot').sherds = [...held.sherds];
    return r;
  };
  const _db = Game.prototype.dropBlockLoot;
  Game.prototype.dropBlockLoot = function (x, y, z, id, meta, tool, ...rest) {
    const k = x + ',' + y + ',' + z, be = this.blockEntities.get(k);
    if (BLOCKS[id] && BLOCKS[id].key === 'decorated_pot' && be && be.sherds) {
      this.blockEntities.delete(k);
      // broken with a tool (not silk touch): the sherds come out; otherwise the pot drops whole
      if (tool && !enchLevel(tool, 'silk_touch')) { for (const s of be.sherds) this.dropItem(x + 0.5, y + 0.5, z + 0.5, makeStack(s === 'brick' ? 'brick' : s, 1)); }
      else { const st = makeStack('decorated_pot', 1); st.sherds = be.sherds; this.dropItem(x + 0.5, y + 0.5, z + 0.5, st); }
      Sound.ev('block.decorated_pot.shatter', [x + 0.5, y + 0.5, z + 0.5], 1, 1); return;
    }
    return _db.call(this, x, y, z, id, meta, tool, ...rest);
  };
  const _bp = beParts;
  beParts = function (r, b, m, x, y, z) {
    const parts = _bp(r, b, m, x, y, z);
    if (b.be !== 'decorated_pot') return parts;
    const be = window.game && game.blockEntities && game.blockEntities.get(x + ',' + y + ',' + z);
    if (!be || !be.sherds) return parts;
    if (!r.models.be_pot_side1) {
      const side = (ry) => ({ parts: [{ name: 's', pivot: [0, 0, 0], rotY: ry, boxes: [[1, 0, -7, 0, -7, 14, 16, 0]], mesh: r.makeModelPart([[1, 0, -7, 0, -7, 14, 16, 0]], 16, 16) }] });
      [0, Math.PI / 2, Math.PI, -Math.PI / 2].forEach((ry, i) => { r.models['be_pot_side' + i] = side(ry); });
    }
    const out = parts.filter(p => p[0] !== 'be_pot_sides'), t = parts.find(p => p[0] === 'be_pot_sides');
    // vanilla's side order: back, left, right, front
    const order = [3, 0, 1, 2];
    be.sherds.forEach((s, i) => {
      const pat = s === 'brick' ? null : 'entity/decorated_pot/' + s.replace(/_pottery_sherd$/, '') + '_pottery_pattern';
      const tex = pat ? r.etex(pat) : 'decorated_pot_side';
      if (t) out.push(['be_pot_side' + order[i], tex || 'decorated_pot_side', t[2]]);
    });
    return out;
  };
})();
// the creative inventory lists every painting and every goat horn like vanilla
(() => {
  const _ct = creativeTabItems;
  creativeTabItems = function (tab) {
    const c = creativeTabItems.cache || (creativeTabItems.cache = {});
    if (c[tab]) return c[tab];
    const list = _ct.call(this, tab).flatMap(k => {
      if (k === 'painting' && typeof PAINTINGS !== 'undefined') return ['painting', ...PAINTINGS.filter(v => PAINTING_PLACEABLE.has(v.key)).map(v => ({ key: 'painting', pv: v.key }))];
      if (k === 'goat_horn' && EXTRA.instrument) return Object.keys(EXTRA.instrument).map(i => ({ key: 'goat_horn', instrument: i }));
      return [k];
    });
    return (c[tab] = list);
  };
  creativeTabItems.cache = {};
})();
// the debug stick (creative): right click cycles the selected property of a block's state, sneak + right click
// picks the next property (vanilla uses the attack button for that; here it stays on the use button)
(() => {
  const _use = Game.prototype.use;
  Game.prototype.use = function () {
    const p = this.player, t = this.target, held = p.inv.held;
    if (held && ITEMS[held.id].key === 'debug_stick' && t && !this.targetEntity && !this.net) {
      const w = this.world, [x, y, z] = t.pos, id = w.getBlock(x, y, z), b = BLOCKS[id];
      const st = b.states && b.states[w.getMeta(x, y, z)];
      if (!st || !Object.keys(st).length) { this.ui.actionBar = { text: 'minecraft:' + b.key + ' 没有属性', t: performance.now() }; p.swing(); return; }
      const props = Object.keys(st);
      held.dbg = held.dbg || {};
      let k = held.dbg[b.key] && props.includes(held.dbg[b.key]) ? held.dbg[b.key] : props[0];
      if (p.sneaking) { k = props[(props.indexOf(k) + 1) % props.length]; held.dbg[b.key] = k; this.ui.actionBar = { text: '已选择“' + k + '”（' + st[k] + '）', t: performance.now() }; p.swing(); return; }
      const vals = [...new Set(b.states.map(s => s[k]))];
      const nv = vals[(vals.indexOf(st[k]) + 1) % vals.length];
      w.setBlock(x, y, z, id, Features.withProp(id, w.getMeta(x, y, z), k, nv));
      held.dbg[b.key] = k;
      this.ui.actionBar = { text: '“' + k + '”设为' + nv, t: performance.now() };
      this.flushMesh && this.flushMesh(); p.swing(); return;
    }
    return _use.call(this);
  };
})();
