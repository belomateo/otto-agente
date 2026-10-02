# Revisión de acceso — 2/10/2026

Revisión local, sin auditor externo. Complementa las comprobaciones de permisos transaccionales del 1/10.

- El marcado de lectura exige sesión aprobada tanto en la API como en la función de base. No marca salientes, mensajes ajenos a la conversación ni identificadores no proporcionados.
- La consulta de pendientes conserva RLS. La prueba de usuario no aprobado fue rechazada correctamente.
- Se revisaron 34 archivos del contenido público compilado del panel: no contienen los secretos privados configurados en el .env del proyecto.
- Los archivos de entorno y la vinculación de Vercel están excluidos de Git. No se imprimieron claves privadas durante la revisión. El ejecutor de pruebas filtra claves de errores.
- La llamada a IA real fue autorizada expresamente por el usuario. Utilizó conversaciones ficticias; las escrituras se revirtieron. No se envió WhatsApp.
- La sesión de Vercel está disponible. El acceso de gestión de Supabase todavía no está conectado y no se intentó sustituirlo por otras credenciales.

Resultado: no se encontraron exposiciones en los cambios revisados. La publicación sigue pendiente del acceso de Supabase y la comprobación posterior.
