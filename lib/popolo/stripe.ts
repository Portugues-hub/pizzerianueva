// Enlaces de pago Stripe para El Rincón de Pepe y confirmación de cobros (PaymentIntent + Payment Link).

import Stripe from "stripe";
import { MENU } from "./menu";
import { memoryStore } from "./memory-store";
import type { LineaPedido } from "./pedidos";
import { registrarPedido } from "./inventario";
import { actualizarEstadoPedido, getPedido, marcarTipoPagoDespuesDeStripe } from "./pedidos";
import { enviarMensaje } from "./whatsapp";

let stripeSingleton: Stripe | null = null;

/** Cliente Stripe (lazy): evita fallar en el build de Vercel si aún no hay `STRIPE_SECRET_KEY`. */
export function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) {
    throw new Error("Falta STRIPE_SECRET_KEY en el entorno");
  }
  if (!stripeSingleton) {
    stripeSingleton = new Stripe(key);
  }
  return stripeSingleton;
}

type RegistroPago = {
  from: string;
  numeroPedido?: number;
  lineas: LineaPedido[];
};

function keyPago(paymentIntentId: string): string {
  return `pepe:pago:${paymentIntentId}`;
}

function keyPagoFrom(from: string): string {
  return `pepe:pago:from:${from}`;
}

function totalLineasEuros(lineas: LineaPedido[]): number {
  return lineas.reduce((acc, l) => acc + l.item.precio * l.cantidad, 0);
}

function formatLineaResumen(l: LineaPedido): string {
  const sub = (l.item.precio * l.cantidad).toFixed(2).replace(".", ",") + "€";
  return `• ${l.item.nombre} x${l.cantidad} — ${sub}`;
}

function formatTotalEuros(total: number): string {
  return total.toFixed(2).replace(".", ",");
}

/**
 * Crea un PaymentIntent (seguimiento/webhook) y un Payment Link (URL de pago para el cliente).
 * @throws Si Stripe falla (pedidos.ts revierte el estado del pedido).
 */
export async function crearPago(
  from: string,
  lineas: LineaPedido[],
  numeroPedido?: number
): Promise<string> {
  const resumen = lineas.map((l) => `${l.item.nombre} x${l.cantidad}`).join(", ");

  const session = await getStripe().checkout.sessions.create({
    payment_method_types: ["card"],
    customer_email: "pedidos@elrincondepepe.net",
    line_items: lineas.map((l) => ({
      price_data: {
        currency: "eur",
        product_data: { name: l.item.nombre },
        unit_amount: Math.round(l.item.precio * 100),
      },
      quantity: l.cantidad,
    })),
    mode: "payment",
    success_url: "https://elrincondepepe.net/gracias",
    cancel_url: "https://elrincondepepe.net/gracias",
    metadata: {
      from,
      numeroPedido: numeroPedido ? String(numeroPedido) : "",
      negocio: MENU.negocio.nombre,
    },
    payment_intent_data: {
      metadata: {
        from,
        numeroPedido: numeroPedido ? String(numeroPedido) : "",
        negocio: "rincon_de_pepe",
        resumen,
      },
    },
  });

  await memoryStore.set(
    keyPagoFrom(from),
    JSON.stringify({ from, numeroPedido, lineas }),
    "EX",
    86400
  );

  if (!session.url) {
    throw new Error("Stripe no devolvió URL de Checkout Session");
  }

  return session.url;
}

async function notificarPepe(from: string, lineas: LineaPedido[]): Promise<void> {
  const notif = process.env.PEPE_WA_NOTIF;
  if (!notif?.trim()) {
    console.warn("[Pepe Stripe] PEPE_WA_NOTIF no definido; no se notifica al local.");
    return;
  }

  const lineasTxt = lineas.map(formatLineaResumen).join("\n");
  const total = formatTotalEuros(totalLineasEuros(lineas));
  const mensajePepe =
    `🔔 *Nuevo pedido pagado*\n\nCliente: +${from}\n\n${lineasTxt}\n\n*Total: ${total}€*`;

  await enviarMensaje(notif.trim(), mensajePepe);
}

/**
 * Tras `payment_intent.succeeded` (u otro flujo que exponga el id del intent de seguimiento).
 */
