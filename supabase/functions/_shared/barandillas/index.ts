// Los controles de AGENTE.md § 6 (las barandillas): código que revisa lo que Lucía quiere mandar.
//
// Pedido de Mateo (9/10): 7 controles en vez de 16 barandillas sueltas. Cada control junta las
// revisiones (chequeos, en chequeos/) que cuidan lo mismo; las revisiones son las de siempre y
// corren en el MISMO orden de siempre (CHEQUEOS_EN_ORDEN): formato → contenido → reglas. El orden
// importa porque las que arreglan en código cambian el texto que ven las siguientes.
//
// aplicarBarandillas corre todas sobre el texto que Lucía quiere mandar. Las que arreglan en
// código (limpiar, cortar, quitar la pregunta) cambian el texto y lo pasan a la siguiente; no
// cuentan como falla del modelo. Después decide, en este orden:
//  1. bloquear   — fuera de la ventana de Meta: texto libre no, solo plantilla;
//  2. derivar    — Lucía anunció un pase sin derivar: el código ejecuta la derivación;
//  3. derivar    — segundo salto del turno: ya se rehizo una vez y vuelve a saltar
//                  (motivo barandilla_doble, AGENTE.md § 3 paso 8);
//  4. rehacer    — primer salto: vuelve al modelo con qué corregir;
//  5. enviar.
// "Salto" es un intento del modelo que hay que rehacer: si en el primer intento saltan dos
// revisiones, se rehace una sola vez con los dos motivos (supuesto de H1.5). Cada revisión que
// salta queda en `saltos` con su control, su nombre y su motivo, para la bitácora.

import { confirmacionDoble } from "./chequeos/confirmacion_doble.ts";
import { sinMarkdown } from "./chequeos/sin_markdown.ts";
import { sinRelleno } from "./chequeos/sin_relleno.ts";
import { presentacionRepetida } from "./chequeos/presentacion_repetida.ts";
import { unaPregunta } from "./chequeos/una_pregunta.ts";
import { largo } from "./chequeos/largo.ts";
import { precioSinHerramienta } from "./chequeos/precio_sin_herramienta.ts";
import { horarioSinHerramienta } from "./chequeos/horario_sin_herramienta.ts";
import { accesorioSinHerramienta } from "./chequeos/accesorio_sin_herramienta.ts";
import { disponibilidadNegada } from "./chequeos/disponibilidad_negada.ts";
import { derivaYPregunta } from "./chequeos/deriva_y_pregunta.ts";
import { anunciaSinDerivar } from "./chequeos/anuncia_sin_derivar.ts";
import { ventaSinResolver } from "./chequeos/venta_sin_resolver.ts";
import { noASecas } from "./chequeos/no_a_secas.ts";
import { mencionaIa } from "./chequeos/menciona_ia.ts";
import { fueraVentanaMeta } from "./chequeos/fuera_ventana_meta.ts";
import { repeticiones } from "./repeticiones.ts";
import { formaYTono } from "./forma_y_tono.ts";
import { datoSinConsultar } from "./dato_sin_consultar.ts";
import { nuncaNoSeco } from "./nunca_no_seco.ts";
import { paseCoherente } from "./pase_coherente.ts";
import { venta } from "./venta.ts";
import { ventanaMeta } from "./ventana_meta.ts";
import type { Accion, Barandilla, Control, EntradaBarandilla } from "./tipos.ts";

// Los 7 controles, en el orden de la tabla de AGENTE.md § 6.
export const BARANDILLAS: readonly Control[] = [repeticiones, formaYTono, datoSinConsultar, nuncaNoSeco, paseCoherente, venta, ventanaMeta];

// Las 16 revisiones en el orden en que corrieron siempre (hasta el 9/10 eran BARANDILLAS).
export const CHEQUEOS_EN_ORDEN: readonly Barandilla[] = [
  confirmacionDoble,
  sinMarkdown,
  sinRelleno,
  presentacionRepetida,
  unaPregunta,
  largo,
  precioSinHerramienta,
  horarioSinHerramienta,
  accesorioSinHerramienta,
  disponibilidadNegada,
  derivaYPregunta,
  anunciaSinDerivar,
  ventaSinResolver,
  noASecas,
  mencionaIa,
  fueraVentanaMeta,
];

