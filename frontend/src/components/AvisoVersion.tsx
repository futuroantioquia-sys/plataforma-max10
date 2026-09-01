'use client';

/* ─────────────────────────────────────────────────────────────────────────────
   EL LETRERO DE LA VERSIÓN
   (dirección, 01/09/2026)

   POR QUÉ EXISTE. Dos veces en el mismo día pasó lo mismo: se publicaba un
   cambio, la dirección lo veía, y la contadora no. Primero con las columnas
   reubicadas, después con CONFIRMAR y EDITAR. Y desde el chat no hay forma de
   saber qué versión está viendo cada quien: tocaba adivinar —¿será el caché?,
   ¿será el marcador?— y mandar a la gente a oprimir teclas a ciegas.

   Esto acaba con la adivinanza. Hace tres cosas, todas calladas:

     1. MUESTRA LA VERSIÓN en una esquina, chiquita. Cuando algo se vea raro,
        basta preguntar «¿qué número le sale abajo?» y se sabe al instante si
        esa persona está atrasada.

     2. AVISA CUANDO HAY UNA NUEVA. Cada tanto le pregunta al servidor cuál es
        la versión de ahora. Si no es la que tiene cargada, sale un botón
        ACTUALIZAR. Nadie se queda atrás sin darse cuenta.

     3. AVISA SI ENTRÓ POR UNA DIRECCIÓN VIEJA. Y esta es la grande. Vercel
        deja vivas PARA SIEMPRE las direcciones de cada publicación anterior
        (plataforma-max10-1trspu5gw-…vercel.app). Si a alguien se le guardó una
        de esas en los marcadores, quedó CONGELADO en esa versión: no hay F5,
        ni Ctrl+F5, ni borrar caché que lo saque. Esa persona vería la
        plataforma de hace semanas y nadie entendería por qué. Aquí se detecta
        y se le dice, con un botón que lo lleva a la dirección buena.

   CÓMO SABE LA VERSIÓN. Vercel le pega a cada archivo de la plataforma una
   marca con el número de la publicación (?dpl=dpl_XXXX). La que está cargada
   se lee de esos archivos; la de ahora se le pregunta al servidor. Si no
   coinciden, hay versión nueva. No se instala nada ni se guarda nada.
   ───────────────────────────────────────────────────────────────────────── */

import { useState, useEffect, useCallback } from 'react';

const VERDE = '#00B050';
const AMBAR = '#E0A33A';
const PANEL = '#3C4759';
const BORDE = '#4A5568';

/** La única dirección buena. Todo lo demás es una copia congelada. */
const CASA = 'plataforma-max10.vercel.app';

/** ¿Esta dirección es una publicación vieja de Vercel, de las que nunca cambian?
 *  Son las que llevan el nombre del proyecto con una coletilla:
 *      plataforma-max10-1trspu5gw-futuroantioquiama10.vercel.app
 *      plataforma-max10-git-main-futuroantioquiama10.vercel.app
 *  Un dominio propio que se compre mañana NO cae aquí: se pregunta por el
 *  patrón exacto, no por «lo que no conozco». */
function esDireccionCongelada(host: string): boolean {
  const h = String(host || '').toLowerCase();
  if (h === CASA) return false;
  if (h === 'localhost' || h.startsWith('127.0.0.1') || h.endsWith('.local')) return false;
  return /^plataforma-max10-[a-z0-9-]+\.vercel\.app$/.test(h);
}

/** Saca la marca de publicación (dpl_XXXX) de un texto cualquiera. */
function marcaDe(texto: string): string {
  const m = String(texto || '').match(/dpl_[A-Za-z0-9]+/);
  return m ? m[0] : '';
}

/** La versión que este navegador tiene CARGADA: se lee de los archivos que ya
 *  bajó la página. Si no hay marca (por ejemplo, corriendo en el computador de
 *  la casa), devuelve vacío y el letrero no se muestra. */
function versionCargada(): string {
  if (typeof document === 'undefined') return '';
  const nodos = Array.from(document.querySelectorAll('script[src], link[href]'));
  for (const n of nodos) {
    const url = (n as any).src || (n as any).href || '';
    const m = marcaDe(url);
    if (m) return m;
  }
  return '';
}

