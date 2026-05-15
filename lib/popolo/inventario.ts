// Stock de ingredientes en almacén y descuento automático por pedidos confirmados (Il Popolo).

import { MENU } from "./menu";
import { memoryStore } from "./memory-store";
import type { LineaPedido } from "./pedidos";
import { RECETAS_IL_POPOLO, crearStockIlPopolo } from "./recetas-il-popolo";

/** Carta Il Popolo: recetas por plato (ver `recetas-il-popolo.ts`). */
export {
  RECETAS_IL_POPOLO,
  categoriaDeIngrediente,
  emojiDeIngrediente,
  type CategoriaInventario,
} from "./recetas-il-popolo";

const STORE_STOCK_KEY = "pepe:inventario:stock";
const STORE_RECETAS_KEY = "pepe:recetas";

export interface Ingrediente {
  nombre: string;
  emoji: string;
  stockGramos: number;
  minimoGramos: number;
  unidad: "g" | "ud" | "lata";
}

export type EstadoStock = "critico" | "bajo" | "ok";

/** Recetas por defecto (carta Il Popolo — IDs de menu.ts). */
const RECETAS_POR_DEFECTO: Record<string, Record<string, number>> = RECETAS_IL_POPOLO;

/** Respaldo si falta un id concreto (no debería ocurrir con la carta actual). */
const RECETA_BASE_POR_PREFIJO: Record<string, Record<string, number>> = {
  pz: { masa_pizza: 250, salsa_tomate: 80, mozzarella: 100, oregano: 2 },
  pi: { masa_pinsa: 280, salsa_tomate: 80, mozzarella: 100, oregano: 2 },
  pf: { espagueti: 180, salsa_tomate: 50, parmesano: 15 },
  pr: { pasta_rellena: 200, salsa_tomate: 40, parmesano: 15 },
  la: { laminas_lasana: 120, salsa_bolognesa: 120, bechamel: 80, mozzarella: 60 },
  en: { aceite_oliva: 10, harina: 15 },
  es: { lechuga: 80, tomate: 40, aceite_oliva: 10 },
  eq: { patata_cocida: 100, mayonesa: 35 },
  pa: { pan_arabe: 180, lechuga: 25, tomate: 35 },
  po: { chocolate: 50, nata: 20 },
};

function prefijoPlatoId(platoId: string): string | undefined {
  const m = platoId.trim().match(/^([a-z]+)\d+$/i);
  return m?.[1]?.toLowerCase();
}

function crearMapaStockPorDefecto(): Map<string, Ingrediente> {
  return crearStockIlPopolo() as Map<string, Ingrediente>;
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
