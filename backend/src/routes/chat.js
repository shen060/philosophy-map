// AI 对话接口（方案 B：后端代理 + SSE 流式）
// 流程：校验登录 → 查哲学家语料 → 拼 system prompt → 转发 LLM → SSE 流式吐给前端
// LLM 走 OpenAI 兼容协议（DeepSeek/Kimi/混元 都兼容），零依赖用 Node 18+ 自带 fetch

const express = require('express');
const prisma = require('../lib/prisma');
const authMiddleware = require('../middleware/auth');
const rateLimit = require('../middleware/rateLimit');
const asyncHandler = require('../lib/asyncHandler');
const config = require('../lib/config');
const { formatPhilosopher } = require('../lib/format');

const router = express.Router();

// 对话限流：每用户每分钟 10 条（AI 调用有真金白银成本，必须比普通接口严）
const chatLimiter = rateLimit({
  windowMs: 60_000,
  max: 10,
  keyFn: (req) => 'chat:' + (req.user ? req.user.id : req.ip),
});

// ---- 输入约束（防滥用 / 控成本）----
const MAX_MESSAGES = 12;        // 只带最近 12 条历史
const MAX_CONTENT_LEN = 2000;   // 单条消息上限（字符）
const MAX_TOKENS = 1024;        // 单次回复 token 上限
const UPSTREAM_TIMEOUT_MS = 60_000;

