'use client';

/**
 * RECORTAR LA FOTO DEL DEPORTISTA — a mano, no adivinando
 *
 * (dirección, 04/09/2026 — «solucionemos este tema de una vez, ya está muy
 *  aburridor… mi propuesta es que la gente la suba y la pueda mover hasta
 *  verla como en un recuadro, línea blanca, donde ellos puedan ubicarla,
 *  incluso un pequeño letrero que diga procura quedar cabeza hasta llegar al
 *  logo del pecho»)
 *
 * POR QUÉ EXISTE ESTO. La plataforma venía ADIVINANDO el recorte: al cargar
 * la foto medía su forma y calculaba un acercamiento para dejar «la mitad de
 * arriba». Con una foto tomada de lejos quedaba la cara diminuta; con una de
 * cerca, la cabeza cortada. Un número fijo no puede acertarle a fotos tomadas
 * a distancias distintas, y por eso el tema volvía una y otra vez.
 *
 * LO QUE HACE AHORA. Al escoger la foto se abre este recuadro: el papá la
 * mueve con el dedo y la acerca o aleja con la barra hasta que quede como
 * debe. Lo que se ve dentro del marco blanco es EXACTAMENTE lo que se guarda.
 *
 * Y SE GUARDA YA RECORTADA, en 3:4 (900 × 1200). Eso es lo importante: la
 * foto sale igual de bien en la ficha, en la valoración, en el PDF y en
 * cualquier pantalla que venga después, porque ya no hay nada que adivinar.
 */

import { useState, useRef, useEffect, useCallback } from 'react';

/* La paleta de la plataforma */
const PANEL = '#3C4759';
const CAMPO = '#2B3547';
const BORDE = '#4A5568';
const VERDE = '#00B050';
const GRIS  = '#7C879A';

/* ── EL COLOR DEL RECORTE (dirección, 04/09/2026) ───────────────────────────
   «El recuadro y el de la mitad, en rojo, que se vea.»

   El blanco se confundía con la camiseta, con un escudo claro o con una pared
   del fondo, y el marco desaparecía justo encima de las fotos donde más
   falta hacía. El rojo no se confunde con nada de una cancha, y además es el
   color con el que todo el mundo asocia «por aquí se corta». */
const GUIA = '#FF3B30';

/** El tamaño con que se guarda: 3 de ancho por 4 de alto. */
const SALIDA_ANCHO = 900;
const SALIDA_ALTO  = 1200;

/* ── LAS RAYAS SON EL RECORTE, Y SON CUATRO ─────────────────────────────────
   (dirección, 04/09/2026 — «el cuadro de la foto entre raya de arriba y raya
    de abajo debe medir 3 x 4» · «faltan las rayas laterales» · «ahí sí sería
    el ejercicio completo de ubicar bien»)

   Antes las rayas eran un consejo pintado encima: se guardaba TODO el
   recuadro, así que la foto salía con más cosas de las que uno había dejado
   entre ellas —el REGOL de abajo, por ejemplo—.

   Ahora el recorte es un CUADRO COMPLETO, con sus cuatro rayas: arriba, abajo
   y las dos de los lados. Ese cuadro mide 3 de ancho por 4 de alto y es,
   exacto, la foto que se guarda. Por fuera se sigue viendo el resto de la
   foto, oscurecido, solo para poder agarrarla y acomodarla — eso no se
   guarda. Así el ejercicio queda completo: uno ve lo que entra y lo que
   sobra, y mueve hasta que la cabeza toque la raya de arriba y los escudos
   la de abajo. */

/** EL CUADRO QUE SE GUARDA: 3 de ancho por 4 de alto. */
const BANDA_ANCHO = 234;
const BANDA_ALTO  = (BANDA_ANCHO * 4) / 3;      // 312

/** El pedazo que se ve por fuera, solo para acomodar. */
const MARGEN_X      = 30;
const MARGEN_ARRIBA = 26;
const MARGEN_ABAJO  = 58;

/** El visor completo que se ve en pantalla. */
const MARCO_ANCHO = BANDA_ANCHO + MARGEN_X * 2;                 // 294
const MARCO_ALTO  = MARGEN_ARRIBA + BANDA_ALTO + MARGEN_ABAJO;  // 396

