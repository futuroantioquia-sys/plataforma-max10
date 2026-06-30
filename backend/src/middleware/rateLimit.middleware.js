const rateLimit = require('express-rate-limit');

/**
 * Rate limit estricto para rutas de autenticación.
 * Previene ataques de fuerza bruta.
 */
const loginLimiter = rateLimit({
  windowMs:         15 * 60 * 1000, // 15 minutos
  max:              10,
  message: {
    success: false,
    error:   'Demasiados intentos. Intenta de nuevo en 15 minutos.',
  },
  standardHeaders:  true,
  legacyHeaders:    false,
  keyGenerator:     (req) => req.ip,
});

/**
 * Rate limit para la ruta de refresh token.
 */
const refreshLimiter = rateLimit({
  windowMs:         5 * 60 * 1000, // 5 minutos
  max:              20,
  message: {
    success: false,
    error:   'Demasiadas solicitudes de renovación de sesión.',
  },
  standardHeaders:  true,
  legacyHeaders:    false,
});

/**
 * Rate limit general para la API.
 */
const apiLimiter = rateLimit({
  windowMs:         60 * 1000, // 1 minuto
  max:              200,
  message: {
    success: false,
    error:   'Límite de solicitudes alcanzado. Intenta de nuevo en un minuto.',
  },
  standardHeaders:  true,
  legacyHeaders:    false,
});

module.exports = { loginLimiter, refreshLimiter, apiLimiter };
