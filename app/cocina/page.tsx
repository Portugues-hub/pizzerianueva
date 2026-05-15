"use client";

import { FormEvent, useEffect, useState } from "react";
import { MENU, type Categoria } from "@/lib/popolo/menu";
import { ORDEN_CATEGORIAS_INVENTARIO } from "@/lib/popolo/recetas-il-popolo";

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
  categoria?: string;
}

const SESSION_KEY = "pepe_cocina_session";

const UI = {
  header: "#1a1a1a",
  accent: "#e63946",
  bg: "#f8f8f8",
  border: "#e0e0e0",
  text: "#1a1a1a",
  muted: "#666666",
  nuevo: "#e63946",
  preparacion: "#f77f00",
  listo: "#2d6a4f",
} as const;

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

function claseTab(activo: boolean): string {
  return activo
    ? "border border-[#e63946] bg-[#e63946] px-5 py-2.5 text-sm font-semibold text-white"
    : "border border-[#e0e0e0] bg-white px-5 py-2.5 text-sm font-semibold text-[#1a1a1a] hover:border-[#1a1a1a]";
}

function TarjetaIngrediente({
  ing,
  stockEdiciones,
  onStockChange,
  onSumar,
  onEstablecer,
}: {
  ing: IngredienteInventario;
  stockEdiciones: Record<string, string>;
  onStockChange: (key: string, value: string) => void;
  onSumar: (key: string) => void;
  onEstablecer: (key: string) => void;
}) {
  const ratio = ing.minimo > 0 ? Math.min(100, (ing.stock / (ing.minimo * 2)) * 100) : 0;
  const barra =
    ing.estado === "critico"
      ? "bg-[#e63946]"
      : ing.estado === "bajo"
        ? "bg-[#f77f00]"
        : "bg-[#2d6a4f]";
  const bordeEstado =
    ing.estado === "critico" ? UI.nuevo : ing.estado === "bajo" ? UI.preparacion : UI.listo;
  const estadoLabel =
    ing.estado === "critico" ? "Crítico" : ing.estado === "bajo" ? "Bajo" : "OK";

  return (
    <article
      className="bg-white p-4 md:p-5 border border-[#e0e0e0] border-l-4"
      style={{ borderLeftColor: bordeEstado }}
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-base md:text-lg font-semibold text-[#1a1a1a]">{ing.nombre}</h3>
        <span
          className="text-xs font-semibold uppercase tracking-wide px-2 py-0.5 border"
          style={{ color: bordeEstado, borderColor: bordeEstado }}
        >
          {estadoLabel}
        </span>
      </div>
      <p className="mt-2 font-semibold tabular-nums text-[#1a1a1a]">
        {ing.stock}
        {ing.unidad}
      </p>
      <div className="mt-3 h-1.5 w-full bg-[#eeeeee] overflow-hidden">
        <div className={`h-full ${barra}`} style={{ width: `${ratio}%` }} />
      </div>
      <p className="mt-2 text-sm text-[#666666]">
        Mínimo: {ing.minimo}
        {ing.unidad}
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input
          type="number"
          min={0}
          step="any"
          inputMode="decimal"
          value={stockEdiciones[ing.key] ?? ""}
          onChange={(e) => onStockChange(ing.key, e.target.value)}
          className="w-24 border border-[#e0e0e0] bg-white px-2 py-1.5 text-sm font-medium text-[#1a1a1a]"
          placeholder="Cant."
        />
        <button
          type="button"
          onClick={() => onSumar(ing.key)}
          className="border border-[#2d6a4f] bg-[#2d6a4f] px-3 py-1.5 text-sm font-semibold text-white"
        >
          Sumar
        </button>
        <button
          type="button"
          onClick={() => onEstablecer(ing.key)}
          className="border border-[#1a1a1a] bg-white px-3 py-1.5 text-sm font-semibold text-[#1a1a1a] hover:bg-[#f0f0f0]"
        >
          Establecer
        </button>
      </div>
    </article>
  );
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
      <main
        className="min-h-screen flex items-center justify-center p-6"
        style={{ backgroundColor: UI.bg }}
      >
        <form
          onSubmit={autenticar}
          className="w-full max-w-md border border-[#e0e0e0] bg-white"
        >
          <div className="px-8 py-6 text-white" style={{ backgroundColor: UI.header }}>
            <h1 className="text-2xl font-semibold text-center tracking-tight">
              Il Popolo
            </h1>
            <p className="mt-1 text-center text-sm text-[#cccccc]">Panel de cocina</p>
          </div>
          <div className="p-8 space-y-5">
            <p className="text-center text-[#666666]">Introduce la contraseña para entrar</p>
            <input
              type="password"
              value={inputPass}
              onChange={(e) => setInputPass(e.target.value)}
              className="w-full border border-[#e0e0e0] bg-white px-4 py-3 text-lg text-[#1a1a1a] focus:border-[#e63946] focus:outline-none"
              placeholder="Contraseña"
            />
            <button
              type="submit"
              disabled={cargando}
              className="w-full border border-[#e63946] bg-[#e63946] py-3 text-lg font-semibold text-white disabled:opacity-60"
            >
              {cargando ? "Comprobando..." : "Entrar"}
            </button>
            {error ? (
              <p className="text-center text-sm font-medium text-[#e63946]">{error}</p>
            ) : null}
          </div>
        </form>
      </main>
    );
  }

  return (
    <main className="min-h-screen" style={{ backgroundColor: UI.bg }}>
      <header
        className="border-b border-[#333333] px-4 py-5 md:px-8 md:py-6"
        style={{ backgroundColor: UI.header }}
      >
        <div className="mx-auto flex max-w-[1600px] flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#e63946]">
              Il Popolo
            </p>
            <h1 className="mt-1 text-xl font-semibold text-white md:text-2xl">Panel de cocina</h1>
          </div>
          <div className="flex flex-wrap items-center gap-4 md:gap-6">
            <div className="flex items-center gap-2">
              <span className="inline-block h-2 w-2 bg-[#e63946]" />
              <span className="text-sm font-medium text-[#cccccc]">Conectado</span>
            </div>
            <span className="text-2xl font-semibold tabular-nums text-white md:text-3xl">
              {ahora.toLocaleTimeString("es-ES")}
            </span>
          </div>
        </div>
        {error ? (
          <p className="mx-auto mt-3 max-w-[1600px] text-sm font-medium text-[#ff8a93]">{error}</p>
        ) : null}
      </header>

      <div className="mx-auto max-w-[1600px] p-4 md:p-6">
        <nav className="mb-6 flex flex-wrap gap-2 border-b border-[#e0e0e0] pb-4">
          <button type="button" onClick={() => setTab("pedidos")} className={claseTab(tab === "pedidos")}>
            Pedidos
          </button>
          <button type="button" onClick={() => setTab("inventario")} className={claseTab(tab === "inventario")}>
            Inventario
          </button>
          <button type="button" onClick={() => setTab("recetas")} className={claseTab(tab === "recetas")}>
            Recetas
          </button>
        </nav>

      <section className="grid grid-cols-1 xl:grid-cols-3 gap-4 md:gap-6">

        {tab === "pedidos" ? (
          <>
            <Columna
              titulo="Nuevos"
              bordeCard={UI.nuevo}
              pedidos={nuevos}
              accionLabel="Pasar a preparación"
              onAccion={(numeroPedido) => moverEstado(numeroPedido, "preparacion")}
            />
            <Columna
              titulo="En preparación"
              bordeCard={UI.preparacion}
              pedidos={preparacion}
              accionLabel="Marcar como listo"
              onAccion={(numeroPedido) => moverEstado(numeroPedido, "listo")}
            />
            <Columna
              titulo="Listos"
              bordeCard={UI.listo}
              pedidos={listos}
              accionLabel="Eliminar"
              onAccion={eliminarPedido}
              onCobrarEfectivo={cobrarPedidoEfectivo}
              onPedirEliminarEfectivo={setPedidoPendienteEliminar}
            />
          </>
        ) : tab === "inventario" ? (
          <div className="xl:col-span-3 space-y-8">
            {ORDEN_CATEGORIAS_INVENTARIO.map(({ id, titulo }) => {
              const grupo = ingredientes.filter((ing) => (ing.categoria ?? "otros") === id);
              if (grupo.length === 0) return null;
              return (
                <section key={id}>
                  <h2 className="mb-4 border-b border-[#e0e0e0] pb-2 text-sm font-semibold uppercase tracking-wide text-[#1a1a1a]">
                    {titulo}
                  </h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 md:gap-6">
                    {grupo.map((ing) => (
                      <TarjetaIngrediente
                        key={ing.key}
                        ing={ing}
                        stockEdiciones={stockEdiciones}
                        onStockChange={(key, value) =>
                          setStockEdiciones((prev) => ({ ...prev, [key]: value }))
                        }
                        onSumar={(key) => actualizarStockPanel(key, "sumar")}
                        onEstablecer={(key) => actualizarStockPanel(key, "establecer")}
                      />
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        ) : (
          <div className="xl:col-span-3 flex flex-col lg:flex-row gap-4 md:gap-6 min-h-[50vh]">
            <aside className="lg:w-80 shrink-0 flex max-h-[75vh] flex-col overflow-hidden border border-[#e0e0e0] bg-white">
              <div className="border-b border-[#e0e0e0] p-3 text-sm font-semibold text-[#1a1a1a]">
                Platos del menú
              </div>
              <div className="overflow-y-auto flex-1 p-3 space-y-4">
                {ORDEN_CATEGORIAS_RECETAS.map(({ categoria, etiqueta }) => (
                  <div key={categoria}>
                    <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#666666]">
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
                              className={`flex w-full items-start gap-2 border-l-2 px-2 py-2 text-left text-sm font-medium ${
                                selectedPlatoId === item.id
                                  ? "border-[#e63946] bg-[#fff5f5] text-[#1a1a1a]"
                                  : "border-transparent text-[#1a1a1a] hover:bg-[#f0f0f0]"
                              }`}
                            >
                              <span
                                className={`mt-1.5 h-2 w-2 shrink-0 ${
                                  tiene ? "bg-[#2d6a4f]" : "bg-[#cccccc]"
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
            <div className="flex-1 border border-[#e0e0e0] bg-white p-4 md:p-6">
              {selectedPlatoId ? (
                <>
                  <h2 className="mb-1 text-xl font-semibold text-[#1a1a1a] md:text-2xl">
                    {ORDEN_CATEGORIAS_RECETAS.flatMap(({ categoria }) => MENU.carta[categoria]).find(
                      (i) => i.id === selectedPlatoId
                    )?.nombre ?? selectedPlatoId}
                  </h2>
                  <p className="mb-6 text-sm text-[#666666]">
                    Ingredientes consumidos por una unidad del plato (mismas unidades que en
                    inventario: g, ud o lata).
                  </p>
                  <div className="space-y-3">
                    {filasReceta.map((fila) => (
                      <div
                        key={fila.localId}
                        className="flex flex-wrap items-center gap-2 border border-[#e0e0e0] bg-[#fafafa] p-3"
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
                          className="min-w-[180px] flex-1 border border-[#e0e0e0] bg-white px-3 py-2 text-sm font-medium text-[#1a1a1a]"
                        >
                          <option value="">— Ingrediente —</option>
                          {ORDEN_CATEGORIAS_INVENTARIO.map(({ id, titulo }) => {
                            const grupo = ingredientes.filter(
                              (ing) => (ing.categoria ?? "otros") === id
                            );
                            if (grupo.length === 0) return null;
                            return (
                              <optgroup key={id} label={titulo}>
                                {grupo.map((ing) => (
                                  <option key={ing.key} value={ing.key}>
                                    {ing.nombre}
                                  </option>
                                ))}
                              </optgroup>
                            );
                          })}
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
                          className="w-28 border border-[#e0e0e0] bg-white px-3 py-2 text-sm font-medium text-[#1a1a1a]"
                          placeholder="Cantidad"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            setFilasReceta((prev) => prev.filter((f) => f.localId !== fila.localId))
                          }
                          className="border border-[#e0e0e0] bg-white px-3 py-2 text-sm font-semibold text-[#666666] hover:border-[#e63946] hover:text-[#e63946]"
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
                <p className="text-[#666666]">Selecciona un plato en la lista.</p>
              )}
            </div>
          </div>
        )}
      </section>
      </div>
      {pedidoPendienteEliminar ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#1a1a1a]/60 p-4">
          <div className="w-full max-w-md border border-[#e0e0e0] bg-white p-6">
            <h3 className="text-lg font-semibold text-[#1a1a1a]">¿El pedido ya estaba preparado?</h3>
            <p className="mt-2 text-sm text-[#666666]">
              Pedido #{String(pedidoPendienteEliminar.numeroPedido).padStart(3, "0")}
            </p>
            <div className="mt-5 grid grid-cols-1 gap-2">
              <button
                type="button"
                onClick={() => void eliminarPedidoEfectivo(false)}
                className="border border-[#e63946] bg-[#e63946] py-3 text-sm font-semibold text-white"
              >
                Sí, ya preparado
              </button>
              <button
                type="button"
                onClick={() => void eliminarPedidoEfectivo(true)}
                className="border border-[#f77f00] bg-[#f77f00] py-3 text-sm font-semibold text-white"
              >
                No, sin preparar
              </button>
              <button
                type="button"
                onClick={() => setPedidoPendienteEliminar(null)}
                className="border border-[#e0e0e0] bg-white py-3 text-sm font-semibold text-[#1a1a1a] hover:bg-[#f0f0f0]"
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
  bordeCard,
  pedidos,
  accionLabel,
  onAccion,
  onCobrarEfectivo,
  onPedirEliminarEfectivo,
}: {
  titulo: string;
  bordeCard: string;
  pedidos: PedidoCocina[];
  accionLabel?: string;
  onAccion?: (numeroPedido: number) => void;
  onCobrarEfectivo?: (pedido: PedidoCocina) => void;
  onPedirEliminarEfectivo?: (pedido: PedidoCocina) => void;
}) {
  return (
    <div className="min-h-[200px]">
      <div className="mb-4 flex items-center justify-between border-b border-[#e0e0e0] pb-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-[#1a1a1a]">{titulo}</h2>
        <span className="border border-[#e0e0e0] bg-white px-2.5 py-0.5 text-sm font-semibold tabular-nums text-[#1a1a1a]">
          {pedidos.length}
        </span>
      </div>

      <div className="space-y-3">
        {pedidos.length === 0 ? (
          <div className="border border-dashed border-[#e0e0e0] bg-white p-5 text-sm text-[#666666]">
            Sin pedidos
          </div>
        ) : (
          pedidos.map((p) => (
            <article
              key={p.numeroPedido}
              className="border border-[#e0e0e0] border-l-4 bg-white p-4 md:p-5"
              style={{ borderLeftColor: bordeCard }}
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
                  <p className="text-2xl font-semibold tabular-nums text-[#1a1a1a]">
                    #{String(p.numeroPedido).padStart(3, "0")}
                  </p>
                  {p.tipoEntrega ? (
                    <p className="mt-1 text-sm text-[#666666]">
                      {p.tipoEntrega === "local"
                        ? "Recogida en local"
                        : `Domicilio: ${p.direccion?.trim() || "—"}`}
                    </p>
                  ) : null}
                </div>
                <div className="text-right">
                  <p className="text-sm font-medium text-[#1a1a1a]">{maskTelefono(p.from)}</p>
                  <p className="text-xs text-[#666666]">{formatHora(p.creadoEn)}</p>
                </div>
              </div>
              <ul className="mt-4 space-y-1.5 border-t border-[#eeeeee] pt-3">
                {p.lineas.map((l) => (
                  <li
                    key={`${p.numeroPedido}-${l.item.nombre}`}
                    className="text-base font-medium text-[#1a1a1a]"
                  >
                    {l.cantidad} × {l.item.nombre}
                  </li>
                ))}
              </ul>
              {p.nota?.trim() ? (
                <p className="mt-3 border border-[#e0e0e0] border-l-2 border-l-[#f77f00] bg-[#fafafa] px-3 py-2 text-sm text-[#1a1a1a]">
                  Nota: {p.nota.trim()}
                </p>
              ) : null}
              <p className="mt-4 text-lg font-semibold text-[#1a1a1a]">
                Total: {formatTotal(p.total)}
              </p>
              <p
                className="mt-1 text-xs font-semibold uppercase tracking-wide"
                style={{ color: esEfectivo ? UI.listo : UI.accent }}
              >
                {esEfectivo ? "Pago en efectivo" : "Pagado con tarjeta"}
              </p>
              {usarControlesEfectivo && yaCobrado ? (
                <p className="mt-3 text-sm font-semibold" style={{ color: UI.listo }}>
                  Cobrado
                </p>
              ) : null}
              {usarControlesEfectivo && !yaCobrado ? (
                <div className="mt-4 grid grid-cols-1 gap-2">
                  <button
                    type="button"
                    onClick={() => onCobrarEfectivo?.(p)}
                    className="w-full border py-2.5 text-sm font-semibold text-white"
                    style={{ backgroundColor: UI.listo, borderColor: UI.listo }}
                  >
                    Cobrado en efectivo
                  </button>
                  <button
                    type="button"
                    onClick={() => onPedirEliminarEfectivo?.(p)}
                    className="w-full border border-[#e63946] bg-[#e63946] py-2.5 text-sm font-semibold text-white"
                  >
                    Eliminar pedido
                  </button>
                </div>
              ) : null}
              {!usarControlesEfectivo && accionLabel && onAccion ? (
                <button
                  type="button"
                  onClick={() => onAccion(p.numeroPedido)}
                  className="mt-4 w-full border border-[#1a1a1a] bg-[#1a1a1a] py-3 text-sm font-semibold text-white hover:bg-[#333333]"
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
