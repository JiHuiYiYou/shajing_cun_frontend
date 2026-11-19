/* ============================================================
   沙井村 · 舆图 — 应用逻辑
   纯原生 JS，无框架、无依赖。
   ============================================================ */
/* ============================================================
   工具
   ============================================================ */
const $ = id => document.getElementById(id);
/* 可选元素的绑定一律走 on()：元素不在了也不至于抛 TypeError。
   顶层脚本一错即停 —— 一个空指针就能让整页变成白纸。 */
const on = (id, ev, fn) => { const el = $(id); if (el) el.addEventListener(ev, fn); };
const root = document.documentElement;
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const clamp = v => Math.max(0, Math.min(100, v));
const nz = (v, u) => (v === null || v === undefined || v === '') ? '—' : v + u;
const REDUCE = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const MOBILE = () => window.innerWidth < 900;
/* 地名去掉空格：data.js 里的「村 庙」与坐标表里的「村庙」要能对上 */
const normName = s => String(s == null ? '' : s).replace(/\s+/g, '');

/* 状态 */
const S = {
  year: 1, month: 1, money: 100, rep: 50, clash: 30,
  dec: {}, done: false, sel: null, met: new Set(), player: null,
  filt: { surname: '*', q: '' }, prev: { money: 100, rep: 50, clash: 30 }
};
window.S = S;   /* 巡检脚本与控制台都靠它看状态 */

/* ============================================================
   图标：统一 24 栅格、1.5 线宽的手绘线描（与水墨风格一致）
   ============================================================ */
const ICON = {
  temple:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l8 4.5H4z"/><path d="M4 7.5v2M20 7.5v2"/><path d="M6 10v9M18 10v9M10 10v9M14 10v9"/><path d="M3 19h18"/></svg>',
  river:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2c0 4 5 5 5 9s-5 5-5 9"/><path d="M12 2c0 4 5 5 5 9s-5 5-5 9"/><path d="M18 3c0 4 4 5 4 8s-4 5-4 8"/></svg>',
  field:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 18.5h18"/><path d="M6 18.5v-8M10 18.5v-8M14 18.5v-8M18 18.5v-8"/><path d="M3 8l9-3.5L21 8"/></svg>',
  school:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 5.5h7v13h-7zM13.5 5.5h7v13h-7z"/><path d="M6 9h1.5M6 12h1.5M16 9h1.5M16 12h1.5"/></svg>',
  yard:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8"/><path d="M12 4v16M4 12h16"/><path d="M6.5 6.5l11 11M17.5 6.5l-11 11" opacity=".45"/></svg>',
  case:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 4.5h10l4 4v11H5z"/><path d="M15 4.5v4h4"/><path d="M8.5 12.5h7M8.5 15.5h4.5"/></svg>',
  water:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3.5c3.2 5 6 6.8 6 10.4A6 6 0 0 1 6 13.9C6 10.3 8.8 8.5 12 3.5z"/></svg>',
  coins:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="6.5" rx="7" ry="3"/><path d="M5 6.5v5c0 1.7 3.1 3 7 3s7-1.3 7-3v-5"/><path d="M5 11.5v5c0 1.7 3.1 3 7 3s7-1.3 7-3v-5"/></svg>',
  law:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v16M6.5 20h11"/><path d="M3.5 9h6M14.5 9h6"/><path d="M7 9l-3 5h6zM17 9l-3 5h6z"/></svg>',
  ballot:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3.5h12v17H6z"/><path d="M9 8.5h6M9 12h6M9 15.5h3"/><path d="M9 6.5h1.5"/></svg>',
  soldier:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3.5c2.5 0 4 1.6 4 4v13H8v-13c0-2.4 1.5-4 4-4z"/><path d="M9.5 9h5"/></svg>'
};
function caseIcon(t) {
  if (/水灾/.test(t)) return ICON.water;
  if (/纠纷|诉讼|案/.test(t)) return ICON.law;
  if (/选举/.test(t)) return ICON.ballot;
  if (/征兵|行政/.test(t)) return ICON.soldier;
  if (/经济|承包/.test(t)) return ICON.coins;
  return ICON.case;
}

/* ============================================================
   季节
   ============================================================ */
const SEASONS = {
  '春': { glyph:'春', tint:'rgba(126,158,96,.17)', f1:'#c6cf94', f2:'#aebd7e', tree:'#7f9450', w:'petal' },
  '夏': { glyph:'夏', tint:'rgba(214,186,104,.15)', f1:'#aebb74', f2:'#93a85e', tree:'#5f7a3c', w:'firefly' },
  '秋': { glyph:'秋', tint:'rgba(186,134,66,.18)', f1:'#d6ba78', f2:'#c2a25c', tree:'#a9743a', w:'leaf' },
  '冬': { glyph:'冬', tint:'rgba(126,156,186,.2)',  f1:'#d8cfb6', f2:'#c8bea2', tree:'#8d8674', w:'snow' }
};
function seasonOf(m) { return (m >= 11 || m <= 2) ? '冬' : (m <= 5 ? '春' : (m <= 8 ? '夏' : '秋')); }
function paintSeason() {
  const s = SEASONS[seasonOf(S.month)];
  root.style.setProperty('--tint', s.tint);
  root.style.setProperty('--f1', s.f1);
  root.style.setProperty('--f2', s.f2);
  root.style.setProperty('--tree', s.tree);
}

/* ============================================================
   动效工具
   ============================================================ */
const easeOut = t => 1 - Math.pow(1 - t, 3);
function tweenNum(el, from, to, dur, fmt) {
  if (REDUCE) { el.textContent = fmt(to); return; }
  const t0 = performance.now();
  (function step(now) {
    const p = Math.min(1, (now - t0) / dur);
    el.textContent = fmt(from + (to - from) * easeOut(p));
    if (p < 1) requestAnimationFrame(step);
  })(t0);
}
function flashDelta(el, n, unit) {
  if (!n) return;
  el.textContent = (n > 0 ? '+' : '') + n + unit;
  el.classList.toggle('bad', n < 0);
  el.classList.add('on');
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('on'), 2200);
}
const ARC_LEN = 94.25;   /* 270° 弧长 */
function setGauge(path, v) {
  path.style.strokeDasharray = ARC_LEN;
  path.style.strokeDashoffset = ARC_LEN * (1 - v / 100);
}

/* ============================================================
   顶栏
   ============================================================ */
const MN = ['正月','二月','三月','四月','五月','六月','七月','八月','九月','十月','十一月','十二月'];
/* 十五宗族各一色：低饱和、低明度差，纸上可辨而不争。
   取色经两两可分（最小 ΔE 12.8）与对纸色对比（≥3.2:1）核算。 */
const CLANCOLOR = {
  '李':'#76614c','杨':'#458844','张':'#50509f','杜':'#9e5178','赵':'#7b7d3f',
  '刘':'#48425c','孙':'#814142','王':'#43847c','崇':'#5d3f3c','任':'#5b7a95',
  '周':'#764c62','景':'#425d3c','柏':'#3c5a5d','傅':'#76724c','吴':'#8d6262',
  '其他':'#8a8a7a'
};
/* 宗族以姓别之，与图例计数口径一致 */
const clanOf = h => h.surname || '其他';
const clanColor = h => CLANCOLOR[clanOf(h)] || '#8a8a7a';
function buildDial() {
  const svg = $('dial');
  let s = '<circle class="ring" cx="32" cy="32" r="29"/>';
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 - Math.PI / 2;
    const r1 = 25.5, r2 = i % 3 === 0 ? 22.5 : 24;
    s += '<line class="tick" id="tk' + i + '" x1="' + (32 + Math.cos(a) * r1).toFixed(2) + '" y1="' + (32 + Math.sin(a) * r1).toFixed(2) +
         '" x2="' + (32 + Math.cos(a) * r2).toFixed(2) + '" y2="' + (32 + Math.sin(a) * r2).toFixed(2) + '"/>';
  }
  s += '<circle class="arc" id="dialArc" cx="32" cy="32" r="22" stroke-dasharray="138.2" stroke-dashoffset="138.2"/>';
  s += '<text class="glyph" id="dialGlyph" x="32" y="39">' + SEASONS[seasonOf(S.month)].glyph + '</text>';
  svg.innerHTML = s;
}
function renderHud() {
  $('mName').textContent = S.done ? '岁末' : MN[S.month - 1];
  $('yearN').textContent = '第 ' + S.year + ' 年';
  const arc = $('dialArc');
  if (arc) {
    const frac = S.done ? 1 : S.month / 12;
    arc.style.strokeDashoffset = (138.2 * (1 - frac)).toFixed(2);
  }
  const gl = $('dialGlyph');
  if (gl) gl.textContent = S.done ? '终' : SEASONS[seasonOf(S.month)].glyph;
  for (let i = 0; i < 12; i++) {
    const t = $('tk' + i);
    if (t) t.classList.toggle('on', i < S.month - 1 || (i === S.month - 1 && !S.done));
  }
  /* 数值 */
  tweenNum($('vMoney'), S.prev.money, S.money, 700, v => Math.round(v));
  tweenNum($('vRep'), S.prev.rep, S.rep, 700, v => Math.round(v));
  tweenNum($('vClash'), S.prev.clash, S.clash, 700, v => Math.round(v));
  setGauge($('fRep'), S.rep);
  setGauge($('fClash'), S.clash);
}

/* ============================================================
   时令条
   ============================================================ */
function monthItems(m) { return DATA.calendar.filter(c => c.months && c.months.includes(m)); }
function calLine(c) {
  const p = [];
  if (c.crop) p.push('农事 · ' + c.crop);
  if (c.market) p.push('集市 · ' + c.market);
  if (c.fest) p.push('庙会 · ' + c.fest);
  if (c.other) p.push('村务 · ' + c.other);
  return p.join('　');
}
function renderAlmanac() {
  const items = monthItems(S.month);
  const html = items.length
    ? items.map(c => '<span class="chip">' + esc(c.t) + '　' + esc(calLine(c)) + '</span>').join('')
    : '<span class="chip">本月无所载时令</span>';
  $('almanac').innerHTML = html + html;   /* 复制一份以实现无缝滚动 */
}

/* ============================================================
   世界：地名、户、道具
   地图不再是贴在图上的示意图，而是一个能走的地方：
   人物是立绘小人，站在自己家门口；地点是方牌；走近按 E 才打开面板。
   坐标一律取自 assets/js/sites.js（由舆图识别结果生成），世界像素。
   ============================================================ */
const SITE = (typeof SITES !== 'undefined' && SITES) ? SITES : { world: { w: 6144, h: 4080 }, houses: [], places: [], props: [], chars: [] };
const hasPortrait = no => (SITE.chars || []).indexOf(String(no)) >= 0;
const SINGLE = document.documentElement.hasAttribute('data-single');
const portraitSrc = no => (hasPortrait(no) && !SINGLE) ? 'assets/char/' + no + '.png' : null;
const HOUSE_AT = {};
(SITE.houses || []).forEach(h => { HOUSE_AT[String(h.no)] = h; });
const PLACE_AT = {};
(SITE.places || []).forEach(p => { PLACE_AT[normName(p.name)] = p; });
/* 名字对不上时的兜底：按旧舆图坐标折算 */
function housePos(no) {
  const h = HOUSE_AT[String(no)];
  if (h) return h;
  const hh = DATA.households.find(x => x.no === String(no));
  if (!hh) return null;
  return { x: hh.x * (SITE.world.w / 1000), y: hh.y * (SITE.world.h / 700) };
}
function placePos(name) {
  return PLACE_AT[normName(name)] || null;
}

