# 哲学星图后端设计文档

**日期**: 2026-08-30  
**状态**: 已批准，待实现  
**阶段**: B（小范围多用户）→ 将来 C（公开上线）

---

## 一、技术选型

| 层 | 技术 | 版本 | 理由 |
|---|------|------|------|
| 后端框架 | Express | 最新稳定 | 生态成熟，中间件丰富，从 B→C 稳定可靠 |
| 数据库 | PostgreSQL | 16.x | B→C 通吃；自带 GIN 全文检索；递归查询支持复杂连线搜索 |
| ORM | Prisma | 最新 | schema 即文档、自动 migration、seed 工具；同语言零心智负担 |
| 鉴权 | JWT (jsonwebtoken) + bcryptjs | - | 无状态，后端不存 session，后面加 Redis 黑名单即可上 C |
| 前端通信 | 原生 fetch + Vue 3 reactive | - | 不引入 axios/pinia，保持轻量 |
| 数据库启动 | Docker Desktop | - | 一键起 PG 16 容器，开发零依赖 |
| 前端代理 | Vite proxy (开发时) | - | `/api/*` → `http://localhost:3001` |

---

## 二、项目结构

```
philosophy/
├── philosophy-map/
│   ├── src/                          ← 现有前端（微改）
│   │   ├── api/
│   │   │   └── index.js              ← 新增：fetch 封装
│   │   ├── composables/
│   │   │   └── useAuth.js            ← 新增：登录状态管理
│   │   ├── components/
│   │   │   ├── LoginModal.vue        ← 新增：登录/注册弹窗
│   │   │   ├── SearchBar.vue         ← 新增：搜索框
│   │   │   └── StarMap.vue           ← 改：数据从 fetch 来
│   │   └── data/philosophers.js      ← 保留作种子数据
│   ├── vite.config.js                ← 改：加 proxy
│   └── package.json
│
├── backend/                          ← 新增后端（单独 package.json）
│   ├── index.js                      ← Express 入口
│   ├── prisma/
│   │   ├── schema.prisma             ← 数据库 Schema
│   │   └── seed.js                   ← 种子数据（从 philosophers.js 导入）
│   ├── src/
│   │   ├── routes/
│   │   │   ├── auth.js               ← /api/auth/*
│   │   │   ├── philosophers.js       ← /api/philosophers/*
│   │   │   ├── links.js              ← /api/links/*
│   │   │   └── search.js             ← /api/philosophers/search
│   │   ├── middleware/
│   │   │   └── auth.js               ← JWT 校验中间件
│   │   └── lib/
│   │       └── pgInit.js             ← PG 连接初始化 + 全文索引
│   ├── .env                          ← DATABASE_URL / JWT_SECRET
│   └── package.json
│
└── docs/superpowers/specs/           ← 本文档在这里
```

---

## 三、数据库 Schema（Prisma）

```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
}

model User {
  id        String   @id @default(uuid())
  email     String   @unique
  name      String
  password  String                       // bcrypt 哈希
  createdAt DateTime @default(now())
  favorites Favorite[]
}

model Philosopher {
  id                String    @id          // 现有 id（confucius, plato 等）
  nameCn            String
  nameEn            String
  birthYear         Int?
  deathYear         Int?
  era               String
  nationality       String
  coreIdea          String
  biography         String
  historicalContext String
  famousQuotes      String[]
  works             Json
  schools           String[]

  // 自动生成的 PG 全文索引字段（不在 Prisma schema 定义，用 raw SQL）
  // search_vector tsvector GENERATED ALWAYS AS (...) STORED
}

model Link {
  sourceId String
  targetId String
  type     String                          // 'influence' | 'opposition'
  note     String
  @@id([sourceId, targetId, type])
}

model Favorite {
  userId        String
  philosopherId String
  createdAt     DateTime @default(now())
  @@id([userId, philosopherId])
  user        User        @relation(fields: [userId], references: [id], onDelete: Cascade)
  philosopher Philosopher @relation(fields: [philosopherId], references: [id], onDelete: Cascade)
}
```

### PG 全文索引（raw SQL 执行）

