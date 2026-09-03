const app = document.querySelector('#app');
const editorDialog = document.querySelector('#editor-dialog');
const blockDialog = document.querySelector('#block-dialog');
const historyDialog = document.querySelector('#history-dialog');
const toast = document.querySelector('#toast');
const sessionKey = 'kansai-editor-session';
let state = { data: null, session: null, editingId: null, dragId: null, expanded: new Set(), collapsed: new Set() };

const escapeHtml = (value = '') => String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
const statusClass = (status) => status === '已确认' ? 'confirmed' : status === '备选' || status === '取消' ? 'option' : 'check';
const formatDate = (date) => new Intl.DateTimeFormat('zh-CN', { month: 'short', day: 'numeric' }).format(new Date(`${date}T12:00:00`));
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
function mapHtml(day) {
  const focus = currentBlock(day);
  const query = focus?.place || day.mapQuery;
  const source = `https://www.google.com/maps?q=${encodeURIComponent(query)}&z=13&output=embed`;
  return `<div class="map-panel"><iframe title="${escapeHtml(focus ? focus.title : day.title)}地图" loading="lazy" referrerpolicy="no-referrer-when-downgrade" src="${source}"></iframe></div>`;
}
function guideFor(block) {
  const common = `<section class="guide-section"><p class="guide-label">本段目标</p><p>${escapeHtml(block.description)}</p></section><section class="guide-section"><p class="guide-label">行动清单</p><p>${escapeHtml(block.action)}</p></section>`;
  const byType = {
    '交通': `<section class="guide-section"><p class="guide-label">换乘与时间</p><p>出发前核对站台、线路方向和电子票。到达后先确认下一段的集合点或出口，再决定是否停留购物。</p></section><section class="guide-section"><p class="guide-label">现场判断</p><p>若比计划晚 15 分钟以上，优先保住下一项固定预约；不要用压缩步行缓冲来弥补延误。</p></section>`,
    '航班': `<section class="guide-section"><p class="guide-label">登机前核对</p><p>护照、登机牌、行李重量与充电宝位置应在排队前完成核对。柜台、登机口和托运规则以航空公司当天通知为准。</p></section><section class="guide-section"><p class="guide-label">延误处理</p><p>出现延误时先保留实际时间记录，再将抵达后的弹性项目降级；固定项目冲突需填写覆盖原因。</p></section>`,
    '景点': `<section class="guide-section"><p class="guide-label">游览顺序</p><p>先处理最晚入场或需预约的区域，再保留自由拍摄与商店浏览时间。尊重禁止拍摄、单行通行和私人区域标识。</p></section><section class="guide-section"><p class="guide-label">拍摄与打卡</p><p>${escapeHtml(block.recommendation)} 现场以不阻塞动线为前提，人物合照安排在主取景点之外完成。</p></section>`,
    '餐饮': `<section class="guide-section"><p class="guide-label">点餐策略</p><p>到店先确认排队时长、最后点单与付款方式。四人可优先分食招牌品，避免单点过多挤占下一段时间。</p></section><section class="guide-section"><p class="guide-label">预约失败时</p><p>等位超过预留时间时执行备选，不把用餐延误带入固定交通或酒店入住时段。</p></section>`,
    '酒店': `<section class="guide-section"><p class="guide-label">入住动作</p><p>办理前确认行李寄存、入住和退房时限；房卡、房间分配和翌日出发时间由同行成员当场同步。</p></section><section class="guide-section"><p class="guide-label">离店检查</p><p>离店前检查插座、保险箱、浴室和床下；证件、药品和充电设备必须随身携带。</p></section>`,
    '购物': `<section class="guide-section"><p class="guide-label">采购方法</p><p>先按清单购买难替代或易售罄商品，再选择补货。结账前确认免税、保冷、易碎品包装与行李重量。</p></section><section class="guide-section"><p class="guide-label">时间边界</p><p>商店营业时间与库存属于动态信息；接近闭店或下一项固定行程时立即收尾。</p></section>`,
    '休整': `<section class="guide-section"><p class="guide-label">恢复节奏</p><p>补水、整理随身物品并确认次日闹钟。若当日已延误，优先休整而不是把非核心项目塞回晚上。</p></section><section class="guide-section"><p class="guide-label">同行协作</p><p>用这一时段同步照片、伴手礼、预约截图和第二天集合时间，避免在出发时再逐项确认。</p></section>`
  };
  return `${common}${byType[block.type] || byType['休整']}<section class="guide-section guide-verification"><p class="guide-label">出发前再检查</p><p>交通班次、票价、营业时间、预约结果与天气。把变动直接写进对应行程卡，避免出发当天反复翻找不同来源。</p></section>`;
}
function blockHtml(day, block) {
  const canEdit = Boolean(state.session);
  const expanded = state.expanded.has(block.id) || currentBlock(day)?.id === block.id;
  const risk = block.riskOverride ? `<p class="risk-note critical"><strong>风险覆盖：</strong>${escapeHtml(block.riskOverride)}</p>` : block.risk ? `<p class="risk-note"><strong>风险：</strong>${escapeHtml(block.risk)}。备用：${escapeHtml(block.fallback || '现场确认')}</p>` : '';
  return `<article class="itinerary-block ${expanded ? 'is-expanded' : ''}" id="${block.id}" draggable="${canEdit}" data-block-id="${block.id}"><div class="block-time">${escapeHtml(block.start)}<span>至 ${escapeHtml(block.end)}</span></div><div class="block-body"><div class="block-heading"><button class="block-toggle expand-card" data-id="${block.id}" aria-expanded="${expanded}" aria-controls="detail-${block.id}"><span><h3>${escapeHtml(block.title)}</h3><p class="block-place">${escapeHtml(block.place)}</p></span><span class="expand-affordance">${expanded ? '收起' : '展开'}</span></button><div class="block-actions"><span class="badge badge-${statusClass(block.status)}">${escapeHtml(block.status)}</span>${canEdit ? `<button class="icon-button edit-card" data-id="${block.id}" aria-label="编辑 ${escapeHtml(block.title)}">编辑</button>${block.fixed ? '' : `<button class="icon-button delete-card" data-id="${block.id}" aria-label="删除 ${escapeHtml(block.title)}">×</button>`}` : ''}</div></div><p class="block-summary">${escapeHtml(block.action)}</p><div id="detail-${block.id}" class="block-detail" ${expanded ? '' : 'hidden'}><div class="detail-grid">${guideFor(block)}<aside class="media-slot"><span>图片素材位</span><small>后期人工替换<br>需确认来源与使用权</small></aside></div><div class="detail-row"><span class="detail-chip">${escapeHtml(block.type)}</span><span class="detail-chip">${escapeHtml(block.transport || '现场步行')}</span><span class="detail-chip">${escapeHtml(block.cost || '费用待定')}</span>${block.fixed ? '<span class="detail-chip">固定项目</span>' : '<span class="detail-chip">可调整</span>'}</div><p class="recommendation"><strong>本段提示</strong> ${escapeHtml(block.recommendation || '按当天开放与人流情况调整。')}</p>${risk}</div></div></article>`;
}
function transportDiagram(block) {
  if (block.type !== '交通') return '';
  const stops = block.place.split('→').map((stop) => stop.trim()).filter(Boolean);
  if (stops.length < 2) return '';
  const nodes = stops.map((stop, index) => `${index ? '<span class="route-connector" aria-hidden="true"></span>' : ''}<span class="route-stop ${index === 0 ? 'route-origin' : index === stops.length - 1 ? 'route-destination' : ''}"><i></i><b>${escapeHtml(stop)}</b></span>`).join('');
  const transferSteps = stops.slice(1, -1).map((stop) => `<li><b>在「${escapeHtml(stop)}」换乘</b><span>下车后先看站内换乘标识；除非电子屏或站员明确提示，不要出闸。确认下一班车终点包含「${escapeHtml(stops.at(-1))}」方向后再上车。</span></li>`).join('');
  return `<figure class="transit-route"><figcaption><span>本次交通线路</span><strong>${escapeHtml(block.transport || '交通方式待核验')}</strong></figcaption><div class="route-track">${nodes}</div><ol class="ride-steps"><li><b>从「${escapeHtml(stops[0])}」进站</b><span>寻找「${escapeHtml(block.transport || '铁路 / 地铁')}」标识，用 ICOCA / Suica 或单程票刷闸。先看电子屏确认列车终点和发车时间。</span></li><li><b>上车后盯住站名</b><span>车内屏幕、车门上方路线图和站牌都会显示下一站。不要只凭颜色判断方向；听到站名后再准备下车。</span></li>${transferSteps}<li><b>抵达「${escapeHtml(stops.at(-1))}」</b><span>出闸前先打开地图确认出口与步行方向；若时间紧，优先按站内「出口」标识离站，不在闸机附近整理行李。</span></li></ol><p><b>${escapeHtml(block.start)} - ${escapeHtml(block.end)}</b> 是本段预留时间。此图为行程示意，站台、终点站显示、换乘与班次以当天电子屏和运营方信息为准。</p></figure>`;
}
function blockHtml(day, block) {
  const canEdit = Boolean(state.session);
  const expanded = state.expanded.has(block.id) || (currentBlock(day)?.id === block.id && !state.collapsed.has(block.id));
  const risk = block.riskOverride ? `<p class="risk-note critical"><strong>风险覆盖：</strong>${escapeHtml(block.riskOverride)}</p>` : block.risk ? `<p class="risk-note"><strong>风险：</strong>${escapeHtml(block.risk)}。备用：${escapeHtml(block.fallback || '现场确认')}</p>` : '';
  return `<article class="itinerary-block ${expanded ? 'is-expanded' : ''}" id="${block.id}" draggable="${canEdit}" data-block-id="${block.id}"><div class="block-time">${escapeHtml(block.start)}<span>至 ${escapeHtml(block.end)}</span></div><div class="block-body"><div class="block-heading"><button class="block-toggle expand-card" data-id="${block.id}" aria-expanded="${expanded}" aria-controls="detail-${block.id}"><span><h3>${escapeHtml(block.title)}</h3><p class="block-place">${escapeHtml(block.place)}</p></span><span class="expand-affordance">${expanded ? '收起' : '展开'}</span></button><div class="block-actions"><span class="badge badge-${statusClass(block.status)}">${escapeHtml(block.status)}</span>${canEdit ? `<button class="icon-button edit-card" data-id="${block.id}" aria-label="编辑 ${escapeHtml(block.title)}">编辑</button>${block.fixed ? '' : `<button class="icon-button delete-card" data-id="${block.id}" aria-label="删除 ${escapeHtml(block.title)}">×</button>`}` : ''}</div></div><p class="block-summary">${escapeHtml(block.action)}</p><div id="detail-${block.id}" class="block-detail" ${expanded ? '' : 'hidden'}>${transportDiagram(block)}<div class="detail-grid">${guideFor(block)}<aside class="media-slot"><span>图片素材位</span><small>后期人工替换<br>需确认来源与使用权</small></aside></div><p class="recommendation"><strong>本段提示</strong> ${escapeHtml(block.recommendation || '按当天开放与人流情况调整。')}</p>${risk}</div></div></article>`;
}
function dayHtml(day) {
  const index = state.data.days.indexOf(day) + 1;
  const focused = currentBlock(day);
  const timeline = day.blocks.map((block) => `<a href="#${day.id}/${block.id}" class="${focused?.id === block.id ? 'active' : ''}"><strong>${escapeHtml(block.start)}</strong>${escapeHtml(block.title)}</a>`).join('');
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
  const focused = currentBlock(day);
  const timeline = day.blocks.map((block) => `<a href="#${day.id}/${block.id}" class="${focused?.id === block.id ? 'active' : ''}"><strong>${escapeHtml(block.start)}</strong>${escapeHtml(block.title)}</a>`).join('');
  const mapTitle = focused ? `定位：${escapeHtml(focused.title)}` : '当日点位';
  const mapDescription = focused ? `地图已跟随时间轴定位到 ${escapeHtml(focused.place)}。` : '按卡片顺序查看当天路线。';
  const mapCard = `<aside class="map-card">${mapHtml(day)}<div class="map-card-copy"><h2>${mapTitle}</h2><p>${mapDescription}</p><a href="${mapLink(day, focused)}" target="_blank" rel="noopener">打开 Google Maps</a></div></aside>`;
  const mobileMap = `<aside class="mobile-map-card"><p>需要导航？</p><strong>${mapTitle}</strong><a href="${mapLink(day, focused)}" target="_blank" rel="noopener">在 Google Maps 中打开</a></aside>`;
  return `<section class="day-header" style="background-image:linear-gradient(90deg,rgba(9,38,42,.93),rgba(9,38,42,.60)),url('${escapeHtml(day.image)}');background-position:center;background-size:cover"><div><p class="kicker">DAY ${String(index).padStart(2, '0')} · ${formatDate(day.date)} ${escapeHtml(day.weekday)}</p><h1>${escapeHtml(day.title)}</h1><p>${escapeHtml(day.theme)}</p><p class="image-credit">图片：${escapeHtml(day.imageSource)} · 正式发布前请逐张复核使用范围</p></div></section><section class="day-layout"><div class="timeline-panel"><div class="panel-title"><h2>当天时间轴</h2></div><nav class="timeline" aria-label="当天行程时间轴">${timeline}</nav></div>${mapCard}</section><section class="itinerary"><div class="itinerary-title"><div><p class="kicker">完整章节</p><h2>时间留白，路线清楚</h2></div><p>${escapeHtml(day.hotel)}</p></div><div class="block-list" data-day-id="${day.id}">${day.blocks.map((block) => blockHtml(day, block)).join('')}</div>${mobileMap}</section>`;
}

