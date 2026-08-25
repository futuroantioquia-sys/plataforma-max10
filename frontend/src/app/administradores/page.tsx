'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Plus, Save, Trash2, Eye, EyeOff, UserCog, ShieldCheck, DollarSign, Dumbbell, KeyRound, X } from 'lucide-react';
import { useAuthStore } from '@/store/auth.store';
import { getAdmins, saveAdmin, deleteAdmin, type Admin } from '@/lib/db';

function uuid(): string {
  try { if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID(); } catch {}
  return 'adm-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

const TIPO_INFO: Record<string, { label: string; desc: string; color: string; icono: any }> = {
  // ACCESO TOTAL — agregado el 25/08/2026. Entra a todo, Finanzas incluida.
  // Lo único que NO puede es esta pantalla: crear o borrar administradores
  // sigue siendo exclusivo de ADMON.
  total:        { label: 'Acceso total',  desc: 'Entra a TODO, Finanzas incluida · no gestiona administradores', color: '#D6409F', icono: KeyRound },
  contabilidad: { label: 'Contabilidad',  desc: 'Edita solo Finanzas · el resto lo ve en solo lectura',           color: '#2563eb', icono: DollarSign },
  deportivo:    { label: 'Deportivo',     desc: 'Todo EXCEPTO Finanzas (se le oculta)',                           color: '#16a34a', icono: Dumbbell },
};

/** Las tres opciones del desplegable, en un solo lugar. */
const OPCIONES_TIPO: { valor: 'total' | 'contabilidad' | 'deportivo'; texto: string }[] = [
  { valor: 'total',        texto: 'Acceso total (todo, Finanzas incluida)' },
  { valor: 'deportivo',    texto: 'Deportivo (todo menos Finanzas)' },
  { valor: 'contabilidad', texto: 'Contabilidad (solo Finanzas · resto solo lectura)' },
];

export default function AdministradoresPage() {
  const router = useRouter();
  const usuario = useAuthStore(s => s.usuario);

  const [lista, setLista]       = useState<Admin[]>([]);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState<string | null>(null);
  const [msg, setMsg]           = useState<string | null>(null);
  const [verClave, setVerClave] = useState<Record<string, boolean>>({});
  const [creando, setCreando]   = useState(false);
  const [nuevo, setNuevo]       = useState<Admin>({ id: '', usuario: '', clave: '', nombre: '', tipo: 'deportivo' });

  // Guard cliente (el middleware ya bloquea, esto es refuerzo)
  useEffect(() => {
    if (usuario && usuario.rol !== 'administracion') router.replace('/dashboard');
  }, [usuario, router]);

  useEffect(() => { recargar(); }, []);

  async function recargar() {
    setCargando(true);
    const a = await getAdmins();
    setLista(a);
    setCargando(false);
  }

  function editar(id: string, campo: keyof Admin, valor: string) {
    setLista(prev => prev.map(a => a.id === id ? { ...a, [campo]: valor } : a));
  }

  async function guardar(a: Admin) {
    // La contraseña ya no se muestra: si se deja vacía, se conserva la actual (no se borra).
    if (!a.usuario.trim()) { flash('El usuario es obligatorio'); return; }
    setGuardando(a.id);
    const r = await saveAdmin(a);
    setGuardando(null);
    flash(r.ok ? 'Guardado ✓' : ('Error: ' + (r.msg || 'no se pudo guardar')));
    if (r.ok) recargar();
  }

  async function eliminar(a: Admin) {
    if (a.id === 'diana') { flash('Diana no se puede eliminar (puedes editarla).'); return; }
    if (typeof window !== 'undefined' && !window.confirm(`¿Eliminar al administrador "${a.nombre || a.usuario}"?`)) return;
    setGuardando(a.id);
    const r = await deleteAdmin(a.id);
    setGuardando(null);
    flash(r.ok ? 'Eliminado ✓' : ('Error: ' + (r.msg || 'no se pudo eliminar')));
    if (r.ok) recargar();
  }

  async function crear() {
    if (!nuevo.usuario.trim() || !nuevo.clave.trim()) { flash('Usuario y contraseña son obligatorios'); return; }
    const a: Admin = { ...nuevo, id: uuid(), usuario: nuevo.usuario.trim().toUpperCase() };
    setGuardando('nuevo');
    const r = await saveAdmin(a);
    setGuardando(null);
    if (r.ok) {
      setCreando(false);
      setNuevo({ id: '', usuario: '', clave: '', nombre: '', tipo: 'deportivo' });
      flash('Administrador creado ✓');
      recargar();
    } else {
      flash('Error: ' + (r.msg || 'no se pudo crear'));
    }
  }

  function flash(t: string) { setMsg(t); setTimeout(() => setMsg(null), 3000); }

  const inputCls = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-semibold text-gray-800 focus:outline-none focus:ring-2 focus:ring-green-500';
  const labelCls = 'text-[10px] font-black text-gray-400 uppercase tracking-widest';

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-gradient-to-r from-[#333F50] to-[#0EA142] px-4 sm:px-6 py-4 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push('/dashboard')}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-white/70 hover:bg-white/20 transition">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center">
            <UserCog className="w-4 h-4 text-white" />
          </div>
          <div>
            <h1 className="font-black text-white text-base sm:text-lg leading-tight">Administradores</h1>
            <p className="text-white/60 text-xs">Crear y editar accesos de administración</p>
          </div>
        </div>
        <button onClick={() => setCreando(true)}
          className="flex items-center gap-2 bg-white text-green-700 px-4 py-2 rounded-xl text-sm font-black hover:bg-green-50 transition shadow-sm">
          <Plus className="w-4 h-4" /> Nuevo admin
        </button>
      </header>

      {msg && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 bg-gray-900 text-white text-sm font-bold px-5 py-2.5 rounded-full shadow-lg">
          {msg}
        </div>
      )}

      <main className="max-w-4xl mx-auto px-3 sm:px-6 py-6 space-y-4">

        {/* Explicación de los tipos */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {(['total', 'deportivo', 'contabilidad'] as const).map(t => {
            const info = TIPO_INFO[t]; const Ico = info.icono;
            return (
              <div key={t} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex items-start gap-3">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: info.color + '1a', color: info.color }}>
                  <Ico className="w-5 h-5" />
                </div>
                <div>
                  <p className="font-black text-gray-800 text-sm">Administrador {info.label}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{info.desc}</p>
                </div>
              </div>
            );
          })}
        </div>

        {/* Nota ADMON */}
        <div className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-amber-600 flex-shrink-0" />
          <p className="text-xs text-amber-800 font-semibold">
            Un administrador de <strong>acceso total</strong> entra a toda la plataforma, Finanzas incluida.
            Lo único reservado al super-administrador (ADMON) es <strong>esta pantalla</strong>: crear, editar
            o eliminar administradores. ADMON no se edita desde aquí.
          </p>
        </div>

        {/* Lista de administradores */}
        {cargando ? (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-12 text-center text-gray-400 font-semibold text-sm">Cargando…</div>
        ) : lista.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-12 text-center text-gray-400 font-semibold text-sm">
            No hay administradores creados. Usa “Nuevo admin”.
          </div>
        ) : lista.map(a => {
          const info = TIPO_INFO[a.tipo] || TIPO_INFO.deportivo;
          const vis = !!verClave[a.id];
          return (
            <div key={a.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="inline-flex items-center gap-1.5 text-[11px] font-black px-2.5 py-1 rounded-full" style={{ background: info.color + '1a', color: info.color }}>
                  <info.icono className="w-3.5 h-3.5" /> {info.label}
                </span>
                {a.id === 'diana' && <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Diana</span>}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Nombre</label>
                  <input value={a.nombre} onChange={e => editar(a.id, 'nombre', e.target.value)} className={inputCls} placeholder="Nombre visible" />
                </div>
                <div>
                  <label className={labelCls}>Usuario (para entrar)</label>
                  <input value={a.usuario} onChange={e => editar(a.id, 'usuario', e.target.value.toUpperCase())} className={inputCls} placeholder="USUARIO" />
                </div>
                <div>
                  <label className={labelCls}>Contraseña</label>
                  <div className="relative">
                    <input type={vis ? 'text' : 'password'} value={a.clave} onChange={e => editar(a.id, 'clave', e.target.value)} className={inputCls + ' pr-9'} placeholder="•••• (vacío = no cambiar)" title="Por seguridad la contraseña no se muestra. Escribe una nueva solo si quieres cambiarla." />
                    <button type="button" onClick={() => setVerClave(p => ({ ...p, [a.id]: !p[a.id] }))}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700">
                      {vis ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <div>
                  <label className={labelCls}>Tipo de administrador</label>
                  <select value={a.tipo} onChange={e => editar(a.id, 'tipo', e.target.value)} className={inputCls}>
                    {OPCIONES_TIPO.map(o => <option key={o.valor} value={o.valor}>{o.texto}</option>)}
                  </select>
                </div>
              </div>
              <div className="flex items-center gap-2 mt-3">
                <button onClick={() => guardar(a)} disabled={guardando === a.id}
                  className="flex items-center gap-1.5 bg-[#16a34a] text-white text-sm font-black px-4 py-2 rounded-xl hover:bg-[#064e1e] transition disabled:opacity-60">
                  <Save className="w-4 h-4" /> {guardando === a.id ? 'Guardando…' : 'Guardar'}
                </button>
                {a.id !== 'diana' && (
                  <button onClick={() => eliminar(a)} disabled={guardando === a.id}
                    className="flex items-center gap-1.5 border border-red-200 text-red-500 text-sm font-black px-3 py-2 rounded-xl hover:bg-red-50 transition disabled:opacity-60">
                    <Trash2 className="w-4 h-4" /> Eliminar
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </main>

      {/* Modal: nuevo administrador */}
      {creando && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setCreando(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-black text-gray-900 text-lg">Nuevo administrador</h2>
              <button onClick={() => setCreando(false)} className="text-gray-400 hover:text-gray-700"><X className="w-5 h-5" /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className={labelCls}>Nombre</label>
                <input value={nuevo.nombre} onChange={e => setNuevo(p => ({ ...p, nombre: e.target.value }))} className={inputCls} placeholder="Nombre y apellido" />
              </div>
              <div>
                <label className={labelCls}>Usuario (para entrar)</label>
                <input value={nuevo.usuario} onChange={e => setNuevo(p => ({ ...p, usuario: e.target.value.toUpperCase() }))} className={inputCls} placeholder="USUARIO" />
              </div>
              <div>
                <label className={labelCls}>Contraseña</label>
                <input value={nuevo.clave} onChange={e => setNuevo(p => ({ ...p, clave: e.target.value }))} className={inputCls} placeholder="Contraseña" />
              </div>
              <div>
                <label className={labelCls}>Tipo de administrador</label>
                <select value={nuevo.tipo} onChange={e => setNuevo(p => ({ ...p, tipo: e.target.value as Admin['tipo'] }))} className={inputCls}>
                  {OPCIONES_TIPO.map(o => <option key={o.valor} value={o.valor}>{o.texto}</option>)}
                </select>
                <p className="text-[11px] text-gray-500 mt-1 leading-snug">{TIPO_INFO[nuevo.tipo]?.desc}</p>
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <button onClick={() => setCreando(false)} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-bold text-gray-500 hover:bg-gray-50 transition">Cancelar</button>
              <button onClick={crear} disabled={guardando === 'nuevo'}
                className="flex-1 py-2.5 rounded-xl bg-[#16a34a] text-white text-sm font-black hover:bg-[#064e1e] transition disabled:opacity-60">
                {guardando === 'nuevo' ? 'Creando…' : 'Crear'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
