'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, FileText, Check, RefreshCw } from 'lucide-react';
import { getSolicitudesFacturaPendientes, marcarFacturaOk } from '@/lib/db';
import type { FacturaSolicitud } from '@/lib/db';

const peso = (v: string) => {
  const n = Number(String(v ?? '').replace(/\D/g, ''));
  return n ? '$' + n.toLocaleString('es-CO') : '—';
};

export default function FacturasPendientesPage() {
  const router = useRouter();
  const [rows, setRows]       = useState<FacturaSolicitud[]>([]);
  const [cargando, setCargando] = useState(true);
  const [marcando, setMarcando] = useState<string | null>(null);

  function cargar() {
    setCargando(true);
    getSolicitudesFacturaPendientes().then(setRows).finally(() => setCargando(false));
  }
  useEffect(() => { cargar(); }, []);

  async function darOk(f: FacturaSolicitud) {
    if (!window.confirm(`¿Marcar como FACTURADA la solicitud de "${f.facturaNombre}" (${peso(f.valor)})?\nDesaparecerá del listado de pendientes.`)) return;
    setMarcando(f.id);
    const ok = await marcarFacturaOk(f.id);
    setMarcando(null);
    if (ok) setRows(prev => prev.filter(r => r.id !== f.id));
    else alert('No se pudo marcar. Intenta de nuevo.');
  }

  const th: React.CSSProperties = { background: '#16a34a', color: '#fff', border: '1px solid #fff', padding: '9px 10px', fontSize: 10, fontWeight: 900, letterSpacing: '0.04em', whiteSpace: 'nowrap', textAlign: 'left' };
  const td: React.CSSProperties = { border: '1px solid #fff', padding: '8px 10px', fontSize: 12, color: '#111827', whiteSpace: 'nowrap' };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-gradient-to-r from-[#064e1e] to-[#22c55e] px-4 sm:px-6 py-4 flex items-center gap-3 sticky top-0 z-20">
        <button onClick={() => router.push('/dashboard')} className="text-white/80 hover:text-white transition"><ArrowLeft className="w-5 h-5" /></button>
        <FileText className="w-6 h-6 text-white" />
        <div className="flex-1">
          <h1 className="text-white font-black text-lg leading-tight">Facturas Pendientes</h1>
          <p className="text-white/70 text-xs">Solicitudes de factura de los acudientes</p>
        </div>
        <div className="flex items-center gap-2 bg-white/15 rounded-xl px-3 py-1.5">
          <span className="text-white font-black text-lg">{rows.length}</span>
          <span className="text-white/80 text-[11px] font-bold">pendientes</span>
        </div>
        <button onClick={cargar} title="Actualizar" className="ml-2 text-white/80 hover:text-white transition"><RefreshCw className="w-4 h-4" /></button>
      </header>

      <main className="px-3 py-4">
        {cargando ? (
          <p className="text-center text-gray-400 py-16">Cargando…</p>
        ) : rows.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-16 text-center">
            <FileText className="w-14 h-14 text-gray-200 mx-auto mb-3" />
            <p className="text-gray-400 font-semibold">No hay facturas pendientes.</p>
          </div>
        ) : (
          <div className="overflow-auto rounded-2xl shadow-sm border border-gray-200 bg-white" style={{ maxHeight: 'calc(100vh - 150px)' }}>
            <table className="border-collapse text-sm" style={{ minWidth: 1200 }}>
              <thead className="sticky top-0 z-10">
                <tr>
                  {['FECHA', 'CÓDIGO', 'DEPORTISTA', 'A FACTURAR', 'CÉDULA / NIT', 'DIRECCIÓN', 'CIUDAD', 'TELÉFONO', 'EMAIL', 'DETALLE', 'VALOR', 'OBSERVACIÓN', ''].map((h, i) => (
                    <th key={i} style={th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((f, i) => (
                  <tr key={f.id} style={{ background: i % 2 ? '#f8fafc' : '#fff' }}>
                    <td style={td}>{(f.createdAt || '').slice(0, 10)}</td>
                    <td style={{ ...td, fontWeight: 900, textAlign: 'center', background: '#16a34a', color: '#fff' }}>{f.codigo || '—'}</td>
                    <td style={{ ...td, fontWeight: 700 }}>{f.nombreDeportista || '—'}</td>
                    <td style={{ ...td, fontWeight: 700 }}>{f.facturaNombre || '—'}</td>
                    <td style={td}>{f.cedula || '—'}</td>
                    <td style={{ ...td, whiteSpace: 'normal', minWidth: 160 }}>{f.direccion || '—'}</td>
                    <td style={td}>{f.ciudad || '—'}</td>
                    <td style={td}>{f.telefono || '—'}</td>
                    <td style={td}>{f.email || '—'}</td>
                    <td style={{ ...td, whiteSpace: 'normal', minWidth: 160 }}>{f.detalle || '—'}</td>
                    <td style={{ ...td, fontWeight: 900, textAlign: 'right' }}>{peso(f.valor)}</td>
                    <td style={{ ...td, whiteSpace: 'normal', minWidth: 150, color: '#6b7280' }}>{f.observacion || '—'}</td>
                    <td style={{ ...td, textAlign: 'center' }}>
                      <button onClick={() => darOk(f)} disabled={marcando === f.id}
                        className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 font-black text-[11px] text-white transition active:scale-95"
                        style={{ background: marcando === f.id ? '#9ca3af' : '#16a34a' }}>
                        <Check className="w-3.5 h-3.5" /> {marcando === f.id ? '…' : 'OK'}
                      </button>
                    </td>
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
