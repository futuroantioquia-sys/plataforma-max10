'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, CheckCircle, XCircle, Eye, Clock, AlertCircle, BookOpen, Hash, CalendarDays } from 'lucide-react';
import { getSoportesPendientes, getSoporteDatos, confirmarSoportePago, eliminarSoportePago, getDeportistas } from '@/lib/db';
import type { SoportePago, Deportista } from '@/lib/db';
import { BalonCargando } from '@/components/BalonCargando';
import { abrirSoporte, dataUrlABlobUrl, esPdfDato } from '@/lib/utils';

/* ── Helpers para extraer columnas del deportista ── */
function sinTildes(s: string): string {
  return String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
}
function getCol(dep: Deportista, rx: RegExp): string {
  const cols = dep._columnas ?? {};
  const k = Object.keys(cols).find(c => rx.test(sinTildes(c.trim())));
  return k ? String(cols[k] ?? '').trim() : '';
}
function getCodigo(dep: Deportista): string {
  const cols = dep._columnas ?? {};
  const kCod = Object.keys(cols).find(k => /^COD/.test(sinTildes(k)));
  if (kCod) return String(cols[kCod] ?? '').trim();
  // Fallback: primer valor 4-5 dígitos
  for (const v of Object.values(cols)) {
    const d = String(v ?? '').replace(/\D/g, '');
    if (d.length >= 4 && d.length <= 5) return d;
  }
  return '';
}

/* ── Tipo de soporte enriquecido con info del deportista ── */
interface SoporteEnriquecido extends SoportePago {
  depNombre: string;
  depCodigo: string;
  depPrograma: string;
  depProyecto: string;
  depId: string;
}

/* ── PALETA OFICIAL DE LA PLATAFORMA ─────────────────────────────
   La misma de Control de Pagos, Asistencia y Microciclo. Esta pantalla
   estaba en azul; se pasó al gris verde el 25/08/2026. */
const LIENZO = '#333F50';   // fondo de la pantalla
const PANEL  = '#3C4759';   // tarjetas y filas
const CAMPO  = '#2B3547';   // casillas y recuadros
const BORDE  = '#4A5568';
const VERDE  = '#00B050';   // verde institucional
const ROJO   = '#C0504D';   // lo que se rechaza
const GRIS   = '#7C879A';   // guiones y casillas sin dato

/* ── LAS FOTOS YA BAJADAS SE QUEDAN EN MEMORIA ────────────────────────────
   (dirección, 05/09/2026 — «optimiza tiempos de lectura de pagos pendientes»)

   Esta lista vive FUERA de la pantalla, a propósito: así sobrevive cuando uno
   se va al Libro o a la Cuenta y se devuelve. Antes, cada regreso volvía a
   bajar las mismas setenta fotos desde cero. Se borra sola al cerrar o
   recargar la pestaña, que es cuando conviene volver a preguntar. */
const CACHE_FOTOS = new Map<string, string>();

