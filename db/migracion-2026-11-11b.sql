-- Fichas hechas en papel (presencial): cuentan como completas.
ALTER TABLE reservas ADD COLUMN fichas_papel INTEGER DEFAULT 0;
