# Contexto del Proyecto — Futuro Antioquia

## ¿Qué es?
Plataforma web de gestión deportiva para la organización **Futuro Antioquia / MAX 10**.
Permite administrar deportistas, pagos, asistencia, proyectos y documentos.

## Stack tecnológico
- **Frontend:** Next.js 14 (App Router), TypeScript, Tailwind CSS
- **Backend/DB:** Supabase (PostgreSQL + REST API via `fetch()` directo, sin SDK)
- **Deploy:** Vercel (auto-deploy desde GitHub)
- **Auth store:** Zustand (`useAuthStore`) — el usuario logueado se lee con `usuario?.rol`
- **Repo GitHub:** `futuroantioquia-sys` — rama `main`

## Carpeta del proyecto
```
C:\Users\Lenovo\Claude\Projects\Plataforma max 100\
└── frontend\
    └── src\
        ├── app\                  ← páginas Next.js
        ├── components\           ← componentes reutilizables
        ├── lib\
        │   └── db.ts             ← TODAS las llamadas a Supabase
        └── store\
            └── auth.store.ts     ← estado global de autenticación
```

## Roles del sistema
| Rol | Descripción |
|-----|-------------|
| `administracion` | Admin completo — puede editar pagos, ver todo |
| `profesor` | Vista de lectura en estado-cuenta, edita asistencia y calificaciones |
| `deportista` | Calidoso — solo ve su propio estado de cuenta |

### Cómo detectar el rol en los componentes:
```tsx
const { usuario } = useAuthStore();
const esProfesor  = usuario?.rol === 'profesor';
const esAdmin     = usuario?.rol === 'administracion';
// Calidoso = ninguno de los anteriores (rol === 'deportista')
```

## Páginas principales
| Ruta | Descripción |
|------|-------------|
| `/login` | Login con 3 tabs: Admin, Profesor, Calidoso |
| `/dashboard` | Panel principal según rol |
| `/alumnos` | Tabla de todos los deportistas |
| `/alumnos/[id]/estado-cuenta` | Pagos del deportista (soporta `?edit=1` y `?readonly=1`) |
| `/alumnos/[id]/asistencia` | Control de asistencia del proyecto |
| `/pagos-pendientes` | Admin ve todos los soportes sin confirmar |
| `/general` | Vista general editable de deportistas |
| `/proyectos` | Gestión de proyectos deportivos |
| `/usuarios` | Gestión de profesores (solo admin) |

## Patrones importantes

### BalonCargando — es NAMED EXPORT:
```tsx
import { BalonCargando } from '@/components/BalonCargando';
// ❌ NO: import BalonCargando from ...
```

### Tipo Deportista — usa `_nombre`:
```tsx
dep._nombre   // ✅ nombre del deportista
dep.nombre    // ❌ no existe
```

### Readonly mode en estado-cuenta:
- URL con `?readonly=1` activa modo solo lectura
- Detectado con: `const esReadonly = searchParams.get('readonly') === '1';`
- Oculta: botones INFO/MENS, botón PAGAR, WhatsApp, sección soportes

### Eliminar soporte de pago (dual-delete):
```tsx
// eliminarSoporte() en estado-cuenta hace:
// 1. Borra de Supabase via eliminarSoportePorNombre()
// 2. Borra de localStorage
```

## Archivo db.ts — funciones clave
```typescript
getDeportistas()                          // Lista todos los deportistas
getPagosPorCodigos(codigos)               // Pagos por array de códigos
saveSoportePago(data)                     // Guarda soporte en Supabase
eliminarSoportePorNombre(depId, nombre)   // Borra soporte por nombre (no UUID)
getProfes()                               // Lista profesores
getCalificaciones(deportistaId, proy)     // Calificaciones por alumno
saveCalificacion(data)                    // Guarda calificación
getDocumentos(deportistaId)               // Documentos del deportista
saveDocumento(data)                       // Guarda documento
```

## Tablas en Supabase
- `deportistas` — datos principales
- `pagos_deportista` — historial de pagos
- `soportes_pago` — comprobantes subidos por calidosos (col `confirmado` bool)
- `profes` — profesores con proyectos asignados
- `proyectos` — proyectos deportivos
- `jornadas_proyecto` — días de entrenamiento por proyecto
- `calificaciones` — notas por alumno/proyecto
- `documentos_deportista` — documentos adjuntos al perfil
- `asistencia` — registros de asistencia

## Variables de entorno (Supabase)
Están hardcodeadas en `db.ts` como fallback (no depender de .env):
```typescript
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://...supabase.co';
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? 'eyJ...';
```

## Push a GitHub
Usar el archivo `push2.vbs` con Win+R:
```
C:\Users\Lenovo\Claude\Projects\Plataforma max 100\push2.vbs
```
- Siempre seleccionar cuenta `futuroantioquia-sys` en el diálogo de GitHub
- El VBScript hace `git add -A`, commit y push a `main`

## Estado actual (30 julio 2026)
Los siguientes cambios están en producción:
- ✅ Login: formulario oculto hasta seleccionar tipo de usuario
- ✅ Dashboard: "Confirmar Pagos" (antes "Pagos Pendientes")
- ✅ `/pagos-pendientes`: tabla con columnas Código/Nombre/Programa/Proyecto/Meses/Soporte
- ✅ Nombre del deportista carga correctamente (`_nombre`)
- ✅ Eliminar soporte borra también en Supabase (admin deja de verlo)
- ✅ Botón "Ver cuenta" desde pagos-pendientes abre estado-cuenta en modo readonly
- ✅ Modo readonly: sin PAGAR, sin subir soportes, sin WhatsApp, sin INFO/MENS

## Cómo retomar en una sesión nueva
Pega este archivo al inicio y di:
> "Soy Futuro Antioquia. Aquí está el contexto del proyecto. [pega el contenido]. Necesito ayuda con: [describe lo que quieres]."
