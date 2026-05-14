import { NextRequest, NextResponse } from "next/server";
import {
  cerrarPedido,
  getPedidoPorNumero,
  getPedidosActivos,
  persistirPedidoDesdePanel,
} from "@/lib/popolo/pedidos";
import { devolverStockPorCancelacion } from "@/lib/popolo/inventario";

type EstadoCocina = "preparacion" | "listo";
type EstadoCobro = "cobrado";

function autorizado(req: NextRequest): boolean {
  const token = req.headers.get("X-Cocina-Token");
  const expected = process.env.PEPE_COCINA_PASSWORD;
  return Boolean(expected && token && token === expected);
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  if (!autorizado(req)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const pedidos = (await getPedidosActivos()).map((p) => ({
    ...p,
    creadoEn: p.creadoEn.toISOString(),
  }));
  return NextResponse.json({ pedidos }, { status: 200 });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!autorizado(req)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const body = (await req.json()) as { numeroPedido?: number; estado?: EstadoCocina };
  if (
    typeof body.numeroPedido !== "number" ||
    (body.estado !== "preparacion" && body.estado !== "listo")
  ) {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }

  const pedido = await getPedidoPorNumero(body.numeroPedido);
  if (!pedido) {
    return NextResponse.json({ error: "Pedido no encontrado" }, { status: 404 });
  }

  pedido.estado = body.estado;
  await persistirPedidoDesdePanel(pedido);
  return NextResponse.json({ ok: true }, { status: 200 });
}

export async function PATCH(req: NextRequest): Promise<NextResponse> {
  if (!autorizado(req)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const body = (await req.json()) as { id?: number; numeroPedido?: number; estado?: EstadoCobro };
  const numeroPedido = body.id ?? body.numeroPedido;
  if (typeof numeroPedido !== "number" || body.estado !== "cobrado") {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }

  const pedido = await getPedidoPorNumero(numeroPedido);
  if (!pedido) {
    return NextResponse.json({ error: "Pedido no encontrado" }, { status: 404 });
  }

  pedido.estado = "cobrado";
  await persistirPedidoDesdePanel(pedido);
  return NextResponse.json({ ok: true }, { status: 200 });
}

export async function DELETE(req: NextRequest): Promise<NextResponse> {
  if (!autorizado(req)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const body = (await req.json()) as { id?: number; numeroPedido?: number };
  const numeroPedido = body.id ?? body.numeroPedido;
  if (typeof numeroPedido !== "number") {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }

  const pedido = await getPedidoPorNumero(numeroPedido);
  if (!pedido) {
    return NextResponse.json({ error: "Pedido no encontrado" }, { status: 404 });
  }

  const devolverStock = req.nextUrl.searchParams.get("devolverStock") === "true";
  if (devolverStock) {
    await devolverStockPorCancelacion(pedido.lineas);
  }

  await cerrarPedido(numeroPedido);
  return NextResponse.json({ ok: true }, { status: 200 });
}
