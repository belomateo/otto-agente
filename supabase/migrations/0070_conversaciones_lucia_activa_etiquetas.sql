-- Botón on/off de Lucía por charla y etiquetas manuales (pedido de Mateo, 30/9).
--
-- lucia_activa: cuando el mostrador lo apaga, Lucía no responde en esa conversación.
--   El worker lo lee antes de procesar cada mensaje.
--   DEFAULT true = Lucía activa por defecto (sin cambio de comportamiento en charlas existentes).
--
-- etiquetas: array de texto libre por conversación. El panel permite agregar y quitar
--   etiquetas desde la cabecera del hilo. No afecta la lógica del agente.
ALTER TABLE conversaciones
  ADD COLUMN IF NOT EXISTS lucia_activa boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS etiquetas text[] NOT NULL DEFAULT '{}';
