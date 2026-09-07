// Prisma 客户端单例
// 全项目共享一个实例，避免每个路由文件各自 new PrismaClient() 造成连接池浪费
// 以及难以统一管理的生命周期
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

module.exports = prisma;
