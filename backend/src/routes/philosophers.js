// 哲学家 + 收藏
const express = require('express');
const prisma = require('../lib/prisma');
const authMiddleware = require('../middleware/auth');
const rateLimit = require('../middleware/rateLimit');
const asyncHandler = require('../lib/asyncHandler');
const { formatPhilosopher } = require('../lib/format');

const router = express.Router();

// 读接口通用限流（防爬虫/暴力枚举）
const readLimiter = rateLimit({ windowMs: 60_000, max: 120 });  // 每 IP 每分钟 120 次
const writeLimiter = rateLimit({ windowMs: 60_000, max: 60 });  // 写（浏览/收藏）每分钟 60 次

// GET /api/philosophers?name=&era=&school=&nationality=&limit=&offset=&paginated=
// school 支持逗号分隔多选: ?school=儒家,道家  →  OR 匹配任一学派
// 默认返回 array（向后兼容）；传 paginated=1 返回 {items, total, limit, offset}
router.get('/', readLimiter, asyncHandler(async (req, res) => {
  const { name, era, nationality, school } = req.query;
  // 分页（默认 limit=500 覆盖当前 105 位；上限 500 防滥用）
  const limit = Math.min(parseInt(req.query.limit || '500', 10) || 500, 500);
  const offset = Math.max(parseInt(req.query.offset || '0', 10) || 0, 0);

  const where = {};
  if (name) {
    where.OR = [
      { nameCn: { contains: name } },
      { nameEn: { contains: name } },
    ];
  }
  if (era) where.era = era;
  if (nationality) where.nationality = nationality;
  // school: 支持单值或逗号分隔多值；多值时用 OR 拼接
  if (school) {
    const schools = school.split(',').map(s => s.trim()).filter(Boolean);
    if (schools.length === 1) {
      where.schools = { contains: `"${schools[0]}"` };
    } else if (schools.length > 1) {
      where.OR = [
        ...(where.OR || []),
        ...schools.map(s => ({ schools: { contains: `"${s}"` } })),
      ];
    }
  }
  const list = await prisma.philosopher.findMany({
    where,
    orderBy: [{ era: 'asc' }, { birthYear: 'asc' }],
    skip: offset,
    take: limit,
  });
  const items = list.map(formatPhilosopher);

  // 默认 array（向后兼容）；显式 paginated=1 拿分页元数据
  if (req.query.paginated === '1') {
    res.json({
      items,
      total: await prisma.philosopher.count({ where }),
      limit,
      offset,
    });
  } else {
    res.json(items);
  }
}));

// ⚠️ 所有固定路径必须在 /:id 之前注册！

// GET /api/philosophers/me/favorites
router.get('/me/favorites', readLimiter, authMiddleware, asyncHandler(async (req, res) => {
  const favs = await prisma.favorite.findMany({
    where: { userId: req.user.id },
    include: { philosopher: true },
  });
  res.json(favs.map(f => formatPhilosopher(f.philosopher)));
}));

// GET /api/philosophers/me/history  —— 浏览记录（最近 30 条）
router.get('/me/history', readLimiter, authMiddleware, asyncHandler(async (req, res) => {
  const records = await prisma.browseHistory.findMany({
    where: { userId: req.user.id },
    orderBy: { visitedAt: 'desc' },
    take: 30,
    include: { philosopher: true },
  });
  res.json(records.map(r => ({ ...formatPhilosopher(r.philosopher), visitedAt: r.visitedAt })));
}));

