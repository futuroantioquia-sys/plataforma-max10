# BRIEF · MICROCICLO DE ENTRENAMIENTO
## Futuro Antioquia — Plataforma Max 10

> **Para qué sirve este documento:** es la memoria del módulo. Al abrir un chat nuevo
> dedicado al microciclo, adjunte este archivo. Con eso el asistente arranca sabiendo
> qué se construyó, con qué reglas y qué falta — sin tener que redescubrirlo.
>
> **Creado:** 22 de agosto de 2026

---

## 1. REGLA DE ORO DEL MÓDULO

> **La asistencia no se digita en el microciclo.**
> El formador la sigue registrando en su formato de siempre (`/asistencia`).
> El microciclo **solo lee** de allí tres cosas: el **porcentaje**, el número de
> **asistentes** y la lista de **deportistas faltantes con su motivo**.
> No hay doble digitación y no hay dos versiones de la verdad.

Segunda regla, de gobierno:

> **La semana la abre ADMINISTRACIÓN. El contenido lo llena el FORMADOR.**

---

## 2. DÓNDE QUEDÓ

| | |
|---|---|
| Categoría del dashboard | **Seguimiento** (📊, color morado) |
| Ruta | `/microciclo` |
| Acceso admin | Dashboard → Seguimiento → *Microciclo de Entrenamiento* |
| Acceso formador | Dashboard del profe → tarjeta *Microciclo* |
| Portero de rutas | `/microciclo` agregado a `RUTAS_PROFESOR` en `src/middleware.ts` |

---

## 3. QUÉ HACE CADA ROL

| Rol | Puede |
|---|---|
| **ADMON** (`1` / `administracion`) | Crear la semana, borrarla, cambiar el estado (borrador → publicado → cerrado), editar objetivos y días. |
| **Administrador deportivo** (`deportivo`) | Lo mismo que ADMON. |
| **Formador** (`profesor`) | Ver **solo sus proyectos** (los de `futuro-profe-proyectos`), editar objetivos y el contenido de cada día. No crea ni borra semanas ni cambia el estado. |
| **Calidoso** (`deportista`) | Sin acceso — la ruta no está en `RUTAS_DEPORTISTA`. |

Estados del microciclo:

- `borrador` — ADMON lo está armando.
- `publicado` — el formador ya lo trabaja.
- `cerrado` — semana terminada; queda de historial y en solo lectura para el formador.

---

## 4. ESTRUCTURA DE UN MICROCICLO

**Cabecera (la semana):** número, mesociclo/periodo, formador, lunes → domingo,
objetivo general y objetivos **técnico, táctico, físico y psicológico/formativo**.

**Siete días (lunes a domingo).** Cada día tiene:

- **Tipo de día:** entrenamiento · partido · competencia · descarga · recuperación · descanso
- **Carga:** baja · media · alta · muy alta (se dibuja como barra de color)
- **Objetivo del día** y **contenidos**
- **Fase inicial · Fase central · Fase final** (texto por ahora)
- **Observaciones**
- **Panel de asistencia** — solo lectura, viene del formato de asistencia

---

## 5. CÓMO SE CALCULA LA ASISTENCIA

Se leen los estados que el formador ya usa en `/asistencia`:

| Estado | Significa | Cuenta como |
|---|---|---|
| `A` | Asistió | **Presente** |
| `C` | Compite | **Presente** |
| `F` | Faltó | Falta · motivo "Faltó" |
| `S` | Salud | Falta · motivo "Salud" |
| `ES` | Estudio | Falta · motivo "Estudio" |
| `FA` | Familia | Falta · motivo "Familia" |
| `NQ` | No quizo | Falta · motivo "No quizo" |
| `CAN` | Cancelado | Sesión cancelada — no cuenta |
| `SE` | Sin empezar | No cuenta |

```
% asistencia = presentes / (presentes + faltas) × 100
```

Semáforo en pantalla: **≥ 85 % verde · 70–84 % amarillo · < 70 % rojo**.
Si el formador todavía no llenó el formato, el día aparece como
*"El formador todavía no ha registrado la asistencia de este día"* — nunca como 0 %.

---

## 6. ARCHIVOS TOCADOS

