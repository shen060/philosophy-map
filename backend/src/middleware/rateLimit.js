// 简单内存 rate-limit（不需要额外依赖）
// 用法：rateLimit({ windowMs, max }) 返回 express 中间件
// key 默认用 req.ip（生产需 app.set('trust proxy', ...)）

const buckets = new Map();

// 每 5 分钟清一次过期桶，防止内存泄漏
// unref() 让定时器不阻止 Node 进程退出
const cleanup = setInterval(() => {
  const now = Date.now();
  for (const [k, b] of buckets) {
    if (now > b.resetAt) buckets.delete(k);
  }
}, 5 * 60 * 1000);
cleanup.unref();

function rateLimit({ windowMs, max, keyFn }) {
  const getKey = keyFn || ((req) => req.ip || req.socket.remoteAddress || 'unknown');
  return (req, res, next) => {
    const k = getKey(req);
    const now = Date.now();
    let bucket = buckets.get(k);
    if (!bucket || now > bucket.resetAt) {
      bucket = { count: 0, resetAt: now + windowMs };
      buckets.set(k, bucket);
    }
    bucket.count++;
    if (bucket.count > max) {
      const retrySec = Math.ceil((bucket.resetAt - now) / 1000);
      res.set('Retry-After', String(retrySec));
      return res.status(429).json({
        error: 'Too many requests, slow down',
        retryAfter: retrySec,
      });
    }
    next();
  };
}

module.exports = rateLimit;