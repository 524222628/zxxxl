const app = document.querySelector('#app');
const editorDialog = document.querySelector('#editor-dialog');
const blockDialog = document.querySelector('#block-dialog');
const historyDialog = document.querySelector('#history-dialog');
const toast = document.querySelector('#toast');
const sessionKey = 'kansai-editor-session';
let state = { data: null, session: null, editingId: null, dragId: null, selectedBlockId: null };

const escapeHtml = (value = '') => String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
const statusClass = (status) => status === '已确认' ? 'confirmed' : status === '备选' || status === '取消' ? 'option' : 'check';
const formatDate = (date) => new Intl.DateTimeFormat('zh-CN', { month: 'short', day: 'numeric' }).format(new Date(`${date}T12:00:00`));
const daySymbols = Object.freeze({
  'day-1': '🚌',
  'day-2': '🎢',
  'day-3': '🗼',
  'day-4': '🦌',
  'day-5': '⛩️',
  'day-6': '🎋',
  'day-7': '🏮',
  'day-8': '✈️'
});
const daySymbol = (dayId) => daySymbols[dayId] || '🌸';
const mapLink = (day, block = currentBlock(day)) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(block?.place || day.mapQuery)}`;

async function api(path, options = {}) {
  const response = await fetch(path, { headers: { 'Content-Type': 'application/json' }, ...options });
  const payload = await response.json();
  if (!response.ok) { const error = new Error(payload.error || '请求失败'); Object.assign(error, payload); throw error; }
  return payload;
}
async function loadData(silent = false) {
  try { state.data = await api('/api/itinerary'); render(); }
  catch (apiError) {
    try {
      // GitHub Pages 等静态环境没有 Node 接口时，直接读取随版本发布的公开行程数据。
      const response = await fetch('./data/itinerary.json');
      if (!response.ok) throw apiError;
      state.data = await response.json();
      render();
    }
    catch (error) { if (!silent) app.innerHTML = `<section class="map-fallback"><h3>无法读取行程数据</h3><p>${escapeHtml(error.message)}。请稍后刷新页面。</p></section>`; }
  }
}
function showToast(message, isError = false) { toast.textContent = message; toast.className = `toast show${isError ? ' error' : ''}`; clearTimeout(showToast.timer); showToast.timer = setTimeout(() => { toast.className = 'toast'; }, 3000); }
function routeParts() { return location.hash.replace('#', '').split('/').filter(Boolean); }
function currentView() { const [dayId] = routeParts(); return state.data.days.find((day) => day.id === dayId) || null; }
function currentBlock(day = currentView()) { const [, blockId] = routeParts(); return day?.blocks.find((block) => block.id === blockId) || null; }
function isTransitView() { return routeParts()[0] === 'transit'; }
function navHtml() {
  return `<aside class="sidebar"><p class="side-label">行程导航</p><h2>八天路线</h2><nav class="day-nav" aria-label="按日期跳转"><a href="#home" class="${!currentView() && !isTransitView() ? 'active' : ''}"><span class="nav-day">总览</span><span><span class="nav-city">整体日程</span><span class="nav-title">2026.09.27 - 10.04</span></span></a><a href="#transit" class="${isTransitView() ? 'active' : ''}"><span class="nav-day">路线</span><span><span class="nav-city">交通导航</span><span class="nav-title">大阪 · 京都 · 机场</span></span></a>${state.data.days.map((day, index) => `<a href="#${day.id}" class="${currentView()?.id === day.id ? 'active' : ''}"><span class="nav-day">D${index + 1}</span><span><span class="nav-city">${escapeHtml(day.title)}</span><span class="nav-title">${formatDate(day.date)} · ${escapeHtml(day.city)}</span></span></a>`).join('')}</nav><p class="side-note">交通图源直接来自运营方。班次、停运与站台以当天官方信息为准。</p></aside>`;
}
function metric(label, value) { return `<div class="metric"><strong>${value}</strong><span>${label}</span></div>`; }
function overviewHtml() {
  const fixed = state.data.days.flatMap((day) => day.blocks).filter((block) => block.fixed).length;
  const flexible = state.data.days.flatMap((day) => day.blocks).filter((block) => !block.fixed).length;
  return `<section class="overview-hero"><div class="hero-copy"><p class="kicker">2026 KANSAI JOURNEY</p><h1>${escapeHtml(state.data.trip.title)}</h1><p>从大阪的抵达到京都的返程。每一天都有主路线，也留了可被现实改变的余地。</p><div class="trip-meta"><span>${escapeHtml(state.data.trip.dates)}</span><span>${escapeHtml(state.data.trip.party)}</span><span>行前信息整理于 ${escapeHtml(state.data.trip.lastVerified)}</span></div></div><div class="hero-image" role="img" aria-label="京都旅行参考图片"></div></section><div class="section-heading"><div><p class="kicker">一眼看清</p><h2>旅行结构</h2></div><p>固定预约优先，弹性安排留给当天的体力和天气。</p></div><section class="overview-grid">${metric('旅行天数', '08')} ${metric('行程节点', String(state.data.days.reduce((sum, day) => sum + day.blocks.length, 0)).padStart(2, '0'))} ${metric('固定节点', String(fixed).padStart(2, '0'))} ${metric('可调整安排', String(flexible).padStart(2, '0'))}</section><div class="section-heading"><div><p class="kicker">按日阅读</p><h2>路线全景</h2></div><p>点击任意一天，查看时间轴与完整章节。</p></div><section class="day-summary-list">${state.data.days.map((day, index) => { const first = day.blocks[0]; const anchor = day.blocks.find((block) => block.fixed) || first; return `<a href="#${day.id}" class="day-summary"><div class="day-summary-top"><span>D${index + 1} · ${formatDate(day.date)} ${day.weekday}</span><span>${escapeHtml(first.start)} 出发</span></div><h3>${escapeHtml(day.title)}</h3><p>${escapeHtml(day.theme)}</p><p class="block-place">关键节点：${escapeHtml(anchor.title)} · ${escapeHtml(day.hotel)}</p></a>`; }).join('')}</section>`;
}
function mapHtml(day, focus = currentBlock(day)) {
  const query = focus?.place || day.mapQuery;
  const source = `https://www.google.com/maps?q=${encodeURIComponent(query)}&z=13&output=embed`;
  return `<div class="map-panel"><iframe title="${escapeHtml(focus ? focus.title : day.title)}地图" loading="lazy" referrerpolicy="no-referrer-when-downgrade" src="${source}"></iframe></div>`;
}
function dailyPreflightHtml() {
  return `<aside class="daily-preflight"><p class="kicker">出发前再检查</p><p>交通班次、票价、营业时间、预约结果与天气。把变动直接写进对应行程卡，避免出发当天反复翻找不同来源。</p></aside>`;
}
function blockHtml(day, block) {
  const canEdit = Boolean(state.session);
  const expanded = state.expanded.has(block.id) || currentBlock(day)?.id === block.id;
  const risk = block.riskOverride ? `<p class="risk-note critical"><strong>风险覆盖：</strong>${escapeHtml(block.riskOverride)}</p>` : block.risk ? `<p class="risk-note"><strong>风险：</strong>${escapeHtml(block.risk)}。备用：${escapeHtml(block.fallback || '现场确认')}</p>` : '';
  return `<article class="itinerary-block ${expanded ? 'is-expanded' : ''}" id="${block.id}" draggable="${canEdit}" data-block-id="${block.id}"><div class="block-time">${escapeHtml(block.start)}<span>至 ${escapeHtml(block.end)}</span></div><div class="block-body"><div class="block-heading"><button class="block-toggle expand-card" data-id="${block.id}" aria-expanded="${expanded}" aria-controls="detail-${block.id}"><span><h3>${escapeHtml(block.title)}</h3><p class="block-place">${escapeHtml(block.place)}</p></span><span class="expand-affordance">${expanded ? '收起' : '展开'}</span></button><div class="block-actions"><span class="badge badge-${statusClass(block.status)}">${escapeHtml(block.status)}</span>${canEdit ? `<button class="icon-button edit-card" data-id="${block.id}" aria-label="编辑 ${escapeHtml(block.title)}">编辑</button>${block.fixed ? '' : `<button class="icon-button delete-card" data-id="${block.id}" aria-label="删除 ${escapeHtml(block.title)}">×</button>`}` : ''}</div></div><p class="block-summary">${escapeHtml(block.action)}</p><div id="detail-${block.id}" class="block-detail" ${expanded ? '' : 'hidden'}><div class="detail-grid">${guideFor(block)}<aside class="media-slot"><span>图片素材位</span><small>后期人工替换<br>需确认来源与使用权</small></aside></div><div class="detail-row"><span class="detail-chip">${escapeHtml(block.type)}</span><span class="detail-chip">${escapeHtml(block.transport || '现场步行')}</span><span class="detail-chip">${escapeHtml(block.cost || '费用待定')}</span>${block.fixed ? '<span class="detail-chip">固定项目</span>' : '<span class="detail-chip">可调整</span>'}</div><p class="recommendation"><strong>本段提示</strong> ${escapeHtml(block.recommendation || '按当天开放与人流情况调整。')}</p>${risk}</div></div></article>`;
}
const localStopNames = {
  '皇岗口岸': '皇崗口岸 · Huanggang Port',
  '香港国际机场': '香港國際機場 · Hong Kong International Airport',
  '关西机场': '関西空港 · Kansai Airport',
  '关西国际机场': '関西国際空港 · Kansai International Airport',
  '难波': '難波（なんば）· Namba',
  '淀屋桥': '淀屋橋（よどやばし）· Yodoyabashi',
  '环球城站': 'ユニバーサルシティ駅 · Universal City',
  '梅田': '梅田（うめだ）· Umeda',
  '三之宫': '三ノ宮（さんのみや）· Sannomiya',
  '神户站 / 三宫': '神戸・三ノ宮 · Kobe / Sannomiya',
  '中书岛': '中書島（ちゅうしょじま）· Chushojima',
  '宇治': '宇治（うじ）· Uji',
  '奈良': '奈良（なら）· Nara',
  '近铁奈良': '近鉄奈良（きんてつなら）· Kintetsu-Nara',
  '大阪站 / 梅田': '大阪・梅田 · Osaka / Umeda',
  '京都': '京都（きょうと）· Kyoto',
  '京都四条大宫': '四条大宮（しじょうおおみや）· Shijo-Omiya',
  '岚山': '嵐山（あらしやま）· Arashiyama',
  '御宿野乃 京都七条': '御宿 野乃 京都七条 · Onyado Nono Kyoto Shichijo',
  '京都站': '京都駅（きょうとえき）· Kyoto Station',
  'Prince Smart Inn 大阪淀屋桥': 'プリンス スマート イン 大阪淀屋橋 · Prince Smart Inn Osaka Yodoyabashi',
  'USJ 主入口': 'ユニバーサル・スタジオ・ジャパン 入場ゲート · USJ Main Gate',
  '环球城站': 'ユニバーサルシティ駅 · Universal City Station',
  'Hollywood': 'ハリウッド・エリア · Hollywood',
  'SUPER NINTENDO WORLD™': 'スーパー・ニンテンドー・ワールド™ · Super Nintendo World',
  'Jurassic Park': 'ジュラシック・パーク · Jurassic Park',
  '园区主环道': 'パーク・メインルート · Park Main Route',
  '湖畔主通道': 'ラグーン・サイド通路 · Lagoon-side Route',
  'Amity Village': 'アミティ・ビレッジ · Amity Village',
  'San Francisco': 'サンフランシスコ・エリア · San Francisco',
  'New York': 'ニューヨーク・エリア · New York',
  'Minion Park': 'ミニオン・パーク · Minion Park',
  'The Wizarding World of Harry Potter™': 'ウィザーディング・ワールド・オブ・ハリー・ポッター™ · Wizarding World of Harry Potter',
  '园区后方连接路': 'パーク奥側連絡路 · Back-of-park Connector',
  '1-UP Factory': 'ワンナップ・ファクトリー™ · 1-UP Factory',
  '园区出口': 'パーク出口 · Park Exit',
  'JR 三之宫': 'JR 三ノ宮駅 · JR Sannomiya Station',
  '三宫站（神戸三宮）': '神戸三宮駅 · Kobe-Sannomiya Station',
  'JR 六甲道': 'JR 六甲道駅 · JR Rokkomichi Station',
  '阪急六甲': '阪急六甲駅 · Hankyu Rokko Station',
  '神大文理农学部前': '神大文理農学部前 · Shindai Bunri Nogakubu-mae',
  '神户大学六甲台': '神戸大学六甲台キャンパス · Kobe University Rokkodai Campus',
  '北野坂上部': '北野坂上部 · Upper Kitanozaka',
  '北野异人馆街': '北野異人館街 · Kitano Ijinkan',
  '三宫商圈': '三宮 · Sannomiya',
  '三宫商圈 / 元町': '三宮・元町 · Sannomiya / Motomachi',
  '阪神神户三宫': '阪神神戸三宮駅 · Hanshin Kobe-Sannomiya Station',
  '岩屋（兵庫県立美術館前）': '岩屋（兵庫県立美術館前）駅 · Iwaya (Hyogo Prefectural Museum of Art) Station',
  '兵库县立美术馆': '兵庫県立美術館 · Hyogo Prefectural Museum of Art',
  '神户港塔 / Meriken Park': '神戸ポートタワー / メリケンパーク · Kobe Port Tower / Meriken Park',
  '美利坚公园': 'メリケンパーク · Meriken Park',
  'JR 元町': 'JR 元町駅 · JR Motomachi Station',
  '须磨海滨公园站': '須磨海浜公園駅 · Suma Seaside Park Station',
  '须磨海滨公园': '須磨海浜公園 · Suma Seaside Park',
  '舞子站': 'JR 舞子駅 · JR Maiko Station',
  '舞子公园': '舞子公園 · Maiko Park',
  'JR 宇治': 'JR 宇治駅 · JR Uji Station',
  '抹茶小路': '平等院表参道 · Byodo-in Omotesando',
  '平等院': '平等院 · Byodo-in Temple',
  '宇治川': '宇治川 · Uji River',
  '宇治公园': '宇治公園 · Uji Park',
  '宇治神社': '宇治神社 · Uji Shrine',
  '奈良公园': '奈良公園 · Nara Park',
  '东大寺': '東大寺 · Todai-ji Temple',
  '春日大社': '春日大社 · Kasuga Taisha',
  '伏见稻荷': '伏見稲荷大社 · Fushimi Inari Taisha',
  '稻荷': '稲荷駅 · Inari Station',
  '清水寺': '清水寺 · Kiyomizu-dera',
  '二年坂 / 产宁坂': '二年坂・産寧坂 · Ninenzaka / Sannenzaka',
  '八坂神社': '八坂神社 · Yasaka Shrine',
  '祇园 / 先斗町': '祇園・先斗町 · Gion / Pontocho',
  '京都四条大宫': '四条大宮駅 · Shijo-Omiya Station',
  '竹林小径': '竹林の小径 · Arashiyama Bamboo Grove',
  '天龙寺': '天龍寺 · Tenryu-ji Temple',
  '渡月桥': '渡月橋 · Togetsukyo Bridge',
  '金阁寺': '金閣寺（鹿苑寺）· Kinkaku-ji',
  '二条城': '二条城 · Nijo Castle',
  '锦市场': '錦市場 · Nishiki Market',
  '河原町': '河原町 · Kawaramachi',
  '东本愿寺': '東本願寺 · Higashi Hongan-ji',
  '新京极': '新京極商店街 · Shinkyogoku Shopping Street',
  '寺町': '寺町通 · Teramachi Street',
  '高岛屋京都': '京都高島屋S.C. · Takashimaya Kyoto',
  '京都 BAL': '京都BAL · Kyoto BAL',
  '关西国际机场 T1': '関西国際空港 第1ターミナル · KIX Terminal 1',
  '关西机场免税区': '関西国際空港 免税エリア · KIX Duty Free Area'
};
const routeGuide = (transport, stops, steps, note, duration, fare, fallback) => ({ transport, stops, steps, note, duration, fare, fallback });
const routeGuides = {
  'd2-1': {
    transport: '御堂筋线 + JR 大阪环状线 + JR 梦咲线',
    stops: ['Prince Smart Inn 大阪淀屋桥', '淀屋桥', '大阪站 / 梅田', '西九条', '环球城站', 'USJ 主入口'],
    steps: [
      ['酒店 → 淀屋桥站', '从酒店按地图步行进入淀屋桥站；全员先刷 ICOCA，避免在闸机前分头购票。'],
      ['御堂筋线北行 1 站', '乘御堂筋线往「梅田 / 新大阪」方向，在梅田下车；跟随「JR 大阪站」标识步行换乘，预留 8–12 分钟。'],
      ['JR 大阪站 → 西九条', '在大阪站搭乘大阪环状线内回り、往「西九条 / 弁天町」方向的列车；不要误上开往京桥方向的外回り。'],
      ['西九条换 JR 梦咲线', '在西九条按「ユニバーサルシティ / 桜島」标识换乘 JR 梦咲线，到「ユニバーサルシティ駅」下车。'],
      ['环球城站 → 入园队列', '经 Universal CityWalk Osaka 步行至入口；07:40 前到队列，开园时间与提前入园以 USJ App 当日公告为准。']
    ],
    note: '常规铁路段约 40–50 分钟；本段额外预留换乘、CityWalk 步行和入口排队时间。'
  },
  'd2-2': {
    transport: '园内快走 · 按 SUPER NINTENDO WORLD™ 指示',
    stops: ['USJ 主入口', 'Hollywood', 'SUPER NINTENDO WORLD™'],
    steps: [
      ['入园即向右进入 Hollywood', '过闸后不在入口拍照或购物，沿 Hollywood 主通道向「SUPER NINTENDO WORLD™」方向前进。'],
      ['跟随园内电子导视', '优先看 USJ App 的园内地图；区域需要整理券或定时入场时，按 App 指引取得资格，不在入口口头询问。'],
      ['进入后先去咚奇刚区域', '穿过 Warp Pipe 后直接前往 Donkey Kong Country 的矿车入口；完成后再接耀西冒险。']
    ],
    note: '入口至任天堂世界约 10–15 分钟步行；区域资格、提前开放及项目状态均以 App 实时显示为准。'
  },
  'd2-3': {
    transport: '园内步行 · 任天堂世界 → 侏罗纪公园',
    stops: ['SUPER NINTENDO WORLD™', '园区主环道', 'Jurassic Park'],
    steps: [
      ['从任天堂世界正门离开', '由 Warp Pipe 原路回到园区主环道；不回 Hollywood 入口区，减少折返。'],
      ['沿 Jurassic Park 导视前进', '跟随「ジュラシック・パーク / Jurassic Park」牌示进入林间主路，先到乘船游区域。'],
      ['先乘船游，再到飞天翼龙', '两项目在同一园区内；飞天翼龙前先完成储物及随身物整理。']
    ],
    note: '园内步行约 8–12 分钟；如任天堂世界入场时段受限，优先以 App 的下一次可入场时间为准。'
  },
  'd2-4': {
    transport: '园内步行 · 侏罗纪公园 → Amity Village',
    stops: ['Jurassic Park', '湖畔主通道', 'Amity Village'],
    steps: [
      ['从飞天翼龙出口回主路', '不穿越项目排队区，沿园区湖畔方向返回主通道。'],
      ['沿「Amity Village / JAWS」导视', '继续向大白鲨区域前进；到达后先确认 JAWS 等候时间，再排移动点餐。'],
      ['餐后直接离开餐区', '午餐结束后沿主环道前往 Hollywood，不回侏罗纪公园。']
    ],
    note: '步行约 5–8 分钟；JAWS 与 Amity Landing Restaurant 位于同一片区。'
  },
  'd2-5': {
    transport: '园内步行 · Amity Village → Hollywood',
    stops: ['Amity Village', 'San Francisco', 'New York', 'Hollywood'],
    steps: [
      ['从 Amity 沿主环道离开', '完成大白鲨和午餐后，沿湖侧主通道向 Hollywood 方向走。'],
      ['经 San Francisco 与 New York', '全程沿园区连续主路前进，不走回任天堂世界的后方支路。'],
      ['到 Hollywood 后看 App 决定顺序', '抵达好莱坞区再比较好莱坞美梦倒退与太空幻想的实时等候时间，先排较短的一项。']
    ],
    note: '跨园区步行约 15–20 分钟；这是当天较长的园内移动段，午餐不宜延时。'
  },
  'd2-6': {
    transport: '园内步行 · Hollywood → Minion Park',
    stops: ['Hollywood', 'Hollywood 主街', 'Minion Park'],
    steps: [
      ['沿 Hollywood 主街向入口方向走', '从过山车出口回到 Hollywood 主街，按「MINION PARK」导视前进。'],
      ['穿过相邻园区交界', '无需经过 CityWalk 或离园闸机；保持在园内主路。'],
      ['先确认乘车游等候时间', '到小小兵乐园后先完成神偷奶爸乘车游，再按预算决定是否参加游戏。']
    ],
    note: '相邻片区步行约 4–6 分钟。'
  },
  'd2-7': {
    transport: '园内步行 · Minion Park → 哈利波特园区',
    stops: ['Minion Park', 'New York', 'San Francisco', 'The Wizarding World of Harry Potter™'],
    steps: [
      ['从小小兵乐园回园区主环道', '跟随「Harry Potter」导视离开，不向入口外侧折返。'],
      ['经 New York 与 San Francisco', '沿环湖主通道连续步行；中途只补水，不为商店停留。'],
      ['进入霍格莫德村', '先查看禁忌之旅的项目状态和寄物要求，再决定是否先排鹰马飞行。']
    ],
    note: '跨园区步行约 15–20 分钟；若当日有区域管制，按 USJ App 的园内导视调整。'
  },
  'd2-8': {
    transport: '园内步行 · 哈利波特园区 → 任天堂世界',
    stops: ['The Wizarding World of Harry Potter™', '园区后方连接路', 'SUPER NINTENDO WORLD™'],
    steps: [
      ['从霍格莫德村出口离开', '沿「SUPER NINTENDO WORLD™」园内导视走，不经 Hollywood 入口区。'],
      ['先确认第二次区域资格', '到区域入口前打开 USJ App；没有有效入场资格时，不在入口等待。'],
      ['进区后直达马里奥赛车', '通过 Warp Pipe 后按「Mario Kart」标识排队，夜景拍摄放到项目结束后。']
    ],
    note: '后方片区之间步行约 8–12 分钟；能否再次进区取决于当日区域入场规则。'
  },
  'd2-9': {
    transport: '园内步行 · 任天堂世界内优先购物',
    stops: ['SUPER NINTENDO WORLD™', '1-UP Factory', 'Hollywood / 园区出口方向'],
    steps: [
      ['先在 1-UP Factory 完成任天堂采购', '它位于任天堂世界内，按清单快速结账；不要为购物离区后再回头。'],
      ['哈利波特商品仅作备选', '若清单必须购买哈利波特商品，再沿后方连接路回霍格莫德村；否则直接向出口移动。'],
      ['预留离园缓冲', '19:20 前结束购物，避免结账队列吞掉回程换乘时间。']
    ],
    note: '标题中的两类商店不在同一位置；本路线默认优先任天堂世界内的 1-UP Factory，以减少折返。'
  },
  'd2-10': {
    transport: '园内步行 + JR 梦咲线 + JR 大阪环状线 + 御堂筋线',
    stops: ['园区出口', '环球城站', '西九条', '大阪站 / 梅田', '淀屋桥', 'Prince Smart Inn 大阪淀屋桥'],
    steps: [
      ['从最后购物点向 Hollywood 出口移动', '无论在任天堂或哈利波特商店，均按「Exit / Universal CityWalk」导视离园；建议预留 20–25 分钟。'],
      ['环球城站 → 西九条', '在「ユニバーサルシティ駅」搭 JR 梦咲线往西九条；在西九条下车换大阪环状线。'],
      ['JR 大阪站换御堂筋线', '大阪环状线到大阪站后，步行至大阪 Metro 梅田站；搭御堂筋线南行 1 站至淀屋桥。'],
      ['淀屋桥 → 酒店', '出站后按地图步行回酒店；晚餐只选酒店附近，避免再增加夜间跨区移动。']
    ],
    note: '铁路本身约 40–50 分钟；离园步行、晚间客流和梅田站内换乘需额外缓冲。'
  },
  'd3-1': {
    transport: '御堂筋线 + JR 神户线新快速',
    stops: ['Prince Smart Inn 大阪淀屋桥', '淀屋桥', '大阪站 / 梅田', 'JR 三之宫', '三宫站（神戸三宮）'],
    steps: [
      ['酒店 → 淀屋桥站', '按地图步行进入淀屋桥站，搭御堂筋线北行 1 站到梅田。'],
      ['梅田步行换 JR 大阪站', '跟随「JR 大阪站」导视步行换乘；早高峰携带随身物时预留 8–12 分钟。'],
      ['JR 新快速到三之宫', '在大阪站搭 JR 神户线、往「姫路 / 播州赤穂」方向的新快速，到「三ノ宮」下车。'],
      ['出站确认下一段公交', '从 JR 三ノ宮站转往六甲道的公共交通前，先在站内补水并查看 36 系统班次。']
    ],
    note: '常规铁路段约 35–45 分钟；新快速不在六甲道停靠，下一段须先到六甲道再换巴士。'
  },
  'd3-2': {
    transport: 'JR 神户线普通 / 快速 + 神户市巴士 36 系统',
    stops: ['JR 三之宫', 'JR 六甲道', '阪急六甲', '神大文理农学部前', '神户大学六甲台'],
    steps: [
      ['三之宫 → 六甲道', '从 JR 三ノ宮搭往大阪方向的普通或快速列车到「六甲道」；不要搭新快速，因为新快速不停六甲道。'],
      ['转 36 系统上山', '从 JR 六甲道北侧步行至巴士站，搭往「鶴甲団地」方向的 36 系统；也可从阪急六甲站北侧搭同线。'],
      ['在神大文理农学部前下车', '下车站日文为「神大文理農学部前」；若拥挤错过，可在下一站「神大本部工学部前」下车后步行约 1 分钟。'],
      ['步行到六甲台观景位置', '沿校园内上坡步行，进入范围与开放区域以校方当天公告为准。']
    ],
    note: '六甲道 / 阪急六甲至校园的 36 系统车程约 15 分钟；候车时间另计。'
  },
  'd3-3': {
    transport: '出租车优先 · 神户大学六甲台 → 北野异人馆街',
    stops: ['神户大学六甲台', '北野坂上部', '北野异人馆街'],
    steps: [
      ['从校门口叫车', '将目的地设为「風見鶏の館 / Kitano Ijinkan」；从六甲台下山直接前往北野，避免绕回车站。'],
      ['北野坂上部下车', '在风见鸡馆附近下车后，步行进入异人馆街；先确认最想入馆的开放时间。'],
      ['公共交通仅作备选', '36 系统下山后仍需经六甲道 / 三宫再上北野坡，通常超过当前 20 分钟衔接窗口。']
    ],
    note: '当前 10:10 → 10:30 仅 20 分钟，推荐出租车约 15–20 分钟；公共交通不适合作为本时段主路线。'
  },
  'd3-4': {
    transport: '下坡步行 · 北野异人馆街 → 三宫商圈',
    stops: ['北野异人馆街', '北野坂', '三宫商圈 / 元町'],
    steps: [
      ['从风见鸡馆向北野坂下行', '沿「北野坂」一路向南下坡，避免反向上坡折返。'],
      ['到三宫后按预约定位餐厅', '在三宫站周边或元町的预约餐厅集合；餐厅地址以预约信息为准。'],
      ['无预约时就近切换', 'Steakland 等午市备选优先选三宫附近，避免为餐厅再向港区绕行。']
    ],
    note: '下坡步行约 12–15 分钟；行李和体力不佳时可短程出租车。'
  },
  'd3-5': {
    transport: '阪神本线 + 步行 · 三宫 → 岩屋（兵库县立美术馆前）',
    stops: ['三宫商圈', '阪神神户三宫', '岩屋（兵庫県立美術館前）', '兵库县立美术馆'],
    steps: [
      ['步行到阪神神户三宫站', '午餐结束后进入「阪神 神戸三宮駅」，不要误进 JR 或阪急闸机。'],
      ['阪神本线东行到岩屋', '搭往「大阪梅田」方向列车，在「岩屋（兵庫県立美術館前）」下车；以站台电子屏和停靠站为准。'],
      ['岩屋站南口步行到美术馆', '从岩屋站向南步行约 8 分钟即到；JR 灘站南口步行约 10 分钟是备用方案。']
    ],
    note: '公共交通加步行约 20–25 分钟；美术馆官方将岩屋站列为最近铁路入口。'
  },
  'd3-6': {
    transport: '出租车优先 · 兵库县立美术馆 → 美利坚公园',
    stops: ['兵库县立美术馆', '神户港塔 / Meriken Park', '美利坚公园'],
    steps: [
      ['从美术馆入口叫车', '目的地设为「メリケンパーク / BE KOBE」；按当前时间窗直接走海岸道路。'],
      ['在港塔或 BE KOBE 附近下车', '下车后先拍 BE KOBE，再按海边步道浏览港塔周边，避免在公园内大幅折返。'],
      ['铁路备用仅适合延长停留', '公共交通需先走回岩屋站、搭阪神至元町再步行，通常无法满足 15 分钟衔接。']
    ],
    note: '当前 15:30 → 15:45 的衔接只能把出租车作为主方案；遇堵车请缩短美术馆停留或将美利坚公园后移。'
  },
  'd3-7': {
    transport: '出租车优先；公共交通备选为 JR 元町 → 须磨海滨公园',
    stops: ['美利坚公园', 'JR 元町', '须磨海滨公园站', '须磨海滨公园'],
    steps: [
      ['严格按 16:40 左右离开公园', '当前 16:45 → 17:10 只有约 25 分钟；若坚持须磨海滨，建议在 BE KOBE 拍完即叫车。'],
      ['主方案：出租车直达海滨入口', '目的地设为「須磨海浜公園」；预计约 20–25 分钟，视晚高峰浮动。'],
      ['备选：JR 元町 → 须磨海滨公园', '从美利坚公园步行至 JR 元町站，搭 JR 神户线普通列车到「須磨海浜公園」；全程通常 30–40 分钟，不适合当前时间窗。']
    ],
    note: '本段是 D3 的时间风险点：使用铁路必须提前压缩美利坚公园，或把须磨段缩短为经过不下车。'
  },
  'd3-8': {
    transport: 'JR 神户线 + 步行 · 须磨海滨公园 → 舞子公园',
    stops: ['须磨海滨公园', '须磨海滨公园站', '舞子站', '舞子公园'],
    steps: [
      ['海滨步行回须磨海滨公园站', '结束拍摄即沿来路返回「須磨海浜公園駅」，不在沙滩继续向西走。'],
      ['搭 JR 神户线往姬路方向', '在须磨海滨公园站搭往「西明石 / 姫路」方向的普通或快速列车，到「舞子駅」下车。'],
      ['舞子站步行到大桥观景位', '出站后按「舞子公園 / 明石海峡大橋」指示步行，先找视野位置再安排拍照。']
    ],
    note: '站间车程约 10 分钟，但两端步行与候车通常需 25–35 分钟；若 18:00 才离开须磨，18:20 到舞子并不稳妥。'
  },
  'd3-9': {
    transport: 'JR 神户线 + 御堂筋线 · 舞子 → 三宫 → 大阪 / 梅田 → 淀屋桥',
    stops: ['舞子站', 'JR 三之宫', '大阪站 / 梅田', '淀屋桥', 'Prince Smart Inn 大阪淀屋桥'],
    steps: [
      ['舞子站进 JR 闸机', '在「舞子駅」搭往「三ノ宮 / 大阪」方向列车；先看末班与快速停靠站，避免搭反向西行列车。'],
      ['三之宫换新快速或直通列车', '到 JR 三ノ宮后，若当前列车不直达大阪，换乘往「大阪 / 京都」方向的新快速；以电子屏为准。'],
      ['大阪站步行至御堂筋线梅田站', '在大阪站下车后跟随「大阪 Metro 御堂筋線」导视，搭南行 1 站到淀屋桥。'],
      ['淀屋桥回酒店', '出站步行回 Prince Smart Inn；如体力不足，酒店附近简餐后直接休息。']
    ],
    note: '铁路与站内换乘约 70–85 分钟；出发前在 JR 舞子站确认末班及三宫 / 大阪方向。'
  },
  'd4-1': routeGuide('京阪本线 + 宇治线 · 淀屋桥 → 中书岛 → 宇治', ['淀屋桥', '中书岛', '宇治'], [['淀屋桥进站', '从酒店步行至淀屋桥站，确认京阪本线往出町柳方向的站台。'], ['中书岛换宇治线', '在中书岛站不出闸，跟随「宇治線」标识换乘；确认列车终点为宇治。'], ['宇治站出站', '抵达京阪宇治后步行穿过宇治桥，直接进入表参道动线。']], '铁路约 55–70 分钟；宇治段以京阪宇治站实际班次为准。', '55–70 分钟', '约 ¥600–¥800', '若中书岛衔接不顺，改搭 JR 奈良线到 JR 宇治。'),
  'd4-2': routeGuide('步行 · 京阪宇治 → 抹茶小路 → 平等院', ['宇治', '抹茶小路', '平等院'], [['京阪宇治站出站', '出站后沿宇治桥方向直走，不在站前绕行。'], ['十字路口右转进入表参道', '看到抹茶小路后沿小路直走，沿途店铺先记录，避免回程重复逛。'], ['平等院先看池景', '到达凤凰堂后先绕阿字池取景，再按开放时段进入内部参观。']], '站外步行约 15–20 分钟；平等院门票、内部参观与临时闭馆需当天复核。', '15–20 分钟', '免费；平等院门票约 ¥700', '人流过大时先走宇治川河边，再回到平等院。'),
  'd4-3': routeGuide('步行 · 平等院 → 宇治川 → 宇治公园/宇治神社', ['平等院', '宇治川', '宇治公园', '宇治神社'], [['凤凰堂出口回河边', '参观结束后沿原路回一点，转入宇治川河边步道。'], ['红桥过河', '经过朝雾桥或宇治桥后进入宇治公园，安排抹茶甜品与伴手礼。'], ['宇治神社后回站', '时间充足再去宇治神社；不前往源氏物语博物馆，直接沿河边回车站。']], '高赞路线建议沿河边走，景观更好且比大路少回头；源氏物语博物馆为时间充足时备选。', '60–80 分钟', '步行免费；茶点约 ¥800–¥2,000', '下雨或体力不足时跳过宇治神社，直接回京阪宇治站。'),
  'd4-4': routeGuide('步行 + JR 奈良线 · 宇治 → 奈良', ['宇治', 'JR 宇治', 'JR 奈良', '近铁奈良'], [['京阪宇治到 JR 宇治', '从京阪宇治站步行约 10–12 分钟到 JR 宇治站；若早已在 JR 宇治一带则直接进站。'], ['JR 宇治站进站', '搭 JR 奈良线往奈良方向；上车前确认不是京都方向回程车。'], ['JR 奈良站下车', '若下一段以奈良公园为主，优先转公交或短程出租车到东大寺侧。'], ['近铁奈良作为晚餐/返程枢纽', '若需要近铁回大阪，提前把晚餐安排在近铁奈良站周边。']], 'JR 宇治到奈良约 40–55 分钟；JR 奈良站到公园比近铁奈良站更远。', '50–70 分钟', '约 ¥510–¥900', '错过直达车时经京都换乘，不在宇治站长时间等待。'),
  'd4-5': routeGuide('步行 · 奈良公园 → 东大寺', ['近铁奈良', '奈良公园', '东大寺'], [['近铁奈良站出站', '从 2 号出口向奈良公园方向步行，购买鹿仙贝后收好包装。'], ['先逛公园再进寺', '沿鹿群动线向东大寺走，先拍奈良公园，再把门票时间留给大佛殿。'], ['东大寺出口确认返程', '参观后从大仏殿出口向春日大社方向或近铁奈良站回撤，不穿回鹿群密集区。']], '公园与东大寺步行约 15–25 分钟；中午后鹿群和游客密度都会上升。', '15–25 分钟', '鹿仙贝约 ¥200；东大寺门票约 ¥800', '最晚入场临近时跳过公园拍照，直接先入东大寺。'),
  'd4-6': routeGuide('步行 · 东大寺 → 春日大社（备选）', ['东大寺', '春日大社', '近铁奈良'], [['东大寺出口向东', '沿春日野园地和石灯笼参道行走，注意坡度与鹿群。'], ['只在体力充足时进入', '若 16:00 前仍未离开，取消春日大社，直接进入晚餐或返程。'], ['回近铁奈良', '按奈良公园西侧路线回到近铁奈良站，避免绕去 JR 奈良站。']], '本段是加分项，不应挤压宇治返程或晚餐；步行疲劳时直接取消。', '35–60 分钟', '步行免费；春日大社部分区域约 ¥500', '下雨、鹿群拥挤或体力不足时取消。'),
  'd4-7': routeGuide('步行 · 近铁奈良周边晚餐', ['近铁奈良', '志津香/奈良当地餐厅'], [['先看等位', '到店先登记或取号；等待超过 30 分钟就切换备选。'], ['优先釜饭/鳗鱼/柿叶寿司', '把当地特色作为主餐，避免为了单一热门店错过返程。'], ['就近回站', '晚餐后直接回近铁奈良站，预留购票与站内换乘时间。']], '建议把晚餐安排在近铁奈良站周边，减少夜间跨区移动。', '45–70 分钟', '约 ¥1,500–¥3,000/人', '志津香等位过长时改柿叶寿司或奈良町定食。'),
  'd4-8': routeGuide('近铁奈良线 + 御堂筋线 · 奈良 → 难波 → 淀屋桥', ['近铁奈良', '大阪难波', '淀屋桥', 'Prince Smart Inn 大阪淀屋桥'], [['近铁奈良进站', '搭近铁奈良线往大阪难波方向，确认末班与快车类型。'], ['大阪难波换御堂筋线', '抵达大阪难波后按大阪 Metro 导视换乘，不必出站前往 JR。'], ['淀屋桥出站回酒店', '从淀屋桥站出站后步行回酒店；伴手礼集中放入行李后再休息。']], '铁路约 45–60 分钟；晚餐结束后不要再安排跨区购物。', '45–60 分钟', '约 ¥700–¥900', '末班风险时改乘 JR 奈良→大阪或短程出租车。'),
  'd5-1': routeGuide('御堂筋线 + JR 新快速 · 淀屋桥 → 京都', ['淀屋桥', '梅田', '大阪站 / 梅田', '京都站'], [['淀屋桥到梅田', '御堂筋线北行 1 站到梅田，跟随 JR 大阪站导视换乘。'], ['JR 新快速到京都', '搭往京都方向的新快速，行李优先放在座位附近并避开换乘高峰。'], ['京都站转酒店', '抵达京都站后不要先去景点，先按酒店寄存安排移动。']], 'JR 新快速约 30 分钟；大阪站到京都站的站内步行需额外 8–12 分钟。', '55–75 分钟', '约 ¥600–¥900', '早高峰拥挤时改阪急京都线到大宫，再步行至酒店。'),
  'd5-2': routeGuide('阪急京都线/步行 · 京都站 → 四条大宫酒店', ['京都站', '大宫', '京都四条大宫'], [['先处理行李', '从京都站选择阪急或短程出租车，优先把行李寄存到酒店。'], ['确认下午路线', '寄存完成后再回到大宫站或四条大宫站，不携带大件行李进入景区。']], '行李处理优先于景点；寄存规则以酒店当天安排为准。', '20–35 分钟', '约 ¥230–¥1,000', '酒店暂不能寄存时使用京都站寄存柜。'),
  'd5-3': routeGuide('JR 奈良线 + 步行 · 京都站 → 伏见稻荷', ['京都站', '稻荷', '伏见稻荷'], [['京都站进 JR 奈良线', '搭普通列车往奈良方向，在稻荷站下车；不要搭不停站的快速。'], ['稻荷站出站即到楼门', '从站前直接进入伏见稻荷大社，先走千本鸟居前段。'], ['体力够再上四辻', '时间不足时只走主鸟居和熊鹰社，不强行登顶。']], 'JR 京都到稻荷约 5 分钟，景区步行坡度和人流决定停留时间。', '5 分钟车程 + 步行', '约 ¥150–¥300', '人流过大时走到四辻后原路折返，不登山顶。'),
  'd5-4': routeGuide('步行/短程铁路 · 伏见稻荷 → 东山午餐', ['伏见稻荷', '稻荷', '东山途中'], [['景区出口就近用餐', '先在伏见稻荷站周边解决午餐，避免回京都站再折返。'], ['若前往清水寺方向', '可搭京阪到清水五条/祇园四条，再步行进入东山。']], '午餐以顺路和快速为优先，不为热门餐厅等待过久。', '20–35 分钟', '约 ¥800–¥2,000/人', '排队超过 20 分钟时改便利店或站前定食。'),
  'd5-5': routeGuide('京阪/公交 + 步行 · 东山顺坡线', ['清水寺', '二年坂 / 产宁坂', '八坂神社'], [['清水寺先行', '先确认清水寺开放和最晚入场，再由高处向下走。'], ['沿二年坂、产宁坂下坡', '沿石板路向八坂方向移动，商店按清单购买，不来回折返。'], ['八坂神社收尾', '从八坂神社向祇园或先斗町晚餐区移动。']], '清水寺→二年坂→八坂神社是单向下坡，能减少体力消耗和回头路。', '2.5–3.5 小时', '公交/京阪约 ¥230–¥500；门票约 ¥500', '人流过大时跳过部分商店，直接从清水寺下山。'),
  'd5-6': routeGuide('步行 · 祇园/先斗町晚餐', ['八坂神社', '祇园 / 先斗町'], [['先确认预约', '晚餐前在手机中确认店铺入口与预约时间，避免在花见小路反复找店。'], ['八坂神社向西南移动', '沿四条通或白川一带步行到餐厅，遵守居民区拍摄规则。']], '晚餐建议提前预约；热门店无预约时优先选择河原町站附近备选。', '15–30 分钟', '约 ¥2,000–¥6,000/人', '满位时改京都站或河原町连锁餐厅。'),
  'd5-7': routeGuide('步行/公交 · 祇园 → 四条大宫酒店', ['祇园 / 先斗町', '四条大宫', '京都四条大宫'], [['晚餐后回四条通', '沿四条通回到公交或阪急站点，确认末班车方向。'], ['回酒店入住', '办理入住后整理第二天岚山所需物品，避免夜间再出门。']], '晚餐后回酒店不再安排购物，保证第二天早起。', '25–40 分钟', '约 ¥230–¥500', '晚间公交拥堵时短程出租车。'),
  'd6-1': routeGuide('阪急京都线 + 岚电/步行 · 四条大宫 → 岚山', ['京都四条大宫', '嵐電 嵐山', '岚山'], [['四条大宫出发', '优先搭岚电到岚山，沿线直达且无需在京都站换乘。'], ['岚山站先向北', '抵达后先走竹林小径，再按北向南顺序移动。']], '清晨出发可避开竹林和渡月桥人流；铁路优先于拥堵公交。', '25–40 分钟', '约 ¥250–¥400', '岚电拥挤时改阪急到桂再换嵐山线。'),
  'd6-2': routeGuide('步行 · 岚山北向南路线', ['竹林小径', '天龙寺', '渡月桥'], [['先走竹林', '清晨先进入竹林，拍摄后顺路到天龙寺庭园。'], ['天龙寺后向南', '从天龙寺南门出，沿商业街向渡月桥移动，不回竹林入口。'], ['渡月桥收尾', '在河岸取景后回商业街补给或前往午餐。']], '竹林→天龙寺→渡月桥为减少折返的主线；小火车不纳入当天硬性任务。', '2–3 小时', '约 ¥500–¥1,500', '人流过大时跳过天龙寺本堂，仅保留庭园和渡月桥。'),
  'd6-3': routeGuide('步行 · 岚山午餐', ['渡月桥', '岚山商业街', '岚山餐厅'], [['先看预约状态', '广川等热门店只在已有预约时进入，现场排队超过缓冲就切换。'], ['优先汤豆腐/鳗鱼/和菓子', '选择商业街或车站周边，避免午餐后反向穿越景区。']], '午餐必须为金阁寺移动保留缓冲；岚山热门店排队时间波动大。', '45–75 分钟', '约 ¥1,500–¥5,000/人', '无预约时改汤豆腐、荞麦或商业街定食。'),
  'd6-4': routeGuide('出租车优先 · 岚山 → 金阁寺', ['岚山', '金阁寺'], [['午餐后直接叫车', '从渡月桥或岚山站附近上车，目的地设为金阁寺北门/正门。'], ['确认入场时间', '抵达后先进入金阁寺，不在周边商店停留。']], '岚山到金阁寺公交易受拥堵影响，当前时间窗以出租车更稳。', '25–40 分钟', '约 ¥1,500–¥3,000/车', '拥堵时改嵐电/公交组合，但需接受延后。'),
  'd6-5': routeGuide('公交/出租车 · 金阁寺 → 二条城（备选）', ['金阁寺', '二条城'], [['只在提前完成时前往', '金阁寺离开时间晚于 15:00 就直接取消二条城。'], ['公交前往二条城', '按电子站牌确认方向，抵达后先核对最晚入场。']], '二条城是备选，不得挤压锦市场闭店前窗口。', '25–45 分钟', '约 ¥230–¥1,500', '时间不足直接前往锦市场/河原町。'),
  'd6-6': routeGuide('地铁/步行 · 二条城或金阁寺 → 锦市场/河原町', ['二条城', '乌丸御池', '锦市场', '河原町'], [['进入市中心', '优先搭地铁到乌丸御池/四条，再步行到锦市场。'], ['17:00 前到锦市场', '市场摊位多在傍晚前收档，先买食品和伴手礼，再逛河原町。']], '锦市场有明显收档时间，不能把它放到晚餐后。', '25–45 分钟', '约 ¥230–¥600', '晚到时直接改河原町百货或京都站商场。'),
  'd6-7': routeGuide('步行/地铁 · 河原町 → 京都晚餐', ['河原町', '先斗町/京都市中心'], [['先看预约', '根据体力在先斗町、河原町或京都站选择餐厅。'], ['回酒店前确认末班', '晚餐后回四条大宫，提前查看阪急/地铁末班。']], '不为高价名店跨区折返，优先选择当晚所在片区。', '30–60 分钟', '约 ¥1,500–¥6,000/人', '满位时改京都站或酒店周边。'),
  'd7-1': routeGuide('步行/出租车 · 四条大宫 → 京都七条酒店', ['京都四条大宫', '京都站', '御宿野乃 京都七条'], [['先退房再转行李', '大件行李优先短程出租车或公交，11:00 前寄存到新酒店。'], ['从京都站步行到七条', '寄存后再开始当天景点，避免拖箱进入东本愿寺。']], '换酒店日先处理行李，避免景点间来回搬运。', '20–35 分钟', '约 ¥230–¥1,500', '酒店不能提前寄存时改京都站寄存柜。'),
  'd7-2': routeGuide('步行 · 京都站/七条 → 东本愿寺', ['御宿野乃 京都七条', '东本愿寺'], [['酒店步行向北', '沿七条通向京都站方向步行，东本愿寺在京都站北侧。'], ['参观后回站前', '从寺院北门或正门回京都站/四条方向，衔接购物。']], '东本愿寺是换酒店日的轻量景点，保留体力给下午购物。', '10–20 分钟', '免费', '临时关闭时直接前往京都站商场。'),
  'd7-3': routeGuide('地铁/步行 · 京都站 → 四条河原町购物线', ['京都站', '四条河原町', '新京极', '寺町', '锦市场', '高岛屋京都'], [['先到四条河原町', '搭地铁或阪急到河原町，从高岛屋开始按清单采购。'], ['高岛屋→SOU・SOU→新京极', '依次向北/西移动，不在商店街内反复折返。'], ['寺町与锦市场收尾', '食品和易碎品最后购买，统一记录重量和免税凭证。']], '高互动购物路线集中在四条河原町步行范围；百货、服饰、药妆和伴手礼可一次完成。', '2–3 小时', '约 ¥230–¥600', '体力不足时只保留高岛屋、新京极和锦市场。'),
  'd7-4': routeGuide('步行 · 京都七条酒店入住', ['河原町', '京都站', '御宿野乃 京都七条'], [['购物后回京都站', '把冷藏、液体和易碎品分开收纳，再回酒店办理入住。'], ['确认温泉与早餐外安排', '办理入住后不再安排远距离景点。']], '入住时间固定，购物必须在 15:00 前完成主要部分。', '20–35 分钟', '约 ¥230–¥1,000', '晚到时先入住，购物改到京都站或机场。'),
  'd7-5': routeGuide('步行 · 京都站晚餐与温泉休整', ['御宿野乃 京都七条', '京都站'], [['晚餐就近选择', '优先京都站地下街、拉面小路或站前餐厅。'], ['回酒店泡汤', '晚餐后直接回酒店，预留泡汤、整理返程行李和充电时间。']], '不安排远距离夜游，为返程日保留体力。', '30–60 分钟', '约 ¥1,000–¥3,500/人', '京都站排队过长时改酒店周边定食。'),
  'd8-1': routeGuide('步行 · 京都七条酒店内部', ['御宿野乃 京都七条', '酒店前台'], [['清点行李', '护照、机票、充电宝、液体、易碎伴手礼分别装好。'], ['07:15 前完成退房', '提前确认发票、寄存和雨天出行安排。']], '返程日不再加入景点，优先保证机场缓冲。', '30–45 分钟', '住宿已支付', '前台拥堵时提前一晚完成部分退房手续。'),
  'd8-2': routeGuide('步行 · 京都七条 → 京都站', ['御宿野乃 京都七条', '京都站'], [['沿七条通向京都站', '携带行李按步行路线前往；雨天或行李过重改短程出租车。'], ['先找 HARUKA 站台', '进入京都站后先确认 JR 西日本和 HARUKA 站台，再购买餐食。']], '步行约 10–20 分钟；拖箱时需要电梯和站内方向缓冲。', '10–20 分钟', '步行免费；出租车约 ¥800–¥1,500', '雨天或电梯排队时短程出租车。'),
  'd8-3': routeGuide('JR 特急 HARUKA · 京都站 → 关西机场', ['京都站', '关西国际机场 T1'], [['检票上车', '提前确认指定席/自由席和站台；行李不要挡住车门区域。'], ['机场站下车', '按 T1 或航站楼指示前往值机大厅，先办理手续再购物。']], 'HARUKA 车次需在出发前三天复核；机场时间以航空公司要求为准。', '约 75 分钟', '约 ¥2,200–¥3,600', '错过班次时改更早一班 HARUKA 或机场巴士。'),
  'd8-4': routeGuide('机场步行 · 关西机场 T1', ['关西国际机场 T1', '值机柜台', '安检/出境'], [['先值机托运', '优先完成值机、托运、安检和出境，免税购物放到手续之后。'], ['记录登机口', '出境后先确认登机口步行距离，再安排购物和用餐。']], '返程日不把机场购物当作必做任务，登机手续优先。', '60–90 分钟', '按机票/机场费用', '柜台拥堵时取消非必要购物。'),
  'd8-5': routeGuide('机场步行 · 关西机场免税区', ['关西机场免税区', '登机口附近'], [['按必买清单采购', '优先零食、化妆品和已确认库存商品，避免临时购买超重液体。'], ['保留登机缓冲', '购买后按登机口方向移动，不跨航站楼折返。']], '库存、免税政策和提货方式以当天机场页面为准。', '60–120 分钟', '按商品价格', '售罄时使用京都站备选清单，不临时跨航站楼。'),
  'd8-6': routeGuide('登机 · 关西机场 → 香港', ['登机口', '关西国际机场', '香港国际机场'], [['登机前复核', '核对护照、登机牌、托运行李凭证和登机口。'], ['抵港后确认后续安排', '按航班落地和各自交通计划行动，不在机场内滞留。']], '航班与登机口以航空公司当天信息为准。', '按航班时刻', '已支付', '关注机场屏幕和航空公司通知。')
};
function stopLabel(stop) {
  const localName = localStopNames[stop] || stop;
  return `<b><span>${escapeHtml(stop)}</span><small>${escapeHtml(localName)}</small></b>`;
}
function transportDiagram(block) {
  const guide = routeGuides[block.id];
  if (!guide && block.type !== '交通') return '';
  const stops = guide?.stops || block.place.split('→').map((stop) => stop.trim()).filter(Boolean);
  if (stops.length < 2) return '';
  const nodes = stops.map((stop, index) => `${index ? '<span class="route-connector" aria-hidden="true"></span>' : ''}<span class="route-stop ${index === 0 ? 'route-origin' : index === stops.length - 1 ? 'route-destination' : ''}"><i></i>${stopLabel(stop)}</span>`).join('');
  const transferSteps = stops.slice(1, -1).map((stop) => `<li><b>在「${escapeHtml(stop)}」换乘</b><span>下车后先看站内换乘标识；除非电子屏或站员明确提示，不要出闸。确认下一班车终点包含「${escapeHtml(stops.at(-1))}」方向后再上车。</span></li>`).join('');
  const steps = guide ? guide.steps.map(([title, copy]) => `<li><b>${escapeHtml(title)}</b><span>${escapeHtml(copy)}</span></li>`).join('') : `<li><b>从「${escapeHtml(stops[0])}」进站</b><span>寻找「${escapeHtml(block.transport || '铁路 / 地铁')}」标识，用 ICOCA / Suica 或单程票刷闸。先看电子屏确认列车终点和发车时间。</span></li><li><b>上车后盯住站名</b><span>车内屏幕、车门上方路线图和站牌都会显示下一站。不要只凭颜色判断方向；听到站名后再准备下车。</span></li>${transferSteps}<li><b>抵达「${escapeHtml(stops.at(-1))}」</b><span>出闸前先打开地图确认出口与步行方向；若时间紧，优先按站内「出口」标识离站，不在闸机附近整理行李。</span></li>`;
  const note = guide?.note || `${escapeHtml(block.start)} - ${escapeHtml(block.end)} 是本段预留时间。此图为行程示意，站台、终点站显示、换乘与班次以当天电子屏和运营方信息为准。`;
  const duration = guide?.duration || `${block.start}–${block.end}`;
  const fare = guide?.fare || block.cost || '费用待核验';
  const fallback = guide?.fallback || block.fallback || '现场确认替代路线';
  return `<details class="transit-route"><summary class="transit-route-summary"><span class="transit-route-heading"><span>本次交通路线</span><strong>${escapeHtml(guide?.transport || block.transport || '交通方式待核验')}</strong></span><span class="route-track">${nodes}</span><span class="transit-route-affordance" aria-hidden="true"></span></summary><div class="transit-route-detail"><div class="route-meta"><span><b>预计</b>${escapeHtml(duration)}</span><span><b>费用</b>${escapeHtml(fare)}</span><span><b>备选</b>${escapeHtml(fallback)}</span></div><ol class="ride-steps">${steps}</ol><p>${guide ? escapeHtml(note) : `<b>${escapeHtml(block.start)} - ${escapeHtml(block.end)}</b> 是本段预留时间。此图为行程示意，站台、终点站显示、换乘与班次以当天电子屏和运营方信息为准。`}</p></div></details>`;
}

