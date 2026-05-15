// Estado de pedidos en almacén en memoria y procesamiento de mensajes entrantes de WhatsApp (El Rincón de Pepe).

import type { ItemMenu } from "./menu";
import { memoryStore } from "./memory-store";
import { buscarItem, formatearMenu } from "./menu";
import {
  BIENVENIDA_CLIENTE,
  type ContextoPedidoCliente,
  type InterpretacionCliente,
  interpretarMensajeCliente,
  textoRespuestaParaCliente,
} from "./claude";
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
  const cuerpo = `Tu pedido hasta ahora:\n${lineasTxt.join("\n")}\nTotal: ${formatEuro(totalPedido(p))}\nCuando quieras cerrar el pedido, dímelo y te guío.`;
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
  "¿Cómo prefieres pagar?\n\n💳 Con tarjeta online (te envío un enlace seguro)\n💵 En efectivo al recibir el pedido\n\nDímelo con naturalidad y lo gestionamos.";

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

const MSG_OPCION_ENTREGA =
  "¿Cómo quieres recibir tu pedido?\n\n🏪 Recoger en el restaurante\n🛵 Entrega a domicilio\n\nDímelo con naturalidad.";

const MSG_DIRECCION = "¿Cuál es tu dirección completa para la entrega? 📍";

function construirContextoPedido(pedido: Pedido | undefined): ContextoPedidoCliente {
  if (!pedido || pedido.lineas.length === 0) {
    return {
      lineasResumen: "Sin platos",
      estado: "sin_pedido",
    };
  }

  const lineasResumen = pedido.lineas
    .map((l) => `${l.item.nombre} x${l.cantidad}`)
    .join(", ");

  let pendiente: string | undefined;
  if (pedido.esperandoMetodoPago) {
    pendiente = "elegir método de pago (tarjeta o efectivo)";
  } else if (pedido.estado === "pagando" && !pedido.tipoEntrega) {
    pendiente = "elegir recogida en local o domicilio";
  } else if (
    pedido.estado === "pagando" &&
    pedido.tipoEntrega === "domicilio" &&
    !pedido.direccion?.trim()
  ) {
    pendiente = "indicar dirección de entrega";
  }

  const estadoCtx: ContextoPedidoCliente["estado"] =
    pedido.estado === "abierto" || pedido.estado === "pagando" ? pedido.estado : "otro";

  return {
    lineasResumen,
    estado: estadoCtx,
    tipoEntrega: pedido.tipoEntrega,
    direccion: pedido.direccion,
    esperandoMetodoPago: pedido.esperandoMetodoPago,
    nota: pedido.nota,
    pendiente,
  };
}

function aplicarCamposEntregaPago(
  pedido: Pedido,
  interpretacion: InterpretacionCliente
): void {
  if (interpretacion.tipo_entrega === "local" || interpretacion.tipo_entrega === "domicilio") {
    pedido.tipoEntrega = interpretacion.tipo_entrega;
  }
  const dir = interpretacion.direccion?.trim();
  if (dir) pedido.direccion = dir;
}

async function avanzarFlujoPago(pedido: Pedido, from: string): Promise<void> {
  if (!pedido.tipoEntrega) {
    pedido.estado = "pagando";
    await guardarPedido(pedido);
    await enviarMensaje(from, MSG_OPCION_ENTREGA);
    return;
  }
  if (pedido.tipoEntrega === "domicilio" && !pedido.direccion?.trim()) {
    pedido.estado = "pagando";
    await guardarPedido(pedido);
    await enviarMensaje(from, MSG_DIRECCION);
    return;
  }
  await solicitarMetodoPago(pedido, from);
}

async function confirmarPagoEfectivo(pedido: Pedido, from: string): Promise<void> {
  pedido.esperandoMetodoPago = false;
  pedido.estado = "pagado";
  pedido.tipoPago = "efectivo";
  await guardarPedido(pedido);
  await registrarPedido(pedido.lineas);
  await enviarMensaje(
    from,
    "Perfecto. Tu pedido está confirmado. Pago en efectivo al recibir. ¡Gracias!"
  );
}

