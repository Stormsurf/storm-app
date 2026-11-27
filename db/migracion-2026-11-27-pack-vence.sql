-- 27-11-2026: vencimiento a mano de un pack (vacío = 1 mes desde el pago). APLICADA en prod 27-11.
ALTER TABLE packs ADD COLUMN vence TEXT NOT NULL DEFAULT '';
