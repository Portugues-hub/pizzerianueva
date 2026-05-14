import { NextRequest, NextResponse } from "next/server";
import { guardarRecetaPlatoPanel, obtenerTodasLasRecetasGuardadas } from "@/lib/popolo/inventario";

function autorizado(req: NextRequest): boolean {
  const token = req.headers.get("X-Cocina-Token");
  const expected = process.env.PEPE_COCINA_PASSWORD;
  return Boolean(expected && token && token === expected);
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  if (!autorizado(req)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const recetas = await obtenerTodasLasRecetasGuardadas();
  return NextResponse.json({ recetas }, { status: 200 });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!autorizado(req)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const body = (await req.json()) as {
    platoId?: string;
    ingredientes?: Array<{ key?: string; cantidad?: number }>;
  };

  if (typeof body.platoId !== "string" || !body.platoId.trim()) {
    return NextResponse.json({ error: "platoId requerido" }, { status: 400 });
  }
  if (!Array.isArray(body.ingredientes)) {
    return NextResponse.json({ error: "ingredientes debe ser un array" }, { status: 400 });
  }

  const ingredientes: Array<{ key: string; cantidad: number }> = [];
  for (const row of body.ingredientes) {
    if (typeof row.key !== "string" || typeof row.cantidad !== "number") {
      return NextResponse.json({ error: "Cada ingrediente necesita key y cantidad" }, { status: 400 });
    }
    ingredientes.push({ key: row.key, cantidad: row.cantidad });
  }

  try {
    await guardarRecetaPlatoPanel(body.platoId.trim(), ingredientes);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error al guardar";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  return NextResponse.json({ ok: true }, { status: 200 });
}