// 公开版仅保留阅读与章节展开；旧的协作代码保留在文件中以兼容既有数据，
// 但不再绑定任何编辑、删除、排序或历史恢复入口。
function bindDynamicEvents() {
  document.querySelector('#mobile-preview').onclick = () => {
    const dialog = document.querySelector('#phone-preview-dialog');
    document.querySelector('#phone-preview-frame').src = `${location.pathname}${location.hash || '#home'}`;
    dialog.showModal();
  };
  document.querySelector('#close-phone-preview').onclick = () => document.querySelector('#phone-preview-dialog').close();
  document.querySelector('#close-map-lightbox').onclick = () => document.querySelector('#map-lightbox').close();
  document.querySelectorAll('.map-image-button').forEach((button) => button.onclick = () => {
    const image = document.querySelector('#map-lightbox-image');
    image.src = button.dataset.image;
    image.alt = button.dataset.alt || '放大后的交通路线图';
    document.querySelector('#map-lightbox').showModal();
  });
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
  document.querySelectorAll('.expand-card').forEach((button) => {
    button.onclick = () => {
      const id = button.dataset.id;
      const expanded = button.getAttribute('aria-expanded') === 'true';
      if (expanded) {
        state.expanded.delete(id);
        state.collapsed.add(id);
      } else {
        state.expanded.clear();
        state.collapsed.clear();
        state.expanded.add(id);
      }
      render();
    };
  });
}