function renderPlaces() {
  (SITE.places || []).forEach(p => {
    const key = normName(p.name);
    const src = DATA.places.find(d => normName(d.name) === key);
    if (!src) return;
    const d = document.createElement('div');
    d.className = 'ent ent--place';
    d.dataset.place = key;
    d.setAttribute('role', 'button');
    d.setAttribute('tabindex', '0');
    d.setAttribute('aria-label', key + '，村落之处');
    d.innerHTML = '<div class="ent-badge">' + (ICON[src.icon] || ICON.temple) + '</div>';
    const t = document.createElement('div');
    t.className = 'tag t-place';
    t.textContent = key;
    d.addEventListener('click', () => openPlaceByName(key));
    d.addEventListener('keydown', ev => {
      if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); openPlaceByName(key); }
    });
    World.addEntity({ kind: 'place', id: 'place:' + key, name: key, x: p.x, y: p.y, el: d, tag: t, tagUp: 44, data: src });
  });
  /* 道具 */
  (SITE.props || []).forEach(pr => {
    const d = document.createElement('div');
    d.className = 'ent ent--prop';
    d.setAttribute('role', 'button');
    d.setAttribute('tabindex', '0');
    d.setAttribute('aria-label', pr.name);
    d.innerHTML = '<div class="ent-badge">' + (ICON.water || ICON.case) + '</div>';
    const t = document.createElement('div');
    t.className = 'tag t-prop';
    t.textContent = pr.name;
    d.addEventListener('click', () => openProp(pr));
    d.addEventListener('keydown', ev => {
      if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); openProp(pr); }
    });
    World.addEntity({ kind: 'prop', id: 'prop:' + pr.id, name: pr.name, x: pr.x, y: pr.y, el: d, tag: t, tagUp: 30, data: pr });
  });
}

/* ============================================================
   地图：户
   ============================================================ */
function isFormal(h) {
  const n = h.note || '';
  return n.includes('会首') || n.includes('司账') || n.includes('族长') || (h.manageN !== null && h.manageN >= 30);
}
/* 没有立绘的户：一个水墨剪影 + 姓氏朱牌 */
function silhouette(d, hh) {
  const s = document.createElement('span');
  s.className = 'ent-silh';
  d.appendChild(s);
  const seal = document.createElement('i');
  seal.className = 'ent-seal';
  seal.textContent = hh.surname;
  d.appendChild(seal);
}
/* 认识的户：换上立绘，摘掉剪影，露出名牌 */
function revealVillager(no) {
  const e = World.byId.get('v:' + no);
  if (!e) return;
  e.met = true;
  if (e.tag) e.tag.style.display = '';
  const d = e.el;
  const sil = d.querySelector('.ent-silh');
  const seal = d.querySelector('.ent-seal');
  if (sil) sil.remove();
  if (seal) seal.remove();
  if (!d.querySelector('.ent-portrait')) {
    const pf = portraitSrc(no);
    if (pf) {
      const img = document.createElement('img');
      img.className = 'ent-portrait';
      img.src = pf;
      img.alt = '';
      img.addEventListener('error', () => { img.remove(); silhouette(d, e.house); });
      d.insertBefore(img, d.firstChild);
    }
  }
}
function spawnPerson(no) {
  no = String(no);
  if (!DATA.households.find(x => x.no === no)) return false;
  if (!S.met.has(no)) {
    S.met.add(no);
    revealVillager(no);
    renderDlist(false);
    return true;
  }
  return false;
}
/* 七十二户始终在村里 —— 人不会离村，所以过月不再清场。
   以前是「已上地图的人」，现在叫「已相识的人」。 */
function renderHouses() {
  (SITE.houses || []).forEach((h, idx) => {
    const hh = DATA.households.find(x => x.no === String(h.no));
    if (!hh) return;
    const id = 'v:' + h.no;
    if (World.byId.has(id)) return;
    if (S.player === String(h.no)) return;   /* 主角自己，不再另立一个 */
    const d = document.createElement('div');
    d.className = 'ent ent--villager mk';
    d.dataset.no = h.no;
    d.style.setProperty('--c', clanColor(hh));
    d.setAttribute('role', 'button');
    d.setAttribute('tabindex', '0');
    d.setAttribute('aria-label', hh.name + '，' + (hh.job || '职业未载'));
    const t = document.createElement('div');
    t.className = 'tag';
    t.textContent = hh.name;
    t.style.display = 'none';
    const pf = portraitSrc(h.no);
    if (pf) {
      const img = document.createElement('img');
      img.className = 'ent-portrait';
      img.src = pf;
      img.alt = '';
      img.addEventListener('error', () => { img.remove(); silhouette(d, hh); });
      d.appendChild(img);
    } else {
      silhouette(d, hh);
    }
    if (isFormal(hh)) d.classList.add('formal');
    d.addEventListener('click', () => openPerson(h.no));
    d.addEventListener('keydown', ev => {
      if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); openPerson(h.no); }
    });
    const e = World.addEntity({ kind: 'villager', id: id, no: String(h.no), x: h.x, y: h.y, el: d, tag: t, tagUp: 88 });
    e.house = hh;
    e.portrait = !!pf;
  });
  /* 族属图例 */
  renderLegend();
  /* 户册「已相识」标记 */
  document.querySelectorAll('#dlist .row').forEach(r => r.classList.toggle('live', S.met.has(r.dataset.no)));
}

function renderLegend() {
  const keys = Object.keys(DATA.counts).sort((a, b) => DATA.counts[b] - DATA.counts[a]);
  const body = keys.map(k =>
    '<div class="lgrow' + (S.filt.surname === k ? ' on' : '') + '" data-k="' + esc(k) + '">' +
    '<span class="sw" style="background:' + (CLANCOLOR[k] || '#8a8a7a') + '"></span>' + esc(k) +
    '<em>' + DATA.counts[k] + '</em></div>').join('');
  $('lgBody').innerHTML = body + '<div class="lgfoot">村中要户口以金圈标出。点选族属可筛户册并淡出他姓。</div>';
  $('lgBody').querySelectorAll('.lgrow').forEach(el => {
    el.addEventListener('click', () => {
      const k = el.dataset.k;
      S.filt.surname = (S.filt.surname === k) ? '*' : k;
      renderChips(); renderDlist(); renderHouses();
    });
  });
}

/* ============================================================
   户册
   ============================================================ */
function renderChips() {
  const keys = ['*'].concat(Object.keys(DATA.counts).sort((a, b) => DATA.counts[b] - DATA.counts[a]));
  $('chips').innerHTML = keys.map(k => {
    const label = k === '*' ? '全部' : k + ' ' + DATA.counts[k];
    return '<button class="chi' + (S.filt.surname === k ? ' on' : '') + '" data-k="' + esc(k) + '">' + esc(label) + '</button>';
  }).join('');
  $('chips').querySelectorAll('.chi').forEach(b => b.addEventListener('click', () => {
    S.filt.surname = b.dataset.k; renderChips(); renderDlist(); renderHouses();
  }));
}
function syncListLive() {
  const rows = $('dlist').querySelectorAll('.row');
  if (!rows.length) return;
  const vis = rows.length;
  $('dCount').textContent = vis + ' / 72 户　已识 ' + S.met.size;
  rows.forEach(r => r.classList.toggle('live', S.met.has(r.dataset.no)));
}
/* animate=false 时不重播入场动画：逐字检索时每敲一键都让七十二行跳一遍，手感很躁。 */
function renderDlist(animate) {
  const q = S.filt.q.trim();
  const list = DATA.households.filter(h => {
    if (S.filt.surname !== '*' && clanOf(h) !== S.filt.surname) return false;
    if (!q) return true;
    return (h.name + h.job + h.clan + h.note + h.rel + h.surname).includes(q);
  });
  $('dCount').textContent = list.length + ' / 72 户　已识 ' + S.met.size;
  $('dlist').innerHTML = list.map((h, i) =>
    '<div class="row' + (S.sel === h.no ? ' sel' : '') + '" data-no="' + h.no + '" style="--i:' + Math.min(i, 40) + '">' +
    '<span class="onmap"></span>' +
    '<div class="av" style="--c:' + clanColor(h) + '">' + esc(h.surname) + '</div>' +
    '<div class="txt"><div class="rn">' + esc(h.name) + '</div>' +
    '<div class="rm">' + esc(h.job || '职业未载') + (h.members ? ' · 口 ' + esc(h.members) : '') + '</div></div>' +
    '<div class="rl">' + esc(nz(h.manage, '')) + (h.manage ? '亩' : '') + '</div></div>').join('')
    || '<div class="empty">无符合的户</div>';
  $('dlist').classList.toggle('anim', animate !== false);
  $('dlist').querySelectorAll('.row').forEach(r => {
    r.classList.toggle('live', S.met.has(r.dataset.no));
    r.addEventListener('click', () => focusHousehold(r.dataset.no));
  });
}

/* ============================================================
   案卷
   ============================================================ */
function curEvent() { return DATA.events.find(e => e.month === S.month) || null; }
function fxText(o) {
  const p = [];
  if (o.mn) p.push((o.mn > 0 ? '+' : '') + o.mn + '元');
  if (o.r) p.push('人望' + (o.r > 0 ? '+' : '') + o.r);
  if (o.cl) p.push('矛盾' + (o.cl > 0 ? '+' : '') + o.cl);
  return p.length ? p.join(' · ') : '无损益';
}
function optHtml(o) {
  const parts = [];
  if (o.mn) parts.push('<span class="' + (o.mn > 0 ? 'up' : 'dn') + '">村款 ' + (o.mn > 0 ? '+' : '') + o.mn + '</span>');
  if (o.r) parts.push('<span class="' + (o.r > 0 ? 'up' : 'dn') + '">人望 ' + (o.r > 0 ? '+' : '') + o.r + '</span>');
  if (o.cl) parts.push('<span class="' + (o.cl > 0 ? 'dn' : 'up') + '">矛盾 ' + (o.cl > 0 ? '+' : '') + o.cl + '</span>');
  return '<small>' + parts.join(' · ') + '</small>';
}
/* 案卷原先是贴在图外的一条底栏，现在搬进公会地：
   走近按 E 才开。内容还是原来那一份，只是换了个屋住。 */
