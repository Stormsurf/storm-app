-- Storm · Escuela: reservas de clases particulares (base de datos D1 "storm-reservas")
CREATE TABLE IF NOT EXISTS reservas (
  ref TEXT PRIMARY KEY,
  creada TEXT NOT NULL,           -- fecha y hora de Chile en que se hizo (AAAA-MM-DD HH:MM)
  creada_ms INTEGER NOT NULL,
  estado TEXT NOT NULL,           -- pendiente | pagada | cancelada | vencida | revisar
  fecha TEXT NOT NULL,            -- día de la clase AAAA-MM-DD
  hora TEXT NOT NULL,             -- HH:MM
  personas INTEGER NOT NULL,
  menores INTEGER NOT NULL DEFAULT 0,
  instructores TEXT NOT NULL,     -- JSON ["Diego"]
  nombre TEXT NOT NULL,
  telefono TEXT NOT NULL,
  correo TEXT NOT NULL DEFAULT '',
  comentario TEXT NOT NULL DEFAULT '',
  total INTEGER NOT NULL,
  pago_instructor INTEGER NOT NULL, -- total que se paga a los instructores por esta clase
  medio TEXT NOT NULL,            -- Mercado Pago | Transferencia | Efectivo | Por pagar
  orden_mp TEXT NOT NULL DEFAULT '',
  recordatorio INTEGER NOT NULL DEFAULT 0,
  nota TEXT NOT NULL DEFAULT '',
  clave TEXT NOT NULL DEFAULT '',  -- llave del link de la ficha
  link_pago TEXT NOT NULL DEFAULT '', -- link de Mercado Pago (reservas anotadas a mano)
  ninos INTEGER NOT NULL DEFAULT 0, -- niños de 7 a 11 (máx. 3 por instructor)
  pagos TEXT, -- JSON {instructor: monto} (lo que gana cada uno en esta clase)
  duracion INTEGER DEFAULT 0, -- minutos; 0 = la general (1:30)
  fichas_papel INTEGER DEFAULT 0, -- 1 = fichas hechas en papel (presencial)
  nivel TEXT NOT NULL DEFAULT '' -- 'intermedio' = clase para alumnos intermedios
);
CREATE INDEX IF NOT EXISTS reservas_fecha ON reservas(fecha);
CREATE INDEX IF NOT EXISTS reservas_estado ON reservas(estado);
-- Cada clase ocupa bloques de 30 minutos de cada instructor. La llave única impide que se reserve dos veces lo mismo.
CREATE TABLE IF NOT EXISTS bloques (
  instructor TEXT NOT NULL,
  fecha TEXT NOT NULL,
  hora TEXT NOT NULL,
  ref TEXT NOT NULL,
  hasta INTEGER NOT NULL DEFAULT 0, -- 0 = confirmado; si no, hasta cuándo se guarda mientras pagan (ms)
  PRIMARY KEY (instructor, fecha, hora)
);
CREATE INDEX IF NOT EXISTS bloques_ref ON bloques(ref);
CREATE TABLE IF NOT EXISTS instructores (
  nombre TEXT PRIMARY KEY,
  correo TEXT NOT NULL DEFAULT '',
  telefono TEXT NOT NULL DEFAULT '',
  rut TEXT NOT NULL DEFAULT '',
  tarifas TEXT, -- JSON {1..5, grupo}: pago propio por clase (vacío = tabla general)
  activo INTEGER NOT NULL DEFAULT 1,
  orden INTEGER NOT NULL DEFAULT 0
);
-- Semana tipo: qué horas puede cada instructor cada día de la semana (0 = domingo … 6 = sábado).
CREATE TABLE IF NOT EXISTS semana (
  instructor TEXT NOT NULL,
  dia INTEGER NOT NULL,
  horas TEXT NOT NULL,            -- JSON ["09:00","10:30"]
  PRIMARY KEY (instructor, dia)
);
-- Cambios para un día puntual: hora '' = todo el día. libre 1 = disponible, 0 = no disponible.
CREATE TABLE IF NOT EXISTS excepciones (
  instructor TEXT NOT NULL,
  fecha TEXT NOT NULL,
  hora TEXT NOT NULL DEFAULT '',
  libre INTEGER NOT NULL,
  PRIMARY KEY (instructor, fecha, hora)
);
CREATE TABLE IF NOT EXISTS ajustes (
  clave TEXT PRIMARY KEY,
  valor TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS registro (
  ms INTEGER NOT NULL,
  quien TEXT NOT NULL,
  que TEXT NOT NULL
);
-- Horas en que el instructor ya está ocupado en otra cosa: Academia Anual (se lee sola del calendario Storm) o algo fijo semanal
-- (por ejemplo, el taller municipal de Francisco). instructor '*' = todos. fecha '' + dia = se repite cada semana.
CREATE TABLE IF NOT EXISTS ocupaciones (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  origen TEXT NOT NULL,           -- anual | fijo
  instructor TEXT NOT NULL,
  fecha TEXT NOT NULL DEFAULT '',
  dia INTEGER NOT NULL DEFAULT -1,
  desde TEXT NOT NULL,
  hasta TEXT NOT NULL,
  motivo TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS ocupaciones_fecha ON ocupaciones(fecha);
-- Ficha de inscripción y aceptación del riesgo (Sernatur, Decreto 19/2018): una por participante.
CREATE TABLE IF NOT EXISTS fichas (
  ref TEXT NOT NULL,
  n INTEGER NOT NULL,             -- participante 1, 2, 3…
  nombre TEXT NOT NULL,
  datos TEXT NOT NULL,            -- JSON con todo lo que llenó
  firma TEXT NOT NULL,            -- imagen de la firma (data:image/png)
  creada TEXT NOT NULL,
  ip TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (ref, n)
);

-- Pago semanal a instructores (se transfiere los domingos)
CREATE TABLE IF NOT EXISTS pagos_semana (
  instructor TEXT NOT NULL,
  lunes TEXT NOT NULL,
  monto INTEGER NOT NULL DEFAULT 0,
  pagado_el TEXT NOT NULL,
  por TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (instructor, lunes)
);
-- Clientes guardados (por ejemplo, los que venían de AgendaPro). Los que ya reservaron salen de la tabla reservas.
CREATE TABLE IF NOT EXISTS clientes (
  nombre TEXT NOT NULL,
  telefono TEXT NOT NULL DEFAULT '',
  correo TEXT NOT NULL DEFAULT '',
  origen TEXT NOT NULL DEFAULT '',
  creado TEXT NOT NULL DEFAULT ''
);
CREATE UNIQUE INDEX IF NOT EXISTS clientes_nombre ON clientes (lower(nombre));