function numberedPhotos(folder, timestamp, start, end) {
  return Array.from({ length: end - start + 1 }, (_, offset) => {
    const fileName = `微信图片_${timestamp}_${start + offset}_3.jpg`;
    return `./assets/images/${encodeURIComponent(folder)}/${encodeURIComponent(fileName)}`;
  });
}

function namedPhotos(folder, prefix, count) {
  return Array.from({ length: count }, (_, index) => {
    const fileName = `${prefix}${index + 1}.jpg`;
    return `./assets/images/${encodeURIComponent(folder)}/${encodeURIComponent(fileName)}`;
  });
}

function photoVariant(src, variant) {
  return src.replace('./assets/images/', `./assets/${variant}/`).replace(/\.jpg$/i, '.webp');
}

function preloadDayPhotos(dayId) {
  const day = state.data?.days.find((item) => item.id === dayId);
  if (!day) return;
  day.blocks.flatMap((block) => itineraryPhotos[block.id] || []).forEach((src) => {
    ['photo-thumbs', 'photo-previews'].forEach((variant) => {
      const image = new Image();
      image.decoding = 'async';
      image.src = photoVariant(src, variant);
    });
  });
}

const itineraryPhotos = {
  'd1-2': numberedPhotos('直达巴士前往香港国际机场', '20260904092455', 80, 85),
  'd1-3': namedPhotos('值机、托运与候机', '香港国际机场值机候机实景图', 5),
  'd1-5': [
    ...numberedPhotos('入境后前往淀屋桥', '20260904093435', 87, 95),
    ...numberedPhotos('入境后前往淀屋桥', '20260904093836', 97, 106),
    ...numberedPhotos('入境后前往淀屋桥', '20260904094133', 108, 115)
  ],
  'd1-6': numberedPhotos('入住与道顿堀轻量散步', '20260904095641', 117, 124),
  'd2-1': numberedPhotos('前往 Universal Studios Japan', '20260904145434', 136, 141),
  // 这组照片同时涵盖任天堂与哈利波特园区，依首次进入园区的章节展示一次，避免重复出现。
  'd2-2': [
    ...numberedPhotos('超级任天堂世界与哈利波特园区', '20260904100745', 128, 134),
    ...namedPhotos('任天堂世界：咚奇刚矿车与耀西冒险', '任天堂世界追加实景图', 5)
  ],
  'd2-3': namedPhotos('侏罗纪公园：乘船游与飞天翼龙', '侏罗纪公园乘船与飞天翼龙实景图', 1),
  'd2-4': namedPhotos('大白鲨与错峰午餐', '大白鲨园区餐食实景图', 5),
  'd2-5': namedPhotos('好莱坞区：好莱坞美梦与太空幻想列车', '好莱坞区过山车实景图', 5),
  'd2-6': namedPhotos('小小兵乐园：神偷奶爸乘车游与游戏', '小小兵乐园实景图', 5),
  'd2-7': namedPhotos('哈利波特园区：禁忌之旅与鹰马飞行', '哈利波特园区实景图', 5),
  'd2-8': namedPhotos('回任天堂世界：马里奥赛车与夜景', '任天堂世界夜景实景图', 5),
  'd2-9': namedPhotos('离园前限定采购', '任天堂限定商品实景图', 5),
  'd2-10': namedPhotos('返回淀屋桥并晚餐', '淀屋桥晚餐街区实景图', 5),
  'd3-2': namedPhotos('神户大学观景台', '神户大学观景台港景实景图', 5),
  'd3-3': namedPhotos('北野异人馆', '北野异人馆街景实景图', 5),
  'd3-4': namedPhotos('三宫商圈神户牛午餐', '神户牛铁板烧实景图', 5),
  'd3-5': namedPhotos('兵库县立美术馆', '兵库县立美术馆建筑实景图', 5),
  'd3-6': namedPhotos('美利坚公园', '美利坚公园港景实景图', 5),
  'd3-7': namedPhotos('须磨海滨', '须磨海滨实景图', 5),
  'd3-8': namedPhotos('舞子公园看日落', '舞子公园明石海峡大桥实景图', 5),
  'd4-2': namedPhotos('平等院凤凰堂', '平等院凤凰堂实景图', 5),
  'd4-3': namedPhotos('宇治表参道抹茶与伴手礼', '宇治抹茶实景图', 5),
  'd4-5': namedPhotos('奈良公园与东大寺', '奈良公园鹿与东大寺实景图', 5),
  'd4-6': namedPhotos('春日大社与若草山备选', '春日大社若草山实景图', 5),
  'd4-7': namedPhotos('奈良晚餐或提前返程', '奈良柿叶寿司实景图', 5),
  'd5-3': namedPhotos('伏见稻荷大社', '伏见稻荷千本鸟居实景图', 5),
  'd5-4': namedPhotos('伏见稻荷周边午餐', '伏见稻荷乌冬午餐实景图', 5),
  'd5-5': namedPhotos('清水寺、二年坂与八坂神社', '清水寺二年坂实景图', 5),
  'd5-6': namedPhotos('祇园晚餐', '祇园居酒屋串烧实景图', 3),
  'd5-7': namedPhotos('正式入住京都四条大宫', '京都四条大宫酒店实景图', 5),
  'd6-2': namedPhotos('竹林小径、天龙寺与渡月桥', '岚山竹林天龙寺实景图', 5),
  'd6-4': namedPhotos('金阁寺', '金阁寺实景图', 5),
  'd6-5': namedPhotos('二条城', '二条城实景图', 5),
  'd6-6': namedPhotos('锦市场与河原町', '锦市场河原町实景图', 5),
  'd6-7': namedPhotos('京都晚餐', '京都晚餐街景实景图', 5),
  'd7-2': namedPhotos('东本愿寺', '东本愿寺实景图', 5),
  'd7-3': namedPhotos('河原町补货', '京都河原町购物实景图', 5),
  'd7-4': namedPhotos('入住温泉酒店', '京都温泉酒店实景图', 5),
  'd7-5': namedPhotos('京都站晚餐与温泉休整', '京都站晚餐实景图', 5)
};

