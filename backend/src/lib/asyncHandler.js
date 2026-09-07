// 异步路由包装器：捕获 async 函数里 throw 的错误，转交给 next(err)
// Express 4 不会自动捕获 async 抛错，没有这个包装会导致请求挂起 / 进程崩溃
//
// 用法：
//   router.get('/x', asyncHandler(async (req, res) => { ... }))
module.exports = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};
