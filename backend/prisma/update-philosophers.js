// 安全更新脚本：用 content.json 的内容 upsert 哲学家与连线
// ⚠️ 本脚本只做 upsert（插入或更新），绝不删除任何数据：
//    - 不碰 User 表（用户账号）
//    - 不碰 Favorite 表（用户收藏）
//    - 哲学家按 id 更新全部内容字段；连线按主键 upsert
// 用法: node prisma/update-philosophers.js
// 前置: 若 schema 有新列，先执行 npx prisma db push（加列带默认值，不影响现有数据）

const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();

async function main() {
  const contentPath = path.join(__dirname, 'content.json');
  if (!fs.existsSync(contentPath)) {
    throw new Error('找不到 content.json，请先在本地运行 node content-batch/export-content.js 并随包上传');
  }
  const data = JSON.parse(fs.readFileSync(contentPath, 'utf8'));
  console.log(`⏳ 内容版本: ${data.version}，${data.philosophers.length} 位哲学家、${data.links.length} 条连线`);

  // 1. upsert 哲学家（不删除缺失 id，以防 content.json 不全）
  console.log('⏳ Upsert philosophers...');
  for (const p of data.philosophers) {
    const row = {
      nameCn: p.nameCn,
      nameEn: p.nameEn,
      birthYear: p.birthYear ?? null,
      deathYear: p.deathYear ?? null,
      era: p.era,
      nationality: p.nationality,
      coreIdea: p.coreIdea,
      biography: p.biography,
      historicalContext: p.historicalContext || '',
      famousQuotes: JSON.stringify(p.famousQuotes || []),
      works: JSON.stringify(p.works || []),
      schools: JSON.stringify(p.schools || []),
      keyConcepts: JSON.stringify(p.keyConcepts || []),
      anecdotes: JSON.stringify(p.anecdotes || []),
    };
    await prisma.philosopher.upsert({
      where: { id: p.id },
      update: row,
      create: { id: p.id, ...row },
    });
  }

  // 2. upsert 连线（去重，同一对节点同一类型只保留一条）
  console.log('⏳ Upsert links...');
  const seen = new Set();
  let linkCount = 0;
  for (const l of data.links) {
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

  // 3. 确认用户数据存在即视为未受影响（不打印精确数量，避免日志泄露业务指标）
  const userCount = await prisma.user.count();
  if (userCount > 0) {
    console.log(`🔒 用户数据完好（脚本未对 User/Favorite/BrowseHistory/SearchHistory 做任何操作）`);
  }
  const philCount = await prisma.philosopher.count();
  console.log(`✅ 更新完成: ${philCount} 位哲学家、${linkCount} 条连线`);
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
