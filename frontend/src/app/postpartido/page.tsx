'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Trophy, Save, Plus, X } from 'lucide-react';
import { getDeportistas, getPostpartidos, savePostpartido } from '@/lib/db';
import type { Deportista, Postpartido, DesempenoJugador } from '@/lib/db';
import { BalonCargando } from '@/components/BalonCargando';
import { cn } from '@/lib/utils';

function getCol(dep: Deportista, rx: RegExp) {
  const k = Object.keys(dep._columnas).find(k => rx.test(k));
  return k ? dep._columnas[k] : '';
}
function proyectoDe(dep: Deportista) {
  return getCol(dep, /^proy/i) || '__SIN_PROYECTO__';
}
function codigoDe(dep: Deportista) {
  return getCol(dep, /^c[oó]d/i);
}

const INICIAL_FORM = { fecha: new Date().toLocaleDateString('es-CO'), proyecto: '', rival: '', resultado: '', observacionesGrupo: '', aprendizajes: '' };

export default function PostpartidoPage() {
  const router = useRouter();
  const [cargando, setCargando] = useState(true);
  const [deportistas, setDeportistas] = useState<Deportista[]>([]);
  const [proyectos, setProyectos] = useState<string[]>([]);
  const [proyecto, setProyecto] = useState('');
  const [postpartidos, setPostpartidos] = useState<Postpartido[]>([]);
  const [form, setForm] = useState(INICIAL_FORM);
  const [convocados, setConvocados] = useState<DesempenoJugador[]>([]);
  const [nuevoCodigo, setNuevoCodigo] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [guardado, setGuardado] = useState(false);

  useEffect(() => {
    getDeportistas().then(deps => {
      setDeportistas(deps);
      const lista = Array.from(new Set(deps.map(proyectoDe).filter(p => p !== '__SIN_PROYECTO__'))).sort();
      setProyectos(lista);
      setCargando(false);
    });
  }, []);

  useEffect(() => {
    if (!proyecto) { setPostpartidos([]); return; }
    getPostpartidos(proyecto).then(setPostpartidos);
  }, [proyecto]);

  const set = (k: keyof typeof form, v: string) => setForm(p => ({ ...p, [k]: v }));

  function agregarConvocado() {
    const cod = nuevoCodigo.trim().toUpperCase();
    if (!cod) return;
    const dep = deportistas.find(d => codigoDe(d).toUpperCase() === cod);
    if (!dep) { alert('No se encontró un deportista con ese código.'); return; }
    if (convocados.some(c => c.codigo === cod)) { setNuevoCodigo(''); return; }
    setConvocados(prev => [...prev, { codigo: cod, nombre: dep._nombre, observacion: '' }]);
    setNuevoCodigo('');
  }

  function quitarConvocado(codigo: string) {
    setConvocados(prev => prev.filter(c => c.codigo !== codigo));
  }

  function setObservacionConvocado(codigo: string, obs: string) {
    setConvocados(prev => prev.map(c => c.codigo === codigo ? { ...c, observacion: obs } : c));
  }

  async function guardar() {
    if (!form.proyecto) { alert('Selecciona un proyecto/grupo.'); return; }
    if (!form.rival.trim()) { alert('Ingresa el rival.'); return; }
    setGuardando(true);
    try {
      await savePostpartido({ ...form, desempenoIndividual: convocados });
      setGuardado(true);
      setTimeout(() => setGuardado(false), 2000);
      setForm({ ...INICIAL_FORM, proyecto: form.proyecto });
      setConvocados([]);
      getPostpartidos(form.proyecto).then(setPostpartidos);
    } finally {
      setGuardando(false);
    }
  }

  if (cargando) return <BalonCargando texto="Cargando postpartido..." />;

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-gradient-to-r from-[#2e1065] via-[#581c87] to-[#9333ea] px-6 py-4 flex items-center gap-3 sticky top-0 z-10 shadow-sm">
        <button onClick={() => router.push('/dashboard')} className="text-white/70 hover:text-white">← Volver</button>
        <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center">
          <Trophy className="w-4 h-4 text-white" />
        </div>
        <span className="font-bold text-white">Postpartido</span>
        <div className="ml-auto text-right leading-tight">
          <p className="text-white font-black text-sm tracking-widest">MAX 10 SPORT</p>
          <p className="text-white/60 text-[11px]">Conecta, Gestiona, Gana</p>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 space-y-6">

        {/* FORMULARIO */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <h2 className="text-sm font-bold text-gray-900 mb-4">Registrar postpartido</h2>

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

          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">Rival</label>
              <input type="text" value={form.rival} onChange={e => set('rival', e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#9333ea]" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">Resultado</label>
              <input type="text" value={form.resultado} onChange={e => set('resultado', e.target.value)}
                placeholder="Ej: 2-1"
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#9333ea]" />
            </div>
          </div>

          <div className="mb-4">
            <label className="block text-xs font-semibold text-gray-500 mb-1">Observaciones del grupo</label>
            <textarea rows={3} value={form.observacionesGrupo} onChange={e => set('observacionesGrupo', e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#9333ea] resize-none" />
          </div>

          {/* CONVOCADOS */}
          <div className="mb-4">
            <label className="block text-xs font-semibold text-gray-500 mb-1">Desempeño individual (convocados)</label>
            <div className="flex gap-2 mb-3">
              <input type="text" value={nuevoCodigo} onChange={e => setNuevoCodigo(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && agregarConvocado()}
                placeholder="Código del deportista (Ej: B635)"
                className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#9333ea]" />
              <button onClick={agregarConvocado} className="w-10 h-10 bg-[#9333ea] text-white rounded-xl flex items-center justify-center hover:bg-[#7e22ce] transition">
                <Plus className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-2">
              {convocados.map(c => (
                <div key={c.codigo} className="flex items-center gap-2 border border-gray-100 rounded-xl p-2">
                  <span className="text-xs font-bold text-gray-700 w-32 truncate flex-shrink-0">{c.nombre || c.codigo}</span>
                  <input type="text" value={c.observacion} onChange={e => setObservacionConvocado(c.codigo, e.target.value)}
                    placeholder="Observación de desempeño..."
                    className="flex-1 border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-[#9333ea]" />
                  <button onClick={() => quitarConvocado(c.codigo)} className="text-gray-400 hover:text-red-500">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
              {convocados.length === 0 && <p className="text-xs text-gray-400">Agrega jugadores convocados por código para registrar su desempeño.</p>}
            </div>
          </div>

          <div className="mb-4">
            <label className="block text-xs font-semibold text-gray-500 mb-1">Aprendizajes y recomendaciones</label>
            <textarea rows={3} value={form.aprendizajes} onChange={e => set('aprendizajes', e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#9333ea] resize-none" />
          </div>

          <button onClick={guardar} disabled={guardando}
            className={cn(
              'w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold text-white transition',
              guardando ? 'bg-gray-300' : 'bg-[#9333ea] hover:bg-[#7e22ce]'
            )}>
            <Save className="w-4 h-4" /> {guardado ? '¡Guardado!' : guardando ? 'Guardando...' : 'Guardar postpartido'}
          </button>
        </div>

        {/* HISTORIAL */}
        {proyecto && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <h2 className="text-sm font-bold text-gray-900 mb-4">Postpartidos recientes — {proyecto}</h2>
            {postpartidos.length === 0 ? (
              <p className="text-sm text-gray-400">Aún no hay postpartidos registrados para este proyecto.</p>
            ) : (
              <div className="space-y-3">
                {postpartidos.map(p => (
                  <div key={p.id} className="border border-gray-100 rounded-xl p-3">
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-xs font-bold text-gray-700">{p.fecha}</span>
                      <span className="text-xs text-gray-400">vs {p.rival} · {p.resultado}</span>
                    </div>
                    {p.observacionesGrupo && <p className="text-xs text-gray-500 whitespace-pre-wrap">{p.observacionesGrupo}</p>}
                    {p.desempenoIndividual.length > 0 && (
                      <p className="text-[11px] text-gray-400 mt-1">{p.desempenoIndividual.length} jugador(es) con observaciones</p>
                    )}
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
