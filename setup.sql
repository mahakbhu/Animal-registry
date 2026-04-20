-- ═══════════════════════════════════════════════════════════════
--  Animal Sample Registry — Supabase Database Setup
--  Run this entire script once in your Supabase SQL Editor:
--  https://supabase.com/dashboard → your project → SQL Editor
-- ═══════════════════════════════════════════════════════════════


-- ── 1. Animals table ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS animals (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  animal_id          TEXT NOT NULL,
  species            TEXT,
  date_of_birth      DATE,
  date_of_sacrifice  DATE,
  gender             TEXT CHECK (gender IN ('M','F','U')),
  genotype           TEXT,
  litter_group       TEXT,
  cohort             TEXT,
  owner              TEXT,
  entered_by         TEXT,
  created_by         TEXT,
  tags               TEXT[]    DEFAULT '{}',
  samples            TEXT[]    DEFAULT '{}',
  notes              TEXT,
  created_at         TIMESTAMPTZ DEFAULT NOW(),
  updated_at         TIMESTAMPTZ DEFAULT NOW()
);

-- Unique animal IDs within the registry
CREATE UNIQUE INDEX IF NOT EXISTS animals_animal_id_idx ON animals(animal_id);

-- Useful indexes for filtering
CREATE INDEX IF NOT EXISTS animals_genotype_idx        ON animals(genotype);
CREATE INDEX IF NOT EXISTS animals_owner_idx           ON animals(owner);
CREATE INDEX IF NOT EXISTS animals_cohort_idx          ON animals(cohort);
CREATE INDEX IF NOT EXISTS animals_date_of_sacrifice_idx ON animals(date_of_sacrifice);
CREATE INDEX IF NOT EXISTS animals_species_idx         ON animals(species);


-- ── 2. Phenotype notes table ──────────────────────────────────
CREATE TABLE IF NOT EXISTS phenotype_notes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  animal_id   TEXT REFERENCES animals(animal_id) ON DELETE SET NULL,
  author      TEXT,
  category    TEXT DEFAULT 'General',
  note_date   DATE,
  body        TEXT NOT NULL,
  created_by  TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS notes_animal_id_idx  ON phenotype_notes(animal_id);
CREATE INDEX IF NOT EXISTS notes_category_idx   ON phenotype_notes(category);


-- ── 3. Audit log table ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_name   TEXT NOT NULL,
  action      TEXT NOT NULL,
  detail      TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS audit_user_idx   ON audit_log(user_name);
CREATE INDEX IF NOT EXISTS audit_action_idx ON audit_log(action);


-- ── 4. Auto-update updated_at on animals ──────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER animals_updated_at
  BEFORE UPDATE ON animals
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- ── 5. Row Level Security ─────────────────────────────────────
--  This app uses name-based identity (no Supabase auth accounts).
--  We enable RLS but allow all operations from any authenticated
--  or anonymous connection — security is handled by restricting
--  the anon key to your lab network / trusted users.
--
--  If you want stricter access in future, replace these policies
--  with user-specific ones tied to supabase.auth.uid().

ALTER TABLE animals         ENABLE ROW LEVEL SECURITY;
ALTER TABLE phenotype_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log       ENABLE ROW LEVEL SECURITY;

-- Allow all operations (read + write) for anyone with the anon key
CREATE POLICY "Allow all for anon" ON animals         FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for anon" ON phenotype_notes FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for anon" ON audit_log       FOR ALL USING (true) WITH CHECK (true);


-- ── 6. Enable Realtime ────────────────────────────────────────
--  Also enable realtime in the Supabase dashboard:
--  Database → Replication → enable for: animals, phenotype_notes, audit_log

ALTER PUBLICATION supabase_realtime ADD TABLE animals;
ALTER PUBLICATION supabase_realtime ADD TABLE phenotype_notes;
ALTER PUBLICATION supabase_realtime ADD TABLE audit_log;


-- ═══════════════════════════════════════════════════════════════
--  Done! Now:
--  1. Copy your Project URL and anon key from Project Settings → API
--  2. Paste them into config.js in the website folder
--  3. Open index.html in your browser
-- ═══════════════════════════════════════════════════════════════
