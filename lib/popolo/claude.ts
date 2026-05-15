// Informes, alertas de stock, consultas admin e interpretación de mensajes vía Claude API (Il Popolo).

import Anthropic from "@anthropic-ai/sdk";
import type { Message, TextBlock } from "@anthropic-ai/sdk/resources/messages";
import { cargarStockEnMemoria, getIngredientesCriticos, getEstadoStock } from "./inventario";
import { enviarMensaje } from "./whatsapp";
import { formatearMenuParaAsistente, INFO_IL_POPOLO, MENU } from "./menu";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export const BIENVENIDA_CLIENTE =
  "¡Hola! Bienvenido a Il Popolo Pasta & Pizza 🍕 Soy Braulio, tu asistente online. " +
  "Puedes hablarme con total naturalidad: pedir, consultar la carta, horarios, alérgenos o lo que necesites. " +
  "¿En qué puedo ayudarte hoy?";

function contextoNegocioIlPopolo(): string {
  return `Restaurante: ${INFO_IL_POPOLO.nombre}
Dirección: ${INFO_IL_POPOLO.direccion}
Teléfono: ${INFO_IL_POPOLO.telefono}
Horario: ${INFO_IL_POPOLO.horarios}

Carta completa:
${formatearMenuParaAsistente()}`;
}

function reglasAsistenteCliente(): string {
  return `Eres Braulio, el asistente virtual de Il Popolo Pasta & Pizza por WhatsApp.
Hablas siempre en español, con tono amable, cercano y natural (como un camarero de confianza).
Conoces la carta, los horarios y la ubicación del restaurante.
NUNCA menciones "Pepe", "Rincón de Pepe", hamburguesas, fajitas ni ningún negocio distinto de Il Popolo.
Si preguntan por platos que no existen en la carta, indícalo con amabilidad y sugiere alternativas de la carta real.
NUNCA pidas al cliente que escriba comandos fijos (menu, pago, pido, etc.): todo es conversación natural.`;
}

interface ResumenVentas {
  totalPedidos: number;
  totalEuros: number;
  pizzasMasVendidas: Array<{ nombre: string; cantidad: number }>;
  ticketMedio: number;
  periodoDescripcion: string;
}

function textoDesdeRespuestaClaude(message: Message): string {
  return message.content
    .filter((b): b is TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
}

/** Genera el informe semanal en texto listo para WhatsApp (Claude). */
export async function generarInformeSemanal(ventas: ResumenVentas): Promise<string> {
  await cargarStockEnMemoria();
  const criticos = getIngredientesCriticos();

  const prompt = `
Eres el asistente de gestión de ${INFO_IL_POPOLO.nombre} (${INFO_IL_POPOLO.direccion}).

Datos de ventas de la ${ventas.periodoDescripcion}:
- Total pedidos: ${ventas.totalPedidos}
- Total facturado: ${ventas.totalEuros.toFixed(2)}€
- Ticket medio: ${ventas.ticketMedio.toFixed(2)}€
- Platos más vendidos:
${ventas.pizzasMasVendidas.map((p) => `  · ${p.nombre}: ${p.cantidad} unidades`).join("\n")}

${
  criticos.length > 0
    ? `Ingredientes con stock crítico:
${criticos.map((i) => `  · ${i.nombre}: ${i.stockGramos}${i.unidad}`).join("\n")}`
    : "Stock en niveles correctos."
}

Genera un informe breve para WhatsApp (máximo 300 palabras)
con este formato exacto:

📊 *Informe semanal — [periodo]* — Il Popolo

*Resumen:*
[2-3 frases con los datos más relevantes]

*Lo que más se vendió:*
[top 3 platos con datos]

*Recomendación de la semana:*
[1 acción concreta y accionable basada en los datos]

${criticos.length > 0 ? `⚠️ *Stock crítico:*\n[lista de ingredientes a reponer]` : ""}

Usa negrita con asteriscos para WhatsApp.
Sé directo, no uses lenguaje corporativo.
`;

  const message = await anthropic.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 600,
    stream: false,
    messages: [{ role: "user", content: prompt }],
  });

  return textoDesdeRespuestaClaude(message);
}

