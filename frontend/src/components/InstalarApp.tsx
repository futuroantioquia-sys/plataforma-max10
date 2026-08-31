'use client';

/* ─────────────────────────────────────────────────────────────────────────────
   "DESCARGA LA APP AHORA"  ·  dirección, 31/08/2026

   La plataforma misma se lo pide al papá apenas entra.

   ── POR QUÉ SE REHIZO (31/08/2026, mismo día) ───────────────────────────────
   Un papá abrió la plataforma y NO le salió nada. Al mirar el pantallazo se
   vio la razón: estaba en un iPhone, pero con CHROME, no con Safari. Y el
   código de antes dejaba a ese caso por fuera: descartaba Chrome-en-iPhone
   creyendo que se portaba como un Android, y en Android esperaba un aviso
   del navegador que en iPhone no existe. Resultado: pantalla muda.

   Y no era el único hueco. En Firefox o Samsung Internet de Android tampoco
   llega ese aviso del navegador, así que ahí también quedaba mudo.

   La regla ahora es otra: A NADIE SE LE DEJA SIN RESPUESTA. Siempre se le
   dice qué hacer con el aparato que tiene en la mano. Son cuatro casos:

     1. BOTON  · el navegador sí ofrece instalar (Chrome de Android o de
                 computador). Sale el botón verde y lo hace todo.
     2. SAFARI · iPhone con Safari. No hay botón —Apple no lo permite— y se
                 le indica Compartir → "Agregar a pantalla de inicio".
     3. OTRO-IOS · iPhone con Chrome, Firefox o Edge. En iPhone SOLO Safari
                 puede dejar el ícono. Se le dice, y se le copia el enlace
                 para que lo pegue allá. ESTE ES EL CASO QUE FALLABA.
     4. MENU   · cualquier otro navegador. Se le manda al menú del navegador,
                 donde la opción de instalar siempre está.

   Además: sale a los 2 segundos, no de una, para no taparle el teclado a
   quien está escribiendo su clave. Si ya la tiene instalada, no sale nunca.
   Si le da la X, vuelve a los 7 días.
   ───────────────────────────────────────────────────────────────────────── */

import { useEffect, useState } from 'react';

const LLAVE_CERRADO = 'futuro-instalar-cerrado';
const DIAS_QUIETO   = 7;
const ESPERA_MS     = 2000;   // para no estorbar al que está escribiendo
const ESPERA_MENU   = 4500;   // si el navegador no ofreció nada, se le explica igual

type Modo = 'boton' | 'safari' | 'otro-ios' | 'menu';