| Archivo | Qué se hizo |
|---|---|
| `MICROCICLO-TABLAS.sql` | **NUEVO** — migración: tablas, triggers y vista. Ejecutar una sola vez en Supabase. |
| `frontend/src/app/microciclo/page.tsx` | **NUEVO** — la pantalla completa del módulo. |
| `frontend/src/lib/db.ts` | Se **agregó al final** el bloque `MICROCICLO DE ENTRENAMIENTO`. Nada del archivo anterior se modificó. |
| `frontend/src/app/dashboard/page.tsx` | Tarjeta en Seguimiento + acceso en el dashboard del profe (icono `CalendarDays`). |
| `frontend/src/middleware.ts` | `/microciclo` habilitado para el rol profesor. |

### Funciones nuevas en `db.ts`

```typescript
getMicrociclos(proyecto?)                  // cabeceras, más reciente primero
getMicrociclo(id)                          // cabecera + los 7 días
crearMicrociclo({proyecto, fecha_inicio…}) // crea la semana y sus 7 días
guardarMicrociclo(id, cambios)             // objetivos y estado
guardarMicrocicloDia(diaId, cambios)       // contenido de un día
eliminarMicrociclo(id)                     // borra en cascada
getResumenAsistencia(proyecto, desde, hasta) // %, asistentes, faltantes + motivo
lunesDeLaSemana(fecha) · claveFecha(fecha)   // utilidades de semana
```

### Tablas nuevas en Supabase

- `microciclos` — una fila por semana y proyecto (`unique(proyecto, fecha_inicio)`).
- `microciclo_dias` — siete filas por microciclo (`unique(microciclo_id, fecha)`).
- `v_asistencia_dia` — vista de solo lectura con el resumen por día.

---

## 7. PASOS PARA DEJARLO ANDANDO

1. Supabase → **SQL Editor** → pegar y ejecutar `MICROCICLO-TABLAS.sql`
   (proyecto activo `fykdyalpuydkwfjqguip`).
2. Publicar con `VERCEL-DIRECTO.bat`.
3. Entrar como ADMON → Seguimiento → *Microciclo de Entrenamiento* → elegir proyecto
   → **Nueva semana** → confirmar el lunes.
4. Llenar objetivos, poner el estado en **Publicado**.
5. El formador entra y completa cada día.

Si el módulo abre pero la lista sale vacía y en la consola aparece un error 404 de
`microciclos`, es que **falta el paso 1** (la migración no se ejecutó).

---

## 8. LO QUE FALTA (FASE 2) — PIZARRA TÁCTICA

Lo pedido: que en la **fase inicial, central y final** el profe dibuje una cancha y
pueda insertar miniaturas de **futbolistas, balones, conos, aros y flechas
indicativas** para ilustrar los ejercicios.

Ya quedó preparado el terreno:

- Las columnas `pizarra_inicial`, `pizarra_central` y `pizarra_final` (tipo `jsonb`)
  **ya existen** en `microciclo_dias` — no habrá que migrar otra vez.
- Los tipos `MicrocicloDia.pizarra_*` ya están en `db.ts` y `guardarMicrocicloDia`
  ya los sabe guardar.
- Cada fase en pantalla muestra el rótulo *"pizarra próximamente"* donde irá el lienzo.

Diseño propuesto para cuando se aborde:

1. Un lienzo **SVG** sobre una cancha dibujada (no imagen: escala sin pixelarse).
2. Paleta lateral con las fichas: jugador propio, jugador rival, balón, cono, aro,
   valla, flecha de pase, flecha de conducción, flecha de desplazamiento.
3. Arrastrar y soltar; cada figura se guarda como
   `{ tipo, x, y, rotacion, color, texto }` dentro del `jsonb`.
4. Botón *Duplicar del día anterior* para que el profe no dibuje dos veces lo mismo.
5. Exportar la sesión a PDF junto con el objetivo y los contenidos.

### Otros pendientes menores

- Duplicar un microciclo completo de una semana a otra.
- Exportar el microciclo a Excel/PDF (como se hace en `/asistencia`).
- Enlazar el día de tipo *partido* con el módulo `/postpartido`.
- Incluir `microciclos` y `microciclo_dias` cuando se active RLS en toda la base
  (pendiente conocido del backlog general).

---

## 9. DECISIONES QUE YA SE TOMARON (no rehacer)

- El microciclo **no guarda asistencia**, la lee. Si algún día se pide "corregir la
  asistencia desde el microciclo", eso rompe la fuente única de verdad: la corrección
  se hace en `/asistencia`.
- La semana va de **lunes a domingo**, siempre siete días, aunque el proyecto entrene
  tres. Los días sin sesión se marcan como *descanso*.
- Un solo microciclo por proyecto y por semana (lo impide la base, no solo la pantalla).
- El formador **no** puede crear ni borrar semanas: eso es de administración.
