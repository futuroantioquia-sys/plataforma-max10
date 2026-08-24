// Página de reparación de claves — DESACTIVADA POR SEGURIDAD (22/08/2026).
// La herramienta llevaba las contraseñas cifradas dentro del código.
export default function RepararClavesPage() {
  return (
    <div style={{ padding: 40, fontFamily: 'system-ui', textAlign: 'center' }}>
      <h1 style={{ fontSize: 20, fontWeight: 700 }}>Herramienta retirada</h1>
      <p style={{ marginTop: 12, opacity: 0.8 }}>
        Esta herramienta se retiró por seguridad. La restauración de contraseñas se hace
        ahora desde Supabase, con un archivo guardado fuera del proyecto.
      </p>
    </div>
  );
}
