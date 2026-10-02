import { assert, assertEquals, assertMatch } from 'jsr:@std/assert@1.0.13';
import { correrTurno } from '../../supabase/functions/_shared/turno/turno.ts';
import { calendarioDeEnsayo } from '../../supabase/functions/_shared/herramientas/tipos.ts';
import { AHORA, contar, iso, JUEVES, prueba, TZ } from './_arnes.ts';
prueba('una reserva guardada envía su resumen aunque el modelo devuelva texto nulo', async ({sql, ctx, clienteId, conversacionId}) => {
  await sql.query('update configuracion_agenda set dias_reserva_urgencia=null');
  await sql.query("insert into mensajes(conversacion_id,direccion,tipo,contenido,enviado_at) values ($1,'entrante','texto','Quiero ir el jueves a las 12',$2)",[conversacionId,AHORA.toISOString()]);
  let pasos = 0;
  const fetcher = (async (_url, init) => {
    const b = JSON.parse(String(init?.body));
    let content: string | null = null;
    let tool_calls;
    const schema = b.response_format?.json_schema?.name;
    if (schema === 'clasificacion') content = JSON.stringify({intencion:'alquiler',urgencia:'baja',derivar_duro:false,motivo_derivacion:null});
    else if (schema === 'ficha') content = '{}';
    else {
      assert(b.messages.some((m: {content: unknown}) => typeof m.content === 'string' && m.content.includes('FECHA ACTUAL: 2030-06-03')));
      const tool = pasos++ === 0
        ? {name:'buscar_horarios',arguments:JSON.stringify({desde:JUEVES,hasta:JUEVES,fecha_hora:iso(JUEVES,'12:00'),tipo_turno:null,fecha_evento:null})}
        : pasos === 2 ? {name:'agendar_turno',arguments:JSON.stringify({fecha_hora:iso(JUEVES,'12:00'),tipo:null,nombre:null,evento:null,fecha_evento:null})} : null;
      if (tool) tool_calls = [{id:`prueba_${pasos}`,type:'function',function:tool}];
    }
    return Response.json({choices:[{message:{content,tool_calls}}],usage:{prompt_tokens:1,completion_tokens:1}});
  }) as typeof fetch;
  const r = await correrTurno(ctx.db,{clienteId,telefono:ctx.cliente.telefono,conversacionId,ahora:AHORA,tz:TZ,calendario:calendarioDeEnsayo,derivacionTel:null,fetcher});
  assertEquals(r.derivo,false);
  assertMatch(r.mensajesAlCliente.join('\n'),/Nombre: No especificado/);
  assertEquals((r.mensajesAlCliente.join('\n').match(/Nombre:/g)??[]).length,1);
  assertEquals(await contar(sql,'select count(*)::int n from turnos where cliente_id=$1',[clienteId]),1);
});
