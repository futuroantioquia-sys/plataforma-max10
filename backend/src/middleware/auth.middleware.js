/**
 * FUTURO ANTIOQUIA — Middleware de Autenticación y Autorización
 * ─────────────────────────────────────────────────────────────
 * Implementa:
 *   - Verificación de JWT (Bearer token)
 *   - RBAC (Role-Based Access Control) granular
 *   - Aislamiento multi-tenant por academia_id
 *   - Chequeo de cuenta activa
 */

const { verificarAccessToken } = require('../utils/jwt');
const prisma = require('../config/prisma');

// ── JERARQUÍA DE ROLES ──────────────────────────────────────
// Número más alto = más permisos
const JERARQUIA_ROL = {
  padre:          1,
  profesor:       2,
  contable:       3,
  administracion: 4,
};

/**
 * authenticateToken
 * Verifica el JWT de la cabecera Authorization: Bearer <token>
 * y adjunta el payload en req.usuario.
 */
async function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader?.startsWith('Bearer ')
    ? authHeader.slice(7)
    : null;

  if (!token) {
    return res.status(401).json({
      success: false,
      error: 'Token de acceso requerido',
    });
  }

  try {
    const payload = verificarAccessToken(token);

    // Verificar que el usuario aún existe y está activo
    const usuario = await prisma.usuario.findUnique({
      where: { id: payload.sub },
      select: {
        id: true, academiaId: true, rol: true, activo: true,
        email: true, nombre: true, apellido: true,
        bloqueadoHasta: true,
      },
    });

    if (!usuario || !usuario.activo) {
      return res.status(401).json({
        success: false,
        error: 'Usuario no encontrado o desactivado',
      });
    }

    if (usuario.bloqueadoHasta && usuario.bloqueadoHasta > new Date()) {
      return res.status(423).json({
        success: false,
        error: 'Cuenta bloqueada temporalmente',
        bloqueadoHasta: usuario.bloqueadoHasta,
      });
    }

    req.usuario = usuario;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        error: 'Token expirado',
        code: 'TOKEN_EXPIRED',
      });
    }
    return res.status(401).json({
      success: false,
      error: 'Token inválido',
    });
  }
}

/**
 * requireRol(...roles)
 * Guard que permite acceso solo a los roles especificados.
 *
 * Uso: router.get('/ruta', authenticateToken, requireRol('admin_academia', 'super_admin'), handler)
 */
function requireRol(...roles) {
  return (req, res, next) => {
    if (!req.usuario) {
      return res.status(401).json({ success: false, error: 'No autenticado' });
    }
    if (!roles.includes(req.usuario.rol)) {
      return res.status(403).json({
        success: false,
        error: 'No tienes permiso para acceder a este recurso',
        requerido: roles,
        tuRol: req.usuario.rol,
      });
    }
    next();
  };
}

/**
 * requireRolMinimo(rolMinimo)
 * Permite el rol indicado y todos los superiores en la jerarquía.
 *
 * Uso: requireRolMinimo('coordinador') → permite coordinador, admin_academia, super_admin
 */
function requireRolMinimo(rolMinimo) {
  const nivelMinimo = JERARQUIA_ROL[rolMinimo];
  return (req, res, next) => {
    if (!req.usuario) {
      return res.status(401).json({ success: false, error: 'No autenticado' });
    }
    const nivelUsuario = JERARQUIA_ROL[req.usuario.rol] ?? 0;
    if (nivelUsuario < nivelMinimo) {
      return res.status(403).json({
        success: false,
        error: 'Permisos insuficientes',
        requerido: `${rolMinimo} o superior`,
        tuRol: req.usuario.rol,
      });
    }
    next();
  };
}

/**
 * requireMismaAcademia
 * Valida que el usuario solo acceda a datos de SU academia (multi-tenant).
 * El academiaId debe venir en req.params.academiaId o req.body.academiaId.
 * Los super_admin pueden acceder a cualquier academia.
 */
function requireMismaAcademia(req, res, next) {
  if (!req.usuario) {
    return res.status(401).json({ success: false, error: 'No autenticado' });
  }

  // administracion tiene acceso total
  if (req.usuario.rol === 'administracion') {
    return next();
  }

  const academiaIdSolicitada =
    req.params.academiaId ||
    req.body.academiaId ||
    req.query.academiaId;

  if (academiaIdSolicitada && academiaIdSolicitada !== req.usuario.academiaId) {
    return res.status(403).json({
      success: false,
      error: 'No puedes acceder a datos de otra academia',
    });
  }

  next();
}

/**
 * requirePropioOAdmin
 * El usuario solo puede acceder a sus propios datos, a menos que sea admin+.
 * Verifica req.params.usuarioId contra req.usuario.id.
 */
function requirePropioOAdmin(req, res, next) {
  if (!req.usuario) {
    return res.status(401).json({ success: false, error: 'No autenticado' });
  }
  const nivelUsuario = JERARQUIA_ROL[req.usuario.rol] ?? 0;
  const esAdmin = nivelUsuario >= JERARQUIA_ROL['administracion'];

  if (!esAdmin && req.params.usuarioId !== req.usuario.id) {
    return res.status(403).json({
      success: false,
      error: 'Solo puedes acceder a tu propio perfil',
    });
  }
  next();
}

// ── GUARDS DE ACCESO RÁPIDO POR MÓDULO ─────────────────────

/** Solo administración */
const soloAdmin = [authenticateToken, requireRolMinimo('administracion')];

/** Contable y administración (módulo financiero) */
const moduloContable = [authenticateToken, requireRol('contable', 'administracion')];

/** Profesores, contable y administración */
const profOAdmin = [authenticateToken, requireRolMinimo('profesor')];

/** Todos los roles autenticados (incluye padre) */
const todosLosRoles = [authenticateToken];

module.exports = {
  authenticateToken,
  requireRol,
  requireRolMinimo,
  requireMismaAcademia,
  requirePropioOAdmin,
  JERARQUIA_ROL,
  // Shortcuts por módulo
  soloAdmin,       // Solo administración
  moduloContable,  // Contable + administración (pagos, facturas, cartera)
  profOAdmin,      // Profesores + contable + administración
  todosLosRoles,   // Todos incluido padre
};
