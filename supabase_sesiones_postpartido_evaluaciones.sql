-- ============================================================
-- FUTURO ANTIOQUIA — Tablas nuevas: evaluaciones, sesiones_entrenamiento, postpartidos
-- Ejecutar en: supabase.com → SQL Editor → New Query
--
-- Completa los 4 formatos deportivos del profesor (plan de acción,
-- Fase 1): Asistencia (ya existía) + Sesiones + Postpartido + Valoraciones.
--
-- "evaluaciones" reemplaza el localStorage de la página /evaluaciones:
-- antes cada guardado sobreescribía el único registro del navegador;
-- ahora cada guardado es una fila nueva → historial real por deportista.
-- ============================================================

-- ── EVALUACIONES (Valoración deportiva) ───────────────────────
CREATE TABLE IF NOT EXISTS evaluaciones (
  id                TEXT PRIMARY KEY,
  fecha             TEXT NOT NULL,
  codigo            TEXT NOT NULL,
  nombre            TEXT,
  edad              TEXT,
  proyecto          TEXT,
  perfil            TEXT,
  posicion          TEXT,
  torneos           TEXT,
  part_jugados      TEXT,
  tarj_amarillas    TEXT,
  part_titular      TEXT,
  tarj_rojas        TEXT,
  minutos_jugados   TEXT,
  goles             TEXT,
  calificacion      TEXT,
  foto              TEXT,
  fuerza_nivel      TEXT, fuerza_desc      TEXT,
  velocidad_nivel   TEXT, velocidad_desc   TEXT,
  resistencia_nivel TEXT, resistencia_desc TEXT,
  control_nivel     TEXT, control_desc     TEXT,
  pase_nivel        TEXT, pase_desc        TEXT,
  remata_nivel      TEXT, remata_desc      TEXT,
  conducta_nivel    TEXT, conducta_desc    TEXT,
  posicion_nivel    TEXT, posicion_desc    TEXT,
  vision_nivel      TEXT, vision_desc      TEXT,
  defensa_nivel     TEXT, defensa_desc     TEXT,
  actitud_nivel     TEXT, actitud_desc     TEXT,
  disciplina_nivel  TEXT, disciplina_desc  TEXT,
  trabajo_nivel     TEXT, trabajo_desc     TEXT,
  observaciones     TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_evaluaciones_codigo ON evaluaciones(codigo);
CREATE INDEX IF NOT EXISTS idx_evaluaciones_fecha  ON evaluaciones(created_at DESC);

ALTER TABLE evaluaciones ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='evaluaciones' AND policyname='anon_all') THEN
    CREATE POLICY "anon_all" ON evaluaciones FOR ALL TO anon USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ── SESIONES DE ENTRENAMIENTO ─────────────────────────────────
CREATE TABLE IF NOT EXISTS sesiones_entrenamiento (
  id             TEXT PRIMARY KEY,
  fecha          TEXT NOT NULL,
  proyecto       TEXT NOT NULL,
  profesor       TEXT,
  objetivo       TEXT,
  ejercicios     TEXT,
  observaciones  TEXT,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_sesiones_proyecto ON sesiones_entrenamiento(proyecto);
CREATE INDEX IF NOT EXISTS idx_sesiones_fecha    ON sesiones_entrenamiento(fecha);

ALTER TABLE sesiones_entrenamiento ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='sesiones_entrenamiento' AND policyname='anon_all') THEN
    CREATE POLICY "anon_all" ON sesiones_entrenamiento FOR ALL TO anon USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ── POSTPARTIDO ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS postpartidos (
  id                     TEXT PRIMARY KEY,
  fecha                  TEXT NOT NULL,
  proyecto               TEXT NOT NULL,
  rival                  TEXT,
  resultado              TEXT,
  observaciones_grupo    TEXT,
  desempeno_individual   JSONB DEFAULT '[]',  -- [{codigo, nombre, observacion}]
  aprendizajes           TEXT,
  created_at             TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_postpartidos_proyecto ON postpartidos(proyecto);
CREATE INDEX IF NOT EXISTS idx_postpartidos_fecha    ON postpartidos(fecha);

ALTER TABLE postpartidos ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='postpartidos' AND policyname='anon_all') THEN
    CREATE POLICY "anon_all" ON postpartidos FOR ALL TO anon USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ============================================================
-- ✅ LISTO - Ejecutar en supabase.com → SQL Editor → New Query
-- ============================================================