const buyItem = (name, category, location, reason, price, note, source = '小红书口碑候选') => ({ name, category, location, reason, price, note, source });
const foodItem = (name, location, dish, price, note, source = '小红书口碑候选') => ({ name, location, dish, price, note, source });
const dailyRecommendations = {
  'day-1': {
    mustBuy: [
      buyItem('道顿堀限定零食', '伴手礼', '道顿堀 / 难波', '第一晚即可买到的轻量零食，避免返程集中采购。', '¥500–¥2,000', '先买小包装，液体和易碎品留到后段。'),
      buyItem('大阪限定钥匙扣', '纪念品', '心斋桥筋', '大阪地标主题，体积小、适合分送。', '¥500–¥1,500', '款式和库存以店铺当天为准。')
    ],
    food: [
      foodItem('Yakiniku Rikimaru 千日前', '难波千日前', '和牛烧肉自助', '约 ¥5,400/人', '建议提前线上预约；作为 D1 晚餐主选。'),
      foodItem('Crazy Spice', '大阪市区', '日式浓汤咖喱', '约 ¥1,200/人', '午市排队明显，D1 晚餐仅作备选。'),
      foodItem('黑门市场 石桥关东煮', '黑门市场', '现煮关东煮与海鲜小吃', '约 ¥1,000/人', '市场中午后更热闹，适合边逛边吃。'),
      foodItem('つけ麺丸和／まるふじ', '大阪市西区', '浓汤鱼介沾面', '约 ¥1,100/人', '位置偏离酒店，需与当日路线顺路时安排。'),
      foodItem('浪花大大阪烧', '大阪市区', '老字号大阪烧', '约 ¥1,300/人', '适合作为不预约的晚餐替代。'),
      foodItem('肉剧场', '难波/道顿堀周边', '居酒屋风烧肉丼', '约 ¥2,500/人', '深夜营业，适合错过预约时使用。'),
      foodItem('龟王拉面', '大阪市区', '浓汤拉面', '约 ¥900/人', '快速用餐备选；门店以当天营业信息为准。')
    ]
  },
  'day-2': {
    mustBuy: [
      buyItem('SUPER NINTENDO WORLD™ 限定商品', '纪念品', '1-UP Factory', '园区限定、不可在京都连锁店替代。', '¥1,500–¥8,000', '先买小件，避免一早背大袋排项目。'),
      buyItem('咚奇刚矿车周边', '纪念品', 'Donkey Kong Country', '与当天首刷项目绑定，适合做主题纪念。', '¥1,500–¥6,000', '库存可能随时变化。'),
      buyItem('哈利波特魔法世界商品', '纪念品', '霍格莫德村', '魔杖、学院周边和包装食品优先挑一件。', '¥2,000–¥10,000', '液体和大包装留意行李限制。'),
      buyItem('USJ 限定包装零食', '食品', '园区商店', '体积小、适合返程分送。', '¥800–¥2,500', '优先选择常温密封款。')
    ],
    food: [
      foodItem('Kinopio’s Cafe', 'SUPER NINTENDO WORLD™', '马里奥主题套餐', '约 ¥2,000–¥3,500/人', '需关注整理券与实时排队。'),
      foodItem('Amity Landing Restaurant', 'Amity Village', '汉堡、炸物、海湾主题套餐', '约 ¥1,500–¥2,500/人', '与 JAWS 动线相邻，适合午餐。'),
      foodItem('三把扫帚', '哈利波特园区', '英式派、烤鸡、黄油啤酒', '约 ¥1,500–¥3,000/人', '晚间回哈利波特区时优先。'),
      foodItem('黄油啤酒与园区小食', '霍格莫德村', '黄油啤酒、热狗、甜点', '约 ¥600–¥1,500/人', '适合作为项目间补给，不替代正餐。'),
      foodItem('Yakiniku Rikimaru 千日前', '难波千日前', '和牛烧肉自助', '约 ¥5,400/人', '离园后晚餐备选，必须提前看末班交通。'),
      foodItem('肉剧场', '难波周边', '烧肉丼', '约 ¥2,500/人', '不想预约时的快速晚餐。')
    ]
  },
  'day-3': {
    mustBuy: [
      buyItem('神户牛熟成肉/真空礼盒', '食品', '三宫 / 元町', '比现场购买整块鲜肉更适合携带和分送。', '¥3,000–¥10,000', '确认保冷与入境限制。'),
      buyItem('北野异人馆风格文创', '纪念品', '北野异人馆街', '异人馆明信片、玻璃小物和建筑主题商品。', '¥800–¥4,000', '优先轻量、非易碎品。'),
      buyItem('神户港塔/BE KOBE 纪念品', '美利坚公园', '港区商店', '与港区夜景和地标绑定，适合做旅行纪念。', '¥500–¥3,000', '港区店铺营业时间需核验。'),
      buyItem('神户限定甜品', '三宫 / 元町', '神户洋菓子店', '奶酪蛋糕、布丁等当地评价较高的甜点。', '¥800–¥3,000', '冷藏品不要过早购买。')
    ],
    food: [
      foodItem('神户牛午餐', '三宫 / 元町', '神户牛铁板烧或牛排', '约 ¥3,000–¥8,000/人', '午市通常比晚餐更容易控制预算。'),
      foodItem('南京町老字号小吃', '南京町', '小笼包、烧卖、炸物', '约 ¥800–¥2,000/人', '适合与神户牛错开，少量多吃。'),
      foodItem('神户洋食', '元町 / 三宫', '蛋包饭、炸虾、汉堡排', '约 ¥1,500–¥3,000/人', '下雨时可替代港区露天餐食。'),
      foodItem('港区甜品与咖啡', '美利坚公园 / 神户港塔', '布丁、芝士蛋糕、咖啡', '约 ¥700–¥1,800/人', '适合作为海边散步后的补给。'),
      foodItem('神户拉面', '三宫周边', '鸡白汤或酱油拉面', '约 ¥900–¥1,500/人', '返程前快速用餐备选。'),
      foodItem('神户牛可乐饼', '南京町/元町', '牛肉可乐饼', '约 ¥300–¥800/份', '小份尝鲜，不建议当完整晚餐。')
    ]
  },
  'day-4': {
    mustBuy: [
      buyItem('宇治抹茶粉', '食品', '抹茶小路 / 宇治茶店', '宇治限定茶叶与抹茶粉是当天最值得购买的品类。', '¥800–¥3,000', '注意密封、保质期与行李重量。'),
      buyItem('抹茶点心礼盒', '伴手礼', '中村藤吉 / 伊藤久右卫门周边', '常温小包装更适合分送。', '¥700–¥2,500', '冷藏甜点不要过早买。'),
      buyItem('宇治限定茶具', '茶具', '宇治表参道', '茶筅、小茶杯等轻量器物可挑一件。', '¥1,000–¥5,000', '易碎品单独包装。'),
      buyItem('奈良鹿主题文创', '纪念品', '奈良公园 / 奈良町', '鹿冰箱贴、御守和小型文具口碑稳定。', '¥500–¥2,500', '不要购买喂鹿用鹿仙贝作为伴手礼。')
    ],
    food: [
      foodItem('中村藤吉本店', '宇治表参道', '抹茶巴菲、抹茶荞麦', '约 ¥1,500–¥2,500/人', '高峰期排队，建议先取号。'),
      foodItem('伊藤久右卫门 宇治本店', '宇治桥周边', '抹茶甜品、茶荞麦', '约 ¥1,500–¥2,500/人', '可作为中村藤吉满位时的替代。'),
      foodItem('志津香釜饭', '近铁奈良 / 奈良公园', '奈良七种釜饭', '约 ¥2,000–¥3,000/人', '开门前排队更稳，晚到需准备替代店。'),
      foodItem('奈良鳗鱼饭', '奈良公园周边', '炭火鳗鱼饭', '约 ¥2,000–¥4,000/人', '适合不想等待釜饭时切换。'),
      foodItem('柿叶寿司', '近铁奈良站 / 奈良町', '奈良柿叶寿司', '约 ¥800–¥1,800/人', '可买便携包装作为返程或晚餐补充。'),
      foodItem('奈良町定食', '奈良町', '蔬菜定食、茶粥', '约 ¥1,200–¥2,000/人', '人流较低时的本地化备选。')
    ]
  },
  'day-5': {
    mustBuy: [
      buyItem('清水烧小器物', '器皿', '清水寺周边', '清水烧小碟、茶杯比大型器物更适合携带。', '¥1,000–¥6,000', '确认店铺包装和退换规则。'),
      buyItem('京都限定香氛/护手霜', '化妆品', '祇园 / 东山', '京都限定香气与小容量护手霜适合送礼。', '¥800–¥3,500', '液体容量需符合返程规则。'),
      buyItem('和风布艺/袜子', '服饰', '二年坂 / 产宁坂', '京都图案手帕、和风袜子、布袋轻便耐用。', '¥500–¥3,000', '优先选择可机洗材质。'),
      buyItem('伏见稻荷御守', '纪念品', '伏见稻荷大社', '神社限定御守与鸟居主题小物。', '¥500–¥1,500', '按个人需求购买，不重复囤积。')
    ],
    food: [
      foodItem('伏见稻荷周边定食', '稻荷站周边', '鳗鱼、豆皮寿司、乌冬', '约 ¥900–¥2,000/人', '与上午路线最顺，避免回京都站。'),
      foodItem('清水寺附近天妇罗', '清水坂 / 二年坂', '季节天妇罗定食', '约 ¥1,500–¥3,000/人', '高赞笔记推荐，午市更易排到。'),
      foodItem('祇园京料理', '祇园', '季节小料理/湯葉', '约 ¥3,000–¥8,000/人', '需要预约，预算高时再选。'),
      foodItem('先斗町烧肉或寿喜烧', '先斗町', '烧肉、寿喜烧', '约 ¥3,000–¥6,000/人', '作为晚餐主选，提前确认座位。'),
      foodItem('京都拉面', '四条河原町', '鸡白汤/酱油拉面', '约 ¥900–¥1,500/人', '祇园晚餐满位时的高性价比替代。'),
      foodItem('抹茶甜品', '二年坂 / 祇园', '抹茶冰淇淋、团子', '约 ¥500–¥1,200/人', '适合边走边休息，不替代正餐。')
    ]
  },
  'day-6': {
    mustBuy: [
      buyItem('金阁寺金箔明信片', '纪念品', '金阁寺授与所/周边', '高互动笔记反复提到的轻量纪念品。', '约 ¥500–¥1,500', '库存和销售位置现场确认。'),
      buyItem('岚山和风文创', '纪念品', '岚山商业街', '竹制小物、和风杂货和限定包装。', '¥800–¥4,000', '不要在竹林主路停留太久。'),
      buyItem('京都御守', '金阁寺/二条城周边', '御守、书签', '轻量且具京都地域特色。', '¥500–¥1,500', '按实际参拜地点购买。'),
      buyItem('锦市场食品', '锦市场', '七味、腌菜、豆制品、点心', '适合集中采购食品类伴手礼。', '¥500–¥2,500', '多数摊位傍晚收档。')
    ],
    food: [
      foodItem('岚山汤豆腐', '岚山商业街', '汤豆腐套餐', '约 ¥2,000–¥4,000/人', '经典岚山餐食，预约状态决定是否采用。'),
      foodItem('广川鳗鱼饭', '岚山', '鳗鱼饭', '约 ¥4,000–¥6,000/人', '无预约不建议长时间排队。'),
      foodItem('岚山荞麦/豆皮乌冬', '渡月桥周边', '荞麦、豆皮乌冬', '约 ¥900–¥1,800/人', '金阁寺移动前的快速午餐。'),
      foodItem('锦市场小吃', '锦市场', '玉子烧、豆乳甜甜圈、海鲜串', '约 ¥500–¥2,000/人', '注意市场内边走边吃规则。'),
      foodItem('河原町烧肉', '河原町', '和牛烧肉', '约 ¥3,000–¥6,000/人', '晚餐可选连锁或预约店。'),
      foodItem('京都和菓子', '岚山/河原町', '生八桥、团子、季节和菓子', '约 ¥500–¥1,500/人', '适合作为下午茶和伴手礼试吃。')
    ]
  },
  'day-7': {
    mustBuy: [
      buyItem('高岛屋京都地下食品', '食品', '高岛屋京都地下街', '集中采购京都限定甜点和礼盒。', '¥800–¥4,000', '冷藏品留意保冷时长。'),
      buyItem('SOU・SOU 布袋/和风袜', '服饰', '四条河原町', '京都风格原创布艺，轻便实用。', '¥1,000–¥5,000', '尺码和颜色按现场库存。'),
      buyItem('新京极药妆', '化妆品', '新京极商店街', '连锁药妆集中，适合补买日用品。', '¥500–¥5,000', '比较免税与促销条件。'),
      buyItem('寺町文具与香氛', '文具/香氛', '寺町通', '小众文具、香氛和生活杂货。', '¥500–¥4,000', '优先小体积商品。'),
      buyItem('京都 BAL 服饰/生活杂货', '服饰', '京都 BAL', '精品服饰和设计杂货集中。', '¥2,000–¥15,000', '预算高或有明确品牌需求再去。')
    ],
    food: [
      foodItem('京都站人气寿司', '京都站', '握寿司/海鲜丼', '约 ¥1,500–¥4,000/人', '高赞笔记推荐，晚餐可能排队。'),
      foodItem('京都站拉面小路', '京都站 10F', '京都拉面、博多拉面等', '约 ¥900–¥1,800/人', '选择多，适合不预约晚餐。'),
      foodItem('河原町京料理', '四条河原町', '湯葉、豆腐料理', '约 ¥2,000–¥5,000/人', '午餐或早晚餐均可，按预算选择。'),
      foodItem('锦市场熟食', '锦市场', '烤物、玉子烧、腌菜', '约 ¥500–¥1,500/人', '适合下午补给，不建议代替正式晚餐。'),
      foodItem('温泉酒店周边定食', '京都七条', '定食、乌冬、烧鱼', '约 ¥1,000–¥2,500/人', '作为泡汤前后的低风险选择。'),
      foodItem('京都限定布丁/甜点', '高岛屋地下街', '布丁、和菓子、蛋糕', '约 ¥500–¥2,000/人', '冷藏商品安排在回酒店前购买。')
    ]
  },
  'day-8': {
    mustBuy: [
      buyItem('京都站伴手礼礼盒', '伴手礼', '京都站 Porta / 伊势丹', '返程前一次补齐京都限定点心。', '¥800–¥4,000', '优先常温密封款。'),
      buyItem('关西机场零食', '食品', 'KIX 免税区', '白色恋人、Royce、生巧等按库存选择。', '¥800–¥3,500', '冷藏品确认保冷与转机规则。'),
      buyItem('机场免税化妆品', '化妆品', 'KIX T1 免税店', '香奈儿、迪奥及日系护肤品可集中比价。', '¥3,000–¥30,000+', '库存、退税与购买限制现场核验。'),
      buyItem('LeTao/机场限定甜点', '食品', 'KIX 免税区', '适合作为高评价返程礼物。', '¥1,000–¥3,500', '优先确认提货位置与保冷时间。')
    ],
    food: [
      foodItem('京都站便当', '京都站', '寿司便当/烤鱼便当', '约 ¥800–¥2,000/人', '赶 HARUKA 时直接在站内购买。'),
      foodItem('Mensho 拉面', '关西机场 T1', '机场拉面', '约 ¥1,000–¥1,800/人', '小红书机场高评价候选，先确认排队。'),
      foodItem('机场寿司', '关西机场 T1', '寿司套餐', '约 ¥1,500–¥3,500/人', '值机后用餐，预留登机口步行时间。'),
      foodItem('泉佐野海鲜丼', '关西机场周边', '海鲜丼', '约 ¥1,000–¥2,000/人', '仅在机场时间非常充足时考虑，不为此离开航站楼。'),
      foodItem('机场咖啡与甜点', '免税区/登机口附近', '咖啡、布丁、抹茶甜点', '约 ¥500–¥1,500/人', '适合候机补给。'),
      foodItem('京都站寿司/拉面', '京都站', '寿司或拉面', '约 ¥1,000–¥3,000/人', 'HARUKA 前的最后一站餐食备选。')
    ]
  }
};

