// Enlaces de pago Stripe para El Rincón de Pepe y confirmación de cobros (PaymentIntent + Payment Link).

import Stripe from "stripe";
import { MENU } from "./menu";
import { memoryStore } from "./memory-store";
import type { LineaPedido } from "./pedidos";
import { registrarPedido } from "./inventario";
import {
  actualizarEstadoPedido,
  getPedido,
  getPedidoPorNumero,
  marcarTipoPagoDespuesDeStripe,
} from "./pedidos";
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

function keyCheckoutSession(sessionId: string): string {
  return `pepe:checkout:${sessionId}`;
}

function urlPaginaGracias(): string {
  const base =
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.APP_URL?.trim() ||
    (process.env.VERCEL_URL?.trim() ? `https://${process.env.VERCEL_URL.trim()}` : "");
  if (base) return `${base.replace(/\/$/, "")}/gracias`;
  return "https://elrincondepepe.net/gracias";
}

function paymentIntentIdFromSession(
  session: Stripe.Checkout.Session
): string | undefined {
  const pi = session.payment_intent;
  if (typeof pi === "string") return pi;
  if (pi && typeof pi === "object" && "id" in pi) return pi.id;
  return undefined;
}

async function registrarPagoPendiente(
  registro: RegistroPago,
  sessionId: string,
  paymentIntentId?: string
): Promise<void> {
  const payload = JSON.stringify(registro);
  const ttl = 86400;
  await memoryStore.set(keyPagoFrom(registro.from), payload, "EX", ttl);
  await memoryStore.set(keyCheckoutSession(sessionId), payload, "EX", ttl);
  if (paymentIntentId) {
    await memoryStore.set(keyPago(paymentIntentId), payload, "EX", ttl);
  }
}

function keyPagoYaProcesado(registro: RegistroPago, paymentIntentId?: string, checkoutSessionId?: string): string {
  if (typeof registro.numeroPedido === "number" && Number.isFinite(registro.numeroPedido)) {
    return `pepe:pago:procesado:pedido:${registro.numeroPedido}`;
  }
  if (checkoutSessionId) return `pepe:pago:procesado:cs:${checkoutSessionId}`;
  if (paymentIntentId) return `pepe:pago:procesado:pi:${paymentIntentId}`;
  return `pepe:pago:procesado:from:${registro.from}`;
}

