-- ============================================================
-- FUTURO ANTIOQUIA — Setup en Supabase
-- Ejecutar en: supabase.com → SQL Editor → New Query
-- ============================================================

-- PASO 1: Extensiones
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- PASO 2: Tipos enumerados
DO $$ BEGIN
  CREATE TYPE rol_usuario AS ENUM ('administracion','contable','profesor','padre');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE estado_pago AS ENUM ('pendiente','pagado','vencido','cancelado','reembolsado');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE estado_alumno AS ENUM ('activo','inactivo','suspendido','retirado');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE tipo_asistencia AS ENUM ('presente','ausente','tardanza','excusa_medica','excusa_familiar');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE plan_suscripcion AS ENUM ('starter','basico','pro','enterprise');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- PASO 3: Tabla academias
CREATE TABLE IF NOT EXISTS academias (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nombre           VARCHAR(200) NOT NULL,
  nit              VARCHAR(20) UNIQUE,
  ciudad           VARCHAR(100) NOT NULL DEFAULT 'Medellín',
  departamento     VARCHAR(100) NOT NULL DEFAULT 'Antioquia',
  direccion        TEXT,
  telefono         VARCHAR(20),
  email_contacto   VARCHAR(200),
  logo_url         TEXT,
  plan_suscripcion plan_suscripcion NOT NULL DEFAULT 'starter',
  max_alumnos      INTEGER NOT NULL DEFAULT 30,
  config           JSONB NOT NULL DEFAULT '{}',
  activa           BOOLEAN NOT NULL DEFAULT TRUE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- PASO 4: Tabla usuarios (vinculada a auth.users de Supabase)
-- IMPORTANTE: el id debe coincidir con auth.users.id
CREATE TABLE IF NOT EXISTS usuarios (
  id               UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  academia_id      UUID REFERENCES academias(id) ON DELETE CASCADE,
  email            VARCHAR(200) NOT NULL,
  nombre           VARCHAR(100) NOT NULL,
  apellido         VARCHAR(100) NOT NULL,
  telefono         VARCHAR(20),
  foto_url         TEXT,
  rol              rol_usuario NOT NULL DEFAULT 'padre',
  activo           BOOLEAN NOT NULL DEFAULT TRUE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- PASO 5: Categorías
CREATE TABLE IF NOT EXISTS categorias (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  academia_id        UUID NOT NULL REFERENCES academias(id) ON DELETE CASCADE,
  nombre             VARCHAR(100) NOT NULL,
  año_nacimiento_min SMALLINT,
  año_nacimiento_max SMALLINT,
  color_categoria    VARCHAR(7) DEFAULT '#006633',
  activa             BOOLEAN NOT NULL DEFAULT TRUE,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(academia_id, nombre)
);

-- PASO 6: Alumnos
CREATE TABLE IF NOT EXISTS alumnos (
  id                            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  academia_id                   UUID NOT NULL REFERENCES academias(id) ON DELETE CASCADE,
  categoria_id                  UUID REFERENCES categorias(id) ON DELETE SET NULL,
  nombre                        VARCHAR(100) NOT NULL,
  apellido                      VARCHAR(100) NOT NULL,
  fecha_nacimiento              DATE NOT NULL,
  genero                        CHAR(1) CHECK (genero IN ('M','F','O')),
  numero_documento              VARCHAR(30),
  foto_url                      TEXT,
  posicion_preferida            VARCHAR(50),
  numero_camiseta               SMALLINT,
  estado                        estado_alumno NOT NULL DEFAULT 'activo',
  fecha_ingreso                 DATE NOT NULL DEFAULT CURRENT_DATE,
  observaciones_medicas         TEXT,
  grupo_sanguineo               VARCHAR(5),
  alergias                      TEXT[],
  contacto_emergencia_nombre    VARCHAR(200),
  contacto_emergencia_telefono  VARCHAR(20),
  created_at                    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_alumnos_academia  ON alumnos(academia_id);
CREATE INDEX IF NOT EXISTS idx_alumnos_categoria ON alumnos(categoria_id);
CREATE INDEX IF NOT EXISTS idx_alumnos_estado    ON alumnos(academia_id, estado);

-- PASO 7: Padres ↔ Alumnos
CREATE TABLE IF NOT EXISTS padres_alumnos (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  padre_id      UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  alumno_id     UUID NOT NULL REFERENCES alumnos(id) ON DELETE CASCADE,
  parentesco    VARCHAR(50) NOT NULL DEFAULT 'padre',
  es_acudiente  BOOLEAN NOT NULL DEFAULT FALSE,
  puede_recoger BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(padre_id, alumno_id)
);

-- PASO 8: Profesores
CREATE TABLE IF NOT EXISTS profesores (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  usuario_id       UUID NOT NULL UNIQUE REFERENCES usuarios(id) ON DELETE CASCADE,
  academia_id      UUID NOT NULL REFERENCES academias(id) ON DELETE CASCADE,
  especialidad     VARCHAR(200),
  certificaciones  TEXT[],
  años_experiencia SMALLINT,
  activo           BOOLEAN NOT NULL DEFAULT TRUE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS profesor_categorias (
  profesor_id  UUID NOT NULL REFERENCES profesores(id) ON DELETE CASCADE,
  categoria_id UUID NOT NULL REFERENCES categorias(id) ON DELETE CASCADE,
  es_principal BOOLEAN NOT NULL DEFAULT FALSE,
  PRIMARY KEY (profesor_id, categoria_id)
);

-- PASO 9: Entrenamientos y asistencia
CREATE TABLE IF NOT EXISTS entrenamientos (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  academia_id       UUID NOT NULL REFERENCES academias(id) ON DELETE CASCADE,
  categoria_id      UUID NOT NULL REFERENCES categorias(id) ON DELETE CASCADE,
  profesor_id       UUID REFERENCES profesores(id) ON DELETE SET NULL,
  titulo            VARCHAR(200) NOT NULL DEFAULT 'Entrenamiento',
  descripcion       TEXT,
  fecha             DATE NOT NULL,
  hora_inicio       TIME NOT NULL,
  hora_fin          TIME NOT NULL,
  lugar             VARCHAR(200) NOT NULL DEFAULT 'Cancha Principal',
  cancelado         BOOLEAN NOT NULL DEFAULT FALSE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS asistencias (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  entrenamiento_id UUID NOT NULL REFERENCES entrenamientos(id) ON DELETE CASCADE,
  alumno_id        UUID NOT NULL REFERENCES alumnos(id) ON DELETE CASCADE,
  estado           tipo_asistencia NOT NULL DEFAULT 'presente',
  observacion      TEXT,
  registrado_por   UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  registered_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(entrenamiento_id, alumno_id)
);

-- PASO 10: Evaluaciones técnicas
CREATE TABLE IF NOT EXISTS evaluaciones_tecnicas (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  alumno_id       UUID NOT NULL REFERENCES alumnos(id) ON DELETE CASCADE,
  profesor_id     UUID REFERENCES profesores(id) ON DELETE SET NULL,
  fecha           DATE NOT NULL,
  velocidad       NUMERIC(3,1) CHECK (velocidad BETWEEN 1 AND 10),
  resistencia     NUMERIC(3,1) CHECK (resistencia BETWEEN 1 AND 10),
  coordinacion    NUMERIC(3,1) CHECK (coordinacion BETWEEN 1 AND 10),
  control_balon   NUMERIC(3,1) CHECK (control_balon BETWEEN 1 AND 10),
  toma_decisiones NUMERIC(3,1) CHECK (toma_decisiones BETWEEN 1 AND 10),
  pase_precision  NUMERIC(3,1) CHECK (pase_precision BETWEEN 1 AND 10),
  remate          NUMERIC(3,1) CHECK (remate BETWEEN 1 AND 10),
  posicionamiento NUMERIC(3,1) CHECK (posicionamiento BETWEEN 1 AND 10),
  observaciones   TEXT,
  metas_proximas  TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- PASO 11: Evaluaciones formativas
CREATE TABLE IF NOT EXISTS evaluaciones_formativas (
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
  UNIQUE(alumno_id, mes, año)
);

-- PASO 12: Pagos (módulo contable)
CREATE TABLE IF NOT EXISTS pagos (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  academia_id       UUID NOT NULL REFERENCES academias(id) ON DELETE CASCADE,
  alumno_id         UUID NOT NULL REFERENCES alumnos(id) ON DELETE CASCADE,
  generado_por      UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  concepto          VARCHAR(200) NOT NULL DEFAULT 'Mensualidad',
  monto             NUMERIC(12,2) NOT NULL,
  moneda            CHAR(3) NOT NULL DEFAULT 'COP',
  fecha_vencimiento DATE NOT NULL,
  fecha_pago        TIMESTAMPTZ,
  estado            estado_pago NOT NULL DEFAULT 'pendiente',
  metodo_pago       VARCHAR(50),
  referencia_pago   VARCHAR(200),
  recibo_url        TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pagos_academia ON pagos(academia_id, estado);
CREATE INDEX IF NOT EXISTS idx_pagos_mora     ON pagos(estado) WHERE estado IN ('pendiente','vencido');

-- PASO 13: Seguimiento físico
CREATE TABLE IF NOT EXISTS seguimiento_fisico (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  alumno_id      UUID NOT NULL REFERENCES alumnos(id) ON DELETE CASCADE,
  registrado_por UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  fecha          DATE NOT NULL,
  peso_kg        NUMERIC(5,2),
  talla_cm       NUMERIC(5,2),
  observaciones  TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- PASO 14: Notificaciones
CREATE TABLE IF NOT EXISTS notificaciones (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  usuario_id   UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  tipo         VARCHAR(100) NOT NULL,
  titulo       VARCHAR(200) NOT NULL,
  cuerpo       TEXT NOT NULL,
  leida        BOOLEAN NOT NULL DEFAULT FALSE,
  link         TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- ROW LEVEL SECURITY (RLS) — Supabase
-- ============================================================

ALTER TABLE usuarios        ENABLE ROW LEVEL SECURITY;
ALTER TABLE alumnos         ENABLE ROW LEVEL SECURITY;
ALTER TABLE pagos            ENABLE ROW LEVEL SECURITY;
ALTER TABLE asistencias      ENABLE ROW LEVEL SECURITY;
ALTER TABLE evaluaciones_tecnicas ENABLE ROW LEVEL SECURITY;

-- Los usuarios ven solo datos de su academia
CREATE POLICY "usuarios_propia_academia" ON usuarios
  FOR ALL USING (
    academia_id = (SELECT academia_id FROM usuarios WHERE id = auth.uid())
  );

CREATE POLICY "alumnos_propia_academia" ON alumnos
  FOR ALL USING (
    academia_id = (SELECT academia_id FROM usuarios WHERE id = auth.uid())
  );

CREATE POLICY "pagos_propia_academia" ON pagos
  FOR ALL USING (
    academia_id = (SELECT academia_id FROM usuarios WHERE id = auth.uid())
  );

-- Los padres solo ven asistencia de SUS hijos
CREATE POLICY "asistencias_mis_hijos" ON asistencias
  FOR SELECT USING (
    alumno_id IN (
      SELECT alumno_id FROM padres_alumnos WHERE padre_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM usuarios WHERE id = auth.uid()
      AND rol IN ('administracion','profesor','contable')
    )
  );

-- ============================================================
-- FUNCIÓN: crear perfil automáticamente al registrar usuario
-- ============================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.usuarios (id, email, nombre, apellido, rol)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'nombre',   'Usuario'),
    COALESCE(NEW.raw_user_meta_data->>'apellido', 'Nuevo'),
    COALESCE(NEW.raw_user_meta_data->>'rol',      'padre')::rol_usuario
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger: ejecutar al crear usuario en Supabase Auth
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- ============================================================
-- DATOS INICIALES
-- ============================================================

INSERT INTO academias (id, nombre, nit, ciudad, plan_suscripcion, max_alumnos)
VALUES ('00000000-0000-0000-0000-000000000001', 'Futuro Antioquia', '900123456-1', 'Medellín', 'pro', 300)
ON CONFLICT DO NOTHING;

INSERT INTO categorias (academia_id, nombre, año_nacimiento_min, año_nacimiento_max) VALUES
  ('00000000-0000-0000-0000-000000000001', 'Baby Fútbol', 2020, 2022),
  ('00000000-0000-0000-0000-000000000001', 'Sub-7',       2018, 2019),
  ('00000000-0000-0000-0000-000000000001', 'Sub-9',       2016, 2017),
  ('00000000-0000-0000-0000-000000000001', 'Sub-11',      2014, 2015),
  ('00000000-0000-0000-0000-000000000001', 'Sub-13',      2012, 2013),
  ('00000000-0000-0000-0000-000000000001', 'Sub-15',      2010, 2011),
  ('00000000-0000-0000-0000-000000000001', 'Sub-17',      2008, 2009)
ON CONFLICT DO NOTHING;

-- ============================================================
-- ✅ LISTO — Ahora ve a Authentication → Users en Supabase
--    y crea tu primer usuario con rol 'administracion'
-- ============================================================