function photoFileName(src) {
  return decodeURIComponent(src.split('/').at(-1) || '行程照片');
}

const foodPhotoPath = (dayId, index) => `./assets/images/${encodeURIComponent('美食推荐')}/${encodeURIComponent(dayId)}/${encodeURIComponent(`food-${String(index + 1).padStart(2, '0')}.jpg`)}`;
Object.entries(dailyRecommendations).forEach(([dayId, recommendations]) => {
  recommendations.food.forEach((item, index) => { item.image = foodPhotoPath(dayId, index); });
});

function photoStack(block) {
  const photos = itineraryPhotos[block.id];
  if (!photos?.length) return '';
  const previewPhotos = photos.slice(0, 3);
  return `<section class="photo-stack" aria-label="${escapeHtml(block.title)}的行程照片"><button class="photo-stack-open" type="button" data-gallery-id="${block.id}" aria-label="查看 ${escapeHtml(block.title)} 的 ${photos.length} 张照片"><span class="photo-stack-visual">${previewPhotos.map((src, index) => `<span class="photo-stack-card photo-stack-card-${index + 1}"><img src="${photoVariant(src, 'photo-thumbs')}" alt="${escapeHtml(block.title)}照片 ${index + 1}" loading="lazy" decoding="async"></span>`).join('')}</span><span class="photo-stack-copy"><strong>查看行程照片</strong><small>${photos.length} 张 · 点击查看全部</small></span></button></section>`;
}

