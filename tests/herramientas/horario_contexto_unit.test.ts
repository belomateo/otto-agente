import { assertEquals, assertMatch } from 'jsr:@std/assert@1.0.13';
import { describirHorarios } from '../../supabase/functions/_shared/herramientas/horario_laboral.ts';
Deno.test('el horario de hoy no declara cerrados los demás días de la semana', () => {
  const r = describirHorarios([{diaSemana:1, apertura:600, cierre:1140}], [{diaSemana:1, desde:600, hasta:1140, probadores:2}], [1]);
  assertMatch(r.local, /Lunes/);
  assertEquals(/cerrado|martes|jueves/i.test(r.local), false);
  assertEquals(/sin turnos/i.test(r.turnos), false);
});
