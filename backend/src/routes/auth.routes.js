/**
 * FUTURO ANTIOQUIA — Rutas de Autenticación
 * ──────────────────────────────────────────
 * Base path: /api/auth
 */

const { Router } = require('express');
const { body }   = require('express-validator');
const ctrl       = require('../controllers/auth.controller');
const { authenticateToken, requireRolMinimo } = require('../middleware/auth.middleware');
const { loginLimiter, refreshLimiter }        = require('../middleware/rateLimit.middleware');

const router = Router();

// ── POST /api/auth/login ─────────────────────────────────────
// Pública | Rate-limited
router.post(
  '/login',
  loginLimiter,
  [
    body('email')
      .isEmail().withMessage('Email inválido')
      .normalizeEmail(),
    body('password')
      .notEmpty().withMessage('Contraseña requerida')
      .isLength({ min: 6 }).withMessage('Contraseña demasiado corta'),
    body('codigo2FA')
      .optional()
      .isLength({ min: 6, max: 6 }).withMessage('Código 2FA debe tener 6 dígitos'),
  ],
  ctrl.login
);

// ── POST /api/auth/refresh ───────────────────────────────────
// Pública (usa cookie httpOnly) | Rate-limited
router.post('/refresh', refreshLimiter, ctrl.refresh);

// ── POST /api/auth/logout ────────────────────────────────────
// Autenticado
router.post('/logout', authenticateToken, ctrl.logout);

// ── POST /api/auth/logout-todos ──────────────────────────────
// Cierra todas las sesiones activas del usuario
router.post('/logout-todos', authenticateToken, ctrl.logoutTodos);

// ── GET /api/auth/yo ─────────────────────────────────────────
// Retorna el perfil del usuario autenticado + datos de su academia
router.get('/yo', authenticateToken, ctrl.yo);

// ── POST /api/auth/cambiar-password ──────────────────────────
router.post(
  '/cambiar-password',
  authenticateToken,
  [
    body('passwordActual').notEmpty().withMessage('Contraseña actual requerida'),
    body('passwordNuevo')
      .isLength({ min: 8 }).withMessage('La nueva contraseña debe tener mínimo 8 caracteres'),
  ],
  ctrl.cambiarPassword
);

// ── 2FA ──────────────────────────────────────────────────────
router.post('/2fa/habilitar',    authenticateToken, ctrl.habilitar2FA);
router.post('/2fa/confirmar',    authenticateToken, ctrl.confirmar2FA);
router.post('/2fa/deshabilitar', authenticateToken, ctrl.deshabilitar2FA);

// ── POST /api/auth/usuarios ──────────────────────────────────
// Crear usuarios (admin_academia+)
router.post(
  '/usuarios',
  authenticateToken,
  requireRolMinimo('admin_academia'),
  [
    body('email').isEmail().normalizeEmail(),
    body('password').isLength({ min: 8 }),
    body('nombre').notEmpty().trim(),
    body('apellido').notEmpty().trim(),
    body('rol').isIn([
      'administracion', 'contable', 'profesor', 'padre'
    ]).withMessage('Rol no válido. Debe ser: administracion, contable, profesor o padre'),
  ],
  ctrl.registrarUsuario
);

module.exports = router;