function dailyHighlightsHtml(day) {
  const recommendations = dailyRecommendations[day.id];
  if (!recommendations) return '';
  const buyList = recommendations.mustBuy.map((item) => `<li class="recommendation-item"><strong>${escapeHtml(item.name)}</strong><span class="recommendation-meta">${escapeHtml(item.category)} · ${escapeHtml(item.location)} · ${escapeHtml(item.price)}</span><small>${escapeHtml(item.reason)}${item.note ? ` · ${escapeHtml(item.note)}` : ''}</small></li>`).join('');
  const foodList = recommendations.food.map((item) => `<li class="recommendation-item recommendation-food-item"><button class="food-photo-button" type="button" data-food-image="${escapeHtml(item.image)}" data-food-title="${escapeHtml(item.name)}" aria-label="放大查看 ${escapeHtml(item.name)} 招牌菜照片"><img src="${escapeHtml(photoVariant(item.image, 'photo-thumbs'))}" alt="${escapeHtml(item.name)}的${escapeHtml(item.dish)}缩略图" loading="lazy" decoding="async"></button><span class="recommendation-item-copy"><strong>${escapeHtml(item.name)}</strong><span class="recommendation-meta">${escapeHtml(item.location)} · ${escapeHtml(item.price)}</span><small>招牌：${escapeHtml(item.dish)} · ${escapeHtml(item.note)} · 参考：${escapeHtml(item.source)}</small></span></li>`).join('');
  const panel = (type, kicker, title, icon, list, contentId) => `<article class="recommendation-panel" data-recommendation-panel="${type}"><button class="recommendation-toggle" type="button" aria-expanded="false" aria-controls="${contentId}"><span class="recommendation-toggle-copy"><span class="kicker">${kicker}</span><strong><span class="recommendation-title-icon" aria-hidden="true">${icon}</span>${title}</strong></span><span class="recommendation-toggle-icon" aria-hidden="true"></span></button><div id="${contentId}" class="recommendation-content" hidden><ul>${list}</ul></div></article>`;
  return `<section class="daily-highlights" aria-label="${escapeHtml(day.title)}的购物与美食推荐">${panel('buy', '路线顺手买', '必买清单', '🎁', buyList, `recommendation-buy-${day.id}`)}${panel('food', '按当日动线', '美食推荐', '🍜', foodList, `recommendation-food-${day.id}`)}</section>`;
}

