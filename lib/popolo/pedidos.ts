// Estado de pedidos en almacén en memoria y procesamiento de mensajes entrantes de WhatsApp (El Rincón de Pepe).

import type { ItemMenu } from "./menu";
import { memoryStore } from "./memory-store";
import { buscarItem, formatearMenu } from "./menu";
import { BIENVENIDA_CLIENTE, interpretarMensajeCliente } from "./claude";
import { registrarPedido } from "./inventario";
import { enviarMensaje } from "./whatsapp";

export interface LineaPedido {
  item: ItemMenu;
  cantidad: number;
}

export interface Pedido {
  from: string;
  lineas: LineaPedido[];
  creadoEn: Date;
  estado: "abierto" | "pagando" | "pagado" | "preparacion" | "listo" | "cobrado";
  numeroPedido: number;
  tipoEntrega?: "local" | "domicilio";
  direccion?: string;
  /** Anotación del cliente (sin gluten, sin cebolla…). */
  nota?: string;
  /** Tras elegir método de pago: tarjeta (Stripe) o efectivo. */
  tipoPago?: "stripe" | "efectivo";
  /** Tras *pagar*: esperando *tarjeta* o *efectivo*. */
  esperandoMetodoPago?: boolean;
}

function formatEuro(n: number): string {
  return `${n.toFixed(2).replace(".", ",")}€`;
}

function subtotalLinea(l: LineaPedido): number {
  return l.item.precio * l.cantidad;
}

function totalPedido(p: Pedido): number {
  return p.lineas.reduce((acc, l) => acc + subtotalLinea(l), 0);
}

function keyPedido(numeroPedido: number): string {
  return `pepe:pedido:${numeroPedido}`;
}

function normalizarPedido(valor: unknown): Pedido | undefined {
  if (!valor || typeof valor !== "object") return undefined;
  const raw = valor as {
    from?: string;
    lineas?: LineaPedido[];
    creadoEn?: string | Date;
    estado?: Pedido["estado"];
    numeroPedido?: number;
    tipoEntrega?: "local" | "domicilio";
    direccion?: string;
    nota?: string;
    tipoPago?: "stripe" | "efectivo";
    esperandoMetodoPago?: boolean;
  };
  if (
    !raw.from ||
    !Array.isArray(raw.lineas) ||
    !raw.creadoEn ||
    !raw.estado ||
    !raw.numeroPedido
  ) {
    return undefined;
  }
  const out: Pedido = {
    from: raw.from,
    lineas: raw.lineas,
    creadoEn: raw.creadoEn instanceof Date ? raw.creadoEn : new Date(raw.creadoEn),
    estado: raw.estado,
    numeroPedido: raw.numeroPedido,
  };
  if (raw.tipoEntrega === "local" || raw.tipoEntrega === "domicilio") {
    out.tipoEntrega = raw.tipoEntrega;
  }
  if (typeof raw.direccion === "string" && raw.direccion.trim()) {
    out.direccion = raw.direccion.trim();
  }
  if (typeof raw.nota === "string" && raw.nota.trim()) {
    out.nota = raw.nota.trim();
  }
  if (raw.tipoPago === "stripe" || raw.tipoPago === "efectivo") {
    out.tipoPago = raw.tipoPago;
  }
  if (raw.esperandoMetodoPago === true) {
    out.esperandoMetodoPago = true;
  }
  return out;
}

function textoResumenPedido(p: Pedido, prefijoAnotado?: { nombre: string; precio: string }): string {
  const lineasTxt = p.lineas.map(
    (l) => `• ${l.item.nombre} x${l.cantidad} — ${formatEuro(subtotalLinea(l))}`
  );
  const cuerpo = `Tu pedido hasta ahora:\n${lineasTxt.join("\n")}\nTotal: ${formatEuro(totalPedido(p))}\nEscribe *pagar* cuando quieras cerrar el pedido.`;
  if (prefijoAnotado) {
    return `Anotado ✓ *${prefijoAnotado.nombre}* — ${prefijoAnotado.precio}\n${cuerpo}`;
  }
  return cuerpo;
}

