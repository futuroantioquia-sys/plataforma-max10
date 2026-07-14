'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ClipboardList, Save, Dumbbell } from 'lucide-react';
import { getDeportistas, getSesiones, saveSesion } from '@/lib/db';
import type { Deportista, Sesion } from '@/lib/db';
import { BalonCargando } from '@/components/BalonCargando';
import { cn } from '@/lib/utils';

function getCol(dep: Deportista, rx: RegExp) {
  const k = Object.keys(dep._columnas).find(k => rx.test(k));
  return k ? dep._columnas[k] : '';
}
function proyectoDe(dep: Deportista) {
  return getCol(dep, /^proy/i) || '__SIN_PROYECTO__';
}

const INICIAL = { fecha: new Date().toLocaleDateString('es-CO'), proyecto: '', profesor: '', objetivo: '', ejercicios: '', observaciones: '' };

export default function SesionesPage() {
  const router = useRouter();
  const [cargando, setCargando] = useState(true);
  const [proyectos, setProyectos] = useState<string[]>([]);
  const [proyecto, setProyecto] = useState('');
  const [sesiones, setSesiones] = useState<Sesion[]>([]);
  const [form, setForm] = useState(INICIAL);
  const [guardando, setGuardando] = useState(false);
  const [guardado, setGuardado] = useState(false);

  useEffect(() => {
    getDeportistas().then(deps => {
      const lista = Array.from(new Set(deps.map(proyectoDe).filter(p => p !== '__SIN_PROYECTO__'))).sort();
      setProyectos(lista);
      setCargando(false);
    });
  }, []);

  useEffect(() => {
    if (!proyecto) { setSesiones([]); return; }
    getSesiones(proyecto).then(setSesiones);
  }, [proyecto]);

  const set = (k: keyof typeof form, v: string) => setForm(p => ({ ...p, [k]: v }));

  async function guardar() {
    if (!form.proyecto) { alert('Selecciona un proyecto/grupo.'); return; }
    if (!form.objetivo.trim()) { alert('Ingresa el objetivo de la sesión.'); return; }
    setGuardando(true);
    try {
      await saveSesion(form);
      setGuardado(true);
      setTimeout(() => setGuardado(false), 2000);
      setForm({ ...INICIAL, proyecto: form.proyecto, profesor: form.profesor });
      getSesiones(form.proyecto).then(setSesiones);
    } finally {
      setGuardando(false);
    }
  }

  if (cargando) return <BalonCargando texto="Cargando sesiones..." />;

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-gradient-to-r from-[#2e1065] via-[#581c87] to-[#9333ea] px-6 py-4 flex items-center gap-3 sticky top-0 z-10 shadow-sm">
        <button onClick={() => router.push('/dashboard')} className="text-white/70 hover:text-white">← Volver</button>
        <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center">
          <Dumbbell className="w-4 h-4 text-white" />
        </div>
        <span className="font-bold text-white">Sesiones de Entrenamiento</span>
        <div className="ml-auto text-right leading-tight">
          <p className="text-white font-black text-sm tracking-widest">MAX 10 SPORT</p>
          <p className="text-white/60 text-[11px]">Conecta, Gestiona, Gana</p>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 space-y-6">

        {/* FORMULARIO NUEVA SESIÓN */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <h2 className="text-sm font-bold text-gray-900 mb-4 flex items-center gap-2">
            <ClipboardList className="w-4 h-4 text-[#9333ea]" /> Registrar nueva sesión
          </h2>

          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">Fecha</label>
              <input type="text" value={form.fecha} onChange={e => set('fecha', e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#9333ea]" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">Proyecto / Grupo</label>
              <select value={form.proyecto} onChange={e => { set('proyecto', e.target.value); setProyecto(e.target.value); }}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#9333ea]">
                <option value="">— Seleccionar —</option>
                {proyectos.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
          </div>

          <div className="mb-4">
            <label className="block text-xs font-semibold text-gray-500 mb-1">Profesor</label>
            <input type="text" value={form.profesor} onChange={e => set('profesor', e.target.value)}
              placeholder="Nombre del profesor"
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#9333ea]" />
          </div>

          <div className="mb-4">
            <label className="block text-xs font-semibold text-gray-500 mb-1">Objetivo de la sesión</label>
            <input type="text" value={form.objetivo} onChange={e => set('objetivo', e.target.value)}
              placeholder="Ej: Mejorar control y pase corto"
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#9333ea]" />
          </div>

          <div className="mb-4">
            <label className="block text-xs font-semibold text-gray-500 mb-1">Ejercicios realizados</label>
            <textarea rows={4} value={form.ejercicios} onChange={e => set('ejercicios', e.target.value)}
              placeholder="Describe los ejercicios / partes de la sesión..."
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#9333ea] resize-none" />
          </div>

          <div className="mb-4">
            <label className="block text-xs font-semibold text-gray-500 mb-1">Observaciones</label>
            <textarea rows={3} value={form.observaciones} onChange={e => set('observaciones', e.target.value)}
              placeholder="Observaciones generales del grupo..."
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#9333ea] resize-none" />
          </div>

          <button onClick={guardar} disabled={guardando}
            className={cn(
              'w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold text-white transition',
              guardando ? 'bg-gray-300' : 'bg-[#9333ea] hover:bg-[#7e22ce]'
            )}>
            <Save className="w-4 h-4" /> {guardado ? '¡Guardado!' : guardando ? 'Guardando...' : 'Guardar sesión'}
          </button>
        </div>

        {/* HISTORIAL */}
        {proyecto && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <h2 className="text-sm font-bold text-gray-900 mb-4">Sesiones recientes — {proyecto}</h2>
            {sesiones.length === 0 ? (
              <p className="text-sm text-gray-400">Aún no hay sesiones registradas para este proyecto.</p>
            ) : (
              <div className="space-y-3">
                {sesiones.map(s => (
                  <div key={s.id} className="border border-gray-100 rounded-xl p-3">
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-xs font-bold text-gray-700">{s.fecha}</span>
                      <span className="text-xs text-gray-400">{s.profesor}</span>
                    </div>
                    <p className="text-sm font-semibold text-gray-900">{s.objetivo}</p>
                    {s.ejercicios && <p className="text-xs text-gray-500 mt-1 whitespace-pre-wrap">{s.ejercicios}</p>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
