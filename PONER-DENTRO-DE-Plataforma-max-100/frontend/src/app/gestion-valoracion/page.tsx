'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Save, CheckCircle, RotateCcw } from 'lucide-react';
import {
  FUNDAMENTOS, NIVELES_LABELS, DESCRIPCIONES_DEFAULT,
  getDescripcionesValoracion, saveDescripcionesValoracion,
  getMetaValoracion, saveMetaValoracion,
  getCategoriasValoracion, saveCategoriasValoracion, COMPONENTES,
  type Desc, type FundMetaEdit,
} from '@/lib/valoracion-textos';

const NIVEL_COLOR = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#16a34a'];
const CAT_EMOJI: Record<string, string> = { 'Físico': '💪', 'Técnica': '⚽', 'Táctica': '🧠', 'Mental': '❤️' };

export default function GestionValoracionPage() {
  const router = useRouter();
  const [textos,    setTextos]    = useState<Record<string, Desc>>({});
  const [meta,      setMeta]      = useState<Record<string, FundMetaEdit>>({});
  const [catNombres, setCatNombres] = useState<Record<string, string>>({});
  const [cargando,  setCargando]  = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [guardado,  setGuardado]  = useState(false);

  useEffect(() => {
    Promise.all([getDescripcionesValoracion(), getMetaValoracion(), getCategoriasValoracion()])
      .then(([t, m, c]) => { setTextos(t); setMeta(m); setCatNombres(c); setCargando(false); })
      .catch(() => setCargando(false));
  }, []);

  const setTexto = (key: string, label: string, valor: string) => {
    setTextos(prev => ({ ...prev, [key]: { ...(prev[key] ?? {}), [label]: valor } }));
  };
  const setMetaCampo = (key: string, campo: keyof FundMetaEdit, valor: string) => {
    setMeta(prev => ({ ...prev, [key]: { ...(prev[key] ?? { titulo: '', subtitulo: '', definicion: '' }), [campo]: valor } }));
  };

  const restaurarFund = (key: string) => {
    if (!confirm('¿Restaurar los textos por defecto de este componente?')) return;
    setTextos(prev => ({ ...prev, [key]: { ...(DESCRIPCIONES_DEFAULT[key] ?? {}) } }));
  };

  const guardar = async () => {
    setGuardando(true);
    const [okT, okM, okC] = await Promise.all([
      saveDescripcionesValoracion(textos),
      saveMetaValoracion(meta),
      saveCategoriasValoracion(catNombres),
    ]);
    setGuardando(false);
    if (okT && okM && okC) { setGuardado(true); setTimeout(() => setGuardado(false), 2500); }
    else alert('No se pudo guardar. Revisa la conexión e intenta de nuevo.');
  };

  // Agrupar fundamentos por categoría (manteniendo el orden)
  const categorias: string[] = [];
  FUNDAMENTOS.forEach(f => { if (!categorias.includes(f.categoria)) categorias.push(f.categoria); });

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-gradient-to-r from-[#064e1e] to-[#16a34a] px-4 py-4 flex items-center gap-3 sticky top-0 z-20 shadow">
        <button onClick={() => router.push('/dashboard')} className="text-white/80 hover:text-white transition">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-white font-black text-base leading-tight">Gestión de Valoración Deportiva</h1>
          <p className="text-white/70 text-[11px]">Edita el texto de cada nivel · se refleja en el informe del formador</p>
        </div>
        <button onClick={guardar} disabled={guardando || cargando}
          className="flex items-center gap-2 bg-white text-[#064e1e] font-black text-sm rounded-xl px-4 py-2 hover:bg-gray-100 transition disabled:opacity-60">
          {guardado ? <CheckCircle className="w-4 h-4" /> : <Save className="w-4 h-4" />}
          {guardado ? '¡Guardado!' : guardando ? 'Guardando…' : 'Guardar'}
        </button>
      </header>

      <main className="max-w-4xl mx-auto px-3 py-5 space-y-6">
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-[13px] text-blue-800">
          Aquí editas la <b>base de textos</b> de cada nivel. Al guardar, las <b>próximas valoraciones</b> que
          haga el formador usarán estos textos, y así también los verá el padre de familia.
        </div>

        {!cargando && (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4">
            <p className="text-[#064e1e] font-black text-sm mb-1">Nombres de los componentes</p>
            <p className="text-gray-500 text-[12px] mb-3">Estos nombres aparecen en el informe (Valoración Dinámica), incluido el consolidado del final. Edítalos y presiona Guardar.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {COMPONENTES.map(c => (
                <div key={c.key}>
                  <label className="block text-[10px] font-black text-gray-500 uppercase tracking-wide mb-1">{c.nombre}</label>
                  <input value={catNombres[c.key] ?? ''} onChange={e => setCatNombres(prev => ({ ...prev, [c.key]: e.target.value }))}
                    placeholder={c.nombre}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-bold text-gray-800 focus:outline-none focus:ring-2 focus:ring-[#16a34a]" />
                </div>
              ))}
            </div>
          </div>
        )}

        {cargando ? (
          <div className="text-center text-gray-400 py-16 font-semibold">Cargando textos…</div>
        ) : categorias.map(cat => (
          <section key={cat} className="space-y-3">
            <h2 className="text-lg font-black text-[#064e1e] flex items-center gap-2">
              <span>{CAT_EMOJI[cat] ?? '•'}</span> {cat}
            </h2>
            {FUNDAMENTOS.filter(f => f.categoria === cat).map(f => (
              <div key={f.key} className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="flex items-center justify-between gap-2 px-4 py-2.5 bg-[#16a34a]">
                  <div className="min-w-0">
                    <p className="text-white font-black text-sm uppercase tracking-wide truncate">{meta[f.key]?.titulo || f.titulo}</p>
                    <p className="text-white/70 text-[11px]">{meta[f.key]?.subtitulo || f.subtitulo}</p>
                  </div>
                  <button onClick={() => restaurarFund(f.key)} title="Restaurar textos por defecto"
                    className="flex items-center gap-1 text-white/80 hover:text-white text-[11px] font-bold flex-shrink-0">
                    <RotateCcw className="w-3.5 h-3.5" /> Restaurar
                  </button>
                </div>
                <div className="p-3 space-y-2.5">
                  {/* Editar el COMPONENTE: nombre, subtítulo y definición */}
                  <div className="bg-green-50/60 border border-green-100 rounded-lg p-2.5 space-y-2">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[10px] font-black text-gray-500 uppercase tracking-wide mb-1">Nombre del componente</label>
                        <input value={meta[f.key]?.titulo ?? ''} onChange={e => setMetaCampo(f.key, 'titulo', e.target.value)}
                          placeholder={f.titulo}
                          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-bold text-gray-800 focus:outline-none focus:ring-2 focus:ring-[#16a34a]" />
                      </div>
                      <div>
                        <label className="block text-[10px] font-black text-gray-500 uppercase tracking-wide mb-1">Subtítulo</label>
                        <input value={meta[f.key]?.subtitulo ?? ''} onChange={e => setMetaCampo(f.key, 'subtitulo', e.target.value)}
                          placeholder={f.subtitulo}
                          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-[#16a34a]" />
                      </div>
                    </div>
                    <div>
                      <label className="block text-[10px] font-black text-gray-500 uppercase tracking-wide mb-1">Definición del componente (opcional)</label>
                      <textarea value={meta[f.key]?.definicion ?? ''} onChange={e => setMetaCampo(f.key, 'definicion', e.target.value)}
                        rows={2} placeholder="Explica de qué trata este componente…"
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 leading-relaxed focus:outline-none focus:ring-2 focus:ring-[#16a34a] resize-y" />
                    </div>
                  </div>
                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-wide pt-1">Textos por nivel</p>
                  {NIVELES_LABELS.map((label, i) => (
                    <div key={label}>
                      <label className="flex items-center gap-2 text-[11px] font-black uppercase tracking-wide mb-1"
                        style={{ color: NIVEL_COLOR[i] }}>
                        <span className="w-2.5 h-2.5 rounded-full" style={{ background: NIVEL_COLOR[i] }} />
                        {label}
                      </label>
                      <textarea
                        value={textos[f.key]?.[label] ?? ''}
                        onChange={e => setTexto(f.key, label, e.target.value)}
                        rows={2}
                        placeholder="Escribe la descripción de este nivel…"
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 leading-relaxed focus:outline-none focus:ring-2 focus:ring-[#16a34a] resize-y"
                      />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </section>
        ))}

        <div className="pt-2 pb-8">
          <button onClick={guardar} disabled={guardando || cargando}
            className="w-full flex items-center justify-center gap-2 bg-[#16a34a] hover:bg-[#064e1e] text-white font-black rounded-xl py-3 transition disabled:opacity-60">
            {guardado ? <CheckCircle className="w-5 h-5" /> : <Save className="w-5 h-5" />}
            {guardado ? '¡Guardado!' : guardando ? 'Guardando…' : 'Guardar cambios'}
          </button>
        </div>
      </main>
    </div>
  );
}