export function InstalarApp() {
  const [modo, setModo]   = useState<Modo | null>(null);
  const [aviso, setAviso] = useState<any>(null);   // el permiso del navegador
  const [copiado, setCopiado] = useState(false);

  useEffect(() => {
    /* El ayudante. Sin él no hay "instalar". */
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

    const ua = navigator.userAgent || '';

    /* ¿Es un aparato de Apple? Los iPad nuevos se hacen pasar por computador
       Mac, así que también se mira si la pantalla responde al dedo. */
    const esIOS = /iPhone|iPad|iPod/i.test(ua) ||
      (/Macintosh/i.test(ua) && (navigator as any).maxTouchPoints > 1);

    const tiempos: any[] = [];

    if (esIOS) {
      /* CriOS = Chrome · FxiOS = Firefox · EdgiOS = Edge · OPiOS/OPT = Opera.
         En iPhone TODOS usan por dentro el motor de Safari, pero solo el
         Safari de verdad puede dejar el ícono en la pantalla. */
      const esSafariDeVerdad = !/CriOS|FxiOS|EdgiOS|OPiOS|OPT\//i.test(ua);
      tiempos.push(setTimeout(
        () => setModo(esSafariDeVerdad ? 'safari' : 'otro-ios'), ESPERA_MS));
      return () => tiempos.forEach(clearTimeout);
    }

    /* Android / computador. Si el navegador ofrece instalar, ese es el camino
       bueno. Ese ofrecimiento puede llegar tarde, así que si llega después de
       haber mostrado la explicación del menú, se cambia al botón. */
    const alPoder = (e: any) => {
      e.preventDefault();
      setAviso(e);
      tiempos.push(setTimeout(() => setModo('boton'), ESPERA_MS));
      setModo(m => (m === 'menu' ? 'boton' : m));
    };
    window.addEventListener('beforeinstallprompt', alPoder);

    /* Y si nunca llegó, tampoco se le deja mudo: se le manda al menú. */
    tiempos.push(setTimeout(() => setModo(m => m ?? 'menu'), ESPERA_MENU));

    return () => {
      window.removeEventListener('beforeinstallprompt', alPoder);
      tiempos.forEach(clearTimeout);
    };
  }, []);

  if (!modo) return null;

  function cerrar() {
    setModo(null);
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

  /** Copia la dirección para que la pegue en Safari. */
  async function copiarEnlace(): Promise<boolean> {
    const url = window.location.origin;
    let ok = false;
    try { await navigator.clipboard.writeText(url); ok = true; }
    catch {
      /* Navegadores viejos: se copia a la antigua. */
      try {
        const c = document.createElement('textarea');
        c.value = url; c.style.position = 'fixed'; c.style.opacity = '0';
        document.body.appendChild(c); c.select();
        ok = document.execCommand('copy');
        document.body.removeChild(c);
      } catch { /* ni modo: abajo se le muestra la dirección para que la escriba */ }
    }
    setCopiado(ok);
    return ok;
  }

  /* ── UN SOLO BOTÓN PARA EL iPHONE (dirección, 31/08/2026) ────────────────
     Antes aquí salían tres pasos numerados y un botón de copiar. La dirección
     lo dijo sin rodeos: "pide muchas cosas enredadas". Y tenía razón: al papá
     hay que darle UNA cosa que oprimir, no una lista.

     Ahora el botón intenta abrir Safari de una. iOS entiende una dirección
     que empiece por x-safari-https y se la pasa a Safari; unos navegadores lo
     permiten y otros no, y no hay forma de saberlo de antemano. Entonces se
     intenta, y si al segundo la pantalla SIGUE aquí —señal de que no abrió—
     ahí sí se le copia el enlace y se le dice que lo pegue en Safari. Nunca
     se queda sin salida, pero al que le funciona no le tocó leer nada. */
  function abrirEnSafari() {
    const url = window.location.origin;
    let sigueAqui = true;
    const seFue = () => { sigueAqui = false; };
    window.addEventListener('pagehide', seFue);
    window.addEventListener('blur', seFue);

    try { window.location.href = url.replace(/^https?:\/\//, 'x-safari-https://'); }
    catch { sigueAqui = true; }

    setTimeout(() => {
      window.removeEventListener('pagehide', seFue);
      window.removeEventListener('blur', seFue);
      if (sigueAqui && document.visibilityState === 'visible') copiarEnlace();
    }, 1200);
  }

  /* ── Los textos de cada caso ─────────────────────────────────────────── */
  const titulo = modo === 'otro-ios'
    ? 'Para tenerla en tu iPhone'
    : 'Descarga la app de Futuro Antioquia';

  const bajada =
      modo === 'otro-ios' ? 'En iPhone solo Safari puede dejar el ícono. Un toque y listo.'
    : modo === 'safari'   ? 'No ocupa espacio y abre sola, sin buscar la dirección.'
    :                       'Queda el escudo en tu pantalla. No ocupa espacio.';

  const CAJA: React.CSSProperties = {
    marginTop: 11, background: '#2B3547', border: '1px solid #4A5568',
    borderRadius: 12, padding: '11px 13px',
    color: '#fff', fontSize: 12.5, fontWeight: 700, lineHeight: 1.55,
  };
  const VERDE: React.CSSProperties = { color: '#5BE39B' };

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
          <p style={{ color: '#fff', fontWeight: 900, fontSize: 15, lineHeight: 1.25 }}>{titulo}</p>
          <p style={{ color: 'rgba(255,255,255,.62)', fontSize: 12, lineHeight: 1.45, marginTop: 3 }}>
            {bajada}
          </p>
        </div>
      </div>

      {/* 1 · El navegador sí deja instalar: un botón y ya. */}
      {modo === 'boton' && (
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

      {/* ── 2 · iPhone con Safari ──────────────────────────────────────────
          OJO CON LO QUE DICE AQUÍ (dirección, 31/08/2026). Antes esto decía
          "oprime Compartir aquí abajo" y estaba MAL: en los iPhone nuevos
          Safari esconde el botón Compartir dentro de los tres puntos ⋯ de la
          esquina, y el papá se quedaba buscando un botón que no veía.

          Ahora se nombran los dos, porque según la versión del iPhone aparece
          uno o el otro, y se le dice la esquina exacta donde mirar. Apple NO
          deja poner un botón que instale: esto es lo más cerca que se llega. */}
      {modo === 'safari' && (
        <div style={{ ...CAJA, padding: '12px 13px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{
              background: '#00B050', color: '#fff', fontWeight: 900, fontSize: 11,
              borderRadius: 7, width: 20, height: 20, display: 'flex',
              alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>1</span>
            <span style={{ fontSize: 13 }}>
              Abajo a la <b style={VERDE}>derecha</b>, oprime{' '}
              <b style={{ ...VERDE, fontSize: 16 }}>•••</b> <span style={{ color: 'rgba(255,255,255,.5)' }}>o</span>{' '}
              <b style={{ ...VERDE, fontSize: 15 }}>↑</b>
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 9 }}>
            <span style={{
              background: '#00B050', color: '#fff', fontWeight: 900, fontSize: 11,
              borderRadius: 7, width: 20, height: 20, display: 'flex',
              alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>2</span>
            <span style={{ fontSize: 13 }}>
              Escoge <b style={VERDE}>“Agregar a pantalla de inicio”</b>
            </span>
          </div>
          <p style={{
            color: 'rgba(255,255,255,.42)', fontSize: 10.5, fontWeight: 600,
            marginTop: 10, lineHeight: 1.45,
          }}>
            En iPhone, Apple no permite un botón que la instale sola. Estos dos toques
            son el único camino, y es el mismo para todas las apps.
          </p>
        </div>
      )}

      {/* 3 · iPhone con Chrome u otro: un botón, y ya. */}
      {modo === 'otro-ios' && (
        <>
          <button
            onClick={abrirEnSafari}
            style={{
              marginTop: 11, width: '100%', background: '#00B050', border: 0, borderRadius: 12,
              color: '#fff', fontWeight: 900, fontSize: 14, letterSpacing: .5,
              padding: '13px 0', cursor: 'pointer',
            }}>
            ABRIR EN SAFARI
          </button>
          {/* Solo si el botón no logró abrir Safari aparece la explicación. */}
          {copiado && (
            <div style={{ ...CAJA, marginTop: 10 }}>
              <b style={VERDE}>Enlace copiado.</b> Abre <b style={VERDE}>Safari</b>, pégalo arriba,
              y allá oprime <b style={VERDE}>•••</b> abajo a la derecha y escoge{' '}
              <b style={VERDE}>“Agregar a pantalla de inicio”</b>.
            </div>
          )}
        </>
      )}

      {/* 4 · Cualquier otro navegador: al menú, que ahí siempre está. */}
      {modo === 'menu' && (
        <div style={CAJA}>
          Abre el menú del navegador <b style={VERDE}>(⋮ arriba a la derecha)</b> y escoge{' '}
          <b style={VERDE}>“Instalar aplicación”</b> o{' '}
          <b style={VERDE}>“Agregar a pantalla de inicio”</b>.
        </div>
      )}
    </div>
  );
}
