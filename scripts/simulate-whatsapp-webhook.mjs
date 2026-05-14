#!/usr/bin/env node
/**
 * Simula un mensaje entrante de WhatsApp Cloud API contra el webhook local.
 *
 * Uso:
 *   node scripts/simulate-whatsapp-webhook.mjs
 *   node scripts/simulate-whatsapp-webhook.mjs "Quiero ver el menu"
 *   WEBHOOK_URL=http://127.0.0.1:3000/api/whatsapp/pepe/webhook node scripts/simulate-whatsapp-webhook.mjs
 *
 * Arranca antes el servidor en el puerto correspondiente, p. ej.:
 *   npx next dev -p 3002
 *
 * El POST devuelve 200 enseguida; el procesamiento va en segundo plano (waitUntil).
 * Revisa la consola del servidor y, si tienes PEPE_PHONE_ID / PEPE_WA_TOKEN, la API de Meta.
 */

const defaultUrl = "http://localhost:3002/api/whatsapp/pepe/webhook";
const url = process.env.WEBHOOK_URL ?? defaultUrl;
const texto =
  process.argv.slice(2).join(" ").trim() || "Hola, ¿qué pizzas tenéis?";

/** Cuerpo mínimo compatible con `procesarWebhook` en app/api/whatsapp/pepe/webhook/route.ts */
const body = {
  object: "whatsapp_business_account",
  entry: [
    {
      id: "test_entry",
      changes: [
        {
          field: "messages",
          value: {
            messaging_product: "whatsapp",
            messages: [
              {
                from: "34600111222",
                id: `wamid.test_${Date.now()}`,
                timestamp: String(Math.floor(Date.now() / 1000)),
                type: "text",
                text: { body: texto },
              },
            ],
          },
        },
      ],
    },
  ],
};

console.log("POST", url);
console.log("Mensaje:", JSON.stringify(texto));

const res = await fetch(url, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

const out = await res.text();
console.log("Respuesta:", res.status, res.statusText);
console.log(out);

if (!res.ok) {
  process.exit(1);
}
