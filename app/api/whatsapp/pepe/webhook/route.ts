// Verificación GET (Meta) y recepción POST de mensajes WhatsApp Cloud API.

import { NextRequest, NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { procesarMensaje } from "@/lib/popolo/pedidos";
import { enviarMensaje } from "@/lib/popolo/whatsapp";

export const dynamic = "force-dynamic";

/** Token que Meta envía en `hub.verify_token` (configúralo igual en el panel de Meta). */
function getVerifyToken(): string | undefined {
  const t = process.env.PEPE_VERIFY_TOKEN?.trim();
  return t || undefined;
}

/** Procesa el cuerpo del webhook; errores se registran en el .catch() del caller. */
async function procesarWebhook(body: unknown): Promise<void> {
  if (
    typeof body !== "object" ||
    body === null ||
    (body as { object?: string }).object !== "whatsapp_business_account"
  ) {
    return;
  }

  const entry = (body as { entry?: unknown[] }).entry?.[0] as
    | { changes?: unknown[] }
    | undefined;
  const change = entry?.changes?.[0] as { value?: Record<string, unknown> } | undefined;
  const value = change?.value;
  const messages = value?.messages as unknown[] | undefined;
  const message = messages?.[0] as
    | {
        from?: string;
        type?: string;
        text?: { body?: string };
      }
    | undefined;

  if (!message) {
    return;
  }

  const from = message.from;
  if (!from) {
    return;
  }

  if (message.type !== "text") {
    await enviarMensaje(
      from,
      "Solo entiendo mensajes de texto por ahora 😊\n" + "Escribe *menu* para ver la carta."
    );
    return;
  }

  const texto = message.text?.body;
  if (typeof texto !== "string") {
    return;
  }

  console.log("[Pepe webhook] Mensaje de:", from);
  await procesarMensaje(from, texto);
}

/**
 * Verificación del webhook (Meta): GET con hub.mode=subscribe, hub.verify_token y hub.challenge.
 * Si el token coincide, hay que devolver el challenge en texto plano (status 200).
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const params = req.nextUrl.searchParams;
  const mode = params.get("hub.mode");
  const token = params.get("hub.verify_token");
  const challenge = params.get("hub.challenge");

  if (mode !== "subscribe") {
    return new NextResponse("Forbidden", { status: 403 });
  }

  if (challenge === null || token === null) {
    return new NextResponse("Bad Request", { status: 400 });
  }

  const expected = getVerifyToken();
  if (!expected) {
    console.error("[Popolo webhook] Falta PEPE_VERIFY_TOKEN en variables de entorno");
    return new NextResponse("Webhook no configurado", { status: 503 });
  }

  if (token.trim() !== expected) {
    console.warn("[Popolo webhook] hub.verify_token no coincide con PEPE_VERIFY_TOKEN");
    return new NextResponse("Forbidden", { status: 403 });
  }

  return new NextResponse(challenge, {
    status: 200,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const body = await req.json();

  waitUntil(
    procesarWebhook(body).catch((err) =>
      console.error("[Pepe webhook] Error procesando:", err)
    )
  );

  return NextResponse.json({ ok: true }, { status: 200 });
}
