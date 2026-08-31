'use client';

/* ─────────────────────────────────────────────────────────────────────────────
   "DESCARGA LA APP AHORA"  ·  dirección, 31/08/2026

   La plataforma misma se lo pide al papá apenas entra. Antes esto era una
   franjita discreta que decía "ten la plataforma en tu celular" y la gente ni
   la miraba. La dirección lo dijo claro: la gente es muy dispersa. Entonces
   ahora es un aviso grande, con el escudo, y el botón dice lo que hay que
   hacer: DESCARGA LA APP AHORA.

   Cómo se comporta:

     · Sale a los 2 segundos de abrir, no de una. Así no le tapa el teclado
       al que está escribiendo su clave en la pantalla de entrada.
     · Si ya la tiene instalada, no sale nunca. No se molesta a quien ya hizo
       la tarea.
     · Si la cierra, vuelve a salir a los 7 días. Antes eran 30 y en la
       práctica era no volver a pedírselo nunca.
     · En iPhone Apple no deja poner el botón: allá se muestra la instrucción
       con la flecha apuntando abajo, que es donde está el botón Compartir.
   ───────────────────────────────────────────────────────────────────────── */

import { useEffect, useState } from 'react';

const LLAVE_CERRADO = 'futuro-instalar-cerrado';
const DIAS_QUIETO   = 7;
const ESPERA_MS     = 2000;

export function InstalarApp() {
  const [aviso, setAviso]     = useState<any>(null);   // el permiso de Chrome
  const [enIPhone, setEnIPhone] = useState(false);
  const [ver, setVer]         = useState(false);

  useEffect(() => {
    /* 1 · El ayudante. Sin él no hay "instalar". */
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => { /* no pasa nada */ });
    }

    /* ¿Ya está instalada? Entonces no se molesta a nadie. */
    const yaInstalada =
      window.matchMedia?.('(display-mode: standalone)')?.matches ||
      (navigator as any).standalone === true;
    if (yaInstalada) return;

    /* ¿La cerró hace poco? */
    try {
      const cuando = Number(localStorage.getItem(LLAVE_CERRADO) || 0);
      if (cuando && Date.now() - cuando < DIAS_QUIETO * 24 * 60 * 60 * 1000) return;
    } catch { /* sin localStorage: se muestra igual */ }

    let t: any;
    const ua = navigator.userAgent || '';
    const esIPhone = /iPhone|iPad|iPod/i.test(ua) && !/CriOS|FxiOS/i.test(ua);
    if (esIPhone) {
      setEnIPhone(true);
      t = setTimeout(() => setVer(true), ESPERA_MS);
      return () => clearTimeout(t);
    }

    /* 2 · Android / computador: Chrome avisa cuando se puede instalar. */
    const alPoder = (e: any) => {
      e.preventDefault();
      setAviso(e);
      t = setTimeout(() => setVer(true), ESPERA_MS);
    };
    window.addEventListener('beforeinstallprompt', alPoder);
    return () => { window.removeEventListener('beforeinstallprompt', alPoder); clearTimeout(t); };
  }, []);

  if (!ver) return null;

  function cerrar() {
    setVer(false);
    try { localStorage.setItem(LLAVE_CERRADO, String(Date.now())); } catch { /* nada */ }
  }

  async function instalar() {
    if (!aviso) return;
    try {
      aviso.prompt();
      await aviso.userChoice;
    } catch { /* si el navegador no deja, no pasa nada */ }
    setAviso(null);
    cerrar();
  }

  return (
    <div
      style={{
        position: 'fixed', left: 12, right: 12, bottom: 12, zIndex: 70,
        background: '#3C4759', border: '2px solid #00B050', borderRadius: 18,
        boxShadow: '0 14px 38px rgba(0,0,0,.55)',
        padding: '14px 14px 13px', maxWidth: 460, margin: '0 auto',
        animation: 'fa-sube .35s ease-out',
      }}>
      <style>{`@keyframes fa-sube{from{opacity:0;transform:translateY(22px)}to{opacity:1;transform:none}}`}</style>

      {/* Cerrar, arriba a la derecha: que no se confunda con el botón bueno. */}
      <button
        onClick={cerrar}
        aria-label="Ahora no"
        style={{
          position: 'absolute', top: 6, right: 8, background: 'transparent', border: 0,
          color: 'rgba(255,255,255,.45)', fontWeight: 900, fontSize: 19, cursor: 'pointer',
          lineHeight: 1, padding: '2px 4px',
        }}>
        ×
      </button>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icono-192.png" alt=""
             style={{ width: 52, height: 52, borderRadius: 13, flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0, paddingRight: 14 }}>
          <p style={{ color: '#fff', fontWeight: 900, fontSize: 15, lineHeight: 1.25 }}>
            Descarga la app de Futuro Antioquia
          </p>
          <p style={{ color: 'rgba(255,255,255,.62)', fontSize: 12, lineHeight: 1.45, marginTop: 3 }}>
            {enIPhone
              ? 'No ocupa espacio y abre sola, sin buscar la dirección.'
              : 'Queda el escudo en tu pantalla. No ocupa espacio.'}
          </p>
        </div>
      </div>

      {enIPhone ? (
        /* iPhone: no hay botón que valga, se explica dónde tocar. */
        <div
          style={{
            marginTop: 11, background: '#2B3547', border: '1px solid #4A5568',
            borderRadius: 12, padding: '11px 13px',
            color: '#fff', fontSize: 12.5, fontWeight: 700, lineHeight: 1.55,
          }}>
          Oprime <b style={{ color: '#5BE39B' }}>Compartir</b> aquí abajo ⬇ y escoge{' '}
          <b style={{ color: '#5BE39B' }}>“Agregar a pantalla de inicio”</b>.
        </div>
      ) : (
        <button
          onClick={instalar}
          style={{
            marginTop: 11, width: '100%', background: '#00B050', border: 0, borderRadius: 12,
            color: '#fff', fontWeight: 900, fontSize: 14, letterSpacing: .5,
            padding: '13px 0', cursor: 'pointer',
          }}>
          ⬇ DESCARGA LA APP AHORA
        </button>
      )}
    </div>
  );
}
