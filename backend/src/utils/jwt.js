const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const ACCESS_SECRET  = process.env.JWT_ACCESS_SECRET;
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET;
const ACCESS_EXP     = process.env.JWT_ACCESS_EXPIRES_IN  || '15m';
const REFRESH_EXP    = process.env.JWT_REFRESH_EXPIRES_IN || '30d';

/**
 * Genera un JWT de acceso (corta duración).
 * Payload: id, academiaId, rol, email
 */
function generarAccessToken(usuario) {
  return jwt.sign(
    {
      sub:        usuario.id,
      academiaId: usuario.academiaId,
      rol:        usuario.rol,
      email:      usuario.email,
    },
    ACCESS_SECRET,
    { expiresIn: ACCESS_EXP, issuer: 'futuro-antioquia' }
  );
}

/**
 * Genera un refresh token opaco (UUID aleatorio).
 * Se almacena su hash SHA-256 en la BD.
 */
function generarRefreshToken() {
  return crypto.randomBytes(40).toString('hex');
}

/**
 * Hashea el refresh token para almacenamiento seguro.
 */
function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Verifica y decodifica un access token.
 * Lanza JsonWebTokenError o TokenExpiredError en caso de error.
 */
function verificarAccessToken(token) {
  return jwt.verify(token, ACCESS_SECRET, { issuer: 'futuro-antioquia' });
}

/**
 * Calcula la fecha de expiración del refresh token en ms.
 */
function refreshTokenExpiresAt() {
  const days = parseInt(REFRESH_EXP) || 30;
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

module.exports = {
  generarAccessToken,
  generarRefreshToken,
  hashToken,
  verificarAccessToken,
  refreshTokenExpiresAt,
};
