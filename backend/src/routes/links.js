// 连线路由
const express = require('express');
const prisma = require('../lib/prisma');
const rateLimit = require('../middleware/rateLimit');
const asyncHandler = require('../lib/asyncHandler');

const router = express.Router();

// 读连线接口限流（防枚举）
const readLimiter = rateLimit({ windowMs: 60_000, max: 120 });

// GET /api/links  全部连线（按 type 分组）
router.get('/', readLimiter, asyncHandler(async (req, res) => {
  const links = await prisma.link.findMany();
  const grouped = {
    influence: links.filter(l => l.type === 'influence').map(l => ({
      source: l.sourceId, target: l.targetId, note: l.note,
    })),
    opposition: links.filter(l => l.type === 'opposition').map(l => ({
      source: l.sourceId, target: l.targetId, note: l.note,
    })),
  };
  res.json(grouped);
}));

module.exports = router;
