'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { MessageCircle, Send, Search } from 'lucide-react';
import { cn } from '@/lib/utils';

const LS_KEY = 'futuro_mensajes';

type Mensaje = { de: 'yo' | 'ellos'; texto: string; hora: string };

type Conversacion = {
  id:       string;
  nombre:   string;
  rol:      string;
  avatar:   string;
  ultimo:   string;
  hora:     string;
  noLeidos: number;
  mensajes: Mensaje[];
};

/* ── Datos iniciales (solo la primera vez) ── */
const INICIAL: Conversacion[] = [
  {
    id: '1', nombre: 'Hernán Marulanda', rol: 'Padre de Santiago', avatar: 'HR',
    ultimo: 'Hola, ¿cómo le fue a Santiago en el entrenamiento?',
    hora: '10:30', noLeidos: 2,
    mensajes: [
      { de: 'ellos', texto: 'Buenos días profesor',                                        hora: '10:00' },
      { de: 'yo',    texto: '¡Buenos días! Santiago tuvo un excelente entrenamiento hoy.', hora: '10:05' },
      { de: 'ellos', texto: 'Qué bueno saberlo 😊',                                       hora: '10:10' },
      { de: 'ellos', texto: 'Hola, ¿cómo le fue a Santiago en el entrenamiento?',         hora: '10:30' },
    ],
  },
  {
    id: '2', nombre: 'María García', rol: 'Padre de Mateo', avatar: 'MG',
    ultimo: 'Gracias por el informe de evaluación',
    hora: '9:15', noLeidos: 0,
    mensajes: [
      { de: 'yo',    texto: 'Aquí le comparto el informe de evaluación de Mateo', hora: '9:00' },
      { de: 'ellos', texto: 'Gracias por el informe de evaluación',               hora: '9:15' },
    ],
  },
  {
    id: '3', nombre: 'Administración', rol: 'Academia', avatar: 'AD',
    ultimo: 'Recuerda enviar el listado de asistencia del viernes',
    hora: 'Ayer', noLeidos: 1,
    mensajes: [
      { de: 'ellos', texto: 'Recuerda enviar el listado de asistencia del viernes', hora: 'Ayer 4:00 p.m.' },
    ],
  },
];

function cargar(): Conversacion[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return INICIAL;
}

function guardar(data: Conversacion[]) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(data)); } catch {}
}

function horaActual(): string {
  return new Date().toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', hour12: false });
}

