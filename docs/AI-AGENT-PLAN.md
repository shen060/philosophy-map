# AI 智能体接入规划

> 目标：在哲学星图里，用户点开某位哲学家后，可以通过与 AI 对话更深入了解 TA。
> 本文档是"打牢基础"之后的前瞻设计，具体实现等选定大模型服务商后再动工。

---

## 一、为什么现在就能做

哲学家数据本身已经是**为对话优化过的结构化语料**，每个哲学家都包含：

| 字段 | 用途 |
|------|------|
| `coreIdea` 核心思想 | 回答"他的核心观点是什么" |
| `biography` 生平 | 回答"他经历了什么" |
| `famousQuotes` 名言 | 回答"他说过什么金句" |
| `keyConcepts` 关键概念 `{term, def}` | 回答"什么是他的 XX 概念" |
| `anecdotes` 轶事 | 让对话更生动 |
| `works` 著作 | 回答"他写过什么" |
| `historicalContext` 历史背景 | 回答"当时是什么时代" |

这些字段已经是纯文本 JSON，**无需向量化就能直接拼进 prompt**（105 位哲学家的语料量级很小，RAG 反而是杀鸡用牛刀）。

---

## 二、已经预留的接口

### `GET /api/philosophers/:id/context`

返回某位哲学家的**完整语料 + 关联关系**，专为 AI 对话注入设计：

```json
{
  "id": "kant",
  "name": "康德",
  "coreIdea": "...",
  "biography": "...",
  "famousQuotes": ["..."],
  "keyConcepts": [{ "term": "物自体", "def": "..." }],
  "anecdotes": ["..."],
  "works": [{ "title": "《纯粹理性批判》", "note": "..." }],
  "relations": {
    "influenced":  [{ "id": "...", "nameCn": "黑格尔", "relation": "..." }],
    "opposed":     [{ "id": "...", "nameCn": "休谟", "relation": "..." }],
    "influencedBy":[{ "id": "...", "nameCn": "休谟", "relation": "..." }],
    "opposedBy":   [{ "id": "...", "nameCn": "...", "relation": "..." }]
  }
}
```

**接入 AI 时，前端把这个响应作为对话的上下文发给 LLM 即可**，后端无需改数据结构。

---

## 三、接入方案（三选一）

### 方案 A：纯前端直连 LLM（最快，不推荐生产）

前端拿着 context 接口的数据，直接调 OpenAI/DeepSeek 等 API。

- ✅ 后端零改动
- ❌ **API key 暴露在前端**，谁都能扒到盗刷
- ❌ 无法做对话历史、限流、审计

### 方案 B：后端代理 + 流式响应（推荐）⭐

新增 `POST /api/chat` 接口，后端持有 key，前端只传消息：

```
前端 ──> POST /api/chat { philosopherId, messages: [{role, content}] }
      <── SSE 流式返回（text/event-stream）
```

后端流程：
1. 校验登录（可匿名限流）
2. 查 `/:id/context` 拿语料
3. 拼 system prompt（"你是一位哲学史专家，以下是 XX 的资料…"）
4. 转发给 LLM，用 **SSE 流式**把 token 吐给前端
5. 记录对话历史（可选）

**优势**：key 不暴露、能限流、能审计、能存历史。

### 方案 C：后端代理 + 对话历史存储（最完整）

在 B 的基础上，新增 `ChatConversation` / `ChatMessage` 表，让用户下次进来还能看到上次聊到哪。

---

## 四、后端需要新增的东西（方案 B/C 时）

### 1. 依赖
```bash
# 任选其一（OpenAI 兼容协议，DeepSeek/混元/Kimi 都兼容）
npm install openai
# 或手写 fetch，零依赖（推荐，减少依赖体积）
```

### 2. 路由 `src/routes/chat.js`
- `POST /api/chat`：核心对话接口（SSE 流式）
- 鉴权 + 限流（复用现有 authMiddleware + rateLimit）

### 3. 环境变量（加到 `.env.example`）
```bash
LLM_API_KEY=sk-xxx
LLM_BASE_URL=https://api.deepseek.com/v1   # 或 openai / 混元
LLM_MODEL=deepseek-chat
```

### 4. 数据模型（方案 C 才需要，加到 schema.prisma）
```prisma
model ChatConversation {
  id           String   @id @default(uuid())
  userId       String
  philosopherId String
  createdAt    DateTime @default(now())
  messages     ChatMessage[]
  user         User @relation(...)
}

model ChatMessage {
  id             String   @id @default(uuid())
  conversationId String
  role           String   // 'user' | 'assistant'
  content        String
  createdAt      DateTime @default(now())
}
```

---

## 五、安全要点（接入前必须处理）

| 风险 | 对策 |
|------|------|
| API key 泄露 | 只在后端持有，前端永远拿不到 |
| 盗刷（无限调 AI） | 对话接口限流（如每用户每分钟 10 条）+ 单条 token 上限 |
| prompt 注入（用户诱导 AI 越界） | system prompt 里强约束角色边界，过滤用户输入 |
| 成本失控 | 限制上下文长度（只注入该哲学家语料，不注入全库）、限制每日调用次数 |
| 隐私 | 对话历史只存登录用户，且可删除 |

---

## 六、推荐落地顺序

1. ✅ **（已完成）打牢基础**：错误处理、日志、健康检查、Prisma 单例、配置集中
2. ✅ **（已完成）语料接口**：`/api/philosophers/:id/context`
3. ⬜ 选 LLM 服务商（DeepSeek 性价比高，混元国内合规，OpenAI 生态成熟）
4. ⬜ 后端加 `POST /api/chat`（先做非流式，验证通了再加 SSE 流式）
5. ⬜ 前端加对话 UI（复用现有 DetailCard 的卡片风格）
6. ⬜ 加对话历史存储 + 限流 + 审计

---

## 七、不做的事（避免过度设计）

- ❌ 不上向量数据库（105 位哲学家，直接全文注入更快更准）
- ❌ 不训练/微调模型（用 prompt engineering 足够）
- ❌ 不做多智能体（单智能体 + 语料注入已经能覆盖 90% 需求）
