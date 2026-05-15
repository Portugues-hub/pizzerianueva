"use client";

import { FormEvent, useEffect, useState } from "react";
import { MENU, type Categoria } from "@/lib/popolo/menu";

type EstadoPedido = "abierto" | "pagando" | "pagado" | "preparacion" | "listo" | "cobrado";
type EstadoInventario = "ok" | "bajo" | "critico";

interface PedidoCocina {
  from: string;
  lineas: Array<{ item: { nombre: string }; cantidad: number }>;
  total: number;
  creadoEn: string;
  estado: EstadoPedido;
  numeroPedido: number;
  tipoEntrega?: "local" | "domicilio";
  direccion?: string;
  nota?: string;
  tipoPago?: string;
  formaPago?: string;
}

interface IngredienteInventario {
  key: string;
  nombre: string;
  stock: number;
  minimo: number;
  unidad: "g" | "ud" | "lata";
  estado: EstadoInventario;
}

const SESSION_KEY = "pepe_cocina_session";

type FilaReceta = { localId: string; key: string; cantidad: number };

const ORDEN_CATEGORIAS_RECETAS: { categoria: Categoria; etiqueta: string }[] = [
  { categoria: "pizzas", etiqueta: "Pizzas" },
  { categoria: "pinsas", etiqueta: "Pinsas" },
  { categoria: "pastas_frescas", etiqueta: "Pastas frescas" },
  { categoria: "pastas_rellenas", etiqueta: "Pastas rellenas" },
  { categoria: "lasagnas", etiqueta: "Lasagnas" },
  { categoria: "entrantes", etiqueta: "Entrantes" },
  { categoria: "ensaladas", etiqueta: "Ensaladas" },
  { categoria: "ensaladillas", etiqueta: "Ensaladillas" },
  { categoria: "pan_arabo", etiqueta: "Pan árabe" },
  { categoria: "postres", etiqueta: "Postres" },
];