function caseCardHtml() {
  const ev = curEvent(), d = S.dec[S.month];
  if (!ev) {
    return '<div class="casecard"><div class="ct">本月无事</div>' +
      '<div class="cs">归集表于此月无所载案卷，村务如常。可径往谷场过月。</div></div>';
  }
  if (d) {
    return '<div class="casecard"><div class="ct">' + esc(d.t) +
      '　<span style="color:var(--seal)">已结</span></div>' +
      '<div class="cs">' + esc(d.fx) + '　·　' + esc(d.bs) + '</div></div>';
  }
  return '<div class="casecard"><div class="ct">' + esc(ev.name) +
    '　<span style="color:var(--ink-3);font-size:11px">' + esc(ev.type) + '</span></div>' +
    '<div class="cs">' + esc(ev.summary) + '</div>' +
    '<div class="opts">' + ev.opt.map((o, i) =>
      '<button class="opt" data-i="' + i + '"><b>' + esc(o.t) + '</b>' + optHtml(o) + '</button>').join('') +
    '</div></div>';
}
function bindCaseCard(root) {
  if (!root) return;
  root.querySelectorAll('.opt').forEach(b => b.addEventListener('click', () => choose(+b.dataset.i)));
}
/* 结了案，案卷面板就地改成「已结」——不开新层，不打断人 */
function refreshCasePanel() {
  const sheet = $('sheet');
  if (!sheet || !$('modal').classList.contains('on')) return;
  const box = sheet.querySelector('.casecard');
  if (!box) return;
  if (!S.dec[S.month]) return;
  box.outerHTML = caseCardHtml();
}
/* 案卷已结与否，落在两个地点的徽标上：
   公会地说「本月有案 / 已结」，谷场说「案卷未结 / 可过月」。 */
function updateCaseState() {
  const ev = curEvent();
  const ok = !ev || S.dec[S.month];
  const yard = World.byId.get('place:谷场');
  if (yard) {
    yard.state = S.done ? '岁末已结' : (ok ? (ev ? '案卷已结' : '本月无事') : '案卷未结');
    if (yard.el) yard.el.classList.toggle('locked', !ok);
  }
  const hall = World.byId.get('place:公会地');
  if (hall) hall.state = S.dec[S.month] ? '本月已结' : (ev ? '本月有案' : '本月无事');
}

/* ============================================================
   抉择
   ============================================================ */
function choose(i) {
  if (S.dec[S.month] || S.done) return;
  const ev = curEvent(); if (!ev) return;
  const o = ev.opt[i];
  S.prev = { money: S.money, rep: S.rep, clash: S.clash };
  S.money += o.mn || 0;
  S.rep = clamp(S.rep + (o.r || 0));
  S.clash = clamp(S.clash + (o.cl || 0));
  S.dec[S.month] = { t: o.t, bs: o.bs, fx: fxText(o) };
  renderHud(); refreshCasePanel(); updateCaseState();
  flashDelta($('dMoney'), (o.mn || 0), '元');
  const at = MONTH_ACTOR_BY_NAME[S.month];
  clearActor();
  showFx(at ? at.at : '公会地', fxText(o));
  toast('已结：' + o.t);
  saveGame();
}

/* ============================================================
   过月
   ============================================================ */
let wiping = false;
function passMonth() {
  if (S.done || wiping) return;
  const ev = curEvent();
  if (ev && !S.dec[S.month]) { toast('本月案卷未结'); return; }
  wiping = true;
  const nextMonth = S.month < 12 ? S.month + 1 : 0;
  const label = nextMonth ? MN[nextMonth - 1] : '岁末';

  const wipe = $('wipe');
  $('wipeBig').textContent = label;
  wipe.classList.add('on');

  const apply = () => {
    S.prev = { money: S.money, rep: S.rep, clash: S.clash };
    if (S.month < 12) {
      S.month++; S.sel = null;
      renderAll(); monthActor();
    } else {
      S.done = true; clearActor(); renderHud(); updateCaseState();
    }
  };
  const finish = () => {
    wipe.classList.remove('on');
    $('wipeBig').textContent = '';
    wiping = false;
    if (S.done) showEnd();
    saveGame();
  };
  if (REDUCE) { apply(); finish(); return; }
  /* 这里不用 startViewTransition：#wipe 本来就是一层全屏擦除，
     再叠一次视口快照是重复而且昂贵（世界里横着一整张 6144×4080 的图）。 */
  setTimeout(() => { apply(); finish(); }, 380);
}

/* ============================================================
   弹层
   ============================================================ */
let modalReturnFocus = null;
/* opts.after(sheet)：内容已入 DOM 之后回调。
   openModal 内部走 startViewTransition，正文是延后写入的，
   所以外面想在面板里绑事件，必须等这一刻。 */
function openModal(html, wide, opts) {
  opts = opts || {};
  const sheet = $('sheet'), modal = $('modal');
  const wasOpen = modal.classList.contains('on');
  const apply = () => {
    sheet.innerHTML = '<button class="x" aria-label="关闭">×</button>' + html;
    sheet.classList.toggle('wide', !!wide);
    sheet.setAttribute('role', 'dialog');
    sheet.setAttribute('aria-modal', 'true');
    modal.classList.add('on');
    const x = sheet.querySelector('.x');
    if (x) x.focus();
    if (opts.after) opts.after(sheet);
  };
  /* 已经开着就只是换个内容。
     这里刻意不用 startViewTransition：世界是一整张 6144×4080 的图，
     视口转场要抓整个文档的快照，又慢又晃；弹层自己另有 sheetIn 的动画。 */
  if (wasOpen) { apply(); return; }
  modalReturnFocus = opts.focus || document.activeElement;
  apply();
}
function closeModal() {
  const modal = $('modal');
  if (!modal.classList.contains('on')) return;
  const apply = () => {
    modal.classList.remove('on');
    $('sheet').innerHTML = '';
    $('sheet').classList.remove('wide');
    $('sheet').removeAttribute('role');
    $('sheet').removeAttribute('aria-modal');
    /* 触发器可能已被重建，或本来就是一次地图点击（焦点在 body 上）。
       这两种情形下把焦点丢回主角，键盘才接得上。 */
    if (modalReturnFocus && modalReturnFocus.isConnected && modalReturnFocus.focus) {
      modalReturnFocus.focus();
    } else {
      const p = World.player && World.player.el;
      if (p && p.isConnected) p.focus();
    }
    modalReturnFocus = null;
  };
  apply();
}
function openPerson(no) {
  const h = DATA.households.find(x => x.no === no); if (!h) return;
  spawnPerson(no);
  S.sel = no; renderHouses(); renderDlist(false);
  const tiles = [
    ['年 龄', h.age ? h.age : '—', '岁'],
    ['家 口', h.members || '—', '人'],
    ['劳 力', h.labor || '—', ''],
    ['经 营', h.manage || '—', '亩']
  ];
  const tags = (h.trait || '').split('；').filter(Boolean);
  const note = h.note ? esc(h.note).replace(/【([^】]*)】/g, '<mark>【$1】</mark>') : '';
  const warn = /存疑|截断|注记|不明/.test(h.note || '');
  const pf = portraitSrc(h.no);
  openModal(
    '<div class="ptitle">户 册 · 序 ' + esc(h.no) + '</div>' +
    '<div class="phead">' +
    (pf ? '<img class="pfig" src="' + pf + '" alt="" onerror="this.remove()">' : '') +
    '<div class="pav" style="--c:' + clanColor(h) + '">' + esc(h.surname) + '</div>' +
    '<div><h3 class="pname">' + esc(h.name) + '</h3>' +
    '<div class="pmeta">' + esc(h.job || '职业未载') + '　·　' + esc(clanOf(h)) + '氏' + (isFormal(h) ? '　·　村中要户' : '') + '</div></div></div>' +
    '<div class="tiles">' + tiles.map(t => '<div class="tile"><span>' + t[0] + '</span><b>' + esc(t[1]) + '<i>' + (t[2] && t[1] !== '—' ? t[2] : '') + '</i></b></div>').join('') + '</div>' +
    '<div class="sub"><span>所有 <b>' + esc(h.own || '—') + '</b></span><span>租入 <b>' + esc(h.rent || '—') + '</b></span>' +
      '<span>外出 <b>' + esc(h.out || '—') + '</b></span><span>族长 <b>' + esc(h.clan || '—') + '</b></span></div>' +
    (tags.length ? '<div class="blk"><h4>性 格</h4><div class="tags">' + tags.map(t => '<span class="tg">' + esc(t) + '</span>').join('') + '</div>' +
      (h.look ? '<p style="margin-top:6px">外貌 · ' + esc(h.look) + '</p>' : '') +
      (h.tone ? '<p style="margin-top:3px">口吻 · ' + esc(h.tone) + '</p>' : '') + '</div>' : '') +
    (h.rel ? '<div class="blk"><h4>关 系</h4><p>' + esc(h.rel) + '</p></div>' : '') +
    (note ? '<div class="blk"><h4>原 表 备 注</h4><p' + (warn ? ' class="warnbox"' : '') + '>' + note + '</p></div>' : '') +
    '<div class="foot">照录《沙井村72户人物信息归集表》原文，未作改写；带「转录存疑 / 截断」处保留原样。</div>' +
    '<div class="actions"><button class="hb primary" onclick="closeModal()">闭 卷</button></div>'
  );
}

/* ============================================================
   村志：岁时录 / 经济志 / 悬案牍
   归集表另有三处材料未见于舆图主体，汇于此卷。
   ============================================================ */
const GZ_TABS = [
  { k: 'cal',  label: '岁 时 录' },
  { k: 'econ', label: '经 济 志' },
  { k: 'back', label: '悬 案 牍' },
  { k: 'kin',  label: '族 属 谱' }
];
let gzTab = 'cal';

/* 把行文中的数字排成数据（原文数字，不作换算） */
function fig(s) {
  return esc(s).replace(/(\d+(?:\.\d+)?(?:\s*[-–—]\s*\d+(?:\.\d+)?)?)/g, '<b class="fig">$1</b>');
}
function gzItem(c) {
  const rows = [];
  if (c.crop)   rows.push(['农事', c.crop]);
  if (c.market) rows.push(['集市', c.market]);
  if (c.fest)   rows.push(['庙会', c.fest]);
  if (c.other)  rows.push(['村务', c.other]);
  return '<div class="gzit"><div class="gzt">' + esc(c.t) + '</div>' +
    rows.map(r => '<p><span class="gzl">' + r[0] + '</span>' + esc(r[1]) + '</p>').join('') +
    '</div>';
}
function gzCalBody() {
  const out = [];
  for (let m = 1; m <= 12; m++) {
    const list = DATA.calendar.filter(c => c.months && c.months.includes(m));
    if (!list.length) continue;
    out.push('<section class="gzmon' + (m === S.month && !S.done ? ' now' : '') + '">' +
      '<h4 class="gzmh">' + MN[m - 1] + (m === S.month && !S.done ? '<i>本月</i>' : '') + '</h4>' +
      list.map(gzItem).join('') + '</section>');
  }
  const free = DATA.calendar.filter(c => !c.months || !c.months.length);
  if (free.length) {
    out.push('<section class="gzmon"><h4 class="gzmh">无 定 时</h4>' +
      free.map(gzItem).join('') + '</section>');
  }
  return '<div class="gzcal">' + out.join('') + '</div>';
}
function gzEconBody() {
  return '<div class="gzecon">' + DATA.econ.map(e =>
    '<div class="gze"><div class="gzcat">' + esc(e.cat) + '</div>' +
    '<p class="gzp">' + fig(e.text) + '</p></div>').join('') + '</div>';
}