```sql
-- 为每个哲学家生成 tsvector，覆盖中文 + 英文所有可搜索文本
-- 中文分词用 PG 内置 'simple'（按空格/标点拆分），够用
ALTER TABLE philosopher ADD COLUMN search_vector tsvector
  GENERATED ALWAYS AS (
    to_tsvector('simple',
      coalesce(nameCn, '') || ' ' ||
      coalesce(nameEn, '') || ' ' ||
      coalesce(coreIdea, '') || ' ' ||
      coalesce(biography, '') || ' ' ||
      coalesce(historicalContext, '') || ' ' ||
      coalesce(array_to_string(schools, ' '), '') || ' ' ||
      coalesce(array_to_string("famousQuotes", ' '), '')
    )
  ) STORED;

CREATE INDEX idx_philosopher_search ON philosopher USING GIN (search_vector);
```

---

## 四、REST API 设计

| 方法 | 路径 | 鉴权 | 说明 |
|------|------|------|------|
| POST | `/api/auth/register` | ❌ | `{ email, password, name }` → `{ token, user }` |
| POST | `/api/auth/login` | ❌ | `{ email, password }` → `{ token, user }` |
| GET  | `/api/auth/me` | ✅ | Header `Authorization: Bearer xxx` → `{ user }` |
| GET  | `/api/philosophers` | ❌ | 查询参数：`name`(模糊) / `era` / `school` / `nationality` |
| GET  | `/api/philosophers/search?q=` | ❌ | 全文模糊搜索（PG tsvector） |
| GET  | `/api/philosophers/:id` | ❌ | 单个哲学家详情 |
| GET  | `/api/philosophers/me/favorites` | ✅ | 当前用户的收藏列表 |
| POST | `/api/philosophers/:id/favorite` | ✅ | 收藏 |
| DELETE | `/api/philosophers/:id/favorite` | ✅ | 取消收藏 |
| GET  | `/api/links` | ❌ | 全部连线（按 type 分组返回） |

### 搜索实现（POSTGRES）

```sql
-- 输入 "空性" 或 "Madhyamaka" 时，search_vector 匹配返回排名
SELECT *, ts_rank(search_vector, plainto_tsquery('simple', $1)) AS rank
FROM philosopher
WHERE search_vector @@ plainto_tsquery('simple', $1)
ORDER BY rank DESC
LIMIT 30;
```

---

## 五、鉴权中间件

```js
// middleware/auth.js
const jwt = require('jsonwebtoken');
module.exports = (req, res, next) => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return res.status(401).json({ error: 'No token' });
  try {
    req.user = jwt.verify(header.slice(7), process.env.JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
};
```

---

## 六、前端改动

### 新增文件

```js
// composables/useAuth.js
export function useAuth() {
  const user = ref(null);
  const token = ref(localStorage.getItem('token'));

  async function login(email, password) { ... POST /api/auth/login ... }
  async function register(email, password, name) { ... POST /api/auth/register ... }
  function logout() { token.value = null; user.value = null; localStorage.removeItem('token'); }
  async function checkAuth() { ... GET /api/auth/me with token ... }

  onMounted(checkAuth);
  return { user, login, register, logout };
}
```

```js
// api/index.js
const BASE = 'http://localhost:3001/api';
export async function fetchJSON(path, opts = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (localStorage.getItem('token')) headers['Authorization'] = 'Bearer ' + localStorage.getItem('token');
  const res = await fetch(BASE + path, { ...opts, headers });
  return res.json();
}
export const getPhilosophers = (params) => fetchJSON('/philosophers' + (params ? '?' + new URLSearchParams(params) : ''));
export const searchPhilosophers = (q) => fetchJSON('/philosophers/search?q=' + encodeURIComponent(q));
export const getLinks = () => fetchJSON('/links');
// ...
```

### 修改文件

- `vite.config.js`: `server.proxy['/api'] = 'http://localhost:3001'`
- `StarMap.vue`: `import { getPhilosophers, getLinks } from '../api'` + `onMounted` 里 fetch 数据
- `DetailCard.vue`: 加 `useAuth()` + "⭐ 收藏/已收藏" 按钮
- `App.vue`: 顶部加"登录"按钮（未登录时）/ 用户名 + 收藏数量（已登录时）

---

## 七、启动方式（开发环境）

