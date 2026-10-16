// 集中式配置管理：统一读取 + 校验环境变量
// 启动时 fail-fast，避免运行到一半才发现缺配置

require('dotenv').config();

const config = {
  port: parseInt(process.env.PORT || '3001', 10),
  host: process.env.HOST || '0.0.0.0',
  jwtSecret: process.env.JWT_SECRET,
  databaseUrl: process.env.DATABASE_URL || 'file:./dev.db',
  trustProxyHops: parseInt(process.env.TRUST_PROXY_HOPS || '1', 10),
  // 允许的前端 origin（逗号分隔）
  allowedOrigins: (process.env.FRONTEND_ORIGIN || 'http://localhost:5173')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean),
  // 日志级别：'dev' 打印请求日志，'prod' 只打印错误
  logLevel: process.env.LOG_LEVEL || 'dev',
  // LLM（AI 对话，OpenAI 兼容协议；留空 = 对话接口返回 503，不影响其他功能）
  llmApiKey: process.env.LLM_API_KEY || '',
  llmBaseUrl: process.env.LLM_BASE_URL || 'https://api.deepseek.com/v1',
  llmModel: process.env.LLM_MODEL || 'deepseek-chat',
};

// 启动校验：JWT_SECRET 缺失直接退出（否则签发的 token 无法验证）
if (!config.jwtSecret) {
  console.error('❌ JWT_SECRET is not set. Please configure it in .env');
  process.exit(1);
}
if (config.jwtSecret === 'change-me-in-production-to-something-random') {
  console.warn('⚠️  JWT_SECRET is using the default placeholder. Change it before deploying.');
}

module.exports = config;