async function guardarPedido(pedido: Pedido): Promise<void> {
  try {
    await memoryStore.set(keyPedido(pedido.numeroPedido), JSON.stringify(pedido));
  } catch (err) {
    console.error("[Pepe pedidos] Error en guardarPedido:", err);
    throw err;
  }
}

async function obtenerPedido(numeroPedido: number): Promise<Pedido | undefined> {
  try {
    const raw = await memoryStore.get(keyPedido(numeroPedido));
    const valor = JSON.parse(raw ?? "null");
    return normalizarPedido(valor);
  } catch (err) {
    console.error("[Pepe pedidos] Error en obtenerPedido:", err);
    throw err;
  }
}

async function obtenerPedidosDesdeAlmacen(): Promise<Pedido[]> {
  const keys = await memoryStore.keys("pepe:pedido:*");
  if (keys.length === 0) return [];
  const valoresRaw = await memoryStore.mget(...keys);
  return valoresRaw
    .map((v) => normalizarPedido(JSON.parse(v ?? "null")))
    .filter((p): p is Pedido => p !== undefined);
}

async function obtenerPedidoActivoPorFrom(from: string): Promise<Pedido | undefined> {
  const pedidos = await obtenerPedidosDesdeAlmacen();
  const activos = pedidos
    .filter((p) => p.from === from && (p.estado === "abierto" || p.estado === "pagando"))
    .sort((a, b) => b.numeroPedido - a.numeroPedido);
  return activos[0];
}

async function obtenerOCrearPedido(from: string): Promise<Pedido> {
  try {
    let p = await obtenerPedidoActivoPorFrom(from);
    if (!p) {
      const numeroPedido = await memoryStore.incr("pepe:pedido:seq");
      p = {
        from,
        lineas: [],
        creadoEn: new Date(),
        estado: "abierto",
        numeroPedido,
      };
      await guardarPedido(p);
    }
    return p;
  } catch (err) {
    console.error("[Pepe pedidos] Error en obtenerOCrearPedido:", err);
    throw err;
  }
}

export interface PedidoConTelefono {
  from: string;
  lineas: LineaPedido[];
  total: number;
  creadoEn: Date;
  estado: "abierto" | "pagando" | "pagado" | "preparacion" | "listo" | "cobrado";
  numeroPedido: number;
  tipoEntrega?: "local" | "domicilio";
  direccion?: string;
  nota?: string;
  tipoPago?: "stripe" | "efectivo";
}

/** Devuelve el pedido actual de ese número (p. ej. tras confirmar pago en Stripe). */
export async function getPedido(from: string): Promise<Pedido | undefined> {
  return obtenerPedidoActivoPorFrom(from);
}

export async function getPedidoPorNumero(numeroPedido: number): Promise<Pedido | undefined> {
  return obtenerPedido(numeroPedido);
}

/** Lista de pedidos activos para panel de cocina/informes. */
export async function getPedidosActivos(): Promise<PedidoConTelefono[]> {
  const pedidos = await obtenerPedidosDesdeAlmacen();
  return pedidos
    .map((p) => ({
      from: p.from,
      lineas: p.lineas,
      total: totalPedido(p),
      creadoEn: p.creadoEn,
      estado: p.estado,
      numeroPedido: p.numeroPedido,
      tipoEntrega: p.tipoEntrega,
      direccion: p.direccion,
      nota: p.nota,
      tipoPago: p.tipoPago,
    }))
    .sort((a, b) => a.numeroPedido - b.numeroPedido);
}

/** Tras cobro confirmado: elimina el pedido de memoria. */
export async function cerrarPedido(numeroPedido: number): Promise<void> {
  await memoryStore.del(keyPedido(numeroPedido));
}

/** Panel de cocina: persiste cambios de estado del pedido. */
export async function persistirPedidoDesdePanel(pedido: Pedido): Promise<void> {
  await guardarPedido(pedido);
}

