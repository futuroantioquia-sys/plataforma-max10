/**
 * FUTURO ANTIOQUIA — Auth Controller
 * ────────────────────────────────────
 * Maneja las solicitudes HTTP de autenticación
 * y delega la lógica al auth.service.js
 */

const { validationResult } = require('express-validator');
const authService = require('../services/auth.service');
const prisma = require('../config/prisma');
const { hashPassword, validarFortalezaPassword } = require('../utils/password');

// ── COOKIE SEGURA PARA REFRESH TOKEN ────────────────────────
const REFRESH_COOKIE_OPTS = {
  httpOnly:  true,
  secure:    process.env.NODE_ENV === 'production',
  sameSite:  'strict',
  maxAge:    30 * 24 * 60 * 60 * 1000, // 30 días en ms
  path:      '/api/auth/refresh',
};

// ── LOGIN ─────────────────────────────────────────────────────

async function login(req, res) {
  const errores = validationResult(req);
  if (!errores.isEmpty()) {
    return res.status(422).json({ success: false, errors: errores.array() });
  }

  try {
    const { email, password, codigo2FA } = req.body;
    const dispositivo = req.headers['x-device-name'] || 'Desconocido';
    const ip          = req.ip;

    const resultado = await authService.login({
      email,
      password,
      codigo2FA,
      dispositivo,
      ip,
    });

    // Refresh token en cookie httpOnly
    res.cookie('refreshToken', resultado.refreshToken, REFRESH_COOKIE_OPTS);

    return res.status(200).json({
      success:     true,
      accessToken: resultado.accessToken,
      usuario:     resultado.usuario,
    });
  } catch (err) {
    if (err.name === 'ErrorAuth') {
      return res.status(err.status).json({
        success: false,
        error:   err.message,
        code:    err.code,
      });
    }
    console.error('[LOGIN ERROR]', err);
    return res.status(500).json({ success: false, error: 'Error interno del servidor' });
  }
}

// ── REFRESH TOKEN ─────────────────────────────────────────────

async function refresh(req, res) {
  const refreshToken =
    req.cookies?.refreshToken || req.body?.refreshToken;

  if (!refreshToken) {
    return res.status(401).json({ success: false, error: 'Refresh token no proporcionado' });
  }

  try {
    const { accessToken, refreshToken: nuevoRefresh } =
      await authService.refreshSession(refreshToken);

    // Rotar cookie
    res.cookie('refreshToken', nuevoRefresh, REFRESH_COOKIE_OPTS);

    return res.status(200).json({ success: true, accessToken });
  } catch (err) {
    if (err.name === 'ErrorAuth') {
      res.clearCookie('refreshToken');
      return res.status(err.status).json({
        success: false,
        error:   err.message,
        code:    err.code,
      });
    }
    return res.status(500).json({ success: false, error: 'Error interno del servidor' });
  }
}

// ── LOGOUT ───────────────────────────────────────────────────

async function logout(req, res) {
  const refreshToken = req.cookies?.refreshToken || req.body?.refreshToken;
  await authService.logout(refreshToken, req.usuario?.id);
  res.clearCookie('refreshToken');
  return res.status(200).json({ success: true, message: 'Sesión cerrada' });
}

async function logoutTodos(req, res) {
  await authService.logoutTodosDispositivos(req.usuario.id);
  res.clearCookie('refreshToken');
  return res.status(200).json({ success: true, message: 'Todas las sesiones cerradas' });
}

// ── PERFIL ACTUAL ─────────────────────────────────────────────

async function yo(req, res) {
  const usuario = await prisma.usuario.findUnique({
    where:  { id: req.usuario.id },
    select: {
      id: true, email: true, nombre: true, apellido: true,
      rol: true, fotoUrl: true, academiaId: true,
      dosFactores: true, emailVerificado: true, ultimoLogin: true,
      academia: {
        select: {
          id: true, nombre: true, logoUrl: true, planSuscripcion: true,
          ciudad: true, config: true,
        },
      },
    },
  });

  return res.status(200).json({ success: true, usuario });
}

// ── CAMBIAR CONTRASEÑA ────────────────────────────────────────

