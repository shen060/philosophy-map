// Express 入口
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');

const config = require('./src/lib/config');
const logger = require('./src/middleware/logger');
const { notFoundHandler, errorHandler } = require('./src/lib/errors');
const prisma = require('./src/lib/prisma');

const authRouter = require('./src/routes/auth');
const philosophersRouter = require('./src/routes/philosophers');
const linksRouter = require('./src/routes/links');
const searchRouter = require('./src/routes/search');
const chatRouter = require('./src/routes/chat');

const app = express();

// trust proxy 风险：必须与实际反代层数匹配。错配会导致 rate-limit 失效
// （所有请求都打到一个 bucket）。反代层数变化时同步修改 .env 的 TRUST_PROXY_HOPS。
app.set('trust proxy', config.trustProxyHops);

// 安全 HTTP headers（X-Content-Type-Options / X-Frame-Options / 等等）
app.use(helmet({
  // 不强制 CSP：开发模式下 vite 用内联脚本，生产由 Nginx 控制
  contentSecurityPolicy: false,
}));

// CORS 白名单：只允许显式配置的 origin（防止第三方网站调你的 API）
app.use(cors({
  origin: (origin, cb) => {
    // 同源请求（curl、Postman）没有 origin header —— 直接放行
    if (!origin) return cb(null, true);
    if (config.allowedOrigins.includes(origin)) return cb(null, true);
    cb(new Error('CORS not allowed: ' + origin));
  },
  credentials: true,
}));

app.use(express.json({ limit: '100kb' }));  // 防巨大 body

// 请求日志
app.use(logger);

// 健康检查：连数据库也 ping 一下，确保 DB 可用才返回 ok
app.get('/api/health', async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ ok: true, db: 'up' });
  } catch (e) {
    res.status(503).json({ ok: false, db: 'down' });
  }
});

app.use('/api/auth', authRouter);
app.use('/api/philosophers', philosophersRouter);
app.use('/api/links', linksRouter);
app.use('/api/search', searchRouter);
app.use('/api/chat', chatRouter);

// 404 兜底（放所有路由之后）
app.use(notFoundHandler);

// 全局错误处理（必须 4 个参数）
app.use(errorHandler);

// 优雅关闭：SIGINT/SIGTERM 时断开 Prisma，避免连接悬挂
function shutdown(signal) {
  console.log(`\n${signal} received, shutting down...`);
  prisma.$disconnect()
    .then(() => process.exit(0))
    .catch((e) => { console.error(e); process.exit(1); });
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// 显式绑定 host，确保 Nginx 反向代理（127.0.0.1:PORT）和局域网/公网都能访问
app.listen(config.port, config.host, () => {
  console.log(`🟢 Backend running at http://${config.host}:${config.port}`);
});
