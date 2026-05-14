import { NextRequest, NextResponse } from "next/server";
import { memoryStore } from "@/lib/popolo/memory-store";

const FACTURAS_LIST_KEY = "pepe:facturas";

function autorizado(req: NextRequest): boolean {
  const token = req.headers.get("X-Cocina-Token");
  const expected = process.env.PEPE_COCINA_PASSWORD;
  return Boolean(expected && token && token === expected);
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!autorizado(req)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const body = (await req.json()) as unknown;
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }

  const registro = {
    creadoEn: new Date().toISOString(),
    pedido: body,
  };

  await memoryStore.lpush(FACTURAS_LIST_KEY, JSON.stringify(registro));
  return NextResponse.json({ ok: true }, { status: 200 });
}