/* 案牍行文中认出本村人名者，链到户册 */
const NAME_IDX = DATA.households
  .map(h => ({ n: h.name, no: h.no }))
  .filter(x => x.n && x.n.length >= 2)
  .sort((a, b) => b.n.length - a.n.length);
function linkNames(text) {
  const raw = String(text == null ? '' : text);
  const hit = [];
  NAME_IDX.forEach(x => {
    let from = 0;
    for (;;) {
      const i = raw.indexOf(x.n, from);
      if (i < 0) break;
      const e = i + x.n.length;
      if (!hit.some(h => i < h.e && e > h.s)) hit.push({ s: i, e: e, n: x.n, no: x.no });
      from = i + 1;
    }
  });
  hit.sort((a, b) => a.s - b.s);
  let out = '', pos = 0;
  hit.forEach(h => {
    out += esc(raw.slice(pos, h.s));
    out += '<button class="gnm" data-no="' + h.no + '" title="开此人户册">' + esc(h.n) + '</button>';
    pos = h.e;
  });
  return out + esc(raw.slice(pos));
}
function gzBackBody() {
  return '<div class="gznote">以下诸案，归集表只载起因与梗概，皆未载结局。文中人名可点，径开其户册。</div>' +
    '<div class="gzback">' + DATA.backlog.map(b =>
      '<article class="gzb"><div class="gzbh"><b>' + linkNames(b.name) + '</b>' +
      '<span class="gztype">' + esc(b.type) + '</span></div>' +
      '<p class="gzp">' + linkNames(b.summary) + '</p>' +
      '</article>').join('') + '</div>';
}
/* ============================================================
   族属谱
   ------------------------------------------------------------
   归集表「族属」一栏记的是本户所属的宗支与支派长，同栏内以
   「〃」承前。故须按行序往下推，才知每户挂在谁名下；支派长
   不在本村七十二户之列者，另作外村支派列出。虚线者，表中所
   记只是承前之支，未言父子。
   ============================================================ */
const KIN_SP = 66, KIN_VP = 74;    /* 谱中横距、纵距 */
let gzKinFam = '*';                /* 族属谱中选看的姓 */

/* 括注里记的多是支派长与本户的关系；「祖父是…」一类说的是支
   派长自己的上世，与本户无涉，故只作「同宗」存其大概。 */
function kinTerm(e) {
  if (!e) return '';
  if (/伯父/.test(e)) return '伯父';
  if (/叔父/.test(e)) return '叔父';
  if (/堂兄|族兄/.test(e)) return '兄';
  if (/之父/.test(e)) return '父';
  if (/^父(亲)?$/.test(e)) return '父';
  if (/^兄$/.test(e)) return '兄';
  if (/^弟$/.test(e)) return '弟';
  if (/祖父/.test(e)) return '同宗';
  return '';
}

/* 外村支派：由族属栏取出支派长的称谓与所在 */
function kinExt(src) {
  const pm = src.match(/^(.+?)[（(]([^）)]*)[）)]\s*$/);
  if (pm) return { name: pm[1].replace(/^与/, ''), place: pm[2] };
  const s = src.replace(/^与/, '').trim();
  const bm = s.match(/^(.+?)是兄弟$/);
  if (bm) return { name: bm[1], place: '' };
  if (/^在/.test(s)) return { name: '', place: s };
  if (/只有一户/.test(s)) return { name: '', place: '本族只此一户' };
  if (/不明/.test(s)) return { name: '', place: '族属不明' };
  return { name: s, place: '' };
}
function kinGiven(name) {
  const s = String(name || '').replace(/[（(].*$/, '').trim();
  return s.length > 1 ? s.slice(1) : s;
}

function buildKinship() {
  const hs = DATA.households;
  const byName = new Map();
  hs.forEach(h => {
    if (!byName.has(h.name)) byName.set(h.name, []);
    byName.get(h.name).push(h);
  });
  const names = [...byName.keys()].sort((a, b) => b.length - a.length);
  const claimed = new Set();
  const R = new Map();
  let prev = null;

  /* 第一遍：读族属栏 */
  hs.forEach(h => {
    const raw = (h.clan || '').trim();
    const r = {
      no: h.no, name: h.name, surname: h.surname, raw: raw,
      cnt: '', extra: '', term: '', parent: null, ext: null,
      kind: 'named', carry: false, from: prev
    };
    if (!raw) { r.kind = 'empty'; R.set(h.no, r); prev = h.no; return; }

    const cm = raw.match(/同族(?:为本村)?\s*([0-9一二三四五六七八九十、]+)\s*户/);
    if (cm) r.cnt = cm[1];
    let body = raw.replace(/同族(?:为本村)?\s*[0-9一二三四五六七八九十、]+\s*户/g, '');
    body = body.replace(/[，,][^，,]*$/, '').trim();   /* 截断的尾巴 */

    let inner = null;
    if (body.charAt(0) === '〃') {
      const m = body.match(/〔([^〕]*)〕/);
      inner = m ? m[1] : null;
      body = inner || '';
      r.carry = true;
    }
    const src = body.replace(/⋯|…/g, '');
    const pm = src.match(/[（(]([^）)]*)[）)]/);
    if (pm) { r.extra = pm[1]; r.term = kinTerm(pm[1]); }

    if (r.carry && !inner) {
      r.kind = 'carry';                     /* 纯「〃」，承前 */
    } else {
      const plain = src.replace(/[（(][^）)]*[）)]/g, '').trim();
      let hit = null;
      for (const nm of names) {
        if (nm === h.name) continue;
        if (plain.indexOf(nm) >= 0) { hit = nm; break; }
      }
      if (/本人/.test(plain)) r.kind = 'self';
      else if (hit) {
        const arr = byName.get(hit);
        const pick = arr.find(x => !claimed.has(x.no)) || arr[0];
        claimed.add(pick.no);
        r.parent = pick.no;
      } else if (!plain && r.cnt) r.kind = 'single';
      else {
        const e = kinExt(src);
        r.ext = e;
        r.kind = (!e.name && /不明/.test(raw)) ? 'unknown'
               : (!e.name && /只有一户/.test(raw)) ? 'single' : 'ext';
      }
    }
    R.set(h.no, r);
    prev = h.no;
  });

  /* 第二遍：定支派。「〃」承前，挂在同支之根，不挂在上一户 */
  const rootCache = new Map();
  function rootNo(no, guard) {
    if (rootCache.has(no)) return rootCache.get(no);
    const r = R.get(no);
    guard = guard || new Set();
    if (guard.has(no)) return no;
    guard.add(no);
    if (r.kind === 'carry' && r.parent == null && r.from) r.parent = rootNo(r.from, guard);
    const out = r.parent != null ? rootNo(r.parent, guard) : no;
    rootCache.set(no, out);
    return out;
  }
  function branchKey(no, guard) {
    const r = R.get(no);
    guard = guard || new Set();
    if (guard.has(no)) return 'h' + no;
    guard.add(no);
    if (r.kind === 'carry' && r.from) return branchKey(r.from, guard);
    if (r.parent != null) return branchKey(r.parent, guard);
    if (r.kind === 'ext' && r.ext) return 'e:' + (r.ext.name || r.ext.place || ('x' + no));
    return 'h' + no;
  }

  const B = new Map();
  /* 承前之户，先定其上级，谱中才有其位 */
  hs.forEach(h => {
    const r = R.get(h.no);
    if (r.kind === 'carry' && r.parent == null && r.from) r.parent = rootNo(r.from);
  });
  hs.forEach(h => {
    const k = branchKey(h.no);
    if (!B.has(k)) B.set(k, { key: k, nodes: [], kids: new Map(), head: null, label: '', place: '', sur: h.surname });
    const br = B.get(k);
    br.nodes.push(h.no);
    if (h.surname) br.sur = h.surname;
  });
  B.forEach(br => {
    if (br.key.charAt(0) === 'e') {
      const first = R.get(br.nodes[0]);
      br.root = '@' + br.key;
      br.head = null;
      br.label = first.ext ? (first.ext.name || first.ext.place || '') : '';
      br.place = first.ext ? first.ext.place : '';
      br.outer = '外村支派';
    } else {
      br.root = rootNo(br.nodes[0]);
      br.head = br.root;
      const hh = DATA.households.find(x => x.no === br.root);
      br.label = hh ? hh.name : '';
      const hr = R.get(br.root);
      br.outer = hr.kind === 'unknown' ? '族属不明' : (hr.kind === 'single' ? '本族只此一户' : '');
    }
  });
  /* 子树 */
  hs.forEach(h => {
    const r = R.get(h.no);
    const br = B.get(branchKey(h.no));
    let p = r.parent;
    if (p == null && r.kind === 'ext') p = '@' + br.key;
    if (p == null) return;                       /* 支根本身，无上级 */
    if (!br.kids.has(p)) br.kids.set(p, []);
    br.kids.get(p).push(h.no);
  });
  /* 族属未载者不入谱 */
  const none = hs.filter(h => R.get(h.no).kind === 'empty').map(h => h.no);
  B.forEach(br => {
    br.nodes = br.nodes.filter(no => R.get(no).kind !== 'empty');
    if (!br.nodes.length) B.delete(br.key);
  });
  return { R, B, none };
}
const KIN = buildKinship();

/* 谱中一画的形制 */
function kinSvg(br) {
  const pos = new Map();
  let leaf = 0;
  (function walk(id, d) {
    const ch = br.kids.get(id) || [];
    if (!ch.length) { pos.set(id, { x: leaf * KIN_SP, y: d * KIN_VP }); leaf++; return; }
    const xs = [];
    ch.forEach(k => { walk(k, d + 1); xs.push(pos.get(k).x); });
    pos.set(id, { x: (Math.min.apply(null, xs) + Math.max.apply(null, xs)) / 2, y: d * KIN_VP });
  })(br.root, 0);

  /* 左右各留margin，免得根枝贴边被裁 */
  const MX = 48, MY = 26;
  pos.forEach(p => { p.x += MX; p.y += MY; });

  const N = new Map();
  br.nodes.forEach(no => {
    const h = DATA.households.find(x => x.no === no);
    N.set(no, { no: no, name: h.name, giv: kinGiven(h.name), sur: h.surname });
  });
  if (br.root.charAt(0) === '@') N.set(br.root, { ext: true, name: br.label, giv: '', sur: br.sur });

  let edges = '';
  br.kids.forEach((kids, pid) => {
    const P = pos.get(pid); if (!P) return;
    kids.forEach(cid => {
      const C = pos.get(cid); if (!C) return;
      const r = KIN.R.get(cid);
      const my = P.y + (C.y - P.y) * .55;
      const dashed = r && r.carry;
      edges += '<path class="kine' + (dashed ? ' dash' : '') + '" d="M' + P.x + ' ' + P.y +
        ' C' + P.x + ' ' + my + ' ' + C.x + ' ' + my + ' ' + C.x + ' ' + C.y + '"/>';
      if (r && r.term) {
        /* 竖直之线，关系字挪到枝旁，免得压住上一辈的名 */
        const steep = Math.abs(P.x - C.x) < 24;
        const lx = steep ? C.x + 21 : (P.x + C.x) / 2;
        const ly = steep ? my + 3 : my - 3;
        edges += '<text class="kinrel" x="' + lx + '" y="' + ly + '" text-anchor="middle">' +
          esc(r.term) + '</text>';
      }
    });
  });

  let nodes = '';
  N.forEach((n, id) => {
    const p = pos.get(id); if (!p) return;
    const c = n.ext ? '#8a8a7a' : (CLANCOLOR[n.sur] || '#8a8a7a');
    if (n.ext) {
      const w = Math.max(94, n.name.length * 13 + 22);
      nodes += '<g class="kinn ext" tabindex="-1"><rect class="kinext" x="' + (p.x - w / 2) + '" y="' + (p.y - 14) +
        '" width="' + w + '" height="28" rx="2"/>' +
        '<text class="kinextt" x="' + p.x + '" y="' + (p.y + 5) + '" text-anchor="middle">' + esc(n.name) + '</text></g>';
      return;
    }
    nodes += '<g class="kinn" data-no="' + n.no + '" role="button" tabindex="0" aria-label="' +
      esc(n.name + '，序' + n.no) + '">' +
      '<circle class="kinc" cx="' + p.x + '" cy="' + p.y + '" r="14" fill="' + c + '" fill-opacity=".16" stroke="' + c + '"/>' +
      '<text class="kint" x="' + p.x + '" y="' + (p.y + 4) + '" text-anchor="middle">' + esc(n.giv) + '</text>' +
      '<text class="kinl" x="' + p.x + '" y="' + (p.y + 30) + '" text-anchor="middle">' + esc(n.name) +
      '<tspan class="kinno"> ' + n.no + '</tspan></text></g>';
  });

  const W = Math.max.apply(null, [...pos.values()].map(p => p.x)) + MX;
  const H = Math.max.apply(null, [...pos.values()].map(p => p.y)) + 42;
  return '<div class="kinvw"><svg class="kinv" viewBox="0 0 ' + W + ' ' + H + '" width="' + W + '" height="' + H + '" ' +
    'role="img" aria-label="' + esc(br.label + '支世系') + '">' + edges + nodes + '</svg></div>';
}