export default function PagosPendientesPage() {
  const router = useRouter();
  const [soportes,   setSoportes]   = useState<SoporteEnriquecido[]>([]);
  const [cargando,   setCargando]   = useState(true);
  const [viendoIdx,  setViendoIdx]  = useState<number | null>(null);
  /* Aviso de "copiado" al lado del código, en la ficha del visor. */
  const [copiado, setCopiado] = useState('');
  const [accion,     setAccion]     = useState<{ idx: number; tipo: 'confirmar' | 'rechazar' } | null>(null);
  const [procesando, setProcesando] = useState(false);
  const [toast,      setToast]      = useState<{ msg: string; ok: boolean } | null>(null);
  // id -> imagen base64. Arranca con lo que ya se bajó antes en esta pestaña.
  const [datosMap,   setDatosMap]   = useState<Record<string, string>>(() => Object.fromEntries(CACHE_FOTOS));
  const [urlVista,   setUrlVista]   = useState('');   // URL que se muestra en el visor (blob: si es PDF)

  /* ── POR QUÉ ESTO SE DEMORABA TANTO ───────────────────────────────────────
     (dirección, 05/09/2026 — «optimiza tiempos de lectura de pagos
      pendientes, se demora mucho mientras carga soportes»)

     La lista de soportes viene liviana —sin las fotos—, así que aparece de
     una. Lo que se demoraba eran LAS FOTOS: cada soporte es una foto del
     celular del papá, de varios cientos de kilobytes, y se pedían

        · UNA POR UNA, esperando a que llegara la anterior para pedir la
          siguiente. Con 70 soportes eso son 70 viajes en fila india.
        · TODAS, aunque uno solo esté mirando el día de hoy.
        · OTRA VEZ DESDE CERO cada vez que se volvía a entrar a la pantalla
          —por ejemplo al devolverse del Libro—, aunque ya se hubieran bajado
          hace un minuto.

     Los tres arreglos:
        1. DE A SEIS AL TIEMPO en vez de una por una.
        2. PRIMERO LAS QUE SE ESTÁN VIENDO (el día filtrado); las demás
           quedan de últimas, ya sin nadie esperándolas.
        3. SE GUARDAN EN MEMORIA mientras no se cierre la pestaña: ir al Libro
           y devolverse ya no vuelve a bajar nada. */
  useEffect(() => {
    if (!soportes.length) return;
    let cancel = false;

    // 1º las que se están viendo ahora mismo, 2º todas las demás.
    const orden = [...vistaRef.current, ...soportes];
    const pendientesFotos: string[] = [];
    const yaEncolado = new Set<string>();
    for (const s of orden) {
      if (!s?.id || yaEncolado.has(s.id)) continue;
      yaEncolado.add(s.id);
      if (CACHE_FOTOS.has(s.id)) continue;
      pendientesFotos.push(s.id);
    }
    if (!pendientesFotos.length) return;

    let siguiente = 0;
    const trabajador = async () => {
      while (!cancel) {
        const i = siguiente++;
        if (i >= pendientesFotos.length) return;
        const id = pendientesFotos[i];
        const d = await getSoporteDatos(id);
        if (cancel) return;
        if (d) {
          CACHE_FOTOS.set(id, d);
          setDatosMap(prev => ({ ...prev, [id]: d }));
        }
      }
    };
    // Seis a la vez: suficiente para ir rápido sin ahogar la conexión.
    Promise.all(Array.from({ length: 6 }, trabajador)).catch(() => { /* noop */ });

    return () => { cancel = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [soportes]);

  // Dato del soporte que se esta viendo en el visor
  const datoVista = viendoIdx !== null ? (datosMap[soportes[viendoIdx]?.id || ''] || '') : '';

  /* Un PDF no se puede mostrar con <img> ni abrir con un enlace "data:" — el
     navegador lo bloquea. Se convierte a archivo temporal (blob:) y ese sí abre. */
  useEffect(() => {
    if (!datoVista) { setUrlVista(''); return; }
    if (!esPdfDato(datoVista)) { setUrlVista(datoVista); return; }
    const url = dataUrlABlobUrl(datoVista);
    setUrlVista(url);
    return () => { if (url.startsWith('blob:')) URL.revokeObjectURL(url); };
  }, [datoVista]);

  const mostrarToast = (msg: string, ok: boolean) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 4000);
  };

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const [pendientes, deportistas] = await Promise.all([
        getSoportesPendientes(),
        getDeportistas(),
      ]);

      // Enriquecer cada soporte con info del deportista.
      // Se arma un índice por id: buscar en una lista de 1.185 fichas, setenta
      // veces seguidas, es trabajo de más que se nota en la espera.
      const porId = new Map<string, Deportista>();
      for (const d of deportistas) porId.set(String(d.id), d);
      const enriquecidos: SoporteEnriquecido[] = pendientes.map(s => {
        const dep = porId.get(String(s.deportista_id));
        return {
          ...s,
          depId:       dep?.id ?? s.deportista_id,
          depNombre:   dep?._nombre ?? '—',
          depCodigo:   dep ? getCodigo(dep) : '—',
          depPrograma: dep ? getCol(dep, /^PROG/i) : '—',
          depProyecto: dep ? getCol(dep, /^PROY/i) : '—',
        };
      });

      setSoportes(enriquecidos);
    } catch (e) {
      console.error('[pagos-pendientes] cargar:', e);
    }
    setCargando(false);
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  async function handleConfirmar(idx: number) {
    const s = soportes[idx];
    setProcesando(true);
    const ok = await confirmarSoportePago(s.id);
    if (ok) {
      CACHE_FOTOS.delete(s.id);           // ya no se necesita esa foto en memoria
      setSoportes(prev => prev.filter(x => x.id !== s.id));
      mostrarToast('✅ Pago confirmado correctamente', true);
    } else {
      mostrarToast('❌ No se pudo confirmar. Intenta de nuevo.', false);
    }
    setProcesando(false);
    setAccion(null);
  }

  async function handleRechazar(idx: number) {
    const s = soportes[idx];
    setProcesando(true);
    const ok = await eliminarSoportePago(s.id);
    if (ok) {
      CACHE_FOTOS.delete(s.id);
      setSoportes(prev => prev.filter(x => x.id !== s.id));
      mostrarToast('🗑️ Soporte eliminado', true);
    } else {
      mostrarToast('❌ No se pudo eliminar. Intenta de nuevo.', false);
    }
    setProcesando(false);
    setAccion(null);
  }

  // Detectar si el dato es imagen o PDF
  function esImagen(data: string): boolean {
    return data.startsWith('data:image/');
  }

  /* ── ORDENAR POR CÓDIGO Y BUSCAR POR DÍA (dirección, 04/09/2026) ──────────
     «Botones en el encabezado, por código, por día con calendario.»

     Los soportes caían en el orden en que los mandó la nube, y cuando hay
     treinta o cuarenta uno no encuentra ni el de un niño ni los de un día.
     Ahora, encima del cuadro:

       · POR DÍA    — del más nuevo al más viejo. Es el orden de siempre y
                      queda puesto por defecto: lo primero que uno quiere ver
                      es lo que acaba de llegar.
       · POR CÓDIGO — 001, 002, 003… Sirve para cotejar contra el libro, que
                      va por código.
       · El calendario — se escoge un día y quedan SOLO los de ese día. Con
                      TODOS LOS DÍAS vuelven todos.

     El orden y el día son de la pantalla, no de la nube: no cambian ni mueven
     nada, solo acomodan lo que se está viendo. */
  /* ── EL DÍA ESCOGIDO NO SE PIERDE AL SALIR Y VOLVER ───────────────────────
     (dirección, 04/09/2026 — «si voy a estado de cuenta y me devuelvo, que
      quede en el día filtrado; si no, es muy difícil volver a ver todo»)

     Revisar los soportes de un día es ir y volver: se abre la CUENTA del
     deportista, se confirma allá, se regresa… y hasta hoy la pantalla volvía
     con los 70 soportes de todos los días. Tocaba buscar otra vez el día en
     el calendario, en cada uno. Con veinte soportes eso son veinte veces.

     Ahora el día y el orden quedan anotados en este navegador. Al volver, la
     pantalla se abre justo donde uno la dejó. Es de la persona y de este
     computador: no cambia nada de la nube ni le mueve la vista a nadie más. */
  const LLAVE_VISTA = 'pagos_pendientes_vista_v1';
  /* Igual que la franja: la memoria del navegador se lee YA MONTADA la
     pantalla, nunca al armarla. — corregido 05/09/2026 */
  const [orden, setOrden] = useState<'dia' | 'codigo'>('dia');
  const [dia,   setDia]   = useState<string>('');
  const yaRestaure = useRef(false);

  useEffect(() => {
    try {
      const g = JSON.parse(localStorage.getItem(LLAVE_VISTA) || 'null');
      if (g?.orden === 'codigo') setOrden('codigo');
      if (typeof g?.dia === 'string') setDia(g.dia);
    } catch { /* noop */ }
    yaRestaure.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!yaRestaure.current) return;   // no pisar lo guardado con los valores de arranque
    try { localStorage.setItem(LLAVE_VISTA, JSON.stringify({ orden, dia })); }
    catch { /* si el navegador no deja guardar, no pasa nada grave */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orden, dia]);

  /* ── LA SOMBRA ROJA: «POR AQUÍ IBA» ──────────────────────────────────────
     (dirección, 04/09/2026 — «que al devolverme quede una sombra de toda la
      fila, puede ser roja clara, para saber dónde voy»)

     Aunque la pantalla ya vuelve al día correcto, uno regresa a una lista de
     veinte renglones iguales y no sabe en cuál estaba. Al salir hacia la
     Cuenta o hacia el Libro se anota el renglón; al volver, esa fila queda
     con un lavado rojo y una franja al lado, y la pantalla se desplaza sola
     hasta ella. La marca se va con el primer clic en cualquier parte: cumple
     su trabajo y no estorba. */
  const LLAVE_ULTIMA = 'pagos_pendientes_ultima_v1';
  /* OJO CON EL ARRANQUE (corregido 05/09/2026 — «a Diana no le aparece la
     franja roja»): esto NO se puede leer al crear el estado. La pantalla se
     arma primero en el servidor, donde no existe el navegador ni su memoria,
     y React descartaba el valor al empatar las dos versiones. Por eso a veces
     la franja salía y a veces no. Ahora arranca vacío y se lee UNA VEZ ya
     montada la pantalla, que es cuando la memoria del navegador sí existe. */
  const [ultimaFila, setUltimaFila] = useState<string>('');
  useEffect(() => {
    try { setUltimaFila(localStorage.getItem(LLAVE_ULTIMA) || ''); } catch { /* noop */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Se llama justo antes de salir de la pantalla. */
  const marcarDondeIba = (idSoporte: string) => {
    try { localStorage.setItem(LLAVE_ULTIMA, idSoporte); } catch { /* noop */ }
  };

  /* Al volver: se lleva la vista hasta el renglón marcado. */
  useEffect(() => {
    if (!ultimaFila || cargando) return;
    const t = setTimeout(() => {
      try {
        document.getElementById(`sop-${ultimaFila}`)
          ?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      } catch { /* noop */ }
    }, 350);
    return () => clearTimeout(t);
  }, [ultimaFila, cargando]);

  /** Apaga la marca. Se llama cuando ya cumplió: el soporte quedó confirmado
   *  o rechazado, o la dirección cambió de día. */
  const apagarMarca = useCallback(() => {
    setUltimaFila('');
    try { localStorage.removeItem(LLAVE_ULTIMA); } catch { /* noop */ }
  }, []);

  /* ── LA FRANJA NO SE VA HASTA QUE SE USE ──────────────────────────────────
     (dirección, 05/09/2026 — «volvió a pagos pendientes, pero desaparece la
      banda roja para poder confirmar pago»)

     ERROR CORREGIDO. Antes la franja se apagaba con el PRIMER clic en
     cualquier parte de la pantalla. Sonaba razonable —«ya la vio, quítela»—,
     pero en la práctica el primer clic casi nunca es el OK: es acomodar la
     ventana, bajar un poco, tocar cualquier lado. Y para cuando la dirección
     iba a confirmar, la franja ya no estaba y tocaba adivinar el renglón otra
     vez, que era justo lo que se quería evitar.

     Ahora la franja SE QUEDA hasta que hace su trabajo: se apaga sola cuando
     ese soporte se confirma o se rechaza —el renglón desaparece con ella—. */
  useEffect(() => {
    if (!ultimaFila) return;
    if (!soportes.length) return;
    if (!soportes.some(s => s.id === ultimaFila)) apagarMarca();
  }, [soportes, ultimaFila, apagarMarca]);

  /** El día (aaaa-mm-dd) en que se subió el soporte, en hora de acá. */
  function diaDe(s: SoporteEnriquecido): string {
    const t = s.created_at || s.fecha || '';
    if (!t) return '';
    const d = new Date(t);
    if (isNaN(d.getTime())) return String(t).slice(0, 10);
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }

  /** Lo que se pinta: filtrado por día y acomodado. */
  const vista = useMemo(() => {
    const lista = dia ? soportes.filter(s => diaDe(s) === dia) : [...soportes];
    if (orden === 'codigo') {
      /* `numeric` para que 9 vaya antes que 10, y no al revés como pasa
         cuando se comparan como palabras. */
      lista.sort((a, b) => String(a.depCodigo ?? '').localeCompare(
        String(b.depCodigo ?? ''), 'es', { numeric: true, sensitivity: 'base' }));
    } else {
      lista.sort((a, b) => String(b.created_at ?? b.fecha ?? '')
        .localeCompare(String(a.created_at ?? a.fecha ?? '')));
    }
    return lista;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [soportes, orden, dia]);

  /* Lo que se está viendo, para bajar PRIMERO esas fotos. */
  const vistaRef = useRef<SoporteEnriquecido[]>([]);
  vistaRef.current = vista;

  /** Cuántos soportes tiene cada día, para el letrero de al lado. */
  const porDia = useMemo(() => {
    const m = new Map<string, number>();
    soportes.forEach(s => {
      const d = diaDe(s);
      if (d) m.set(d, (m.get(d) ?? 0) + 1);
    });
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [soportes]);

  const diaBonito = (d: string) => {
    if (!d) return '';
    const [a, m, x] = d.split('-');
    return `${x}/${m}/${a}`;
  };

  return (
    <div className="min-h-screen" style={{ background: LIENZO }}>

      {/* ── Header ── */}
      <header className="relative bg-gradient-to-r from-[#333F50] to-[#0EA142] px-4 py-4 flex items-center gap-3 sticky top-0 z-20 shadow overflow-hidden">
        <div className="absolute inset-0 pointer-events-none opacity-[0.07]" aria-hidden>
          <svg className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <pattern id="sp-pp" x="0" y="0" width="60" height="60" patternUnits="userSpaceOnUse">
                <circle cx="30" cy="30" r="14" fill="none" stroke="white" strokeWidth="1"/>
                <polygon points="30,22 37,27 34,35 26,35 23,27" fill="none" stroke="white" strokeWidth="1"/>
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#sp-pp)"/>
          </svg>
        </div>
        <button onClick={() => router.back()} className="relative text-white hover:opacity-80 transition">
          <ArrowLeft className="w-5 h-5"/>
        </button>
        <div className="relative flex-1 min-w-0">
          <h1 className="text-white font-black text-base leading-tight">Pagos Pendientes</h1>
          <p className="text-white text-[11px]">Soportes enviados por padres · MAX 10</p>
        </div>
        {/* Badge de pendientes */}
        {!cargando && soportes.length > 0 && (
          <div className="relative flex items-center gap-1.5 bg-white/20 rounded-xl px-3 py-1.5">
            <AlertCircle className="w-4 h-4 text-white"/>
            <span className="text-white font-black text-sm">{soportes.length}</span>
          </div>
        )}
        {/* Logo MAX10 */}
        <div className="relative flex flex-col items-center border-l border-white/30 pl-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/MAX%2010.png" alt="MAX10" className="h-7 object-contain" />
          <p className="text-white text-[9px] leading-none mt-0.5 tracking-wide">Conecta, Gestiona, Gana</p>
        </div>
      </header>

      <main className="px-2 py-4">

        {/* ── Cargando ── */}
        {cargando && (
          <div className="flex items-center justify-center py-24">
            <BalonCargando texto="Cargando soportes…" />
          </div>
        )}

        {/* ── Sin pendientes ── */}
        {!cargando && soportes.length === 0 && (
          <div className="rounded-3xl shadow-sm border p-10 text-center max-w-md mx-auto mt-8" style={{ background: PANEL, borderColor: BORDE }}>
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4" style={{ background: CAMPO }}>
              <CheckCircle className="w-8 h-8" style={{ color: VERDE }}/>
            </div>
            <p className="text-white font-black text-lg">¡Todo al día!</p>
            <p className="text-white text-sm mt-1">No hay soportes de pago pendientes de confirmar.</p>
          </div>
        )}

        {/* ── BOTONES DEL ENCABEZADO: POR CÓDIGO / POR DÍA + CALENDARIO ──────
            (dirección, 04/09/2026)

            Van pegados encima del cuadro verde, que es donde uno está
            mirando cuando le hace falta acomodarlos. El botón puesto se ve
            verde lleno; el otro, apagado. */}
        {!cargando && soportes.length > 0 && (
          <div className="rounded-2xl border mb-2 px-3 py-2.5 flex flex-wrap items-center gap-2"
               style={{ background: PANEL, borderColor: BORDE }}>

            <span className="text-white/60 text-[10px] font-black uppercase tracking-wider mr-1">
              Acomodar
            </span>

            <button
              onClick={() => setOrden('dia')}
              title="Los más nuevos de primeros"
              className="flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-[11px] font-black uppercase tracking-wide transition hover:brightness-125"
              style={{
                background: orden === 'dia' ? VERDE : CAMPO,
                border: `1px solid ${orden === 'dia' ? VERDE : BORDE}`,
                color: '#FFFFFF',
              }}>
              <Clock className="w-3.5 h-3.5" /> Por día
            </button>

            <button
              onClick={() => setOrden('codigo')}
              title="001, 002, 003… igual que el libro"
              className="flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-[11px] font-black uppercase tracking-wide transition hover:brightness-125"
              style={{
                background: orden === 'codigo' ? VERDE : CAMPO,
                border: `1px solid ${orden === 'codigo' ? VERDE : BORDE}`,
                color: '#FFFFFF',
              }}>
              <Hash className="w-3.5 h-3.5" /> Por código
            </button>

            <span className="mx-1 h-5 w-px" style={{ background: BORDE }} />

            {/* EL CALENDARIO. Se escoge un día y quedan solo los de ese día. */}
            <label className="flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 cursor-pointer"
                   style={{ background: CAMPO, border: `1px solid ${dia ? VERDE : BORDE}` }}>
              <CalendarDays className="w-3.5 h-3.5" style={{ color: dia ? VERDE : '#FFFFFF' }} />
              <input
                type="date"
                value={dia}
                onChange={e => setDia(e.target.value)}
                title="Ver solo los soportes subidos ese día"
                className="bg-transparent text-white text-[11px] font-bold outline-none cursor-pointer"
                style={{ colorScheme: 'dark' }} />
            </label>

            {dia && (
              <button
                onClick={() => setDia('')}
                className="rounded-xl px-3 py-1.5 text-[11px] font-black uppercase tracking-wide transition hover:brightness-125"
                style={{ background: CAMPO, border: `1px solid ${BORDE}`, color: '#FFFFFF' }}>
                Todos los días
              </button>
            )}

            {/* Cuántos se están viendo de cuántos hay. */}
            <span className="ml-auto text-white text-[11px] font-black">
              {dia
                ? <>{vista.length} de {soportes.length} · {diaBonito(dia)}</>
                : <>{soportes.length} soporte{soportes.length === 1 ? '' : 's'}</>}
            </span>
          </div>
        )}

        {/* NINGUNO ESE DÍA. Se dice cuál es el último día que sí tuvo, para
            no quedarse probando fechas a ciegas. — 04/09/2026 */}
        {!cargando && soportes.length > 0 && vista.length === 0 && (
          <div className="rounded-2xl border p-6 text-center mb-2"
               style={{ background: PANEL, borderColor: BORDE }}>
            <p className="text-white font-black text-sm">
              El {diaBonito(dia)} no subieron ningún soporte.
            </p>
            <p className="text-white/70 text-[12px] mt-1">
              {porDia.size > 0
                ? <>Los días con soportes son: {[...porDia.keys()].sort().reverse().slice(0, 6).map(diaBonito).join(' · ')}</>
                : 'No hay soportes con fecha.'}
            </p>
          </div>
        )}

        {/* Estilo de la fila marcada. Va en cada casilla porque el fondo del
            renglón lo tapan las casillas, y la sombra del renglón no se pinta
            en tablas de bordes pegados. — 05/09/2026 */}
        <style>{`
          /* FRANJA ROJA CLARA — «el rojo me recuerda que lo estoy gestionando»
             (dirección, 05/09/2026)

             El gris queda para el mouse: es el «estoy parado aquí» de siempre.
             El renglón marcado va en ROJO CLARO, que sobre el fondo oscuro se
             ve desde lejos y significa otra cosa: «este es el que estoy
             gestionando». Como el renglón queda claro, la letra se pone
             oscura —si no, quedaría blanco sobre casi blanco—; los botones
             conservan su color, que ahí sí hay que distinguir OK de rechazar. */
          tr.fila-marcada > td {
            background: #F0D2D1 !important;
            color: #111827 !important;
            border-top: 2px solid #C0504D;
            border-bottom: 2px solid #C0504D;
          }
          tr.fila-marcada > td button { color: #FFFFFF !important; }
          tr.fila-marcada > td:first-child { box-shadow: inset 7px 0 0 #C0504D; }
        `}</style>

        {/* ── Tabla de soportes ── */}
        {!cargando && vista.length > 0 && (
          <div className="overflow-x-auto rounded-2xl shadow-sm border" style={{ borderColor: BORDE }}>
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="text-white text-xs font-black uppercase tracking-wider" style={{ background: VERDE }}>
                  <th className="px-3 py-3 text-left whitespace-nowrap">Código</th>
                  <th className="px-3 py-3 text-left whitespace-nowrap">Nombre</th>
                  <th className="px-3 py-3 text-left whitespace-nowrap">Programa</th>
                  <th className="px-3 py-3 text-left whitespace-nowrap">Proyecto</th>
                  <th className="px-3 py-3 text-left whitespace-nowrap">Meses Pagando</th>
                  <th className="px-3 py-3 text-left whitespace-nowrap">Fecha Subido</th>
                  <th className="px-3 py-3 text-left whitespace-nowrap">Soporte de Pago</th>
                  <th className="px-3 py-3 text-center whitespace-nowrap">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {/* Se pinta la VISTA (acomodada y filtrada), pero el número
                    que se le pasa a confirmar/rechazar sigue siendo el puesto
                    en la lista de verdad: así el orden de la pantalla no
                    confunde los botones. — 04/09/2026 */}
                {vista.map((s) => {
                  const idx = soportes.findIndex(x => x.id === s.id);
                  return (
                  <tr key={s.id} id={`sop-${s.id}`}
                      /* ── POR QUÉ NO SE VEÍA LA FRANJA ROJA ─────────────────
                         (corregido 05/09/2026 — «nada que aparece franja roja
                          ni en local»)

                         El color SÍ se estaba poniendo; lo que pasaba es que no
                         se alcanzaba a ver, por dos cosas de cómo pintan las
                         tablas los navegadores:

                           · El rojo iba al 30% de transparencia sobre un fondo
                             azul oscuro. Eso da un tono apenas distinto del
                             normal: a simple vista, el mismo renglón.
                           · La rayita roja del borde izquierdo era una SOMBRA
                             puesta en el renglón (<tr>), y en una tabla con
                             bordes pegados —border-collapse— el navegador no
                             pinta sombras de renglón. Nunca se dibujó.

                         Ahora el color va en CADA CASILLA (eso sí lo pinta
                         siempre), en un rojo que se ve de lejos, con una barra
                         roja gruesa a la izquierda y el renglón enmarcado. */
                      style={ultimaFila === s.id ? undefined : { background: PANEL }}
                      className={`transition ${ultimaFila === s.id ? 'fila-marcada' : 'hover:brightness-125'}`}>

                    {/* Código */}
                    <td className="px-3 py-3 font-black whitespace-nowrap" style={{ color: VERDE }}>
                      {s.depCodigo || '—'}
                      {/* Letrero, para que no quede duda de cuál renglón es. */}
                      {ultimaFila === s.id && (
                        <span className="block mt-1 text-[9px] font-black tracking-wider"
                          style={{ color: '#8B2F2C' }}>AQUÍ IBAS</span>
                      )}
                    </td>

                    {/* Nombre */}
                    <td className="px-3 py-3 font-semibold text-white whitespace-nowrap max-w-[160px] truncate">
                      {s.depNombre}
                    </td>

                    {/* Programa */}
                    <td className="px-3 py-3 text-white whitespace-nowrap">
                      {s.depPrograma || '—'}
                    </td>

                    {/* Proyecto */}
                    <td className="px-3 py-3 text-white whitespace-nowrap">
                      {s.depProyecto || '—'}
                    </td>

                    {/* Meses pagando */}
                    <td className="px-3 py-3">
                      {s.meses && s.meses.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {s.meses.map(m => (
                            <span key={m} className="px-2 py-0.5 rounded-md text-white text-[11px] font-bold whitespace-nowrap" style={{ background: VERDE }}>
                              {m}
                            </span>
                          ))}
                        </div>
                      ) : <span style={{ color: GRIS }}>—</span>}
                    </td>

                    {/* Fecha en que se subió el soporte */}
                    <td className="px-3 py-3 text-white whitespace-nowrap text-[12px]">
                      {s.created_at
                        ? new Date(s.created_at).toLocaleString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })
                        : (s.fecha || '—')}
                    </td>

                    {/* Soporte de pago (imagen cargada aparte) */}
                    <td className="px-3 py-3">
                      {(() => {
                        const img = datosMap[s.id];
                        if (!img) {
                          return (
                            <div className="w-14 h-14 rounded-lg border flex items-center justify-center text-[9px] animate-pulse" style={{ background: CAMPO, borderColor: BORDE, color: GRIS }}>
                              cargando…
                            </div>
                          );
                        }
                        return esImagen(img) ? (
                          <button onClick={() => setViendoIdx(idx)} className="relative block">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={img} alt="Soporte"
                              className="w-14 h-14 object-cover rounded-lg border hover:opacity-80 transition cursor-pointer" style={{ borderColor: BORDE }} />
                            <span className="absolute inset-0 flex items-center justify-center opacity-0 hover:opacity-100 transition">
                              <Eye className="w-5 h-5 text-white drop-shadow"/>
                            </span>
                          </button>
                        ) : (
                          <button onClick={() => setViendoIdx(idx)}
                            title="Ver el soporte en PDF"
                            className="flex flex-col items-center justify-center gap-0.5 w-14 h-14 rounded-lg border text-white hover:opacity-85 transition cursor-pointer" style={{ background: ROJO, borderColor: ROJO }}>
                            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2M18,20H6V4H13V9H18V20Z"/></svg>
                            <span className="text-[9px] font-black">PDF</span>
                          </button>
                        );
                      })()}
                    </td>

                    {/* Acciones */}
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-1.5 justify-center">
                        <button
                          onClick={() => setAccion({ idx, tipo: 'confirmar' })}
                          title="Confirmar pago"
                          style={{ background: VERDE, minHeight: 34 }}
                          className="flex items-center gap-1 px-2.5 rounded-lg hover:opacity-85 text-white font-black text-[11px] transition whitespace-nowrap">
                          <CheckCircle className="w-3.5 h-3.5"/> OK
                        </button>
                        <button
                          onClick={() => setAccion({ idx, tipo: 'rechazar' })}
                          title="Rechazar soporte"
                          style={{ background: ROJO, minHeight: 34 }}
                          className="flex items-center gap-1 px-2.5 rounded-lg hover:opacity-85 text-white font-semibold text-[11px] transition">
                          <XCircle className="w-3.5 h-3.5"/>
                        </button>
                        <button
                          onClick={() => { marcarDondeIba(s.id); router.push(`/alumnos/${s.depId}/estado-cuenta?readonly=1`); }}
                          title="Ver cuenta"
                          style={{ background: CAMPO, border: `1px solid ${BORDE}`, minHeight: 34 }}
                          className="flex items-center gap-1 px-2.5 rounded-lg hover:opacity-85 text-white font-semibold text-[11px] transition whitespace-nowrap">
                          <Eye className="w-3.5 h-3.5"/> Cuenta
                        </button>
                        {/* ── IR AL LIBRO CONTABLE, YA FILTRADO ─────────────
                            (dirección, 01/09/2026) El papá manda la foto del
                            pago; antes de darle OK hay que comprobar que esa
                            plata SÍ llegó al banco. Eso se mira en el Libro
                            Contable, y hasta hoy tocaba salirse, entrar allá,
                            escoger la pestaña, escribir el código de memoria y
                            devolverse. Este botón hace todo eso de un clic:
                            abre el Libro en TODAS las cuentas, con el código de
                            ESTE deportista puesto en el filtro. Se abre en una
                            ESTE deportista puesto en el filtro. Y allá arriba
                            sale una barra VOLVER A PAGOS PENDIENTES para
                            devolverse de una a darle OK. */}
                        <button
                          /* Se lleva también EL DÍA en que el papá subió el soporte:
                             si el pago no aparece por código, allá el Libro se
                             puede parar en ese día a buscarlo. — 05/09/2026 */
                          onClick={() => { marcarDondeIba(s.id); router.push(`/contabilidad?codigo=${encodeURIComponent(s.depCodigo || '')}&dia=${encodeURIComponent(diaDe(s))}`); }}
                          disabled={!String(s.depCodigo || '').trim()}
                          title={String(s.depCodigo || '').trim()
                            ? `Ver en el Libro Contable los movimientos del código ${s.depCodigo}`
                            : 'Este deportista no tiene código: no se puede buscar en el libro'}
                          style={{ background: CAMPO, border: `1px solid ${BORDE}`, minHeight: 34 }}
                          className="flex items-center gap-1 px-2.5 rounded-lg hover:opacity-85 text-white font-semibold text-[11px] transition whitespace-nowrap disabled:opacity-35">
                          <BookOpen className="w-3.5 h-3.5"/> Libro
                        </button>
                      </div>
                    </td>

                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

      </main>

      {/* ── Modal: ver el soporte, CON LA FICHA AL LADO ──────────────────────
          (dirección, 01/09/2026)

          «Como esto es una relación muy manual de los pagos por orientar, que
           visualmente se vea a un lado el nombre y el código, para que la
           contadora recuerde el dato y lo edite fácilmente.»

          Antes, al abrir el comprobante la pantalla se oscurecía por completo y
          el renglón —con el nombre y el código— quedaba tapado. Tocaba cerrar,
          leer el código, y volver a abrir para comparar con la foto. Ahora la
          ficha va pegada a la foto: código grande, nombre, programa, proyecto y
          los meses que está pagando. El código se copia con un clic, y desde
          ahí mismo se puede ir a la Cuenta o al Libro sin cerrar nada. */}
      {viendoIdx !== null && soportes[viendoIdx] && (
        <div
          className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4 overflow-y-auto"
          onClick={() => { setViendoIdx(null); setCopiado(''); }}>
          <div className={`relative w-full ${esPdfDato(datoVista) ? 'max-w-6xl' : 'max-w-5xl'} flex flex-col lg:flex-row items-start gap-4`}
            onClick={e => e.stopPropagation()}>
          <div className="relative w-full lg:flex-1 min-w-0">
            {esPdfDato(datoVista) ? (
              /* PDF: se muestra dentro del visor del navegador. En celulares que no
                 saben mostrarlo, el boton de abajo lo abre o lo descarga. */
              <div className="rounded-2xl shadow-2xl overflow-hidden" style={{ background: PANEL }}>
                <iframe src={urlVista} title="Soporte de pago en PDF"
                  className="w-full h-[75vh] border-0" style={{ background: CAMPO }} />
                <div className="flex items-center justify-between gap-2 px-4 py-3 border-t" style={{ background: CAMPO, borderColor: BORDE }}>
                  <p className="text-xs font-black text-white truncate">
                    📄 {soportes[viendoIdx].nombre || 'Soporte en PDF'}
                  </p>
                  <button
                    onClick={() => abrirSoporte(datoVista, soportes[viendoIdx].nombre || 'soporte')}
                    style={{ background: VERDE }}
                    className="whitespace-nowrap px-3 py-1.5 rounded-lg hover:opacity-85 text-white font-black text-[11px] transition">
                    Abrir / descargar ↗
                  </button>
                </div>
              </div>
            ) : (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={urlVista}
                alt="Soporte de pago"
                className="w-full max-h-[80vh] object-contain rounded-2xl shadow-2xl"
                style={{ background: PANEL }}
              />
            )}
            <button
              onClick={() => { setViendoIdx(null); setCopiado(''); }}
              style={{ background: PANEL, border: `1px solid ${BORDE}` }}
              className="absolute -top-3 -right-3 w-8 h-8 rounded-full shadow-lg flex items-center justify-center text-white hover:opacity-70 transition text-lg font-black">
              ×
            </button>
          </div>

          {/* ── LA FICHA, AL LADO DE LA FOTO ── */}
          {(() => {
            const s = soportes[viendoIdx];
            const cod = String(s.depCodigo || '').trim();
            return (
              <aside className="w-full lg:w-[290px] lg:shrink-0 rounded-2xl shadow-2xl overflow-hidden"
                style={{ background: PANEL, border: `1px solid ${BORDE}` }}>

                <div className="px-4 py-2.5" style={{ background: VERDE }}>
                  <p className="text-white font-black text-[11px] tracking-widest">A QUIÉN LE PERTENECE</p>
                </div>

                <div className="px-4 py-4 space-y-3.5">

                  {/* CÓDIGO — lo que la contadora necesita tener a la mano */}
                  <div>
                    <p className="text-[9.5px] font-black tracking-widest mb-1" style={{ color: GRIS }}>CÓDIGO</p>
                    <button
                      onClick={() => {
                        if (!cod || cod === '—') return;
                        try {
                          navigator.clipboard.writeText(cod);
                          setCopiado(cod);
                          setTimeout(() => setCopiado(''), 1800);
                        } catch { /* si el navegador no deja copiar, igual se ve el número */ }
                      }}
                      title={cod && cod !== '—' ? 'Clic para copiar el código' : 'Este deportista no tiene código'}
                      style={{ background: CAMPO, border: `1px solid ${BORDE}` }}
                      className="w-full rounded-xl px-3 py-2.5 flex items-center justify-between gap-2 hover:opacity-85 transition">
                      <span className="font-black text-[26px] leading-none tracking-wider" style={{ color: '#5BE39B' }}>
                        {cod || '—'}
                      </span>
                      <span className="text-[10px] font-black" style={{ color: copiado === cod && cod ? '#5BE39B' : GRIS }}>
                        {copiado === cod && cod ? '¡COPIADO!' : 'COPIAR'}
                      </span>
                    </button>
                  </div>

                  {/* NOMBRE */}
                  <div>
                    <p className="text-[9.5px] font-black tracking-widest mb-1" style={{ color: GRIS }}>DEPORTISTA</p>
                    <p className="text-white font-black text-[14.5px] leading-snug">{s.depNombre || '—'}</p>
                  </div>

                  {/* PROGRAMA · PROYECTO */}
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <p className="text-[9.5px] font-black tracking-widest mb-1" style={{ color: GRIS }}>PROGRAMA</p>
                      <p className="text-white font-semibold text-[12px] leading-snug">{s.depPrograma || '—'}</p>
                    </div>
                    <div>
                      <p className="text-[9.5px] font-black tracking-widest mb-1" style={{ color: GRIS }}>PROYECTO</p>
                      <p className="text-white font-semibold text-[12px] leading-snug">{s.depProyecto || '—'}</p>
                    </div>
                  </div>

                  {/* MESES que dice estar pagando */}
                  <div>
                    <p className="text-[9.5px] font-black tracking-widest mb-1.5" style={{ color: GRIS }}>DICE PAGAR</p>
                    {s.meses && s.meses.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {s.meses.map(m => (
                          <span key={m} className="px-2 py-0.5 rounded-md text-white text-[11px] font-bold"
                            style={{ background: VERDE }}>{m}</span>
                        ))}
                      </div>
                    ) : <p className="text-[12px] font-semibold" style={{ color: GRIS }}>No dijo el mes</p>}
                  </div>

                  {/* Cuándo lo mandó el papá */}
                  <div>
                    <p className="text-[9.5px] font-black tracking-widest mb-1" style={{ color: GRIS }}>LO MANDÓ</p>
                    <p className="text-white font-semibold text-[12px]">
                      {s.created_at
                        ? new Date(s.created_at).toLocaleString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })
                        : (s.fecha || '—')}
                    </p>
                  </div>
                </div>

                {/* ── AQUÍ ESTABA EL PROBLEMA DE LA FRANJA ──────────────────
                    (corregido 05/09/2026 — «sigue sin salir la banda, incluso
                     como estaba antes»)

                    La franja SÍ estaba programada… pero solo en los botones
                    Cuenta y Libro de la TABLA. Estos dos, los del VISOR —los
                    que de verdad se usan, porque uno primero abre la foto del
                    soporte y desde ahí se va a comprobar—, salían sin anotar
                    en qué renglón iba. Por eso al devolverse no había nada que
                    pintar y parecía que la franja no servía.

                    Ahora los cuatro botones anotan el renglón antes de salir.
                    Y el del Libro se lleva también el día del soporte, igual
                    que el de la tabla. */}
                <div className="px-4 pb-4 flex gap-2">
                  <button
                    onClick={() => { marcarDondeIba(s.id); router.push(`/alumnos/${s.depId}/estado-cuenta?readonly=1`); }}
                    style={{ background: CAMPO, border: `1px solid ${BORDE}` }}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-white font-black text-[11.5px] hover:opacity-85 transition">
                    <Eye className="w-3.5 h-3.5" /> Cuenta
                  </button>
                  <button
                    onClick={() => { marcarDondeIba(s.id); router.push(`/contabilidad?codigo=${encodeURIComponent(cod)}&dia=${encodeURIComponent(diaDe(s))}`); }}
                    disabled={!cod || cod === '—'}
                    style={{ background: CAMPO, border: `1px solid ${BORDE}` }}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-white font-black text-[11.5px] hover:opacity-85 transition disabled:opacity-35">
                    <BookOpen className="w-3.5 h-3.5" /> Libro
                  </button>
                </div>
              </aside>
            );
          })()}
          </div>
        </div>
      )}

      {/* ── Modal: confirmar acción ── */}
      {accion && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="rounded-3xl shadow-2xl p-6 max-w-sm w-full border" style={{ background: PANEL, borderColor: BORDE }}>
            {accion.tipo === 'confirmar' ? (
              <>
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4" style={{ background: CAMPO }}>
                  <CheckCircle className="w-7 h-7" style={{ color: VERDE }}/>
                </div>
                <h3 className="text-center font-black text-white text-lg mb-1">¿Confirmar pago?</h3>
                <p className="text-center text-white text-sm mb-6">
                  Esto marca el soporte de <strong>{soportes[accion.idx]?.depNombre}</strong> como pagado y confirmado.
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={() => setAccion(null)}
                    disabled={procesando}
                    style={{ background: CAMPO, borderColor: BORDE, minHeight: 48 }}
                    className="flex-1 rounded-xl border text-white font-semibold text-sm hover:opacity-85 transition disabled:opacity-50">
                    Cancelar
                  </button>
                  <button
                    onClick={() => handleConfirmar(accion.idx)}
                    disabled={procesando}
                    style={{ background: VERDE, minHeight: 48 }}
                    className="flex-1 rounded-xl text-white font-black text-sm hover:opacity-85 transition disabled:opacity-50">
                    {procesando ? 'Procesando…' : '✅ Confirmar'}
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4" style={{ background: CAMPO }}>
                  <XCircle className="w-7 h-7" style={{ color: ROJO }}/>
                </div>
                <h3 className="text-center font-black text-white text-lg mb-1">¿Rechazar soporte?</h3>
                <p className="text-center text-white text-sm mb-6">
                  El soporte de <strong>{soportes[accion.idx]?.depNombre}</strong> será eliminado. El padre deberá volver a subir el comprobante correcto.
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={() => setAccion(null)}
                    disabled={procesando}
                    style={{ background: CAMPO, borderColor: BORDE, minHeight: 48 }}
                    className="flex-1 rounded-xl border text-white font-semibold text-sm hover:opacity-85 transition disabled:opacity-50">
                    Cancelar
                  </button>
                  <button
                    onClick={() => handleRechazar(accion.idx)}
                    disabled={procesando}
                    style={{ background: ROJO, minHeight: 48 }}
                    className="flex-1 rounded-xl text-white font-black text-sm hover:opacity-85 transition disabled:opacity-50">
                    {procesando ? 'Eliminando…' : '🗑️ Rechazar'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Toast ── */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-2xl shadow-2xl text-white font-bold text-sm"
             style={{ background: toast.ok ? VERDE : ROJO }}>
          {toast.msg}
        </div>
      )}

    </div>
  );
}
