// Menú estático tipado de Il Popolo Pasta & Pizza (sin fetch ni llamadas externas).

export type Categoria =
  | "pizzas"
  | "pinsas"
  | "pastas_frescas"
  | "pastas_rellenas"
  | "lasagnas"
  | "entrantes"
  | "ensaladas"
  | "ensaladillas"
  | "pan_arabo"
  | "postres";

export interface ItemMenu {
  id: string;
  nombre: string;
  precio: number;
  descripcion?: string;
  alergenos?: string[];
  media_racion?: number;
}

export interface Menu {
  negocio: {
    nombre: string;
    telefono: string;
    whatsapp: string;
    horario: string;
  };
  carta: Record<Categoria, ItemMenu[]>;
}

export const MENU: Menu = {
  negocio: {
    nombre: "Il Popolo Pasta & Pizza",
    telefono: "966750710",
    whatsapp: "966750710",
    horario:
      "Lun-Mar: Cerrado · Mié: 20:00-24:00 · Jue-Dom: 13:00-16:00 y 20:00-24:00",
  },
  carta: {
    pizzas: [
      { id: "pz01", nombre: "Margarita", precio: 8.10, descripcion: "Tomate y mozzarella", alergenos: ["gluten", "lactosa"] },
      { id: "pz02", nombre: "Prosciutto", precio: 9.00, descripcion: "Tomate, mozzarella y jamón york", alergenos: ["gluten", "lactosa"] },
      { id: "pz03", nombre: "De atún", precio: 9.90, descripcion: "Tomate, mozzarella, atún, cebolla, pimiento rojo y verde y olivas", alergenos: ["gluten", "lactosa", "pescado"] },
      { id: "pz04", nombre: "Especial de bacon", precio: 10.10, descripcion: "Tomate, mozzarella, cebolla pochada, jamón york, bacon y huevo", alergenos: ["gluten", "lactosa", "huevo"] },
      { id: "pz05", nombre: "Calzone Gourmet", precio: 11.10, descripcion: "Rellena de jamón york, mozzarella, huevo, queso de cabra, rúcula, jamón serrano y parmesano", alergenos: ["gluten", "lactosa", "huevo"] },
      { id: "pz06", nombre: "Cuatro estaciones", precio: 9.90, descripcion: "Tomate, mozzarella, champiñón, alcachofas, jamón york, atún, anchoas y olivas", alergenos: ["gluten", "lactosa", "pescado"] },
      { id: "pz07", nombre: "Capricciosa", precio: 9.90, descripcion: "Tomate, mozzarella, jamón york, champiñón y cebolla", alergenos: ["gluten", "lactosa"] },
      { id: "pz08", nombre: "Napolitana", precio: 9.70, descripcion: "Tomate, mozzarella, salami, anchoas y olivas", alergenos: ["gluten", "lactosa", "pescado"] },
      { id: "pz09", nombre: "Cuatro quesos", precio: 9.70, descripcion: "Tomate, mozzarella, queso de cabra, gorgonzola y parmesano", alergenos: ["gluten", "lactosa"] },
      { id: "pz10", nombre: "Polpetone", precio: 10.00, descripcion: "Tomate, mozzarella, atún, cebolla pochada, champiñón y olivas", alergenos: ["gluten", "lactosa", "pescado"] },
      { id: "pz11", nombre: "Romana", precio: 10.20, descripcion: "Tomate, mozzarella, jamón york, champiñón, salami y guindilla", alergenos: ["gluten", "lactosa"] },
      { id: "pz12", nombre: "Vegan BBQ", precio: 11.50, descripcion: "Tomate, mozzarella vegana, falso pollo, salsa barbacoa y cebolla", alergenos: ["gluten", "soja"] },
    ],
    pinsas: [
      { id: "pi01", nombre: "Parmigiana", precio: 11.70, descripcion: "Tomate, mozzarella, berenjena, queso parmesano y albahaca", alergenos: ["gluten", "lactosa"] },
      { id: "pi02", nombre: "Gorgonzola y pera", precio: 11.80, descripcion: "Tomate, mozzarella, jamón serrano, queso gorgonzola y pera", alergenos: ["gluten", "lactosa"] },
      { id: "pi03", nombre: "Diavola", precio: 11.90, descripcion: "Tomate, mozzarella, pepperoni, pollo, champiñón y guindilla", alergenos: ["gluten", "lactosa"] },
      { id: "pi04", nombre: "De salmón", precio: 12.90, descripcion: "Tomate, mozzarella, salmón ahumado y huevas", alergenos: ["gluten", "lactosa", "pescado"] },
      { id: "pi05", nombre: "De verdura y burrata", precio: 12.90, descripcion: "Tomate, mozzarella, tomate cherry, berenjena, pimiento asado, rúcula y burrata", alergenos: ["gluten", "lactosa"] },
    ],
    pastas_frescas: [
      { id: "pf01", nombre: "Rigatoni Bolognesa", precio: 9.60, alergenos: ["gluten", "lactosa", "huevo"] },
      { id: "pf02", nombre: "Espagueti Carbonara", precio: 9.40, alergenos: ["gluten", "lactosa", "huevo"] },
      { id: "pf03", nombre: "Espagueti carbonara clásica con guanciale", precio: 11.20, descripcion: "Con guanciale, parmesano, pimienta y yema de huevo", alergenos: ["gluten", "lactosa", "huevo"] },
      { id: "pf04", nombre: "Papardelle con secreto y champiñones", precio: 11.20, descripcion: "Con secreto, salsa de nueces y champiñones", alergenos: ["gluten", "lactosa", "huevo", "frutos secos"] },
      { id: "pf05", nombre: "Papardelle con gambas y mejillones", precio: 11.20, descripcion: "Con gambas, mejillones, tomate, ajo, guindilla y albahaca", alergenos: ["gluten", "lactosa", "huevo", "marisco"] },
    ],
    pastas_rellenas: [
      { id: "pr01", nombre: "Ravioli de carne", precio: 10.10, descripcion: "Con salsa de trufa y champiñón", alergenos: ["lactosa"] },
      { id: "pr02", nombre: "Ravioli de requesón y espinaca", precio: 10.00, descripcion: "Con crema de gorgonzola y nueces", alergenos: ["lactosa", "frutos secos"] },
      { id: "pr03", nombre: "Ravioli de salmón", precio: 10.50, descripcion: "Con salsa de gambas, tomate cherry, cebolla y rúcula", alergenos: ["lactosa", "pescado", "marisco"] },
      { id: "pr04", nombre: "Pansotti de ricotta y nueces", precio: 10.00, descripcion: "Con pasta integral, pesto de almendras, tomate seco y parmesano", alergenos: ["lactosa", "frutos secos"] },
      { id: "pr05", nombre: "Medallón de provolone y cebolla caramelizada", precio: 10.50, descripcion: "Con salsa de foie y aceite de trufa", alergenos: ["lactosa"] },
      { id: "pr06", nombre: "Ravioli gigante de rabo de toro", precio: 10.70, descripcion: "Con salsa de carne y champiñón", alergenos: ["gluten", "lactosa"] },
    ],
    lasagnas: [
      { id: "la01", nombre: "Lasagna de carne", precio: 10.30, descripcion: "Lasaña de carne a la boloñesa", alergenos: ["gluten", "lactosa"] },
      { id: "la02", nombre: "Lasagna de verdura", precio: 10.30, descripcion: "Lasaña de verduras, especial para vegetarianos", alergenos: ["gluten", "lactosa"] },
    ],
    entrantes: [
      { id: "en01", nombre: "Pan de ajo", precio: 5.50, alergenos: ["gluten", "lactosa"] },
      { id: "en02", nombre: "Chips de berenjena con miel de caña", precio: 5.50, alergenos: ["gluten", "lactosa"] },
      { id: "en03", nombre: "Patatas gratinadas con jamón serrano y mozzarella", precio: 8.20, alergenos: ["lactosa"] },
      { id: "en04", nombre: "Brocheta de provolone y cebolla caramelizada con foie", precio: 7.20, alergenos: ["gluten", "lactosa"] },
      { id: "en05", nombre: "Crêpe de champiñón y gorgonzola", precio: 7.90, descripcion: "Gratinado con nata", alergenos: ["gluten", "lactosa"] },
      { id: "en06", nombre: "Provolone fundido con trufa y verduras", precio: 8.60, alergenos: ["gluten", "lactosa"] },
      { id: "en07", nombre: "Boletus a la carbonara", precio: 11.50, descripcion: "Con guanciale, parmesano, pimienta y yema de huevo", alergenos: ["gluten", "lactosa"] },
      { id: "en08", nombre: "Croquetas de jamón (4 uds)", precio: 6.80, descripcion: "Con mayonesa de pimientos ahumados", alergenos: ["huevo", "lactosa"] },
      { id: "en09", nombre: "Croquetas de boletus (4 uds)", precio: 6.80, descripcion: "Con mayonesa de trufa", alergenos: ["huevo", "lactosa"] },
      { id: "en10", nombre: "Burrata rebozada con cherry y pistachos", precio: 7.70, alergenos: ["huevo", "lactosa", "frutos secos"] },
    ],
    ensaladas: [
      { id: "es01", nombre: "Il Popolo", precio: 9.50, descripcion: "Lechuga, tomate, zanahoria, espárrago, huevo, atún, jamón york, mozzarella y salsa rosa", alergenos: ["huevo", "lactosa", "pescado"] },
      { id: "es02", nombre: "César", precio: 9.50, descripcion: "Pechuga de pollo crujiente, parmesano, lechuga, tomate cherry y salsa césar", alergenos: ["gluten", "huevo", "lactosa"] },
      { id: "es03", nombre: "Tre Sorelle", precio: 9.80, descripcion: "Mezcla de lechugas, tomate cherry, queso de cabra, vinagreta de mango y frutos secos", alergenos: ["lactosa", "frutos secos"] },
      { id: "es04", nombre: "Burrata Al Tartufo", precio: 10.30, descripcion: "Brotes, tomate cherry, burrata, pera, jamón serrano y tartufata", alergenos: ["gluten", "lactosa"] },
    ],
    ensaladillas: [
      { id: "eq01", nombre: "Ensaladilla rusa", precio: 1.70, alergenos: ["huevo", "mostaza"] },
      { id: "eq02", nombre: "Ensaladilla de bocas de mar", precio: 1.70, alergenos: ["gluten", "marisco", "huevo", "mostaza"] },
      { id: "eq03", nombre: "Ensaladilla de marisco", precio: 2.10, alergenos: ["gluten", "marisco", "huevo", "mostaza"] },
      { id: "eq04", nombre: "Ensaladilla de cangrejo y gamba", precio: 1.90, alergenos: ["gluten", "marisco", "huevo", "mostaza"] },
      { id: "eq05", nombre: "Ensaladilla de alcachofa", precio: 1.80, alergenos: ["huevo", "mostaza"] },
    ],
    pan_arabo: [
      { id: "pa01", nombre: "Pan arabo de jamón serrano", precio: 16.00, descripcion: "Con mozzarella, jamón serrano, tomate, lechuga y aceite de oliva", media_racion: 8.50, alergenos: ["gluten", "lactosa"] },
      { id: "pa02", nombre: "Pan arabo de pechuga de pollo", precio: 16.00, descripcion: "Con mayonesa, pechuga de pollo, tomate y lechuga", media_racion: 8.50, alergenos: ["gluten", "huevo"] },
      { id: "pa03", nombre: "Pan arabo de lomo", precio: 17.00, descripcion: "Con mayonesa, lomo de cerdo, pimiento rojo y verde, lechuga y tomate", media_racion: 9.00, alergenos: ["gluten", "huevo"] },
      { id: "pa04", nombre: "Pan arabo de lomo y bacon", precio: 17.00, descripcion: "Con mayonesa, lomo de cerdo, bacon, tomate y lechuga", media_racion: 9.00, alergenos: ["gluten", "huevo"] },
      { id: "pa05", nombre: "Pan arabo vegetal", precio: 16.00, descripcion: "Con mayonesa, atún, huevo, cebolla, tomate y lechuga", media_racion: 8.50, alergenos: ["gluten", "huevo", "pescado"] },
      { id: "pa06", nombre: "Pan arabo de salmón", precio: 19.00, descripcion: "Con salmón ahumado, aguacate, tomate, lechuga y mozzarella", media_racion: 10.00, alergenos: ["gluten", "lactosa", "pescado"] },
    ],
    postres: [
      { id: "po01", nombre: "Tarta de tres chocolates", precio: 4.00, alergenos: ["gluten", "lactosa"] },
      { id: "po02", nombre: "Tarta de queso", precio: 3.70, alergenos: ["gluten", "lactosa"] },
      { id: "po03", nombre: "Tarta de queso al horno", precio: 5.10, alergenos: ["gluten", "lactosa"] },
      { id: "po04", nombre: "Tiramisú", precio: 5.00, alergenos: ["gluten", "lactosa"] },
      { id: "po05", nombre: "Natillas", precio: 2.80, alergenos: ["gluten", "lactosa"] },
      { id: "po06", nombre: "Torta de nocilla con helado", precio: 5.50, alergenos: ["gluten", "lactosa", "frutos secos"] },
    ],
  },
};

