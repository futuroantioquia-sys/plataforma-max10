'use client';
export const dynamic = 'force-dynamic';

/* ═══════════════════════════════════════════════════════════════════════════
   BOTONES DE COBRO
   Aquí el administrador cambia, sin tocar código: lo que dice el botón, de qué
   color es, y el mensaje que se le manda al acudiente por WhatsApp.
   Lo que se guarde aquí lo usa de una la pantalla de Control de Pagos.
   ═══════════════════════════════════════════════════════════════════════════ */

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Save, CheckCircle, RotateCcw, MessageCircle } from 'lucide-react';
import {
  getCobroConfig, saveCobroConfig, armarMensaje,
  CONFIG_DEFAULT, COMODINES, COLORES_BOTON,
  type CobroConfig, type Boton, type Cuenta,
} from '@/lib/cobro-config';

// Paleta oficial de la plataforma
const LIENZO = '#333F50';
const PANEL  = '#3C4759';
const CAMPO  = '#2B3547';
const HONDO  = '#232B39';
const BORDE  = '#4A5568';
const VERDE  = '#00B050';
const GRIS   = '#7C879A';

const URL_APP = 'https://plataforma-max10.vercel.app';

export default function BotonesCobroPage() {
  const router = useRouter();
  const [cfg,       setCfg]       = useState<CobroConfig | null>(null);
  const [cargando,  setCargando]  = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [guardado,  setGuardado]  = useState(false);

  useEffect(() => {
    getCobroConfig().then(c => { setCfg(c); setCargando(false); }).catch(() => setCargando(false));
  }, []);

  function setBoton(cual: 'uno' | 'atrasado', campo: keyof Boton, valor: string) {
    setCfg(p => p ? { ...p, [cual]: { ...p[cual], [campo]: valor } } : p);
  }
  function setCuenta(cual: 'cuentaFuturo' | 'cuentaMax10', campo: keyof Cuenta, valor: string) {
    setCfg(p => p ? { ...p, [cual]: { ...p[cual], [campo]: valor } } : p);
  }

  async function guardar() {
    if (!cfg) return;
    setGuardando(true);
    const ok = await saveCobroConfig(cfg);
    setGuardando(false);
    if (ok) { setGuardado(true); setTimeout(() => setGuardado(false), 3000); }
    else window.alert(
      'No se pudo guardar.\n\n' +
      'Si es la primera vez, puede que falte crear la tabla en la base de datos:\n' +
      'doble clic al archivo CREAR-TABLA-BOTONES-COBRO.bat que está en la carpeta\n' +
      'del proyecto, y oprima el botón verde CORRER.\n\n' +
      'Si ya la creó, revise la conexión a internet e intente otra vez.'
    );
  }

  function restaurar(cual: 'uno' | 'atrasado') {
    if (!window.confirm('¿Volver este mensaje al texto original? Se pierde lo que escribió aquí.')) return;
    setCfg(p => p ? { ...p, [cual]: { ...CONFIG_DEFAULT[cual] } } : p);
  }

  if (cargando || !cfg) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: LIENZO }}>
        <p className="text-white font-black">Cargando…</p>
      </div>
    );
  }

  /* Ejemplo con el que se muestra la vista previa. */
  const ejemplo = (cual: 'uno' | 'atrasado') => armarMensaje(cfg[cual].mensaje, {
    nombre:  'JUAN CAMILO SERNA RAMIREZ',
    meses:   cual === 'uno' ? 'Agosto' : 'Julio y Agosto',
    valorMes: '$138.000',
    cuantos:  cual === 'uno' ? 1 : 2,
    total:    cual === 'uno' ? '$138.000' : '$276.000',
    debeMatricula: false,
    cuenta:   cfg.cuentaFuturo,
    app:      URL_APP,
  });

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
          <p className="text-white text-[11px]">Lo que dice el botón, su color y el mensaje de WhatsApp</p>
        </div>
        <button onClick={guardar} disabled={guardando}
          style={{ background: VERDE, minHeight: 44 }}
          className="flex items-center gap-2 text-white font-black text-sm rounded-xl px-4 hover:opacity-90 transition disabled:opacity-60">
          {guardado ? <CheckCircle className="w-4 h-4" /> : <Save className="w-4 h-4" />}
          {guardado ? '¡Guardado!' : guardando ? 'Guardando…' : 'Guardar'}
        </button>
      </header>

      <main className="max-w-3xl mx-auto px-3 py-5 space-y-5">

        {/* EXPLICACIÓN */}
        <div className="rounded-2xl border p-4" style={{ background: PANEL, borderColor: BORDE }}>
          <p className="text-white text-[13px] leading-relaxed">
            Hay <strong>dos botones</strong> en Control de Pagos, y cada uno manda su propio mensaje:
          </p>
          <ul className="text-white text-[13px] leading-relaxed mt-2 space-y-1 list-disc pl-5">
            <li>Uno para el que <strong>solo debe el mes en curso</strong> — un recordatorio amable.</li>
            <li>Otro para el que <strong>ya viene atrasado</strong> — dos o más meses, o un mes viejo.</li>
          </ul>
          <p className="text-white text-[13px] leading-relaxed mt-2">
            Lo que guarde aquí se aplica de una. La plataforma <strong>nunca envía sola</strong>: abre WhatsApp
            con el mensaje escrito y usted le da enviar.
          </p>
        </div>

        {/* LOS DOS BOTONES */}
        {([
          { cual: 'uno' as const,      titulo: 'Cuando SOLO debe el mes en curso', pie: 'Recordatorio amable, para que no se le junte con el próximo.' },
          { cual: 'atrasado' as const, titulo: 'Cuando ya viene ATRASADO',         pie: 'Debe dos o más meses, o un mes que ya se pasó.' },
        ]).map(({ cual, titulo, pie }) => (
          <div key={cual} className="rounded-2xl border overflow-hidden" style={{ background: PANEL, borderColor: BORDE }}>

            <div className="px-4 py-3" style={{ background: HONDO }}>
              <p className="text-white font-black text-sm">{titulo}</p>
              <p className="text-[11px] mt-0.5" style={{ color: GRIS }}>{pie}</p>
            </div>

            <div className="p-4 space-y-4">

              {/* TEXTO Y COLOR DEL BOTÓN */}
              <div className="flex gap-3 flex-wrap items-end">
                <div className="flex-1 min-w-[180px]">
                  <label className="block text-[10px] font-black text-white uppercase tracking-widest mb-1">
                    Texto del botón
                  </label>
                  <input
                    value={cfg[cual].etiqueta}
                    onChange={e => setBoton(cual, 'etiqueta', e.target.value)}
                    maxLength={24}
                    className="w-full rounded-xl px-3 py-2 text-sm text-white border focus:outline-none focus:ring-2 focus:ring-[#00B050]"
                    style={{ background: CAMPO, borderColor: BORDE, minHeight: 44 }}
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-white uppercase tracking-widest mb-1">
                    Así se va a ver
                  </label>
                  <span className="inline-flex items-center gap-1.5 text-white text-[10px] font-black px-3 rounded-lg whitespace-nowrap"
                        style={{ background: cfg[cual].color, minHeight: 44 }}>
                    <MessageCircle className="w-3.5 h-3.5" />
                    {cfg[cual].etiqueta || '(sin texto)'}
                  </span>
                </div>
              </div>

              {/* COLOR */}
              <div>
                <label className="block text-[10px] font-black text-white uppercase tracking-widest mb-1.5">
                  Color del botón
                </label>
                <div className="flex gap-2 flex-wrap items-center">
                  {COLORES_BOTON.map(c => (
                    <button key={c.valor} onClick={() => setBoton(cual, 'color', c.valor)}
                      title={c.nombre}
                      className="rounded-lg transition"
                      style={{
                        background: c.valor, width: 44, height: 44,
                        border: cfg[cual].color.toLowerCase() === c.valor.toLowerCase()
                          ? '3px solid #FFFFFF' : `1px solid ${BORDE}`,
                      }} />
                  ))}
                  <label className="flex items-center gap-2 text-white text-[11px] font-bold cursor-pointer ml-1">
                    <input type="color" value={cfg[cual].color}
                      onChange={e => setBoton(cual, 'color', e.target.value)}
                      style={{ width: 44, height: 44, background: 'transparent', border: 'none', cursor: 'pointer' }} />
                    otro color
                  </label>
                </div>
              </div>

              {/* MENSAJE */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-[10px] font-black text-white uppercase tracking-widest">
                    Mensaje de WhatsApp
                  </label>
                  <button onClick={() => restaurar(cual)}
                    className="flex items-center gap-1 text-[11px] font-bold text-white hover:opacity-70 transition">
                    <RotateCcw className="w-3 h-3" /> volver al original
                  </button>
                </div>
                <textarea
                  value={cfg[cual].mensaje}
                  onChange={e => setBoton(cual, 'mensaje', e.target.value)}
                  rows={12}
                  className="w-full rounded-xl px-3 py-2 text-[13px] text-white border focus:outline-none focus:ring-2 focus:ring-[#00B050]"
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
                  {ejemplo(cual)}
                </div>
                <p className="text-[11px] mt-1.5" style={{ color: GRIS }}>
                  Es un ejemplo con un deportista inventado. A cada familia le llegan sus propios datos.
                </p>
              </div>

            </div>
          </div>
        ))}

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
              Consignan a <strong>MAX 10 SPORT</strong> los seis proyectos de SUB 13, SUB 14 y SUB 15,
              tanto de <strong>Selección</strong> como de <strong>Desarrollo</strong>.
              Todos los demás consignan a <strong>Futuro Antioquia</strong>.
              Es la misma regla que usa el Estado de Cuenta cuando el padre oprime PAGAR AHORA.
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
          style={{ background: VERDE, minHeight: 52 }}
          className="w-full flex items-center justify-center gap-2 text-white font-black text-sm rounded-2xl hover:opacity-90 transition disabled:opacity-60 mb-8">
          {guardado ? <CheckCircle className="w-5 h-5" /> : <Save className="w-5 h-5" />}
          {guardado ? '¡GUARDADO!' : guardando ? 'GUARDANDO…' : 'GUARDAR LOS CAMBIOS'}
        </button>

      </main>
    </div>
  );
}
