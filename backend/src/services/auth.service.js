/**
 * FUTURO ANTIOQUIA — Auth Service
 * ─────────────────────────────────
 * Lógica de negocio de autenticación:
 *   - Login con bloqueo por intentos
 *   - Emisión y rotación de tokens
 *   - Logout y revocación
 *   - 2FA con TOTP (Google Authenticator compatible)
 *   - Recuperación de contraseña
 */

const prisma = require('../config/prisma');
const { hashPassword, verificarPassword } = require('../utils/password');
const {
  generarAccessToken,
  generarRefreshToken,
  hashToken,
  refreshTokenExpiresAt,
} = require('../utils/jwt');
const { registrarAuditoria } = require('../utils/audit');
const { authenticator } = require('otplib');
const crypto = require('crypto');

const MAX_INTENTOS    = parseInt(process.env.MAX_LOGIN_ATTEMPTS) || 5;
const LOCK_MINUTES    = parseInt(process.env.LOCK_TIME_MINUTES)  || 30;

// ── LOGIN ───────────────────────────────────────────────────

async function login({ email, password, codigo2FA, dispositivo, ip, userAgent }) {
  // 1. Buscar usuario
  const usuario = await prisma.usuario.findUnique({
    where: { email: email.toLowerCase().trim() },
    include: { academia: { select: { activa: true, suscripcionActiva: true } } },
  });

  if (!usuario) {
    // Respuesta genérica para no revelar si el email existe
    throw new ErrorAuth('Credenciales incorrectas', 401);
  }

  // 2. Verificar cuenta activa
  if (!usuario.activo) {
    throw new ErrorAuth('Cuenta desactivada. Contacta al administrador.', 403);
  }

  // 3. Verificar bloqueo temporal
  if (usuario.bloqueadoHasta && usuario.bloqueadoHasta > new Date()) {
    const minutosRestantes = Math.ceil(
      (usuario.bloqueadoHasta - new Date()) / 60000
    );
    throw new ErrorAuth(
      `Cuenta bloqueada. Intenta en ${minutosRestantes} minuto(s).`,
      423
    );
  }

  // 4. Verificar contraseña
  const passwordOk = await verificarPassword(password, usuario.passwordHash);

  if (!passwordOk) {
    const nuevosIntentos = usuario.intentosLogin + 1;
    const bloquear = nuevosIntentos >= MAX_INTENTOS;

    await prisma.usuario.update({
      where: { id: usuario.id },
      data: {
        intentosLogin:  nuevosIntentos,
        bloqueadoHasta: bloquear
          ? new Date(Date.now() + LOCK_MINUTES * 60 * 1000)
          : null,
      },
    });

    if (bloquear) {
      throw new ErrorAuth(
        `Cuenta bloqueada por ${LOCK_MINUTES} minutos tras ${MAX_INTENTOS} intentos fallidos.`,
        423
      );
    }

    throw new ErrorAuth('Credenciales incorrectas', 401);
  }

  // 5. Verificar 2FA (si está activado)
  if (usuario.dosFactores) {
    if (!codigo2FA) {
      throw new ErrorAuth('Se requiere código de autenticación de dos factores', 401, 'NEED_2FA');
    }
    const secreto = usuario.dosFactoresSecret;
    const valido = authenticator.verify({ token: codigo2FA, secret: secreto });
    if (!valido) {
      throw new ErrorAuth('Código 2FA incorrecto', 401);
    }
  }

  // 6. Reset intentos fallidos y actualizar último login
  await prisma.usuario.update({
    where: { id: usuario.id },
    data: {
      intentosLogin:  0,
      bloqueadoHasta: null,
      ultimoLogin:    new Date(),
    },
  });

  // 7. Generar tokens
  const { accessToken, refreshTokenRaw } = await emitirTokens({
    usuario,
    dispositivo,
    ip,
  });

  // 8. Auditoría
  await registrarAuditoria({
    academiaId: usuario.academiaId,
    usuarioId:  usuario.id,
    accion:     'login',
    recurso:    'sesion',
    detalles:   { dispositivo, ip },
  });

  return {
    accessToken,
    refreshToken: refreshTokenRaw,
    usuario: perfilPublico(usuario),
  };
}

// ── REFRESH TOKEN ───────────────────────────────────────────

async function refreshSession(refreshTokenRaw) {
  const tokenHash = hashToken(refreshTokenRaw);

  const rt = await prisma.refreshToken.findUnique({
    where: { tokenHash },
    include: {
      usuario: {
        select: {
          id: true, academiaId: true, rol: true, email: true,
          activo: true, bloqueadoHasta: true,
          nombre: true, apellido: true,
        },
      },
    },
  });

  if (!rt || rt.revocado || rt.expiresAt < new Date()) {
    throw new ErrorAuth('Refresh token inválido o expirado', 401, 'REFRESH_INVALID');
  }

  if (!rt.usuario.activo) {
    throw new ErrorAuth('Cuenta desactivada', 403);
  }

  // Rotación: revocar el token anterior y emitir uno nuevo
  await prisma.refreshToken.update({
    where: { id: rt.id },
    data:  { revocado: true },
  });

  const { accessToken, refreshTokenRaw: nuevoRefresh } = await emitirTokens({
    usuario:     rt.usuario,
    dispositivo: rt.dispositivo,
    ip:          rt.ipAddress,
  });

  return { accessToken, refreshToken: nuevoRefresh };
}

