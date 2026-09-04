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

/** El tamaño con que se guarda: 3 de ancho por 4 de alto. */
const SALIDA_ANCHO = 900;
const SALIDA_ALTO  = 1200;

/** El marco en pantalla. El alto sale solo de la proporción 3:4. */
const MARCO_ANCHO = 264;
const MARCO_ALTO  = (MARCO_ANCHO * 4) / 3;

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
  const [escala, setEscala] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [guardando, setGuardando] = useState(false);
  const arrastre = useRef<{ x: number; y: number; px: number; py: number } | null>(null);

  /** Cuánto hay que agrandar la foto para que TAPE el marco. */
  const base = nat ? Math.max(MARCO_ANCHO / nat.w, MARCO_ALTO / nat.h) : 1;
  const s = base * escala;
  const anchoDib = nat ? nat.w * s : 0;
  const altoDib  = nat ? nat.h * s : 0;

  /** La foto nunca puede dejar un hueco: se le ponen topes. */
  const limitar = useCallback((p: { x: number; y: number }) => ({
    x: Math.min(0, Math.max(MARCO_ANCHO - anchoDib, p.x)),
    y: Math.min(0, Math.max(MARCO_ALTO  - altoDib,  p.y)),
  }), [anchoDib, altoDib]);

  /* Al cargar la foto se centra a lo ancho y se ancla ARRIBA: así la cabeza
     siempre queda a la vista de entrada, que es lo que casi siempre sirve. */
  useEffect(() => {
    if (!nat) return;
    setPos(limitar({ x: (MARCO_ANCHO - nat.w * base) / 2, y: 0 }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nat]);

  /* Al acercar o alejar, se mantiene fijo el centro de lo que se está viendo. */
  function cambiarEscala(nueva: number) {
    if (!nat) { setEscala(nueva); return; }
    const sViejo = base * escala;
    const sNuevo = base * nueva;
    const cx = (MARCO_ANCHO / 2 - pos.x) / sViejo;
    const cy = (MARCO_ALTO  / 2 - pos.y) / sViejo;
    setEscala(nueva);
    const p = { x: MARCO_ANCHO / 2 - cx * sNuevo, y: MARCO_ALTO / 2 - cy * sNuevo };
    setPos({
      x: Math.min(0, Math.max(MARCO_ANCHO - nat.w * sNuevo, p.x)),
      y: Math.min(0, Math.max(MARCO_ALTO  - nat.h * sNuevo, p.y)),
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
      /* El marco de la pantalla y el de salida son la misma forma, así que
         basta con multiplicar todo por el mismo factor. */
      const f = SALIDA_ANCHO / MARCO_ANCHO;
      ctx.drawImage(im, pos.x * f, pos.y * f, anchoDib * f, altoDib * f);
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
          Procura que se vea desde la cabeza hasta el logo del pecho.
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
              border: '2px solid #FFFFFF',
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
            {/* Una raya guía a la altura del pecho, para que sepan dónde parar. */}
            <div style={{
              position: 'absolute', left: 0, right: 0, bottom: '14%',
              borderTop: '1px dashed rgba(255,255,255,.55)', pointerEvents: 'none',
            }} />
            <span style={{
              position: 'absolute', left: 6, bottom: 'calc(14% + 3px)',
              fontSize: 9, fontWeight: 900, letterSpacing: '.08em',
              color: 'rgba(255,255,255,.75)', pointerEvents: 'none',
            }}>
              LOGO DEL PECHO
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
