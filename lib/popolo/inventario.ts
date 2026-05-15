// Stock de ingredientes en almacén en memoria y descuento automático por pedidos confirmados (El Rincón de Pepe).

import { MENU } from "./menu";
import { memoryStore } from "./memory-store";
import type { LineaPedido } from "./pedidos";

const STORE_STOCK_KEY = "pepe:inventario:stock";
const STORE_RECETAS_KEY = "pepe:recetas";

export interface Ingrediente {
  nombre: string;
  stockGramos: number;
  minimoGramos: number;
  unidad: "g" | "ud" | "lata";
}

export type EstadoStock = "critico" | "bajo" | "ok";

/** Recetas por defecto si el plato no tiene entrada guardada (pepe:recetas). */
const RECETAS_POR_DEFECTO: Record<string, Record<string, number>> = {
  p01: { mozzarella: 150, salsa_tomate: 80, jamon_york: 60 },
  p02: {
    mozzarella: 140,
    salsa_tomate: 80,
    jamon_york: 60,
    champiñon: 50,
    cebolla: 30,
  },
  p03: {
    mozzarella: 140,
    salsa_tomate: 80,
    jamon_serrano: 80,
    cebolla: 30,
    huevo: 1,
  },
  p05: {
    mozzarella: 140,
    salsa_tomate: 80,
    jamon_york: 60,
    champiñon: 50,
  },
  p06: {
    mozzarella: 140,
    salsa_tomate: 80,
    jamon_york: 50,
    salami: 40,
  },
  p07: {
    mozzarella: 140,
    salsa_tomate: 80,
    jamon_york: 50,
    anchoas: 30,
    cebolla: 30,
  },
  p08: {
    mozzarella: 130,
    salsa_tomate: 80,
    jamon_york: 50,
    espinacas: 40,
    gambas: 80,
    cebolla: 30,
  },
  p09: { mozzarella: 130, salsa_tomate: 80, atun: 1, anchoas: 25 },
  p12: {
    mozzarella: 130,
    salsa_tomate: 80,
    atun: 1,
    salmon: 80,
    gambas: 80,
    cebolla: 30,
  },
  p13: {
    mozzarella: 140,
    salsa_tomate: 80,
    espinacas: 40,
    champiñon: 40,
    pimiento: 30,
    cebolla: 30,
  },
  p14: {
    mozzarella: 140,
    salsa_barbacoa: 90,
    carne_hamburguesa: 100,
    cebolla: 40,
  },
  p15: { mozzarella: 140, salsa_tomate: 80, beicon: 60, cebolla: 30 },
  p17: {
    mozzarella: 100,
    salsa_tomate: 80,
    queso_cabra: 40,
    roquefort: 30,
    parmesano: 30,
  },
  p18: {
    mozzarella: 130,
    salsa_tomate: 80,
    beicon: 50,
    jamon_york: 50,
    cebolla: 30,
    huevo: 1,
  },
  p23: {
    mozzarella: 140,
    salsa_tomate: 80,
    jamon_york: 50,
    pepperoni: 50,
  },
  p25: { mozzarella: 140, salsa_tomate: 80, atun: 1, cebolla: 30 },
  p34: { mozzarella: 140, salsa_tomate: 80, jamon_york: 60, piña: 60 },
  p35: {
    mozzarella: 140,
    salsa_nata: 90,
    beicon: 60,
    champiñon: 50,
    cebolla: 30,
  },
  p43: {
    mozzarella: 120,
    salsa_tomate: 80,
    espinacas: 40,
    champiñon: 40,
    queso_cabra: 40,
    miel: 20,
    nueces: 20,
    pasas: 15,
  },
  p45: {
    mozzarella: 130,
    salsa_barbacoa: 90,
    pollo: 90,
    carne_hamburguesa: 80,
    beicon: 60,
    huevo: 1,
    cebolla: 40,
  },
  p46: {
    mozzarella: 130,
    salsa_tomate: 80,
    rucula: 30,
    pollo_empanado: 90,
    beicon: 50,
  },
  p47: { chocolate: 80 },
};

