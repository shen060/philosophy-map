# 哲学星图 · Philosophy Star Map

> 一张可交互的 3D 哲学星空：把 105 位哲学家及其思想脉络，铺成一片可以旋转、缩放、探索的星图。

西方与东方的哲学家在此交汇——从苏格拉底到王阳明，从理念论到心学。每一位哲学家都是一颗星，星星之间的连线，是他们跨越千年的**影响**与**对立**。

---

## ✨ 特性

- **3D 可交互星图**：基于 Three.js 的沉浸式星空，支持拖拽旋转、滚轮缩放、点击探索
- **三种视角**：东方 / 西方 / 全体，一键切换
- **两种布局**：星图（银河散布）/ 聚类（按学派聚合）
- **关系网络**：227 条连线，区分「影响」（influence）与「对立」（opposition）
- **丰富的人物资料**：核心思想、生平、时代背景、名言、著作、关键概念、轶事
- **多维筛选**：按时代 / 学派 / 国籍多选过滤
- **全文搜索**：搜索哲学家，附带搜索历史
- **用户系统**：注册 / 登录（JWT）、收藏、浏览历史

## 📊 数据规模

| 维度 | 数量 |
|------|------|
| 哲学家 | 105 位（涵盖东西方） |
| 时代 | 5 个（古代 / 中世纪 / 近代 / 现代 / 当代） |
| 国籍 | 59 个 |
| 关系连线 | 227 条（影响 174 + 对立 53） |

每位哲学家都包含结构化的多维度语料：`coreIdea`（核心思想）、`biography`（生平）、`historicalContext`（时代背景）、`famousQuotes`（名言）、`works`（著作）、`keyConcepts`（关键概念）、`anecdotes`（轶事）。

## 🛠 技术栈

| 层 | 技术 |
|----|------|
| 前端 | Vue 3 (`<script setup>`) + Vite + Three.js + D3 |
| 后端 | Node.js + Express + Prisma + SQLite |
| 认证 | JWT + bcryptjs |
| 安全 | helmet + CORS 白名单 + 全接口限流 |

## 🚀 快速开始

### 前置要求

- Node.js 18+
- npm

### 1. 启动后端

```bash
cd backend
cp .env.example .env      # 复制环境变量模板
# 编辑 .env，填入 JWT_SECRET（可用下方命令生成）
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"

npm install
npx prisma db push        # 按 schema 建表
node prisma/seed.js       # 导入 105 位哲学家数据
node index.js             # 启动后端，默认 :3001
```

### 2. 启动前端

```bash
cd philosophy-map
npm install
npm run dev               # 启动开发服务器，默认 :5173
```

浏览器打开 `http://localhost:5173` 即可。

> 开发环境下，前端 Vite 已配置代理将 `/api` 转发到 `http://localhost:3001`。

## 📁 目录结构

```
philosophy/
├── backend/                  # Express + Prisma 后端
│   ├── index.js              # 入口（helmet/CORS/错误处理/优雅关闭）
│   ├── prisma/
│   │   ├── schema.prisma     # 数据模型（User/Philosopher/Link/Favorite/历史）
│   │   ├── seed.js           # 数据导入（upsert，不误删用户数据）
│   │   └── philosophers.json # 哲学家数据快照
│   └── src/
│       ├── routes/           # auth / philosophers / links / search
│       ├── middleware/       # auth(JWT) / rateLimit / logger
│       └── lib/              # prisma单例 / config / errors / format
├── philosophy-map/           # Vue 3 前端
│   └── src/
│       ├── components/       # StarMap / DetailCard / FilterPanel
│       ├── composables/      # useAuth
│       ├── api/              # API 请求封装
│       └── data/             # 哲学家数据源
└── docs/
    └── AI-AGENT-PLAN.md      # AI 智能体接入规划
```

## 🔌 API 概览

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/philosophers` | 哲学家列表（支持 era/school/nationality/name 筛选） |
| GET | `/api/philosophers/:id` | 单哲学家详情 |
| GET | `/api/philosophers/:id/context` | 完整语料 + 关系网（为 AI 对话注入预留） |
| GET | `/api/links` | 关系连线（按 influence/opposition 分组） |
| GET | `/api/search?q=` | 全文搜索 |
| POST | `/api/auth/register` / `/login` | 注册 / 登录 |
| GET/POST | `/api/philosophers/me/history` | 浏览历史 |
| GET/POST/DELETE | `/api/search/history` | 搜索历史 |
| GET/POST/DELETE | `/api/philosophers/:id/favorite` | 收藏 |

## 🚢 部署

生产环境：前端 `npm run build` 产物交给 nginx 托管，并将 `/api` 反向代理到后端 `:3001`。

```bash
# 前端构建
cd philosophy-map && npm run build   # 产出 dist/

# nginx 反代示例
location /api/ {
    proxy_pass http://127.0.0.1:3001/api/;
}
```

详细部署与 AI 接入方案见 `docs/AI-AGENT-PLAN.md`。

## 🧭 未来规划

- [ ] 接入大模型智能体：与任意哲学家对话，深入探讨其思想
- [ ] 数据扩充：更多哲学家与关系
- [ ] 时间轴视图：按年代纵向展示思想流变

## 📄 License

本项目采用 [MIT License](./LICENSE)。你可以自由使用、修改、分发（包括商用），只需保留版权声明。

---

*Star Map of Philosophy — 让思想如星辰般可被触摸。*
