'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Star, Save, FileSpreadsheet } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Deportista } from '@/lib/deportistas';
import { DEPORTISTAS_KEY } from '@/lib/deportistas';

const CRITERIOS_TECNICOS = [
  { key: 'tecnica',    label: 'Técnica con balón'   },
  { key: 'tactica',    label: 'Comprensión táctica' },
  { key: 'fisico',     label: 'Condición física'    },
  { key: 'velocidad',  label: 'Velocidad/Agilidad'  },
  { key: 'remate',     label: 'Remate a portería'   },
];

const CRITERIOS_FORMATIVOS = [
  { key: 'actitud',    label: 'Actitud y esfuerzo'  },
  { key: 'compañerismo',label: 'Compañerismo'        },
  { key: 'disciplina', label: 'Disciplina'           },
  { key: 'puntualidad',label: 'Puntualidad'          },
];

function EstrellaRating({ valor, onChange }: { valor: number; onChange: (n: number) => void }) {
  const [hover, setHover] = useState(0);
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
        <button
          key={n}
          onClick={() => onChange(n)}
          onMouseEnter={() => setHover(n)}
          onMouseLeave={() => setHover(0)}
          className={cn(
            'w-6 h-6 rounded text-xs font-bold border transition',
            (hover || valor) >= n
              ? 'bg-[#16a34a] border-[#16a34a] text-white'
              : 'bg-gray-100 border-gray-200 text-gray-400'
          )}
        >
          {n}
        </button>
      ))}
    </div>
  );
}

export default function EvaluacionesPage() {
  const router = useRouter();
  const [alumnos, setAlumnos]     = useState<Pick<Deportista, 'id'|'nombre'|'apellido'|'categoria'>[]>([]);
  const [alumnoId, setAlumnoId]   = useState('');
  const [notas, setNotas]         = useState<Record<string, number>>({});
  const [notas2, setNotas2]       = useState<Record<string, number>>({});
  const [observaciones, setObs]   = useState('');
  const [guardado, setGuardado]   = useState(false);
  const [seccion, setSeccion]     = useState<'tecnica' | 'formativa'>('tecnica');

  useEffect(() => {
    try {
      const guardados = localStorage.getItem(DEPORTISTAS_KEY);
      if (guardados) {
        const lista = JSON.parse(guardados) as Deportista[];
        setAlumnos(lista);
        if (lista.length > 0) setAlumnoId(lista[0].id);
      }
    } catch {}
  }, []);

  const alumno = alumnos.find((a) => a.id === alumnoId);

  const promTecnico   = CRITERIOS_TECNICOS.length
    ? (CRITERIOS_TECNICOS.reduce((s, c) => s + (notas[c.key] ?? 0), 0) / CRITERIOS_TECNICOS.length).toFixed(1)
    : '—';
  const promFormativo = CRITERIOS_FORMATIVOS.length
    ? (CRITERIOS_FORMATIVOS.reduce((s, c) => s + (notas2[c.key] ?? 0), 0) / CRITERIOS_FORMATIVOS.length).toFixed(1)
    : '—';

  function guardar() {
    setGuardado(true);
    setTimeout(() => setGuardado(false), 2500);
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-gradient-to-r from-[#064e1e] to-[#22c55e] px-6 py-4 flex items-center justify-between sticky top-0 z-10 shadow-sm">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push('/dashboard')} className="text-white/70 hover:text-white">← Volver</button>
          <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center">
            <Star className="w-4 h-4 text-white" />
          </div>
          <span className="font-bold text-white">Evaluaciones</span>
        </div>
        <button
          onClick={guardar}
          className={cn(
            'flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition',
            guardado ? 'bg-white/30 text-white' : 'bg-white text-[#16a34a] hover:bg-green-50'
          )}
        >
          <Save className="w-4 h-4" />
          {guardado ? '¡Guardado!' : 'Guardar'}
        </button>
        <div className="ml-auto text-right leading-tight">
          <p className="text-white font-black text-sm tracking-widest">MAX 10 SPORT</p>
          <p className="text-white/60 text-[11px]">Conecta, Gestiona, Gana</p>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 sm:px-6 py-6 space-y-4">

        {/* Selector alumno */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <p className="text-xs text-gray-500 font-semibold uppercase tracking-wider mb-2">Alumno</p>
          {alumnos.length === 0 ? (
            <div className="text-center py-4">
              <p className="text-sm text-gray-400 mb-3">No hay deportistas cargados</p>
              <button
                onClick={() => router.push('/alumnos/importar')}
                className="inline-flex items-center gap-2 bg-[#16a34a] text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-[#064e1e] transition"
              >
                <FileSpreadsheet className="w-4 h-4" /> Importar Excel
              </button>
            </div>
          ) : (
            <select
              value={alumnoId}
              onChange={(e) => { setAlumnoId(e.target.value); setNotas({}); setNotas2({}); }}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#16a34a]"
            >
              {alumnos.map((a) => (
                <option key={a.id} value={a.id}>{a.nombre} {a.apellido} — {a.categoria}</option>
              ))}
            </select>
          )}
        </div>

        {/* Promedios */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 text-center">
            <p className="text-xs text-gray-500 font-semibold uppercase tracking-wider">Técnico</p>
            <p className="text-3xl font-bold text-[#16a34a] mt-1">{promTecnico}</p>
            <p className="text-xs text-gray-400">de 10</p>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 text-center">
            <p className="text-xs text-gray-500 font-semibold uppercase tracking-wider">Formativo</p>
            <p className="text-3xl font-bold text-[#16a34a] mt-1">{promFormativo}</p>
            <p className="text-xs text-gray-400">de 10</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="flex border-b border-gray-100">
            {(['tecnica', 'formativa'] as const).map((s) => (
              <button
                key={s}
                onClick={() => setSeccion(s)}
                className={cn(
                  'flex-1 py-3 text-sm font-semibold transition',
                  seccion === s
                    ? 'bg-[#16a34a] text-white'
                    : 'text-gray-500 hover:bg-gray-50'
                )}
              >
                {s === 'tecnica' ? 'Evaluación Técnica' : 'Evaluación Formativa'}
              </button>
            ))}
          </div>

          <div className="p-4 space-y-5">
            {seccion === 'tecnica'
              ? CRITERIOS_TECNICOS.map((c) => (
                <div key={c.key}>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-semibold text-gray-700">{c.label}</p>
                    <span className="text-sm font-bold text-[#16a34a]">{notas[c.key] ?? '—'}</span>
                  </div>
                  <EstrellaRating
                    valor={notas[c.key] ?? 0}
                    onChange={(n) => setNotas((p) => ({ ...p, [c.key]: n }))}
                  />
                </div>
              ))
              : CRITERIOS_FORMATIVOS.map((c) => (
                <div key={c.key}>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-semibold text-gray-700">{c.label}</p>
                    <span className="text-sm font-bold text-[#16a34a]">{notas2[c.key] ?? '—'}</span>
                  </div>
                  <EstrellaRating
                    valor={notas2[c.key] ?? 0}
                    onChange={(n) => setNotas2((p) => ({ ...p, [c.key]: n }))}
                  />
                </div>
              ))
            }
          </div>
        </div>

        {/* Observaciones */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <p className="text-sm font-semibold text-gray-700 mb-2">Observaciones del entrenador</p>
          <textarea
            value={observaciones}
            onChange={(e) => setObs(e.target.value)}
            placeholder="Escribe tus comentarios sobre el desempeño del alumno..."
            rows={4}
            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#16a34a] resize-none"
          />
        </div>
      </main>
    </div>
  );
}
