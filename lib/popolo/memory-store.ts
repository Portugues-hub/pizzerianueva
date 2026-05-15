/**
 * Almacén clave-valor compartido entre instancias serverless.
 * - Producción (Vercel): Vercel KV / Upstash si existen KV_REST_API_URL y KV_REST_API_TOKEN.
 * - Local: memoria del proceso (sin KV configurado).
 */

type StringEntry = { value: string; expiresAt?: number };

const strings = new Map<string, StringEntry>();
const lists = new Map<string, string[]>();
const counters = new Map<string, number>();

function kvConfigured(): boolean {
  return Boolean(
    process.env.KV_REST_API_URL?.trim() && process.env.KV_REST_API_TOKEN?.trim()
  );
}

function isExpired(e: StringEntry): boolean {
  return e.expiresAt !== undefined && Date.now() > e.expiresAt;
}

function getStringLocal(key: string): string | null {
  const e = strings.get(key);
  if (!e) return null;
  if (isExpired(e)) {
    strings.delete(key);
    return null;
  }
  return e.value;
}

function valueToString(value: unknown): string {
  if (typeof value === "string") return value;
  if (value === null || value === undefined) return "";
  return JSON.stringify(value);
}

async function getKvClient() {
  const { kv } = await import("@vercel/kv");
  return kv;
}

async function keysKv(pattern: string): Promise<string[]> {
  const kv = await getKvClient();
  if (!pattern.includes("*")) {
    const v = await kv.get(pattern);
    return v != null ? [pattern] : [];
  }
  const star = pattern.lastIndexOf("*");
  if (star !== pattern.length - 1) {
    console.warn("[memoryStore] keys: patrón no soportado, use sufijo *", pattern);
    return [];
  }
  const prefix = pattern.slice(0, -1);
  const found = await kv.keys(`${prefix}*`);
  return found.filter((k) => k.startsWith(prefix));
}

const memoryBackend = {
  async get(key: string): Promise<string | null> {
    return getStringLocal(key);
  },

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

  async keys(pattern: string): Promise<string[]> {
    if (!pattern.includes("*")) {
      return getStringLocal(pattern) !== null ? [pattern] : [];
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
      if (getStringLocal(k) !== null) out.push(k);
    }
    return out;
  },

  async mget(...keys: string[]): Promise<(string | null)[]> {
    if (keys.length === 0) return [];
    return keys.map((k) => getStringLocal(k));
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

const kvBackend = {
  async get(key: string): Promise<string | null> {
    const kv = await getKvClient();
    const raw = await kv.get(key);
    if (raw === null || raw === undefined) return null;
    return valueToString(raw);
  },

  async set(key: string, value: string, ...rest: unknown[]): Promise<void> {
    const kv = await getKvClient();
    if (rest[0] === "EX" && typeof rest[1] === "number" && Number.isFinite(rest[1])) {
      await kv.set(key, value, { ex: rest[1] });
      return;
    }
    await kv.set(key, value);
  },

  async del(...keys: string[]): Promise<number> {
    if (keys.length === 0) return 0;
    const kv = await getKvClient();
    return kv.del(...keys);
  },

  async keys(pattern: string): Promise<string[]> {
    return keysKv(pattern);
  },

  async mget(...keys: string[]): Promise<(string | null)[]> {
    if (keys.length === 0) return [];
    const kv = await getKvClient();
    const values = await Promise.all(keys.map((k) => kv.get(k)));
    return values.map((v) => (v == null ? null : valueToString(v)));
  },

  async incr(key: string): Promise<number> {
    const kv = await getKvClient();
    return kv.incr(key);
  },

  async lpush(key: string, value: string): Promise<number> {
    const kv = await getKvClient();
    return kv.lpush(key, value);
  },
};

function backend() {
  return kvConfigured() ? kvBackend : memoryBackend;
}

/** API mínima estilo clave-valor usada por inventario, pedidos, Stripe y facturas. */
export const memoryStore = {
  async get(key: string): Promise<string | null> {
    return backend().get(key);
  },

  /** `set(k, v)` o `set(k, v, "EX", segundos)` */
  async set(key: string, value: string, ...rest: unknown[]): Promise<void> {
    return backend().set(key, value, ...rest);
  },

  async del(...keys: string[]): Promise<number> {
    return backend().del(...keys);
  },

  /** Solo patrones con un único `*` al final (p. ej. `pepe:pedido:*`). */
  async keys(pattern: string): Promise<string[]> {
    return backend().keys(pattern);
  },

  async mget(...keys: string[]): Promise<(string | null)[]> {
    return backend().mget(...keys);
  },

  async incr(key: string): Promise<number> {
    return backend().incr(key);
  },

  async lpush(key: string, value: string): Promise<number> {
    return backend().lpush(key, value);
  },
};

export function almacenUsaKvRemoto(): boolean {
  return kvConfigured();
}
