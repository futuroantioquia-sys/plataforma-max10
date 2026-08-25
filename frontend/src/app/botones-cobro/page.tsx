'use client';
export const dynamic = 'force-dynamic';

/* ═══════════════════════════════════════════════════════════════════════════
   BOTONES DE COBRO
   Aquí el administrador arma los botones de cobro: cuántos hay, qué dice cada
   uno, de qué color es, cuándo aparece y qué mensaje manda por WhatsApp.
   Lo que se guarde aquí lo usa de una la pantalla de Control de Pagos.

   La CUENTA no se escoge aquí: la decide el proyecto del deportista (los seis
   de SUB 13, 14 y 15 consignan a MAX 10; el resto a Futuro Antioquia).
   ═══════════════════════════════════════════════════════════════════════════ */

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Save, CheckCircle, RotateCcw, MessageCircle, Plus, Trash2, ChevronUp, ChevronDown } from 'lucide-react';
import {
  getCobroConfig, saveCobroConfig, armarMensaje, botonEnBlanco,
  CONFIG_DEFAULT, COMODINES, COLORES_BOTON, queCubre, cuandoPorPosicion, POS_MATRICULA,
  type CobroConfig, type Boton, type Cuenta,
} from '@/lib/cobro-config';

// Paleta oficial de la plataforma
const LIENZO = '#333F50';
const PANEL  = '#3C4759';
const CAMPO  = '#2B3547';
const HONDO  = '#232B39';
const BORDE  = '#4A5568';
const VERDE  = '#00B050';
const ROJO   = '#C0504D';
const GRIS   = '#7C879A';

const URL_APP = 'https://plataforma-max10.vercel.app';

