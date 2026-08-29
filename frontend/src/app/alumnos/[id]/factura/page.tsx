'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { getDeportistas, crearSolicitudFactura, getSolicitudesFacturaPorCodigo } from '@/lib/db';
import type { Deportista, FacturaSolicitud } from '@/lib/db';

function getCol(dep: Deportista | null, rx: RegExp): string {
  if (!dep) return '';
  const k = Object.keys(dep._columnas ?? {}).find(k => rx.test(k));
  return k ? dep._columnas[k] : '';
}

const pesoFmt = (v: string) => {
  const n = Number(String(v ?? '').replace(/\D/g, ''));
  return n ? '$' + n.toLocaleString('es-CO') : '';
};

type Form = {
  facturaNombre: string; cedula: string; direccion: string; ciudad: string;
  telefono: string; email: string; detalle: string; valor: string; observacion: string;
};
const FORM_VACIO: Form = {
  facturaNombre: '', cedula: '', direccion: '', ciudad: '',
  telefono: '', email: '', detalle: '', valor: '', observacion: '',
};

export default function SolicitarFacturaPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();

  const [dep, setDep]         = useState<Deportista | null>(null);
  const [hist, setHist]       = useState<FacturaSolicitud[]>([]);
  const [form, setForm]       = useState<Form>(FORM_VACIO);
  const [enviando, setEnviando] = useState(false);
  const [ok, setOk]           = useState(false);
  const [cargando, setCargando] = useState(true);

  const codigo = getCol(dep, /^c[oó]d/i);
  const nombreDep = dep?._nombre ?? '';

  // Cargar deportista
  useEffect(() => {
    if (!id) return;
    getDeportistas().then(lista => {
      const d = lista.find(x => x.id === id) ?? null;
      setDep(d);
    }).finally(() => setCargando(false));
  }, [id]);

  // Cargar historial y precargar datos personales del último
  useEffect(() => {
    if (!codigo) return;
    getSolicitudesFacturaPorCodigo(codigo).then(rows => {
      setHist(rows);
      const u = rows[0];
      if (u) {
        setForm(f => ({
          ...f,
          facturaNombre: f.facturaNombre || u.facturaNombre,
          cedula:        f.cedula        || u.cedula,
          direccion:     f.direccion     || u.direccion,
          ciudad:        f.ciudad        || u.ciudad,
          telefono:      f.telefono      || u.telefono,
          email:         f.email         || u.email,
        }));
      }
    });
  }, [codigo]);

  const set = (k: keyof Form, v: string) => setForm(f => ({ ...f, [k]: v }));

  async function enviar() {
    if (!form.facturaNombre.trim() || !form.cedula.trim()) {
      alert('Ingresa al menos el nombre a facturar y la cédula/NIT.');
      return;
    }
    if (!form.detalle.trim() || !form.valor.trim()) {
      alert('Ingresa el detalle a facturar y el valor.');
      return;
    }
    setEnviando(true);
    const okCrear = await crearSolicitudFactura({
      deportistaId: String(id ?? ''),
      codigo,
      nombreDeportista: nombreDep,
      ...form,
    });
    setEnviando(false);
    if (!okCrear) { alert('No se pudo enviar la solicitud. Intenta de nuevo.'); return; }
    setOk(true);
    // limpiar solo el detalle a facturar (los datos personales se conservan)
    setForm(f => ({ ...f, detalle: '', valor: '', observacion: '' }));
    const rows = await getSolicitudesFacturaPorCodigo(codigo);
    setHist(rows);
    setTimeout(() => setOk(false), 2600);
  }

  const inputCls = 'w-full rounded-xl px-3 py-2.5 text-sm outline-none';
  const inputStyle: React.CSSProperties = { background: '#0f172a', border: '1px solid rgba(255,255,255,0.12)', color: '#fff' };
  const labelCls = 'block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1';

  return (
    <div className="min-h-screen bg-black">
      <header className="bg-gradient-to-r from-[#064e1e] via-[#052a10] to-black px-4 py-4 flex items-center gap-3 sticky top-0 z-20">
        <button onClick={() => router.back()} className="text-white/70 hover:text-white transition"><ArrowLeft className="w-5 h-5" /></button>
        <div className="flex-1 min-w-0">
          <h1 className="text-white font-black text-lg leading-tight">Solicita tu factura</h1>
          <p className="text-white/60 text-xs">Área de Pagos · Futuro Antioquia</p>
        </div>
        <div className="text-right leading-tight flex-shrink-0">
          <p className="text-white font-black text-sm tracking-widest">MAX 10 SPORT</p>
          <p className="text-white/75 text-[9px] font-semibold tracking-wide">CONECTA · GESTIONA · GANA</p>
        </div>
      </header>

      <main className="max-w-xl mx-auto px-3 py-4 space-y-4">
        {cargando ? (
          <p className="text-center text-gray-400 py-10">Cargando…</p>
        ) : !dep ? (
          <p className="text-center text-gray-400 py-10">No se encontró el deportista.</p>
        ) : (
          <>
            {/* Deportista (automático) */}
            <div className="rounded-2xl border border-white/10 p-4" style={{ background: 'linear-gradient(150deg,#0c3d1c,#052a10)' }}>
              <p className="text-[10px] font-black text-white/50 uppercase tracking-widest mb-2">Deportista</p>
              <div className="flex items-center gap-3">
                <span className="bg-[#16a34a] text-white font-black text-lg px-3 py-1.5 rounded-xl">{codigo || '—'}</span>
                <span className="text-white font-black text-base uppercase">{nombreDep}</span>
              </div>
            </div>

            {ok && (
              <div className="rounded-xl px-4 py-3 text-sm font-bold text-center" style={{ background: '#dcfce7', color: '#166534' }}>
                ✅ ¡Solicitud enviada! Tu factura quedó pendiente. Te la haremos llegar pronto.
              </div>
            )}

            {/* Formulario */}
            <div className="rounded-2xl border border-white/10 p-4" style={{ background: '#111814' }}>
              <p className="text-white font-black text-sm mb-1">Datos de facturación</p>
              <p className="text-white/50 text-[11px] mb-4">Tus datos personales quedan guardados para la próxima vez.</p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2">
                  <label className={labelCls}>Nombre completo a quien se factura</label>
                  <input className={inputCls} style={inputStyle} value={form.facturaNombre} onChange={e => set('facturaNombre', e.target.value)} placeholder="Nombre / Razón social" />
                </div>
                <div>
                  <label className={labelCls}>Cédula / NIT</label>
                  <input className={inputCls} style={inputStyle} value={form.cedula} onChange={e => set('cedula', e.target.value)} inputMode="numeric" placeholder="Ej: 1017…" />
                </div>
                <div>
                  <label className={labelCls}>Teléfono</label>
                  <input className={inputCls} style={inputStyle} value={form.telefono} onChange={e => set('telefono', e.target.value)} inputMode="tel" placeholder="Ej: 300…" />
                </div>
                <div className="sm:col-span-2">
                  <label className={labelCls}>Dirección</label>
                  <input className={inputCls} style={inputStyle} value={form.direccion} onChange={e => set('direccion', e.target.value)} placeholder="Dirección" />
                </div>
                <div>
                  <label className={labelCls}>Ciudad</label>
                  <input className={inputCls} style={inputStyle} value={form.ciudad} onChange={e => set('ciudad', e.target.value)} placeholder="Ciudad" />
                </div>
                <div>
                  <label className={labelCls}>Email</label>
                  <input className={inputCls} style={inputStyle} value={form.email} onChange={e => set('email', e.target.value)} inputMode="email" placeholder="correo@ejemplo.com" />
                </div>

                <div className="sm:col-span-2 h-px bg-white/10 my-1" />

                <div className="sm:col-span-2">
                  <label className={labelCls}>Detalle a facturar</label>
                  <input className={inputCls} style={inputStyle} value={form.detalle} onChange={e => set('detalle', e.target.value)} placeholder="Ej: Mensualidad julio 2026" />
                </div>
                <div>
                  <label className={labelCls}>Valor</label>
                  <input className={inputCls} style={inputStyle} value={form.valor} onChange={e => set('valor', e.target.value)} inputMode="numeric" placeholder="$" />
                </div>
                <div>
                  <label className={labelCls}>Observación</label>
                  <input className={inputCls} style={inputStyle} value={form.observacion} onChange={e => set('observacion', e.target.value)} placeholder="Opcional" />
                </div>
              </div>

              <button onClick={enviar} disabled={enviando}
                className="w-full mt-4 rounded-2xl py-3.5 font-black text-white transition active:scale-95"
                style={{ background: enviando ? '#6b7280' : '#7c3aed' }}>
                {enviando ? 'Enviando…' : 'Enviar solicitud de factura'}
              </button>
            </div>

            {/* Historial */}
            <div className="rounded-2xl border border-white/10 p-4" style={{ background: '#111814' }}>
              <p className="text-white font-black text-sm mb-3">Mis solicitudes ({hist.length})</p>
              {hist.length === 0 ? (
                <p className="text-white/40 text-sm text-center py-4">Aún no has solicitado facturas.</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {hist.map(h => (
                    <div key={h.id} className="rounded-xl p-3 border border-white/10" style={{ background: '#0f172a' }}>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-white font-bold text-sm">{h.detalle || '—'}</span>
                        <span className="text-white font-black text-sm">{pesoFmt(h.valor)}</span>
                      </div>
                      <div className="flex items-center justify-between gap-2 mt-1">
                        <span className="text-white/50 text-[11px]">{(h.createdAt || '').slice(0, 10)}</span>
                        <span className="text-[10px] font-black px-2 py-0.5 rounded-full"
                          style={ h.estado === 'OK'
                            ? { background: '#16a34a', color: '#fff' }
                            : { background: '#fef3c7', color: '#92400e' } }>
                          {h.estado === 'OK' ? 'FACTURADA' : 'PENDIENTE'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