function nuevoLocalId(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random()}`;
}

function filasDesdeReceta(r: Record<string, number> | undefined): FilaReceta[] {
  const entries = r && Object.keys(r).length > 0 ? Object.entries(r) : [];
  if (entries.length === 0) return [{ localId: nuevoLocalId(), key: "", cantidad: 0 }];
  return entries.map(([key, cantidad]) => ({
    localId: nuevoLocalId(),
    key,
    cantidad,
  }));
}

function maskTelefono(from: string): string {
  if (from.startsWith("34") && from.length === 11) {
    return `+34 ${from.slice(2, 5)} ${from.slice(5, 8)} ${from.slice(8)}`;
  }
  return `+${from}`;
}

function formatHora(fechaIso: string): string {
  return new Date(fechaIso).toLocaleTimeString("es-ES", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatTotal(n: number): string {
  return `${n.toFixed(2).replace(".", ",")}€`;
}

export default function CocinaPage() {
  const [tab, setTab] = useState<"pedidos" | "inventario" | "recetas">("pedidos");
  const [inputPass, setInputPass] = useState("");
  const [token, setToken] = useState<string | null>(null);
  const [pedidos, setPedidos] = useState<PedidoCocina[]>([]);
  const [ingredientes, setIngredientes] = useState<IngredienteInventario[]>([]);
  const [recetas, setRecetas] = useState<Record<string, Record<string, number>>>({});
  const [selectedPlatoId, setSelectedPlatoId] = useState<string | null>(null);
  const [filasReceta, setFilasReceta] = useState<FilaReceta[]>([]);
  const [guardandoReceta, setGuardandoReceta] = useState(false);
  const [pedidoPendienteEliminar, setPedidoPendienteEliminar] = useState<PedidoCocina | null>(null);
  const [stockEdiciones, setStockEdiciones] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [ahora, setAhora] = useState(new Date());
  const [cargando, setCargando] = useState(false);

  useEffect(() => {
    const session = localStorage.getItem(SESSION_KEY);
    if (session) setToken(session);
  }, []);

  useEffect(() => {
    const id = setInterval(() => setAhora(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const fetchPedidos = async (currentToken: string) => {
    setError(null);
    try {
      const res = await fetch("/api/cocina/pedidos", {
        method: "GET",
        headers: { "X-Cocina-Token": currentToken },
        cache: "no-store",
      });

      if (res.status === 401) {
        localStorage.removeItem(SESSION_KEY);
        setToken(null);
        setPedidos([]);
        setError("Sesión caducada o contraseña incorrecta.");
        return;
      }
      if (!res.ok) {
        setError(`Error cargando pedidos (HTTP ${res.status})`);
        return;
      }

      const data = (await res.json()) as { pedidos?: PedidoCocina[] };
      setPedidos(data.pedidos ?? []);
    } catch {
      setError("No se pudo conectar con el panel de cocina.");
    }
  };

  const fetchInventario = async (currentToken: string) => {
    setError(null);
    try {
      const res = await fetch("/api/cocina/inventario", {
        method: "GET",
        headers: { "X-Cocina-Token": currentToken },
        cache: "no-store",
      });
      if (res.status === 401) {
        localStorage.removeItem(SESSION_KEY);
        setToken(null);
        setIngredientes([]);
        setError("Sesión caducada o contraseña incorrecta.");
        return;
      }
      if (!res.ok) {
        setError(`Error cargando inventario (HTTP ${res.status})`);
        return;
      }
      const data = (await res.json()) as { ingredientes?: IngredienteInventario[] };
      setIngredientes(data.ingredientes ?? []);
    } catch {
      setError("No se pudo conectar con el inventario.");
    }
  };

  const fetchRecetas = async (currentToken: string) => {
    setError(null);
    try {
      const res = await fetch("/api/cocina/recetas", {
        method: "GET",
        headers: { "X-Cocina-Token": currentToken },
        cache: "no-store",
      });
      if (res.status === 401) {
        localStorage.removeItem(SESSION_KEY);
        setToken(null);
        setRecetas({});
        setError("Sesión caducada o contraseña incorrecta.");
        return;
      }
      if (!res.ok) {
        setError(`Error cargando recetas (HTTP ${res.status})`);
        return;
      }
      const data = (await res.json()) as { recetas?: Record<string, Record<string, number>> };
      setRecetas(data.recetas ?? {});
    } catch {
      setError("No se pudo conectar con las recetas.");
    }
  };

  useEffect(() => {
    if (!token) return;
    fetchPedidos(token);
    const id = setInterval(() => fetchPedidos(token), 5000);
    return () => clearInterval(id);
  }, [token]);

  useEffect(() => {
    if (!token || tab !== "inventario") return;
    fetchInventario(token);
    const id = setInterval(() => fetchInventario(token), 30000);
    return () => clearInterval(id);
  }, [token, tab]);

  useEffect(() => {
    if (!token || tab !== "recetas") return;
    fetchRecetas(token);
    fetchInventario(token);
  }, [token, tab]);

  useEffect(() => {
    if (tab !== "recetas") return;
    if (selectedPlatoId) return;
    const first = ORDEN_CATEGORIAS_RECETAS.flatMap(({ categoria }) => MENU.carta[categoria])[0];
    if (first) setSelectedPlatoId(first.id);
  }, [tab, selectedPlatoId]);

  useEffect(() => {
    if (tab !== "recetas" || !selectedPlatoId) return;
    const r = recetas[selectedPlatoId];
    setFilasReceta(filasDesdeReceta(r));
  }, [selectedPlatoId, tab, recetas]);

  const autenticar = async (e: FormEvent) => {
    e.preventDefault();
    if (!inputPass.trim()) return;
    setCargando(true);
    try {
      const res = await fetch("/api/cocina/pedidos", {
        method: "GET",
        headers: { "X-Cocina-Token": inputPass.trim() },
        cache: "no-store",
      });
      if (!res.ok) {
        setError("Contraseña incorrecta.");
        return;
      }
      localStorage.setItem(SESSION_KEY, inputPass.trim());
      setToken(inputPass.trim());
      setInputPass("");
      setError(null);
    } finally {
      setCargando(false);
    }
  };

  const moverEstado = async (numeroPedido: number, estado: "preparacion" | "listo") => {
    if (!token) return;
    const res = await fetch("/api/cocina/pedidos", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Cocina-Token": token,
      },
      body: JSON.stringify({ numeroPedido, estado }),
    });
    if (!res.ok) {
      setError(`No se pudo actualizar el pedido (HTTP ${res.status})`);
      return;
    }
    fetchPedidos(token);
  };

  const actualizarStockPanel = async (key: string, operacion: "sumar" | "establecer") => {
    if (!token) return;
    const raw = (stockEdiciones[key] ?? "").trim();
    const cantidad = Number(raw);
    if (!Number.isFinite(cantidad)) {
      setError("Introduce una cantidad numérica válida.");
      return;
    }
    setError(null);
    try {
      const res = await fetch("/api/cocina/inventario", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "X-Cocina-Token": token,
        },
        body: JSON.stringify({ key, cantidad, operacion }),
      });
      if (res.status === 401) {
        localStorage.removeItem(SESSION_KEY);
        setToken(null);
        setIngredientes([]);
        setStockEdiciones({});
        setError("Sesión caducada o contraseña incorrecta.");
        return;
      }
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? `Error al actualizar inventario (HTTP ${res.status})`);
        return;
      }
      setStockEdiciones((prev) => ({ ...prev, [key]: "" }));
      await fetchInventario(token);
    } catch {
      setError("No se pudo actualizar el inventario.");
    }
  };

  const guardarReceta = async () => {
    if (!token || !selectedPlatoId) return;
    const payload = filasReceta
      .filter((f) => f.key.trim())
      .map((f) => ({ key: f.key.trim(), cantidad: Number(f.cantidad) }));
    for (const p of payload) {
      if (!Number.isFinite(p.cantidad) || p.cantidad < 0) {
        setError("Cada cantidad debe ser un número mayor o igual que 0.");
        return;
      }
    }
    setError(null);
    setGuardandoReceta(true);
    try {
      const res = await fetch("/api/cocina/recetas", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Cocina-Token": token,
        },
        body: JSON.stringify({ platoId: selectedPlatoId, ingredientes: payload }),
      });
      if (res.status === 401) {
        localStorage.removeItem(SESSION_KEY);
        setToken(null);
        setRecetas({});
        setError("Sesión caducada o contraseña incorrecta.");
        return;
      }
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? `Error al guardar receta (HTTP ${res.status})`);
        return;
      }
      await fetchRecetas(token);
    } catch {
      setError("No se pudo guardar la receta.");
    } finally {
      setGuardandoReceta(false);
    }
  };

  const eliminarPedido = async (numeroPedido: number) => {
    if (!token) return;
    const res = await fetch("/api/cocina/pedidos", {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        "X-Cocina-Token": token,
      },
      body: JSON.stringify({ numeroPedido }),
    });
    if (!res.ok) {
      setError(`No se pudo eliminar el pedido (HTTP ${res.status})`);
      return;
    }
    fetchPedidos(token);
  };

  const cobrarPedidoEfectivo = async (pedido: PedidoCocina) => {
    if (!token) return;
    setError(null);
    const resFactura = await fetch("/api/cocina/facturas", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Cocina-Token": token,
      },
      body: JSON.stringify(pedido),
    });
    if (!resFactura.ok) {
      setError(`No se pudo registrar la factura (HTTP ${resFactura.status})`);
      return;
    }

    const resCobro = await fetch("/api/cocina/pedidos", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "X-Cocina-Token": token,
      },
      body: JSON.stringify({ id: pedido.numeroPedido, estado: "cobrado" }),
    });
    if (!resCobro.ok) {
      setError(`No se pudo marcar cobrado (HTTP ${resCobro.status})`);
      return;
    }
    await fetchPedidos(token);
  };

  const eliminarPedidoEfectivo = async (devolverStock: boolean) => {
    if (!token || !pedidoPendienteEliminar) return;
    const query = devolverStock ? "?devolverStock=true" : "";
    const res = await fetch(`/api/cocina/pedidos${query}`, {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        "X-Cocina-Token": token,
      },
      body: JSON.stringify({ id: pedidoPendienteEliminar.numeroPedido }),
    });
    if (!res.ok) {
      setError(`No se pudo eliminar el pedido (HTTP ${res.status})`);
      return;
    }
    setPedidoPendienteEliminar(null);
    await fetchPedidos(token);
  };

  const nuevos = pedidos.filter((p) => p.estado === "pagado");
  const preparacion = pedidos.filter((p) => p.estado === "preparacion");
  const listos = pedidos.filter((p) => p.estado === "listo" || p.estado === "cobrado");

  if (!token) {
    return (
      <main className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-6">
        <form
          onSubmit={autenticar}
          className="w-full max-w-md rounded-2xl bg-slate-900 border border-slate-700 p-8 space-y-6"
        >
          <h1 className="text-3xl font-bold text-center">Il Popolo — Panel de Cocina</h1>
          <p className="text-slate-300 text-center text-lg">Introduce la contraseña para entrar</p>
          <input
            type="password"
            value={inputPass}
            onChange={(e) => setInputPass(e.target.value)}
            className="w-full rounded-xl bg-slate-800 border border-slate-600 px-4 py-4 text-xl"
            placeholder="Contraseña"
          />
          <button
            type="submit"
            disabled={cargando}
            className="w-full rounded-xl bg-red-600 hover:bg-red-500 disabled:opacity-60 py-4 text-2xl font-bold"
          >
            {cargando ? "Comprobando..." : "Entrar"}
          </button>
          {error ? <p className="text-red-300 text-center">{error}</p> : null}
        </form>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-100 p-4 md:p-6">
      <header className="mb-6 rounded-2xl bg-white p-4 md:p-6 shadow-sm border border-slate-200">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <h1 className="text-2xl md:text-4xl font-extrabold text-slate-900">
            Il Popolo Pasta & Pizza — Panel de Cocina
          </h1>
          <div className="flex items-center gap-5">
            <div className="flex items-center gap-2">
              <span className="inline-flex h-4 w-4 animate-pulse rounded-full bg-green-500" />
              <span className="text-lg font-semibold text-green-700">Conectado</span>
            </div>
            <span className="text-xl md:text-3xl font-black text-slate-800 tabular-nums">
              {ahora.toLocaleTimeString("es-ES")}
            </span>
          </div>
        </div>
        {error ? <p className="mt-3 text-red-600 font-semibold">{error}</p> : null}
      </header>

      <section className="grid grid-cols-1 xl:grid-cols-3 gap-4 md:gap-6">
        <div className="xl:col-span-3 flex gap-2">
          <button
            type="button"
            onClick={() => setTab("pedidos")}
            className={`rounded-xl px-4 py-2 font-semibold border ${
              tab === "pedidos"
                ? "bg-slate-900 text-white border-slate-900"
                : "bg-white text-slate-700 border-slate-300"
            }`}
          >
            Pedidos
          </button>
          <button
            type="button"
            onClick={() => setTab("inventario")}
            className={`rounded-xl px-4 py-2 font-semibold border ${
              tab === "inventario"
                ? "bg-slate-900 text-white border-slate-900"
                : "bg-white text-slate-700 border-slate-300"
            }`}
          >
            Inventario
          </button>
          <button
            type="button"
            onClick={() => setTab("recetas")}
            className={`rounded-xl px-4 py-2 font-semibold border ${
              tab === "recetas"
                ? "bg-slate-900 text-white border-slate-900"
                : "bg-white text-slate-700 border-slate-300"
            }`}
          >
            Recetas
          </button>
        </div>

        {tab === "pedidos" ? (
          <>
            <Columna
              titulo="🆕 Nuevos"
              color="bg-red-100 border-red-300"
              pedidos={nuevos}
              accionLabel="Pasar a preparación"
              onAccion={(numeroPedido) => moverEstado(numeroPedido, "preparacion")}
            />
            <Columna
              titulo="👨‍🍳 En preparación"
              color="bg-orange-100 border-orange-300"
              pedidos={preparacion}
              accionLabel="Marcar como listo"
              onAccion={(numeroPedido) => moverEstado(numeroPedido, "listo")}
            />
            <Columna
              titulo="✅ Listos"
              color="bg-green-100 border-green-300"
              pedidos={listos}
              accionLabel="Eliminar"
              onAccion={eliminarPedido}
              onCobrarEfectivo={cobrarPedidoEfectivo}
              onPedirEliminarEfectivo={setPedidoPendienteEliminar}
            />
          </>
        ) : tab === "inventario" ? (
          <div className="xl:col-span-3 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 md:gap-6">
            {ingredientes.map((ing) => {
              const ratio = ing.minimo > 0 ? Math.min(100, (ing.stock / (ing.minimo * 2)) * 100) : 0;
              const barra =
                ing.estado === "critico"
                  ? "bg-red-500"
                  : ing.estado === "bajo"
                    ? "bg-orange-500"
                    : "bg-green-500";
              const emoji =
                ing.estado === "critico" ? "🔴" : ing.estado === "bajo" ? "⚠️" : "✅";
              return (
                <article
                  key={ing.key}
                  className="rounded-2xl bg-white p-4 md:p-5 border border-slate-200 shadow-sm"
                >
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-lg md:text-xl font-bold text-slate-900">{ing.nombre}</h3>
                    <span className="text-xl">{emoji}</span>
                  </div>
                  <p className="mt-2 text-slate-700 font-semibold">
                    {ing.stock}
                    {ing.unidad}
                  </p>
                  <div className="mt-3 h-3 w-full rounded-full bg-slate-200 overflow-hidden">
                    <div className={`h-full ${barra}`} style={{ width: `${ratio}%` }} />
                  </div>
                  <p className="mt-2 text-sm text-slate-500">Mínimo: {ing.minimo}{ing.unidad}</p>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <input
                      type="number"
                      min={0}
                      step="any"
                      inputMode="decimal"
                      value={stockEdiciones[ing.key] ?? ""}
                      onChange={(e) =>
                        setStockEdiciones((prev) => ({ ...prev, [ing.key]: e.target.value }))
                      }
                      className="w-24 rounded-lg border border-slate-300 px-2 py-1.5 text-sm font-medium text-slate-900"
                      placeholder="Cant."
                    />
                    <button
                      type="button"
                      onClick={() => actualizarStockPanel(ing.key, "sumar")}
                      className="rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1.5 text-sm font-semibold"
                    >
                      Sumar
                    </button>
                    <button
                      type="button"
                      onClick={() => actualizarStockPanel(ing.key, "establecer")}
                      className="rounded-lg bg-slate-700 hover:bg-slate-600 text-white px-3 py-1.5 text-sm font-semibold"
                    >
                      Establecer
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="xl:col-span-3 flex flex-col lg:flex-row gap-4 md:gap-6 min-h-[50vh]">
            <aside className="lg:w-80 shrink-0 rounded-2xl bg-white border border-slate-200 shadow-sm overflow-hidden flex flex-col max-h-[75vh]">
              <div className="p-3 border-b border-slate-200 font-bold text-slate-900">Platos del menú</div>
              <div className="overflow-y-auto flex-1 p-3 space-y-4">
                {ORDEN_CATEGORIAS_RECETAS.map(({ categoria, etiqueta }) => (
                  <div key={categoria}>
                    <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-2">
                      {etiqueta}
                    </h3>
                    <ul className="space-y-1">
                      {MENU.carta[categoria].map((item) => {
                        const tiene = Boolean(
                          recetas[item.id] && Object.keys(recetas[item.id]).length > 0
                        );
                        return (
                          <li key={item.id}>
                            <button
                              type="button"
                              onClick={() => setSelectedPlatoId(item.id)}
                              className={`w-full text-left rounded-lg px-2 py-2 text-sm font-medium flex items-start gap-2 transition-colors ${
                                selectedPlatoId === item.id
                                  ? "bg-slate-900 text-white"
                                  : "hover:bg-slate-100 text-slate-800"
                              }`}
                            >
                              <span
                                className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                                  tiene ? "bg-green-500" : "bg-slate-300"
                                }`}
                                title={tiene ? "Receta guardada" : "Sin receta en panel"}
                              />
                              <span className="leading-snug">{item.nombre}</span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))}
              </div>
            </aside>
            <div className="flex-1 rounded-2xl bg-white border border-slate-200 shadow-sm p-4 md:p-6">
              {selectedPlatoId ? (
                <>
                  <h2 className="text-xl md:text-2xl font-extrabold text-slate-900 mb-1">
                    {ORDEN_CATEGORIAS_RECETAS.flatMap(({ categoria }) => MENU.carta[categoria]).find(
                      (i) => i.id === selectedPlatoId
                    )?.nombre ?? selectedPlatoId}
                  </h2>
                  <p className="text-sm text-slate-500 mb-6">
                    Ingredientes consumidos por una unidad del plato (mismas unidades que en
                    inventario: g, ud o lata).
                  </p>
                  <div className="space-y-3">
                    {filasReceta.map((fila) => (
                      <div
                        key={fila.localId}
                        className="flex flex-wrap items-center gap-2 p-3 rounded-xl bg-slate-50 border border-slate-200"
                      >
                        <select
                          value={fila.key}
                          onChange={(e) =>
                            setFilasReceta((prev) =>
                              prev.map((f) =>
                                f.localId === fila.localId ? { ...f, key: e.target.value } : f
                              )
                            )
                          }
                          className="flex-1 min-w-[180px] rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-900"
                        >
                          <option value="">— Ingrediente —</option>
                          {ingredientes.map((ing) => (
                            <option key={ing.key} value={ing.key}>
                              {ing.nombre} ({ing.key})
                            </option>
                          ))}
                        </select>
                        <input
                          type="number"
                          min={0}
                          step="any"
                          inputMode="decimal"
                          value={fila.cantidad === 0 ? "" : fila.cantidad}
                          onChange={(e) => {
                            const v = e.target.value;
                            setFilasReceta((prev) =>
                              prev.map((f) =>
                                f.localId === fila.localId
                                  ? { ...f, cantidad: v === "" ? 0 : Number(v) }
                                  : f
                              )
                            );
                          }}
                          className="w-28 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-900"
                          placeholder="Cantidad"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            setFilasReceta((prev) => prev.filter((f) => f.localId !== fila.localId))
                          }
                          className="rounded-lg border border-slate-300 bg-white hover:bg-red-50 text-slate-600 hover:text-red-700 px-3 py-2 text-sm font-bold"
                          title="Quitar fila"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                  <div className="mt-4 flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={() =>
                        setFilasReceta((prev) => [
                          ...prev,
                          { localId: nuevoLocalId(), key: "", cantidad: 0 },
                        ])
                      }
                      className="rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-900 px-4 py-2 font-semibold"
                    >
                      Añadir ingrediente
                    </button>
                    <button
                      type="button"
                      disabled={guardandoReceta}
                      onClick={() => void guardarReceta()}
                      className="rounded-xl bg-red-600 hover:bg-red-500 disabled:opacity-60 text-white px-4 py-2 font-bold"
                    >
                      {guardandoReceta ? "Guardando…" : "Guardar receta"}
                    </button>
                  </div>
                </>
              ) : (
                <p className="text-slate-600">Selecciona un plato en la lista.</p>
              )}
            </div>
          </div>
        )}
      </section>
      {pedidoPendienteEliminar ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl border border-slate-200">
            <h3 className="text-xl font-extrabold text-slate-900">¿El pedido ya estaba preparado?</h3>
            <p className="mt-2 text-slate-600">
              Pedido #{String(pedidoPendienteEliminar.numeroPedido).padStart(3, "0")}
            </p>
            <div className="mt-5 grid grid-cols-1 gap-3">
              <button
                type="button"
                onClick={() => void eliminarPedidoEfectivo(false)}
                className="rounded-xl bg-red-600 hover:bg-red-500 text-white py-3 font-bold"
              >
                Sí, ya preparado
              </button>
              <button
                type="button"
                onClick={() => void eliminarPedidoEfectivo(true)}
                className="rounded-xl bg-amber-500 hover:bg-amber-400 text-white py-3 font-bold"
              >
                No, sin preparar
              </button>
              <button
                type="button"
                onClick={() => setPedidoPendienteEliminar(null)}
                className="rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 py-3 font-semibold"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}

