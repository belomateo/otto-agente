// Saca del payload del webhook de Meta los mensajes entrantes, uno por cada elemento de
// `messages`. Los avisos de estado (sent / delivered / read) vienen en `statuses` y no
// generan trabajo: acá se ignoran. Tampoco entran las reacciones ni los avisos del sistema
// (TIPOS_SIN_TRABAJO).
export type MensajeEntrante = {
  waMessageId: string;
  // Formato de Meta: E.164 sin "+", ej. 5490000000000.
  telefono: string;
  nombre: string | null;
  // Como se guarda en la base: 'texto' para el texto de Meta ('text'), el resto con su nombre
  // de Meta (button, image, audio…). Ver TIPO_EN_LA_BASE.
  tipo: string;
  contenido: string | null;
  // ISO. Meta manda segundos desde epoch en `timestamp`.
  enviadoAt: string | null;
  // El mensaje tal cual llegó: el worker y la confirmación por botón (H1.14) lo leen.
  crudo: Record<string, unknown>;
};

type Obj = Record<string, unknown>;
const esObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const lista = (v: unknown): Obj[] => (Array.isArray(v) ? v.filter(esObj) : []);
const texto = (v: unknown): string | null => (typeof v === "string" && v.length > 0 ? v : null);

// En la base el tipo va en castellano, como lo leen el turno y el panel. Solo se traduce el
// texto: 'button' queda como 'button' y Lucía SÍ lo lee — rafaga.ts lo tiene en
// TIPOS_QUE_SON_TEXTO desde el 15/9, porque el label que tocó el cliente es una frase que eligió
// en vez de escribir. (Decía "los demás no los contesta Lucía todavía": era falso desde ese día.
// Corregido el 24/9.) El "Confirmo" era la excepción, lo resolvía atender.ts en código antes de
// correr el turno; hoy ninguna plantilla lleva botones, así que por acá no entra ninguno.
const TIPO_EN_LA_BASE: Record<string, string> = { text: "texto" };

// Lo que llega por `messages` pero no es un mensaje para contestar: una reacción (el 👍 a un
// mensaje de Lucía) o un aviso del sistema (el cliente cambió de número). Si entraran, el turno
// los tomaría como "algo que no es texto" y Lucía contestaría que no puede leer fotos ni audios.
const TIPOS_SIN_TRABAJO = new Set(["reaction", "system"]);

// El texto legible de cada tipo. Lo que no trae texto (una foto sin epígrafe, un audio) queda
// en null: con el tipo alcanza para que el worker decida qué hacer.
function contenidoDe(m: Obj, tipo: string): string | null {
  const bloque = m[tipo];
  if (!esObj(bloque)) return null;
  switch (tipo) {
    case "text":
      return texto(bloque.body);
    case "button": // respuesta a un botón de una plantilla (ej. "Confirmo")
      return texto(bloque.text);
    case "interactive": {
      const boton = bloque.button_reply;
      const opcion = bloque.list_reply;
      if (esObj(boton)) return texto(boton.title);
      if (esObj(opcion)) return texto(opcion.title);
      return null;
    }
    case "image":
    case "video":
    case "document":
      return texto(bloque.caption);
    case "location":
      return texto(bloque.name) ?? texto(bloque.address);
    default:
      return null;
  }
}

export function mensajesEntrantes(cuerpo: unknown): MensajeEntrante[] {
  if (!esObj(cuerpo) || cuerpo.object !== "whatsapp_business_account") return [];
  const salida: MensajeEntrante[] = [];
  for (const entrada of lista(cuerpo.entry)) {
    for (const cambio of lista(entrada.changes)) {
      const valor = cambio.value;
      if (cambio.field !== "messages" || !esObj(valor)) continue;

      const nombres = new Map<string, string>();
      for (const contacto of lista(valor.contacts)) {
        const perfil = contacto.profile;
        const nombre = esObj(perfil) ? texto(perfil.name) : null;
        const waId = texto(contacto.wa_id);
        if (waId && nombre) nombres.set(waId, nombre);
      }

      for (const m of lista(valor.messages)) {
        const id = texto(m.id);
        const de = texto(m.from);
        const tipo = texto(m.type);
        if (!id || !de || !tipo || TIPOS_SIN_TRABAJO.has(tipo)) continue;
        const segundos = Number(m.timestamp);
        salida.push({
          waMessageId: id,
          telefono: de,
          nombre: nombres.get(de) ?? null,
          tipo: TIPO_EN_LA_BASE[tipo] ?? tipo,
          contenido: contenidoDe(m, tipo),
          enviadoAt: Number.isFinite(segundos) && segundos > 0 ? new Date(segundos * 1000).toISOString() : null,
          crudo: m,
        });
      }
    }
  }
  return salida;
}
