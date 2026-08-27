'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, FileCheck, RefreshCw, Search } from 'lucide-react';
import { getCertificadosLog } from '@/lib/db';
import type { CertDescarga } from '@/lib/db';

type Fila = { codigo: string; nombre: string; veces: number; ultima: string };

export default function CertificadosPage() {
  const router = useRouter();
  const [log, setLog]         = useState<CertDescarga[]>([]);
  const [cargando, setCargando] = useState(true);
  const [q, setQ]             = useState('');

  function cargar() {
    setCargando(true);
    getCertificadosLog().then(setLog).finally(() => setCargando(false));
  }
  useEffect(() => { cargar(); }, []);

  // Agrupar por código: un deportista por fila, con nº de descargas y última fecha
  const filas = useMemo<Fila[]>(() => {
    const map = new Map<string, Fila>();
    for (const r of log) {
      const key = (r.codigo || r.deportistaId || r.nombre).trim();
      const prev = map.get(key);
      if (prev) {
        prev.veces += 1;
        if (r.createdAt > prev.ultima) prev.ultima = r.createdAt;
      } else {
        map.set(key, { codigo: r.codigo, nombre: r.nombre, veces: 1, ultima: r.createdAt });
      }
    }
    return Array.from(map.values()).sort((a, b) => (b.ultima || '').localeCompare(a.ultima || ''));
  }, [log]);

  const filtradas = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return filas;
    return filas.filter(f => f.nombre.toLowerCase().includes(t) || f.codigo.toLowerCase().includes(t));
  }, [filas, q]);

  const totalDescargas = log.length;
  const totalDeportistas = filas.length;

  const th: React.CSSProperties = { background: '#0d9488', color: '#fff', border: '1px solid #fff', padding: '9px 12px', fontSize: 11, fontWeight: 900, letterSpacing: '0.04em', textAlign: 'left', whiteSpace: 'nowrap' };
  const td: React.CSSProperties = { border: '1px solid #fff', padding: '8px 12px', fontSize: 13, color: '#111827' };

  return (
    <div className="min-h-screen bg-[#333F50]">
      <header className="bg-gradient-to-r from-[#0f766e] to-[#14b8a6] px-4 sm:px-6 py-4 flex items-center gap-3 sticky top-0 z-20">
        <button onClick={() => router.push('/dashboard')} className="text-white/80 hover:text-white transition"><ArrowLeft className="w-5 h-5" /></button>
        <FileCheck className="w-6 h-6 text-white" />
        <div className="flex-1">
          <h1 className="text-white font-black text-lg leading-tight">Certificados de Asistencia</h1>
          <p className="text-white/70 text-xs">Deportistas que descargaron su certificado</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="text-center bg-white/15 rounded-xl px-3 py-1.5">
            <p className="text-white font-black text-lg leading-none">{totalDescargas}</p>
            <p className="text-white/80 text-[10px] font-bold">descargas</p>
          </div>
          <div className="text-center bg-white/15 rounded-xl px-3 py-1.5">
            <p className="text-white font-black text-lg leading-none">{totalDeportistas}</p>
            <p className="text-white/80 text-[10px] font-bold">deportistas</p>
          </div>
          <button onClick={cargar} title="Actualizar" className="ml-1 text-white/80 hover:text-white transition"><RefreshCw className="w-4 h-4" /></button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-3 py-4">
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar por nombre o código…"
            className="w-full border border-[#4A5568] rounded-xl pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400 bg-[#3C4759]" />
        </div>

        {cargando ? (
          <p className="text-center text-white/40 py-16">Cargando…</p>
        ) : filtradas.length === 0 ? (
          <div className="bg-[#3C4759] rounded-2xl border border-[#4A5568] shadow-sm p-16 text-center">
            <FileCheck className="w-14 h-14 text-white/40 mx-auto mb-3" />
            <p className="text-white/40 font-semibold">
              {log.length === 0 ? 'Aún nadie ha descargado el certificado de asistencia.' : 'Sin resultados para la búsqueda.'}
            </p>
          </div>
        ) : (
          <div className="overflow-auto rounded-2xl shadow-sm border border-[#4A5568] bg-[#3C4759]">
            <table className="w-full border-collapse text-sm">
              <thead className="sticky top-0 z-10">
                <tr>
                  <th style={{ ...th, width: 40, textAlign: 'center' }}>#</th>
                  <th style={{ ...th, textAlign: 'center' }}>CÓDIGO</th>
                  <th style={th}>DEPORTISTA</th>
                  <th style={{ ...th, textAlign: 'center' }}>VECES</th>
                  <th style={th}>ÚLTIMA DESCARGA</th>
                </tr>
              </thead>
              <tbody>
                {filtradas.map((f, i) => (
                  <tr key={f.codigo + i} style={{ background: i % 2 ? '#f8fafc' : '#fff' }}>
                    <td style={{ ...td, textAlign: 'center', color: '#6b7280', fontSize: 11 }}>{i + 1}</td>
                    <td style={{ ...td, textAlign: 'center', fontWeight: 900, background: '#0d9488', color: '#fff' }}>{f.codigo || '—'}</td>
                    <td style={{ ...td, fontWeight: 700 }}>{f.nombre || '—'}</td>
                    <td style={{ ...td, textAlign: 'center', fontWeight: 900, color: '#0d9488' }}>{f.veces}</td>
                    <td style={td}>{(f.ultima || '').replace('T', ' ').slice(0, 16)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}