/* ── LA LIMPIEZA A FONDO ──────────────────────────────────────────────────────
   (dirección, 01/09/2026 — «me actualiza lo que hace, pero no los cambios»)

   ESA FRASE ES UNA HUELLA. Los DATOS llegan al día pero la PANTALLA se quedó
   vieja. Eso solo lo hace una cosa: el ayudante de la app (el "service worker"),
   que vive dentro del navegador de cada persona. Los datos los pide la página
   directo a la base y por eso llegan frescos; pero la página en sí —los
   botones, las columnas— se la sirve el ayudante desde una copia guardada.

   El ayudante de HOY no guarda copia de nada; se arregló hace tiempo. Pero al
   que le quedó instalado uno VIEJO de los que sí guardaban, ese viejo le sigue
   sirviendo la plataforma de aquel día. Y no hay F5, ni Ctrl+F5, ni borrar el
   caché del navegador que lo saque: el ayudante manda antes que todo eso.

   Esto lo desinstala, borra sus copias y vuelve a cargar limpio. Es seguro:
   no toca la sesión, ni los datos, ni la base. Lo único que pasa es que el
   ayudante se vuelve a instalar solito —el nuevo, el bueno— al entrar otra vez. */
async function limpiezaAFondo() {
  try {
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map(r => r.unregister().catch(() => false)));
    }
  } catch { /* si el navegador no deja, se sigue con lo demás */ }
  try {
    if ('caches' in window) {
      const nombres = await caches.keys();
      await Promise.all(nombres.map(n => caches.delete(n).catch(() => false)));
    }
  } catch { /* igual */ }
  /* Se vuelve a entrar por la misma dirección, con una marca de tiempo para
     que nadie pueda entregar una copia guardada. Se quita el `limpiar=1` de la
     dirección: si se quedara, la página se limpiaría en un círculo sin fin. */
  const u = new URL(window.location.href);
  u.searchParams.delete('limpiar');
  u.searchParams.set('limpio', String(Date.now()));
  window.location.replace(u.toString());
}