export async function actualizarEstadoPedido(
  numeroPedido: number,
  estado: Pedido["estado"]
): Promise<void> {
  const pedido = await obtenerPedido(numeroPedido);
  if (!pedido) return;
  pedido.estado = estado;
  await guardarPedido(pedido);
}

/** Tras cobro con Stripe: marca pago con tarjeta y limpia espera de método. */
export async function marcarTipoPagoDespuesDeStripe(numeroPedido: number): Promise<void> {
  const pedido = await obtenerPedido(numeroPedido);
  if (!pedido) return;
  pedido.tipoPago = "stripe";
  delete pedido.esperandoMetodoPago;
  await guardarPedido(pedido);
}

const MSG_METODO_PAGO =
  "Como quieres pagar?\n\n💳 Escribe *tarjeta* para pagar online ahora\n💵 Escribe *efectivo* para pagar al recibir el pedido";

async function solicitarMetodoPago(pedido: Pedido, from: string): Promise<void> {
  pedido.estado = "pagando";
  pedido.esperandoMetodoPago = true;
  await guardarPedido(pedido);
  await enviarMensaje(from, MSG_METODO_PAGO);
}

async function generarYEnviarLinkPago(pedido: Pedido, from: string): Promise<void> {
  type CrearPagoFn = (waFrom: string, lineas: LineaPedido[], numeroPedido?: number) => Promise<string>;
  const stripeMod = (await import("./stripe")) as { crearPago?: CrearPagoFn };
  if (typeof stripeMod.crearPago !== "function") {
    pedido.estado = "abierto";
    delete pedido.esperandoMetodoPago;
    await guardarPedido(pedido);
    await enviarMensaje(
      from,
      "El pago no está disponible en este momento. Inténtalo más tarde o llama al restaurante."
    );
    return;
  }

  let url: string;
  try {
    url = await stripeMod.crearPago(from, pedido.lineas, pedido.numeroPedido);
  } catch {
    pedido.estado = "abierto";
    delete pedido.esperandoMetodoPago;
    await guardarPedido(pedido);
    await enviarMensaje(from, "No se pudo generar el enlace de pago. Inténtalo de nuevo.");
    return;
  }

  if (!url?.trim()) {
    pedido.estado = "abierto";
    delete pedido.esperandoMetodoPago;
    await guardarPedido(pedido);
    await enviarMensaje(from, "No se pudo generar el enlace de pago. Inténtalo de nuevo.");
    return;
  }

  await enviarMensaje(
    from,
    `Perfecto. Aquí tienes tu link de pago seguro:\n${url.trim()}\nEl pedido quedará confirmado cuando se complete el pago.`
  );
}