// POST /api/philosophers/me/history  —— 记录浏览（upsert，刷新 visitedAt，只保留最近 30 条）
router.post('/me/history', writeLimiter, authMiddleware, asyncHandler(async (req, res) => {
  const { philosopherId } = req.body;
  if (!philosopherId) return res.status(400).json({ error: 'philosopherId required' });
  const ph = await prisma.philosopher.findUnique({ where: { id: philosopherId } });
  if (!ph) return res.status(404).json({ error: 'Philosopher not found' });

  await prisma.browseHistory.upsert({
    where: { userId_philosopherId: { userId: req.user.id, philosopherId } },
    update: { visitedAt: new Date() },
    create: { userId: req.user.id, philosopherId },
  });
  // 清理超出 50 条的旧记录（留些冗余，前端取 30）
  const all = await prisma.browseHistory.findMany({
    where: { userId: req.user.id },
    orderBy: { visitedAt: 'desc' },
    skip: 50,
    select: { userId: true, philosopherId: true },
  });
  for (const old of all) {
    await prisma.browseHistory.delete({
      where: { userId_philosopherId: { userId: old.userId, philosopherId: old.philosopherId } },
    });
  }
  res.json({ ok: true });
}));

// GET /api/philosophers/:id
router.get('/:id', readLimiter, asyncHandler(async (req, res) => {
  const p = await prisma.philosopher.findUnique({ where: { id: req.params.id } });
  if (!p) return res.status(404).json({ error: 'Not found' });
  res.json(formatPhilosopher(p));
}));

// GET /api/philosophers/:id/context —— 完整语料 + 关联关系（为 AI 对话注入用）
// 返回该哲学家的全部结构化资料，以及他影响谁 / 被谁影响 / 与谁对立
// 未来接入智能体时，直接把这个响应作为对话的 system/context 注入
router.get('/:id/context', readLimiter, asyncHandler(async (req, res) => {
  const p = await prisma.philosopher.findUnique({ where: { id: req.params.id } });
  if (!p) return res.status(404).json({ error: 'Not found' });

  const outgoing = await prisma.link.findMany({ where: { sourceId: p.id } });
  const incoming = await prisma.link.findMany({ where: { targetId: p.id } });

  const relatedIds = [...new Set([
    ...outgoing.map(l => l.targetId),
    ...incoming.map(l => l.sourceId),
  ])];
  const related = await prisma.philosopher.findMany({
    where: { id: { in: relatedIds } },
    select: { id: true, nameCn: true, nameEn: true, era: true },
  });
  const nameMap = {};
  related.forEach(r => { nameMap[r.id] = r; });

  const relations = {
    influenced: outgoing.filter(l => l.type === 'influence').map(l => ({
      ...nameMap[l.targetId], relation: l.note,
    })),
    opposed: outgoing.filter(l => l.type === 'opposition').map(l => ({
      ...nameMap[l.targetId], relation: l.note,
    })),
    influencedBy: incoming.filter(l => l.type === 'influence').map(l => ({
      ...nameMap[l.sourceId], relation: l.note,
    })),
    opposedBy: incoming.filter(l => l.type === 'opposition').map(l => ({
      ...nameMap[l.sourceId], relation: l.note,
    })),
  };

  res.json({ ...formatPhilosopher(p), relations });
}));

// GET /api/philosophers/:id/favorited  (检查是否收藏)
router.get('/:id/favorited', readLimiter, authMiddleware, asyncHandler(async (req, res) => {
  const f = await prisma.favorite.findUnique({
    where: { userId_philosopherId: { userId: req.user.id, philosopherId: req.params.id } },
  });
  res.json({ favorited: !!f });
}));

// POST /api/philosophers/:id/favorite  (收藏)
router.post('/:id/favorite', writeLimiter, authMiddleware, asyncHandler(async (req, res) => {
  const philosopher = await prisma.philosopher.findUnique({ where: { id: req.params.id } });
  if (!philosopher) return res.status(404).json({ error: 'Philosopher not found' });
  await prisma.favorite.upsert({
    where: { userId_philosopherId: { userId: req.user.id, philosopherId: req.params.id } },
    update: {},
    create: { userId: req.user.id, philosopherId: req.params.id },
  });
  res.json({ ok: true });
}));

// DELETE /api/philosophers/:id/favorite  (取消收藏)
router.delete('/:id/favorite', writeLimiter, authMiddleware, asyncHandler(async (req, res) => {
  await prisma.favorite.deleteMany({
    where: { userId: req.user.id, philosopherId: req.params.id },
  });
  res.json({ ok: true });
}));

module.exports = router;
