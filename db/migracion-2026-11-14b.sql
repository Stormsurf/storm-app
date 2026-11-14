-- Tipo de clase: '' = normal, 'intermedio' = clase para alumnos intermedios ($45.000 individual; desde 2 personas precio normal; solo Diego o Francisco)
ALTER TABLE reservas ADD COLUMN nivel TEXT NOT NULL DEFAULT '';
