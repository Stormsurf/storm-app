-- Clientes guardados (por ejemplo, los que venían de AgendaPro). Los que ya reservaron salen de la tabla reservas.
CREATE TABLE IF NOT EXISTS clientes (
  nombre TEXT NOT NULL,
  telefono TEXT NOT NULL DEFAULT '',
  correo TEXT NOT NULL DEFAULT '',
  origen TEXT NOT NULL DEFAULT '',
  creado TEXT NOT NULL DEFAULT ''
);
CREATE UNIQUE INDEX IF NOT EXISTS clientes_nombre ON clientes (lower(nombre));
