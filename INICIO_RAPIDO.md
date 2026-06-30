# ⚽ Futuro Antioquia — Inicio Rápido

## Requisitos previos
- Node.js 20+
- PostgreSQL 16
- npm o pnpm

---

## 1. Configurar la base de datos

```sql
-- En PostgreSQL, crear la base de datos:
CREATE DATABASE futuro_antioquia;
```

Ejecutar el esquema completo que ya tienes:
```bash
psql -U postgres -d futuro_antioquia -f "database_schema.sql"
```

---

## 2. Backend (API)

```bash
cd backend

# Copiar y configurar variables de entorno
copy .env.example .env
# → Editar .env con tus credenciales de PostgreSQL

# Instalar dependencias
npm install

# Sincronizar Prisma con la BD
npm run db:push

# Iniciar en modo desarrollo
npm run dev
# → API disponible en http://localhost:4000
# → GET http://localhost:4000/health  (verificar conexión)
```

---

## 3. Frontend (Web)

```bash
cd frontend

# Copiar variables de entorno
copy .env.example .env.local

# Instalar dependencias
npm install

# Iniciar en modo desarrollo
npm run dev
# → App disponible en http://localhost:3000
# → Login: http://localhost:3000/login
# → Dashboard: http://localhost:3000/dashboard
```

---

## Endpoints de Auth disponibles

| Método | Ruta                        | Descripción                        |
|--------|-----------------------------|------------------------------------|
| POST   | /api/auth/login             | Iniciar sesión                     |
| POST   | /api/auth/refresh           | Renovar access token               |
| POST   | /api/auth/logout            | Cerrar sesión                      |
| POST   | /api/auth/logout-todos      | Cerrar todas las sesiones          |
| GET    | /api/auth/yo                | Perfil del usuario autenticado     |
| POST   | /api/auth/cambiar-password  | Cambiar contraseña                 |
| POST   | /api/auth/2fa/habilitar     | Iniciar configuración de 2FA       |
| POST   | /api/auth/2fa/confirmar     | Confirmar y activar 2FA            |
| POST   | /api/auth/2fa/deshabilitar  | Desactivar 2FA                     |
| POST   | /api/auth/usuarios          | Crear usuario (admin+)             |

---

## Credenciales de prueba (seed)

```
Email:    admin@futuroantioquia.com
Password: (definir en BD seed)
Rol:      admin_academia
```

---

## Estructura del proyecto

```
backend/
├── prisma/
│   └── schema.prisma          ← Modelos de BD
├── src/
│   ├── index.js               ← Servidor Express
│   ├── config/prisma.js       ← Cliente Prisma
│   ├── middleware/
│   │   ├── auth.middleware.js ← JWT + RBAC + multi-tenant
│   │   └── rateLimit.js       ← Protección brute-force
│   ├── routes/auth.routes.js  ← Endpoints de auth
│   ├── controllers/           ← Handlers HTTP
│   ├── services/auth.service.js ← Lógica de negocio
│   └── utils/                 ← JWT, password, audit
├── .env.example
└── package.json

frontend/
├── src/
│   ├── app/
│   │   ├── login/page.tsx     ← Pantalla de login
│   │   └── dashboard/page.tsx ← Dashboard multi-rol
│   ├── lib/
│   │   ├── api.ts             ← Cliente axios con auto-refresh
│   │   └── utils.ts           ← Helpers
│   └── store/auth.store.ts    ← Estado global (Zustand)
├── .env.example
└── package.json
```

---

## Próximas fases de desarrollo

- **Fase 2:** CRUD alumnos, categorías, asistencia, evaluaciones técnicas
- **Fase 3:** Chat en tiempo real (WebSocket), notificaciones push
- **Fase 4:** Integración Wompi/PayU, módulo nutricional
- **Fase 5:** Multi-academia SaaS, app Flutter, IA de recomendaciones
