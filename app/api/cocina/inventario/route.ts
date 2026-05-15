import { NextRequest, NextResponse } from "next/server";
import {
  aplicarCambioStockPanel,
  cargarStockEnMemoria,
  categoriaDeIngrediente,
  getEstadoIngrediente,
  getEstadoStock,
} from "@/lib/popolo/inventario";

function autorizado(req: NextRequest): boolean {
  const token = req.headers.get("X-Cocina-Token");
  const expected = process.env.PEPE_COCINA_PASSWORD;
  return Boolean(expected && token && token === expected);
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  if (!autorizado(req)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  await cargarStockEnMemoria();

  const ingredientes = Array.from(getEstadoStock().entries())
    .map(([key, ing]) => ({
      key,
      nombre: ing.nombre,
      stock: ing.stockGramos,
      minimo: ing.minimoGramos,
      unidad: ing.unidad,
      estado: getEstadoIngrediente(key),
      categoria: categoriaDeIngrediente(key),
    }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));

  return NextResponse.json({ ingredientes }, { status: 200 });
}

export async function PATCH(req: NextRequest): Promise<NextResponse> {
  if (!autorizado(req)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const body = (await req.json()) as {
    key?: string;
    cantidad?: number;
    operacion?: "sumar" | "establecer";
  };

  if (
    typeof body.key !== "string" ||
    !body.key.trim() ||
    typeof body.cantidad !== "number" ||
    (body.operacion !== "sumar" && body.operacion !== "establecer")
  ) {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }

  try {
    await aplicarCambioStockPanel(body.key.trim(), body.cantidad, body.operacion);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error al actualizar";
    if (msg.includes("no encontrado")) {
      return NextResponse.json({ error: msg }, { status: 404 });
    }
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  return NextResponse.json({ ok: true }, { status: 200 });
}
