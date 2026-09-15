// Las barandillas de AGENTE.md § 6, en su orden: formato → contenido → reglas.
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
// barandillas, se rehace una sola vez con los dos motivos (supuesto de H1.5). Cada barandilla
// que salta queda en `saltos` con su motivo, para la bitácora.

import { accesorioSinHerramienta } from "./accesorio_sin_herramienta.ts";
import { anunciaSinDerivar } from "./anuncia_sin_derivar.ts";
import { confirmacionDoble } from "./confirmacion_doble.ts";
import { derivaYPregunta } from "./deriva_y_pregunta.ts";
import { fueraVentanaMeta } from "./fuera_ventana_meta.ts";
import { horarioSinHerramienta } from "./horario_sin_herramienta.ts";
import { largo } from "./largo.ts";
import { mencionaIa } from "./menciona_ia.ts";
import { noASecas } from "./no_a_secas.ts";
import { precioSinHerramienta } from "./precio_sin_herramienta.ts";
import { presentacionRepetida } from "./presentacion_repetida.ts";
import { sinMarkdown } from "./sin_markdown.ts";
import { sinRelleno } from "./sin_relleno.ts";
import type { Accion, Barandilla, EntradaBarandilla } from "./tipos.ts";
import { unaPregunta } from "./una_pregunta.ts";

export const BARANDILLAS: readonly Barandilla[] = [
  confirmacionDoble,
  sinMarkdown,
  sinRelleno,
  presentacionRepetida,
  unaPregunta,
  largo,
  precioSinHerramienta,
  horarioSinHerramienta,
  accesorioSinHerramienta,
  derivaYPregunta,
  anunciaSinDerivar,
  noASecas,
  mencionaIa,
  fueraVentanaMeta,
];

export type Salto = { barandilla: string; accion: Accion; motivo: string };

export type ResultadoBarandillas = {
  texto: string;
  decision: "enviar" | "rehacer" | "derivar" | "bloquear";
  saltos: Salto[];
  instruccion?: string; // si hay que rehacer: qué corregir (lo lee el modelo)
  motivoDerivacion?: "barandilla_doble"; // si deriva por el segundo salto
  ejecutarDerivacion?: boolean; // si deriva porque Lucía anunció un pase
};

export async function aplicarBarandillas(
  entrada: EntradaBarandilla,
  opciones: { saltosPrevios?: number } = {},
): Promise<ResultadoBarandillas> {
  let texto = entrada.texto;
  const saltos: Salto[] = [];
  for (const b of BARANDILLAS) {
    const r = await b.evaluar({ ...entrada, texto });
    if (!r.salta) continue;
    saltos.push({ barandilla: b.nombre, accion: r.accion, motivo: r.motivo });
    if (r.texto !== undefined) texto = r.texto;
  }
  const hay = (a: Accion) => saltos.some((s) => s.accion === a);
  const paraRehacer = saltos.filter((s) => s.accion === "rehacer");

  if (hay("bloquear")) return { texto, decision: "bloquear", saltos };
  if (hay("ejecutar_derivacion")) return { texto, decision: "derivar", saltos, ejecutarDerivacion: true };
  if (paraRehacer.length && (opciones.saltosPrevios ?? 0) >= 1) {
    return { texto, decision: "derivar", saltos, motivoDerivacion: "barandilla_doble" };
  }
  if (paraRehacer.length) {
    const instruccion = "Reescribí tu respuesta corrigiendo esto: " + paraRehacer.map((s) => s.motivo).join("; ") + ".";
    return { texto, decision: "rehacer", saltos, instruccion };
  }
  return { texto, decision: "enviar", saltos };
}
