'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { PageHeader } from '@/components/PageHeader';
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react';

const MESES = [
  'Enero','Febrero','Marzo','Abril','Mayo','Junio',
  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre',
];
const DIAS_SEMANA = ['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'];

// Días de la semana con entrenamientos por defecto (Mié=3, Vie=5)
const DIAS_ENTRENO_DEFAULT = [3, 5]; // JS getDay values

function getDiasDelMes(anio: number, mes: number) {
  const dias: { fecha: Date; jsDay: number }[] = [];
  const d = new Date(anio, mes, 1);
  while (d.getMonth() === mes) {
    dias.push({ fecha: new Date(d), jsDay: d.getDay() });
    d.setDate(d.getDate() + 1);
  }
  return dias;
}

// Retorna el día ISO (Lun=1 … Dom=7) para posicionar en la grilla
function isoDay(jsDay: number) {
  return jsDay === 0 ? 7 : jsDay;
}

export default function CalendarioPage() {
  const router = useRouter();
  const hoy = new Date();
  const [mes, setMes]   = useState(hoy.getMonth());
  const [anio, setAnio] = useState(hoy.getFullYear());

  const dias = getDiasDelMes(anio, mes);
  const primerDia = dias[0];
  const offsetInicio = isoDay(primerDia.jsDay) - 1; // celdas vacías al inicio

  function prevMes() {
    if (mes === 0) { setMes(11); setAnio(a => a - 1); }
    else setMes(m => m - 1);
  }
  function nextMes() {
    if (mes === 11) { setMes(0); setAnio(a => a + 1); }
    else setMes(m => m + 1);
  }

  return (
    <div className="min-h-screen bg-[#f0f7ff] flex flex-col">
      <PageHeader
        titulo="Calendario"
        subtitulo="Entrenamientos y eventos"
        backTo="/dashboard"
        color="teal"
      />

      <main className="flex-1 max-w-2xl mx-auto w-full px-4 py-6">

        {/* Navegación de mes */}
        <div className="flex items-center justify-between mb-6">
          <button
            onClick={prevMes}
            className="w-10 h-10 rounded-xl bg-white border border-gray-100 shadow-sm flex items-center justify-center hover:bg-gray-50 transition"
          >
            <ChevronLeft className="w-5 h-5 text-gray-600" />
          </button>
          <h2 className="font-black text-lg text-gray-800 capitalize">
            {MESES[mes]} {anio}
          </h2>
          <button
            onClick={nextMes}
            className="w-10 h-10 rounded-xl bg-white border border-gray-100 shadow-sm flex items-center justify-center hover:bg-gray-50 transition"
          >
            <ChevronRight className="w-5 h-5 text-gray-600" />
          </button>
        </div>

        {/* Grilla del calendario */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          {/* Cabeceras de días */}
          <div className="grid grid-cols-7 border-b border-gray-100">
            {DIAS_SEMANA.map(d => (
              <div key={d} className="py-2 text-center text-[11px] font-black text-gray-400 uppercase tracking-wider">
                {d}
              </div>
            ))}
          </div>

          {/* Celdas */}
          <div className="grid grid-cols-7">
            {/* Espacios vacíos al inicio */}
            {Array.from({ length: offsetInicio }).map((_, i) => (
              <div key={`empty-${i}`} className="h-12 sm:h-14 border-b border-r border-gray-50" />
            ))}

            {dias.map(({ fecha, jsDay }) => {
              const esHoy = fecha.toDateString() === hoy.toDateString();
              const esEntreno = DIAS_ENTRENO_DEFAULT.includes(jsDay);
              const esFin = jsDay === 0 || jsDay === 6;

              return (
                <div
                  key={fecha.toISOString()}
                  className={`h-12 sm:h-14 border-b border-r border-gray-50 flex flex-col items-center justify-center gap-0.5 transition
                    ${esHoy ? 'bg-teal-50' : esFin ? 'bg-gray-50/50' : ''}
                  `}
                >
                  <span className={`text-sm font-bold leading-none
                    ${esHoy ? 'bg-teal-600 text-white w-7 h-7 rounded-full flex items-center justify-center' :
                      esFin ? 'text-gray-400' : 'text-gray-700'}
                  `}>
                    {fecha.getDate()}
                  </span>
                  {esEntreno && !esFin && (
                    <span className="w-1.5 h-1.5 rounded-full bg-[#16a34a]" />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Leyenda */}
        <div className="mt-4 flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-[#16a34a]" />
            <span className="text-xs text-gray-500">Día de entrenamiento</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-6 h-6 rounded-full bg-teal-600 flex items-center justify-center">
              <span className="text-white text-[10px] font-bold">{hoy.getDate()}</span>
            </span>
            <span className="text-xs text-gray-500">Hoy</span>
          </div>
        </div>

        {/* Aviso */}
        <div className="mt-6 bg-teal-50 border border-teal-200 rounded-2xl p-4 flex items-start gap-3">
          <Calendar className="w-5 h-5 text-teal-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-bold text-teal-800 text-sm">Calendario en construcción</p>
            <p className="text-teal-600 text-xs mt-0.5">
              Próximamente podrás ver eventos, partidos y horarios de cada proyecto aquí.
              Los puntos verdes indican días de entrenamiento habituales (Miércoles y Viernes).
            </p>
          </div>
        </div>

      </main>
    </div>
  );
}