function selectedBlock(day = currentView()) {
  if (!day?.blocks?.length) return null;
  const routedBlock = currentBlock(day);
  if (routedBlock) {
    state.selectedBlockId = routedBlock.id;
    return routedBlock;
  }
  const storedBlock = day.blocks.find((block) => block.id === state.selectedBlockId);
  const nextBlock = storedBlock || day.blocks[0];
  state.selectedBlockId = nextBlock.id;
  return nextBlock;
}

function blockHtml(day, block) {
  const canEdit = Boolean(state.session);
  const sequence = day.blocks.findIndex((item) => item.id === block.id) + 1;
  const detailContent = `${transportDiagram(block)}${photoStack(block)}`;
  return `<article class="itinerary-block is-current" id="${block.id}" draggable="${canEdit}" data-block-id="${block.id}"><div class="block-time"><span class="block-sequence">行程 ${String(sequence).padStart(2, '0')}</span><strong>${escapeHtml(block.start)}</strong><span class="block-time-end">至 ${escapeHtml(block.end)}</span></div><div class="block-body"><div class="block-heading"><div class="block-heading-copy"><h3>${escapeHtml(block.title)}</h3><p class="block-place">${escapeHtml(block.place)}</p></div><div class="block-actions"><span class="badge badge-${statusClass(block.status)}">${escapeHtml(block.status)}</span>${canEdit ? `<button class="icon-button edit-card" data-id="${block.id}" aria-label="编辑 ${escapeHtml(block.title)}">编辑</button>${block.fixed ? '' : `<button class="icon-button delete-card" data-id="${block.id}" aria-label="删除 ${escapeHtml(block.title)}">×</button>`}` : ''}</div></div><p class="block-summary">${escapeHtml(block.action)}</p><div id="detail-${block.id}" class="block-detail${detailContent ? '' : ' block-detail-empty'}">${detailContent}</div></div></article>`;
}
function dayHtml(day) {
  const index = state.data.days.indexOf(day) + 1;
  const focused = currentBlock(day);
  const timeline = day.blocks.map((block, stepIndex) => {
    const isActive = focused?.id === block.id;
    return `<a href="#${day.id}/${block.id}" class="timeline-step ${isActive ? 'active' : ''} ${stepIndex === day.blocks.length - 1 ? 'is-last' : ''}" ${isActive ? 'aria-current="step"' : ''} style="--timeline-index:${stepIndex}"><span class="timeline-step-node" aria-hidden="true"></span><span class="timeline-step-copy"><strong class="timeline-step-time">${escapeHtml(block.start)}</strong><span class="timeline-step-title">${escapeHtml(block.title)}</span></span></a>`;
  }).join('');
  const mapTitle = focused ? `定位：${escapeHtml(focused.title)}` : '当日点位';
  const mapDescription = focused ? `地图已跟随时间轴定位到 ${escapeHtml(focused.place)}。` : '点击时间轴会切换地图焦点；按卡片顺序查看当天路线。';
  return `<section class="day-header" style="background-image:linear-gradient(90deg,rgba(9,38,42,.93),rgba(9,38,42,.60)),url('${escapeHtml(day.image)}');background-position:center;background-size:cover"><div><p class="kicker">DAY ${String(index).padStart(2, '0')} · ${formatDate(day.date)} ${escapeHtml(day.weekday)}</p><h1>${escapeHtml(day.title)}</h1><p>${escapeHtml(day.theme)}</p><p class="image-credit">图片：${escapeHtml(day.imageSource)} · 正式发布前请逐张复核使用范围</p></div></section><section class="day-layout"><div class="timeline-panel"><div class="panel-title"><h2>当天时间轴</h2>${state.session ? '<span class="badge badge-confirmed">可拖拽排序</span>' : ''}</div><nav class="timeline" aria-label="当天行程时间轴">${timeline}</nav></div><aside class="map-card">${mapHtml(day)}<div class="map-card-copy"><h2>${mapTitle}</h2><p>${mapDescription}</p><a href="${mapLink(day, focused)}" target="_blank" rel="noopener">打开 Google Maps</a></div></aside></section><section class="itinerary"><div class="itinerary-title"><div><p class="kicker">完整章节</p><h2>时间留白，路线清楚</h2></div><p>${escapeHtml(day.hotel)}</p></div><div class="block-list" data-day-id="${day.id}">${day.blocks.map((block) => blockHtml(day, block)).join('')}</div></section>`;
}
function render() { app.innerHTML = `<div class="app-shell">${navHtml()}<section class="page-content">${currentView() ? dayHtml(currentView()) : overviewHtml()}</section></div>`; document.querySelector('#session-label').textContent = state.session ? `${state.session.nickname} · 编辑中` : '公开浏览'; document.querySelector('#editor-button').textContent = state.session ? '退出编辑模式' : '进入编辑模式'; bindDynamicEvents(); const focused = currentBlock(); if (focused) requestAnimationFrame(() => document.getElementById(focused.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })); }
function transitMapCard({ city, subtitle, pdfUrl, officialUrl, notes }) {
  return `<article class="network-map-card"><div class="network-map-heading"><div><p class="kicker">官方完整路网</p><h2>${city}</h2><p>${subtitle}</p></div><a class="button button-primary" href="${officialUrl}" target="_blank" rel="noopener">打开官方地图</a></div><div class="pdf-map"><iframe src="${pdfUrl}#view=FitH" title="${city}官方完整线路图" loading="lazy"><a href="${officialUrl}" target="_blank" rel="noopener">打开官方路线图</a></iframe></div><div class="network-notes">${notes.map((note) => `<p>${note}</p>`).join('')}</div></article>`;
}
function transitHtml() {
  const osaka = { city: '大阪 Metro', subtitle: '全线地铁与 New Tram 路网', pdfUrl: 'https://subway.osakametro.co.jp/img/osakametro_rosenzu.pdf', officialUrl: 'https://subway.osakametro.co.jp/guide/routemap.php', notes: ['本次常用：御堂筋线，淀屋桥 M17，难波 M20。', '机场抵达后，南海电铁到难波，再接御堂筋线至淀屋桥。', '打开官方交互图可放大并点击站号查看站点信息。'] };
  const kyoto = { city: '京都市营地铁与市巴士', subtitle: '简体中文地下铁全线与主要观光巴士路线', pdfUrl: 'https://www.city.kyoto.lg.jp/kotsu/page/cmsfiles/contents/0000019/19770/CHS%28map%29260320busnavi.pdf', officialUrl: 'https://www.city.kyoto.lg.jp/kotsu/page/0000019770.html', notes: ['本次关键：京都站 K11，四条 K09，乌丸御池 K08 / T13，二条城前 T16。', '东山、岚山等地公交易拥堵，优先检查铁路或步行替代方案。', '此图含主要观光巴士，适合在酒店出发前确认上车点。'] };
  return `<section class="transit-hero"><p class="kicker">独立导航页</p><h1>路线先看全图，再走当日。</h1><p>这里嵌入官方完整路网。每张行程卡的高亮线路示意只说明本次移动段，不替代运营方的实时导航。</p></section><section class="transit-guide"><div><p class="kicker">本次最常用的换乘</p><h2>三个关键枢纽</h2></div><ol><li><b>淀屋桥 M17</b><span>大阪住宿基点，御堂筋线连接梅田、心斋桥、难波。</span></li><li><b>京都站 K11</b><span>京都到机场 HARUKA、JR 与地铁的重要交汇点。</span></li><li><b>乌丸御池 K08 / T13</b><span>烏丸线与东西线换乘点，前往二条城方向时实用。</span></li></ol></section><section class="network-map-list">${transitMapCard(osaka)}${transitMapCard(kyoto)}</section>`;
}
function render() { const view = isTransitView() ? transitHtml() : currentView() ? dayHtml(currentView()) : overviewHtml(); app.innerHTML = `<div class="app-shell">${navHtml()}<section class="page-content">${view}</section></div>`; document.querySelector('#session-label').textContent = state.session ? `${state.session.nickname} · 编辑中` : '公开浏览'; document.querySelector('#editor-button').textContent = state.session ? '退出编辑模式' : '进入编辑模式'; bindDynamicEvents(); const focused = currentBlock(); if (focused) requestAnimationFrame(() => document.getElementById(focused.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })); }
function bindDynamicEvents() {
  document.querySelector('#editor-button').onclick = () => { if (state.session) { sessionStorage.removeItem(sessionKey); state.session = null; render(); showToast('已退出编辑模式'); } else editorDialog.showModal(); };
  document.querySelector('#history-button').onclick = openHistory;
  document.querySelectorAll('.edit-card').forEach((button) => button.onclick = () => openBlockEditor(button.dataset.id));
  document.querySelectorAll('.delete-card').forEach((button) => button.onclick = () => deleteBlock(button.dataset.id));
  document.querySelectorAll('.expand-card').forEach((button) => button.onclick = () => {
    const id = button.dataset.id;
    const expanded = button.getAttribute('aria-expanded') === 'true';
    if (expanded) {
      state.expanded.delete(id);
      state.collapsed.add(id);
    } else {
      const focusedId = currentBlock()?.id;
      state.expanded.clear();
      state.collapsed.clear();
      if (focusedId && focusedId !== id) state.collapsed.add(focusedId);
      state.expanded.add(id);
    }
    render();
  });
  document.querySelectorAll('.itinerary-block[draggable="true"]').forEach((item) => { item.addEventListener('dragstart', () => { state.dragId = item.dataset.blockId; item.classList.add('dragging'); }); item.addEventListener('dragend', () => { state.dragId = null; item.classList.remove('dragging'); }); item.addEventListener('dragover', (event) => event.preventDefault()); item.addEventListener('drop', (event) => reorder(event, item)); });
}
async function reorder(event, target) { event.preventDefault(); if (!state.dragId || state.dragId === target.dataset.blockId) return; const list = target.closest('.block-list'); const cards = [...list.querySelectorAll('.itinerary-block')]; const ids = cards.map((card) => card.dataset.blockId); ids.splice(ids.indexOf(state.dragId), 1); ids.splice(ids.indexOf(target.dataset.blockId), 0, state.dragId); try { const data = await api('/api/blocks/reorder', { method: 'POST', body: JSON.stringify({ ...state.session, dayId: list.dataset.dayId, orderedIds: ids }) }); state.data = data; render(); showToast('已调整显示顺序，时间保持不变'); } catch (error) { showToast(error.message, true); } }
function findBlock(id) { for (const day of state.data.days) { const block = day.blocks.find((item) => item.id === id); if (block) return { day, block }; } return null; }
function openBlockEditor(id) { const found = findBlock(id); if (!found) return; state.editingId = id; const form = document.querySelector('#block-form'); for (const [key, value] of Object.entries(found.block)) { const field = form.elements.namedItem(key); if (field && typeof value === 'string') field.value = value; } form.elements.overrideReason.value = ''; document.querySelector('#block-error').hidden = true; document.querySelector('#block-dialog-title').textContent = found.block.title; blockDialog.showModal(); }
async function deleteBlock(id) { const found = findBlock(id); if (!found || !confirm(`删除「${found.block.title}」？此操作会写入历史记录。`)) return; try { state.data = await api('/api/blocks/delete', { method: 'POST', body: JSON.stringify({ ...state.session, blockId: id }) }); render(); showToast('行程卡已删除'); } catch (error) { showToast(error.message, true); } }
document.querySelector('#close-editor').onclick = () => editorDialog.close();
document.querySelector('#close-block').onclick = () => blockDialog.close();
document.querySelector('#editor-form').addEventListener('submit', async (event) => { event.preventDefault(); const code = document.querySelector('#invite-code').value; const nickname = document.querySelector('#nickname').value; const errorBox = document.querySelector('#auth-error'); try { state.session = await api('/api/session', { method: 'POST', body: JSON.stringify({ code, nickname }) }); sessionStorage.setItem(sessionKey, JSON.stringify(state.session)); editorDialog.close(); render(); showToast('已进入编辑模式'); } catch (error) { errorBox.textContent = error.message; errorBox.hidden = false; } });
document.querySelector('#block-form').addEventListener('submit', async (event) => { event.preventDefault(); const found = findBlock(state.editingId); if (!found) return; const form = new FormData(event.currentTarget); const block = { ...found.block, ...Object.fromEntries(form.entries()) }; const errorBox = document.querySelector('#block-error'); try { state.data = await api('/api/blocks/save', { method: 'POST', body: JSON.stringify({ ...state.session, block, overrideReason: form.get('overrideReason') }) }); blockDialog.close(); render(); showToast('修改已同步'); } catch (error) { errorBox.textContent = error.message + (error.requiresOverride ? ' 如需保留实际情况，请填写覆盖理由后再次保存。' : ''); errorBox.hidden = false; } });
async function openHistory() { try { const { history } = await api('/api/history'); document.querySelector('#history-list').innerHTML = history.length ? history.map((entry) => `<article class="history-entry"><strong>${escapeHtml(entry.nickname)} · ${escapeHtml(entry.action)}</strong><p>${escapeHtml(entry.blockTitle || '行程')} ${entry.overrideReason ? `· 覆盖理由：${escapeHtml(entry.overrideReason)}` : ''}</p><time>${new Date(entry.at).toLocaleString('zh-CN')}</time>${state.session && entry.before && entry.blockId ? `<br><button class="button button-quiet restore-history" data-log="${entry.id}">恢复此版本</button>` : ''}</article>`).join('') : '<p class="dialog-copy">还没有变更记录。</p>'; document.querySelectorAll('.restore-history').forEach((button) => button.onclick = () => restoreHistory(button.dataset.log)); historyDialog.showModal(); } catch (error) { showToast(error.message, true); } }
async function restoreHistory(logId) { if (!confirm('恢复后会以当前身份新增一条记录，是否继续？')) return; try { state.data = await api('/api/history/restore', { method: 'POST', body: JSON.stringify({ ...state.session, logId }) }); historyDialog.close(); render(); showToast('已恢复历史版本'); } catch (error) { showToast(error.message, true); } }
document.querySelector('#close-history').onclick = () => historyDialog.close();
// 公开阅读页没有拖放编辑需求，统一禁用浏览器对链接、按钮和图片的原生拖拽预览。
document.addEventListener('dragstart', (event) => event.preventDefault());