/** Receta genérica por prefijo de id de plato (Il Popolo: pz01, pf02, la01…). */
const RECETA_BASE_POR_PREFIJO: Record<string, Record<string, number>> = {
  pz: { mozzarella: 140, salsa_tomate: 80, jamon_york: 40 },
  pi: { mozzarella: 140, salsa_tomate: 80, jamon_york: 40 },
  pf: { mozzarella: 40, salsa_tomate: 60, jamon_york: 30 },
  pr: { mozzarella: 50, salsa_tomate: 40 },
  la: { mozzarella: 80, salsa_tomate: 70, carne_hamburguesa: 60 },
  en: { mozzarella: 30, salsa_tomate: 20 },
  es: { mozzarella: 30, cebolla: 20, jamon_york: 25 },
  eq: { mozzarella: 25, huevo: 0.5 },
  pa: { mozzarella: 40, salsa_tomate: 30, jamon_york: 35 },
  po: { chocolate: 60 },
};

function prefijoPlatoId(platoId: string): string | undefined {
  const m = platoId.trim().match(/^([a-z]+)\d+$/i);
  return m?.[1]?.toLowerCase();
}

function crearMapaStockPorDefecto(): Map<string, Ingrediente> {
  return new Map<string, Ingrediente>([
    ["mozzarella", { nombre: "Mozzarella", stockGramos: 3000, minimoGramos: 2000, unidad: "g" }],
    ["jamon_york", { nombre: "Jamón york", stockGramos: 1500, minimoGramos: 800, unidad: "g" }],
    ["jamon_serrano", { nombre: "Jamón serrano", stockGramos: 800, minimoGramos: 300, unidad: "g" }],
    ["beicon", { nombre: "Beicon", stockGramos: 500, minimoGramos: 400, unidad: "g" }],
    ["salsa_tomate", { nombre: "Salsa de tomate", stockGramos: 3000, minimoGramos: 1500, unidad: "g" }],
    ["salsa_barbacoa", { nombre: "Salsa barbacoa", stockGramos: 1000, minimoGramos: 400, unidad: "g" }],
    ["salsa_nata", { nombre: "Salsa de nata", stockGramos: 600, minimoGramos: 300, unidad: "g" }],
    ["champiñon", { nombre: "Champiñón", stockGramos: 800, minimoGramos: 400, unidad: "g" }],
    ["cebolla", { nombre: "Cebolla", stockGramos: 1000, minimoGramos: 300, unidad: "g" }],
    ["gambas", { nombre: "Gambas", stockGramos: 350, minimoGramos: 400, unidad: "g" }],
    ["salmon", { nombre: "Salmón", stockGramos: 380, minimoGramos: 300, unidad: "g" }],
    ["atun", { nombre: "Atún", stockGramos: 6, minimoGramos: 3, unidad: "lata" }],
    ["anchoas", { nombre: "Anchoas", stockGramos: 200, minimoGramos: 100, unidad: "g" }],
    ["pepperoni", { nombre: "Pepperoni", stockGramos: 500, minimoGramos: 300, unidad: "g" }],
    ["salami", { nombre: "Salami", stockGramos: 400, minimoGramos: 200, unidad: "g" }],
    ["queso_cabra", { nombre: "Queso de cabra", stockGramos: 400, minimoGramos: 200, unidad: "g" }],
    ["parmesano", { nombre: "Parmesano", stockGramos: 300, minimoGramos: 150, unidad: "g" }],
    ["roquefort", { nombre: "Roquefort", stockGramos: 250, minimoGramos: 100, unidad: "g" }],
    ["espinacas", { nombre: "Espinacas", stockGramos: 500, minimoGramos: 200, unidad: "g" }],
    ["pimiento", { nombre: "Pimiento", stockGramos: 400, minimoGramos: 150, unidad: "g" }],
    ["carne_hamburguesa", { nombre: "Carne hamburguesa", stockGramos: 800, minimoGramos: 400, unidad: "g" }],
    ["pollo", { nombre: "Pollo", stockGramos: 700, minimoGramos: 300, unidad: "g" }],
    ["pollo_empanado", { nombre: "Pollo empanado", stockGramos: 600, minimoGramos: 300, unidad: "g" }],
    ["huevo", { nombre: "Huevo", stockGramos: 18, minimoGramos: 6, unidad: "ud" }],
    ["piña", { nombre: "Piña", stockGramos: 400, minimoGramos: 150, unidad: "g" }],
    ["rucula", { nombre: "Rúcula", stockGramos: 200, minimoGramos: 80, unidad: "g" }],
    ["nueces", { nombre: "Nueces", stockGramos: 200, minimoGramos: 80, unidad: "g" }],
    ["miel", { nombre: "Miel", stockGramos: 300, minimoGramos: 100, unidad: "g" }],
    ["pasas", { nombre: "Pasas", stockGramos: 200, minimoGramos: 80, unidad: "g" }],
    ["chocolate", { nombre: "Chocolate", stockGramos: 400, minimoGramos: 150, unidad: "g" }],
  ]);
}

