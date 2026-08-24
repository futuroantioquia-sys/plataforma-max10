# Pasos de seguridad — Futuro Antioquia

**Fecha:** 22 de agosto de 2026
**Sigue el orden.** Los pasos 1 y 2 son para hacer HOY. El paso 3 va después de comprobar que todo funciona.

---

## Paso 1 · Configurar las llaves en Vercel (antes de publicar)

Ve a **vercel.com → tu proyecto → Settings → Environment Variables** y agrega estas cuatro. Marca los tres entornos (Production, Preview, Development).

| Nombre | Valor |
|---|---|
| `SESSION_SECRET` | `PwYGlwSOr2lJvuPlTrFKZ0c7kfX8EpyxRkwXQ7eMnQgtHHRwj8WpzjQwQfmOlDwS` |
| `ADMIN_USER` | `ADMON` |
| `ADMIN_PASS` | *(elige una nueva — la de ahora es `34`)* p. ej. `O52O-DZ2I-UIKV` |
| `AFILIACION_CODE` | *(elige uno nuevo — el de ahora es `26`)* |

> **Nota (actualizado el 22/08 a las 11:00):** al principio dejé estas variables como obligatorias y eso dejó a todo el mundo por fuera. Ya lo corregí: si las variables no están, la plataforma sigue funcionando con los valores de siempre. **Cuando las configures aquí, esos valores mandan y los de respaldo dejan de servir** — que es justamente el objetivo. Configúralas con calma, sin riesgo de tumbar el acceso.

También, si tienes a mano la **llave `service_role`** del proyecto Supabase `fykdyalpuydkwfjqguip` (Supabase → Settings → API → *service_role secret*), agrégala como:

| Nombre | Valor |
|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | *(la llave service_role del proyecto **nuevo**)* |

Esa llave es la que permitirá cerrar la puerta grande en la Fase 2. **Nunca la pongas en un archivo del proyecto ni la compartas por WhatsApp.**

---

## Paso 2 · Publicar la nueva versión

Publica como siempre (`PUBLICAR-EN-VERCEL.bat` o `VERCEL-DIRECTO.bat`).

Después, abre en el navegador:

```
https://plataforma-max10.vercel.app/api/estado-seguridad
```

Debe responder algo así:

```json
{"secretoDeSesion":true,"claveMaestraBD":true,"usuarioMaestro":true,"codigoAfiliacion":true}
```

Si algo sale en `false`, falta esa variable en Vercel. La plataforma sigue funcionando igual, pero seguirá usando el valor de respaldo escrito en el código — que es lo que queremos eliminar.

**Luego comprueba a mano:**

1. Entra como **ADMON** con la contraseña nueva.
2. Entra como un **profesor** cualquiera.
3. Entra como un **calidoso** (código + documento).
4. Con la sesión de calidoso, intenta entrar a `/pagos` escribiendo la dirección: debe rebotarte.

---

## Paso 3 · Cerrar puertas en la base de datos

Solo cuando los cuatro puntos del paso 2 funcionen:

Supabase → proyecto `fykdyalpuydkwfjqguip` → **SQL Editor** → pega el archivo **`BLINDAJE-FASE-1.sql`** → RUN.

El paso 5 de ese archivo (esconder las contraseñas) hazlo **al final**, y vuelve a probar que profes y administradores entran.

---

## Paso 4 · Cosas que solo tú puedes hacer

- [ ] **Revisar que el repositorio de GitHub `futuroantioquia-sys` esté en PRIVADO.** Si estuvo público alguna vez, todo lo que había escrito en el código (contraseñas maestras, contraseñas cifradas de los profes, direcciones de la base) hay que darlo por conocido.
- [ ] **Cambiar la contraseña de todos los profesores y administradores.** Sus contraseñas cifradas quedaron escritas dentro del código y dentro del archivo `DEVOLVER-CLAVES.sql`, y el cifrado usado es débil (coste 6). Hoy la contraseña de cada profe es su cédula: un número que mucha gente conoce.
- [ ] **Apagar o borrar el proyecto Supabase viejo `gsovtgtrsqzoruvgmhed`.** Sigue encendido, con copia de los datos de los menores y completamente abierto. Supabase → ese proyecto → Settings → General → *Pause* o *Delete*.
- [ ] **Borrar del repositorio los archivos con contraseñas cifradas:** `DEVOLVER-CLAVES.sql` (contiene 27 contraseñas cifradas). Bórralo del proyecto y del historial de Git, o guárdalo fuera del repositorio.
- [ ] **Guardar los respaldos de `RESPALDO/` en un lugar cifrado.** Son datos personales de 1.165 menores en archivos sin protección dentro del computador.

---

## Lo que sigue (Fase 2)

La puerta grande sigue abierta: hoy el navegador de cualquier visitante puede hablar directamente con la base de datos usando la clave que va dentro de la página. Cerrarla requiere que todas las consultas pasen por el servidor. Ese es el siguiente trabajo, y ya está diseñado en el informe.
