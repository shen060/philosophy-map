// 统一错误类型 + 错误处理中间件
// 让所有路由的错误都能被正确捕获并返回一致的 JSON 结构

// 业务错误：带状态码，路由里 throw 后会被全局 errorHandler 捕获
class AppError extends Error {
  constructor(message, statusCode = 500, code = null) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isAppError = true;
  }
}

// 404 兜底：没有任何路由匹配时触发
function notFoundHandler(req, res) {
  res.status(404).json({ error: `Cannot ${req.method} ${req.path}` });
}

// 全局错误处理中间件（必须放在所有路由之后，且有 4 个参数）
// 处理三类错误：
//   1. AppError（业务错误，用自带 statusCode）
//   2. Prisma 已知错误（映射到友好的 HTTP 状态码）
//   3. 其他未知错误（500，不泄露内部细节）
function errorHandler(err, req, res, next) {
  // Prisma 错误码映射
  if (err && err.code === 'P2002') {
    return res.status(409).json({ error: 'Record already exists' });
  }
  if (err && err.code === 'P2025') {
    return res.status(404).json({ error: 'Record not found' });
  }
  if (err && err.isAppError) {
    return res.status(err.statusCode).json({
      error: err.message,
      ...(err.code ? { code: err.code } : {}),
    });
  }
  // 未知错误：记录详情，但只给客户端通用信息（防泄露）
  console.error('[Unhandled Error]', err);
  res.status(500).json({ error: 'Internal server error' });
}

module.exports = { AppError, notFoundHandler, errorHandler };
