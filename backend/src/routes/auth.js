// Auth 路由: register / login / me
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const prisma = require('../lib/prisma');
const authMiddleware = require('../middleware/auth');
const rateLimit = require('../middleware/rateLimit');
const asyncHandler = require('../lib/asyncHandler');
const config = require('../lib/config');

const router = express.Router();

// 限流：register 严一点（防批量注册），login 松一点（容许错几次密码）
const registerLimiter = rateLimit({ windowMs: 60_000, max: 5 });
const loginLimiter = rateLimit({ windowMs: 60_000, max: 20 });

// 基础校验
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function signToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, name: user.name },
    config.jwtSecret,
    { expiresIn: '7d' }
  );
}

function sanitize(user) {
  return { id: user.id, email: user.email, name: user.name, createdAt: user.createdAt };
}

// POST /api/auth/register
router.post('/register', registerLimiter, asyncHandler(async (req, res) => {
  const { email, password, name } = req.body || {};
  if (!email || !password || !name) {
    return res.status(400).json({ error: 'email, password and name are required' });
  }
  if (typeof email !== 'string' || !EMAIL_RE.test(email)) {
    return res.status(400).json({ error: 'Invalid email format' });
  }
  if (typeof name !== 'string' || name.trim().length < 1 || name.length > 50) {
    return res.status(400).json({ error: 'Name must be 1-50 chars' });
  }
  if (typeof password !== 'string' || password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 chars' });
  }
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return res.status(400).json({ error: 'Email already registered' });
  }
  const hash = await bcrypt.hash(password, 12);
  const user = await prisma.user.create({ data: { email, name: name.trim(), password: hash } });
  const token = signToken(user);
  res.json({ token, user: sanitize(user) });
}));

// POST /api/auth/login
router.post('/login', loginLimiter, asyncHandler(async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: 'email and password are required' });
  }
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return res.status(401).json({ error: 'Invalid credentials' });
  const ok = await bcrypt.compare(password, user.password);
  if (!ok) return res.status(401).json({ error: 'Invalid credentials' });
  const token = signToken(user);
  res.json({ token, user: sanitize(user) });
}));

// GET /api/auth/me
router.get('/me', authMiddleware, asyncHandler(async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.user.id } });
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json(sanitize(user));
}));

module.exports = router;