/* 一支的头行与画 */
function kinBranchParts(br) {
  const head = br.head ? DATA.households.find(x => x.no === br.head) : null;
  const cnts = [];
  br.nodes.forEach(no => {
    const c = KIN.R.get(no).cnt;
    if (c && cnts.indexOf(c) < 0) cnts.push(c);
  });
  const cntTxt = cnts.length
    ? (cnts.length > 1 ? '原表两处记法不一：同族' + cnts.join('户／') + '户' : '原表记：同族' + cnts[0] + '户')
    : '';
  const meta = head
    ? (head.job ? head.job : '') + (head.own && head.own !== '—' ? ' · 所有' + head.own + '亩' : '')
    : (br.place ? '外村' + (br.place ? ' · ' + br.place : '') : '');
  const chips = [br.outer, cntTxt].filter(Boolean)
    .map(t => '<span class="gzhc">' + esc(t) + '</span>').join('');
  /* 户少者不另起一画，只列其户，省得小幅大字占地方 */
  const body = br.nodes.length <= 2
    ? '<div class="gzmini">' + br.nodes.map(no => {
        const h = DATA.households.find(x => x.no === no);
        return '<button class="kzchip" data-no="' + no + '">' + esc(h.name) + '<i>' + no + '</i></button>';
      }).join('') + '</div>'
    : kinSvg(br);
  return {
    title: esc(br.label) + ' 支',
    meta: '本村 ' + br.nodes.length + ' 户' + (meta ? ' · ' + esc(meta) : ''),
    chips: chips,
    body: body
  };
}
function kinBranchHtml(br) {
  const p = kinBranchParts(br);
  return '<section class="gzbr" data-fam="' + esc(br.sur) + '">' +
    '<header class="gzh"><b>' + p.title + '</b>' +
    '<span class="gzhx">' + p.meta + '</span>' + p.chips + '</header>' + p.body + '</section>';
}

function kinBodyHtml() {
  const fams = new Map();
  const totals = new Map();
  KIN.B.forEach(br => {
    const s = br.sur || '其他';
    if (!fams.has(s)) { fams.set(s, []); totals.set(s, 0); }
    fams.get(s).push(br);
    totals.set(s, totals.get(s) + br.nodes.length);
  });
  const order = [...fams.keys()].sort((a, b) => totals.get(b) - totals.get(a) || a.localeCompare(b, 'zh'));
  const chips = ['<button class="gzfamc' + (gzKinFam === '*' ? ' on' : '') + '" data-fam="*">全</button>'];
  order.forEach(s => {
    chips.push('<button class="gzfamc' + (gzKinFam === s ? ' on' : '') + '" data-fam="' + esc(s) + '">' +
      esc(s) + ' <i>' + totals.get(s) + '</i></button>');
  });

  const list = order.filter(s => gzKinFam === '*' || s === gzKinFam)
    .map(s => {
      const brs = fams.get(s).sort((a, b) => b.nodes.length - a.nodes.length);
      const dot = '<i style="background:' + (CLANCOLOR[s] || '#8a8a7a') + '"></i>';
      /* 只此一支者，姓与支并作一行，免得层层套头 */
      if (brs.length === 1) {
        const p = kinBranchParts(brs[0]);
        return '<section class="gzfam"><h4>' + dot + esc(s) + ' 姓 · ' + p.title +
          '<span class="gzhx">' + p.meta + '</span>' + p.chips + '</h4>' + p.body + '</section>';
      }
      return '<section class="gzfam"><h4>' + dot + esc(s) + ' 姓 · ' + brs.length + ' 支 · ' +
        totals.get(s) + ' 户</h4>' + brs.map(kinBranchHtml).join('') + '</section>';
    }).join('');

  const none = KIN.none.map(no => {
    const h = DATA.households.find(x => x.no === no);
    return '<button class="kinnone" data-no="' + no + '">' + esc(h.name) + ' <i>' + no + '</i></button>';
  }).join('');

  let branches = 0; KIN.B.forEach(() => { branches++; });

  return '<div class="gznote">归集表「族属」一栏记本户所属的宗支与支派长，同栏以「〃」承前。' +
    '此谱即按行序推「〃」而得，故能见一村之中谁为一支之长、谁系其下。' +
    '虚线者，表中所记只是承前之支，未言父子；实线带字者，原表明记其关系。</div>' +
    '<div class="gztiles"><span><b>' + order.length + '</b>族</span><span><b>' + branches + '</b>支</span>' +
    '<span><b>' + DATA.households.length + '</b>户</span><span><b>' + KIN.none.length + '</b>户族属未载</span></div>' +
    '<div class="gzfamcbar">' + chips.join('') + '</div>' +
    '<div class="gzpick" id="kinPick"><span class="gzph">点谱中任一户，看其身家与族属。</span></div>' +
    list +
    (none ? '<section class="gzfam"><h4><i style="background:#8a8a7a"></i>族属未载 · ' + KIN.none.length + ' 户</h4>' +
      '<div class="gznones">' + none + '</div>' +
      '<p class="gzp">原表此栏或空、或截断，姑存其户，不强系于任何一支。</p></section>' : '');
}

/* 点谱中一户 */
function kinPick(no) {
  const h = DATA.households.find(x => x.no === no);
  const box = $('kinPick');
  if (!h || !box) return;
  const r = KIN.R.get(no);
  const c = CLANCOLOR[h.surname] || '#8a8a7a';
  const bits = [];
  bits.push('序 ' + h.no);
  if (h.job) bits.push(h.job);
  if (h.age) bits.push(h.age + '岁');
  if (h.members) bits.push(h.members + '口');
  if (h.own && h.own !== '—') bits.push('所有 ' + h.own + '亩');
  if (h.rent && h.rent !== '—') bits.push('租入 ' + h.rent + '亩');
  if (h.out) bits.push('外出 ' + h.out);
  box.innerHTML = '<div class="gzpav" style="--c:' + c + '">' + esc(h.surname) + '</div>' +
    '<div class="gzpkt"><b>' + esc(h.name) + '</b><span>' + esc(bits.join('　·　')) + '</span>' +
    '<span class="gzpkr">族属栏：' + esc(r.raw || '（空）') + (r.term ? '　关系：' + esc(r.term) : '') + '</span></div>' +
    '<button class="hb" onclick="openPerson(\'' + h.no + '\')">开此户</button>';

  /* 谱上点住处，与之相涉者留，其余淡去 */
  const near = new Set([no]);
  KIN.B.forEach(br => {
    br.kids.forEach((kids, pid) => {
      if (pid === no) kids.forEach(k => near.add(k));
      if (kids.indexOf(no) >= 0) near.add(pid);
    });
  });
  document.querySelectorAll('.kinn[data-no]').forEach(n => {
    const on = near.has(n.dataset.no);
    n.classList.toggle('sel', n.dataset.no === no);
    n.classList.toggle('rel', on && n.dataset.no !== no);
    n.classList.toggle('far', !on);
  });
  document.querySelectorAll('.kinnone, .kzchip').forEach(n => {
    n.classList.toggle('sel', n.dataset.no === no);
  });
}

function gzBodyHtml() {
  if (gzTab === 'econ') return gzEconBody();
  if (gzTab === 'back') return gzBackBody();
  if (gzTab === 'kin') return kinBodyHtml();
  return gzCalBody();
}
function renderGzBody() {
  const el = $('gzBody');
  if (el) el.innerHTML = gzBodyHtml();
}
function setGzTab(k) {
  gzTab = k;
  document.querySelectorAll('.gztab').forEach(x => x.classList.toggle('on', x.dataset.k === k));
  renderGzBody();
  $('sheet').scrollTop = 0;
}
function openGazetteer(tab) {
  if (tab) gzTab = tab;
  const tabs = GZ_TABS.map(t =>
    '<button class="gztab' + (gzTab === t.k ? ' on' : '') + '" data-k="' + t.k + '" ' +
    'onclick="setGzTab(\'' + t.k + '\')">' + t.label + '</button>').join('');
  /* 弹层内容随 startViewTransition 延后写入，故正文须先算好一并带上 */
  openModal(
    '<div class="ptitle">村 志 · 归 集 表 别 卷</div>' +
    '<div class="gzfanli"><b>凡 例</b>' +
    '<ol>' +
    '<li>四卷皆据《沙井村72户人物信息归集表》照录，未作改写；数字为原文所载，未作换算。</li>' +
    '<li>原表转录存疑或中截之处，页上以【】标出，一仍其旧，不作修补。</li>' +
    '<li>归集表只记户别、族属、时令、经济诸端，不载问答原话，故此四卷所录皆为表格之文。</li>' +
    '<li>舆图上的村款、人望、矛盾三项，与岁末结算，是为便于推演而设的刻度，原文并无此三数。</li>' +
    '<li>岁内案卷的结局、村落之处的对白，亦属推演，与原文分别标明，不相混同。</li>' +
    '<li>单位（亩、吊、元）照录；原表之亩与今公制亩未必一致，跨表相加前须先统一口径。</li>' +
    '</ol></div>' +
    '<div class="gztabs">' + tabs + '</div>' +
    '<div class="gzbody" id="gzBody">' + gzBodyHtml() + '</div>' +
    '<div class="foot">族属谱一卷依原表「族属」栏推解而得，其支派归属与关系词皆照录，' +
    '原表记作「〃」者只作同支论，不代为断定父子。</div>' +
    '<div class="actions"><button class="hb primary" onclick="closeModal()">闭 卷</button></div>',
    true
  );
}