export default function MensajesPage() {
  const router = useRouter();
  const [convs,      setConvs]      = useState<Conversacion[]>([]);
  const [convActiva, setConvActiva] = useState<string | null>(null);
  const [nuevoMsg,   setNuevoMsg]   = useState('');
  const [busqueda,   setBusqueda]   = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  /* Cargar desde localStorage al montar */
  useEffect(() => {
    const data = cargar();
    setConvs(data);
    if (data.length) setConvActiva(data[0].id);
  }, []);

  /* Auto-scroll al último mensaje */
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [convActiva, convs]);

  const conv = convs.find(c => c.id === convActiva);

  /* Marcar como leídos al abrir */
  function abrirConv(id: string) {
    setConvActiva(id);
    const updated = convs.map(c => c.id === id ? { ...c, noLeidos: 0 } : c);
    setConvs(updated);
    guardar(updated);
  }

  /* Enviar mensaje */
  function enviar() {
    if (!nuevoMsg.trim() || !convActiva) return;
    const hora  = horaActual();
    const texto = nuevoMsg.trim();
    const updated = convs.map(c =>
      c.id === convActiva
        ? { ...c, ultimo: texto, hora, mensajes: [...c.mensajes, { de: 'yo' as const, texto, hora }] }
        : c
    );
    setConvs(updated);
    guardar(updated);
    setNuevoMsg('');
  }

  /* Filtrar por búsqueda */
  const convsFiltradas = convs.filter(c =>
    c.nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
    c.ultimo.toLowerCase().includes(busqueda.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-gradient-to-r from-[#064e1e] to-[#22c55e] px-6 py-4 flex items-center gap-3 sticky top-0 z-10 shadow-sm">
        <button onClick={() => router.push('/dashboard')} className="text-white/70 hover:text-white">← Volver</button>
        <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center">
          <MessageCircle className="w-4 h-4 text-white" />
        </div>
        <span className="font-bold text-white">Mensajes</span>
        <div className="ml-auto text-right leading-tight">
          <p className="text-white font-black text-sm tracking-widest">MAX 10 SPORT</p>
          <p className="text-white/60 text-[11px]">Conecta, Gestiona, Gana</p>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden flex h-[calc(100vh-160px)]">

          {/* Lista de conversaciones */}
          <div className="w-72 border-r border-gray-100 flex flex-col flex-shrink-0">
            <div className="p-3 border-b border-gray-100">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  placeholder="Buscar..."
                  value={busqueda}
                  onChange={e => setBusqueda(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 bg-gray-50 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#16a34a]"
                />
              </div>
            </div>
            <div className="overflow-y-auto flex-1">
              {convsFiltradas.map(c => (
                <button
                  key={c.id}
                  onClick={() => abrirConv(c.id)}
                  className={cn(
                    'w-full p-4 flex items-start gap-3 text-left hover:bg-gray-50 transition border-b border-gray-50',
                    convActiva === c.id && 'bg-[#E8F5E9]'
                  )}
                >
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#064e1e] to-[#16a34a] flex items-center justify-center flex-shrink-0">
                    <span className="text-white text-xs font-bold">{c.avatar}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold text-gray-900 truncate">{c.nombre}</p>
                      <span className="text-xs text-gray-400 flex-shrink-0 ml-1">{c.hora}</span>
                    </div>
                    <p className="text-xs text-gray-400 truncate mt-0.5">{c.ultimo}</p>
                  </div>
                  {c.noLeidos > 0 && (
                    <span className="w-5 h-5 bg-[#16a34a] text-white text-[10px] font-bold rounded-full flex items-center justify-center flex-shrink-0">
                      {c.noLeidos}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Chat activo */}
          {conv ? (
            <div className="flex-1 flex flex-col min-w-0">
              {/* Cabecera chat */}
              <div className="p-4 border-b border-gray-100 flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#064e1e] to-[#16a34a] flex items-center justify-center">
                  <span className="text-white text-xs font-bold">{conv.avatar}</span>
                </div>
                <div>
                  <p className="font-semibold text-gray-900 text-sm">{conv.nombre}</p>
                  <p className="text-xs text-gray-400">{conv.rol}</p>
                </div>
              </div>

              {/* Mensajes */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {conv.mensajes.map((m, i) => (
                  <div key={i} className={cn('flex', m.de === 'yo' ? 'justify-end' : 'justify-start')}>
                    <div className={cn(
                      'max-w-[70%] px-4 py-2.5 rounded-2xl text-sm',
                      m.de === 'yo'
                        ? 'bg-[#16a34a] text-white rounded-br-sm'
                        : 'bg-gray-100 text-gray-800 rounded-bl-sm'
                    )}>
                      <p>{m.texto}</p>
                      <p className={cn('text-[10px] mt-1', m.de === 'yo' ? 'text-white/60' : 'text-gray-400')}>
                        {m.hora}
                      </p>
                    </div>
                  </div>
                ))}
                <div ref={bottomRef}/>
              </div>

              {/* Input */}
              <div className="p-4 border-t border-gray-100 flex gap-3">
                <input
                  type="text"
                  placeholder="Escribe un mensaje..."
                  value={nuevoMsg}
                  onChange={e => setNuevoMsg(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && enviar()}
                  className="flex-1 border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#16a34a]"
                />
                <button
                  onClick={enviar}
                  className="w-10 h-10 bg-[#16a34a] text-white rounded-xl flex items-center justify-center hover:bg-[#064e1e] transition"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center text-gray-400">
              <div className="text-center">
                <MessageCircle className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p className="text-sm">Selecciona una conversación</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
