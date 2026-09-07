// Seed script: 把前端 philosophers.js 的数据灌进 SQLite（upsert 模式）
// 运行方式:
//   npm run db:seed            → 增量 upsert 哲学家 + 连线（保留所有用户数据）
//   npm run db:seed -- --reset → 删除哲学家中不在 nodes 里的，再清空 user/favorite（⚠️ 危险）
// 前置: 需要先 npm run db:push
//
// 设计原则：默认 seed 走 upsert 路径，**绝不**触碰 User/Favorite/BrowseHistory/SearchHistory。
// 只有 --reset 才允许清空用户数据。
//
// 历史：之前用 deleteMany + create 会因为外键级联误删 Favorite，
// 现统一改用 upsert（与 prisma/update-philosophers.js 行为一致）。

const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();
const RESET_DATA = process.argv.includes('--reset');

if (RESET_DATA) {
  console.warn('⚠️  --reset 模式：即将清空 User / Favorite / BrowseHistory / SearchHistory');
  console.warn('   5 秒内按 Ctrl+C 取消...');
}

function loadData() {
  // 优先读取后端打包好的 JSON，服务器部署时无需前端源码
  const jsonPath = path.join(__dirname, 'philosophers.json');
  if (fs.existsSync(jsonPath)) {
    return JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  }

  // 本地开发 fallback：读前端的 philosophers.js（需要 philosophy-map 源码）
  const src = fs.readFileSync(
    path.join(__dirname, '..', '..', 'philosophy-map', 'src', 'data', 'philosophers.js'),
    'utf8'
  );

  const nodesMatch = src.match(/export const nodes = (\[[\s\S]*?\n\]);/);
  const influenceMatch = src.match(/export const influenceLinks = (\[[\s\S]*?\n\]);/);
  const oppositionMatch = src.match(/export const oppositionLinks = (\[[\s\S]*?\n\]);/);

  if (!nodesMatch || !influenceMatch || !oppositionMatch) {
    throw new Error('Failed to parse philosophers.js');
  }

  const nodes = eval('(' + nodesMatch[1] + ')');
  const influenceLinks = eval('(' + influenceMatch[1] + ')');
  const oppositionLinks = eval('(' + oppositionMatch[1] + ')');

  return { nodes, influenceLinks, oppositionLinks };
}

async function main() {
  console.log('⏳ Loading frontend data...');
  const { nodes, influenceLinks, oppositionLinks } = loadData();
  console.log(`  ${nodes.length} nodes, ${influenceLinks.length + oppositionLinks.length} links`);

  // ✅ 用 upsert 增量写入，**绝不** deleteMany 哲学家或连线
  // 这样 Favorite / BrowseHistory 的外键引用不会失效
  console.log('⏳ Upserting philosophers...');
  for (const n of nodes) {
    const row = {
      nameCn: n.name,
      nameEn: n.nameEn,
      birthYear: n.birthYear,
      deathYear: n.deathYear,
      era: n.era,
      nationality: n.nationality,
      coreIdea: n.coreIdea,
      biography: n.biography,
      historicalContext: n.historicalContext || '',
      famousQuotes: JSON.stringify(n.famousQuotes || []),
      works: JSON.stringify(n.works || []),
      schools: JSON.stringify(n.school || []),
      keyConcepts: JSON.stringify(n.keyConcepts || []),
      anecdotes: JSON.stringify(n.anecdotes || []),
    };
    await prisma.philosopher.upsert({
      where: { id: n.id },
      update: row,
      create: { id: n.id, ...row },
    });
  }

  console.log('⏳ Upserting links...');
  const allLinks = [
    ...influenceLinks.map(l => ({ ...l, type: 'influence' })),
    ...oppositionLinks.map(l => ({ ...l, type: 'opposition' })),
  ];
  // 去重：同一对节点、同一类型只保留一条（note 取第一个）
  const seen = new Set();
  let linkCount = 0;
  for (const l of allLinks) {
    const key = `${l.source}|${l.target}|${l.type}`;
    if (seen.has(key)) continue;
    seen.add(key);
    await prisma.link.upsert({
      where: { sourceId_targetId_type: { sourceId: l.source, targetId: l.target, type: l.type } },
      update: { note: l.note || '' },
      create: { sourceId: l.source, targetId: l.target, type: l.type, note: l.note || '' },
    });
    linkCount++;
  }

  const philCount = await prisma.philosopher.count();
  console.log(`✅ Seed done: ${philCount} 位哲学家、${linkCount} 条连线（upsert）`);

  if (RESET_DATA) {
    console.warn('⚠️  --reset 模式：清空用户表');
    await prisma.favorite.deleteMany({});
    await prisma.browseHistory.deleteMany({});
    await prisma.searchHistory.deleteMany({});
    await prisma.user.deleteMany({});
    console.log('🗑️  已清空 User / Favorite / BrowseHistory / SearchHistory');
  } else {
    const userCount = await prisma.user.count();
    const favCount = await prisma.favorite.count();
    console.log(`🔒 用户数据未受影响: ${userCount} 个账号、${favCount} 条收藏（用 --reset 可清空）`);
  }
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
