-- Ya aplicada en la base storm-reservas el 10-11-2026
ALTER TABLE reservas ADD COLUMN pagos TEXT;
ALTER TABLE instructores ADD COLUMN tarifas TEXT;
CREATE TABLE IF NOT EXISTS pagos_semana (instructor TEXT NOT NULL, lunes TEXT NOT NULL, monto INTEGER NOT NULL DEFAULT 0, pagado_el TEXT NOT NULL, por TEXT NOT NULL DEFAULT '', PRIMARY KEY (instructor, lunes));
