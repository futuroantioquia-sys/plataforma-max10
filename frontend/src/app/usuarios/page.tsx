'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Plus, Trash2, Save, Eye, EyeOff, Users, Camera } from 'lucide-react';
import { getProfes, saveProfes, getDeportistas } from '@/lib/db';
import type { Profe } from '@/lib/db';

function uuid() {
  return crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2);
}

const PROFES_INICIALES: Omit<Profe, 'id'>[] = [
  { usuario: 'CASTRO',   clave: '1214734807', proyectos: [] },
  { usuario: 'MEJIA',    clave: '1152192324', proyectos: [] },
  { usuario: 'RAMIREZ',  clave: '1017258984', proyectos: [] },
  { usuario: 'SAMUEL',   clave: '1000415036', proyectos: [] },
  { usuario: 'TABARES',  clave: '1000084856', proyectos: [] },
  { usuario: 'CHALARCA', clave: '1128389946', proyectos: [] },
  { usuario: 'RIOS',     clave: '1036639022', proyectos: [] },
  { usuario: 'JESUS',    clave: '1003404311', proyectos: [] },
  { usuario: 'MARTIN',   clave: '1013458275', proyectos: [] },
  { usuario: 'MARLON',   clave: '1017192180', proyectos: [] },
  { usuario: 'ALEX',     clave: '1020464354', proyectos: [] },
  { usuario: 'DORIA',    clave: '1003050289', proyectos: [] },
  { usuario: 'MUÑOZ',    clave: '1034776238', proyectos: [] },
  { usuario: 'ALVAREZ',  clave: '1033180115', proyectos: [] },
  { usuario: 'DUVAN',    clave: '1002066215', proyectos: [] },
  { usuario: 'GIRALDO',  clave: '1127792656', proyectos: [] },
  { usuario: 'NICOLAS',  clave: '1005372826', proyectos: [] },
  { usuario: 'KAREN',    clave: '1000870631', proyectos: [] },
  { usuario: 'CAMILA',   clave: '1193081467', proyectos: [] },
  { usuario: 'EDGAR',    clave: '98539787',   proyectos: [] },
  { usuario: 'JIMENEZ',  clave: '1036864427', proyectos: [] },
  { usuario: 'GUZMAN',   clave: '1000203538', proyectos: [] },
];

/* Clave de foto por profe en localStorage */
const fotoKey = (usuario: string) => `futuro-foto-profe-${usuario.toUpperCase()}`;

