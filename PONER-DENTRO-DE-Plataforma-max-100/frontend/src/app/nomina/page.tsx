'use client';

// ─────────────────────────────────────────────────────────────────────────────
//  NÓMINA Y PROVEEDORES — un solo módulo con dos directorios.
//  Antes eran dos accesos separados en el tablero. Se unieron el 22/08/2026:
//  la tabla es idéntica (nombre, documento, cuenta, banco) y se consulta para
//  lo mismo — pagar. Cambiar de uno a otro es ahora un clic, no volver al inicio.
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from 'react';
import { DirectorioFinanzas } from '@/components/DirectorioFinanzas';

type Directorio = 'nomina' | 'proveedores';

const INFO: Record<Directorio, { etiqueta: string; subtitulo: string; docLabel: string }> = {
  nomina:      { etiqueta: 'Nómina',      subtitulo: 'Empleados — nombre, documento, cuenta y banco',    docLabel: 'Cédula' },
  proveedores: { etiqueta: 'Proveedores', subtitulo: 'Proveedores — nombre, documento, cuenta y banco', docLabel: 'Documento / NIT' },
};

export default function NominaYProveedoresPage({ inicial = 'nomina' as Directorio }) {
  const [cual, setCual] = useState<Directorio>(inicial);
  const info = INFO[cual];

  const pestanas = (
    <div className="flex items-center gap-1.5 bg-gray-100 rounded-xl p-1 mb-4 w-fit">
      {(Object.keys(INFO) as Directorio[]).map(k => (
        <button
          key={k}
          onClick={() => setCual(k)}
          className={`text-sm font-black px-4 py-1.5 rounded-lg transition ${
            cual === k ? 'bg-[#00B050] text-white shadow-sm' : 'text-gray-600 hover:bg-gray-200'
          }`}>
          {INFO[k].etiqueta}
        </button>
      ))}
    </div>
  );

  return (
    <DirectorioFinanzas
      /* `key` fuerza a remontar la tabla al cambiar de directorio */
      key={cual}
      tabla={cual}
      titulo="Nómina y Proveedores"
      subtitulo={info.subtitulo}
      docLabel={info.docLabel}
      pestanas={pestanas}
    />
  );
}
