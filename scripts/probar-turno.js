// scripts/probar-turno.js — guiones de prueba del agente (AGENTE.md § 13), escritos como
// escribe un cliente desde el celular: minúsculas, sin tildes, con errores, en ráfagas.
//
// Cada guion se verifica contra la base, no contra lo que dijo Lucía (principio 9). El que los
// corre contra el emulador probar-agente se escribe en H1.7, cuando esté OPENAI_API_KEY; hasta
// entonces este archivo guarda los guiones y los lista.
//
//   node scripts/probar-turno.js            lista los guiones
//   node scripts/probar-turno.js <guion>    lo corre contra el emulador (H1.7)
//
// En los mensajes y en lo que se verifica, {hoy} y {mañana} son fechas en hora de Argentina
// (NEGOCIO_TZ) del día en que se corre.

const GUIONES = {
  "evento-manana-deriva": {
    que_prueba:
      "Decisión #8 de Mateo (14/9): el evento es mañana. Lucía no ofrece turnos; el código deriva con " +
      "motivo evento_inminente y manda el texto fijo, que no dice que no.",
    mensajes: [
      "hola buenas tardes",
      "necesito alquilar un traje para un casamiento es mañana a la noche",
      "tienen algo? puedo pasar hoy mismo o mañana temprano",
    ],
    verificar: {
      derivacion: { motivo: "evento_inminente", estado: "pendiente" },
      conversacion: { estado: "derivada" },
      turnos_nuevos: 0,
      ficha: { fecha_evento: "{mañana}" },
      // El último mensaje que recibe el cliente es el valor de contexto_agente.texto_evento_inminente.
      ultimo_mensaje_al_cliente: { igual_a_contexto: "texto_evento_inminente" },
      en_la_traza: { sin: ["agendar_turno"], huecos_ofrecidos: 0 },
      nunca: ["un «no» a secas", "un día u horario ofrecido", "una pregunta después de derivar"],
    },
  },
};

function listar() {
  console.log("Guiones (AGENTE.md § 13):\n");
  for (const [nombre, g] of Object.entries(GUIONES)) console.log(`  ${nombre}\n    ${g.que_prueba}\n`);
}

const pedido = process.argv[2];
if (!pedido) {
  listar();
} else if (!GUIONES[pedido]) {
  console.error(`No existe el guion "${pedido}".`);
  listar();
  process.exit(1);
} else {
  console.error(`El emulador que corre "${pedido}" se escribe en H1.7 (espera OPENAI_API_KEY).`);
  process.exit(1);
}

module.exports = { GUIONES };
