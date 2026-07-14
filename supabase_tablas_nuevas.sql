-- ============================================================
-- FUTURO ANTIOQUIA — Todas las tablas
-- Ejecutar en: supabase.com → SQL Editor → New Query
-- ============================================================

-- ── Función helper para updated_at ───────────────────────────
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

-- ── Deportistas ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS deportistas (
  id         TEXT PRIMARY KEY,            -- UUID generado en cliente
  nombre     TEXT NOT NULL DEFAULT '',
  columnas   JSONB NOT NULL DEFAULT '{}', -- todos los campos del deportista
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_dep_nombre ON deportistas(nombre);

-- ── Pagos por deportista ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS pagos_estado (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deportista_id TEXT NOT NULL,
  detalle       TEXT NOT NULL,   -- 'MATRÍCULA','FEBRERO',...
  estado        TEXT NOT NULL DEFAULT 'PEND', -- 'PEND','PAGÓ','PAGÓ CON 10%','PROX','EXO'
  v_cargado     TEXT DEFAULT '',
  v_pagado      TEXT DEFAULT '',
  destino       TEXT DEFAULT '',
  fecha         TEXT DEFAULT '',
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(deportista_id, detalle)
);
CREATE INDEX IF NOT EXISTS idx_pagos_dep ON pagos_estado(deportista_id);

-- ── Fotos de deportistas ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS fotos_deportistas (
  deportista_id TEXT PRIMARY KEY,
  base64        TEXT NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ── Asistencia ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS asistencia (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proyecto      TEXT NOT NULL DEFAULT '',
  anio_mes      TEXT NOT NULL,          -- 'YYYY-MM'
  deportista_id TEXT NOT NULL,
  fecha         TEXT NOT NULL,          -- 'YYYY-MM-DD'
  estado        TEXT NOT NULL DEFAULT '',
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(proyecto, anio_mes, deportista_id, fecha)
);
CREATE INDEX IF NOT EXISTS idx_asistencia_dep  ON asistencia(deportista_id);
CREATE INDEX IF NOT EXISTS idx_asistencia_mes  ON asistencia(anio_mes);
CREATE INDEX IF NOT EXISTS idx_asistencia_proy ON asistencia(proyecto);

-- ── Vista contable ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS vista_contable (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deportista_id TEXT NOT NULL,
  nombre        TEXT NOT NULL DEFAULT '',
  valores       JSONB NOT NULL DEFAULT '{}',
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(deportista_id)
);

-- ── Bancos histórico ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bancos_historico (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  datos      JSONB NOT NULL DEFAULT '[]',
  batch_id   TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── RLS: acceso abierto (anon) ───────────────────────────────
ALTER TABLE deportistas      ENABLE ROW LEVEL SECURITY;
ALTER TABLE pagos_estado     ENABLE ROW LEVEL SECURITY;
ALTER TABLE fotos_deportistas ENABLE ROW LEVEL SECURITY;
ALTER TABLE asistencia       ENABLE ROW LEVEL SECURITY;
ALTER TABLE vista_contable   ENABLE ROW LEVEL SECURITY;
ALTER TABLE bancos_historico ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='deportistas' AND policyname='anon_all') THEN
    CREATE POLICY "anon_all" ON deportistas FOR ALL TO anon USING (true) WITH CHECK (true);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='pagos_estado' AND policyname='anon_all') THEN
    CREATE POLICY "anon_all" ON pagos_estado FOR ALL TO anon USING (true) WITH CHECK (true);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='fotos_deportistas' AND policyname='anon_all') THEN
    CREATE POLICY "anon_all" ON fotos_deportistas FOR ALL TO anon USING (true) WITH CHECK (true);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='asistencia' AND policyname='anon_all') THEN
    CREATE POLICY "anon_all" ON asistencia FOR ALL TO anon USING (true) WITH CHECK (true);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='vista_contable' AND policyname='anon_all') THEN
    CREATE POLICY "anon_all" ON vista_contable FOR ALL TO anon USING (true) WITH CHECK (true);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='bancos_historico' AND policyname='anon_all') THEN
    CREATE POLICY "anon_all" ON bancos_historico FOR ALL TO anon USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ── Triggers updated_at ───────────────────────────────────────
DROP TRIGGER IF EXISTS trg_dep_upd    ON deportistas;
DROP TRIGGER IF EXISTS trg_pagos_upd  ON pagos_estado;
DROP TRIGGER IF EXISTS trg_fotos_upd  ON fotos_deportistas;
DROP TRIGGER IF EXISTS trg_asis_upd   ON asistencia;
DROP TRIGGER IF EXISTS trg_vc_upd     ON vista_contable;

CREATE TRIGGER trg_dep_upd   BEFORE UPDATE ON deportistas      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_pagos_upd BEFORE UPDATE ON pagos_estado     FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_fotos_upd BEFORE UPDATE ON fotos_deportistas FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_asis_upd  BEFORE UPDATE ON asistencia        FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_vc_upd    BEFORE UPDATE ON vista_contable    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================
-- ✅ LISTO - Ejecutar en supabase.com → SQL Editor → New Query
-- ============================================================
