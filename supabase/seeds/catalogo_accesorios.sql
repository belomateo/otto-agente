-- Precios de accesorios confirmados en docs/ficha-del-negocio.md § Alquiler de trajes.
-- No se seedea catalogo_alquiler (modelos/colores/precio base): la ficha solo da un
-- "desde $150.000" orientativo, sin lista real de modelos — ver docs/supuestos.md.
insert into accesorios_alquiler (nombre, precio) values
  ('Camisa + corbata', 33500),
  ('Zapato + cinturón', 55000);
