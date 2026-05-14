// Una sola responsabilidad: enviar mensajes de texto a WhatsApp vía Meta Graph API.

export async function enviarMensaje(telefono: string, texto: string): Promise<void> {
  const phoneId = process.env.PEPE_PHONE_ID;
  const token = process.env.PEPE_WA_TOKEN;
  if (!phoneId || !token) {
    throw new Error("Faltan PEPE_PHONE_ID o PEPE_WA_TOKEN en process.env");
  }

  const url = `https://graph.facebook.com/v21.0/${phoneId}/messages`;

  console.log("[Pepe WhatsApp] →", telefono);
  console.log("[Pepe WhatsApp] URL:", url);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: telefono,
        type: "text",
        text: { body: texto },
      }),
    });
  } catch (err) {
    clearTimeout(timeout);
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error("Timeout conectando con Meta API");
    }
    throw err;
  }

  clearTimeout(timeout);

  console.log("[Pepe WhatsApp] Status:", res.status);
  const bodyText = await res.text();
  console.log("[Pepe WhatsApp] Body:", bodyText);
  if (!res.ok) {
    throw new Error(bodyText || `HTTP ${res.status}`);
  }
}
