/**
 * FUTURO ANTIOQUIA — API Server
 * ──────────────────────────────
 * Node.js 20 + Express 4 + Prisma 5 + PostgreSQL 16
 */

require('dotenv').config();

const express     = require('express');
const helmet      = require('helmet');
const cors        = require('cors');
const compression = require('compression');
const morgan      = require('morgan');
const cookieParser = require('cookie-parser');

const { apiLimiter }  = require('./middleware/rateLimit.middleware');
const authRoutes      = require('./routes/auth.routes');
const prisma          = require('./config/prisma');

const app  = express();
const PORT = process.env.PORT || 4000;

// ── SEGURIDAD ─────────────────────────────────────────────────
app.set('trust proxy', 1); // Confiar en el proxy de AWS/Nginx

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc:  ["'self'"],
      styleSrc:   ["'self'", "'unsafe-inline'"],
    },
  },
}));

app.use(cors({
  origin:      process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,              // Necesario para cookies httpOnly
  methods:     ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-device-name'],
}));

// ── MIDDLEWARES GLOBALES ──────────────────────────────────────
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('combined'));
}

// Rate limit global de la API
app.use('/api/', apiLimiter);

// ── HEALTH CHECK ──────────────────────────────────────────────
app.get('/health', async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({
      status: 'ok',
      service: 'futuro-antioquia-api',
      timestamp: new Date().toISOString(),
      db: 'connected',
    });
  } catch {
    res.status(503).json({ status: 'error', db: 'disconnected' });
  }
});

// ── RUTAS ─────────────────────────────────────────────────────
app.use('/api/auth', authRoutes);

// Aquí se agregarán más rutas en las próximas fases:
// app.use('/api/alumnos',           require('./routes/alumnos.routes'));
// app.use('/api/categorias',        require('./routes/categorias.routes'));
// app.use('/api/entrenamientos',    require('./routes/entrenamientos.routes'));
// app.use('/api/asistencias',       require('./routes/asistencias.routes'));
// app.use('/api/evaluaciones',      require('./routes/evaluaciones.routes'));
// app.use('/api/pagos',             require('./routes/pagos.routes'));
// app.use('/api/conversaciones',    require('./routes/conversaciones.routes'));
// app.use('/api/nutricion',         require('./routes/nutricion.routes'));
// app.use('/api/admin',             require('./routes/admin.routes'));

// ── 404 ───────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: `Ruta ${req.method} ${req.path} no encontrada`,
  });
});

// ── ERROR HANDLER ─────────────────────────────────────────────
app.use((err, req, res, _next) => {
  console.error('[ERROR GLOBAL]', err);
  res.status(err.status || 500).json({
    success: false,
    error: process.env.NODE_ENV === 'production'
      ? 'Error interno del servidor'
      : err.message,
  });
});

// ── ARRANQUE ──────────────────────────────────────────────────
async function arrancar() {
  try {
    await prisma.$connect();
    console.log('✅ PostgreSQL conectado');

    app.listen(PORT, () => {
      console.log(`🚀 Futuro Antioquia API corriendo en http://localhost:${PORT}`);
      console.log(`📋 Entorno: ${process.env.NODE_ENV || 'development'}`);
    });
  } catch (err) {
    console.error('❌ Error al conectar la base de datos:', err);
    process.exit(1);
  }
}

arrancar();

// Cierre limpio
process.on('SIGTERM', async () => {
  await prisma.$disconnect();
  process.exit(0);
});

module.exports = app;
