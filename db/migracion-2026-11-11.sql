-- Duración propia por reserva (anotadas a mano, ej. 1 hora). 0 = la general.
ALTER TABLE reservas ADD COLUMN duracion INTEGER DEFAULT 0;
