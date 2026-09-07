// 共享的哲学家格式化函数：把数据库行转成前端期望的 JSON 形状
// 同时被 philosophers 路由和 search 路由使用，避免重复

function formatPhilosopher(p) {
  return {
    id: p.id,
    name: p.nameCn,
    nameEn: p.nameEn,
    birthYear: p.birthYear,
    deathYear: p.deathYear,
    era: p.era,
    nationality: p.nationality,
    coreIdea: p.coreIdea,
    biography: p.biography,
    historicalContext: p.historicalContext,
    famousQuotes: safeJson(p.famousQuotes, []),
    works: safeJson(p.works, []),
    school: safeJson(p.schools, []),
    keyConcepts: safeJson(p.keyConcepts, []),
    anecdotes: safeJson(p.anecdotes, []),
  };
}

// 安全 JSON.parse：数据库里如果有损坏数据（极少见），fallback 到默认值
// 避免抛 SyntaxError 把整个请求崩了
function safeJson(str, fallback) {
  if (!str) return fallback;
  try {
    const v = JSON.parse(str);
    return v == null ? fallback : v;
  } catch {
    return fallback;
  }
}

module.exports = { formatPhilosopher, safeJson };
