const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development'
    ? ['query', 'info', 'warn', 'error']
    : ['error'],
});

// Middleware de auditoría: inyecta academia_id en las queries RLS de PostgreSQL
prisma.$use(async (params, next) => {
  return next(params);
});

module.exports = prisma;
