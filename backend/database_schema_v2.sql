-- ============================================================
-- FUTURO ANTIOQUIA — Esquema PostgreSQL 16
-- Versión 2.0 | Roles actualizados: 4 roles reales
-- ============================================================

-- Extensiones necesarias
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- ============================================================
-- TIPOS ENUMERADOS
-- ============================================================

-- 4 ROLES DE LA PLATAFORMA:
--   administracion → acceso total a la academia
--   contable       → módulo financiero (pagos, cartera, reportes)
--   profesor       → asistencia, evaluaciones, su categoría
--   padre          → solo sus hijos (solo lectura)
CREATE TYPE rol_usuario AS ENUM (
  'administracion',
  'contable',
  'profesor',
  'padre'
);

CREATE TYPE estado_pago AS ENUM (
  'pendiente',
  'pagado',
  'vencido',
  'cancelado',
  'reembolsado'
);

CREATE TYPE tipo_mensaje AS ENUM (
  'texto',
  'imagen',
  'documento',
  'audio'
);

CREATE TYPE tipo_conversacion AS ENUM (
  'directa',
  'grupo',
  'anuncio'
);

CREATE TYPE plan_suscripcion AS ENUM (
  'starter',
  'basico',
  'pro',
  'enterprise'
);

CREATE TYPE estado_alumno AS ENUM (
  'activo',
  'inactivo',
  'suspendido',
  'retirado'
);

CREATE TYPE tipo_asistencia AS ENUM (
  'presente',
  'ausente',
  'tardanza',
  'excusa_medica',
  'excusa_familiar'
);

CREATE TYPE tipo_documento AS ENUM (
  'consentimiento_informado',
  'ficha_medica',
  'poliza_accidentes',
  'acta_compromiso',
  'certificado_medico',
  'foto_perfil',
  'otro'
);

CREATE TYPE estado_uniforme AS ENUM (
  'asignado',
  'devuelto',
  'perdido',
  'dañado'
);

-- ============================================================
-- TABLA: academias
-- ============================================================