// 移动端把地图入口放在正文之后：旅途中先看下一步怎么走，再按需打开地图。
function dayHtml(day) {
  const index = state.data.days.indexOf(day) + 1;
  const focused = selectedBlock(day);
  const timeline = day.blocks.map((block, stepIndex) => {
    const isActive = focused?.id === block.id;
    return `<a href="#${day.id}/${block.id}" class="timeline-step ${isActive ? 'active' : ''} ${stepIndex === day.blocks.length - 1 ? 'is-last' : ''}" ${isActive ? 'aria-current="step"' : ''} style="--timeline-index:${stepIndex}"><span class="timeline-step-node" aria-hidden="true"></span><span class="timeline-step-copy"><strong class="timeline-step-time">${escapeHtml(block.start)}</strong><span class="timeline-step-title">${escapeHtml(block.title)}</span></span></a>`;
  }).join('');
  const mapTitle = `定位：${escapeHtml(focused.title)}`;
  const mapDescription = `地图已跟随时间轴定位到 ${escapeHtml(focused.place)}。`;
  const mapCard = `<section class="day-map-bottom"><aside class="map-card">${mapHtml(day, focused)}<div class="map-card-copy"><h2>${mapTitle}</h2><p>${mapDescription}</p><a href="${mapLink(day, focused)}" target="_blank" rel="noopener">打开 Google Maps</a></div></aside></section>`;
  return `<section class="day-header" style="background-image:linear-gradient(90deg,rgba(9,38,42,.93),rgba(9,38,42,.60)),url('${escapeHtml(day.image)}');background-position:center;background-size:cover"><span class="day-header-mark" aria-hidden="true">${daySymbol(day.id)}</span><div><p class="kicker">DAY ${String(index).padStart(2, '0')} · ${formatDate(day.date)} ${escapeHtml(day.weekday)}</p><h1>${escapeHtml(day.title)}</h1><p>${escapeHtml(day.theme)}</p><p class="image-credit">图片：${escapeHtml(day.imageSource)} · 正式发布前请逐张复核使用范围</p></div></section>${dailyPreflightHtml()}${dailyHighlightsHtml(day)}<section class="day-flow"><div class="timeline-panel ${day.blocks.length > 7 ? 'timeline-panel-wide' : ''}"><div class="panel-title"><h2>当天时间轴</h2></div><nav class="timeline" aria-label="当天行程时间轴">${timeline}</nav></div></section><section class="itinerary itinerary-single"><div class="block-list" data-day-id="${day.id}">${blockHtml(day, focused)}</div></section>${mapCard}`;
}

