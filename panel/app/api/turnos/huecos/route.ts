// Huecos reservables de un día, para "Nuevo turno" (decisión de Mateo, 19/9): el mostrador
// elige entre horarios que el backend ya sabe que son válidos, en vez de un campo de hora libre
// que el POST /api/turnos podría rechazar después. GET /api/turnos/huecos?fecha=YYYY-MM-DD&tipo=
// invitado[&cliente_id=uuid][&excluir=uuid][&evento_inminente=1] → { huecos: [{inicio, fin,
// probador, dentro_urgencia}, ...] }.
// dentro_urgencia: true en un hueco que solo aparece pisando la reserva de urgencia — el
// operador lo puede elegir igual, mandando pisar_urgencia: true en el POST.
// excluir: el turno que se está moviendo ("Mover", 5/10) no cuenta como ocupado. evento_inminente=1:
// el cliente tiene el evento hoy o mañana y quien agenda ya aceptó resolverlo (turno-alta.ts,
// huecosPara); sin eso, ese caso es un 409 con motivo evento_inminente.
import { rutaConsulta } from '@/lib/api/consulta';
import { error } from '@/lib/api/respuestas';
import { esFecha } from '@/lib/formato';
import { esUuid } from '@/lib/api/validar';
import { huecosDelDia, TIPOS_TURNO } from '@/lib/edicion/turno-alta';

export const GET = rutaConsulta(async (s, request) => {
  const p = request.nextUrl.searchParams;
  const fecha = p.get('fecha');
  const tipo = p.get('tipo');
  const clienteId = p.get('cliente_id') ?? undefined;
  const excluir = p.get('excluir') ?? undefined;
  if (!fecha || !esFecha(fecha)) return error(400, 'fecha tiene que ser AAAA-MM-DD');
  if (!tipo || !(TIPOS_TURNO as readonly string[]).includes(tipo)) return error(400, `tipo tiene que ser uno de: ${TIPOS_TURNO.join(', ')}`);
  if (clienteId && !esUuid(clienteId)) return error(400, 'cliente_id inválido');
  if (excluir && !esUuid(excluir)) return error(400, 'excluir inválido');
  return huecosDelDia(s, tipo, fecha, clienteId, { excluirTurno: excluir, aceptarInminente: p.get('evento_inminente') === '1' });
});
