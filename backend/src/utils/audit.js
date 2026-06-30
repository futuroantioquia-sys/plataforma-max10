const prisma = require('../config/prisma');

/**
 * Registra una acción en logs_auditoria.
 * Cumplimiento Ley 1581 de protección de datos personales (Colombia).
 */
async function registrarAuditoria({
  academiaId,
  usuarioId,
  accion,
  recurso,
  recursoId = null,
  detalles  = {},
  req       = null,
}) {
  try {
    await prisma.logAuditoria.create({
      data: {
        academiaId,
        usuarioId,
        accion,
        recurso,
        recursoId,
        detalles,
        ipAddress:  req?.ip || null,
        userAgent:  req?.get('user-agent') || null,
      },
    });
  } catch (err) {
    // Nunca debe bloquear la operación principal
    console.error('[AUDITORIA ERROR]', err.message);
  }
}

module.exports = { registrarAuditoria };
