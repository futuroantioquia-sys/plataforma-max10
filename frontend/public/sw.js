/* ─────────────────────────────────────────────────────────────────────────────
   EL AYUDANTE QUE PERMITE INSTALAR LA PLATAFORMA EN EL CELULAR
   (dirección, 29/08/2026)

   Esto es lo que hace que Chrome ofrezca "Instalar aplicación" y que el ícono
   de Futuro Antioquia quede en la pantalla del celular como cualquier app.

   REGLA IMPORTANTE, PARA NO REPETIR ERRORES VIEJOS:
   aquí NO se guarda copia de las páginas ni de los datos. Si se guardaran, el
   papá podría quedarse viendo una versión vieja de la plataforma después de
   que subamos cambios, y esos errores son los más difíciles de encontrar.
   Todo se pide siempre a internet, en vivo. Lo único que este archivo aporta
   es la posibilidad de instalarla y una pantalla decente cuando no hay señal.
   ───────────────────────────────────────────────────────────────────────── */

const AVISO_SIN_SENAL = `<!doctype html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Sin conexión</title>
<style>
  *{box-sizing:border-box;margin:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
  body{background:#2B3547;color:#fff;min-height:100vh;display:flex;align-items:center;
       justify-content:center;padding:24px;text-align:center}
  .caja{max-width:340px}
  h1{font-size:20px;font-weight:900;margin-bottom:10px}
  p{color:#ffffff99;font-size:14px;line-height:1.6}
  button{margin-top:18px;background:#00B050;border:0;border-radius:12px;color:#fff;
         font-weight:900;font-size:14px;padding:13px 22px;cursor:pointer}
</style></head><body>
<div class="caja">
  <h1>Sin conexión</h1>
  <p>La plataforma necesita internet para mostrarte la información al día.
     Revisa tus datos o el wifi y vuelve a intentarlo.</p>
  <button onclick="location.reload()">REINTENTAR</button>
</div></body></html>`;

self.addEventListener('install', () => {
  self.skipWaiting();          // la versión nueva manda de una
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    /* Se borra cualquier copia que hubiera quedado de versiones anteriores. */
    const nombres = await caches.keys();
    await Promise.all(nombres.map(n => caches.delete(n)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;

  /* Siempre a internet. Si no hay señal y lo que se pedía era una PÁGINA,
     se muestra el aviso de arriba en vez de la pantalla de error del
     navegador. Para lo demás —imágenes, datos— se deja fallar como siempre,
     que cada pantalla ya sabe qué hacer sin señal. */
  event.respondWith(
    fetch(req).catch(() => {
      if (req.mode === 'navigate') {
        return new Response(AVISO_SIN_SENAL, {
          headers: { 'Content-Type': 'text/html; charset=utf-8' },
        });
      }
      return Response.error();
    })
  );
});