function Columna({
  titulo,
  color,
  pedidos,
  accionLabel,
  onAccion,
  onCobrarEfectivo,
  onPedirEliminarEfectivo,
}: {
  titulo: string;
  color: string;
  pedidos: PedidoCocina[];
  accionLabel?: string;
  onAccion?: (numeroPedido: number) => void;
  onCobrarEfectivo?: (pedido: PedidoCocina) => void;
  onPedirEliminarEfectivo?: (pedido: PedidoCocina) => void;
}) {
  return (
    <div className={`rounded-2xl border p-4 md:p-5 ${color}`}>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-2xl md:text-3xl font-extrabold text-slate-900">{titulo}</h2>
        <span className="rounded-full bg-white/80 px-3 py-1 text-lg font-bold">{pedidos.length}</span>
      </div>

      <div className="space-y-4">
        {pedidos.length === 0 ? (
          <div className="rounded-xl bg-white/75 p-5 text-lg font-semibold text-slate-600">
            Sin pedidos
          </div>
        ) : (
          pedidos.map((p) => (
            <article
              key={p.numeroPedido}
              className="rounded-xl bg-white p-4 md:p-5 border border-slate-200 shadow-sm"
            >
              {(() => {
                const formaPago = p.formaPago ?? p.tipoPago;
                const esEfectivo = formaPago === "efectivo";
                const yaCobrado = p.estado === "cobrado";
                const usarControlesEfectivo =
                  esEfectivo && Boolean(onCobrarEfectivo && onPedirEliminarEfectivo);
                return (
                  <>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-2xl font-black text-slate-900">
                    #{String(p.numeroPedido).padStart(3, "0")}
                  </p>
                  {p.tipoEntrega ? (
                    <div className="mt-2 text-base font-semibold text-slate-700">
                      {p.tipoEntrega === "local" ? (
                        <span>🏪 Recogida en local</span>
                      ) : (
                        <span>🛵 Domicilio: {p.direccion?.trim() || "-"}</span>
                      )}
                    </div>
                  ) : null}
                </div>
                <div className="text-right">
                  <p className="text-lg font-bold text-slate-700">{maskTelefono(p.from)}</p>
                  <p className="text-sm md:text-base text-slate-500">{formatHora(p.creadoEn)}</p>
                </div>
              </div>
              <ul className="mt-4 space-y-2">
                {p.lineas.map((l) => (
                  <li
                    key={`${p.numeroPedido}-${l.item.nombre}`}
                    className="text-lg md:text-xl font-semibold text-slate-800"
                  >
                    {l.cantidad} x {l.item.nombre}
                  </li>
                ))}
              </ul>
              {p.nota?.trim() ? (
                <p className="mt-3 rounded-lg border border-yellow-200 bg-yellow-50 px-3 py-2 text-base font-semibold text-yellow-950">
                  📝 {p.nota.trim()}
                </p>
              ) : null}
              <p className="mt-4 text-2xl font-black text-slate-900">Total: {formatTotal(p.total)}</p>
              <p
                className={`mt-2 text-base font-bold ${
                  esEfectivo ? "text-green-700" : "text-blue-700"
                }`}
              >
                {esEfectivo
                  ? "💵 Pago en efectivo"
                  : "💳 Pagado con tarjeta"}
              </p>
              {usarControlesEfectivo && yaCobrado ? (
                <p className="mt-4 text-lg font-extrabold text-green-700">Cobrado ✓</p>
              ) : null}
              {usarControlesEfectivo && !yaCobrado ? (
                <div className="mt-4 grid grid-cols-1 gap-2">
                  <button
                    onClick={() => onCobrarEfectivo?.(p)}
                    className="w-full rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white py-3 text-base font-bold"
                  >
                    Cobrado en efectivo
                  </button>
                  <button
                    onClick={() => onPedirEliminarEfectivo?.(p)}
                    className="w-full rounded-xl bg-red-600 hover:bg-red-500 text-white py-3 text-base font-bold"
                  >
                    Eliminar pedido
                  </button>
                </div>
              ) : null}
              {!usarControlesEfectivo && accionLabel && onAccion ? (
                <button
                  onClick={() => onAccion(p.numeroPedido)}
                  className="mt-4 w-full rounded-xl bg-slate-900 hover:bg-slate-700 text-white py-4 text-xl font-bold"
                >
                  {accionLabel}
                </button>
              ) : null}
                  </>
                );
              })()}
            </article>
          ))
        )}
      </div>
    </div>
  );
}
