# Futuro Antioquia — Contexto para continuar en el PC nuevo
*(Generado el 24 de agosto de 2026)*

## Qué es
Plataforma web de gestión deportiva para **Futuro Antioquia / MAX 10**:
deportistas, pagos, asistencia, evaluaciones, contabilidad y microciclo.

## Stack
- **Frontend:** Next.js 14 (App Router), TypeScript, Tailwind
- **Base de datos:** Supabase (PostgreSQL, vía `fetch()` directo)
- **Deploy:** Vercel, auto-deploy desde GitHub
- **Repo:** `https://github.com/futuroantioquia-sys/plataforma-max10` — rama `main`

## Carpeta del proyecto (PC nuevo)
```
C:\Users\futur\Claude\Projects\Plataforma max 100\
└── frontend\src\
    ├── app\        ← páginas
    ├── components\
    ├── lib\db.ts   ← TODAS las llamadas a Supabase
    └── store\auth.store.ts
```

## Botones de uso diario
| Para qué | Archivo |
|---|---|
| Prender la plataforma local | `PRENDER-LOCAL.bat` |
| Subir cambios a GitHub/Vercel | `push2.vbs` |
| Bajar cambios del otro PC | `ACTUALIZAR-DESDE-GITHUB.bat` |
| Respaldar la base de datos | `RESPALDO-AHORA.bat` |

Todos usan rutas relativas: funcionan en cualquier computador.

---

## MUDANZA AL PC NUEVO — hecho el 24/08/2026

- [x] Node.js 20 y Git instalados
- [x] Proyecto clonado desde GitHub
- [x] Claves (`.env.local`, `.env.production`) copiadas
- [x] Subido a GitHub el trabajo del 10 al 24 de agosto (llevaba 2 semanas sin commit)
- [x] Archivos puestos en su sitio y `npm install` corrido
- [x] Login y plataforma funcionando en `http://localhost:3000`

---

## PENDIENTES — para retomar

### 1. Subir a GitHub el último arreglo (URGENTE, 1 minuto)
Los archivos movidos con robocopy y el `npm install` todavía no se han
registrado. Abrir terminal en la carpeta del proyecto y correr:
```
git add -A
git commit -m "archivos en su sitio + librerias actualizadas"
git push origin main
```

### 2. Arreglar el archivo `.env.local` — está MEZCLADO
Verificado el 24/08: apunta a dos proyectos distintos de Supabase.

| Variable | Apunta a | Debería ser |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `gsovtgtrsqzoruvgmhed` (viejo) | el nuevo |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `gsovtgtrsqzoruvgmhed` (viejo) | el nuevo |
| `SUPABASE_SERVICE_ROLE_KEY` | `fykdyalpuydkwfjqguip` (nuevo) | OK |

Por eso el panel "Visitantes de la plataforma" del dashboard marca 0.
**Qué hace falta:** la clave `anon / public` del proyecto `fykdyalpuydkwfjqguip`
(Supabase → Settings → API).

Además faltan variables que se agregaron con el blindaje del 20/08:
`SESSION_SECRET`, `ADMIN_USER`, `ADMIN_PASS`, `DIANA_USER`, `DIANA_PASS`,
`AFILIACION_CODE`, `LOGIN_DEBUG`. Ver `frontend\.env.example`.

### 3. Cambio pedido y aún sin aplicar
En `frontend\src\app\microciclo\page.tsx`: la etiqueta **CONTENIDOS** debe
decir **OBJETIVOS ESPECÍFICOS**. Aparece en 4 sitios (líneas ~124, ~1248,
~1336 y ~1548). El campo interno sigue llamándose `contenidos`; solo cambia
el texto que se ve.

### 4. Seguridad — pendientes del plan (ver `PASOS-SEGURIDAD.md`)
- Apagar o borrar el proyecto Supabase viejo `gsovtgtrsqzoruvgmhed`.
  Sigue encendido, con copia de los datos de 1.163 menores y la tabla
  `visitas` sin ninguna protección.
- Verificar que el repo de GitHub esté en PRIVADO.
- Cambiar las contraseñas de profesores y administradores (hoy son la cédula,
  cifradas con coste 6, y quedaron escritas dentro del código).
- Sacar `DEVOLVER-CLAVES.sql` del repositorio (tiene 27 contraseñas cifradas).
- Guardar la carpeta `RESPALDO/` en un lugar cifrado.

---

## REGLA DE ORO tras la mudanza
Hay dos computadores contra la misma base de datos.

1. **Antes de trabajar:** correr `ACTUALIZAR-DESDE-GITHUB.bat`
2. **Al terminar el día:** correr `push2.vbs`

Lo que pasó hoy —dos semanas de trabajo colgando de un solo disco duro—
no se repite si se cumplen esos dos pasos.
