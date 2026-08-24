'use client';

import { useEffect, useState } from 'react';
import { MANTENIMIENTO, MANTENIMIENTO_TITULO, MANTENIMIENTO_MENSAJE } from '@/lib/config';

/**
 * Aviso de mantenimiento a pantalla completa.
 * - Se muestra en TODA la app cuando MANTENIMIENTO === true.
 * - Puerta trasera del admin: si la URL trae ?admin, el aviso se oculta
 *   (para poder seguir revisando la plataforma durante el mantenimiento).
 */
export function AvisoMantenimiento() {
  const [oculto, setOculto] = useState(false);

  useEffect(() => {
    try {
      const p = new URLSearchParams(window.location.search);
      if (p.has('admin')) setOculto(true);
    } catch { /* noop */ }
  }, []);

  if (!MANTENIMIENTO || oculto) return null;

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 999999,
        background: 'linear-gradient(150deg,#064e1e 0%,#0b3d1e 55%,#052a10 100%)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24, textAlign: 'center',
      }}
    >
      {/* Balón decorativo tenue */}
      <svg viewBox="0 0 100 100" aria-hidden="true"
        style={{ position: 'absolute', right: -30, top: -30, width: 220, height: 220, opacity: 0.06 }}>
        <circle cx="50" cy="50" r="46" fill="none" stroke="#fff" strokeWidth="2" />
        <polygon points="50,24 70,38 62,62 38,62 30,38" fill="none" stroke="#fff" strokeWidth="2" />
      </svg>

      <div style={{ maxWidth: 440, width: '100%', color: '#fff', position: 'relative' }}>
        <div style={{ fontSize: 64, lineHeight: 1, marginBottom: 16 }}>🛠️</div>

        <p style={{ fontSize: 13, fontWeight: 900, letterSpacing: '0.18em', color: '#4ade80', marginBottom: 8 }}>
          FUTURO ANTIOQUIA · MAX 10 SPORT
        </p>

        <h1 style={{ fontSize: 26, fontWeight: 900, lineHeight: 1.15, marginBottom: 12 }}>
          {MANTENIMIENTO_TITULO}
        </h1>

        <p style={{ fontSize: 15, lineHeight: 1.5, color: 'rgba(255,255,255,0.88)' }}>
          {MANTENIMIENTO_MENSAJE}
        </p>

        <div style={{ marginTop: 22, display: 'flex', gap: 6, justifyContent: 'center' }}>
          {[0, 1, 2].map(i => (
            <span key={i}
              style={{
                width: 10, height: 10, borderRadius: '50%', background: '#22c55e',
                display: 'inline-block', opacity: 0.9,
                animation: `fa-bounce 1s ${i * 0.15}s infinite ease-in-out`,
              }} />
          ))}
        </div>

        <p style={{ marginTop: 26, fontSize: 12, color: 'rgba(255,255,255,0.55)' }}>
          Conecta · Gestiona · Gana
        </p>
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes fa-bounce {
          0%, 100% { transform: translateY(0); opacity: 0.5; }
          50%      { transform: translateY(-7px); opacity: 1; }
        }
      ` }} />
    </div>
  );
}
