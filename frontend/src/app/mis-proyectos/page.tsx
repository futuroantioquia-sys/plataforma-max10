'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Save, CheckCircle } from 'lucide-react';

const PROYECTOS_META_KEY = 'futuro_proyectos_meta';

const CAL_OPTIONS = ['', ...Array.from({ length: 46 }, (_, i) => ((i + 5) / 10).toFixed(1))];

interface ProyMeta { horario: string; calificacion: string; }

export default function MisProyectosPage() {
  const router = useRouter();

  const [misGrupos,   setMisGrupos]   = useState<string[]>([]);
  const [meta,        setMeta]        = useState<Record<string, ProyMeta>>({});
  const [calEdits,    setCalEdits]    = useState<Record<string, string>>({});
  const [guardado,    setGuardado]    = useState(false);
  const [nombreProfe, setNombreProfe] = useState('');

  useEffect(() => {
    try {
      const rawGrupos = localStorage.getItem('futuro-profe-proyectos');
      if (rawGrupos) setMisGrupos(JSON.parse(rawGrupos));
      const rawMeta = localStorage.getItem(PROYECTOS_META_KEY);
      if (rawMeta) setMeta(JSON.parse(rawMeta));
      const nombre = localStorage.getItem('futuro-profe-nombre');
      if (nombre) setNombreProfe(JSON.parse(nombre));
    } catch {}
  }, []);

  function getCalVal(proyecto: string): string {
    // busca la clave que contenga este proyecto en el meta
    const key = Object.keys(meta).find(k => k.endsWith(`::${proyecto}`));
    if (!key) return calEdits[proyecto] ?? '';
    return calEdits[proyecto] !== undefined ? calEdits[proyecto] : (meta[key]?.calificacion ?? '');
  }

  function setCalVal(proyecto: string, val: string) {
    setCalEdits(prev => ({ ...prev, [proyecto]: val }));
  }

  function guardar() {
    const newMeta = { ...meta };
    Object.entries(calEdits).forEach(([proyecto, val]) => {
      const key = Object.keys(newMeta).find(k => k.endsWith(`::${proyecto}`));
      if (key) {
        newMeta[key] = { ...(newMeta[key] ?? { horario: '' }), calificacion: val };
      } else {
        // si no existe la clave aún, créala
        newMeta[`__SIN_PROGRAMA__::${proyecto}`] = { horario: '', calificacion: val };
      }
    });
    localStorage.setItem(PROYECTOS_META_KEY, JSON.stringify(newMeta));
    setMeta(newMeta);
    setCalEdits({});
    setGuardado(true);
    setTimeout(() => setGuardado(false), 2500);
  }

  const hayEdits = Object.keys(calEdits).length > 0;

  return (
    <div className="min-h-screen bg-gray-50">

      {/* Header */}
      <header className="relative bg-gradient-to-r from-[#064e1e] via-[#0f5a25] to-[#052a10] px-4 py-4 flex items-center gap-3 sticky top-0 z-20 shadow overflow-hidden">
        <div className="absolute inset-0 pointer-events-none opacity-[0.07]" aria-hidden>
          <svg className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <pattern id="sp-mp" x="0" y="0" width="60" height="60" patternUnits="userSpaceOnUse">
                <circle cx="30" cy="30" r="14" fill="none" stroke="white" strokeWidth="1"/>
                <polygon points="30,22 37,27 34,35 26,35 23,27" fill="none" stroke="white" strokeWidth="1"/>
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#sp-mp)"/>
          </svg>
        </div>

        <button onClick={() => router.push('/dashboard')}
          className="relative text-white/70 hover:text-white transition">
          <ArrowLeft className="w-5 h-5"/>
        </button>

        <div className="relative flex-1 min-w-0">
          <h1 className="text-white font-black text-base">Mis Proyectos</h1>
          <p className="text-white/60 text-[11px]">{nombreProfe || 'Formador'}</p>
        </div>

        {guardado ? (
          <span className="relative flex items-center gap-1.5 bg-green-400 text-white font-bold text-xs px-3 py-2 rounded-xl">
            <CheckCircle className="w-3.5 h-3.5"/>Guardado
          </span>
        ) : hayEdits ? (
          <button onClick={guardar}
            className="relative flex items-center gap-1.5 bg-white text-[#16a34a] font-bold text-xs px-3 py-2 rounded-xl hover:bg-green-50 transition shadow">
            <Save className="w-3.5 h-3.5"/>Guardar
          </button>
        ) : null}
      </header>

      <main className="max-w-xl mx-auto px-4 py-5 space-y-4">

        {/* Bienvenida */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-5 py-4">
          <p className="font-black text-[#111827] text-base leading-snug">
            {nombreProfe
              ? `¡Hola, ${nombreProfe.split(' ')[0]}!`
              : '¡Hola, Profe!'}
          </p>
          <p className="text-gray-500 text-sm mt-0.5">
            Estos son tus proyectos,{' '}
            <span className="font-bold text-[#16a34a]">cuida mucho de ellos.</span>
          </p>
        </div>

        {/* Proyectos */}
        {misGrupos.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-12 text-center">
            <p className="text-gray-400 font-semibold text-sm">Sin proyectos asignados</p>
            <p className="text-gray-300 text-xs mt-1">
              Pide al administrador que te asigne proyectos en Gestión de Usuarios.
            </p>
          </div>
        ) : (
          misGrupos.map(proyecto => {
            const calVal = getCalVal(proyecto);
            const calNum = parseFloat(calVal);
            const calColor = !calVal
              ? '#9ca3af'
              : calNum >= 4.5 ? '#16a34a'
              : calNum >= 3.0 ? '#f59e0b'
              : '#ef4444';

            return (
              <div key={proyecto} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">

                {/* Nombre del proyecto */}
                <div className="bg-gradient-to-r from-[#064e1e] to-[#16a34a] px-4 py-3">
                  <p className="text-white font-black text-sm">{proyecto}</p>
                </div>

                <div className="p-4 space-y-3">

                  {/* Calificación */}
                  <div className="bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">
                        Calificación del Proyecto (CAL)
                      </p>
                      <select
                        value={calVal}
                        onChange={e => setCalVal(proyecto, e.target.value)}
                        style={{ color: calColor }}
                        className="w-full bg-transparent font-black text-xl focus:outline-none cursor-pointer">
                        <option value="">— Sin calificar —</option>
                        {CAL_OPTIONS.filter(Boolean).map(v => (
                          <option key={v} value={v}>{v}</option>
                        ))}
                      </select>
                    </div>
                    {calVal && (
                      <div className="text-right flex-shrink-0">
                        <p className="font-black text-3xl leading-none" style={{ color: calColor }}>{calVal}</p>
                        <p className="text-[10px] text-gray-400 font-semibold">/ 5.0</p>
                      </div>
                    )}
                  </div>

                  {/* Botón asistencia */}
                  <button
                    onClick={() => router.push(`/asistencia?proyecto=${encodeURIComponent(proyecto)}`)}
                    className="w-full py-3.5 rounded-xl font-black text-sm text-white tracking-wide transition hover:opacity-90 active:scale-[.98]"
                    style={{ background: '#16a34a' }}>
                    GESTIONAR ASISTENCIAS
                  </button>

                </div>
              </div>
            );
          })
        )}

      </main>
    </div>
  );
}