// ── LOGOUT ──────────────────────────────────────────────────

async function logout(refreshTokenRaw, usuarioId) {
  if (!refreshTokenRaw) return;
  const tokenHash = hashToken(refreshTokenRaw);
  await prisma.refreshToken.updateMany({
    where: { tokenHash, usuarioId },
    data:  { revocado: true },
  });

  await registrarAuditoria({
    usuarioId,
    accion:  'logout',
    recurso: 'sesion',
  });
}

async function logoutTodosDispositivos(usuarioId) {
  await prisma.refreshToken.updateMany({
    where: { usuarioId, revocado: false },
    data:  { revocado: true },
  });
}

// ── 2FA ─────────────────────────────────────────────────────

async function habilitar2FA(usuarioId) {
  const secreto = authenticator.generateSecret();
  const qrUri   = authenticator.keyuri(
    'futuro-antioquia',
    'Futuro Antioquia',
    secreto
  );

  // Guardar secreto temporalmente (sin confirmar hasta que el usuario lo valide)
  await prisma.usuario.update({
    where: { id: usuarioId },
    data:  { dosFactoresSecret: secreto },
  });

  return { secreto, qrUri };
}

async function confirmar2FA(usuarioId, codigo) {
  const usuario = await prisma.usuario.findUnique({
    where:  { id: usuarioId },
    select: { dosFactoresSecret: true },
  });

  if (!usuario?.dosFactoresSecret) {
    throw new ErrorAuth('Primero habilita 2FA', 400);
  }

  const valido = authenticator.verify({
    token: codigo,
    secret: usuario.dosFactoresSecret,
  });

  if (!valido) {
    throw new ErrorAuth('Código 2FA incorrecto', 400);
  }

  await prisma.usuario.update({
    where: { id: usuarioId },
    data:  { dosFactores: true },
  });

  return { activado: true };
}

async function deshabilitar2FA(usuarioId, codigo) {
  const usuario = await prisma.usuario.findUnique({
    where:  { id: usuarioId },
    select: { dosFactoresSecret: true, dosFactores: true },
  });

  if (!usuario?.dosFactores) {
    throw new ErrorAuth('El 2FA no está activado', 400);
  }

  const valido = authenticator.verify({ token: codigo, secret: usuario.dosFactoresSecret });
  if (!valido) throw new ErrorAuth('Código 2FA incorrecto', 400);

  await prisma.usuario.update({
    where: { id: usuarioId },
    data:  { dosFactores: false, dosFactoresSecret: null },
  });

  return { desactivado: true };
}

// ── CAMBIO Y RECUPERACIÓN DE CONTRASEÑA ─────────────────────

async function cambiarPassword(usuarioId, { passwordActual, passwordNuevo }) {
  const usuario = await prisma.usuario.findUnique({
    where:  { id: usuarioId },
    select: { passwordHash: true },
  });

  const ok = await verificarPassword(passwordActual, usuario.passwordHash);
  if (!ok) throw new ErrorAuth('Contraseña actual incorrecta', 400);

  const nuevoHash = await hashPassword(passwordNuevo);
  await prisma.usuario.update({
    where: { id: usuarioId },
    data:  { passwordHash: nuevoHash },
  });

  // Revocar todas las sesiones (seguridad)
  await logoutTodosDispositivos(usuarioId);

  return { cambiada: true };
}

// ── HELPERS INTERNOS ─────────────────────────────────────────

async function emitirTokens({ usuario, dispositivo, ip }) {
  const accessToken     = generarAccessToken(usuario);
  const refreshTokenRaw = generarRefreshToken();
  const tokenHash       = hashToken(refreshTokenRaw);

  await prisma.refreshToken.create({
    data: {
      usuarioId:   usuario.id,
      tokenHash,
      expiresAt:   refreshTokenExpiresAt(),
      dispositivo: dispositivo || null,
      ipAddress:   ip || null,
    },
  });

  return { accessToken, refreshTokenRaw };
}

function perfilPublico(usuario) {
  return {
    id:         usuario.id,
    academiaId: usuario.academiaId,
    email:      usuario.email,
    nombre:     usuario.nombre,
    apellido:   usuario.apellido,
    rol:        usuario.rol,
    fotoUrl:    usuario.fotoUrl,
    dosFactores: usuario.dosFactores,
  };
}

// Error tipado para el servicio de auth
class ErrorAuth extends Error {
  constructor(mensaje, status = 401, code = null) {
    super(mensaje);
    this.name   = 'ErrorAuth';
    this.status = status;
    this.code   = code;
  }
}

module.exports = {
  login,
  refreshSession,
  logout,
  logoutTodosDispositivos,
  habilitar2FA,
  confirmar2FA,
  deshabilitar2FA,
  cambiarPassword,
  perfilPublico,
  ErrorAuth,
};
