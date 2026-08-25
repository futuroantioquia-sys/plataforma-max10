# Futuro Antioquia — Contexto para continuar en el PC nuevo
*(Generado el 24 de agosto de 2026 · actualizado el 24 de agosto por la tarde)*

## Qué es
Plataforma web de gestión deportiva para **Futuro Antioquia / MAX 10**:
deportistas, pagos, asistencia, evaluaciones, contabilidad y microciclo.

## Stack
- **Frontend:** Next.js 14 (App Router), TypeScript, Tailwind
- **Base de datos:** Supabase (PostgreSQL, vía `fetch()` directo)
- **Deploy:** Vercel, auto-deploy desde GitHub
- **Repo:** `https://github.com/futuroantioquia-sys/plataforma-max10` — rama `main`

## Las DOS cuentas de Supabase (ojo con esto)

| Cuenta | Proyecto | Plan | Estado |
|---|---|---|---|
| `futuroantioquia-sys` | `fykdyalpuydkwfjqguip` | **PRO** | **EN USO** — es el bueno |
| `futuroantioquia-max10` | `gsovtgtrsqzoruvgmhed` | Gratis | Viejo. Pendiente de apagar |

Son cuentas distintas, no dos proyectos de la misma cuenta. Por eso las
herramientas conectadas a una no ven el proyecto de la otra.

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
| Subir cambios a GitHub/Vercel | `SUBIR-AHORA.bat` |
| Bajar cambios del otro PC | `ACTUALIZAR-DESDE-GITHUB.bat` |
| Respaldar la base de datos | `RESPALDO-AHORA.bat` |

Todos usan rutas relativas: funcionan en cualquier computador.

> `SUBIR-AHORA.bat` reemplaza a `push2.vbs`. Hace lo mismo pero deja ver
> qué pasó, en vez de dejar una ventana negra vacía cuando algo falla.

---

## MUDANZA AL PC NUEVO — hecho el 24/08/2026

- [x] Node.js 20 y Git instalados
- [x] Proyecto clonado desde GitHub
- [x] Claves (`.env.local`, `.env.production`) copiadas
- [x] Subido a GitHub el trabajo del 10 al 24 de agosto (llevaba 2 semanas sin commit)
- [x] Archivos puestos en su sitio y `npm install` corrido
- [x] Login y plataforma funcionando en `http://localhost:3000`

---

## PENDIENTES

### 1. Subir a GitHub el último arreglo — ✅ HECHO 24/08
Commit `472e165`. Subió 155 archivos (4,14 MB) y de paso sacó todo lo que
había quedado metido dentro de `PONER-DENTRO-DE-Plataforma-max-100/`.

### 2. Arreglar el `.env.local` mezclado — ✅ HECHO 24/08
Apuntaba a dos proyectos distintos. Quedó así:

| Variable | Antes | Ahora |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | viejo | `fykdyalpuydkwfjqguip` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | viejo | `fykdyalpuydkwfjqguip` |
| `SUPABASE_SERVICE_ROLE_KEY` | ya estaba bien | `fykdyalpuydkwfjqguip` |

`.env.production` tenía la misma mezcla y también se corrigió.
Se agregó `SESSION_SECRET` y `LOGIN_DEBUG=0`.

Las variables de ingreso (`ADMIN_USER`, `ADMIN_PASS`, `DIANA_USER`,
`DIANA_PASS`, `AFILIACION_CODE`) se dejaron **a propósito sin definir** en
local: al faltar, la plataforma entra con los valores de siempre. Van en
Vercel, no aquí. Ver `PASOS-SEGURIDAD.md`, Paso 1.

Comprobado: deportistas y pagos cargan bien.

Copias de los archivos anteriores: `frontend\.env.*.viejo-20260824-1523`.
El `.gitignore` las cubre con la regla `.env.*`, así que no se suben.
Se pueden borrar cuando ya no hagan falta.

### 3. CONTENIDOS → OBJETIVOS ESPECÍFICOS — ✅ HECHO 24/08
En `frontend\src\app\microciclo\page.tsx`, los 4 sitios. También el
mensaje de aviso al guardar (línea ~1375), que seguía diciendo
"los contenidos". El campo interno sigue llamándose `contenidos`.

### 4. Seguridad — PENDIENTE (ver `PASOS-SEGURIDAD.md`)
- [ ] **Apagar o borrar el proyecto Supabase viejo `gsovtgtrsqzoruvgmhed`.**
      Verificado el 24/08: sigue encendido y con todo adentro —
      1.163 deportistas, 46.356 registros de asistencia, 844 visitas,
      11.723 movimientos contables. Última visita registrada: 17/08.
      La tabla `visitas` sigue sin ninguna protección.
- [ ] Verificar que el repo de GitHub esté en PRIVADO.
- [ ] Cambiar las contraseñas de profesores y administradores (hoy son la
      cédula, cifradas con coste 6, y quedaron escritas dentro del código).
- [ ] Sacar `DEVOLVER-CLAVES.sql` del repositorio **y de su historial**
      (tiene 27 contraseñas cifradas). Ya está en `.gitignore`, pero eso
      no borra lo que ya se subió antes.
- [ ] Guardar la carpeta `RESPALDO/` en un lugar cifrado.

---

## REGLA DE ORO tras la mudanza
Hay dos computadores contra la misma base de datos.

1. **Antes de trabajar:** correr `ACTUALIZAR-DESDE-GITHUB.bat`
2. **Al terminar el día:** correr `SUBIR-AHORA.bat`

Lo que pasó el 24 de agosto —dos semanas de trabajo colgando de un solo
disco duro— no se repite si se cumplen esos dos pasos.
