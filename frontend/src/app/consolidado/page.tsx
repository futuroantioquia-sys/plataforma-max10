'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * El módulo "Consolidado de Asistencia" se fusionó dentro de /asistencia.
 * Ahora se abre eligiendo CONSOLIDADO en el desplegable MES.
 * Esta página solo redirige para que los enlaces viejos sigan funcionando.
 */
export default function ConsolidadoRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace('/asistencia'); }, [router]);
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
      <p className="text-gray-400 font-semibold text-sm text-center">
        El consolidado ahora está dentro de Control de Asistencia.<br />
        Elige <b>CONSOLIDADO</b> en el desplegable <b>MES</b>. Redirigiendo…
      </p>
    </div>
  );
}
