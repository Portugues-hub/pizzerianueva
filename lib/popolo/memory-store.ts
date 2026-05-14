/**
 * Almacén clave-valor en memoria del proceso (sin servicios externos).
 * En serverless no se comparte entre instancias ni sobrevive a cold starts.
 */

type StringEntry = { value: string; expiresAt?: number };

const strings = new Map<string, StringEntry>();
const lists = new Map<string, string[]>();
const counters = new Map<string, number>();

function isExpired(e: StringEntry): boolean {
  return e.expiresAt !== undefined && Date.now() > e.expiresAt;
}

function getString(key: string): string | null {
  const e = strings.get(key);
  if (!e) return null;
  if (isExpired(e)) {
    strings.delete(key);
    return null;
  }
  return e.value;
}

/** API mínima estilo clave-valor usada por inventario, pedidos, Stripe y facturas. */
export const memoryStore = {
  async get(key: string): Promise<string | null> {
    return getString(key);
  },

  /** `set(k, v)` o `set(k, v, "EX", segundos)` */
  async set(key: string, value: string, ...rest: unknown[]): Promise<void> {
    let expiresAt: number | undefined;
    if (rest[0] === "EX" && typeof rest[1] === "number" && Number.isFinite(rest[1])) {
      expiresAt = Date.now() + rest[1] * 1000;
    }
    strings.set(key, { value, expiresAt });
  },

  async del(...keys: string[]): Promise<number> {
    let n = 0;
    for (const key of keys) {
      let removed = false;
      if (strings.delete(key)) removed = true;
      if (lists.delete(key)) removed = true;
      if (counters.delete(key)) removed = true;
      if (removed) n++;
    }
    return n;
  },

  /** Solo patrones con un único `*` al final (p. ej. `pepe:pedido:*`). */
  async keys(pattern: string): Promise<string[]> {
    if (!pattern.includes("*")) {
      return getString(pattern) !== null ? [pattern] : [];
    }
    const star = pattern.lastIndexOf("*");
    if (star !== pattern.length - 1) {
      console.warn("[memoryStore] keys: patrón no soportado, use sufijo *", pattern);
      return [];
    }
    const prefix = pattern.slice(0, -1);
    const out: string[] = [];
    for (const k of strings.keys()) {
      if (!k.startsWith(prefix)) continue;
      if (getString(k) !== null) out.push(k);
    }
    return out;
  },

  async mget(...keys: string[]): Promise<(string | null)[]> {
    if (keys.length === 0) return [];
    return keys.map((k) => getString(k));
  },

  async incr(key: string): Promise<number> {
    const next = (counters.get(key) ?? 0) + 1;
    counters.set(key, next);
    return next;
  },

  async lpush(key: string, value: string): Promise<number> {
    const arr = lists.get(key) ?? [];
    arr.unshift(value);
    lists.set(key, arr);
    return arr.length;
  },
};