function sanitizeMessages(raw) {
  if (!Array.isArray(raw)) return null;
  const msgs = raw
    .filter(m => m && typeof m === 'object')
    .filter(m => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .map(m => ({ role: m.role, content: m.content.slice(0, MAX_CONTENT_LEN) }));
  if (!msgs.length || msgs[msgs.length - 1].role !== 'user') return null; // 必须以用户消息收尾
  return msgs.slice(-MAX_MESSAGES);
}

// ---- 语料 → system prompt（复用 /:id/context 的数据，不注入全库）----
function buildSystemPrompt(p) {
  const lines = [];
  lines.push(`你是「哲学星图」中的 AI 哲学向导，正在和用户一起探讨哲学家「${p.name}」（${p.nameEn || ''}，${p.era || ''}，${p.nationality || ''}）。`
    + `用户刚在星图里点开了这位先哲，想更深入地了解TA——可能是思想细节、生平经历、时代背景，或想比较TA与其他哲学家的异同。`
    + `请以博学、亲切的讨论伙伴身份，围绕「${p.name}」与用户交流、答疑、展开讨论。`);
  lines.push(`\n【关于「${p.name}」的参考资料（讨论的主要依据）】`);
  if (p.coreIdea) lines.push(`核心思想：${p.coreIdea}`);
  if (p.biography) lines.push(`生平：${p.biography}`);
  if (p.historicalContext) lines.push(`时代背景：${p.historicalContext}`);
  if (p.school && p.school.length) lines.push(`学派：${p.school.join('、')}`);
  if (p.famousQuotes && p.famousQuotes.length) lines.push(`名言：${p.famousQuotes.join(' / ')}`);
  if (p.keyConcepts && p.keyConcepts.length) {
    lines.push(`关键概念：${p.keyConcepts.map(c => `${c.term}（${c.def || ''}）`).join('；')}`);
  }
  if (p.works && p.works.length) {
    lines.push(`主要著作：${p.works.map(w => w.title + (w.note ? `（${w.note}）` : '')).join('、')}`);
  }
  if (p.anecdotes && p.anecdotes.length) lines.push(`轶事：${p.anecdotes.join('；')}`);

  lines.push(`\n【对话规则】`);
  lines.push(`1. 你是讨论伙伴和向导，不是「${p.name}」本人：用第三人称介绍和评述TA，不要第一人称扮演，也不要声称自己是TA。`);
  lines.push(`2. 把对话当成一场哲学漫谈：用户问「为什么」「如果」「和某某比呢」时，给出有观点、有依据的分析，也可以适当反问，引导用户继续思考。`);
  lines.push(`3. 以参考资料为依据；资料没覆盖的内容可以基于哲学史常识补充延伸，但要说明这是扩展内容，不要编造史实和原著引文。`);
  lines.push(`4. 话题围绕「${p.name}」及哲学相关内容；用户聊无关话题时礼貌拉回，拒绝有害内容。`);
  lines.push(`5. 回答简洁：默认 200 字以内，用户想深挖再展开。`);
  return lines.join('\n');
}

// ---- 全局向导 prompt：注入全量哲学家索引（非单个语料）----
async function buildGuidePrompt() {
  const list = await prisma.philosopher.findMany({
    select: { id: true, nameCn: true, nameEn: true, era: true, nationality: true, schools: true, coreIdea: true },
  });
  const lines = list.map(p => {
    const school = Array.isArray(p.schools) ? p.schools.join('/') : String(p.schools || '');
    const idea = (p.coreIdea || '').replace(/\s+/g, ' ').slice(0, 60);
    return `${p.id}｜${p.nameCn}（${p.nameEn || ''}）｜${p.era || ''}｜${school}${p.nationality ? '｜' + p.nationality : ''}｜${idea}`;
  });
  const L = [];
  L.push(`你是「哲学星图」的 AI 哲学向导。星图中收录了 105 位东西方哲学家，用户刚打开星图，可能想探索哲学但不知从哪开始，或对某个思想话题感兴趣，希望你为他们引路。`);
  L.push(`\n【你的任务】`);
  L.push(`1. 倾听用户的兴趣、困惑或问题（例如「人应该怎么活」「什么是自由」「喜欢康德，还有谁思想相近」），从下面的索引中推荐 1~3 位最相关的哲学家，并用两三句话说明推荐理由——TA的哪个思想回应了用户的问题。`);
  L.push(`2. 用户想先弄懂某个哲学概念或问题时，也可以直接简明解答，再顺势推荐相关哲学家。`);
  L.push(`3. 每次有推荐时，必须在回答的最后一行单独输出：推荐：id1,id2（id 必须使用索引中给出的精确 id，英文逗号分隔；没有推荐则省略该行）`);
  L.push(`\n【哲学家索引】格式：id｜名字（英文名）｜时代｜学派｜国籍｜核心思想一句话`);
  L.push(lines.join('\n'));
  L.push(`\n【其他规则】`);
  L.push(`- 用中文，以亲切而博学的向导口吻交流；默认 200 字以内，用户想深入再展开。`);
  L.push(`- 只能推荐索引中存在的哲学家，不要编造不存在的哲学家或引文。`);
  L.push(`- 不讨论与哲学无关的有害内容。`);
  return L.join('\n');
}

// POST /api/chat  { philosopherId?, mode?: 'guide', messages: [{role, content}] }
//   - 默认：针对单个哲学家的讨论模式（philosopherId 必填）
//   - mode='guide'：全局向导模式（无需 philosopherId，注入全量索引）
// 响应：text/event-stream，事件格式 data: {"delta":"..."}，结束 data: [DONE]
router.post('/', authMiddleware, chatLimiter, asyncHandler(async (req, res) => {
  const { philosopherId, mode } = req.body || {};
  const isGuide = mode === 'guide';
  const messages = sanitizeMessages(req.body && req.body.messages);

  if (!isGuide && !philosopherId) return res.status(400).json({ error: 'philosopherId required' });
  if (!messages) return res.status(400).json({ error: 'messages required（须为 user/assistant 数组且以 user 结尾）' });
  if (!config.llmApiKey) return res.status(503).json({ error: 'AI 对话未配置（缺少 LLM_API_KEY），请联系管理员' });

  // 会话标识：guide = 全局向导；否则用 philosopherId（方案 C 落库用）
  const scope = isGuide ? 'guide' : philosopherId;

  let systemContent;
  if (isGuide) {
    systemContent = await buildGuidePrompt();
  } else {
    const p = await prisma.philosopher.findUnique({ where: { id: philosopherId } });
    if (!p) return res.status(404).json({ error: 'Philosopher not found' });
    systemContent = buildSystemPrompt(formatPhilosopher(p));
  }

  // 客户端断开时中止上游请求，避免白烧 token
  const controller = new AbortController();
  req.on('close', () => controller.abort());
  const timeout = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);

  let upstream;
  try {
    upstream = await fetch(config.llmBaseUrl.replace(/\/$/, '') + '/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + config.llmApiKey,
      },
      body: JSON.stringify({
        model: config.llmModel,
        messages: [
          { role: 'system', content: systemContent },
          ...messages,
        ],
        stream: true,
        max_tokens: MAX_TOKENS,
        temperature: 0.7,
      }),
      signal: controller.signal,
    });
  } catch (e) {
    clearTimeout(timeout);
    return res.status(502).json({ error: '无法连接 LLM 服务，请稍后重试' });
  }

  if (!upstream.ok || !upstream.body) {
    clearTimeout(timeout);
    const detail = await upstream.text().catch(() => '');
    console.error('[chat] upstream error:', upstream.status, detail.slice(0, 500));
    return res.status(502).json({ error: 'LLM 服务返回错误（' + upstream.status + '），请稍后重试' });
  }

  // 开始 SSE
  res.set({
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no', // nginx 别缓冲，否则流式变一次性
  });
  res.flushHeaders();

  const send = (obj) => res.write(`data: ${JSON.stringify(obj)}\n\n`);

  // 逐行解析上游 SSE，抽取 delta 转发（OpenAI 兼容格式：data: {"choices":[{"delta":{"content":"..."}}]}
  const reader = upstream.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  let emitted = false;
  let assistantText = '';   // 累积完整回复，流结束后落库（方案 C）

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop(); // 留半行到下一轮
      for (const line of lines) {
        const t = line.trim();
        if (!t.startsWith('data:')) continue;
        const payload = t.slice(5).trim();
        if (payload === '[DONE]') continue;
        try {
          const j = JSON.parse(payload);
          const delta = j.choices && j.choices[0] && j.choices[0].delta && j.choices[0].delta.content;
          if (delta) { send({ delta }); emitted = true; assistantText += delta; }
        } catch { /* 忽略无法解析的行 */ }
      }
    }
  } catch (e) {
    if (!controller.signal.aborted) {
      // 流中断：已发出的内容保留，追加错误事件让前端提示
      send({ error: '回复中断，请重试' });
    }
  } finally {
    clearTimeout(timeout);
  }

  if (!emitted && !controller.signal.aborted) {
    send({ error: 'LLM 未返回内容，请重试' });
  }
  res.write('data: [DONE]\n\n');
  res.end();

  // ---- 方案 C：流结束后落库（用户消息 + 完整/部分回复；失败不影响本次响应）----
  try {
    const lastUser = messages[messages.length - 1];
    const rows = [{ userId: req.user.id, scope, role: 'user', content: lastUser.content }];
    if (assistantText.trim()) {
      rows.push({ userId: req.user.id, scope, role: 'assistant', content: assistantText.slice(0, 8000) });
    }
    await prisma.chatMessage.createMany({ data: rows });
  } catch (e) {
    console.error('[chat] save history failed:', e.message);
  }
}));

// ---- 对话历史（方案 C）----
// GET /api/chat/history?scope=guide|philosopherId → 最近 60 条（升序）
router.get('/history', authMiddleware, asyncHandler(async (req, res) => {
  const scope = String(req.query.scope || '').slice(0, 64);
  if (!scope) return res.status(400).json({ error: 'scope required' });

  const rows = await prisma.chatMessage.findMany({
    where: { userId: req.user.id, scope },
    orderBy: { id: 'desc' },
    take: 60,
  });
  res.json({
    messages: rows.reverse().map(m => ({
      role: m.role,
      content: m.content,
      createdAt: m.createdAt,
    })),
  });
}));

// DELETE /api/chat/history?scope=guide|philosopherId → 清空该会话
router.delete('/history', authMiddleware, asyncHandler(async (req, res) => {
  const scope = String(req.query.scope || '').slice(0, 64);
  if (!scope) return res.status(400).json({ error: 'scope required' });

  const r = await prisma.chatMessage.deleteMany({ where: { userId: req.user.id, scope } });
  res.json({ ok: true, deleted: r.count });
}));

module.exports = router;
