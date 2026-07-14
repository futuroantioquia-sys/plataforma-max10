-- ============================================================
-- FUTURO ANTIOQUIA — Tabla faltante: profes
-- Ejecutar en: supabase.com → SQL Editor → New Query
--
-- Esta tabla NUNCA fue creada en Supabase. El código en
-- frontend/src/lib/db.ts (getProfes / saveProfes) ya intenta
-- leer y escribir en ella, pero como no existía, cada intento
-- fallaba en silencio y los profesores + proyectos asignados
-- solo quedaban guardados en el localStorage del navegador
-- (clave 'futuro_profes'), no en la base de datos real.
-- ============================================================

CREATE TABLE IF NOT EXISTS profes (
  id         TEXT PRIMARY KEY,                 -- uuid/id generado en cliente
  usuario    TEXT NOT NULL UNIQUE,              -- apellido en mayúsculas (login)
  clave      TEXT NOT NULL,                     -- cédula
  proyectos  TEXT[] NOT NULL DEFAULT '{}',      -- proyectos a los que puede acceder
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_profes_usuario ON profes(usuario);

-- ── RLS: acceso abierto (anon), igual que el resto de tablas ──
ALTER TABLE profes ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='profes' AND policyname='anon_all') THEN
    CREATE POLICY "anon_all" ON profes FOR ALL TO anon USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ── Trigger updated_at (reutiliza la función set_updated_at ya creada) ──
DROP TRIGGER IF EXISTS trg_profes_upd ON profes;
CREATE TRIGGER trg_profes_upd BEFORE UPDATE ON profes FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── Seed: profesores iniciales (mismos del fallback hardcodeado en db.ts) ──
-- Usa ON CONFLICT para no duplicar ni pisar proyectos ya asignados manualmente.
INSERT INTO profes (id, usuario, clave, proyectos) VALUES
  ('pi-01', 'CASTRO',   '1214734807', '{}'),
  ('pi-02', 'MEJIA',    '1152192324', '{}'),
  ('pi-03', 'RAMIREZ',  '1017258984', '{}'),
  ('pi-04', 'SAMUEL',   '1000415036', '{}'),
  ('pi-05', 'TABARES',  '1000084856', '{}'),
  ('pi-06', 'CHALARCA', '1128389946', '{}'),
  ('pi-07', 'RIOS',     '1036639022', '{}'),
  ('pi-08', 'JESUS',    '1003404311', '{}'),
  ('pi-09', 'MARTIN',   '1013458275', '{}'),
  ('pi-10', 'MARLON',   '1017192180', '{}'),
  ('pi-11', 'ALEX',     '1020464354', '{}'),
  ('pi-12', 'DORIA',    '1003050289', '{}'),
  ('pi-13', 'MUÑOZ',    '1034776238', '{}'),
  ('pi-14', 'ALVAREZ',  '1033180115', '{}'),
  ('pi-15', 'DUVAN',    '1002066215', '{}'),
  ('pi-16', 'GIRALDO',  '1127792656', '{}'),
  ('pi-17', 'NICOLAS',  '1005372826', '{}'),
  ('pi-18', 'KAREN',    '1000870631', '{}'),
  ('pi-19', 'CAMILA',   '1193081467', '{}'),
  ('pi-20', 'EDGAR',    '98539787',   '{}'),
  ('pi-21', 'JIMENEZ',  '1036864427', '{}'),
  ('pi-22', 'GUZMAN',   '1000203538', '{}')
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- ✅ LISTO - Ejecutar en supabase.com → SQL Editor → New Query
-- ============================================================
