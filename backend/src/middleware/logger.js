// 轻量请求日志中间件（不引入额外依赖）
// dev 模式打印每个请求；prod 模式静默（只靠 errorHandler 记错误）
const config = require('../lib/config');

function logger(req, res, next) {
  if (config.logLevel !== 'dev') return next();

  const start = Date.now();
  // 响应结束时打印一行：方法 路径 状态码 耗时
  res.on('finish', () => {
    const ms = Date.now() - start;
    const status = res.statusCode;
    // 只打印 4xx/5xx 和耗时较长的请求，避免刷屏；也可打印全部
    console.log(`${req.method} ${req.originalUrl} → ${status} (${ms}ms)`);
  });
  next();
}

module.exports = logger;