export default function UsuariosPage() {
  const router   = useRouter();
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const [profes,    setProfes]    = useState<Profe[]>([]);
  const [fotos,     setFotos]     = useState<Record<string, string>>({}); // usuario → base64
  const [proyectos, setProyectos] = useState<string[]>([]);
  const [guardando,  setGuardando]  = useState(false);
  const [guardado,   setGuardado]   = useState(false);
  const [errorGuard, setErrorGuard] = useState('');
  const [claveVis,  setClaveVis]  = useState<Record<string, boolean>>({});
  const [nuevo,     setNuevo]     = useState({ usuario: '', clave: '' });
  const [agregando, setAgregando] = useState(false);

  useEffect(() => {
    getProfes().then(lista => {
      const inicial = lista.length ? lista : PROFES_INICIALES.map(p => ({ ...p, id: uuid() }));
      if (!lista.length) saveProfes(inicial).catch(() => {});
      setProfes(inicial);
      // Cargar fotos: primero desde Supabase (foto field), luego desde localStorage
      const mapa: Record<string, string> = {};
      inicial.forEach(p => {
        // Si el profe tiene foto en Supabase, usarla y sincronizar a localStorage
        if (p.foto) {
          mapa[p.usuario] = p.foto;
          try { localStorage.setItem(fotoKey(p.usuario), p.foto); } catch {}
        } else {
          // Fallback a localStorage
          try { const f = localStorage.getItem(fotoKey(p.usuario)); if (f) mapa[p.usuario] = f; } catch {}
        }
      });
      setFotos(mapa);
    });

    getDeportistas().then(deps => {
      const set = new Set<string>();
      deps.forEach(d => {
        const k = Object.keys(d._columnas).find(c => /proyecto|^proy\b/i.test(c.trim()));
        if (k) { const v = d._columnas[k]?.trim(); if (v) set.add(v); }
      });
      setProyectos([...set].sort((a, b) => {
        const aNum = /^\d/.test(a), bNum = /^\d/.test(b);
        if (aNum && !bNum) return -1; if (!aNum && bNum) return 1;
        return a.localeCompare(b, 'es', { numeric: true });
      }));
    });
  }, []);

  async function guardar() {
    setGuardando(true); setErrorGuard('');
    // Incluir fotos actuales en cada profe antes de guardar
    const profesConFoto = profes.map(p => ({ ...p, foto: fotos[p.usuario] ?? '' }));
    const { ok, msg } = await saveProfes(profesConFoto);
    setGuardando(false);
    if (ok) { setGuardado(true); setTimeout(() => setGuardado(false), 2500); }
    else     { setErrorGuard(msg ?? 'Error desconocido'); setTimeout(() => setErrorGuard(''), 8000); }
  }

  function eliminar(id: string) {
    if (!confirm('¿Eliminar este profe?')) return;
    setProfes(prev => prev.filter(p => p.id !== id));
  }

  function toggleProy(profeId: string, proy: string) {
    setProfes(prev => {
      const yaLoTiene = prev.find(p => p.id === profeId)?.proyectos.includes(proy);
      return prev.map(p => {
        if (p.id === profeId)
          return { ...p, proyectos: yaLoTiene ? p.proyectos.filter(x => x !== proy) : [...p.proyectos, proy] };
        if (!yaLoTiene)
          return { ...p, proyectos: p.proyectos.filter(x => x !== proy) };
        return p;
      });
    });
  }

  function editarCampo(id: string, campo: 'usuario' | 'clave', val: string) {
    setProfes(prev => prev.map(p => p.id === id ? { ...p, [campo]: campo === 'usuario' ? val.toUpperCase() : val } : p));
  }

  function agregarProfe() {
    if (!nuevo.usuario.trim() || !nuevo.clave.trim()) return;
    const p: Profe = { id: uuid(), usuario: nuevo.usuario.trim().toUpperCase(), clave: nuevo.clave.trim(), proyectos: [] };
    setProfes(prev => [...prev, p]);
    setNuevo({ usuario: '', clave: '' });
    setAgregando(false);
  }

  /* Subir foto de profe — redimensiona y comprime antes de guardar */
  function onFotoChange(usuario: string, e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; if (!f) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const img = new Image();
      img.onload = () => {
        // Redimensionar a máximo 220×220 px
        const MAX = 220;
        let { width, height } = img;
        if (width > height) {
          if (width > MAX) { height = Math.round(height * MAX / width); width = MAX; }
        } else {
          if (height > MAX) { width = Math.round(width * MAX / height); height = MAX; }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height;
        canvas.getContext('2d')!.drawImage(img, 0, 0, width, height);
        const b64 = canvas.toDataURL('image/jpeg', 0.75); // JPEG 75% calidad ≈ 10-25 KB
        try {
          localStorage.setItem(fotoKey(usuario), b64);
        } catch {
          alert('Almacenamiento lleno. Borra datos innecesarios e intenta de nuevo.');
          return;
        }
        setFotos(prev => ({ ...prev, [usuario]: b64 }));
      };
      img.src = ev.target?.result as string;
    };
    reader.readAsDataURL(f);
    e.target.value = '';
  }

  function quitarFoto(usuario: string) {
    try { localStorage.removeItem(fotoKey(usuario)); } catch {}
    setFotos(prev => { const n = { ...prev }; delete n[usuario]; return n; });
  }

  const G = '#16a34a';
  const BW = '2px solid white';

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">

      {/* Header */}
      <header className="relative bg-gradient-to-r from-[#064e1e] to-[#22c55e] px-4 py-4 flex items-center gap-3 sticky top-0 z-20 overflow-hidden">
        <div className="absolute inset-0 pointer-events-none select-none" aria-hidden>
          <svg className="absolute inset-0 w-full h-full opacity-[0.10]" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <pattern id="sp-usr" x="0" y="0" width="72" height="72" patternUnits="userSpaceOnUse">
                <circle cx="36" cy="36" r="18" fill="none" stroke="white" strokeWidth="1.2"/>
                <polygon points="36,28 43,33 41,42 31,42 29,33" fill="none" stroke="white" strokeWidth="1.2"/>
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#sp-usr)"/>
          </svg>
        </div>

        <button onClick={() => router.push('/dashboard')} className="relative text-white/70 hover:text-white transition">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="relative flex-1">
          <h1 className="text-white font-black text-lg">Gestión de Usuarios</h1>
          <p className="text-white/60 text-xs">{profes.length} profes registrados</p>
        </div>
        <div className="relative flex items-center gap-2">
          <button onClick={() => setAgregando(true)}
            className="flex items-center gap-1.5 bg-white/20 hover:bg-white/30 text-white text-xs font-bold px-3 py-1.5 rounded-xl transition">
            <Plus className="w-3.5 h-3.5" /> Nuevo profe
          </button>
          <div className="flex flex-col items-end gap-1">
            <button onClick={guardar} disabled={guardando}
              className={`flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-xl transition ${
                guardado ? 'bg-white text-green-700' : errorGuard ? 'bg-red-500 text-white' : 'bg-white/20 hover:bg-white/30 text-white'}`}>
              <Save className="w-3.5 h-3.5" />
              {guardando ? 'Guardando…' : guardado ? '¡Guardado en la nube! ✓' : errorGuard ? 'Error ⚠' : 'Guardar cambios'}
            </button>
            {errorGuard && (
              <span className="text-red-200 text-[10px] max-w-[200px] text-right leading-tight">
                {errorGuard}
              </span>
            )}
          </div>
        </div>
        <div className="relative text-right leading-tight ml-2">
          <p className="text-white font-black text-sm tracking-widest">MAX 10 SPORT</p>
          <p className="text-white/60 text-[11px]">Conecta, Gestiona, Gana</p>
        </div>
      </header>

      {/* Modal nuevo profe */}
      {agregando && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm">
            <h2 className="font-black text-gray-900 text-lg mb-4">Nuevo profe</h2>
            <div className="space-y-3">
              <div>
                <label className="text-[11px] font-black text-gray-400 uppercase tracking-widest">Usuario (apellido)</label>
                <input value={nuevo.usuario} onChange={e => setNuevo(p => ({ ...p, usuario: e.target.value.toUpperCase() }))}
                  placeholder="APELLIDO"
                  className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-green-500" />
              </div>
              <div>
                <label className="text-[11px] font-black text-gray-400 uppercase tracking-widest">Contraseña (cédula)</label>
                <input value={nuevo.clave} onChange={e => setNuevo(p => ({ ...p, clave: e.target.value }))}
                  placeholder="Número de cédula"
                  className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-green-500" />
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <button onClick={() => setAgregando(false)}
                className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-bold text-gray-500 hover:bg-gray-50 transition">Cancelar</button>
              <button onClick={agregarProfe}
                className="flex-1 py-2.5 rounded-xl bg-[#16a34a] text-white text-sm font-bold hover:bg-[#064e1e] transition">Agregar</button>
            </div>
          </div>
        </div>
      )}

      {/* Tabla */}
      <main className="flex-1 overflow-auto px-3 py-4">
        <div className="overflow-auto rounded-2xl shadow-sm border border-gray-200">
          <table className="border-collapse w-full text-sm" style={{ minWidth: 780 }}>
            <thead className="sticky top-0 z-10">
              <tr>
                {['#', 'FOTO', 'USUARIO', 'CONTRASEÑA', 'PROYECTOS ASIGNADOS', ''].map((h, i) => (
                  <th key={i} style={{ background: G, color: 'white', border: BW,
                    padding: '10px 12px', textAlign: i === 0 ? 'center' : 'left',
                    fontSize: 11, fontWeight: 900, letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {profes.map((profe, idx) => (
                <tr key={profe.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>

                  {/* Número */}
                  <td style={{ border: BW, background: G, color: 'white', textAlign: 'center',
                    fontWeight: 900, fontSize: 13, padding: '6px 10px', whiteSpace: 'nowrap' }}>
                    {idx + 1}
                  </td>

                  {/* FOTO */}
                  <td style={{ border: BW, padding: '6px 8px', textAlign: 'center', width: 72 }}>
                    <input
                      type="file" accept="image/*"
                      ref={el => { fileRefs.current[profe.usuario] = el; }}
                      onChange={e => onFotoChange(profe.usuario, e)}
                      className="hidden"
                    />
                    <div className="relative inline-block">
                      {fotos[profe.usuario] ? (
                        <>
                          <img
                            src={fotos[profe.usuario]}
                            alt={profe.usuario}
                            className="w-11 h-11 rounded-full object-cover border-2 border-[#16a34a] cursor-pointer"
                            onClick={() => fileRefs.current[profe.usuario]?.click()}
                            title="Cambiar foto"
                          />
                          <button
                            onClick={() => quitarFoto(profe.usuario)}
                            className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white rounded-full text-[9px] flex items-center justify-center leading-none"
                            title="Quitar foto"
                          >×</button>
                        </>
                      ) : (
                        <button
                          onClick={() => fileRefs.current[profe.usuario]?.click()}
                          className="w-11 h-11 rounded-full bg-gray-100 border-2 border-dashed border-gray-300 hover:border-[#16a34a] hover:bg-green-50 flex items-center justify-center transition"
                          title="Subir foto"
                        >
                          <Camera className="w-4 h-4 text-gray-400" />
                        </button>
                      )}
                    </div>
                  </td>

                  {/* Usuario */}
                  <td style={{ border: BW, padding: '4px 6px' }}>
                    <input value={profe.usuario}
                      onChange={e => editarCampo(profe.id, 'usuario', e.target.value)}
                      className="w-full text-sm font-black text-[#111827] px-2 py-1.5 bg-transparent outline-none focus:bg-green-50 rounded-lg" />
                  </td>

                  {/* Clave */}
                  <td style={{ border: BW, padding: '4px 6px' }}>
                    <div className="flex items-center gap-1">
                      <input type={claveVis[profe.id] ? 'text' : 'password'}
                        value={profe.clave}
                        onChange={e => editarCampo(profe.id, 'clave', e.target.value)}
                        className="flex-1 text-sm font-semibold text-[#111827] px-2 py-1.5 bg-transparent outline-none focus:bg-green-50 rounded-lg" />
                      <button onClick={() => setClaveVis(v => ({ ...v, [profe.id]: !v[profe.id] }))}
                        className="text-gray-400 hover:text-gray-600 p-1">
                        {claveVis[profe.id] ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </td>

                  {/* Proyectos */}
                  <td style={{ border: BW, padding: '6px 10px' }}>
                    {proyectos.length === 0 ? (
                      <span className="text-gray-300 text-xs italic">Sin proyectos cargados</span>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {proyectos
                          .filter(proy => {
                            const enOtro = profes.some(p => p.id !== profe.id && p.proyectos.includes(proy));
                            return !enOtro || profe.proyectos.includes(proy);
                          })
                          .map(proy => {
                            const activo = profe.proyectos.includes(proy);
                            return (
                              <button key={proy} onClick={() => toggleProy(profe.id, proy)}
                                className={`px-2 py-0.5 rounded-full text-[11px] font-bold border transition ${
                                  activo ? 'bg-[#16a34a] text-white border-[#16a34a]'
                                         : 'bg-transparent text-gray-400 border-gray-300 hover:border-[#16a34a] hover:text-[#16a34a]'}`}>
                                {proy}
                              </button>
                            );
                          })}
                      </div>
                    )}
                  </td>

                  {/* Eliminar */}
                  <td style={{ border: BW, padding: '4px 8px', textAlign: 'center' }}>
                    <button onClick={() => eliminar(profe.id)} className="text-red-400 hover:text-red-600 transition p-1">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>

                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {profes.length === 0 && (
          <div className="text-center py-16 text-gray-400">
            <Users className="w-12 h-12 mx-auto mb-3 text-gray-200" />
            <p className="font-semibold">No hay profes registrados</p>
          </div>
        )}

        <p className="text-center text-gray-400 text-xs mt-4">
          Pulsa el ícono de cámara para subir la foto de cada profe · La foto se guarda automáticamente
        </p>
      </main>
    </div>
  );
}