export async function confirmarPago(paymentIntentId: string): Promise<boolean> {
  const rawRegistro = await memoryStore.get(keyPago(paymentIntentId));
  let registro = JSON.parse(rawRegistro ?? "null") as RegistroPago | null;
  let intentMetadataFrom: string | undefined;
  let intentNumeroPedido: number | undefined;

  if (!registro) {
    try {
      const intent = await getStripe().paymentIntents.retrieve(paymentIntentId);
      intentMetadataFrom = intent.metadata?.from;
      const rawNumero = intent.metadata?.numeroPedido;
      intentNumeroPedido = rawNumero ? Number(rawNumero) : undefined;
    } catch (err) {
      console.error("[Pepe Stripe] Error recuperando PaymentIntent para fallback:", err);
    }

    if (intentMetadataFrom) {
      const rawPorFrom = await memoryStore.get(keyPagoFrom(intentMetadataFrom));
      registro = JSON.parse(rawPorFrom ?? "null") as RegistroPago | null;
    }

    if (!registro && intentMetadataFrom) {
      const keys = await memoryStore.keys("pepe:pago:*");
      for (const key of keys) {
        if (key.startsWith("pepe:pago:from:")) continue;
        const raw = await memoryStore.get(key);
        const candidato = JSON.parse(raw ?? "null") as RegistroPago | null;
        if (candidato?.from === intentMetadataFrom) {
          registro = candidato;
          break;
        }
      }
    }
  }

  const from = registro?.from ?? intentMetadataFrom;
  if (!registro || !from) {
    console.warn("[Pepe Stripe] confirmarPago: sin registro para intent", paymentIntentId);
    return false;
  }

  const { lineas } = registro;
  const lineasTxt = lineas.map(formatLineaResumen).join("\n");
  const total = formatTotalEuros(totalLineasEuros(lineas));

  await enviarMensaje(
    from,
    `✅ *Pago confirmado*\n\nTu pedido está en cocina:\n${lineasTxt}\n\n*Total cobrado: ${total}€*\nTiempo estimado: 30-40 min.\n\nGracias por pedir en ${MENU.negocio.nombre} 🍕`
  );

  try {
    await notificarPepe(from, lineas);
  } catch (err) {
    console.warn("[Pepe Stripe] notificarPepe falló (no crítico):", err);
  }
  const numeroPedido = registro.numeroPedido ?? intentNumeroPedido;
  if (typeof numeroPedido === "number" && Number.isFinite(numeroPedido)) {
    await actualizarEstadoPedido(numeroPedido, "pagado");
    await marcarTipoPagoDespuesDeStripe(numeroPedido);
  }
  await registrarPedido(lineas);
  await memoryStore.del(keyPago(paymentIntentId));
  await memoryStore.del(keyPagoFrom(from));
  return true;
}

/** Fallback cuando Stripe solo aporta `from` en metadata (p.ej. checkout.session.completed). */
export async function confirmarPagoDesdeFrom(
  from: string,
  paymentIntentId?: string
): Promise<boolean> {
  const pedido = await getPedido(from);
  if (!pedido || pedido.lineas.length === 0) {
    console.warn("[Pepe Stripe] confirmarPagoDesdeFrom: pedido no encontrado para", from);
    return false;
  }

  const lineas = pedido.lineas;
  const lineasTxt = lineas.map(formatLineaResumen).join("\n");
  const total = formatTotalEuros(totalLineasEuros(lineas));

  await enviarMensaje(
    from,
    `✅ *Pago confirmado*\n\nTu pedido está en cocina:\n${lineasTxt}\n\n*Total cobrado: ${total}€*\nTiempo estimado: 30-40 min.\n\nGracias por pedir en ${MENU.negocio.nombre} 🍕`
  );
  try {
    await notificarPepe(from, lineas);
  } catch (err) {
    console.warn("[Pepe Stripe] notificarPepe falló (no crítico):", err);
  }
  await actualizarEstadoPedido(pedido.numeroPedido, "pagado");
  await marcarTipoPagoDespuesDeStripe(pedido.numeroPedido);
  await registrarPedido(lineas);

  if (paymentIntentId) {
    await memoryStore.del(keyPago(paymentIntentId));
  }
  await memoryStore.del(keyPagoFrom(from));
  return true;
}
