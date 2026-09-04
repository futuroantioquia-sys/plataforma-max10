'use client';

import { useRouter } from 'next/navigation';
import { HardHat, ArrowLeft } from 'lucide-react';

export default function MantenimientoPage() {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-[#333F50] flex flex-col items-center justify-center p-6">
      <div className="bg-[#3C4759] rounded-3xl shadow-xl p-8 max-w-sm w-full text-center border border-[#4A5568]">

        {/* Icono */}
        {/* Recuadro del icono: tinte ámbar claro → CAMPO con borde ámbar — dirección, 04/09/2026 */}
        <div className="w-20 h-20 bg-[#2B3547] rounded-2xl flex items-center justify-center mx-auto mb-5 border-2 border-[#E0A33A]">
          <HardHat className="w-10 h-10 text-[#E0A33A]" />
        </div>

        {/* Título */}
        <h1 className="text-2xl font-black text-white mb-2">
          En Mantenimiento
        </h1>

        {/* Subtítulo */}
        <p className="text-[#C9D2DE] text-sm mb-1 font-semibold">
          Esta sección está siendo actualizada.
        </p>
        <p className="text-[#C9D2DE] text-xs mb-7">
          Pronto estará disponible. Gracias por tu paciencia.
        </p>

        {/* Barra decorativa */}
        <div className="flex gap-1.5 justify-center mb-7">
          {[0, 1, 2, 3, 4].map(i => (
            <div
              key={i}
              className="h-1.5 rounded-full bg-amber-400"
              style={{
                width: i === 2 ? 32 : 12,
                opacity: 0.6 + i * 0.08,
              }}
            />
          ))}
        </div>

        {/* Botón volver */}
        <button
          onClick={() => router.back()}
          className="flex items-center justify-center gap-2 w-full bg-[#16a34a] hover:bg-[#15803d] text-white font-black py-3.5 rounded-2xl transition-colors text-sm"
        >
          <ArrowLeft className="w-4 h-4" />
          Volver
        </button>
      </div>

      {/* Logo abajo */}
      <div className="mt-8 flex items-center gap-2 opacity-40">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/ESCUDO%20F.A%202020.png" alt="FA" className="w-6 h-6 object-contain" />
        <span className="text-xs font-black text-[#C9D2DE] uppercase tracking-widest">Futuro Antioquia</span>
      </div>
    </div>
  );
}