// 公开版使用单卡阅读流；旧的协作代码保留在文件中以兼容既有数据，
// 但不再绑定任何章节展开、删除、排序或历史恢复入口。
function bindDynamicEvents() {
  document.querySelector('#mobile-preview').onclick = () => {
    const dialog = document.querySelector('#phone-preview-dialog');
    document.querySelector('#phone-preview-frame').src = `${location.pathname}${location.hash || '#home'}`;
    dialog.showModal();
  };
  document.querySelector('#close-phone-preview').onclick = () => document.querySelector('#phone-preview-dialog').close();
  document.querySelectorAll('.recommendation-toggle').forEach((button) => button.onclick = () => {
    const panel = button.closest('.recommendation-panel');
    const shouldExpand = button.getAttribute('aria-expanded') !== 'true';
    const content = panel.querySelector('.recommendation-content');
    panel.classList.toggle('is-expanded', shouldExpand);
    button.setAttribute('aria-expanded', String(shouldExpand));
    content.hidden = !shouldExpand;
  });
  document.querySelector('#close-map-lightbox').onclick = () => document.querySelector('#map-lightbox').close();
  const lightbox = document.querySelector('#map-lightbox');
  const lightboxImage = document.querySelector('#map-lightbox-image');
  let zoomScale = 1;
  let pinchStartDistance = 0;
  const applyZoom = () => { lightboxImage.style.transform = `scale(${zoomScale})`; lightboxImage.style.cursor = zoomScale > 1 ? 'zoom-out' : 'zoom-in'; };
  const setZoom = (next) => { zoomScale = Math.min(4, Math.max(1, next)); applyZoom(); };
  document.querySelector('#map-zoom-in').onclick = () => setZoom(zoomScale + .25);
  document.querySelector('#map-zoom-out').onclick = () => setZoom(zoomScale - .25);
  document.querySelector('#map-zoom-reset').onclick = () => setZoom(1);
  lightboxImage.onwheel = (event) => { event.preventDefault(); setZoom(zoomScale + (event.deltaY < 0 ? .2 : -.2)); };
  lightboxImage.ontouchstart = (event) => { if (event.touches.length === 2) { const [a,b] = event.touches; pinchStartDistance = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY); } };
  lightboxImage.ontouchmove = (event) => { if (event.touches.length !== 2 || !pinchStartDistance) return; event.preventDefault(); const [a,b] = event.touches; const distance = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY); setZoom(zoomScale * distance / pinchStartDistance); pinchStartDistance = distance; };
  lightboxImage.ontouchend = () => { pinchStartDistance = 0; };
  document.querySelectorAll('.map-image-button').forEach((button) => button.onclick = () => {
    const image = document.querySelector('#map-lightbox-image');
    image.src = button.dataset.image;
    image.alt = button.dataset.alt || '放大后的交通路线图';
    zoomScale = 1;
    applyZoom();
    document.querySelector('#map-lightbox').showModal();
  });
  const galleryDialog = document.querySelector('#photo-gallery-dialog');
  const galleryImage = document.querySelector('#photo-gallery-image');
  const galleryTitle = document.querySelector('#photo-gallery-title');
  const galleryCaption = document.querySelector('#photo-gallery-caption');
  const galleryThumbnails = document.querySelector('#photo-gallery-thumbnails');
  let galleryPhotos = [];
  let galleryBlockTitle = '';
  let galleryIndex = 0;
  let thumbnailOffset = 0;
  let thumbnailStartX = 0;
  let thumbnailStartOffset = 0;
  let thumbnailDragMoved = false;
  let suppressThumbnailClickUntil = 0;
  let galleryLoadId = 0;
  const setGalleryMode = (mode) => galleryDialog.classList.toggle('photo-gallery-dialog-single', mode === 'single');
  const moveThumbnailTrack = (nextOffset) => {
    const track = galleryThumbnails.querySelector('.photo-gallery-thumbnail-track');
    if (!track) return;
    const minOffset = Math.min(0, galleryThumbnails.clientWidth - track.scrollWidth);
    thumbnailOffset = Math.min(0, Math.max(minOffset, nextOffset));
    track.style.transform = `translateX(${thumbnailOffset}px)`;
  };
  const showGalleryPhoto = (nextIndex) => {
    if (!galleryPhotos.length) return;
    galleryIndex = (nextIndex + galleryPhotos.length) % galleryPhotos.length;
    galleryImage.alt = `${galleryBlockTitle} · 照片 ${galleryIndex + 1}`;
    galleryCaption.textContent = `${galleryIndex + 1} / ${galleryPhotos.length} · ${photoFileName(galleryPhotos[galleryIndex])}`;
    const loadId = ++galleryLoadId;
    const original = galleryPhotos[galleryIndex];
    galleryImage.classList.add('is-gallery-switching');
    galleryImage.removeAttribute('src');
    galleryImage.onload = () => {
      if (loadId !== galleryLoadId) return;
      galleryImage.classList.remove('is-gallery-switching');
    };
    galleryImage.onerror = () => {
      if (loadId !== galleryLoadId) return;
      galleryImage.classList.remove('is-gallery-switching');
      galleryImage.classList.remove('is-loading-original');
    };
    galleryImage.classList.add('is-loading-original');
    galleryImage.src = photoVariant(original, 'photo-previews');
    const fullImage = new Image();
    fullImage.decoding = 'async';
    fullImage.src = original;
    fullImage.onload = () => {
      if (loadId !== galleryLoadId) return;
      galleryImage.src = original;
      galleryImage.classList.remove('is-loading-original');
    };
    [-1, 1].forEach((offset) => {
      const adjacent = galleryPhotos[(galleryIndex + offset + galleryPhotos.length) % galleryPhotos.length];
      const preload = new Image();
      preload.decoding = 'async';
      preload.src = adjacent;
    });
    galleryThumbnails.querySelectorAll('button').forEach((button, index) => {
      const active = index === galleryIndex;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-current', active ? 'true' : 'false');
    });
  };
  document.querySelector('#close-photo-gallery').onclick = () => galleryDialog.close();
  galleryDialog.onclose = () => setGalleryMode('multi');
  document.querySelector('#photo-gallery-prev').onclick = () => showGalleryPhoto(galleryIndex - 1);
  document.querySelector('#photo-gallery-next').onclick = () => showGalleryPhoto(galleryIndex + 1);
  document.querySelectorAll('.photo-stack-open').forEach((button) => button.onclick = () => {
    setGalleryMode('multi');
    const found = findBlock(button.dataset.galleryId);
    galleryPhotos = itineraryPhotos[button.dataset.galleryId] || [];
    galleryBlockTitle = found?.block.title || '行程照片';
    galleryTitle.textContent = galleryBlockTitle;
    galleryThumbnails.innerHTML = `<div class="photo-gallery-thumbnail-track">${galleryPhotos.map((src, index) => `<button type="button" data-photo-index="${index}" aria-label="查看文件 ${escapeHtml(photoFileName(src))}"><img src="${photoVariant(src, 'photo-thumbs')}" alt="${escapeHtml(photoFileName(src))}" loading="lazy" decoding="async"></button>`).join('')}</div>`;
    thumbnailOffset = 0;
    suppressThumbnailClickUntil = 0;
    galleryThumbnails.querySelectorAll('button').forEach((thumbnail) => {
      // 一些移动浏览器会先把焦点交给按钮再派发 click；这里作为同等的单击入口。
      thumbnail.onfocus = () => setTimeout(() => {
        if (!galleryThumbnails.classList.contains('is-dragging') && Date.now() >= suppressThumbnailClickUntil) {
          showGalleryPhoto(Number(thumbnail.dataset.photoIndex));
        }
      }, 0);
    });
    moveThumbnailTrack(0);
    showGalleryPhoto(0);
    galleryDialog.showModal();
  });
  document.querySelectorAll('.food-photo-button').forEach((button) => button.onclick = () => {
    setGalleryMode('single');
    galleryPhotos = [button.dataset.foodImage];
    galleryBlockTitle = button.dataset.foodTitle || '美食推荐';
    galleryTitle.textContent = galleryBlockTitle;
    galleryThumbnails.innerHTML = '';
    thumbnailOffset = 0;
    suppressThumbnailClickUntil = 0;
    moveThumbnailTrack(0);
    showGalleryPhoto(0);
    galleryDialog.showModal();
  });
  galleryThumbnails.onpointerdown = (event) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    thumbnailStartX = event.clientX;
    thumbnailStartOffset = thumbnailOffset;
    thumbnailDragMoved = false;
    galleryThumbnails.classList.add('is-dragging');
    galleryThumbnails.setPointerCapture(event.pointerId);
  };
  galleryThumbnails.onpointermove = (event) => {
    if (!galleryThumbnails.classList.contains('is-dragging')) return;
    const distance = event.clientX - thumbnailStartX;
    if (Math.abs(distance) > 6) thumbnailDragMoved = true;
    moveThumbnailTrack(thumbnailStartOffset + distance);
  };
  const finishThumbnailDrag = (event) => {
    if (!galleryThumbnails.classList.contains('is-dragging')) return;
    galleryThumbnails.classList.remove('is-dragging');
    const moved = thumbnailDragMoved;
    thumbnailDragMoved = false;
    if (moved) {
      // 拖动结束会紧跟一次浏览器 click；仅吞掉这一次，不能影响随后点击缩略图。
      suppressThumbnailClickUntil = Date.now() + 120;
      return;
    }
    const thumbnail = event?.target?.closest('button[data-photo-index]');
    if (thumbnail && galleryThumbnails.contains(thumbnail)) showGalleryPhoto(Number(thumbnail.dataset.photoIndex));
  };
  galleryThumbnails.addEventListener('click', (event) => {
    if (Date.now() >= suppressThumbnailClickUntil) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  }, true);
  galleryThumbnails.onclick = (event) => {
    const thumbnail = event.target.closest('button[data-photo-index]');
    if (!thumbnail || !galleryThumbnails.contains(thumbnail)) return;
    showGalleryPhoto(Number(thumbnail.dataset.photoIndex));
  };
  galleryThumbnails.onpointerup = finishThumbnailDrag;
  galleryThumbnails.onpointercancel = finishThumbnailDrag;
  document.querySelectorAll('.timeline a').forEach((link) => {
    link.onclick = (event) => {
      event.preventDefault();
      navigateToHash(link.getAttribute('href'), { scrollToTimeline: true });
    };
  });
  const timeline = document.querySelector('.timeline');
  if (timeline) {
    let timelineStartX = 0;
    let timelineStartScroll = 0;
    let timelineDragged = false;
    timeline.addEventListener('wheel', (event) => {
      if (timeline.scrollWidth <= timeline.clientWidth || Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
      event.preventDefault();
      timeline.scrollLeft += event.deltaY;
    }, { passive: false });
    timeline.addEventListener('pointerdown', (event) => {
      if (event.pointerType !== 'mouse' || event.button !== 0) return;
      timelineStartX = event.clientX;
      timelineStartScroll = timeline.scrollLeft;
      timelineDragged = false;
      timeline.classList.add('timeline-is-dragging');
      timeline.setPointerCapture(event.pointerId);
    });
    timeline.addEventListener('pointermove', (event) => {
      if (!timeline.classList.contains('timeline-is-dragging')) return;
      const distance = event.clientX - timelineStartX;
      if (Math.abs(distance) > 5) timelineDragged = true;
      timeline.scrollLeft = timelineStartScroll - distance;
    });
    const stopTimelineDrag = () => {
      if (!timeline.classList.contains('timeline-is-dragging')) return;
      timeline.classList.remove('timeline-is-dragging');
      if (timelineDragged) setTimeout(() => { timelineDragged = false; }, 0);
    };
    timeline.addEventListener('pointerup', stopTimelineDrag);
    timeline.addEventListener('pointercancel', stopTimelineDrag);
    timeline.addEventListener('click', (event) => {
      if (!timelineDragged) return;
      event.preventDefault();
      event.stopPropagation();
      timelineDragged = false;
    }, true);
  }
  const dayNav = document.querySelector('.day-nav');
  if (dayNav) {
    let startX = 0;
    let startScroll = 0;
    let dragged = false;
    dayNav.addEventListener('pointerdown', (event) => {
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      // 鼠标轻点日期必须保留原生链接跳转；触屏使用浏览器的横向手势滚动。
      if (event.pointerType === 'mouse') return;
      startX = event.clientX;
      startScroll = dayNav.scrollLeft;
      dragged = false;
      dayNav.classList.add('is-dragging');
      dayNav.setPointerCapture(event.pointerId);
    });
    dayNav.addEventListener('pointermove', (event) => {
      if (!dayNav.classList.contains('is-dragging')) return;
      const distance = event.clientX - startX;
      if (Math.abs(distance) > 5) dragged = true;
      dayNav.scrollLeft = startScroll - distance;
    });
    const stopDrag = () => dayNav.classList.remove('is-dragging');
    dayNav.addEventListener('pointerup', stopDrag);
    dayNav.addEventListener('pointercancel', stopDrag);
    dayNav.addEventListener('click', (event) => {
      if (!dragged) return;
      event.preventDefault();
      event.stopPropagation();
      dragged = false;
    }, true);
    dayNav.addEventListener('dragstart', (event) => event.preventDefault());
    dayNav.querySelectorAll('a').forEach((link) => {
      link.addEventListener('click', (event) => {
        if (dragged) return;
        event.preventDefault();
        navigateToHash(link.getAttribute('href'));
      });
    });
  }
  const content = document.querySelector('.page-content');
  if (content) {
    let pageStartY = 0;
    let pageStartScroll = 0;
    let pageDragged = false;
    content.addEventListener('pointerdown', (event) => {
      // 真实触屏设备保留浏览器的惯性滚动；此分支让桌面手机预览也能像触屏一样拖动。
      if (event.pointerType !== 'mouse' || event.button !== 0 || event.target.closest('a, button, input, textarea, select, .day-nav')) return;
      pageStartY = event.clientY;
      pageStartScroll = window.scrollY;
      pageDragged = false;
      content.classList.add('is-page-dragging');
      content.setPointerCapture(event.pointerId);
    });
    content.addEventListener('pointermove', (event) => {
      if (!content.classList.contains('is-page-dragging')) return;
      const distance = event.clientY - pageStartY;
      if (Math.abs(distance) > 5) pageDragged = true;
      window.scrollTo({ top: pageStartScroll - distance, behavior: 'auto' });
    });
    const stopPageDrag = () => content.classList.remove('is-page-dragging');
    content.addEventListener('pointerup', stopPageDrag);
    content.addEventListener('pointercancel', stopPageDrag);
    content.addEventListener('click', (event) => {
      if (!pageDragged) return;
      event.preventDefault();
      event.stopPropagation();
      pageDragged = false;
    }, true);
  }
}

function centerActiveDayNav() {
  const dayNav = document.querySelector('.day-nav');
  const activeItem = dayNav?.querySelector('a.active');
  if (!dayNav || !activeItem || !window.matchMedia('(max-width: 720px)').matches) return;
  const targetLeft = activeItem.offsetLeft - (dayNav.clientWidth - activeItem.offsetWidth) / 2;
  dayNav.scrollLeft = Math.max(0, targetLeft);
}

function centerActiveTimelineStep({ behavior = 'auto' } = {}) {
  const timeline = document.querySelector('.timeline');
  const activeStep = timeline?.querySelector('.timeline-step.active');
  if (!timeline || !activeStep || timeline.scrollWidth <= timeline.clientWidth) return;
  const targetLeft = activeStep.offsetLeft - (timeline.clientWidth - activeStep.offsetWidth) / 2;
  timeline.scrollTo({ left: Math.max(0, targetLeft), behavior });
}

function scrollToTimelinePanel() {
  const panel = document.querySelector('.day-flow .timeline-panel');
  if (!panel) return;
  const headerHeight = document.querySelector('.site-header')?.getBoundingClientRect().height || 0;
  const mobileNavHeight = window.matchMedia('(max-width: 720px)').matches
    ? document.querySelector('.sidebar')?.getBoundingClientRect().height || 0
    : 0;
  const offset = headerHeight + mobileNavHeight + 12;
  const top = panel.getBoundingClientRect().top + window.scrollY - offset;
  const behavior = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
  window.scrollTo({ top: Math.max(0, top), behavior });
}

function render({ preserveScroll = false, scrollToBlockId = null, scrollToTimeline = false, resetScroll = false } = {}) {
  const previousScroll = preserveScroll ? window.scrollY : null;
  const view = isTransitView() ? transitHtml() : currentView() ? dayHtml(currentView()) : overviewHtml();
  app.innerHTML = `<div class="app-shell">${navHtml()}<section class="page-content">${view}</section></div>`;
  centerActiveDayNav();
  bindDynamicEvents();
  requestAnimationFrame(() => {
    centerActiveTimelineStep({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    if (scrollToTimeline) scrollToTimelinePanel();
  });
  if (resetScroll) window.scrollTo({ top: 0, behavior: 'auto' });
  if (previousScroll !== null) window.scrollTo({ top: previousScroll, behavior: 'auto' });
  if (scrollToBlockId) requestAnimationFrame(() => document.getElementById(scrollToBlockId)?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
}

// 路线页使用用户提供的高清图，点击卡片即可在灯箱中查看细节。
function transitMapCard({ city, subtitle, officialUrl, notes }) {
  const isOsaka = city.includes('大阪');
  const imageUrl = isOsaka ? './assets/osaka-metro.jpg' : './assets/kyoto-railway.jpg';
  const mapVisual = isOsaka ? `<div class="map-preview-with-pdf"><button class="map-image-button" data-image="./assets/osaka-metro-preview.png" data-alt="${city}高清路线图预览"><img src="./assets/osaka-metro-preview.png" alt="${city}高清路线图预览" loading="lazy"><span>点击放大查看</span></button><a class="map-pdf-open" href="./assets/osaka-metro.pdf" target="_blank" rel="noopener">打开高清 PDF</a></div>` : `<button class="map-image-button" data-image="${imageUrl}" data-alt="${city}高清路线图"><img src="${imageUrl}" alt="${city}高清路线图" loading="lazy"><span>点击放大查看</span></button>`;
  return `<article class="network-map-card"><div class="network-map-heading"><div><p class="kicker">高清路线图</p><h2>${city}</h2><p>${subtitle}</p></div><a class="button button-primary" href="${officialUrl}" target="_blank" rel="noopener">官方信息</a></div>${mapVisual}<div class="network-notes">${notes.map((note) => `<p>${note}</p>`).join('')}</div></article>`;
}

function transitHtml() {
  const osaka = { city: '大阪地铁', subtitle: '大阪 Metro 全线与 New Tram 路网', officialUrl: 'https://subway.osakametro.co.jp/guide/routemap.php', notes: ['常用：御堂筋线淀屋桥 M17、难波 M20。', '图中可直接查找线路颜色、站号与换乘关系。', '点击图片放大，手机可双指缩放。'] };
  const kyoto = { city: '京都铁路与地铁', subtitle: '京都市营地铁、私铁与主要观光线路', officialUrl: 'https://www.city.kyoto.lg.jp/kotsu/page/0000019770.html', notes: ['常用：京都站、四条、乌丸御池与宇治方向。', '图中保留线路编号与换乘站，适合现场核对。', '点击图片放大，手机可双指缩放。'] };
  return `<section class="transit-hero"><p class="kicker">独立导航页</p><h1>路线先看全图，再走当日。</h1><p>使用高清线路图快速确认颜色、站号与换乘关系；行程卡中的路线示意仍以运营方当天信息为准。</p></section><section class="transit-guide"><div><p class="kicker">本次最常用的换乘</p><h2>三个关键枢纽</h2></div><ol><li><b>淀屋桥 M17</b><span>大阪住宿基点，御堂筋线连接梅田、心斋桥、难波。</span></li><li><b>京都站 K11</b><span>京都到机场 HARUKA、JR 与地铁的重要交汇点。</span></li><li><b>乌丸御池 K08 / T13</b><span>烏丸线与东西线换乘点，前往二条城方向时实用。</span></li></ol></section><section class="network-map-list">${transitMapCard(osaka)}${transitMapCard(kyoto)}</section>`;
}

function navHtml() {
  return `<aside class="sidebar"><p class="side-label">行程导航</p><h2>八天路线</h2><nav class="day-nav" aria-label="按日期跳转"><a href="#home" class="${!currentView() && !isTransitView() ? 'active' : ''}"><span class="nav-day">总览</span><span class="nav-city">整体日程</span></a><a href="#transit" class="${isTransitView() ? 'active' : ''}"><span class="nav-day">路线</span><span class="nav-city">交通导航</span></a>${state.data.days.map((day, index) => `<a href="#${day.id}" class="${currentView()?.id === day.id ? 'active' : ''}"><span class="nav-day nav-day-date"><span>D${index + 1}/</span><span>${formatDate(day.date)}</span></span><span class="nav-copy"><span class="nav-city"><span class="nav-symbol" aria-hidden="true">${daySymbol(day.id)}</span>${escapeHtml(day.title)}</span><span class="nav-title">${escapeHtml(day.city)}</span></span></a>`).join('')}</nav><p class="side-note">交通图源直接来自运营方。班次、停运与站台以当天官方信息为准。</p></aside>`;
}

function navigateToHash(hash, { scrollToBlock = false, scrollToTimeline = false } = {}) {
  const previousDayId = currentView()?.id || null;
  const previousBlockId = selectedBlock()?.id || null;
  if (location.hash !== hash) history.pushState(null, '', hash);
  const nextDay = currentView();
  const nextBlock = currentBlock(nextDay) || nextDay?.blocks?.[0] || null;
  if (previousDayId === nextDay?.id && previousBlockId === nextBlock?.id) {
    state.selectedBlockId = nextBlock?.id || null;
    return;
  }
  preloadDayPhotos(routeParts()[0]);
  const routedBlock = currentBlock(nextDay);
  state.selectedBlockId = routedBlock?.id || null;
  render({ resetScroll: !scrollToBlock && !scrollToTimeline, scrollToBlockId: scrollToBlock ? routedBlock?.id : null, scrollToTimeline });
}

window.addEventListener('hashchange', () => {
  const routedBlock = currentBlock();
  state.selectedBlockId = routedBlock?.id || null;
  render({ resetScroll: !routedBlock });
});
if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
  const updates = new EventSource('/api/events');
  updates.addEventListener('itinerary', () => loadData(true));
}
loadData();