/* ============================================================
   走动的人
   ------------------------------------------------------------
   按地名索引，不按下标。data.js 是归档源，不能加字段；
   而 DATA.places 一旦重排，按下标取人会静默换错人，而且不报错。
   ============================================================ */
const PLACE_ID = {};
DATA.places.forEach((p, i) => { PLACE_ID[normName(p.name)] = i; });
/* 五处地点各自的当事人 */
const PLACE_P_BY_NAME = { '村庙': '1', '白河': '1', '公会地': '53', '村小学校': '49', '谷场': '52' };
/* 十二个月的承办人：谁，在哪里 */
const MONTH_ACTOR_BY_NAME = {
  1: { who: '39', at: '村庙' }, 2: { who: '53', at: '公会地' },
  3: { who: '32', at: '村庙' }, 4: { who: '49', at: '公会地' },
  5: { who: '1', at: '村庙' }, 6: { who: '1', at: '白河' },
  7: { who: '1', at: '村庙' }, 8: { who: '39', at: '公会地' },
  9: { who: '1', at: '村庙' }, 10: { who: '4', at: '村庙' },
  11: { who: '49', at: '村小学校' }, 12: { who: '3', at: '村庙' }
};
function placeWho(name) { return PLACE_P_BY_NAME[normName(name)] || null; }

/* 收回正在赶路的人 */
function clearActor() {
  World.entities.forEach(e => {
    if (!e.walkingTo) return;
    e.walkingTo = null;
    if (e.el) e.el.classList.remove('walking');
    if (e.bubbleEl) { if (e.bubbleEl.parentNode) e.bubbleEl.parentNode.removeChild(e.bubbleEl); e.bubbleEl = null; }
  });
}
/* 让某户从家门口走到某处去，边走边说话 */
function walkTo(no, placeName, text) {
  const h = DATA.households.find(x => x.no === String(no));
  const e = World.byId.get('v:' + no);
  const p = placePos(placeName);
  if (!h || !e || !p) return;
  spawnPerson(no);
  clearActor();
  World.walkEntity(e, p.x, p.y + 34, {
    ms: 2100,
    bubble: '<b>' + esc(h.name) + '</b><br>' + esc(text || '')
  });
}
/* 浮字：村款、人望、矛盾的增减，浮在地点上 */
function showFx(placeName, txt) {
  if (!txt) return;
  const p = placePos(placeName);
  const L = $('figLayer');
  if (!p || !L) return;
  const d = document.createElement('div');
  d.className = 'fx';
  d.textContent = txt;
  d.style.left = p.x + 'px';
  d.style.top = (p.y - 46) + 'px';
  L.appendChild(d);
  setTimeout(() => { if (d.parentNode) d.remove(); }, 1800);
}
function monthActor() {
  if (S.done || S.dec[S.month]) return;
  const ev = curEvent(); if (!ev) return;
  const a = MONTH_ACTOR_BY_NAME[S.month]; if (!a) return;
  const t = ev.name.length > 14 ? ev.name.slice(0, 14) + '…' : ev.name;
  clearActor();
  setTimeout(() => walkTo(a.who, a.at, t), 300);
}

/* ============================================================
   地标
   ------------------------------------------------------------
   原来这一带是图外的一排按钮：村志、户册、过月、案卷。
   现在各归其位：
     村庙    村志（岁时录 · 悬案牍）
     村小学校 族属谱
     白 河   经济志
     公会地  本月案卷
     谷 场   过月
   ============================================================ */
const PLACE_ACTS = {
  '村庙': [['村志 · 岁时录', () => openGazetteer('cal')], ['村志 · 悬案牍', () => openGazetteer('back')]],
  '村小学校': [['族属谱', () => openGazetteer('kin')]],
  '白河': [['经济志', () => openGazetteer('econ')]],
  '公会地': [['本月案卷', () => openCasePanel()]],
  '谷场': [['过月', () => openYardPanel()]]
};
/* 村中器物：各有各的用处，走近了按 E 才看得见 */
const PROP_TEXT = {
  well: '井水不浑，四时不涸。村名沙井，即以此井得名。',
  mill: '碾米声从碾房传来。青苗钱分麦秋、大秋两季征收，开会分配。',
  granary: '今年的仓储在此，开春要放种，秋后要入粮。',
  oldtree: '村口这棵老槐，少说也有三百年。树下常有闲话。',
  bridge: '桥下水声比上月急。白河泛滥，八家十七间房倒塌。',
  stele: '村界所在。出了界碑，就不是沙井了。',
  stage: '村庙五会之一，社戏在此。',
  waterwheel: '春米的声音从河那边传来。'
};
function openPlaceByName(key) {
  /* 公会地与谷场是「做事」的地方：走近按 E 直接开那件事，
     不再多一层地点面板。其余三处是「看档」的地方，
     面板里摆着原文与通往村志的入口。 */
  if (key === '公会地') return openCasePanel();
  if (key === '谷场') return openYardPanel();
  const src = DATA.places.find(d => normName(d.name) === key);
  if (!src) return;
  const who = placeWho(key);
  const h = who ? DATA.households.find(x => x.no === who) : null;
  const acts = PLACE_ACTS[key] || [];
  openModal(
    '<div class="ptitle">村 落 之 处 · ' + esc(key) + '</div>' +
    '<div class="phead"><div class="pav glyph">' + (ICON[src.icon] || ICON.temple) + '</div>' +
    '<div><h3 class="pname">' + esc(key) + '</h3>' +
    '<div class="pmeta">' + (h ? '当事人 ' + esc(h.name) + '　·　' + esc(h.job || '职业未载') : '村落之处') + '</div></div></div>' +
    '<div class="blk" style="margin-top:14px"><h4>原 文</h4>' +
    src.lines.map(l => '<p style="margin-bottom:6px">' + esc(l) + '</p>').join('') + '</div>' +
    (acts.length
      ? '<div class="placeacts">' + acts.map((a, i) =>
          '<button class="hb' + (i === 0 ? ' primary' : '') + '" data-act="' + i + '">' + esc(a[0]) + '</button>').join('') + '</div>'
      : '') +
    '<div class="foot">原文出自《归集表》节气时间历与经济参数表；地点位置由舆图识别而定。</div>' +
    '<div class="actions"><button class="hb" onclick="closeModal()">闭 卷</button></div>',
    false,
    { after: sheet => {
        sheet.querySelectorAll('.placeacts .hb').forEach(b => {
          b.addEventListener('click', () => {
            const a = acts[+b.dataset.act];
            if (a && a[1]) a[1]();
          });
        });
      } }
  );
}
/* 地点原文：面板顶上要留着出处 */
function placeLines(key) {
  const src = DATA.places.find(d => normName(d.name) === key);
  if (!src) return '';
  return '<div class="blk" style="margin-top:12px"><h4>原 文</h4>' +
    src.lines.map(l => '<p style="margin-bottom:6px">' + esc(l) + '</p>').join('') + '</div>';
}
/* 本月案卷：搬进公会地的那一张 */
function openCasePanel() {
  const ev = curEvent();
  openModal(
    '<div class="ptitle">本 月 案 卷</div>' +
    '<div class="phead"><div class="pav glyph">' + ICON.case + '</div>' +
    '<div><h3 class="pname">' + (ev ? esc(ev.name) : '本月无事') + '</h3>' +
    '<div class="pmeta">' + (ev ? esc(ev.type) + '　·　' + (S.dec[S.month] ? '已结' : '未结') : '归集表于此月无所载案卷') + '</div></div></div>' +
    placeLines('公会地') +
    caseCardHtml() +
    '<div class="foot">抉择关乎村款、人望与乡里嫌隙；岁末结算，验其成效。</div>' +
    '<div class="actions"><button class="hb" onclick="closeModal()">闭 卷</button></div>',
    false,
    { after: sheet => bindCaseCard(sheet) }
  );
}
/* 过月：搬进谷场的那一个。门槛与从前一样：案卷未结不能过月。 */
function openYardPanel() {
  const ev = curEvent();
  const ok = !ev || S.dec[S.month];
  const d = S.dec[S.month];
  openModal(
    '<div class="ptitle">谷 场</div>' +
    '<div class="phead"><div class="pav glyph">' + ICON.yard + '</div>' +
    '<div><h3 class="pname">' + (S.done ? '岁 末 已 结' : '过 月') + '</h3>' +
    '<div class="pmeta">' + (ok ? (ev ? '本月案卷已结' : '本月无事') : '本月案卷未结') + '</div></div></div>' +
    (d ? '<div class="blk"><h4>本 月 所 结</h4><p>' + esc(d.t) + '</p>' +
      '<p style="color:var(--ink-3);font-size:10.5px;margin-top:4px">' + esc(d.fx) + '　·　' + esc(d.bs) + '</p></div>' : '') +
    placeLines('谷场') +
    '<div class="foot">案卷未结不能过月：先往公会地议定本月之事。</div>' +
    '<div class="actions">' +
      (ok && !S.done ? '<button class="hb primary" onclick="closeModal();passMonth()">过 月</button>' : '') +
      '<button class="hb" onclick="closeModal()">闭 卷</button></div>'
  );
}
/* 器物 */
function openProp(pr) {
  const txt = PROP_TEXT[pr.id] || pr.name + '。';
  openModal(
    '<div class="ptitle">村 中 器 物</div>' +
    '<div class="phead"><div class="pav glyph">' + ICON.water + '</div>' +
    '<div><h3 class="pname">' + esc(pr.name) + '</h3>' +
    '<div class="pmeta">走近了才看得清的东西</div></div></div>' +
    '<div class="blk" style="margin-top:14px"><p class="propline">' + esc(txt) +
    '<span class="sm">此节为推演：器物之名为示意，原表未载其形。</span></p></div>' +
    '<div class="actions"><button class="hb" onclick="closeModal()">闭 卷</button></div>'
  );
}

/* ============================================================
   重开一年的问询
   ============================================================ */
function askReset() {
  openModal(
    '<div class="ptitle">重 开 一 年</div>' +
    '<div class="phead"><div class="pav glyph">' + ICON.case + '</div>' +
    '<div><h3 class="pname">重开此年</h3>' +
    '<div class="pmeta">本月所结诸案一并撤去，认识的邻居还认得</div></div></div>' +
    '<div class="blk" style="margin-top:15px"><p>' +
    '村款、人望、矛盾三项复至年初之数，第 ' + S.year + ' 年所记不再存留。' +
    '</p></div>' +
    '<div class="actions">' +
      '<button class="hb primary" onclick="closeModal()">再 想 想</button>' +
      '<button class="hb" onclick="openPickSheet(1)">另 择 一 人</button>' +
      '<button class="hb" onclick="resetYear(1)">果 然 重 开</button></div>'
  );
}

/* ============================================================
   岁末结算
   ============================================================ */