export function RecortarFoto({
  src, onCancelar, onListo,
}: {
  /** La foto tal como la escogió la persona (dataURL o URL). */
  src: string;
  onCancelar: () => void;
  /** Devuelve la foto ya recortada en 3:4, lista para guardar. */
  onListo: (b64: string) => void;
}) {
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [nat, setNat] = useState<{ w: number; h: number } | null>(null);

  /* ── LA FOTO QUE NO APARECÍA ─────────────────────────────────────────────
     (dirección, 06/09/2026 — «no aparece la foto»: el recuadro abría con las
      rayas puestas, pero adentro todo negro)

     LA CAUSA. El tamaño real de la foto se leía SOLO en el `onLoad` de la
     imagen. Eso sirve cuando la foto se acaba de escoger del computador: llega
     nueva, el navegador la baja y avisa. Pero cuando uno toca una foto QUE YA
     ESTÁ EN PANTALLA —para volverla a acomodar—, el navegador ya la tiene
     lista y NO vuelve a avisar: el `onLoad` no ocurre nunca. Sin ese aviso el
     recortador no sabía de qué tamaño dibujarla, y la dejaba en cero: negro.

     Por eso fallaba justo en el caso más natural —«esta foto quedó torcida,
     déjame acomodarla»— y funcionaba al subir una nueva.

     LA SOLUCIÓN. Además del aviso, se pregunta directamente: apenas se monta
     el recuadro, si la imagen ya está lista (`complete`), se le lee el tamaño
     de una. Y al cambiar de foto se borra el anterior, para que una foto no
     herede la medida de la otra. */
  useEffect(() => {
    setNat(null);
    const mirar = () => {
      const im = imgRef.current;
      if (im && im.complete && im.naturalWidth > 0) {
        setNat({ w: im.naturalWidth, h: im.naturalHeight });
        return true;
      }
      return false;
    };
    if (mirar()) return;
    /* Si todavía no está lista, se vuelve a mirar en el siguiente pintado:
       cubre el caso en que quede lista entre el montaje y el aviso. */
    const t = setTimeout(mirar, 60);
    return () => clearTimeout(t);
  }, [src]);
  const [escala, setEscala] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [guardando, setGuardando] = useState(false);
  const arrastre = useRef<{ x: number; y: number; px: number; py: number } | null>(null);

  /* ── TODO SE MIDE CONTRA EL CUADRO, NO CONTRA EL VISOR ────────────────────
     `pos` es dónde queda la esquina de arriba a la izquierda de la foto,
     contada desde la esquina del VISOR. El cuadro que se guarda empieza en
     (MARGEN_X, MARGEN_ARRIBA) y mide BANDA_ANCHO x BANDA_ALTO. */

  /** Cuánto hay que agrandar la foto para que TAPE el cuadro que se guarda. */
  const base = nat ? Math.max(BANDA_ANCHO / nat.w, BANDA_ALTO / nat.h) : 1;
  const s = base * escala;
  const anchoDib = nat ? nat.w * s : 0;
  const altoDib  = nat ? nat.h * s : 0;

  /** Los bordes del cuadro dentro del visor. */
  const CUADRO_X1 = MARGEN_X;
  const CUADRO_Y1 = MARGEN_ARRIBA;
  const CUADRO_X2 = MARGEN_X + BANDA_ANCHO;
  const CUADRO_Y2 = MARGEN_ARRIBA + BANDA_ALTO;

  /** El cuadro nunca puede quedar con un hueco: la foto lo tapa siempre. */
  const limitar = useCallback((p: { x: number; y: number }) => ({
    x: Math.min(CUADRO_X1, Math.max(CUADRO_X2 - anchoDib, p.x)),
    y: Math.min(CUADRO_Y1, Math.max(CUADRO_Y2 - altoDib,  p.y)),
  }), [anchoDib, altoDib, CUADRO_X1, CUADRO_X2, CUADRO_Y1, CUADRO_Y2]);

  /* Al cargar se centra a lo ancho del cuadro y se ancla ARRIBA: así la
     cabeza queda a la vista de entrada, que es lo que casi siempre sirve. */
  useEffect(() => {
    if (!nat) return;
    setPos(limitar({
      x: CUADRO_X1 + (BANDA_ANCHO - nat.w * base) / 2,
      y: CUADRO_Y1,
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nat]);

  /* Al acercar o alejar se mantiene fijo el centro DEL CUADRO, que es lo que
     la persona está mirando. */
  function cambiarEscala(nueva: number) {
    if (!nat) { setEscala(nueva); return; }
    const sViejo = base * escala;
    const sNuevo = base * nueva;
    const centroX = CUADRO_X1 + BANDA_ANCHO / 2;
    const centroY = CUADRO_Y1 + BANDA_ALTO / 2;
    const cx = (centroX - pos.x) / sViejo;
    const cy = (centroY - pos.y) / sViejo;
    setEscala(nueva);
    const p = { x: centroX - cx * sNuevo, y: centroY - cy * sNuevo };
    setPos({
      x: Math.min(CUADRO_X1, Math.max(CUADRO_X2 - nat.w * sNuevo, p.x)),
      y: Math.min(CUADRO_Y1, Math.max(CUADRO_Y2 - nat.h * sNuevo, p.y)),
    });
  }

  function alBajar(e: React.PointerEvent) {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    arrastre.current = { x: e.clientX, y: e.clientY, px: pos.x, py: pos.y };
  }
  function alMover(e: React.PointerEvent) {
    const a = arrastre.current;
    if (!a) return;
    setPos(limitar({ x: a.px + (e.clientX - a.x), y: a.py + (e.clientY - a.y) }));
  }
  function alSoltar() { arrastre.current = null; }

  /** Dibuja en un lienzo EXACTAMENTE lo que se ve dentro del marco. */
  async function aceptar() {
    const im = imgRef.current;
    if (!im || !nat) return;
    setGuardando(true);
    try {
      const lienzo = document.createElement('canvas');
      lienzo.width = SALIDA_ANCHO;
      lienzo.height = SALIDA_ALTO;
      const ctx = lienzo.getContext('2d');
      if (!ctx) throw new Error('sin lienzo');
      /* Fondo negro: si la foto no llenara algún borde, no queda transparente. */
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, SALIDA_ANCHO, SALIDA_ALTO);
      /* SE GUARDA EL CUADRO, NO EL VISOR (dirección, 04/09/2026).
         El cuadro de la pantalla y el de salida son la misma forma —3:4—, así
         que basta con correr el origen hasta la esquina del cuadro y
         multiplicar todo por el mismo factor. */
      const f = SALIDA_ANCHO / BANDA_ANCHO;
      ctx.drawImage(
        im,
        (pos.x - CUADRO_X1) * f,
        (pos.y - CUADRO_Y1) * f,
        anchoDib * f,
        altoDib  * f,
      );
      onListo(lienzo.toDataURL('image/jpeg', 0.9));
    } catch {
      /* Si el navegador no deja usar el lienzo, se guarda la foto tal cual:
         mejor una foto sin recortar que ninguna. */
      onListo(src);
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[90] bg-black/70 flex items-center justify-center p-4 overflow-y-auto"
         onClick={onCancelar}>
      <div className="rounded-2xl w-full max-w-[380px] my-4 overflow-hidden shadow-2xl"
           style={{ background: PANEL, border: `1px solid ${BORDE}` }}
           onClick={e => e.stopPropagation()}>

        <div className="px-4 py-3" style={{ background: VERDE }}>
          <p className="text-white font-black text-[15px] leading-tight">ACOMODA LA FOTO</p>
          <p className="text-white/90 text-[11.5px] mt-0.5">
            Muévela con el dedo hasta que quede bien
          </p>
        </div>

        {/* El letrero que pidió la dirección, antes del marco. */}
        <p className="px-4 pt-3 text-[12px] font-bold leading-snug text-center" style={{ color: '#F0C070' }}>
          Lo que quede DENTRO del cuadro blanco es la foto. Muévela hasta que
          la cabeza toque la raya de arriba y los escudos la de abajo.
        </p>

        {/* El marco: línea blanca, sin fondo. Lo de adentro es lo que queda. */}
        <div className="px-4 py-3 flex justify-center">
          <div
            onPointerDown={alBajar}
            onPointerMove={alMover}
            onPointerUp={alSoltar}
            onPointerCancel={alSoltar}
            style={{
              position: 'relative',
              width: MARCO_ANCHO,
              height: MARCO_ALTO,
              overflow: 'hidden',
              borderRadius: 12,
              /* El borde blanco pasó a ser el del CUADRO que se guarda; el
                 visor de afuera lleva uno discreto. — 04/09/2026 */
              border: `1px solid ${BORDE}`,
              background: '#000',
              cursor: 'grab',
              touchAction: 'none',
              userSelect: 'none',
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              ref={imgRef}
              src={src}
              alt=""
              draggable={false}
              onLoad={e => {
                const im = e.currentTarget;
                setNat({ w: im.naturalWidth, h: im.naturalHeight });
              }}
              onError={() => setNat(null)}
              style={{
                position: 'absolute',
                left: pos.x, top: pos.y,
                width: anchoDib || undefined,
                height: altoDib || undefined,
                maxWidth: 'none',
                pointerEvents: 'none',
                display: 'block',
              }}
            />
            {/* ── LO QUE QUEDA POR FUERA, OSCURECIDO ────────────────────────
                Cuatro sombras alrededor del cuadro. No es adorno: es lo que
                deja ver de un golpe qué entra en la foto y qué se va a botar.
                — dirección, 04/09/2026 */}
            {[
              { top: 0, left: 0, right: 0, height: MARGEN_ARRIBA },
              { bottom: 0, left: 0, right: 0, height: MARGEN_ABAJO },
              { top: MARGEN_ARRIBA, left: 0, width: MARGEN_X, height: BANDA_ALTO },
              { top: MARGEN_ARRIBA, right: 0, width: MARGEN_X, height: BANDA_ALTO },
            ].map((caja, i) => (
              <div key={i} style={{
                position: 'absolute', ...caja,
                background: 'rgba(0,0,0,.62)', pointerEvents: 'none',
              }} />
            ))}

            {/* ── EL CUADRO QUE SE GUARDA: SUS CUATRO RAYAS ─────────────────
                (dirección, 04/09/2026 — «faltan las rayas laterales… ahí sí
                 sería el ejercicio completo de ubicar bien»)

                Con solo dos rayas uno veía dónde parar arriba y abajo, pero no
                por dónde cortaba a los lados, y la foto salía distinta a lo
                que uno había dejado. Con las cuatro, el cuadro se ve entero:
                esto —exacto, 3 de ancho por 4 de alto— es la foto que queda. */}
            {/* EL MARCO VA EN RAYITAS, COMO UNA TIJERA (dirección, 04/09/2026
                — «coloca todo el marco y la raya de la mitad en puntos o
                 rayitas discontinuas, que vean bien que será un recorte»).

                Con la línea entera parecía un adorno, un borde más de la
                pantalla. En rayitas se lee de una lo que es: por aquí se
                corta. Es el mismo lenguaje del papel y la tijera, y no hay
                que explicarlo. */}
            <div style={{
              position: 'absolute',
              left: MARGEN_X, top: MARGEN_ARRIBA,
              width: BANDA_ANCHO, height: BANDA_ALTO,
              border: `2px dashed ${GUIA}`,
              boxShadow: '0 0 0 1px rgba(0,0,0,.55)',
              pointerEvents: 'none',
            }} />

            {/* Las esquinas, enteras y gruesas. Son lo ÚNICO que se deja en
                línea seguida: marcan de dónde a dónde va el recorte y le dan
                el aire de mira de cámara. — dirección, 04/09/2026 */}
            {[
              { top: MARGEN_ARRIBA - 1, left: MARGEN_X - 1, borderTop: 1, borderLeft: 1 },
              { top: MARGEN_ARRIBA - 1, left: MARGEN_X + BANDA_ANCHO - 21, borderTop: 1, borderRight: 1 },
              { top: MARGEN_ARRIBA + BANDA_ALTO - 21, left: MARGEN_X - 1, borderBottom: 1, borderLeft: 1 },
              { top: MARGEN_ARRIBA + BANDA_ALTO - 21, left: MARGEN_X + BANDA_ANCHO - 21, borderBottom: 1, borderRight: 1 },
            ].map((e, i) => (
              <div key={`esq${i}`} style={{
                position: 'absolute', top: e.top, left: e.left, width: 22, height: 22,
                borderTop:    e.borderTop    ? `4px solid ${GUIA}` : undefined,
                borderBottom: e.borderBottom ? `4px solid ${GUIA}` : undefined,
                borderLeft:   e.borderLeft   ? `4px solid ${GUIA}` : undefined,
                borderRight:  e.borderRight  ? `4px solid ${GUIA}` : undefined,
                pointerEvents: 'none',
              }} />
            ))}

            {/* ── LA RAYA DE LA NARIZ: VA PARADA, NO ACOSTADA ────────────────
                (dirección, 04/09/2026 — «la raya de la nariz era VERTICAL,
                 corrige urgente, si no, no daría lo que queremos de cabeza y
                 escudos»)

                Y tiene toda la razón. Una raya acostada a media altura pelea
                con las otras dos: la de arriba manda la cabeza y la de abajo
                los escudos, y una tercera en la mitad solo confunde.

                Parada en el centro hace otra cosa distinta y necesaria:
                CENTRAR al niño de lado a lado. Uno le pone la cara encima y el
                cuerpo queda derecho. Con las tres —cabeza arriba, escudos
                abajo y la del medio al centro— todas las fotos quedan iguales.

                SIN LETRERO (dirección, 04/09/2026 — «quita esa palabra nariz
                que confunde»). La raya sola se entiende: uno centra la cara y
                ya. Una palabra encima solo hacía dudar de si había que poner
                la nariz ahí exacta. */}
            <div style={{
              position: 'absolute',
              top: MARGEN_ARRIBA, height: BANDA_ALTO,
              left: MARGEN_X + BANDA_ANCHO / 2,
              borderLeft: `2px dashed ${GUIA}`,
              pointerEvents: 'none',
            }} />

            {/* EL LETRERO DE ARRIBA — la cabeza va tocando esta raya. */}
            <span style={{
              position: 'absolute', left: MARGEN_X + 4, top: MARGEN_ARRIBA + 4,
              fontSize: 9, fontWeight: 900, letterSpacing: '.08em',
              color: 'rgba(255,255,255,.9)', textShadow: '0 1px 2px rgba(0,0,0,.9)',
              pointerEvents: 'none',
            }}>
              ABAJO DE LA CABEZA
            </span>

            {/* EL DE ABAJO — hasta aquí llegan los escudos.
                Dice ESCUDOS y no "logo del pecho": hay camisetas con
                patrocinador arriba y otras abajo, pero los escudos están
                siempre en el mismo sitio. — dirección, 04/09/2026 */}
            <span style={{
              position: 'absolute', left: MARGEN_X + 4,
              top: MARGEN_ARRIBA + BANDA_ALTO - 15,
              fontSize: 9, fontWeight: 900, letterSpacing: '.08em',
              color: 'rgba(255,255,255,.9)', textShadow: '0 1px 2px rgba(0,0,0,.9)',
              pointerEvents: 'none',
            }}>
              HASTA ABAJO DE LOS ESCUDOS
            </span>
          </div>
        </div>

        {/* Acercar y alejar */}
        <div className="px-5 pb-1">
          <label className="block text-[9.5px] font-black uppercase tracking-widest mb-1.5"
                 style={{ color: GRIS }}>
            Acercar o alejar
          </label>
          <input
            type="range" min={1} max={3} step={0.01} value={escala}
            onChange={e => cambiarEscala(Number(e.target.value))}
            style={{ width: '100%', accentColor: VERDE, cursor: 'pointer' }}
          />
        </div>

        <div className="flex gap-2 px-4 pt-2 pb-4">
          <button
            onClick={onCancelar}
            className="flex-1 rounded-xl py-2.5 text-[12px] font-black uppercase tracking-wider text-white"
            style={{ background: CAMPO, border: `1px solid ${BORDE}` }}>
            Cancelar
          </button>
          <button
            onClick={aceptar}
            disabled={!nat || guardando}
            className="flex-1 rounded-xl py-2.5 text-[12px] font-black uppercase tracking-wider text-white disabled:opacity-60"
            style={{ background: VERDE }}>
            {guardando ? 'Guardando…' : 'Usar esta foto'}
          </button>
        </div>
      </div>
    </div>
  );
}
