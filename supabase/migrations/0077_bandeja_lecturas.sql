-- Lectura compartida por el equipo, independiente de quién responde.
ALTER TABLE mensajes ADD COLUMN IF NOT EXISTS leido_equipo_at timestamptz;
CREATE INDEX IF NOT EXISTS mensajes_pendientes_equipo_idx ON mensajes (conversacion_id)
 WHERE direccion = 'entrante' AND leido_equipo_at IS NULL;

CREATE OR REPLACE FUNCTION bandeja_no_leidos(p_ids uuid[])
RETURNS TABLE(conversacion_id uuid, cantidad bigint)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
 SELECT m.conversacion_id, count(*) FROM mensajes m
 WHERE m.conversacion_id = ANY(p_ids) AND m.direccion = 'entrante'
 AND m.leido_equipo_at IS NULL AND es_usuario_aprobado()
 GROUP BY m.conversacion_id;
$$;

CREATE OR REPLACE FUNCTION bandeja_marcar_leida(p_conversacion uuid, p_mensajes uuid[])
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n integer;
BEGIN
 IF NOT es_usuario_aprobado() THEN RAISE EXCEPTION 'Acceso no autorizado' USING errcode = '42501'; END IF;
 IF cardinality(p_mensajes) > 500 THEN RAISE EXCEPTION 'Demasiados mensajes' USING errcode = '22023'; END IF;
 -- Solo marca los mensajes efectivamente cargados; uno que llega después sigue pendiente.
 UPDATE mensajes SET leido_equipo_at = now()
 WHERE conversacion_id = p_conversacion AND id = ANY(p_mensajes)
 AND direccion = 'entrante' AND leido_equipo_at IS NULL;
 GET DIAGNOSTICS n = ROW_COUNT;
 RETURN n;
END;
$$;
REVOKE ALL ON FUNCTION bandeja_marcar_leida(uuid, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION bandeja_marcar_leida(uuid, uuid[]) TO authenticated;
REVOKE ALL ON FUNCTION bandeja_no_leidos(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION bandeja_no_leidos(uuid[]) TO authenticated;

CREATE OR REPLACE FUNCTION actualizar_ultima_actividad_bandeja()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
 UPDATE conversaciones SET ultimo_mensaje_at = greatest(ultimo_mensaje_at, NEW.enviado_at)
 WHERE id = NEW.conversacion_id;
 RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS mensajes_ultima_actividad_bandeja ON mensajes;
CREATE TRIGGER mensajes_ultima_actividad_bandeja AFTER INSERT ON mensajes
 FOR EACH ROW EXECUTE FUNCTION actualizar_ultima_actividad_bandeja();
UPDATE conversaciones c SET ultimo_mensaje_at = m.ultimo
FROM (SELECT conversacion_id, max(enviado_at) ultimo FROM mensajes GROUP BY conversacion_id) m
WHERE c.id = m.conversacion_id AND c.ultimo_mensaje_at IS DISTINCT FROM m.ultimo;