function render() {
  const view = isTransitView() ? transitHtml() : currentView() ? dayHtml(currentView()) : overviewHtml();
  app.innerHTML = `<div class="app-shell">${navHtml()}<section class="page-content">${view}</section></div>`;
  bindDynamicEvents();
  const focused = currentBlock();
  if (focused) requestAnimationFrame(() => document.getElementById(focused.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
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
  return `<aside class="sidebar"><p class="side-label">行程导航</p><h2>八天路线</h2><nav class="day-nav" aria-label="按日期跳转"><a href="#home" class="${!currentView() && !isTransitView() ? 'active' : ''}"><span class="nav-day">总览</span><span class="nav-city">整体日程</span></a><a href="#transit" class="${isTransitView() ? 'active' : ''}"><span class="nav-day">路线</span><span class="nav-city">交通导航</span></a>${state.data.days.map((day, index) => `<a href="#${day.id}" class="${currentView()?.id === day.id ? 'active' : ''}"><span class="nav-day">D${index + 1}</span><span class="nav-city">${formatDate(day.date)}</span></a>`).join('')}</nav><p class="side-note">交通图源直接来自运营方。班次、停运与站台以当天官方信息为准。</p></aside>`;
}

window.addEventListener('hashchange', render);
if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
  const updates = new EventSource('/api/events');
  updates.addEventListener('itinerary', () => loadData(true));
}
loadData();