let stock = crearMapaStockPorDefecto();

async function leerRecetasGuardadas(): Promise<Record<string, Record<string, number>>> {
  try {
    const raw = await memoryStore.get(STORE_RECETAS_KEY);
    if (!raw?.trim()) return {};
    const p = JSON.parse(raw) as unknown;
    if (!p || typeof p !== "object" || Array.isArray(p)) return {};
    const out: Record<string, Record<string, number>> = {};
    for (const [platoId, rec] of Object.entries(p as Record<string, unknown>)) {
      if (!platoId || typeof rec !== "object" || rec === null || Array.isArray(rec)) continue;
      const ingMap: Record<string, number> = {};
      for (const [k, v] of Object.entries(rec as Record<string, unknown>)) {
        if (typeof v === "number" && Number.isFinite(v) && v >= 0) ingMap[k] = v;
      }
      out[platoId] = ingMap;
    }
    return out;
  } catch (err) {
    console.error("[Pepe inventario] Error leyendo recetas desde almacén:", err);
    return {};
  }
}

function recetaEfectiva(
  recetasGuardadas: Record<string, Record<string, number>>,
  platoId: string
): Record<string, number> | undefined {
  if (Object.prototype.hasOwnProperty.call(recetasGuardadas, platoId)) {
    return recetasGuardadas[platoId];
  }
  if (RECETAS_POR_DEFECTO[platoId]) {
    return RECETAS_POR_DEFECTO[platoId];
  }
  const prefijo = prefijoPlatoId(platoId);
  if (prefijo && RECETA_BASE_POR_PREFIJO[prefijo]) {
    return RECETA_BASE_POR_PREFIJO[prefijo];
  }
  return undefined;
}

/** Recetas guardadas en almacén (solo las configuradas desde el panel). */
export async function obtenerTodasLasRecetasGuardadas(): Promise<
  Record<string, Record<string, number>>
> {
  return leerRecetasGuardadas();
}

export async function guardarRecetaPlatoPanel(
  platoId: string,
  ingredientes: Array<{ key: string; cantidad: number }>
): Promise<void> {
  const id = platoId.trim();
  if (!id) throw new Error("platoId vacío");

  let existe = false;
  for (const items of Object.values(MENU.carta)) {
    if (items.some((item) => item.id === id)) {
      existe = true;
      break;
    }
  }
  if (!existe) throw new Error("Plato no encontrado en el menú");

  await cargarStockEnMemoria();
  const map = await leerRecetasGuardadas();
  const rec: Record<string, number> = {};
  for (const row of ingredientes) {
    const k = typeof row.key === "string" ? row.key.trim() : "";
    if (!k) continue;
    if (!stock.has(k)) {
      throw new Error(`Ingrediente no válido: ${k}`);
    }
    const c = row.cantidad;
    if (typeof c !== "number" || !Number.isFinite(c) || c < 0) {
      throw new Error("Cantidad no válida");
    }
    rec[k] = c;
  }
  map[id] = rec;
  await memoryStore.set(STORE_RECETAS_KEY, JSON.stringify(map));
}

async function persistirStockEnAlmacen(): Promise<void> {
  const obj: Record<string, Ingrediente> = {};
  for (const [k, v] of stock.entries()) {
    obj[k] = { ...v };
  }
  await memoryStore.set(STORE_STOCK_KEY, JSON.stringify(obj));
}

/** Carga stock desde el almacén; si no hay datos, usa los valores por defecto del mapa. */
export async function cargarStockEnMemoria(): Promise<void> {
  try {
    const raw = await memoryStore.get(STORE_STOCK_KEY);
    stock = crearMapaStockPorDefecto();
    if (!raw?.trim()) return;

    const parsed = JSON.parse(raw) as Record<string, Partial<Ingrediente>>;
    for (const [k, ing] of stock.entries()) {
      const saved = parsed[k];
      if (saved && typeof saved.stockGramos === "number" && Number.isFinite(saved.stockGramos)) {
        ing.stockGramos = Math.max(0, saved.stockGramos);
        stock.set(k, ing);
      }
    }
  } catch (err) {
    console.error("[Pepe inventario] Error cargando stock desde almacén:", err);
    stock = crearMapaStockPorDefecto();
  }
}