async function ejecutarInterpretacion(
  from: string,
  interpretacion: InterpretacionCliente
): Promise<void> {
  switch (interpretacion.intencion) {
    case "pedir": {
      if (!interpretacion.items?.length) {
        await enviarMensaje(
          from,
          "No he encontrado ese plato en la carta. Pregúntame por la carta y te ayudo a elegir."
        );
        return;
      }
      const pedido = await obtenerOCrearPedido(from);
      let anadido = false;
      for (const itemSolicitado of interpretacion.items) {
        const item = buscarItem(itemSolicitado.nombre);
        if (item) {
          const qty = Math.max(1, itemSolicitado.cantidad || 1);
          const existente = pedido.lineas.find((l) => l.item.id === item.id);
          if (existente) existente.cantidad += qty;
          else pedido.lineas.push({ item, cantidad: qty });
          anadido = true;
        }
      }
      if (!anadido) {
        await enviarMensaje(
          from,
          "No he encontrado ese plato en la carta. Pregúntame por la carta y te ayudo a elegir."
        );
        return;
      }
      await guardarPedido(pedido);
      await enviarMensaje(from, textoResumenPedido(pedido));
      return;
    }
    case "ver_menu":
      await enviarMensaje(from, formatearMenu());
      return;
    case "ver_pedido": {
      const p = await obtenerPedidoActivoPorFrom(from);
      if (!p || p.lineas.length === 0) {
        await enviarMensaje(from, "No tienes ningún pedido abierto todavía.");
      } else {
        await enviarMensaje(from, textoResumenPedido(p));
      }
      return;
    }
    case "cancelar": {
      const p = await obtenerPedidoActivoPorFrom(from);
      if (!p || p.lineas.length === 0) {
        await enviarMensaje(from, "No tienes ningún pedido abierto que cancelar.");
      } else {
        await cerrarPedido(p.numeroPedido);
        await enviarMensaje(from, "Pedido cancelado. Cuando quieras, podemos empezar uno nuevo.");
      }
      return;
    }
    case "anadir_nota": {
      const p = await obtenerPedidoActivoPorFrom(from);
      if (!p || p.lineas.length === 0) {
        await enviarMensaje(from, "Primero añade platos al pedido y luego podemos anotar tu nota.");
        return;
      }
      const notaTxt = interpretacion.nota?.trim();
      if (!notaTxt) {
        await enviarMensaje(
          from,
          "Cuéntame qué nota o personalización quieres en el pedido (sin gluten, sin cebolla, etc.)."
        );
        return;
      }
      p.nota = notaTxt;
      await guardarPedido(p);
      await enviarMensaje(from, "Listo, he guardado tu nota en el pedido.");
      return;
    }
    case "elegir_entrega": {
      const p = await obtenerPedidoActivoPorFrom(from);
      if (!p || p.lineas.length === 0) {
        await enviarMensaje(from, "No tienes ningún pedido abierto todavía.");
        return;
      }
      if (!interpretacion.tipo_entrega) {
        await enviarMensaje(from, MSG_OPCION_ENTREGA);
        return;
      }
      p.tipoEntrega = interpretacion.tipo_entrega;
      p.estado = "pagando";
      await guardarPedido(p);
      if (p.tipoEntrega === "domicilio" && !p.direccion?.trim()) {
        await enviarMensaje(from, MSG_DIRECCION);
      } else {
        await solicitarMetodoPago(p, from);
      }
      return;
    }
    case "indicar_direccion": {
      const p = await obtenerPedidoActivoPorFrom(from);
      if (!p) {
        await enviarMensaje(from, "No tienes ningún pedido en curso.");
        return;
      }
      const dir = interpretacion.direccion?.trim();
      if (!dir) {
        await enviarMensaje(from, MSG_DIRECCION);
        return;
      }
      p.direccion = dir;
      if (!p.tipoEntrega) p.tipoEntrega = "domicilio";
      p.estado = "pagando";
      await guardarPedido(p);
      if (p.esperandoMetodoPago) {
        await enviarMensaje(from, MSG_METODO_PAGO);
      } else {
        await solicitarMetodoPago(p, from);
      }
      return;
    }
    case "elegir_pago": {
      const p = await obtenerPedidoActivoPorFrom(from);
      if (!p || p.lineas.length === 0) {
        await enviarMensaje(from, "No tienes ningún pedido para confirmar.");
        return;
      }
      const metodo = interpretacion.metodo_pago;
      if (metodo === "tarjeta") {
        if (!p.esperandoMetodoPago) {
          aplicarCamposEntregaPago(p, interpretacion);
          const listo =
            p.tipoEntrega === "local" ||
            (p.tipoEntrega === "domicilio" && Boolean(p.direccion?.trim()));
          if (!listo) {
            await avanzarFlujoPago(p, from);
            return;
          }
          p.esperandoMetodoPago = true;
          await guardarPedido(p);
        }
        p.esperandoMetodoPago = false;
        await guardarPedido(p);
        await generarYEnviarLinkPago(p, from);
        return;
      }
      if (metodo === "efectivo") {
        if (!p.esperandoMetodoPago) {
          aplicarCamposEntregaPago(p, interpretacion);
          const listo =
            p.tipoEntrega === "local" ||
            (p.tipoEntrega === "domicilio" && Boolean(p.direccion?.trim()));
          if (!listo) {
            await avanzarFlujoPago(p, from);
            return;
          }
          p.esperandoMetodoPago = true;
          await guardarPedido(p);
        }
        await confirmarPagoEfectivo(p, from);
        return;
      }
      await enviarMensaje(from, MSG_METODO_PAGO);
      return;
    }
    case "pagar": {
      const p = await obtenerPedidoActivoPorFrom(from);
      if (!p || p.lineas.length === 0) {
        await enviarMensaje(
          from,
          "No tienes ningún pedido para cerrar. Dime qué te apetece y lo añadimos."
        );
        return;
      }
      aplicarCamposEntregaPago(p, interpretacion);
      if (interpretacion.metodo_pago === "tarjeta") {
        await guardarPedido(p);
        const listo =
          p.tipoEntrega === "local" ||
          (p.tipoEntrega === "domicilio" && Boolean(p.direccion?.trim()));
        if (!listo) {
          await avanzarFlujoPago(p, from);
          return;
        }
        p.esperandoMetodoPago = false;
        await guardarPedido(p);
        await generarYEnviarLinkPago(p, from);
        return;
      }
      if (interpretacion.metodo_pago === "efectivo") {
        await guardarPedido(p);
        const listo =
          p.tipoEntrega === "local" ||
          (p.tipoEntrega === "domicilio" && Boolean(p.direccion?.trim()));
        if (!listo) {
          await avanzarFlujoPago(p, from);
          return;
        }
        await confirmarPagoEfectivo(p, from);
        return;
      }
      if (p.esperandoMetodoPago) {
        const listoParaMetodo =
          p.tipoEntrega === "local" ||
          (p.tipoEntrega === "domicilio" && Boolean(p.direccion?.trim()));
        if (listoParaMetodo) {
          await enviarMensaje(from, MSG_METODO_PAGO);
        } else {
          await enviarMensaje(from, MSG_DIRECCION);
        }
        return;
      }
      await guardarPedido(p);
      await avanzarFlujoPago(p, from);
      return;
    }
    case "pregunta":
    case "otro":
    default:
      await enviarMensaje(from, textoRespuestaParaCliente(interpretacion));
  }
}

export async function procesarMensaje(from: string, texto: string): Promise<void> {
  const keyVisto = `pepe:visto:${from}`;
  const visto = await memoryStore.get(keyVisto);
  if (!visto) {
    await memoryStore.set(keyVisto, "1");
    await enviarMensaje(from, BIENVENIDA_CLIENTE);
    return;
  }

  const pedidoActual = await obtenerPedidoActivoPorFrom(from);
  const contexto = construirContextoPedido(pedidoActual);

  let interpretacion: InterpretacionCliente;
  try {
    interpretacion = await interpretarMensajeCliente(texto, contexto);
  } catch {
    await enviarMensaje(
      from,
      "Lo siento, ha habido un problema. ¿Puedes repetirlo con otras palabras?"
    );
    return;
  }

  await ejecutarInterpretacion(from, interpretacion);
}