async function cambiarPassword(req, res) {
  const errores = validationResult(req);
  if (!errores.isEmpty()) {
    return res.status(422).json({ success: false, errors: errores.array() });
  }

  const { passwordActual, passwordNuevo } = req.body;

  if (!validarFortalezaPassword(passwordNuevo)) {
    return res.status(422).json({
      success: false,
      error:
        'La contraseña nueva debe tener mínimo 8 caracteres, una mayúscula, una minúscula y un número',
    });
  }

  try {
    await authService.cambiarPassword(req.usuario.id, { passwordActual, passwordNuevo });
    res.clearCookie('refreshToken');
    return res.status(200).json({
      success: true,
      message: 'Contraseña cambiada. Por favor inicia sesión nuevamente.',
    });
  } catch (err) {
    if (err.name === 'ErrorAuth') {
      return res.status(err.status).json({ success: false, error: err.message });
    }
    return res.status(500).json({ success: false, error: 'Error interno del servidor' });
  }
}

// ── 2FA ──────────────────────────────────────────────────────

async function habilitar2FA(req, res) {
  try {
    const { secreto, qrUri } = await authService.habilitar2FA(req.usuario.id);
    // No retornar el secreto en producción — solo el QR URI
    return res.status(200).json({
      success: true,
      qrUri,
      // Enviar el secreto permite configurar manualmente sin app QR
      secreto: process.env.NODE_ENV !== 'production' ? secreto : undefined,
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Error al habilitar 2FA' });
  }
}

async function confirmar2FA(req, res) {
  const { codigo } = req.body;
  if (!codigo) {
    return res.status(422).json({ success: false, error: 'Código 2FA requerido' });
  }
  try {
    const resultado = await authService.confirmar2FA(req.usuario.id, codigo);
    return res.status(200).json({ success: true, ...resultado });
  } catch (err) {
    if (err.name === 'ErrorAuth') {
      return res.status(err.status).json({ success: false, error: err.message });
    }
    return res.status(500).json({ success: false, error: 'Error interno del servidor' });
  }
}

async function deshabilitar2FA(req, res) {
  const { codigo } = req.body;
  if (!codigo) {
    return res.status(422).json({ success: false, error: 'Código 2FA requerido' });
  }
  try {
    const resultado = await authService.deshabilitar2FA(req.usuario.id, codigo);
    return res.status(200).json({ success: true, ...resultado });
  } catch (err) {
    if (err.name === 'ErrorAuth') {
      return res.status(err.status).json({ success: false, error: err.message });
    }
    return res.status(500).json({ success: false, error: 'Error interno del servidor' });
  }
}

// ── REGISTRO (solo super_admin puede crear admin_academia) ────

async function registrarUsuario(req, res) {
  const errores = validationResult(req);
  if (!errores.isEmpty()) {
    return res.status(422).json({ success: false, errors: errores.array() });
  }

  const { email, password, nombre, apellido, telefono, rol, academiaId } = req.body;

  // Solo administración puede crear otros administradores
  if (rol === 'administracion' && req.usuario.rol !== 'administracion') {
    return res.status(403).json({
      success: false,
      error: 'Solo administración puede crear otros administradores',
    });
  }

  // Restricción multi-tenant: solo pueden crear usuarios de SU academia
  if (req.usuario.rol === 'administracion' && academiaId !== req.usuario.academiaId) {
    return res.status(403).json({
      success: false,
      error: 'Solo puedes crear usuarios en tu academia',
    });
  }

  if (!validarFortalezaPassword(password)) {
    return res.status(422).json({
      success: false,
      error: 'La contraseña debe tener mínimo 8 caracteres, una mayúscula, una minúscula y un número',
    });
  }

  try {
    const existente = await prisma.usuario.findUnique({ where: { email } });
    if (existente) {
      return res.status(409).json({ success: false, error: 'El email ya está registrado' });
    }

    const passwordHash = await hashPassword(password);
    const nuevoUsuario = await prisma.usuario.create({
      data: {
        email:        email.toLowerCase().trim(),
        passwordHash,
        nombre,
        apellido,
        telefono:     telefono || null,
        rol,
        academiaId:   academiaId || req.usuario.academiaId,
      },
      select: {
        id: true, email: true, nombre: true, apellido: true,
        rol: true, academiaId: true, createdAt: true,
      },
    });

    return res.status(201).json({ success: true, usuario: nuevoUsuario });
  } catch (err) {
    console.error('[REGISTRO ERROR]', err);
    return res.status(500).json({ success: false, error: 'Error al crear el usuario' });
  }
}

module.exports = {
  login,
  refresh,
  logout,
  logoutTodos,
  yo,
  cambiarPassword,
  habilitar2FA,
  confirmar2FA,
  deshabilitar2FA,
  registrarUsuario,
};