async function finalizarPagoConfirmado(
  registro: RegistroPago,
  paymentIntentId?: string,
  checkoutSessionId?: string
): Promise<void> {
  const idempotencyKey = keyPagoYaProcesado(registro, paymentIntentId, checkoutSessionId);
  if (await memoryStore.get(idempotencyKey)) {
    console.log("[Pepe Stripe] Pago ya procesado (idempotencia):", idempotencyKey);
    return;
  }

  const { from, lineas } = registro;
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

  let numeroPedido = registro.numeroPedido;
  if (typeof numeroPedido !== "number" || !Number.isFinite(numeroPedido)) {
    const pedidoActivo = await getPedido(from);
    if (pedidoActivo) numeroPedido = pedidoActivo.numeroPedido;
  }

  if (typeof numeroPedido === "number" && Number.isFinite(numeroPedido)) {
    await actualizarEstadoPedido(numeroPedido, "pagado");
    await marcarTipoPagoDespuesDeStripe(numeroPedido);
  }

  try {
    await registrarPedido(lineas);
    console.log("[Pepe Stripe] Inventario descontado tras pago", numeroPedido ?? from);
  } catch (err) {
    console.error("[Pepe Stripe] Error descontando inventario:", err);
  }

  await memoryStore.set(idempotencyKey, "1", "EX", 86400 * 30);

  if (paymentIntentId) await memoryStore.del(keyPago(paymentIntentId));
  await memoryStore.del(keyPagoFrom(from));
  if (checkoutSessionId) await memoryStore.del(keyCheckoutSession(checkoutSessionId));
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
  if (lineas.length === 0) {
    throw new Error("No hay líneas en el pedido para cobrar");
  }

  const resumen = lineas.map((l) => `${l.item.nombre} x${l.cantidad}`).join(", ");
  const registro: RegistroPago = { from, numeroPedido, lineas };
  const urlGracias = urlPaginaGracias();

  const session = await getStripe().checkout.sessions.create({
    payment_method_types: ["card"],
    line_items: lineas.map((l) => ({
      price_data: {
        currency: "eur",
        product_data: { name: l.item.nombre },
        unit_amount: Math.round(l.item.precio * 100),
      },
      quantity: l.cantidad,
    })),
    mode: "payment",
    success_url: urlGracias,
    cancel_url: urlGracias,
    metadata: {
      from,
      numeroPedido: numeroPedido ? String(numeroPedido) : "",
      negocio: MENU.negocio.nombre,
    },
    payment_intent_data: {
      metadata: {
        from,
        numeroPedido: numeroPedido ? String(numeroPedido) : "",
        negocio: MENU.negocio.nombre,
        resumen,
      },
    },
  });

  if (!session.url) {
    throw new Error("Stripe no devolvió URL de Checkout Session");
  }

  let paymentIntentId = paymentIntentIdFromSession(session);
  if (!paymentIntentId) {
    const full = await getStripe().checkout.sessions.retrieve(session.id, {
      expand: ["payment_intent"],
    });
    paymentIntentId = paymentIntentIdFromSession(full);
  }

  await registrarPagoPendiente(registro, session.id, paymentIntentId);

  if (paymentIntentId) {
    await getStripe().checkout.sessions.update(session.id, {
      metadata: {
        from,
        numeroPedido: numeroPedido ? String(numeroPedido) : "",
        negocio: MENU.negocio.nombre,
        pepe_payment_intent_id: paymentIntentId,
      },
    });
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

  if (!registro) {
    try {
      const intent = await getStripe().paymentIntents.retrieve(paymentIntentId);
      intentMetadataFrom = intent.metadata?.from;
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
  if (!registro?.lineas?.length || !from) {
    console.warn("[Pepe Stripe] confirmarPago: sin registro para intent", paymentIntentId);
    if (intentMetadataFrom) {
      try {
        const intent = await getStripe().paymentIntents.retrieve(paymentIntentId);
        const n = intent.metadata?.numeroPedido ? Number(intent.metadata.numeroPedido) : undefined;
        return confirmarPagoDesdeFrom(
          intentMetadataFrom,
          paymentIntentId,
          undefined,
          Number.isFinite(n) ? n : undefined
        );
      } catch {
        return confirmarPagoDesdeFrom(intentMetadataFrom, paymentIntentId);
      }
    }
    return false;
  }

  await finalizarPagoConfirmado(registro, paymentIntentId);
  return true;
}

/** Tras `checkout.session.completed`: usa el registro guardado al crear el enlace. */
export async function confirmarPagoDesdeCheckoutSession(
  session: Stripe.Checkout.Session
): Promise<boolean> {
  const raw = await memoryStore.get(keyCheckoutSession(session.id));
  let registro = JSON.parse(raw ?? "null") as RegistroPago | null;

  const from = session.metadata?.from ?? registro?.from;
  if (!registro?.lineas?.length && from) {
    const rawFrom = await memoryStore.get(keyPagoFrom(from));
    registro = JSON.parse(rawFrom ?? "null") as RegistroPago | null;
  }

  const paymentIntentId =
    session.metadata?.pepe_payment_intent_id ??
    paymentIntentIdFromSession(session);

  if (registro?.lineas?.length && from) {
    await finalizarPagoConfirmado(
      { ...registro, from: registro.from ?? from },
      paymentIntentId,
      session.id
    );
    return true;
  }

  if (from) {
    const rawNumero = session.metadata?.numeroPedido;
    const numeroPedido = rawNumero ? Number(rawNumero) : undefined;
    return confirmarPagoDesdeFrom(
      from,
      paymentIntentId,
      session.id,
      Number.isFinite(numeroPedido) ? numeroPedido : undefined
    );
  }

  console.warn("[Pepe Stripe] confirmarPagoDesdeCheckoutSession: sin datos", session.id);
  return false;
}

/** Fallback cuando el pedido sigue activo en memoria (misma instancia). */
export async function confirmarPagoDesdeFrom(
  from: string,
  paymentIntentId?: string,
  checkoutSessionId?: string,
  numeroPedidoHint?: number
): Promise<boolean> {
  let pedido =
    typeof numeroPedidoHint === "number" && Number.isFinite(numeroPedidoHint)
      ? await getPedidoPorNumero(numeroPedidoHint)
      : undefined;
  if (!pedido?.lineas.length) {
    pedido = await getPedido(from);
  }
  if (!pedido?.lineas.length) {
    console.warn("[Pepe Stripe] confirmarPagoDesdeFrom: pedido no encontrado para", from);
    return false;
  }

  const registro: RegistroPago = {
    from,
    numeroPedido: pedido.numeroPedido,
    lineas: pedido.lineas,
  };
  await finalizarPagoConfirmado(registro, paymentIntentId, checkoutSessionId);
  return true;
}
