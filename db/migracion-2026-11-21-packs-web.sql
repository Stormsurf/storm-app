-- Packs comprados en la web (21-11-2026): llave del link personal y niños menores de 8 del pack
ALTER TABLE packs ADD COLUMN clave TEXT NOT NULL DEFAULT '';
ALTER TABLE packs ADD COLUMN menores INTEGER NOT NULL DEFAULT 0;
ALTER TABLE packs ADD COLUMN nivel TEXT NOT NULL DEFAULT '';
