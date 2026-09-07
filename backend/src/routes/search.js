// 全文搜索 (SQLite 版本: 多字段 LIKE contains)
const express = require('express');
const prisma = require('../lib/prisma');
const authMiddleware = require('../middleware/auth');
const rateLimit = require('../middleware/rateLimit');
const asyncHandler = require('../lib/asyncHandler');
const { formatPhilosopher } = require('../lib/format');

const router = express.Router();

// 搜索接口限流（全文 LIKE 多次扫描，限严一点）
const searchLimiter = rateLimit({ windowMs: 60_000, max: 60 });
// 历史接口限流
const historyLimiter = rateLimit({ windowMs: 60_000, max: 60 });

// GET /api/search/history  —— 搜索历史（最近 20 条）
router.get('/history', historyLimiter, authMiddleware, asyncHandler(async (req, res) => {
  const records = await prisma.searchHistory.findMany({
    where: { userId: req.user.id },
    orderBy: { searchedAt: 'desc' },
    take: 20,
  });
  res.json(records.map(r => ({ query: r.query, searchedAt: r.searchedAt })));
}));

// POST /api/search/history  —— 记录搜索关键词（upsert，刷新时间；超出 50 条自动清理）
router.post('/history', historyLimiter, authMiddleware, asyncHandler(async (req, res) => {
  const { query } = req.body;
  const q = (query || '').trim();
  if (!q) return res.status(400).json({ error: 'query required' });
  if (q.length > 100) return res.status(400).json({ error: 'query too long (max 100 chars)' });

  await prisma.searchHistory.upsert({
    where: { userId_query: { userId: req.user.id, query: q } },
    update: { searchedAt: new Date() },
    create: { userId: req.user.id, query: q },
  });
  // 清理超出 50 条的旧记录
  const all = await prisma.searchHistory.findMany({
    where: { userId: req.user.id },
    orderBy: { searchedAt: 'desc' },
    skip: 50,
    select: { userId: true, query: true },
  });
  for (const old of all) {
    await prisma.searchHistory.delete({
      where: { userId_query: { userId: old.userId, query: old.query } },
    });
  }
  res.json({ ok: true });
}));

// DELETE /api/search/history
// body: { query: "xxx" }  → 删单条
// body: {}                → 清空全部（不传 query 时）
router.delete('/history', historyLimiter, authMiddleware, asyncHandler(async (req, res) => {
  const { query } = req.body || {};
  if (typeof query === 'string' && query.trim()) {
    await prisma.searchHistory.deleteMany({
      where: { userId: req.user.id, query: query.trim() },
    });
  } else if (query === undefined || query === null || query === '') {
    // 不传 query 则清空全部
    await prisma.searchHistory.deleteMany({ where: { userId: req.user.id } });
  } else {
    return res.status(400).json({ error: 'query must be string or empty' });
  }
  res.json({ ok: true });
}));

// GET /api/search?q=空性
// 在名字、核心思想、传记、历史背景、学派、名言、作品里模糊匹配
router.get('/', searchLimiter, asyncHandler(async (req, res) => {
  const q = (req.query.q || '').trim();
  if (!q) return res.json([]);
  if (q.length > 100) return res.status(400).json({ error: 'query too long (max 100 chars)' });

  const where = {
    OR: [
      { nameCn: { contains: q } },
      { nameEn: { contains: q } },
      { coreIdea: { contains: q } },
      { biography: { contains: q } },
      { historicalContext: { contains: q } },
      { famousQuotes: { contains: q } },
      { works: { contains: q } },
      { schools: { contains: q } },
      { era: { contains: q } },
      { nationality: { contains: q } },
    ],
  };

  const list = await prisma.philosopher.findMany({ where, take: 50 });
  res.json(list.map(formatPhilosopher));
}));

module.exports = router;
