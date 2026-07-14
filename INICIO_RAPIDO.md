# ⚽ Futuro Antioquia — Inicio Rápido

## Requisitos previos
- Node.js 20+
- npm
- Proyecto de Supabase (ya activo: `futuroantioquia-max10`)

---

## 1. Frontend (Web) — única app real del proyecto

```bash
cd frontend

# Copiar variables de entorno
copy .env.example .env.local
# → Completar NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_ANON_KEY

# Instalar dependencias
npm install

# Iniciar en modo desarrollo
npm run dev
# → App disponible en http://localhost:3000
# → Login: http://localhost:3000/login
# → Dashboard: http://localhost:3000/dashboard
```

También puedes usar `ARRANCAR_APP.bat` (instala dependencias e inicia el servidor automáticamente).

---

## Estructura del proyecto

```
frontend/
├── src/
│   ├── app/
│   │   ├── login/page.tsx        ← Login (admin / profesor / calidoso)
│   │   ├── dashboard/page.tsx    ← Dashboard multi-rol
│   │   ├── alumnos/              ← Fichas de deportistas
│   │   ├── asistencia/           ← Registro de asistencia (profesor)
│   │   ├── sesiones/             ← Sesiones de entrenamiento (profesor)
│   │   ├── postpartido/          ← Reporte postpartido (profesor)
│   │   ├── evaluaciones/         ← Valoración deportiva (profesor)
│   │   ├── pagos/, vista-contable/ ← Módulo contable
│   │   └── usuarios/             ← Gestión de profesores/claves
│   ├── lib/
│   │   ├── db.ts                 ← Toda la lectura/escritura real a Supabase
│   │   └── supabase/             ← Clientes Supabase (browser/server)
│   └── middleware.ts             ← Control de rutas por rol
├── .env.example
└── package.json
```

Todos los datos (deportistas, pagos, asistencia, evaluaciones, sesiones, postpartidos, profes) viven directamente en tablas de Supabase — no hay backend intermedio. Los helpers de acceso a datos están centralizados en `frontend/src/lib/db.ts`.

---

## Pendiente conocido (backlog)

- **Seguridad:** activar Row Level Security en las tablas reales y reemplazar las contraseñas de profesores (actualmente cédulas en texto plano en `usuarios/page.tsx`) por un mecanismo seguro.
- **Contabilidad institucional automatizada** (Fase 3 del plan de acción).
- **Web informativa pública** (Fase 4 del plan de acción).
