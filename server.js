const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { URL } = require('node:url');

const ROOT = __dirname;
const DATA_PATH = path.join(ROOT, 'data', 'itinerary.json');
const PORT = Number(process.env.PORT || 4173);
const EDIT_INVITES = new Set((process.env.EDIT_INVITES || 'KIX2026,OSAKA4').split(',').map((value) => value.trim()).filter(Boolean));
const sessions = new Map();
const eventClients = new Set();
const MIME_TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8' };

function readData() { return JSON.parse(fs.readFileSync(DATA_PATH, 'utf8')); }
function writeData(data) { fs.writeFileSync(DATA_PATH, `${JSON.stringify(data, null, 2)}\n`, 'utf8'); }
function reply(res, status, payload) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(payload));
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => { raw += chunk; if (raw.length > 1_000_000) req.destroy(); });
    req.on('end', () => { try { resolve(JSON.parse(raw || '{}')); } catch { reject(new Error('请求体不是有效 JSON')); } });
  });
}
function safePublicData(data) {
  const { invites, ...publicData } = data;
  return publicData;
}
function findBlock(data, blockId) {
  for (const day of data.days) {
    const index = day.blocks.findIndex((block) => block.id === blockId);
    if (index !== -1) return { day, index, block: day.blocks[index] };
  }
  return null;
}
function validateBlock(block, day) {
  const errors = [];
  if (!block.title?.trim()) errors.push('请填写行程名称。');
  if (!block.start || !block.end) errors.push('请填写开始和结束时间。');
  if (block.start && block.end && block.end <= block.start) errors.push('结束时间必须晚于开始时间。');
  const fixed = day.blocks.filter((item) => item.id !== block.id && item.fixed);
  const overlap = fixed.find((item) => block.start < item.end && block.end > item.start);
  if (overlap) errors.push(`与固定项目「${overlap.title}」时间冲突。`);
  return errors;
}
function addHistory(data, entry) {
  data.history.unshift({ id: `log-${Date.now()}`, at: new Date().toISOString(), ...entry });
  data.history = data.history.slice(0, 80);
}
function broadcastChange() {
  for (const client of eventClients) client.write('event: itinerary\ndata: changed\n\n');
}
function editorFrom(body) {
  const session = sessions.get(body?.token);
  return session && session.nickname === body?.nickname ? session : null;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  try {
    if (req.method !== 'GET') return reply(res, 405, { error: '本站为公开只读行程，不提供在线编辑。' });
    if (req.method === 'GET' && url.pathname === '/api/itinerary') return reply(res, 200, safePublicData(readData()));
    if (req.method === 'GET' && url.pathname === '/api/history') return reply(res, 200, { history: readData().history });
    if (req.method === 'GET' && url.pathname === '/api/events') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
      res.write('event: connected\ndata: ready\n\n'); eventClients.add(res);
      req.on('close', () => eventClients.delete(res)); return;
    }
    if (req.method === 'POST' && url.pathname === '/api/session') {
      const { code, nickname } = await readBody(req);
      if (!EDIT_INVITES.has(String(code || '').trim().toUpperCase())) return reply(res, 401, { error: '邀请码无效。' });
      if (!String(nickname || '').trim() || String(nickname).trim().length > 16) return reply(res, 400, { error: '昵称需为 1 至 16 个字符。' });
      const cleanName = String(nickname).trim(); const token = crypto.randomUUID();
      sessions.set(token, { nickname: cleanName, createdAt: Date.now() });
      return reply(res, 200, { nickname: cleanName, role: 'editor', token });
    }
    if (req.method === 'POST' && url.pathname === '/api/blocks/save') {
      const body = await readBody(req); const { nickname, block, overrideReason = '' } = body;
      if (!editorFrom(body) || !block?.id) return reply(res, 401, { error: '请先进入编辑模式。' });
      const data = readData(); const found = findBlock(data, block.id);
      if (!found) return reply(res, 404, { error: '未找到这条行程。' });
      const candidate = { ...found.block, ...block, title: String(block.title || '').trim(), place: String(block.place || '').trim() };
      const errors = validateBlock(candidate, found.day);
      if (errors.length && !String(overrideReason).trim()) return reply(res, 409, { error: errors.join(' '), conflicts: errors, requiresOverride: true });
      const before = { title: found.block.title, start: found.block.start, end: found.block.end, place: found.block.place, status: found.block.status };
      found.day.blocks[found.index] = { ...candidate, riskOverride: errors.length ? String(overrideReason).trim() : '' };
      addHistory(data, { nickname, action: '更新行程卡', blockId: candidate.id, blockTitle: candidate.title, before, after: { title: candidate.title, start: candidate.start, end: candidate.end, place: candidate.place, status: candidate.status }, overrideReason: errors.length ? String(overrideReason).trim() : '' });
      writeData(data); broadcastChange(); return reply(res, 200, safePublicData(data));
    }
    if (req.method === 'POST' && url.pathname === '/api/blocks/delete') {
      const body = await readBody(req); const { nickname, blockId } = body; const data = readData(); const found = findBlock(data, blockId);
      if (!editorFrom(body) || !found) return reply(res, 400, { error: '删除请求无效。' });
      if (found.block.fixed) return reply(res, 409, { error: '固定项目不能直接删除，请先将其改为取消状态并填写说明。' });
      found.day.blocks.splice(found.index, 1); addHistory(data, { nickname, action: '删除行程卡', blockId, blockTitle: found.block.title, before: found.block, after: null }); writeData(data); broadcastChange();
      return reply(res, 200, safePublicData(data));
    }
    if (req.method === 'POST' && url.pathname === '/api/blocks/reorder') {
      const body = await readBody(req); const { nickname, dayId, orderedIds } = body; const data = readData(); const day = data.days.find((item) => item.id === dayId);
      if (!editorFrom(body) || !day || !Array.isArray(orderedIds) || orderedIds.length !== day.blocks.length) return reply(res, 400, { error: '排序请求无效。' });
      const byId = new Map(day.blocks.map((block) => [block.id, block]));
      if (orderedIds.some((id) => !byId.has(id))) return reply(res, 400, { error: '排序中包含未知行程。' });
      day.blocks = orderedIds.map((id) => byId.get(id)); addHistory(data, { nickname, action: '调整行程顺序', blockId: dayId, blockTitle: day.title, before: null, after: { orderedIds } }); writeData(data); broadcastChange();
      return reply(res, 200, safePublicData(data));
    }
    if (req.method === 'POST' && url.pathname === '/api/history/restore') {
      const body = await readBody(req); const { nickname, logId } = body; const data = readData(); const log = data.history.find((item) => item.id === logId);
      if (!editorFrom(body) || !log?.before || !log.blockId) return reply(res, 400, { error: '该记录不能恢复。' });
      const found = findBlock(data, log.blockId); if (!found) return reply(res, 404, { error: '原行程卡已不存在。' });
      const current = { ...found.block }; found.day.blocks[found.index] = { ...found.block, ...log.before };
      addHistory(data, { nickname, action: '恢复历史版本', blockId: log.blockId, blockTitle: found.block.title, before: current, after: log.before, restoredFrom: logId }); writeData(data); broadcastChange();
      return reply(res, 200, safePublicData(data));
    }
    const requested = url.pathname === '/' ? '/index.html' : url.pathname;
    const filePath = path.resolve(ROOT, `.${requested}`);
    if (!filePath.startsWith(ROOT) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) return reply(res, 404, { error: '未找到资源。' });
    res.writeHead(200, { 'Content-Type': MIME_TYPES[path.extname(filePath)] || 'application/octet-stream' }); fs.createReadStream(filePath).pipe(res);
  } catch (error) { reply(res, 500, { error: error.message || '服务发生错误。' }); }
});
server.listen(PORT, () => console.log(`关西行程网站已启动：http://localhost:${PORT}`));