function showEnd() {
  const mt = S.money >= 170 ? '村款有余' : (S.money >= 95 ? '村款勉敷支用' : '村款见绌');
  const rt = S.rep >= 65 ? '人望在众' : (S.rep >= 42 ? '人望平平' : '人望低落');
  const ct = S.clash <= 42 ? '乡里少有嫌隙' : (S.clash <= 70 ? '嫌隙已生' : '讼事丛生');
  const ok = (S.money >= 170) + (S.rep >= 65) + (S.clash <= 42);
  const title = ok === 3 ? '村 务 有 成' : (ok === 0 || S.rep < 35 ? '支 离 困 顿' : '勉 力 维 持');
  const rec = Object.keys(S.dec).sort((a, b) => a - b).map(k => '<span>' + MN[k - 1] + ' · ' + esc(S.dec[k].t) + '</span>').join('');
  openModal(
    '<div class="endbanner"><img src="assets/shajing/village.jpg" alt=""></div>' +
    '<div class="endk">沙 井 村 · 岁 末 结 算</div>' +
    '<h2 class="endh">' + title + '</h2>' +
    '<div class="endsub">' + mt + '，' + rt + '，' + ct + '</div>' +
    '<div class="tiles">' +
      '<div class="tile"><span>村 款</span><b>' + Math.round(S.money) + '<i>元</i></b></div>' +
      '<div class="tile"><span>人 望</span><b>' + Math.round(S.rep) + '<i>/100</i></b></div>' +
      '<div class="tile"><span>矛 盾</span><b>' + Math.round(S.clash) + '<i>/100</i></b></div>' +
      '<div class="tile"><span>案 卷</span><b>' + Object.keys(S.dec).length + '<i>结</i></b></div></div>' +
    '<div class="endl">本年处置<div class="enlist">' + (rec || '<span>无一案可结</span>') + '</div></div>' +
    '<div class="foot">结语与数值为推演设定：史料未载沙井村的年度总结局；人物、事件、数额皆照原文，未加虚构。</div>' +
    '<div class="actions"><button class="hb primary" onclick="resetYear(S.year + 1)">再 推 一 年</button>' +
    '<button class="hb" onclick="closeModal()">留 此 结 算</button></div>'
  );
}
function resetYear(year) {
  S.year = year || 1; S.month = 1; S.money = 100; S.rep = 50; S.clash = 30;
  S.dec = {}; S.done = false; S.sel = null;
  S.prev = { money: 100, rep: 50, clash: 30 };
  closeModal(); clearActor(); renderAll(); monthActor(); saveGame();
}

/* ============================================================
   天气粒子
   ============================================================ */
const cv = $('weather'), ctx = cv.getContext('2d');
let parts = [], wxKind = 'petal';
function sizeCanvas() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = cv.clientWidth, h = cv.clientHeight;
  cv.width = Math.max(1, w * dpr); cv.height = Math.max(1, h * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
function makeParticle(k) {
  const w = cv.clientWidth, h = cv.clientHeight;
  const p = { x: Math.random() * w, y: Math.random() * h, r: 2 + Math.random() * 3, a: Math.random() * Math.PI * 2, va: (Math.random() - .5) * .04, ph: Math.random() * Math.PI * 2, sp: Math.random() };
  if (k === 'petal') { p.y = -20; p.vx = .35 + Math.random() * .5; p.vy = .18 + Math.random() * .3; p.r = 2.4 + Math.random() * 2.6; }
  if (k === 'leaf')  { p.y = -24; p.vx = .5 + Math.random() * .7; p.vy = .5 + Math.random() * .8; p.r = 3 + Math.random() * 3.4; }
  if (k === 'snow')  { p.y = -20; p.vx = .18 + Math.random() * .3; p.vy = .35 + Math.random() * .5; p.r = 1.2 + Math.random() * 2.2; }
  if (k === 'firefly') { p.vx = (Math.random() - .5) * .25; p.vy = (Math.random() - .5) * .2; p.r = 1.3 + Math.random() * 1.1; }
  return p;
}
function initWeather(kind) {
  wxKind = kind;
  const n = kind === 'snow' ? 58 : kind === 'firefly' ? 24 : kind === 'leaf' ? 26 : 32;
  parts = Array.from({ length: n }, () => makeParticle(kind));
}
function drawWeather() {
  const w = cv.clientWidth, h = cv.clientHeight;
  ctx.clearRect(0, 0, w, h);
  const t = performance.now() / 1000;
  for (const p of parts) {
    p.ph += .02;
    if (wxKind === 'firefly') {
      const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 7);
      const al = .18 + .3 * (0.5 + 0.5 * Math.sin(p.ph * 1.6));
      g.addColorStop(0, 'rgba(226,188,86,' + al.toFixed(3) + ')');
      g.addColorStop(1, 'rgba(226,188,86,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r * 7, 0, 6.2832); ctx.fill();
      ctx.fillStyle = 'rgba(240,214,140,' + (al * 1.6).toFixed(3) + ')';
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r * .8, 0, 6.2832); ctx.fill();
      p.x += p.vx + Math.sin(p.ph) * .12; p.y += p.vy + Math.cos(p.ph * .8) * .1;
      if (p.x < -20) p.x = w + 20; if (p.x > w + 20) p.x = -20;
      if (p.y < -20) p.y = h + 20; if (p.y > h + 20) p.y = -20;
    } else if (wxKind === 'petal') {
      p.a += p.va;
      p.x += p.vx + Math.sin(p.ph) * .5; p.y += p.vy;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.a);
      ctx.fillStyle = 'rgba(238,196,204,.72)';
      ctx.beginPath(); ctx.ellipse(0, 0, p.r, p.r * .55, 0, 0, 6.2832); ctx.fill();
      ctx.restore();
      if (p.y > h + 24) { p.y = -20; p.x = Math.random() * w; }
      if (p.x > w + 20) p.x = -20;
    } else if (wxKind === 'leaf') {
      p.a += p.va * 2.4;
      p.x += p.vx * (0.6 + Math.abs(Math.cos(p.a)));
      p.y += p.vy;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.a);
      ctx.fillStyle = p.sp > .5 ? 'rgba(160,92,44,.62)' : 'rgba(190,140,62,.6)';
      ctx.beginPath(); ctx.ellipse(0, 0, p.r, p.r * .42, 0, 0, 6.2832); ctx.fill();
      ctx.restore();
      if (p.y > h + 24) { p.y = -24; p.x = Math.random() * w; }
      if (p.x > w + 20) p.x = -20;
    } else {
      p.x += p.vx + Math.sin(p.ph + p.y * .01) * .35; p.y += p.vy;
      ctx.fillStyle = 'rgba(255,255,255,' + (.5 + p.sp * .35).toFixed(2) + ')';
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.2832); ctx.fill();
      if (p.y > h + 24) { p.y = -20; p.x = Math.random() * w; }
      if (p.x > w + 20) p.x = -20;
    }
  }
  /* 帧循环交给 world.js 那一条：全局只留一个 rAF，
     省下的这一条正好留给相机与粒子。 */
}
function startWeather() {
  sizeCanvas();
  initWeather(SEASONS[seasonOf(S.month)].w);
  if (REDUCE) ctx.clearRect(0, 0, cv.clientWidth, cv.clientHeight);
}

/* ============================================================
   提示
   ============================================================ */
function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('on');
  clearTimeout(t._h);
  t._h = setTimeout(() => t.classList.remove('on'), 1900);
}

/* ============================================================
   择人：主角是谁
   ------------------------------------------------------------
   十六个候选是随立绘一起备下的；选了谁，谁就成了你，
   站在自己家门口，其余七十一户都是村里人。
   ============================================================ */
const POOL = (SITE.chars || [])
  .map(no => DATA.households.find(h => h.no === String(no)))
  .filter(Boolean);
let pickCur = POOL.length ? POOL[0] : null;

function pickDetailHtml(h) {
  if (!h) return '<p style="color:var(--ink-3)">无候选</p>';
  const pf = portraitSrc(h.no);
  return (pf ? '<img class="figbig" src="' + pf + '" alt="" onerror="this.remove()">' : '') +
    '<h3>' + esc(h.name) + '</h3>' +
    '<div class="big">' + esc(h.job || '职业未载') + '　·　' + esc(clanOf(h)) + '氏' +
      (isFormal(h) ? '　·　村中要户' : '') + '</div>' +
    '<dl>' +
      '<dt>年 龄</dt><dd>' + esc(nz(h.age, '')) + ' 岁</dd>' +
      '<dt>家 口</dt><dd>' + esc(nz(h.members, '')) + ' 人</dd>' +
      '<dt>劳 力</dt><dd>' + esc(nz(h.labor, '')) + '</dd>' +
      '<dt>所 有</dt><dd>' + esc(nz(h.own, '')) + (h.own ? ' 亩' : '') + '</dd>' +
      '<dt>经 营</dt><dd>' + esc(nz(h.manage, '')) + (h.manage ? ' 亩' : '') + '</dd>' +
      '<dt>族 属</dt><dd>' + esc(h.clan || '—') + '</dd>' +
    '</dl>' +
    (h.trait ? '<p style="margin-bottom:8px"><b style="color:var(--ink-3)">性 格</b>　' +
      esc(h.trait.split('；')[0]) + '</p>' : '') +
    (h.note ? '<div class="note">原表备注：' + esc(h.note) + '</div>' : '') +
    '<div class="note">其像为拟，非史实：立绘由模型生成，只求形貌意趣之似，不作肖像考订。</div>';
}

function openPickSheet() {
  if (!POOL.length) { toast('尚无立绘可选'); return; }
  pickCur = POOL[0];
  const cards = POOL.map(h => {
    const pf = portraitSrc(h.no);
    return '<div class="pcard on" data-no="' + h.no + '">' +
      (pf ? '<img src="' + pf + '" alt="" onerror="this.remove()">' : '<span class="ent-silh"></span>') +
      '<span class="nm">' + esc(h.name) + '</span>' +
      '<span class="jb">' + esc(h.job || '农') + '</span></div>';
  }).join('');
  openModal(
    '<div class="ptitle">择 人</div>' +
    '<div class="pickwrap"><div class="picklist">' + cards + '</div>' +
    '<div class="pickdetail" id="pickDetail">' + pickDetailHtml(pickCur) + '</div></div>' +
    '<div class="foot">七十二户都在这村里。择一人作主角，其余皆为邻里。</div>' +
    '<div class="actions">' +
      '<button class="hb" onclick="closeModal()">闭 卷</button>' +
      '<button class="hb primary" id="pickGo">就 此 入 村</button></div>',
    true,
    { after: sheet => {
        sheet.querySelectorAll('.pcard').forEach(c => {
          c.addEventListener('click', () => {
            sheet.querySelectorAll('.pcard').forEach(x => x.classList.remove('on'));
            c.classList.add('on');
            pickCur = DATA.households.find(h => h.no === c.dataset.no) || pickCur;
            const d = sheet.querySelector('#pickDetail');
            if (d) d.innerHTML = pickDetailHtml(pickCur);
          });
        });
        const go = sheet.querySelector('#pickGo');
        if (go) go.addEventListener('click', () => {
          if (!pickCur) { toast('先择一人'); return; }
          setPlayer(pickCur.no);
          closeModal();
          toast('你是 ' + pickCur.name + '。走遍村子去吧。');
        });
      } }
  );
}