// De cada revisión, a qué control pertenece.
const CONTROL_DE = new Map(BARANDILLAS.flatMap((c) => c.chequeos.map((ch) => [ch.nombre, c.nombre] as const)));

export type Salto = { barandilla: string; chequeo: string; accion: Accion; motivo: string };

export type ResultadoBarandillas = {
  texto: string;
  decision: "enviar" | "rehacer" | "derivar" | "bloquear";
  saltos: Salto[];
  instruccion?: string; // si hay que rehacer: qué corregir (lo lee el modelo)
  motivoDerivacion?: "barandilla_doble" | "dato_no_encontrado";
  ejecutarDerivacion?: boolean; // si deriva porque Lucía anunció un pase
};

export async function aplicarBarandillas(
  entrada: EntradaBarandilla,
  opciones: { saltosPrevios?: number } = {},
): Promise<ResultadoBarandillas> {
  let texto = entrada.texto;
  const saltos: Salto[] = [];
  for (const b of CHEQUEOS_EN_ORDEN) {
    const r = await b.evaluar({ ...entrada, texto, saltosPrevios: opciones.saltosPrevios ?? 0 });
    if (!r.salta) continue;
    saltos.push({ barandilla: CONTROL_DE.get(b.nombre) ?? b.nombre, chequeo: b.nombre, accion: r.accion, motivo: r.motivo });
    if (r.texto !== undefined) texto = r.texto;
  }
  const hay = (a: Accion) => saltos.some((s) => s.accion === a);
  const paraRehacer = saltos.filter((s) => s.accion === "rehacer");
  // Hallazgo de la auditoría, 17/9: un "cortar" (confirmacion_doble, presentacion_repetida,
  // sin_relleno) puede vaciar el mensaje entero si no tenía nada más que la parte que se sacó.
  // Antes eso caía derecho a "enviar" con texto "": prepararParaEnviar lo descarta por vacío y
  // el cliente se queda sin nada, sin que ni siquiera quede una derivación — mudo del todo, sin
  // que nadie se entere. Un corte que deja el mensaje vacío cuenta como si hubiera que rehacerlo.
  //
  // Excepción, auditoría de logica del 22/9: cuando lo ÚNICO que saltó fue confirmacion_doble, un
  // texto vacío no es un bug — es lo correcto. agendar_turno/reprogramar_turno/confirmar_turno ya
  // mandan su propia confirmación aparte (efectosMensajes en turno.ts), con todos los datos; no
  // hay nada más que agregar cuando el cliente solo pidió confirmar. Forzar el rehacer acá
  // garantizaba caer siempre en lo mismo (mismo patrón que el bug de precio_sin_herramienta con
  // el nombre del cliente, 20/9): el modelo vuelve a escribir SOLO la confirmación —es la
  // respuesta correcta y completa a "confirmame"—, se corta de nuevo, y deriva con
  // barandilla_doble en TODO turno donde alguien confirma un turno por texto.
  const cortoSoloConfirmacionDoble = saltos.length > 0 && saltos.every((s) => s.chequeo === "confirmacion_doble");
  const quedoVacio = texto.trim() === "" && saltos.length > 0 && !cortoSoloConfirmacionDoble;

  if (hay("bloquear")) return { texto, decision: "bloquear", saltos };
  if (hay("ejecutar_derivacion")) return { texto, decision: "derivar", saltos, ejecutarDerivacion: true };
  if ((paraRehacer.length || quedoVacio) && (opciones.saltosPrevios ?? 0) >= 1) {
    return { texto, decision: "derivar", saltos, motivoDerivacion: "barandilla_doble" };
  }
  if (paraRehacer.length || quedoVacio) {
    const motivos = paraRehacer.length
      ? paraRehacer.map((s) => s.motivo)
      : [...saltos.map((s) => s.motivo), "el mensaje quedó vacío después de cortarlo: escribí una respuesta con contenido de verdad, no solo la fórmula que se sacó"];
    const instruccion = "Reescribí tu respuesta corrigiendo esto: " + motivos.join("; ") + ".";
    return { texto, decision: "rehacer", saltos, instruccion };
  }
  return { texto, decision: "enviar", saltos };
}
