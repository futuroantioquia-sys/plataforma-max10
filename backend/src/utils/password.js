const bcrypt = require('bcryptjs');

const ROUNDS = parseInt(process.env.BCRYPT_SALT_ROUNDS) || 12;

/**
 * Hashea una contraseña con bcrypt.
 */
async function hashPassword(plainText) {
  return bcrypt.hash(plainText, ROUNDS);
}

/**
 * Compara una contraseña en texto plano con su hash.
 */
async function verificarPassword(plainText, hash) {
  return bcrypt.compare(plainText, hash);
}

/**
 * Valida la fortaleza de la contraseña.
 * Mínimo 8 caracteres, al menos una mayúscula, una minúscula y un número.
 */
function validarFortalezaPassword(password) {
  const regex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;
  return regex.test(password);
}

module.exports = { hashPassword, verificarPassword, validarFortalezaPassword };