const ORDEN_CATEGORIAS: Categoria[] = [
  "pizzas",
  "pinsas",
  "pastas_frescas",
  "pastas_rellenas",
  "lasagnas",
  "entrantes",
  "ensaladas",
  "ensaladillas",
  "pan_arabo",
  "postres",
];

const TITULO_CATEGORIA: Record<Categoria, { emoji: string; titulo: string }> = {
  pizzas: { emoji: "🍕", titulo: "PIZZAS" },
  pinsas: { emoji: "🫓", titulo: "PINSAS" },
  pastas_frescas: { emoji: "🍝", titulo: "PASTAS FRESCAS" },
  pastas_rellenas: { emoji: "🥟", titulo: "PASTAS RELLENAS" },
  lasagnas: { emoji: "🫕", titulo: "LASAGNAS" },
  entrantes: { emoji: "🍽️", titulo: "ENTRANTES" },
  ensaladas: { emoji: "🥗", titulo: "ENSALADAS" },
  ensaladillas: { emoji: "🥄", titulo: "ENSALADILLAS" },
  pan_arabo: { emoji: "🫔", titulo: "PAN DE ARABO" },
  postres: { emoji: "🍰", titulo: "POSTRES" },
};

function precioEur(precio: number): string {
  return `${precio.toFixed(2).replace(".", ",")}€`;
}

export function buscarItem(texto: string): ItemMenu | undefined {
  const q = texto.trim().toLowerCase();
  if (!q) return undefined;
  for (const cat of ORDEN_CATEGORIAS) {
    const items = MENU.carta[cat];
    for (const item of items) {
      if (item.nombre.toLowerCase().includes(q)) return item;
    }
  }
  return undefined;
}

export function formatearMenu(): string {
  const bloques: string[] = [];
  for (const cat of ORDEN_CATEGORIAS) {
    const { emoji, titulo } = TITULO_CATEGORIA[cat];
    const lineas = MENU.carta[cat].map(
      (item) => `• ${item.nombre} — ${precioEur(item.precio)}`
    );
    bloques.push(`${emoji} *${titulo}*\n${lineas.join("\n")}`);
  }
  return bloques.join("\n\n");
}