CREATE TABLE academias (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nombre            VARCHAR(200) NOT NULL,
  nit               VARCHAR(20) UNIQUE,
  ciudad            VARCHAR(100) NOT NULL DEFAULT 'Medellín',
  departamento      VARCHAR(100) NOT NULL DEFAULT 'Antioquia',
  direccion         TEXT,
  telefono          VARCHAR(20),
  email_contacto    VARCHAR(200),
  logo_url          TEXT,
  plan_suscripcion  plan_suscripcion NOT NULL DEFAULT 'starter',
  suscripcion_activa BOOLEAN NOT NULL DEFAULT TRUE,
  fecha_vencimiento_plan TIMESTAMPTZ,
  max_alumnos       INTEGER NOT NULL DEFAULT 30,
  config            JSONB NOT NULL DEFAULT '{}',
  activa            BOOLEAN NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TABLA: usuarios
-- ============================================================

CREATE TABLE usuarios (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  academia_id       UUID REFERENCES academias(id) ON DELETE CASCADE,
  email             VARCHAR(200) NOT NULL UNIQUE,
  password_hash     TEXT NOT NULL,
  nombre            VARCHAR(100) NOT NULL,
  apellido          VARCHAR(100) NOT NULL,
  telefono          VARCHAR(20),
  foto_url          TEXT,
  rol               rol_usuario NOT NULL,  -- administracion | contable | profesor | padre
  activo            BOOLEAN NOT NULL DEFAULT TRUE,
  email_verificado  BOOLEAN NOT NULL DEFAULT FALSE,
  dos_factores      BOOLEAN NOT NULL DEFAULT FALSE,
  dos_factores_secret TEXT,
  ultimo_login      TIMESTAMPTZ,
  intentos_login    SMALLINT NOT NULL DEFAULT 0,
  bloqueado_hasta   TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_usuarios_academia ON usuarios(academia_id);
CREATE INDEX idx_usuarios_email    ON usuarios(email);
CREATE INDEX idx_usuarios_rol      ON usuarios(academia_id, rol);

-- ============================================================
-- TABLA: refresh_tokens
-- ============================================================

CREATE TABLE refresh_tokens (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  usuario_id  UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  token_hash  TEXT NOT NULL UNIQUE,
  expires_at  TIMESTAMPTZ NOT NULL,
  revocado    BOOLEAN NOT NULL DEFAULT FALSE,
  dispositivo TEXT,
  ip_address  INET,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_refresh_tokens_usuario ON refresh_tokens(usuario_id) WHERE revocado = FALSE;

-- ============================================================
-- TABLA: categorias
-- ============================================================

CREATE TABLE categorias (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  academia_id           UUID NOT NULL REFERENCES academias(id) ON DELETE CASCADE,
  nombre                VARCHAR(100) NOT NULL,
  año_nacimiento_min    SMALLINT,
  año_nacimiento_max    SMALLINT,
  descripcion           TEXT,
  color_categoria       VARCHAR(7) DEFAULT '#006633',
  activa                BOOLEAN NOT NULL DEFAULT TRUE,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(academia_id, nombre)
);

-- ============================================================
-- TABLA: profesores (detalle del rol 'profesor')
-- ============================================================

CREATE TABLE profesores (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  usuario_id        UUID NOT NULL UNIQUE REFERENCES usuarios(id) ON DELETE CASCADE,
  academia_id       UUID NOT NULL REFERENCES academias(id) ON DELETE CASCADE,
  especialidad      VARCHAR(200),
  certificaciones   TEXT[],
  años_experiencia  SMALLINT,
  biografia         TEXT,
  activo            BOOLEAN NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Relación profesor - categorías
CREATE TABLE profesor_categorias (
  profesor_id   UUID NOT NULL REFERENCES profesores(id) ON DELETE CASCADE,
  categoria_id  UUID NOT NULL REFERENCES categorias(id) ON DELETE CASCADE,
  es_principal  BOOLEAN NOT NULL DEFAULT FALSE,
  assigned_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (profesor_id, categoria_id)
);

-- ============================================================
-- TABLA: alumnos
-- ============================================================

CREATE TABLE alumnos (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  academia_id       UUID NOT NULL REFERENCES academias(id) ON DELETE CASCADE,
  categoria_id      UUID REFERENCES categorias(id) ON DELETE SET NULL,
  nombre            VARCHAR(100) NOT NULL,
  apellido          VARCHAR(100) NOT NULL,
  fecha_nacimiento  DATE NOT NULL,
  genero            CHAR(1) CHECK (genero IN ('M', 'F', 'O')),
  numero_documento  VARCHAR(30),
  foto_url          TEXT,
  posicion_preferida VARCHAR(50),
  numero_camiseta   SMALLINT,
  estado            estado_alumno NOT NULL DEFAULT 'activo',
  fecha_ingreso     DATE NOT NULL DEFAULT CURRENT_DATE,
  fecha_retiro      DATE,
  observaciones_medicas TEXT,
  grupo_sanguineo   VARCHAR(5),
  alergias          TEXT[],
  contacto_emergencia_nombre  VARCHAR(200),
  contacto_emergencia_telefono VARCHAR(20),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_alumnos_academia  ON alumnos(academia_id);
CREATE INDEX idx_alumnos_categoria ON alumnos(categoria_id);
CREATE INDEX idx_alumnos_estado    ON alumnos(academia_id, estado);
CREATE INDEX idx_alumnos_nombre    ON alumnos USING gin(nombre gin_trgm_ops);

-- ============================================================
-- TABLA: padres_alumnos (un padre puede tener varios hijos)
-- ============================================================

CREATE TABLE padres_alumnos (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  padre_id      UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  alumno_id     UUID NOT NULL REFERENCES alumnos(id) ON DELETE CASCADE,
  parentesco    VARCHAR(50) NOT NULL DEFAULT 'padre',
  es_acudiente  BOOLEAN NOT NULL DEFAULT FALSE,
  puede_recoger BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(padre_id, alumno_id)
);

-- ============================================================
-- TABLA: entrenamientos
-- ============================================================

CREATE TABLE entrenamientos (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  academia_id   UUID NOT NULL REFERENCES academias(id) ON DELETE CASCADE,
  categoria_id  UUID NOT NULL REFERENCES categorias(id) ON DELETE CASCADE,
  profesor_id   UUID REFERENCES profesores(id) ON DELETE SET NULL,
  titulo        VARCHAR(200) NOT NULL DEFAULT 'Entrenamiento',
  descripcion   TEXT,
  fecha         DATE NOT NULL,
  hora_inicio   TIME NOT NULL,
  hora_fin      TIME NOT NULL,
  lugar         VARCHAR(200) NOT NULL DEFAULT 'Cancha Principal',
  cancelado     BOOLEAN NOT NULL DEFAULT FALSE,
  motivo_cancelacion TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TABLA: asistencias
-- ============================================================

CREATE TABLE asistencias (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  entrenamiento_id  UUID NOT NULL REFERENCES entrenamientos(id) ON DELETE CASCADE,
  alumno_id         UUID NOT NULL REFERENCES alumnos(id) ON DELETE CASCADE,
  estado            tipo_asistencia NOT NULL DEFAULT 'presente',
  observacion       TEXT,
  registrado_por    UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  registered_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(entrenamiento_id, alumno_id)
);

-- ============================================================
-- TABLA: evaluaciones_tecnicas
-- ============================================================

CREATE TABLE evaluaciones_tecnicas (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  alumno_id           UUID NOT NULL REFERENCES alumnos(id) ON DELETE CASCADE,
  profesor_id         UUID REFERENCES profesores(id) ON DELETE SET NULL,
  fecha               DATE NOT NULL,
  velocidad           NUMERIC(3,1) CHECK (velocidad BETWEEN 1 AND 10),
  resistencia         NUMERIC(3,1) CHECK (resistencia BETWEEN 1 AND 10),
  coordinacion        NUMERIC(3,1) CHECK (coordinacion BETWEEN 1 AND 10),
  control_balon       NUMERIC(3,1) CHECK (control_balon BETWEEN 1 AND 10),
  toma_decisiones     NUMERIC(3,1) CHECK (toma_decisiones BETWEEN 1 AND 10),
  pase_precision      NUMERIC(3,1) CHECK (pase_precision BETWEEN 1 AND 10),
  remate              NUMERIC(3,1) CHECK (remate BETWEEN 1 AND 10),
  posicionamiento     NUMERIC(3,1) CHECK (posicionamiento BETWEEN 1 AND 10),
  nota_global         NUMERIC(3,1) GENERATED ALWAYS AS (
    ROUND((
      COALESCE(velocidad,0) + COALESCE(resistencia,0) + COALESCE(coordinacion,0) +
      COALESCE(control_balon,0) + COALESCE(toma_decisiones,0) + COALESCE(pase_precision,0) +
      COALESCE(remate,0) + COALESCE(posicionamiento,0)
    ) / NULLIF(
      (CASE WHEN velocidad IS NOT NULL THEN 1 ELSE 0 END +
       CASE WHEN resistencia IS NOT NULL THEN 1 ELSE 0 END +
       CASE WHEN coordinacion IS NOT NULL THEN 1 ELSE 0 END +
       CASE WHEN control_balon IS NOT NULL THEN 1 ELSE 0 END +
       CASE WHEN toma_decisiones IS NOT NULL THEN 1 ELSE 0 END +
       CASE WHEN pase_precision IS NOT NULL THEN 1 ELSE 0 END +
       CASE WHEN remate IS NOT NULL THEN 1 ELSE 0 END +
       CASE WHEN posicionamiento IS NOT NULL THEN 1 ELSE 0 END
      ), 0
    ), 1)
  ) STORED,
  observaciones       TEXT,
  metas_proximas      TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TABLA: evaluaciones_formativas
-- ============================================================

CREATE TABLE evaluaciones_formativas (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  alumno_id       UUID NOT NULL REFERENCES alumnos(id) ON DELETE CASCADE,
  profesor_id     UUID REFERENCES profesores(id) ON DELETE SET NULL,
  mes             SMALLINT NOT NULL CHECK (mes BETWEEN 1 AND 12),
  año             SMALLINT NOT NULL,
  comportamiento  SMALLINT CHECK (comportamiento BETWEEN 1 AND 5),
  disciplina      SMALLINT CHECK (disciplina BETWEEN 1 AND 5),
  liderazgo       SMALLINT CHECK (liderazgo BETWEEN 1 AND 5),
  trabajo_equipo  SMALLINT CHECK (trabajo_equipo BETWEEN 1 AND 5),
  valores         SMALLINT CHECK (valores BETWEEN 1 AND 5),
  puntualidad     SMALLINT CHECK (puntualidad BETWEEN 1 AND 5),
  observaciones   TEXT,
  recomendaciones TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(alumno_id, mes, año)
);

-- ============================================================
-- TABLA: pagos (módulo exclusivo del contable)
-- ============================================================

CREATE TABLE pagos (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  academia_id         UUID NOT NULL REFERENCES academias(id) ON DELETE CASCADE,
  alumno_id           UUID NOT NULL REFERENCES alumnos(id) ON DELETE CASCADE,
  generado_por        UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  concepto            VARCHAR(200) NOT NULL DEFAULT 'Mensualidad',
  descripcion         TEXT,
  monto               NUMERIC(12,2) NOT NULL,
  moneda              CHAR(3) NOT NULL DEFAULT 'COP',
  fecha_vencimiento   DATE NOT NULL,
  fecha_pago          TIMESTAMPTZ,
  estado              estado_pago NOT NULL DEFAULT 'pendiente',
  metodo_pago         VARCHAR(50),
  referencia_pago     VARCHAR(200),
  referencia_interna  VARCHAR(100) UNIQUE,
  recibo_url          TEXT,
  metadata            JSONB DEFAULT '{}',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_pagos_academia ON pagos(academia_id, estado);
CREATE INDEX idx_pagos_alumno   ON pagos(alumno_id, fecha_vencimiento DESC);
CREATE INDEX idx_pagos_mora     ON pagos(estado) WHERE estado IN ('pendiente', 'vencido');

-- ============================================================
-- TABLA: conversaciones y mensajes
-- ============================================================

CREATE TABLE conversaciones (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  academia_id   UUID NOT NULL REFERENCES academias(id) ON DELETE CASCADE,
  tipo          tipo_conversacion NOT NULL DEFAULT 'directa',
  titulo        VARCHAR(200),
  categoria_id  UUID REFERENCES categorias(id) ON DELETE SET NULL,
  archivada     BOOLEAN NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE conversacion_participantes (
  conversacion_id UUID NOT NULL REFERENCES conversaciones(id) ON DELETE CASCADE,
  usuario_id      UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  es_admin        BOOLEAN NOT NULL DEFAULT FALSE,
  silenciada      BOOLEAN NOT NULL DEFAULT FALSE,
  unido_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ultimo_leido_at TIMESTAMPTZ,
  PRIMARY KEY (conversacion_id, usuario_id)
);

CREATE TABLE mensajes (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversacion_id   UUID NOT NULL REFERENCES conversaciones(id) ON DELETE CASCADE,
  sender_id         UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  contenido         TEXT NOT NULL,
  tipo              tipo_mensaje NOT NULL DEFAULT 'texto',
  media_url         TEXT,
  editado           BOOLEAN NOT NULL DEFAULT FALSE,
  eliminado         BOOLEAN NOT NULL DEFAULT FALSE,
  respuesta_a       UUID REFERENCES mensajes(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_mensajes_conversacion ON mensajes(conversacion_id, created_at DESC)
  WHERE eliminado = FALSE;

-- ============================================================
-- TABLA: notificaciones
-- ============================================================

CREATE TABLE notificaciones (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  usuario_id      UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  tipo            VARCHAR(100) NOT NULL,
  titulo          VARCHAR(200) NOT NULL,
  cuerpo          TEXT NOT NULL,
  leida           BOOLEAN NOT NULL DEFAULT FALSE,
  link            TEXT,
  metadata        JSONB DEFAULT '{}',
  enviada_push    BOOLEAN NOT NULL DEFAULT FALSE,
  enviada_email   BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notificaciones_usuario ON notificaciones(usuario_id, leida, created_at DESC);

-- ============================================================
-- TABLA: documentos y seguimiento físico
-- ============================================================

CREATE TABLE seguimiento_fisico (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  alumno_id             UUID NOT NULL REFERENCES alumnos(id) ON DELETE CASCADE,
  registrado_por        UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  fecha                 DATE NOT NULL,
  peso_kg               NUMERIC(5,2),
  talla_cm              NUMERIC(5,2),
  imc                   NUMERIC(4,2) GENERATED ALWAYS AS (
    CASE WHEN talla_cm > 0 THEN ROUND(peso_kg / POWER(talla_cm / 100.0, 2), 2) ELSE NULL END
  ) STORED,
  observaciones         TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TABLA: logs_auditoria (Ley 1581 Colombia)
-- ============================================================

CREATE TABLE logs_auditoria (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  academia_id   UUID REFERENCES academias(id) ON DELETE SET NULL,
  usuario_id    UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  accion        VARCHAR(100) NOT NULL,
  recurso       VARCHAR(100) NOT NULL,
  recurso_id    UUID,
  detalles      JSONB DEFAULT '{}',
  ip_address    INET,
  user_agent    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
) PARTITION BY RANGE (created_at);

CREATE TABLE logs_auditoria_2026 PARTITION OF logs_auditoria
  FOR VALUES FROM ('2026-01-01') TO ('2027-01-01');
CREATE TABLE logs_auditoria_2027 PARTITION OF logs_auditoria
  FOR VALUES FROM ('2027-01-01') TO ('2028-01-01');

-- ============================================================
-- FUNCIÓN: updated_at automático
-- ============================================================

CREATE OR REPLACE FUNCTION actualizar_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE tabla TEXT;
BEGIN
  FOREACH tabla IN ARRAY ARRAY[
    'academias', 'usuarios', 'categorias', 'profesores', 'alumnos',
    'entrenamientos', 'evaluaciones_formativas', 'pagos',
    'conversaciones', 'mensajes'
  ] LOOP
    EXECUTE format(
      'CREATE TRIGGER trg_updated_at_%s BEFORE UPDATE ON %s
       FOR EACH ROW EXECUTE FUNCTION actualizar_updated_at()',
      tabla, tabla
    );
  END LOOP;
END; $$;

-- Función: marcar pagos vencidos (ejecutar con cron diario)
CREATE OR REPLACE FUNCTION actualizar_pagos_vencidos()
RETURNS INTEGER AS $$
DECLARE filas INTEGER;
BEGIN
  UPDATE pagos SET estado = 'vencido', updated_at = NOW()
  WHERE estado = 'pendiente' AND fecha_vencimiento < CURRENT_DATE;
  GET DIAGNOSTICS filas = ROW_COUNT;
  RETURN filas;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- ROW LEVEL SECURITY (multi-tenant)
-- ============================================================

ALTER TABLE alumnos              ENABLE ROW LEVEL SECURITY;
ALTER TABLE usuarios             ENABLE ROW LEVEL SECURITY;
ALTER TABLE pagos                ENABLE ROW LEVEL SECURITY;
ALTER TABLE evaluaciones_tecnicas ENABLE ROW LEVEL SECURITY;

CREATE POLICY academia_isolation_alumnos ON alumnos
  USING (academia_id = current_setting('app.current_academia_id', true)::UUID);

CREATE POLICY academia_isolation_pagos ON pagos
  USING (academia_id = current_setting('app.current_academia_id', true)::UUID);

-- ============================================================
-- VISTAS
-- ============================================================

CREATE OR REPLACE VIEW v_asistencia_mensual AS
SELECT
  al.id AS alumno_id,
  al.nombre || ' ' || al.apellido AS alumno_nombre,
  al.academia_id, al.categoria_id,
  DATE_TRUNC('month', e.fecha) AS mes,
  COUNT(*) AS total_sesiones,
  COUNT(*) FILTER (WHERE a.estado = 'presente') AS sesiones_presente,
  COUNT(*) FILTER (WHERE a.estado = 'ausente')  AS sesiones_ausente,
  ROUND(COUNT(*) FILTER (WHERE a.estado IN ('presente','tardanza'))::NUMERIC / NULLIF(COUNT(*),0) * 100, 1) AS porcentaje_asistencia
FROM alumnos al
JOIN asistencias a      ON a.alumno_id         = al.id
JOIN entrenamientos e   ON e.id                = a.entrenamiento_id
GROUP BY al.id, al.nombre, al.apellido, al.academia_id, al.categoria_id, DATE_TRUNC('month', e.fecha);

CREATE OR REPLACE VIEW v_cartera_morosa AS
SELECT p.academia_id,
       a.nombre || ' ' || a.apellido AS alumno_nombre,
       p.concepto, p.monto, p.fecha_vencimiento,
       CURRENT_DATE - p.fecha_vencimiento AS dias_vencido
FROM pagos p
JOIN alumnos a ON a.id = p.alumno_id
WHERE p.estado IN ('pendiente','vencido') AND p.fecha_vencimiento < CURRENT_DATE
ORDER BY dias_vencido DESC;

-- ============================================================
-- SEED: Datos iniciales
-- ============================================================

INSERT INTO academias (id, nombre, nit, ciudad, plan_suscripcion, max_alumnos)
VALUES ('00000000-0000-0000-0000-000000000001', 'Futuro Antioquia', '900123456-1', 'Medellín', 'pro', 300);

-- Administración
INSERT INTO usuarios (id, academia_id, email, password_hash, nombre, apellido, rol, email_verificado)
VALUES (
  '00000000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000001',
  'admin@futuroantioquia.com',
  '$2b$12$placeholder_CAMBIAR_EN_PRODUCCION',
  'Administrador', 'Principal', 'administracion', TRUE
);

-- Contable
INSERT INTO usuarios (id, academia_id, email, password_hash, nombre, apellido, rol, email_verificado)
VALUES (
  '00000000-0000-0000-0000-000000000003',
  '00000000-0000-0000-0000-000000000001',
  'contable@futuroantioquia.com',
  '$2b$12$placeholder_CAMBIAR_EN_PRODUCCION',
  'María', 'Ramírez', 'contable', TRUE
);

-- Categorías estándar
INSERT INTO categorias (academia_id, nombre, año_nacimiento_min, año_nacimiento_max) VALUES
  ('00000000-0000-0000-0000-000000000001', 'Baby Fútbol', 2020, 2022),
  ('00000000-0000-0000-0000-000000000001', 'Sub-7',       2018, 2019),
  ('00000000-0000-0000-0000-000000000001', 'Sub-9',       2016, 2017),
  ('00000000-0000-0000-0000-000000000001', 'Sub-11',      2014, 2015),
  ('00000000-0000-0000-0000-000000000001', 'Sub-13',      2012, 2013),
  ('00000000-0000-0000-0000-000000000001', 'Sub-15',      2010, 2011),
  ('00000000-0000-0000-0000-000000000001', 'Sub-17',      2008, 2009);

-- ============================================================
-- FIN — Versión 2.0 | 4 roles: administracion, contable, profesor, padre
-- ============================================================