export async function procesarMensaje(from: string, texto: string): Promise<void> {
  const MSG_OPCION_ENTREGA =
    "¿Cómo quieres recibir tu pedido?\n\n🏪 Escribe *local* para recoger en el restaurante\n🛵 Escribe *domicilio* para recibirlo en casa";

  const MSG_DIRECCION = "¿Cuál es tu dirección completa para la entrega? 📍";

  // PASO 1 — BIENVENIDA (solo primera vez)
  const keyVisto = `pepe:visto:${from}`;
  const visto = await memoryStore.get(keyVisto);
  if (!visto) {
    await memoryStore.set(keyVisto, "1");
    await enviarMensaje(from, BIENVENIDA_CLIENTE);
    return;
  }

  const keyEsperaNota = `pepe:esperando_nota:${from}`;
  const esperaNota = await memoryStore.get(keyEsperaNota);
  if (esperaNota) {
    await memoryStore.del(keyEsperaNota);
    const pedidoNota = await obtenerPedidoActivoPorFrom(from);
    if (pedidoNota && pedidoNota.lineas.length > 0) {
      const notaTxt = texto.trim();
      if (notaTxt) pedidoNota.nota = notaTxt;
      else delete pedidoNota.nota;
      await guardarPedido(pedidoNota);
      await enviarMensaje(
        from,
        "Listo, he guardado tu nota en el pedido. Escribe *pagar* cuando quieras cerrar el pedido."
      );
    }
    return;
  }

  const t = texto.trim().toLowerCase();

  // PASO 2 — COMANDOS EXACTOS (en este orden)
  if (t === "menu" || t === "carta") {
    await enviarMensaje(from, formatearMenu());
    return;
  }

  if (t === "mi pedido" || t === "resumen") {
    const pedido = await obtenerPedidoActivoPorFrom(from);
    if (!pedido || pedido.lineas.length === 0) {
      await enviarMensaje(
        from,
        "No tienes ningún pedido abierto.\nEscribe *menu* para ver la carta."
      );
      return;
    }
    await enviarMensaje(from, textoResumenPedido(pedido));
    return;
  }

  if (t === "cancelar") {
    await memoryStore.del(keyEsperaNota);
    const pedido = await obtenerPedidoActivoPorFrom(from);
    if (!pedido || pedido.lineas.length === 0) {
      await enviarMensaje(from, "No tienes ningún pedido abierto que cancelar.");
      return;
    }
    await cerrarPedido(pedido.numeroPedido);
    await enviarMensaje(
      from,
      "Pedido cancelado.\nEscribe *menu* cuando quieras volver a pedir."
    );
    return;
  }

  const esNotaCmd = t === "nota" || t === "anotacion" || t === "anotación";
  if (esNotaCmd) {
    const pedido = await obtenerPedidoActivoPorFrom(from);
    if (!pedido || pedido.lineas.length === 0) {
      await enviarMensaje(
        from,
        "No tienes ningún pedido abierto para añadir una nota.\nEscribe *menu* para ver la carta."
      );
      return;
    }
    await memoryStore.set(keyEsperaNota, "1", "EX", 86400);
    await enviarMensaje(
      from,
      "Escribe tu nota o personalizacion para el pedido (sin gluten, sin cebolla, etc.) y la anotare:"
    );
    return;
  }

  if (t === "local") {
    const pedido = await obtenerPedidoActivoPorFrom(from);
    if (pedido?.estado === "pagando" && !pedido.tipoEntrega) {
      pedido.tipoEntrega = "local";
      await guardarPedido(pedido);
      await solicitarMetodoPago(pedido, from);
      return;
    }
  }

  if (t === "domicilio") {
    const pedido = await obtenerPedidoActivoPorFrom(from);
    if (pedido?.estado === "pagando" && !pedido.tipoEntrega) {
      pedido.tipoEntrega = "domicilio";
      await guardarPedido(pedido);
      await enviarMensaje(from, MSG_DIRECCION);
      return;
    }
  }

  if (t === "tarjeta") {
    const pedido = await obtenerPedidoActivoPorFrom(from);
    if (pedido?.esperandoMetodoPago) {
      pedido.esperandoMetodoPago = false;
      await guardarPedido(pedido);
      await generarYEnviarLinkPago(pedido, from);
      return;
    }
  }

  if (t === "efectivo") {
    const pedido = await obtenerPedidoActivoPorFrom(from);
    if (pedido?.esperandoMetodoPago) {
      pedido.esperandoMetodoPago = false;
      pedido.estado = "pagado";
      pedido.tipoPago = "efectivo";
      await guardarPedido(pedido);
      await registrarPedido(pedido.lineas);
      await enviarMensaje(
        from,
        "Perfecto! Tu pedido esta confirmado. Pago en efectivo al recibir. Gracias!"
      );
      return;
    }
  }

  if (t === "pagar" || t === "cerrar") {
    const pedido = await obtenerPedidoActivoPorFrom(from);
    if (!pedido || pedido.lineas.length === 0) {
      await enviarMensaje(from, "No tienes ningún pedido para pagar. Añade platos con *pido [nombre]* o escribe *menu*.");
      return;
    }
    if (pedido.esperandoMetodoPago) {
      const listoParaMetodo =
        pedido.tipoEntrega === "local" ||
        (pedido.tipoEntrega === "domicilio" && Boolean(pedido.direccion?.trim()));
      if (listoParaMetodo) {
        await enviarMensaje(from, MSG_METODO_PAGO);
        return;
      }
    }
    if (!pedido.tipoEntrega) {
      pedido.estado = "pagando";
      await guardarPedido(pedido);
      await enviarMensaje(from, "¿Cómo quieres recibir tu pedido?\n\n🏪 Escribe *local* para recoger en el restaurante\n🛵 Escribe *domicilio* para recibirlo en casa");
      return;
    }
    if (pedido.tipoEntrega === "domicilio" && !pedido.direccion?.trim()) {
      pedido.estado = "pagando";
      await guardarPedido(pedido);
      await enviarMensaje(from, MSG_DIRECCION);
      return;
    }
    await solicitarMetodoPago(pedido, from);
    return;
  }

  if (t.startsWith("pido ")) {
    const nombreItem = texto.trim().slice("pido ".length).trim();
    console.log("[Pepe pedidos] pido detectado, nombre:", nombreItem);
    const item = buscarItem(nombreItem);
    console.log("[Pepe pedidos] item encontrado:", item);
    if (!item) {
      await enviarMensaje(
        from,
        "No encuentro ese plato en la carta.\nEscribe *menu* para ver todos los platos disponibles."
      );
      return;
    }
    const pedido = await obtenerOCrearPedido(from);
    console.log("[Pepe pedidos] pedido obtenido:", pedido);
    const existente = pedido.lineas.find((l) => l.item.id === item.id);
    if (existente) existente.cantidad += 1;
    else pedido.lineas.push({ item, cantidad: 1 });
    await guardarPedido(pedido);
    await enviarMensaje(
      from,
      textoResumenPedido(pedido, { nombre: item.nombre, precio: formatEuro(item.precio) })
    );
    return;
  }

  // PASO 3 — DIRECCIÓN (domicilio pendiente)
  const pedidoDomicilio = await obtenerPedidoActivoPorFrom(from);
  if (
    pedidoDomicilio &&
    pedidoDomicilio.estado === "pagando" &&
    pedidoDomicilio.tipoEntrega === "domicilio" &&
    !pedidoDomicilio.direccion?.trim()
  ) {
    const palabraReservada =
      t === "menu" ||
      t === "carta" ||
      t === "mi pedido" ||
      t === "resumen" ||
      t === "cancelar" ||
      t === "pagar" ||
      t === "cerrar" ||
      t === "local" ||
      t === "domicilio" ||
      t === "tarjeta" ||
      t === "efectivo" ||
      t === "nota" ||
      t === "anotacion" ||
      t === "anotación" ||
      t.startsWith("pido ");
    if (!palabraReservada) {
      const dir = texto.trim();
      if (!dir) {
        await enviarMensaje(from, MSG_DIRECCION);
        return;
      }
      pedidoDomicilio.direccion = dir;
      await guardarPedido(pedidoDomicilio);
      await solicitarMetodoPago(pedidoDomicilio, from);
      return;
    }
    if (t === "pagar" || t === "cerrar") {
      await enviarMensaje(from, MSG_DIRECCION);
      return;
    }
  }

  // PASO 4 — Claude solo para preguntas (el pedido va por comandos fijos)
  let pedidoResumen = "Sin pedido abierto";
  const pedidoActual = await obtenerPedidoActivoPorFrom(from);
  if (pedidoActual && pedidoActual.lineas.length > 0) {
    pedidoResumen = pedidoActual.lineas
      .map((l) => `${l.item.nombre} x${l.cantidad}`)
      .join(", ");
  }

  try {
    const interpretacion = await interpretarMensajeCliente(texto, pedidoResumen, "");
    await enviarMensaje(
      from,
      interpretacion.respuesta_directa ??
        "No he entendido tu mensaje. Escribe *menu* para ver la carta o *pido [plato]* para añadir algo."
    );
  } catch {
    await enviarMensaje(from, "Lo siento, no he entendido tu mensaje. Escribe *menu* para ver la carta.");
  }
}
