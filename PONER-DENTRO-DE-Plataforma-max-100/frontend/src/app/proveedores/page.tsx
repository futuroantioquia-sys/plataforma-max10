'use client';

// Se conserva la dirección /proveedores para no romper enlaces guardados:
// abre el mismo módulo unificado, ya parado en la pestaña de Proveedores.
import NominaYProveedoresPage from '../nomina/page';

export default function ProveedoresPage() {
  return <NominaYProveedoresPage inicial="proveedores" />;
}
