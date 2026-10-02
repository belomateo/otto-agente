# Estado para retomar — 2/10/2026

Trabajo local y pruebas reales completados. La tarea de continuación del hilo permanece activa por pedido del usuario. No hay que repetir ensayos reales ya aprobados salvo cambios nuevos o fallas.

## Pendiente concreto

Publicación coordinada, detenida por falta de acceso de gestión de Supabase. `supabase functions list --project-ref fhyuvdliwppqkneddezn` respondió `Access token not provided`. No se aplicó ninguna migración permanentemente ni se publicó worker/panel.

Se inició el acceso oficial con `supabase login --no-browser --agent no --output-format text`. Está esperando que el usuario complete la verificación en el enlace enviado. No pedir contraseñas. Si el acceso expiró, reiniciar ese flujo, no volver a pedir autorización para la prueba real.

Vercel tiene sesión `belomateo`; la copia está vinculada a `belomateos-projects/otto-agente`, ID `prj_JzNbtuUJr5zcRwDnG9o05cpkjsny`, carpeta de construcción `panel`, sitio `https://otto-agente.vercel.app`. `.vercel` y `.env.local` quedan ignorados.

## Al disponer del acceso

1. Verificar que no haya ediciones posteriores de reglas/prompt que deban conservarse. No ejecutar todos los seeds sobre producción.
2. Revisar informes de prueba real, código y acceso de esta fecha.
3. Publicar coordinadamente el worker y las migraciones 0074–0079. El código nuevo acepta las condiciones antiguas mientras se actualiza el prompt; no activar el prompt nuevo con el worker viejo.
4. Asegurar 0077 antes de publicar el panel vinculado. No crear otro proyecto Vercel.
5. Comprobar versión, prompt, conocimiento, bandeja y calendario; no enviar WhatsApp a clientes reales para probar.
6. Actualizar el estado del informe completo y cerrar la tarea de continuación cuando esté terminado.

La autorización del usuario para usar la IA real ya está dada. Los informes antiguos que decían que esa prueba seguía bloqueada son históricos; el resultado vigente está en `2026-10-02-prueba-real-lucia.md`.