/** Envía alerta de stock crítico al WhatsApp del local (sin IA). */
export async function enviarAlertaStock(): Promise<void> {
  await cargarStockEnMemoria();
  const criticos = getIngredientesCriticos();
  if (criticos.length === 0) return;

  const notif = process.env.PEPE_WA_NOTIF;
  if (!notif?.trim()) {
    console.warn("[Il Popolo] PEPE_WA_NOTIF no definido; no se envía alerta de stock.");
    return;
  }

  const lineas = criticos.map((i) => {
    const estado = i.stockGramos < i.minimoGramos * 0.5 ? "🔴" : "🟡";
    return `${estado} ${i.nombre}: ${i.stockGramos}${i.unidad} (mínimo ${i.minimoGramos}${i.unidad})`;
  });

  const mensaje =
    `⚠️ *Alerta de stock — ${INFO_IL_POPOLO.nombre}*\n\n` +
    `${lineas.join("\n")}\n\n` +
    `Revisa el inventario antes del próximo servicio.`;

  await enviarMensaje(notif.trim(), mensaje);
}

/** Respuesta breve a consultas del admin sobre el negocio (Claude + inventario actual). */
export async function responderConsultaAdmin(pregunta: string): Promise<string> {
  await cargarStockEnMemoria();
  const stockResumen = Array.from(getEstadoStock().values())
    .map((i) => `${i.nombre}: ${i.stockGramos}${i.unidad}`)
    .join(", ");

  const system = `${reglasAsistenteCliente()}

Modo gestión interna de ${MENU.negocio.nombre}.
Inventario actual: ${stockResumen}.
Responde de forma muy breve (máximo 3 frases).
Formato WhatsApp: usa *negrita* para datos importantes.

${contextoNegocioIlPopolo()}`;

  const message = await anthropic.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 200,
    stream: false,
    system,
    messages: [{ role: "user", content: pregunta }],
  });

  return textoDesdeRespuestaClaude(message);
}

export type IntencionCliente =
  | "pedir"
  | "ver_menu"
  | "ver_pedido"
  | "cancelar"
  | "pagar"
  | "anadir_nota"
  | "elegir_entrega"
  | "indicar_direccion"
  | "elegir_pago"
  | "pregunta"
  | "otro";

export interface ContextoPedidoCliente {
  lineasResumen: string;
  estado: "sin_pedido" | "abierto" | "pagando" | "otro";
  tipoEntrega?: "local" | "domicilio";
  direccion?: string;
  esperandoMetodoPago?: boolean;
  nota?: string;
  pendiente?: string;
}

export interface InterpretacionCliente {
  intencion: IntencionCliente;
  items?: Array<{ nombre: string; cantidad: number }>;
  respuesta_directa?: string;
  nota?: string;
  tipo_entrega?: "local" | "domicilio";
  direccion?: string;
  metodo_pago?: "tarjeta" | "efectivo";
}

