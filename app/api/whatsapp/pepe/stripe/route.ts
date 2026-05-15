// Webhook Stripe: verifica firma y confirma cobros (payment_intent.succeeded / checkout.session.completed).

import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import {
  confirmarPago,
  confirmarPagoDesdeCheckoutSession,
  confirmarPagoDesdeFrom,
  getStripe,
} from "@/lib/popolo/stripe";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest): Promise<NextResponse> {
  const webhookSecret = process.env.PEPE_STRIPE_WEBHOOK_SECRET?.trim();
  if (!webhookSecret) {
    console.error("[Pepe Stripe webhook] Falta PEPE_STRIPE_WEBHOOK_SECRET");
    return NextResponse.json({ error: "Webhook no configurado" }, { status: 503 });
  }

  let stripe: Stripe;
  try {
    stripe = getStripe();
  } catch (e) {
    console.error("[Pepe Stripe webhook] Stripe no disponible:", e);
    return NextResponse.json({ error: "Stripe no configurado" }, { status: 503 });
  }

  const rawBody = await req.text();

  const sig = req.headers.get("stripe-signature");
  if (!sig) {
    return NextResponse.json({ error: "Sin firma" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
  } catch (err) {
    console.error("[Pepe Stripe webhook] Firma inválida:", err);
    return NextResponse.json({ error: "Firma inválida" }, { status: 400 });
  }

  if (event.type !== "payment_intent.succeeded" && event.type !== "checkout.session.completed") {
    return NextResponse.json({ received: true }, { status: 200 });
  }

  try {
    if (event.type === "payment_intent.succeeded") {
      const intent = event.data.object as Stripe.PaymentIntent;
      console.log(
        "[Pepe Stripe webhook] Pago confirmado:",
        intent.id,
        "from:",
        intent.metadata?.from
      );

      await confirmarPago(intent.id);

      const originalIntentId = intent.metadata?.pepe_payment_intent_id;
      if (originalIntentId && originalIntentId !== intent.id) {
        await confirmarPago(originalIntentId);
      }
    } else {
      const session = event.data.object as Stripe.Checkout.Session;

      console.log(
        "[Pepe Stripe webhook] checkout.session.completed:",
        session.id,
        "from:",
        session.metadata?.from
      );

      let procesado = false;
      try {
        procesado = await confirmarPagoDesdeCheckoutSession(session);
      } catch (err) {
        console.error("[Pepe Stripe webhook] Error en confirmarPagoDesdeCheckoutSession:", err);
      }

      if (!procesado) {
        const from = session.metadata?.from;
        const originalIntentId = session.metadata?.pepe_payment_intent_id;
        const checkoutIntentId =
          typeof session.payment_intent === "string" ? session.payment_intent : undefined;

        if (originalIntentId) {
          try {
            procesado = await confirmarPago(originalIntentId);
          } catch (err) {
            console.error(
              "[Pepe Stripe webhook] Error confirmando por pepe_payment_intent_id:",
              err
            );
          }
        }

        if (!procesado && from) {
          await confirmarPagoDesdeFrom(
            from,
            originalIntentId ?? checkoutIntentId,
            session.id
          );
        }
      }
    }

    return NextResponse.json({ received: true }, { status: 200 });
  } catch (err) {
    console.error("[Pepe Stripe webhook] Error:", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

/*
 * App Router: `await req.text()` conserva el cuerpo en bruto para `constructEvent`.
 */