export function AvisoVersion() {
  const [mia, setMia] = useState('');
  const [nueva, setNueva] = useState('');
  const [congelada, setCongelada] = useState(false);
  const [mirando, setMirando] = useState(false);
  const [panel, setPanel] = useState(false);
  const [limpiando, setLimpiando] = useState(false);

  /* Le pregunta al servidor cuál es la versión de ahora. Pide una página
     liviana y con `no-store`, para que nadie le entregue una copia guardada. */
  const revisar = useCallback(async (dime = false) => {
    if (dime) setMirando(true);
    try {
      const res = await fetch('/login?v=' + Date.now(), { cache: 'no-store' });
      const html = await res.text();
      const m = marcaDe(html);
      if (m) setNueva(m);
    } catch { /* sin señal: se queda como está, sin molestar */ }
    if (dime) setMirando(false);
  }, []);

  useEffect(() => {
    /* ── EL ENLACE QUE LIMPIA SOLO ────────────────────────────────────────
       (dirección, 01/09/2026 — «quedó más perdida»)

       Buscar un letrerito gris de ocho píxeles en una esquina no es una
       instrucción que se le pueda dar a alguien por WhatsApp. Así que la
       limpieza también se dispara sola con un enlace:

           plataforma-max10.vercel.app/login?limpiar=1

       Se le manda ese enlace a quien esté atrasado, hace clic, y la página se
       limpia y se recarga sola. Sin buscar nada, sin oprimir teclas raras.
       Después el `limpiar=1` se quita de la dirección para que no se repita. */
    try {
      if (new URLSearchParams(window.location.search).get('limpiar') === '1') {
        setLimpiando(true);
        limpiezaAFondo();
        return;
      }
    } catch { /* si la dirección viene rara, se sigue normal */ }

    setMia(versionCargada());
    setCongelada(esDireccionCongelada(window.location.hostname));
    revisar();
    /* Se vuelve a mirar al volver a la pestaña y cada 15 minutos. Es una
       consulta de nada, y no toca la base de datos. */
    const alVolver = () => { if (document.visibilityState === 'visible') revisar(); };
    document.addEventListener('visibilitychange', alVolver);
    const reloj = setInterval(() => revisar(), 15 * 60 * 1000);
    return () => { document.removeEventListener('visibilitychange', alVolver); clearInterval(reloj); };
  }, [revisar]);

  /* ── 1 · DIRECCIÓN CONGELADA: lo más grave, y va de primero ── */
  if (congelada) {
    const destino = `https://${CASA}${window.location.pathname}${window.location.search}`;
    return (
      <div style={{
        position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 9998,
        background: AMBAR, color: '#111827', padding: '12px 16px',
        display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12,
        fontSize: 13.5, fontWeight: 700, boxShadow: '0 -4px 18px rgba(0,0,0,.35)',
      }}>
        <span style={{ flex: 1, minWidth: 240, lineHeight: 1.45 }}>
          <b style={{ fontWeight: 900 }}>Está entrando por una dirección vieja.</b>{' '}
          Esta copia quedó congelada el día que se publicó y nunca se actualiza,
          por más que oprima F5. Entre siempre por <b style={{ fontWeight: 900 }}>{CASA}</b>.
        </span>
        <a href={destino}
          style={{
            background: '#111827', color: '#fff', borderRadius: 10,
            padding: '9px 16px', fontWeight: 900, fontSize: 12.5,
            textDecoration: 'none', whiteSpace: 'nowrap',
          }}>
          IR A LA BUENA →
        </a>
      </div>
    );
  }

  /* ── 2 · HAY VERSIÓN NUEVA ── */
  const hayNueva = !!mia && !!nueva && mia !== nueva;
  if (hayNueva) {
    return (
      <div style={{
        position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 9998,
        background: VERDE, color: '#fff', padding: '12px 16px',
        display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12,
        fontSize: 13.5, fontWeight: 700, boxShadow: '0 -4px 18px rgba(0,0,0,.35)',
      }}>
        <span style={{ flex: 1, minWidth: 220, lineHeight: 1.45 }}>
          <b style={{ fontWeight: 900 }}>Hay una versión nueva de la plataforma.</b>{' '}
          Lo que ve ahora es la de antes.
        </span>
        <button onClick={() => { setLimpiando(true); limpiezaAFondo(); }} disabled={limpiando}
          style={{
            background: '#fff', color: '#111827', border: 0, borderRadius: 10,
            padding: '9px 18px', fontWeight: 900, fontSize: 12.5, cursor: 'pointer',
            whiteSpace: 'nowrap', opacity: limpiando ? 0.6 : 1,
          }}>
          {limpiando ? 'ACTUALIZANDO…' : 'ACTUALIZAR'}
        </button>
      </div>
    );
  }

  /* ── 3 · EL LETRERITO DE SIEMPRE ──
     Solo el final del número: es lo que hace falta para compararlo por el
     chat, y no estorba. Un clic abre el cuadrito con la limpieza a fondo. */
  if (!mia) return null;
  return (
    <div style={{ position: 'fixed', left: 8, bottom: 8, zIndex: 40 }}>

      {panel && (
        <div style={{
          position: 'absolute', bottom: 30, left: 0, width: 268,
          background: PANEL, border: `1px solid ${BORDE}`, borderRadius: 12,
          padding: '13px 15px', boxShadow: '0 10px 30px rgba(0,0,0,.45)',
        }}>
          <p style={{ color: '#fff', fontWeight: 900, fontSize: 12, marginBottom: 6 }}>
            Versión de la plataforma
          </p>
          <p style={{ color: '#5BE39B', fontFamily: 'Consolas, monospace', fontSize: 12.5,
                      fontWeight: 800, marginBottom: 10, wordBreak: 'break-all' }}>
            {mia.replace('dpl_', '')}
          </p>
          <p style={{ color: '#C9D2DF', fontSize: 11.5, lineHeight: 1.5, marginBottom: 11 }}>
            {nueva && nueva !== mia
              ? 'Hay una más nueva. Oprima ACTUALIZAR abajo.'
              : 'Está en la última que se publicó.'}
            <br />
            ¿Ve los datos al día pero la pantalla vieja? Eso lo causa el ayudante
            del navegador. Este botón lo desinstala y vuelve a cargar limpio.
            No pierde nada.
          </p>
          <button onClick={() => { setLimpiando(true); limpiezaAFondo(); }} disabled={limpiando}
            style={{
              width: '100%', background: AMBAR, color: '#111827', border: 0,
              borderRadius: 9, padding: '9px 12px', fontWeight: 900, fontSize: 12,
              cursor: 'pointer', opacity: limpiando ? 0.6 : 1, marginBottom: 7,
            }}>
            {limpiando ? 'LIMPIANDO…' : 'LIMPIAR A FONDO Y RECARGAR'}
          </button>
          <button onClick={() => { revisar(true); }}
            style={{
              width: '100%', background: 'transparent', color: '#7C879A',
              border: `1px solid ${BORDE}`, borderRadius: 9, padding: '7px 12px',
              fontWeight: 800, fontSize: 11, cursor: 'pointer',
            }}>
            {mirando ? 'revisando…' : 'Volver a revisar'}
          </button>
        </div>
      )}

      <button
        onClick={() => setPanel(p => !p)}
        title={`Versión de la plataforma: ${mia}\nClic para revisarla o limpiar a fondo.`}
        style={{
          background: PANEL, border: `1px solid ${BORDE}`, color: '#7C879A',
          borderRadius: 8, padding: '3px 8px', fontSize: 10, fontWeight: 800,
          letterSpacing: '.06em', opacity: panel ? 1 : 0.55, cursor: 'pointer',
          fontFamily: 'Consolas, monospace',
        }}>
        {mirando ? 'revisando…' : `v ${mia.replace('dpl_', '').slice(0, 6)}`}
      </button>
    </div>
  );
}