export async function interpretarMensajeCliente(
  mensaje: string,
  contexto: ContextoPedidoCliente
): Promise<InterpretacionCliente> {
  const ctxLineas = contexto.lineasResumen || "Sin platos";
  const ctxEstado = contexto.estado;
  const ctxEntrega = contexto.tipoEntrega
    ? contexto.tipoEntrega === "local"
      ? "recogida en local"
      : "domicilio"
    : "sin elegir";
  const ctxDir = contexto.direccion?.trim() || "sin indicar";
  const ctxPago = contexto.esperandoMetodoPago
    ? "esperando que elija tarjeta o efectivo"
    : "no";
  const ctxNota = contexto.nota?.trim() || "ninguna";
  const ctxPendiente = contexto.pendiente || "ninguno";

  const system = `${reglasAsistenteCliente()}

Interpretas mensajes de clientes por WhatsApp y devuelves ÚNICAMENTE un JSON válido (sin markdown ni texto extra).

${contextoNegocioIlPopolo()}

Estado actual del pedido del cliente:
- Platos: ${ctxLineas}
- Estado del pedido: ${ctxEstado}
- Tipo de entrega: ${ctxEntrega}
- Dirección (si domicilio): ${ctxDir}
- Elección de pago: ${ctxPago}
- Nota del pedido: ${ctxNota}
- Paso pendiente en el flujo: ${ctxPendiente}

Intenciones (elige la más adecuada según el mensaje y el estado):

pedir — quiere añadir platos (nombre EXACTO de la carta, cantidad si la dice):
{"intencion":"pedir","items":[{"nombre":"...","cantidad":1}]}

ver_menu — quiere ver la carta completa:
{"intencion":"ver_menu"}

ver_pedido — quiere ver el resumen de su pedido:
{"intencion":"ver_pedido"}

cancelar — quiere cancelar el pedido abierto:
{"intencion":"cancelar"}

pagar — quiere cerrar/confirmar el pedido (puede incluir en el mismo JSON tipo_entrega, direccion y metodo_pago si el cliente lo dice de una vez):
{"intencion":"pagar"}
{"intencion":"pagar","tipo_entrega":"local"}
{"intencion":"pagar","tipo_entrega":"domicilio","direccion":"calle y número"}
{"intencion":"pagar","metodo_pago":"tarjeta"}

anadir_nota — quiere dejar una nota o personalización (sin gluten, sin cebolla…):
{"intencion":"anadir_nota","nota":"texto de la nota"}

elegir_entrega — elige recoger en local o domicilio (durante el cierre del pedido):
{"intencion":"elegir_entrega","tipo_entrega":"local"}
{"intencion":"elegir_entrega","tipo_entrega":"domicilio"}

indicar_direccion — da la dirección para entrega a domicilio:
{"intencion":"indicar_direccion","direccion":"dirección completa"}

elegir_pago — elige tarjeta online o efectivo al recibir:
{"intencion":"elegir_pago","metodo_pago":"tarjeta"}
{"intencion":"elegir_pago","metodo_pago":"efectivo"}

pregunta — pregunta sobre horarios, ubicación, carta, alérgenos, recomendaciones del restaurante:
{"intencion":"pregunta","respuesta_directa":"respuesta breve y amable solo con datos de Il Popolo"}

otro — saludos, charla general o algo que no encaje en las acciones anteriores; responde con naturalidad:
{"intencion":"otro","respuesta_directa":"respuesta amable en español"}

Si el cliente solo envía su dirección y el paso pendiente es la dirección, usa indicar_direccion.
Si dice "tarjeta", "con tarjeta", "pago online", usa elegir_pago con metodo_pago tarjeta.
Si dice "efectivo", "en metálico", "al recibir", usa elegir_pago con metodo_pago efectivo.

IMPORTANTE: Devuelve SOLO el JSON, sin explicaciones ni texto adicional.`;

  const message = await anthropic.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 400,
    stream: false,
    system,
    messages: [{ role: "user", content: mensaje }],
  });

  const texto = textoDesdeRespuestaClaude(message);
  let parsed: InterpretacionCliente | null = null;
  try {
    const clean = texto.trim().replace(/^```json\s*/i, "").replace(/```$/, "").trim();
    const obj = JSON.parse(clean) as InterpretacionCliente;
    if (obj && typeof obj.intencion === "string") parsed = obj;
  } catch {
    /* no es JSON válido */
  }
  if (parsed) return parsed;
  return { intencion: "otro", respuesta_directa: texto.trim() };
}

export function textoRespuestaParaCliente(interpretacion: InterpretacionCliente): string {
  const raw = interpretacion.respuesta_directa;
  if (!raw || typeof raw !== "string") {
    return "No he entendido bien. ¿Puedes contarme de nuevo qué necesitas?";
  }
  return raw.trim();
}
