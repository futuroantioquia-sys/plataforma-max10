-- ============================================================
-- FUTURO ANTIOQUIA — Schema real de la app
-- Ejecutar en: supabase.com → SQL Editor → New Query
-- ============================================================

-- ── Tabla principal de deportistas ───────────────────────────
CREATE TABLE IF NOT EXISTS deportistas (
  id         TEXT PRIMARY KEY,          -- mismo ID que usa la app (timestamp-random)
  nombre     TEXT NOT NULL,
  columnas   JSONB NOT NULL DEFAULT '{}', -- todos los campos del Excel
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── Pagos por deportista y concepto ──────────────────────────
CREATE TABLE IF NOT EXISTS pagos_estado (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deportista_id TEXT NOT NULL REFERENCES deportistas(id) ON DELETE CASCADE,
  detalle       TEXT NOT NULL,            -- MATRÍCULA, FEBRERO, MARZO … DICIEMBRE
  estado        TEXT NOT NULL DEFAULT 'PEND', -- PEND | PAGÓ | PAGÓ CON 10%
  v_pagado      TEXT DEFAULT '',
  v_cargado     TEXT DEFAULT '',
  destino       TEXT DEFAULT '',
  fecha         TEXT DEFAULT '',
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(deportista_id, detalle)
);

-- ── Fotos (base64) ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS deportistas_fotos (
  deportista_id TEXT PRIMARY KEY REFERENCES deportistas(id) ON DELETE CASCADE,
  foto_base64   TEXT NOT NULL,
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ── Índices ──────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_pagos_dep ON pagos_estado(deportista_id);

-- ── Función auto-update updated_at ───────────────────────────
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_deportistas_upd ON deportistas;
CREATE TRIGGER trg_deportistas_upd
  BEFORE UPDATE ON deportistas
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_pagos_upd ON pagos_estado;
CREATE TRIGGER trg_pagos_upd
  BEFORE UPDATE ON pagos_estado
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── Row Level Security (acceso abierto para anon) ────────────
ALTER TABLE deportistas       ENABLE ROW LEVEL SECURITY;
ALTER TABLE pagos_estado       ENABLE ROW LEVEL SECURITY;
ALTER TABLE deportistas_fotos  ENABLE ROW LEVEL SECURITY;

-- Permitir TODO al anon (la app no usa auth por ahora)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'deportistas' AND policyname = 'anon_all'
  ) THEN
    CREATE POLICY "anon_all" ON deportistas      FOR ALL TO anon USING (true) WITH CHECK (true);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'pagos_estado' AND policyname = 'anon_all'
  ) THEN
    CREATE POLICY "anon_all" ON pagos_estado      FOR ALL TO anon USING (true) WITH CHECK (true);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'deportistas_fotos' AND policyname = 'anon_all'
  ) THEN
    CREATE POLICY "anon_all" ON deportistas_fotos FOR ALL TO anon USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ============================================================
-- ✅ LISTO
-- Ahora ve a: supabase.com/dashboard/project/fykdyalpuydkwfjqguip/editor
-- y ejecuta este SQL
-- ============================================================
