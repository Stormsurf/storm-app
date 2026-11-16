-- Packs de clases particulares (Isidora 16-11-2026): 5 clases con 10% de descuento, se paga una vez.
CREATE TABLE IF NOT EXISTS packs (id TEXT PRIMARY KEY, creada TEXT NOT NULL, creada_ms INTEGER NOT NULL, nombre TEXT NOT NULL, telefono TEXT NOT NULL DEFAULT '', correo TEXT NOT NULL DEFAULT '', personas INTEGER NOT NULL DEFAULT 1, clases INTEGER NOT NULL DEFAULT 5, total INTEGER NOT NULL DEFAULT 0, medio TEXT NOT NULL DEFAULT 'Por pagar', fecha_pago TEXT NOT NULL DEFAULT '', estado TEXT NOT NULL DEFAULT 'activo', nota TEXT NOT NULL DEFAULT '');
-- Clase que se pagó con un pack: id del pack (la clase va en $0 con medio 'Pack')
ALTER TABLE reservas ADD COLUMN pack TEXT NOT NULL DEFAULT '';