```bash
# 1. 起 PostgreSQL 容器（首次）
docker run -d --name philosophy-pg -p 5432:5432 \
  -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=philosophy postgres:16

# 2. 初始化数据库
cd backend
cp .env.example .env    # 填写 DATABASE_URL + JWT_SECRET
npm install
npx prisma migrate dev  # 建表 + 跑 migration
npx prisma db seed      # 把 philosophers.js 里的 56 条种子灌进 PG

# 3. 启动后端（热重载）
npm run dev             # nodemon，监听 3001

# 4. 启动前端（另一个终端）
cd ../philosophy-map
npm run dev             # http://localhost:5173，/api 自动代理到 3001
```

---

## 八、未来迁移到 Supabase（C 规模）

### 为什么现在不直接用 Supabase？

- 开发阶段本地数据要可离线访问，Supabase 没网络用不了
- 需要完全掌控 PG schema 和 raw SQL（种子数据灌库、全文索引都是 raw SQL）
- Express 中间件灵活度比 Supabase Edge Functions 高（鉴权逻辑、复杂业务钩子）

### 什么时候上 Supabase？

- 上线公网、不想自己管服务器的时候
- 不想维护 PG 备份、监控、自动扩缩容这些运维工作

### 迁移步骤（Express → Supabase）

| 步骤 | 操作 |
|------|------|
| 1. 注册 | supabase.com 免费注册，创建 Project，拿到 `SUPABASE_URL` + `anon` key |
| 2. 建表 | Supabase Dashboard → Table Editor，粘贴 Prisma schema 对应的 SQL 建表 |
| 3. 灌种子 | Supabase Dashboard → SQL Editor，执行 seed SQL（从本地 PG dump 导出） |
| 4. 全文索引 | 同样在 Supabase SQL Editor 里执行 GENERATED tsvector + GIN index |
| 5. 替换 auth | 删除 Express 鉴权代码 → 用 `@supabase/supabase-js` 的 `signUp()` / `signIn()` / `getUser()`，Supabase 自带完整 Auth（邮件验证、OAuth 后面加） |
| 6. 替换数据访问 | Express 路由里的 `prisma.philosopher.findMany()` 改成 `supabase.from('philosopher').select('*')` |
| 7. 替换搜索 | PG 全文索引 SQL 变成 Supabase Edge Function（因为 supabase-js 不暴露 `@@` 操作符）：`supabase.functions.invoke('search', { q })` |
| 8. 部署前端 | 代码 push 到 GitHub → Vercel 一键部署，自动注入 `SUPABASE_URL` 环境变量 |
| 9. 旧域名切 | Vercel 绑自定义域名 + HTTPS 自动 |

### 一个关键差异

Supabase 的 REST API 默认带 RLS（Row Level Security），建表后必须在 SQL Editor 里写 `CREATE POLICY` 规则：

```sql
-- 哲学家和连线：任何人可读
CREATE POLICY "philosophers_readable" ON philosopher
  FOR SELECT USING (true);

-- 收藏：只有自己能读写
CREATE POLICY "favorites_own" ON favorite
  FOR ALL USING (auth.uid() = userId);
```

---

## 九、实施顺序

| 阶段 | 内容 | 依赖 |
|------|------|------|
| 1 | Docker 起 PG 16 + Express 骨架 + Prisma schema + migration + seed | Docker |
| 2 | Auth 模块（register/login/me） + 前端 LoginModal | 阶段 1 |
| 3 | 哲学家 + 连线 CRUD API，前端 StarMap 改 fetch | 阶段 1 |
| 4 | 全文搜索 + 前端 SearchBar | 阶段 3 + PG tsvector |
| 5 | 收藏功能 + DetailCard 按钮 | 阶段 2 + 3 |
| 6 | （将来）Supabase 迁移 | 阶段 1-5 全做完 |

---

## 十、非目标（YAGNI）

- 评论 / 讨论区 — 社区功能等 C 规模再说
- 管理员后台 — 先用 Prisma Studio 当临时后台（`npx prisma studio` → 浏览器可视化编辑数据）
- OAuth — 后面 Supabase Auth 一键加
- 消息通知 — 用不上
- Docker Compose — 目前一个 `docker run` 够了，C 规模再加