export default function BotonesCobroPage() {
  const router = useRouter();
  const [cfg,       setCfg]       = useState<CobroConfig | null>(null);
  const [cargando,  setCargando]  = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [guardado,  setGuardado]  = useState(false);
  /* Foto de lo ÚLTIMO que quedó guardado de verdad. Sirve para saber si hay
     cambios sin guardar: es el error más fácil de cometer — cambiar algo, salirse
     y creer que quedó. */
  const [comoQuedoGuardado, setComoQuedoGuardado] = useState('');

  useEffect(() => {
    getCobroConfig().then(c => {
      setCfg(c);
      setComoQuedoGuardado(JSON.stringify(c));
      setCargando(false);
    }).catch(() => setCargando(false));
  }, []);

  const haycambiosSinGuardar = !!cfg && JSON.stringify(cfg) !== comoQuedoGuardado;

  /* Si se va a salir con cambios sin guardar, el navegador le pregunta. */
  useEffect(() => {
    if (!haycambiosSinGuardar) return;
    const avisar = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', avisar);
    return () => window.removeEventListener('beforeunload', avisar);
  }, [haycambiosSinGuardar]);

  function setBoton(id: string, campo: keyof Boton, valor: string) {
    setCfg(p => p ? { ...p, botones: p.botones.map(b => b.id === id ? { ...b, [campo]: valor } : b) } : p);
  }
  function setCuenta(cual: 'cuentaFuturo' | 'cuentaMax10', campo: keyof Cuenta, valor: string) {
    setCfg(p => p ? { ...p, [cual]: { ...p[cual], [campo]: valor } } : p);
  }
  function agregarBoton() {
    setCfg(p => p ? { ...p, botones: [...p.botones, botonEnBlanco(p.botones.length)] } : p);
    // Bajar hasta el botón nuevo para que se vea de una.
    setTimeout(() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }), 60);
  }
  function borrarBoton(id: string, etiqueta: string) {
    if (!window.confirm(`¿Borrar el botón "${etiqueta}"?\n\nSe pierde su mensaje y deja de aparecer en Control de Pagos.`)) return;
    setCfg(p => p ? { ...p, botones: p.botones.filter(b => b.id !== id) } : p);
  }
  function moverBoton(id: string, dir: -1 | 1) {
    setCfg(p => {
      if (!p) return p;
      const i = p.botones.findIndex(b => b.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= p.botones.length) return p;
      const arr = [...p.botones];
      [arr[i], arr[j]] = [arr[j], arr[i]];
      return { ...p, botones: arr };
    });
  }

  async function guardar() {
    if (!cfg) return;
    if (cfg.botones.some(b => !b.etiqueta.trim())) {
      window.alert('Hay un botón sin texto. Escríbale el nombre antes de guardar.');
      return;
    }
    /* La condición se reescribe según el ORDEN antes de guardar, para que lo
       que quede en la base siempre concuerde con lo que se ve en pantalla. */
    const aGuardar = { ...cfg, botones: cfg.botones.map((b, i) => ({ ...b, cuando: cuandoPorPosicion(i) })) };
    setGuardando(true);
    const ok = await saveCobroConfig(aGuardar);
    setGuardando(false);
    if (ok) {
      setCfg(aGuardar);
      setComoQuedoGuardado(JSON.stringify(aGuardar));   // ya quedó guardado de verdad
      setGuardado(true); setTimeout(() => setGuardado(false), 3000);
    }
    else window.alert(
      'No se pudo guardar.\n\n' +
      'Si es la primera vez, puede que falte crear la tabla en la base de datos:\n' +
      'doble clic al archivo CREAR-TABLA-BOTONES-COBRO.bat que está en la carpeta\n' +
      'del proyecto, y oprima el botón verde CORRER.\n\n' +
      'Si ya la creó, revise la conexión a internet e intente otra vez.'
    );
  }

  function restaurarTodo() {
    if (!window.confirm(
      'PONER LOS 5 BOTONES DE FÁBRICA\n\n' +
      '  1 mes en curso  →  gris\n' +
      '  2 meses         →  naranja\n' +
      '  3 meses         →  rojo\n' +
      '  4 o más         →  morado\n' +
      '  MATRÍCULA       →  fucsia  (manda sobre todos)\n\n' +
      'Se pierden los botones que haya agregado y los textos que haya escrito.\n' +
      'Después hay que oprimir GUARDAR.\n\n¿Continuar?')) return;
    setCfg(p => p ? { ...p, botones: CONFIG_DEFAULT.botones.map(b => ({ ...b })) } : p);
  }

  if (cargando || !cfg) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: LIENZO }}>
        <p className="text-white font-black">Cargando…</p>
      </div>
    );
  }

  /* Ejemplo con el que se muestra la vista previa de cada botón. */
  const MESES_EJ = ['Mayo', 'Junio', 'Julio', 'Agosto'];
  const ejemplo = (b: Boton, idx: number) => {
    const esMatricula = idx === POS_MATRICULA;
    const n = esMatricula ? 1 : Math.min(idx + 1, MESES_EJ.length);
    const lista = MESES_EJ.slice(-n);
    const meses = lista.length <= 1
      ? (lista[0] ?? '')
      : lista.slice(0, -1).join(', ') + ' y ' + lista[lista.length - 1];
    return armarMensaje(b.mensaje, {
      nombre:   'JUAN CAMILO SERNA RAMIREZ',
      meses,
      valorMes: '$138.000',
      cuantos:  n,
      total:    '$' + (138000 * n).toLocaleString('es-CO'),
      debeMatricula: esMatricula,
      cuenta:   cfg.cuentaFuturo,
      app:      URL_APP,
    });
  };

  return (
    <div className="min-h-screen" style={{ background: LIENZO }}>

      {/* HEADER */}
      <header className="bg-gradient-to-r from-[#333F50] to-[#0EA142] px-4 py-4 flex items-center gap-3 sticky top-0 z-20">
        <button onClick={() => router.push('/dashboard')}
          className="text-white hover:opacity-80 transition" style={{ minHeight: 44 }}>
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-white font-black text-base leading-tight">Botones de Cobro</h1>
          {haycambiosSinGuardar
            ? <p className="text-[11px] font-black" style={{ color: '#FFD86B' }}>
                ● CAMBIOS SIN GUARDAR — oprima GUARDAR
              </p>
            : <p className="text-white text-[11px]">
                {cfg.botones.length} {cfg.botones.length === 1 ? 'botón' : 'botones'} · todo guardado
              </p>}
        </div>
        <button onClick={guardar} disabled={guardando}
          style={{ background: VERDE, minHeight: 44, boxShadow: haycambiosSinGuardar ? '0 0 0 3px #FFD86B' : undefined }}
          className={'flex items-center gap-2 text-white font-black text-sm rounded-xl px-4 hover:opacity-90 transition disabled:opacity-60 ' + (haycambiosSinGuardar ? 'animate-pulse' : '')}>
          {guardado ? <CheckCircle className="w-4 h-4" /> : <Save className="w-4 h-4" />}
          {guardado ? '¡Guardado!' : guardando ? 'Guardando…' : 'Guardar'}
        </button>
      </header>

      <main className="max-w-3xl mx-auto px-3 py-5 space-y-5">

        {/* EXPLICACIÓN */}
        <div className="rounded-2xl border p-4" style={{ background: PANEL, borderColor: BORDE }}>
          <p className="text-white text-[13px] leading-relaxed">
            Cada botón que arme aquí aparece en <strong>Control de Pagos</strong>, en la columna COBRAR,
            y manda su propio mensaje de WhatsApp. Puede tener los que quiera.
          </p>
          <p className="text-white text-[13px] leading-relaxed mt-2">
            A cada deportista le sale <strong>UN SOLO botón</strong>, y lo decide el
            <strong> orden de esta lista</strong>: el 1º es para el que debe 1 mes, el 2º para el
            que debe 2, el 3º para 3, y el 4º para el que debe 4 o más.
            <br /><br />
            El <strong>5º es el de la MATRÍCULA</strong> y manda sobre todos: si el deportista tiene
            la matrícula pendiente, le sale ese, deba los meses que deba.
          </p>
          <p className="text-white text-[13px] leading-relaxed mt-2">
            La plataforma <strong>nunca envía sola</strong>: abre WhatsApp con el mensaje escrito y
            usted le da enviar.
          </p>
        </div>

        {/* LOS BOTONES */}
        {cfg.botones.map((b, idx) => {
          const cubre = queCubre(idx, cfg.botones.length);
          return (
            <div key={b.id} className="rounded-2xl border overflow-hidden" style={{ background: PANEL, borderColor: BORDE }}>

              <div className="px-4 py-3 flex items-center gap-2" style={{ background: HONDO }}>
                <div className="flex-1 min-w-0">
                  <p className="text-white font-black text-sm truncate">
                    Botón {idx + 1} · {b.etiqueta || '(sin nombre)'}
                  </p>
                  <p className="text-[11px] mt-0.5" style={{ color: GRIS }}>{cubre}</p>
                </div>
                <button onClick={() => moverBoton(b.id, -1)} disabled={idx === 0}
                  title="Subir" style={{ minHeight: 36 }}
                  className="text-white px-1.5 hover:opacity-70 disabled:opacity-25 transition">
                  <ChevronUp className="w-4 h-4" />
                </button>
                <button onClick={() => moverBoton(b.id, 1)} disabled={idx === cfg.botones.length - 1}
                  title="Bajar" style={{ minHeight: 36 }}
                  className="text-white px-1.5 hover:opacity-70 disabled:opacity-25 transition">
                  <ChevronDown className="w-4 h-4" />
                </button>
                <button onClick={() => borrarBoton(b.id, b.etiqueta)}
                  title="Borrar este botón" style={{ minHeight: 36 }}
                  className="px-1.5 hover:opacity-70 transition" >
                  <Trash2 className="w-4 h-4" style={{ color: ROJO }} />
                </button>
              </div>

              <div className="p-4 space-y-4">

                {/* TEXTO Y VISTA DEL BOTÓN */}
                <div className="flex gap-3 flex-wrap items-end">
                  <div className="flex-1 min-w-[180px]">
                    <label className="block text-[10px] font-black text-white uppercase tracking-widest mb-1">
                      Texto del botón
                    </label>
                    <input
                      value={b.etiqueta}
                      onChange={e => setBoton(b.id, 'etiqueta', e.target.value)}
                      maxLength={24}
                      placeholder="Ej: ÚLTIMO AVISO"
                      className="w-full rounded-xl px-3 py-2 text-sm text-white border placeholder:text-[#8C94A0] focus:outline-none focus:ring-2 focus:ring-[#00B050]"
                      style={{ background: CAMPO, borderColor: BORDE, minHeight: 44 }}
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-white uppercase tracking-widest mb-1">
                      Así se va a ver
                    </label>
                    <span className="inline-flex items-center gap-1.5 text-white text-[10px] font-black px-3 rounded-lg whitespace-nowrap"
                          style={{ background: b.color, minHeight: 44 }}>
                      <MessageCircle className="w-3.5 h-3.5" />
                      {b.etiqueta || '(sin texto)'}
                    </span>
                  </div>
                </div>

                {/* QUÉ CUBRE — no se escoge: lo decide el puesto en la lista.
                    Para cambiarlo, se sube o se baja el botón con las flechas. */}
                <div className="rounded-xl px-3 py-2.5" style={{ background: CAMPO, border: `1px solid ${BORDE}` }}>
                  <p className="text-white text-[13px] font-bold">{cubre}</p>
                  <p className="text-[11px] mt-0.5" style={{ color: GRIS }}>
                    Lo decide el puesto en la lista. Para cambiarlo, suba o baje este botón con las
                    flechas ↑↓ de arriba.
                  </p>
                </div>

                {/* COLOR */}
                <div>
                  <label className="block text-[10px] font-black text-white uppercase tracking-widest mb-1.5">
                    Color del botón
                  </label>
                  <div className="flex gap-2 flex-wrap items-center">
                    {COLORES_BOTON.map(c => (
                      <button key={c.valor} onClick={() => setBoton(b.id, 'color', c.valor)}
                        title={c.nombre}
                        className="rounded-lg transition"
                        style={{
                          background: c.valor, width: 44, height: 44,
                          border: b.color.toLowerCase() === c.valor.toLowerCase()
                            ? '3px solid #FFFFFF' : `1px solid ${BORDE}`,
                        }} />
                    ))}
                    <label className="flex items-center gap-2 text-white text-[11px] font-bold cursor-pointer ml-1">
                      <input type="color" value={b.color}
                        onChange={e => setBoton(b.id, 'color', e.target.value)}
                        style={{ width: 44, height: 44, background: 'transparent', border: 'none', cursor: 'pointer' }} />
                      otro color
                    </label>
                  </div>
                </div>

                {/* MENSAJE */}
                <div>
                  <label className="block text-[10px] font-black text-white uppercase tracking-widest mb-1.5">
                    Mensaje de WhatsApp
                  </label>
                  <textarea
                    value={b.mensaje}
                    onChange={e => setBoton(b.id, 'mensaje', e.target.value)}
                    rows={12}
                    placeholder="Escriba aquí el mensaje. Puede usar las palabras entre llaves de la tabla de más abajo."
                    className="w-full rounded-xl px-3 py-2 text-[13px] text-white border placeholder:text-[#8C94A0] focus:outline-none focus:ring-2 focus:ring-[#00B050]"
                    style={{ background: CAMPO, borderColor: BORDE, lineHeight: 1.5, resize: 'vertical' }}
                  />
                </div>

                {/* VISTA PREVIA */}
                <div>
                  <p className="text-[10px] font-black text-white uppercase tracking-widest mb-1.5">
                    Así le va a llegar al acudiente
                  </p>
                  <div className="rounded-xl px-3 py-3 text-[13px] whitespace-pre-wrap"
                       style={{ background: '#0B2E23', color: '#FFFFFF', lineHeight: 1.5, border: `1px solid ${BORDE}` }}>
                    {ejemplo(b, idx) || <span style={{ color: GRIS }}>(mensaje vacío)</span>}
                  </div>
                  <p className="text-[11px] mt-1.5" style={{ color: GRIS }}>
                    Es un ejemplo con un deportista inventado. A cada familia le llegan sus propios datos.
                  </p>
                </div>

              </div>
            </div>
          );
        })}

        {/* AGREGAR / RESTAURAR */}
        <div className="flex gap-3 flex-wrap">
          <button onClick={agregarBoton}
            style={{ background: VERDE, minHeight: 52 }}
            className="flex-1 min-w-[220px] flex items-center justify-center gap-2 text-white font-black text-sm rounded-2xl hover:opacity-90 transition">
            <Plus className="w-5 h-5" /> AGREGAR BOTÓN
          </button>
          <button onClick={restaurarTodo}
            style={{ background: CAMPO, borderColor: BORDE, minHeight: 52 }}
            className="flex items-center justify-center gap-2 border text-white font-bold text-xs rounded-2xl px-4 hover:opacity-80 transition">
            <RotateCcw className="w-4 h-4" /> poner los 5 de fábrica
          </button>
        </div>

        {/* COMODINES */}
        <div className="rounded-2xl border overflow-hidden" style={{ background: PANEL, borderColor: BORDE }}>
          <div className="px-4 py-3" style={{ background: HONDO }}>
            <p className="text-white font-black text-sm">Palabras que se llenan solas</p>
            <p className="text-[11px] mt-0.5" style={{ color: GRIS }}>
              Escríbalas tal cual, con las llaves. La plataforma las cambia por el dato real de cada deportista.
            </p>
          </div>
          <div className="p-4 overflow-x-auto">
            <table className="w-full border-collapse text-[12px]" style={{ minWidth: 480 }}>
              <thead>
                <tr>
                  {['ESCRIBA ESTO', 'Y SALE', 'EJEMPLO'].map(h => (
                    <th key={h} style={{
                      background: VERDE, color: 'white', border: '1px solid white',
                      padding: '8px 6px', fontSize: 10, fontWeight: 900, textAlign: 'left',
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {COMODINES.map(c => (
                  <tr key={c.clave}>
                    <td style={{ background: CAMPO, color: '#FFFFFF', border: '1px solid white', padding: '6px', fontWeight: 900, whiteSpace: 'nowrap' }}>
                      {c.clave}
                    </td>
                    <td style={{ background: PANEL, color: '#FFFFFF', border: '1px solid white', padding: '6px' }}>
                      {c.que}
                    </td>
                    <td style={{ background: PANEL, color: '#FFFFFF', border: '1px solid white', padding: '6px', whiteSpace: 'pre-wrap' }}>
                      {c.ejemplo}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* CUENTAS */}
        <div className="rounded-2xl border overflow-hidden" style={{ background: PANEL, borderColor: BORDE }}>
          <div className="px-4 py-3" style={{ background: HONDO }}>
            <p className="text-white font-black text-sm">A qué cuenta consigna cada quien</p>
            <p className="text-[11px] mt-0.5" style={{ color: GRIS }}>
              Donde el mensaje diga {'{CUENTA}'} sale la que le corresponda a ese deportista.
            </p>
          </div>
          <div className="p-4 space-y-4">

            <div className="rounded-xl p-3 text-[12px] text-white" style={{ background: CAMPO, border: `1px solid ${BORDE}` }}>
              Esto <strong>no lo decide el botón</strong>, lo decide el <strong>proyecto</strong>:
              consignan a <strong>MAX 10 SPORT</strong> los seis proyectos de SUB 13, SUB 14 y SUB 15,
              tanto de <strong>Selección</strong> como de <strong>Desarrollo</strong>.
              Todos los demás consignan a <strong>Futuro Antioquia</strong>.
              Vale para cualquier botón que usted arme, y es la misma regla que usa el Estado de Cuenta
              cuando el padre oprime PAGAR AHORA.
            </div>

            {([
              { cual: 'cuentaFuturo' as const, titulo: 'Cuenta de FUTURO ANTIOQUIA', pie: 'La de todos los demás proyectos' },
              { cual: 'cuentaMax10'  as const, titulo: 'Cuenta de MAX 10 SPORT',     pie: 'Selección y Desarrollo SUB 13, 14 y 15' },
            ]).map(({ cual, titulo, pie }) => (
              <div key={cual}>
                <p className="text-white font-black text-[13px]">{titulo}</p>
                <p className="text-[11px] mb-2" style={{ color: GRIS }}>{pie}</p>
                <div className="grid grid-cols-2 gap-2">
                  {([
                    { campo: 'banco'   as const, label: 'Banco y tipo' },
                    { campo: 'numero'  as const, label: 'Número de cuenta' },
                    { campo: 'titular' as const, label: 'A nombre de' },
                    { campo: 'nit'     as const, label: 'NIT (puede ir vacío)' },
                  ]).map(({ campo, label }) => (
                    <div key={campo}>
                      <label className="block text-[10px] font-black text-white uppercase tracking-widest mb-1">{label}</label>
                      <input
                        value={cfg[cual][campo]}
                        onChange={e => setCuenta(cual, campo, e.target.value)}
                        className="w-full rounded-xl px-3 py-2 text-sm text-white border focus:outline-none focus:ring-2 focus:ring-[#00B050]"
                        style={{ background: CAMPO, borderColor: BORDE, minHeight: 44 }}
                      />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* GUARDAR ABAJO TAMBIÉN */}
        <button onClick={guardar} disabled={guardando}
          style={{ background: VERDE, minHeight: 52, boxShadow: haycambiosSinGuardar ? '0 0 0 3px #FFD86B' : undefined }}
          className="w-full flex items-center justify-center gap-2 text-white font-black text-sm rounded-2xl hover:opacity-90 transition disabled:opacity-60 mb-8">
          {guardado ? <CheckCircle className="w-5 h-5" /> : <Save className="w-5 h-5" />}
          {guardado ? '¡GUARDADO!'
            : guardando ? 'GUARDANDO…'
            : haycambiosSinGuardar ? 'GUARDAR LOS CAMBIOS (hay cambios sin guardar)'
            : 'GUARDAR LOS CAMBIOS'}
        </button>

      </main>
    </div>
  );
}