/* 主角就是你：走到谁家门口，谁就是谁 */
function setPlayer(no) {
  no = String(no);
  const old = S.player;
  if (old && old !== no) {
    const oe = World.byId.get('v:' + old);
    if (oe) World.removeEntity(oe);
  }
  S.player = no;
  S.met.add(no);
  const p = housePos(no);
  World.setPlayer(no, p ? p.x : 100, p ? p.y : 100, portraitSrc(no));
  const pl = World.player;
  if (pl && pl.el) {
    const hh = DATA.households.find(x => x.no === no);
    /* 单文件版没有立绘，主角也得有个影子可认 */
    if (!pl.el.querySelector('.ent-portrait') && hh) silhouette(pl.el, hh);
    if (!pl.el.querySelector('.ent-seal')) {
      const seal = document.createElement('i');
      seal.className = 'ent-seal';
      seal.textContent = '我';
      pl.el.appendChild(seal);
    }
  }
  renderDlist(false);
  saveGame();
}

/* ============================================================
   寻人
   ============================================================ */
function toggleFind() {
  const d = $('drawer');
  if (!d) return;
  const off = d.classList.toggle('off');
  const b = $('btnFind');
  if (b) b.classList.toggle('on', !off);
  if (!off) { const q = $('q'); if (q) q.focus(); }
}
/* 寻人：镜头推过去，人高亮一下。想看他的户册，走近了按 E。 */
function focusHousehold(no) {
  const p = housePos(no);
  if (!p) return;
  World.lookAt(p.x, p.y);
  const e = World.byId.get('v:' + no);
  if (e && e.el) {
    e.el.classList.add('sel');
    clearTimeout(e._selT);
    e._selT = setTimeout(() => e.el.classList.remove('sel'), 2800);
  }
  const d = $('drawer');
  if (d && !d.classList.contains('off') && MOBILE()) toggleFind();
}

/* ============================================================
   存档
   ------------------------------------------------------------
   file:// 下 localStorage 可能抛 SecurityError，包起来：
   存不上也照玩，不至于打断开局。
   ============================================================ */
const SAVE_KEY = 'shajing.save.v1';
function saveGame() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      v: 1, year: S.year, month: S.month, money: S.money, rep: S.rep, clash: S.clash,
      dec: S.dec, done: S.done, player: S.player, met: [...S.met]
    }));
  } catch (e) { /* 存不上也就算了 */ }
}
function loadGame() {
  try { return JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'); }
  catch (e) { return null; }
}
function applySave(d) {
  if (!d) return false;
  S.year = d.year || 1; S.month = d.month || 1;
  S.money = d.money; S.rep = d.rep; S.clash = d.clash;
  S.dec = d.dec || {}; S.done = !!d.done;
  S.met = new Set(d.met || []);
  S.prev = { money: S.money, rep: S.rep, clash: S.clash };
  return true;
}

/* ============================================================
   缩略舆图
   ============================================================ */
/* 缩略图用的底图：直接借页面里那张舆图，省一次请求，
   单文件版里它就是总览。 */
const miniImg = $('plate');
let miniT = 0;
function renderMinimap() {
  const cv = $('minimap'); if (!cv) return;
  const g = cv.getContext('2d');
  const W = cv.width, H = cv.height;
  g.clearRect(0, 0, W, H);
  g.fillStyle = '#f6eed9'; g.fillRect(0, 0, W, H);
  if (miniImg.complete && miniImg.naturalWidth) {
    try { g.drawImage(miniImg, 0, 0, W, H); } catch (e) { /* 还没解码好 */ }
  }
  const sx = W / SITE.world.w, sy = H / SITE.world.h;
  g.fillStyle = 'rgba(30,26,18,.42)';
  (SITE.houses || []).forEach(h => { g.fillRect(h.x * sx - 1, h.y * sy - 1, 2, 2); });
  (SITE.places || []).forEach(p => {
    g.fillStyle = '#a5311d';
    g.fillRect(p.x * sx - 2, p.y * sy - 2, 4, 4);
  });
  const pl = World.player;
  if (pl) {
    g.beginPath(); g.arc(pl.x * sx, pl.y * sy, 4.2, 0, 6.2832);
    g.fillStyle = '#a5311d'; g.fill();
    g.strokeStyle = '#f6eed9'; g.lineWidth = 1.6; g.stroke();
  }
}

/* ============================================================
   渲染汇总
   ============================================================ */
function renderAll() {
  paintSeason(); renderHud(); renderAlmanac(); renderPlaces(); renderHouses();
  renderChips(); renderDlist(); updateCaseState();
}

/* ============================================================
   世界回调：引擎只管「走近了」，说什么、做什么由这里定
   ============================================================ */
World.hooks.describe = function (e) {
  if (e.kind === 'villager') {
    const h = e.house;
    if (!h) return null;
    return '与 <b>' + esc(h.name) + '</b> 说话　〔E〕';
  }
  if (e.kind === 'place') {
    const acts = PLACE_ACTS[e.name] || [];
    const st = e.state ? '　（' + esc(e.state) + '）' : '';
    return (acts.length ? esc(acts[0][0]) : '看看这里') + st + '　〔E〕';
  }
  if (e.kind === 'prop') return '看 <b>' + esc(e.name) + '</b>　〔E〕';
  return null;
};
World.hooks.interact = function (e) {
  if (e.kind === 'villager') openPerson(e.no);
  else if (e.kind === 'place') openPlaceByName(e.name);
  else if (e.kind === 'prop') openProp(e.data);
};
World.hooks.blocked = function () { toast('过不去'); };

/* ============================================================
   绑定
   ============================================================ */
on('btnFind', 'click', toggleFind);
on('btnReset', 'click', askReset);
on('q', 'input', e => { S.filt.q = e.target.value; renderDlist(false); });
on('modal', 'click', e => { if (e.target.id === 'modal') closeModal(); });
on('lgToggle', 'click', () => {
  const w = $('lgToggle') && $('lgToggle').closest('.lgwrap');
  if (w) w.classList.toggle('closed');
});
on('btnZoomIn', 'click', () => World.zoomBy(1));
on('btnZoomOut', 'click', () => World.zoomBy(-1));
on('btnClan', 'click', toggleFind);
on('minimap', 'click', e => {
  const cv = $('minimap'); if (!cv) return;
  const r = cv.getBoundingClientRect();
  const wx = (e.clientX - r.left) / r.width * SITE.world.w;
  const wy = (e.clientY - r.top) / r.height * SITE.world.h;
  World.lookAt(wx, wy);
});
/* 村志中的人名按钮：开其户册 */
document.addEventListener('click', e => {
  const b = e.target.closest && e.target.closest('.gnm');
  if (!b) return;
  e.preventDefault();
  openPerson(b.dataset.no);
});
/* 族属谱：点节点看该户；点姓氏筛看 */
document.addEventListener('click', e => {
  const chip = e.target.closest && e.target.closest('.gzfamc');
  if (chip) {
    gzKinFam = chip.dataset.fam;
    renderGzBody();
    return;
  }
  const n = e.target.closest && e.target.closest('.kinn[data-no], .kinnone[data-no], .kzchip[data-no]');
  if (!n) return;
  e.preventDefault();
  kinPick(n.dataset.no);
});
document.addEventListener('keydown', e => {
  const n = e.target.closest && e.target.closest('.kinn[data-no]');
  if (!n) return;
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); kinPick(n.dataset.no); }
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { closeModal(); closeFindIfOpen(); return; }
  if (e.key === 'm' || e.key === 'M') {
    const tag = (e.target && e.target.tagName) || '';
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    if ($('modal').classList.contains('on')) return;
    toggleFind();
    return;
  }
  /* 弹层内锁住 Tab 焦点 */
  if (e.key !== 'Tab') return;
  const sheet = $('sheet');
  if (!sheet || !$('modal').classList.contains('on')) return;
  const f = sheet.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
  if (!f.length) return;
  const first = f[0], last = f[f.length - 1];
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
});
function closeFindIfOpen() {
  const d = $('drawer');
  if (d && !d.classList.contains('off')) toggleFind();
}

window.addEventListener('resize', () => {
  sizeCanvas();
  if (MOBILE()) { const d = $('drawer'); if (d) d.classList.add('off'); }
});
window.addEventListener('pagehide', saveGame);
document.addEventListener('visibilitychange', () => { if (document.hidden) saveGame(); });

/* 幕 */
(function () {
  const title = '沙井村';
  $('bootTitle').innerHTML = title.split('').map((c, i) => '<span style="--i:' + i + '">' + c + '</span>').join('');
  const away = () => {
    $('boot').classList.add('away');
    setTimeout(() => { $('boot').style.display = 'none'; }, 950);
  };
  /* 新开局：先择人 */
  const go = () => {
    if ($('boot').classList.contains('away')) return;
    away();
    setTimeout(() => openPickSheet(), 620);
  };
  /* 续前月：有存档才亮出来 */
  const cont = () => {
    if ($('boot').classList.contains('away')) return;
    const d = loadGame();
    if (!d) { toast('没有存档'); return; }
    applySave(d);
    away();
    setTimeout(() => {
      renderAll();
      if (d.player) {
        setPlayer(d.player);
        toast('续前：第 ' + S.year + ' 年 ' + MN[(d.month || 1) - 1]);
      } else {
        openPickSheet();
      }
    }, 620);
  };
  $('bootGo').addEventListener('click', go);
  on('bootCont', 'click', cont);
  document.addEventListener('keydown', e => { if (e.key === 'Enter' && !$('boot').classList.contains('away')) go(); });
  const saved = loadGame();
  if (saved) {
    const b = $('bootCont');
    if (b) {
      b.hidden = false;
      b.textContent = '续 前 月（' + (saved.year || 1) + ' 年 ' + MN[(saved.month || 1) - 1] + '）';
    }
  }
})();

/* ============================================================
   启动
   ============================================================ */
buildDial();
if (!World.init()) { console.error('[world] 没找到世界容器'); }
renderAll();
paintSeason();
sizeCanvas();
if (MOBILE()) { const d = $('drawer'); if (d) d.classList.add('off'); }
requestAnimationFrame(() => { sizeCanvas(); startWeather(); });
setTimeout(() => startWeather(), 60);
/* 相机先落在村子中间，等择人来定 */
{
  const c = World.cam;
  World.lookAt(SITE.world.w * 0.52, SITE.world.h * 0.52, true);
  c.x = c.tx; c.y = c.ty;
}
/* 天气与缩略图都挂在世界那条帧循环上：全局只一条 rAF */
World.onTick = function (dt) {
  if (!REDUCE) drawWeather();
  miniT += dt;
  if (miniT > 0.2) { miniT = 0; renderMinimap(); }
};
/* 铺图提示：一会儿就收 */
setTimeout(() => {
  const t = $('worldTip');
  if (t) t.classList.add('off');
}, 2600);

/* 季节变化时重启粒子 */
let lastSeason = seasonOf(S.month);
setInterval(() => {
  const s = seasonOf(S.month);
  if (s !== lastSeason) { lastSeason = s; initWeather(SEASONS[s].w); }
}, 1000);
