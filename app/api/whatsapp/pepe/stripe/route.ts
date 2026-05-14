// Webhook Stripe dedicado a pedidos Pepe: verifica firma y confirma cobros (payment_intent.succeeded).

import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { confirmarPago, confirmarPagoDesdeFrom } from "@/lib/popolo/stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2024-06-20" as Stripe.StripeConfig["apiVersion"],
});

export async function POST(req: NextRequest): Promise<NextResponse> {
  const rawBody = await req.text();

  const sig = req.headers.get("stripe-signature");
  if (!sig) {
    return NextResponse.json({ error: "Sin firma" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      rawBody,
      sig,
      process.env.PEPE_STRIPE_WEBHOOK_SECRET!
    );
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
      const from = session.metadata?.from;
      const originalIntentId = session.metadata?.pepe_payment_intent_id;
      const checkoutIntentId =
        typeof session.payment_intent === "string" ? session.payment_intent : undefined;

      console.log(
        "[Pepe Stripe webhook] checkout.session.completed:",
        session.id,
        "intent(original):",
        originalIntentId,
        "intent(checkout):",
        checkoutIntentId,
        "from:",
        from
      );

      let procesado = false;
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
        await confirmarPagoDesdeFrom(from, originalIntentId ?? checkoutIntentId);
      }
    }

    return NextResponse.json({ received: true }, { status: 200 });
  } catch (err) {
    console.error("[Pepe Stripe webhook] Error:", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

/*
 * App Router: no uses `export const config = { api: { bodyParser: false } }` (solo Pages API y Next 14 lo rechaza).
 * `await req.text()` devuelve el cuerpo en bruto; Stripe puede verificar la firma con ese string.
 */
