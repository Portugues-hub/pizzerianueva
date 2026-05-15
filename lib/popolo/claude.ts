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
  "👋 ¡Bienvenido/a! Soy Braulio, tu asistente de *Il Popolo Pasta & Pizza*.\n\n" +
  "📍 Calle Juan de Austria 11, Cox (Alicante)\n" +
  "🕐 Lun-Mar cerrado · Mié 20:00-24:00 · Jue-Dom 13:00-16:00 y 20:00-24:00\n\n" +
  "Estoy aquí para ayudarte con tu pedido:\n\n" +
  "🍕 Escribe *menu* para ver la carta\n" +
  "🛒 Dime lo que quieres pedir y lo anoto\n" +
  "📝 Escribe *nota* para indicaciones especiales (sin gluten, sin cebolla, etc.)\n" +
  "💳 Cuando termines, dime *pagar* para cerrar el pedido\n" +
  "❌ Si quieres cancelar, dime *cancelar*\n\n" +
  "¡Dime qué te apetece! 😊";

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
Si preguntan por platos que no existen en la carta, indícalo con amabilidad y sugiere alternativas de la carta real.`;
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

export interface InterpretacionCliente {
  intencion: "pedir" | "ver_menu" | "ver_pedido" | "cancelar" | "pagar" | "pregunta" | "otro";
  items?: Array<{ nombre: string; cantidad: number }>;
  respuesta_directa?: string;
}

export async function interpretarMensajeCliente(
  mensaje: string,
  pedidoActual: string,
  _menuResumen: string
): Promise<InterpretacionCliente> {
  const system = `${reglasAsistenteCliente()}

Cuando el cliente saluda por primera vez o escribe su primer mensaje, responde SIEMPRE con este texto exacto en el campo respuesta_directa:

${BIENVENIDA_CLIENTE}

Nunca uses la palabra Hola para saludar; usa Bienvenido/a.

Tu trabajo es interpretar mensajes de clientes por WhatsApp y devolver ÚNICAMENTE un JSON válido sin texto adicional.

${contextoNegocioIlPopolo()}

Pedido actual del cliente:
${pedidoActual || "Sin pedido abierto"}

Responde SOLO con este JSON según la intención del cliente:

Si quiere pedir algo (usa el nombre exacto del plato de la carta):
{"intencion":"pedir","items":[{"nombre":"nombre exacto del plato","cantidad":1}]}

Si quiere ver el menú:
{"intencion":"ver_menu"}

Si quiere ver su pedido actual:
{"intencion":"ver_pedido"}

Si quiere cancelar:
{"intencion":"cancelar"}

Si quiere pagar:
{"intencion":"pagar"}

Si pregunta por horarios, dirección, carta o el restaurante:
{"intencion":"pregunta","respuesta_directa":"respuesta breve y amable en español, solo con datos de Il Popolo"}

Para cualquier otra cosa:
{"intencion":"otro","respuesta_directa":"respuesta amable en español"}

IMPORTANTE: Devuelve SOLO el JSON, sin explicaciones ni texto adicional.`;

  const message = await anthropic.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 300,
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
    return "No he entendido tu mensaje. Escribe *menu* para ver la carta.";
  }
  return raw.trim();
}