function verificarAlertas(): void {
  const criticos = getIngredientesCriticos();
  if (criticos.length === 0) return;
  const nombres = criticos.map((i) => i.nombre).join(", ");
  console.warn("[Pepe inventario] Ingredientes por debajo del mínimo:", nombres);
}

/** Descuenta ingredientes según recetas de las líneas del pedido y persiste en almacén. */
export async function registrarPedido(lineas: LineaPedido[]): Promise<void> {
  await cargarStockEnMemoria();
  const recetasGuardadas = await leerRecetasGuardadas();
  for (const linea of lineas) {
    const receta = recetaEfectiva(recetasGuardadas, linea.item.id);
    if (!receta || Object.keys(receta).length === 0) {
      console.warn(
        "[Pepe inventario] Sin receta para plato",
        linea.item.id,
        linea.item.nombre
      );
      continue;
    }

    for (const [ingKey, cantidadPorUnidad] of Object.entries(receta)) {
      const consumo = cantidadPorUnidad * linea.cantidad;
      const ing = stock.get(ingKey);
      if (!ing) continue;

      ing.stockGramos = Math.max(0, ing.stockGramos - consumo);
      stock.set(ingKey, ing);
    }
  }

  await persistirStockEnAlmacen();
  verificarAlertas();
}

/** Devuelve stock si un pedido de cocina se elimina antes de prepararse. */
export async function devolverStockPorCancelacion(lineas: LineaPedido[]): Promise<void> {
  await cargarStockEnMemoria();
  const recetasGuardadas = await leerRecetasGuardadas();
  for (const linea of lineas) {
    const receta = recetaEfectiva(recetasGuardadas, linea.item.id);
    if (!receta || Object.keys(receta).length === 0) continue;

    for (const [ingKey, cantidadPorUnidad] of Object.entries(receta)) {
      const reposicion = cantidadPorUnidad * linea.cantidad;
      const ing = stock.get(ingKey);
      if (!ing) continue;

      ing.stockGramos = Math.max(0, ing.stockGramos + reposicion);
      stock.set(ingKey, ing);
    }
  }

  await persistirStockEnAlmacen();
  verificarAlertas();
}

/** Referencia al mapa de stock actual (tras cargar desde el almacén en la petición). */
export function getEstadoStock(): Map<string, Ingrediente> {
  return stock;
}

/** Ingredientes con stock por debajo del mínimo configurado. */
export function getIngredientesCriticos(): Ingrediente[] {
  return Array.from(stock.values()).filter((i) => i.stockGramos < i.minimoGramos);
}

/** Añade stock (reposición); persiste en almacén. */
export async function actualizarStock(ingrediente: string, cantidadGramos: number): Promise<void> {
  await cargarStockEnMemoria();
  const ing = stock.get(ingrediente);
  if (!ing) {
    console.warn(`[Pepe inventario] Ingrediente desconocido, se ignora: ${ingrediente}`);
    return;
  }
  ing.stockGramos += cantidadGramos;
  stock.set(ingrediente, ing);
  await persistirStockEnAlmacen();
  verificarAlertas();
}

export type OperacionStockPanel = "sumar" | "establecer";

/** Actualiza stock desde el panel de cocina (sumar mercancía o fijar valor). */
export async function aplicarCambioStockPanel(
  key: string,
  cantidad: number,
  operacion: OperacionStockPanel
): Promise<void> {
  await cargarStockEnMemoria();
  const ing = stock.get(key);
  if (!ing) {
    throw new Error(`Ingrediente no encontrado: ${key}`);
  }
  if (!Number.isFinite(cantidad)) {
    throw new Error("Cantidad no válida");
  }
  if (operacion === "sumar") {
    ing.stockGramos = Math.max(0, ing.stockGramos + cantidad);
  } else {
    ing.stockGramos = Math.max(0, cantidad);
  }
  stock.set(key, ing);
  await persistirStockEnAlmacen();
  verificarAlertas();
}

export function getEstadoIngrediente(key: string): EstadoStock {
  const ing = stock.get(key);
  if (!ing) return "ok";

  if (ing.stockGramos < ing.minimoGramos) return "critico";
  if (ing.stockGramos < ing.minimoGramos * 1.5) return "bajo";
  return "ok";
}
