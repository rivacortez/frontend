import type {
  AppSettings,
  ChatMessage,
  DiningTable,
  Ingestion,
  Ingredient,
  InventoryMovement,
  Order,
  Recipe,
  Sale,
  ShoppingItem,
} from '#shared/types/domain'

/**
 * Base de datos en memoria del mock BFF. Sobrevive HMR vía globalThis.
 * Cuando exista la API NestJS, los handlers de server/api/** pasan a
 * proxyear y este archivo se elimina sin tocar el cliente.
 */

export interface MockDb {
  ingredients: Ingredient[]
  recipes: Recipe[]
  tables: DiningTable[]
  orders: Order[]
  sales: Sale[]
  movements: InventoryMovement[]
  shoppingList: ShoppingItem[]
  settings: AppSettings
  chatHistory: ChatMessage[]
  ingestions: Ingestion[]
  seq: number
}

const HOUR = 3_600_000
const iso = (msAgo: number): string => new Date(Date.now() - msAgo).toISOString()

function seed(): MockDb {
  const ingredients: Ingredient[] = [
    { id: 'ing-01', name: 'Limón Sutil', category: 'Verduras y frutas', unit: 'kg', unitCost: 9.36, stock: 2.5, minStock: 5, updatedAt: iso(2 * HOUR) },
    { id: 'ing-02', name: 'Pescado Lenguado', category: 'Pescados y mariscos', unit: 'kg', unitCost: 32.0, stock: 8, minStock: 4, updatedAt: iso(5 * HOUR) },
    { id: 'ing-03', name: 'Cebolla Roja', category: 'Verduras y frutas', unit: 'kg', unitCost: 3.2, stock: 12, minStock: 5, updatedAt: iso(20 * HOUR) },
    { id: 'ing-04', name: 'Ají Limo', category: 'Verduras y frutas', unit: 'kg', unitCost: 8.5, stock: 1.8, minStock: 1, updatedAt: iso(20 * HOUR) },
    { id: 'ing-05', name: 'Camote', category: 'Verduras y frutas', unit: 'kg', unitCost: 2.4, stock: 9, minStock: 4, updatedAt: iso(30 * HOUR) },
    { id: 'ing-06', name: 'Choclo Desgranado', category: 'Verduras y frutas', unit: 'kg', unitCost: 6.0, stock: 4, minStock: 2, updatedAt: iso(30 * HOUR) },
    { id: 'ing-07', name: 'Cilantro', category: 'Hierbas', unit: 'kg', unitCost: 12.0, stock: 0.2, minStock: 0.5, updatedAt: iso(3 * HOUR) },
    { id: 'ing-08', name: 'Lomo de Res', category: 'Carnes', unit: 'kg', unitCost: 38.0, stock: 6.5, minStock: 3, updatedAt: iso(8 * HOUR) },
    { id: 'ing-09', name: 'Papa Amarilla', category: 'Verduras y frutas', unit: 'kg', unitCost: 3.8, stock: 15, minStock: 6, updatedAt: iso(30 * HOUR) },
    { id: 'ing-10', name: 'Tomate', category: 'Verduras y frutas', unit: 'kg', unitCost: 4.2, stock: 7, minStock: 3, updatedAt: iso(30 * HOUR) },
    { id: 'ing-11', name: 'Pollo Entero', category: 'Carnes', unit: 'kg', unitCost: 9.8, stock: 14, minStock: 6, updatedAt: iso(10 * HOUR) },
    { id: 'ing-12', name: 'Ají Amarillo', category: 'Verduras y frutas', unit: 'kg', unitCost: 7.0, stock: 3, minStock: 1.5, updatedAt: iso(26 * HOUR) },
    { id: 'ing-13', name: 'Arroz Extra', category: 'Abarrotes', unit: 'kg', unitCost: 4.5, stock: 40, minStock: 15, updatedAt: iso(50 * HOUR) },
    { id: 'ing-14', name: 'Aceite de Oliva', category: 'Abarrotes', unit: 'L', unitCost: 28.0, stock: 2, minStock: 4, updatedAt: iso(4 * HOUR) },
    { id: 'ing-15', name: 'Pisco Quebranta', category: 'Licores', unit: 'botella', unitCost: 42.0, stock: 18, minStock: 6, updatedAt: iso(70 * HOUR) },
    { id: 'ing-16', name: 'Ron Blanco', category: 'Licores', unit: 'botella', unitCost: 35.0, stock: 12, minStock: 4, updatedAt: iso(70 * HOUR) },
    { id: 'ing-17', name: 'Maracuyá', category: 'Verduras y frutas', unit: 'kg', unitCost: 6.5, stock: 5, minStock: 2, updatedAt: iso(28 * HOUR) },
    { id: 'ing-18', name: 'Leche Evaporada', category: 'Lácteos', unit: 'lata', unitCost: 4.1, stock: 24, minStock: 10, updatedAt: iso(48 * HOUR) },
    { id: 'ing-19', name: 'Queso Fresco', category: 'Lácteos', unit: 'kg', unitCost: 18.0, stock: 3.5, minStock: 1.5, updatedAt: iso(48 * HOUR) },
    { id: 'ing-20', name: 'Mariscos Mixtos', category: 'Pescados y mariscos', unit: 'kg', unitCost: 26.0, stock: 5, minStock: 3, updatedAt: iso(6 * HOUR) },
  ]

  const recipes: Recipe[] = [
    {
      id: 'rec-ceviche-clasico', name: 'Ceviche Clásico', category: 'Marinos', kind: 'dish', emoji: '🐟',
      description: 'Lenguado fresco marinado en leche de tigre, con camote y choclo.',
      sellPrice: 38, cost: 31.2, marginPct: 18, active: true, soldToday: 22, prepMinutes: 15,
      items: [
        { ingredientId: 'ing-02', name: 'Pescado Lenguado', qty: 0.25, unit: 'kg', cost: 8.0, wastePct: 12 },
        { ingredientId: 'ing-01', name: 'Limón Sutil', qty: 0.18, unit: 'kg', cost: 1.69, wastePct: 8 },
        { ingredientId: 'ing-03', name: 'Cebolla Roja', qty: 0.08, unit: 'kg', cost: 0.26, wastePct: 10 },
        { ingredientId: 'ing-04', name: 'Ají Limo', qty: 0.01, unit: 'kg', cost: 0.09, wastePct: 5 },
        { ingredientId: 'ing-05', name: 'Camote', qty: 0.15, unit: 'kg', cost: 0.36, wastePct: 15 },
        { ingredientId: 'ing-06', name: 'Choclo Desgranado', qty: 0.1, unit: 'kg', cost: 0.6, wastePct: 5 },
        { ingredientId: 'ing-07', name: 'Cilantro', qty: 0.01, unit: 'kg', cost: 0.12, wastePct: 5 },
      ],
    },
    {
      id: 'rec-lomo-saltado', name: 'Lomo Saltado', category: 'Criollos', kind: 'dish', emoji: '🥩',
      description: 'Lomo flameado al wok con cebolla, tomate y papas fritas.',
      sellPrice: 36, cost: 14.8, marginPct: 59, active: true, soldToday: 18, prepMinutes: 20,
      items: [
        { ingredientId: 'ing-08', name: 'Lomo de Res', qty: 0.22, unit: 'kg', cost: 8.36, wastePct: 8 },
        { ingredientId: 'ing-03', name: 'Cebolla Roja', qty: 0.1, unit: 'kg', cost: 0.32, wastePct: 10 },
        { ingredientId: 'ing-10', name: 'Tomate', qty: 0.1, unit: 'kg', cost: 0.42, wastePct: 8 },
        { ingredientId: 'ing-09', name: 'Papa Amarilla', qty: 0.25, unit: 'kg', cost: 0.95, wastePct: 18 },
        { ingredientId: 'ing-13', name: 'Arroz Extra', qty: 0.15, unit: 'kg', cost: 0.68, wastePct: 3 },
      ],
    },
    {
      id: 'rec-aji-gallina', name: 'Ají de Gallina', category: 'Criollos', kind: 'dish', emoji: '🍛',
      description: 'Crema de ají amarillo con pollo deshilachado y papa amarilla.',
      sellPrice: 28, cost: 9.5, marginPct: 66, active: true, soldToday: 11, prepMinutes: 25,
      items: [
        { ingredientId: 'ing-11', name: 'Pollo Entero', qty: 0.3, unit: 'kg', cost: 2.94, wastePct: 20 },
        { ingredientId: 'ing-12', name: 'Ají Amarillo', qty: 0.08, unit: 'kg', cost: 0.56, wastePct: 10 },
        { ingredientId: 'ing-09', name: 'Papa Amarilla', qty: 0.2, unit: 'kg', cost: 0.76, wastePct: 15 },
        { ingredientId: 'ing-18', name: 'Leche Evaporada', qty: 0.5, unit: 'lata', cost: 2.05, wastePct: 0 },
        { ingredientId: 'ing-13', name: 'Arroz Extra', qty: 0.15, unit: 'kg', cost: 0.68, wastePct: 3 },
      ],
    },
    {
      id: 'rec-arroz-mariscos', name: 'Arroz con Mariscos', category: 'Marinos', kind: 'dish', emoji: '🍤',
      description: 'Arroz al ají panca con mariscos salteados y parmesano.',
      sellPrice: 42, cost: 16.9, marginPct: 60, active: true, soldToday: 9, prepMinutes: 22,
      items: [
        { ingredientId: 'ing-20', name: 'Mariscos Mixtos', qty: 0.25, unit: 'kg', cost: 6.5, wastePct: 10 },
        { ingredientId: 'ing-13', name: 'Arroz Extra', qty: 0.25, unit: 'kg', cost: 1.13, wastePct: 3 },
        { ingredientId: 'ing-12', name: 'Ají Amarillo', qty: 0.06, unit: 'kg', cost: 0.42, wastePct: 10 },
      ],
    },
    {
      id: 'rec-causa-limena', name: 'Causa Limeña', category: 'Entradas', kind: 'dish', emoji: '🥔',
      description: 'Papa amarilla prensada con relleno de pollo y palta.',
      sellPrice: 22, cost: 6.8, marginPct: 69, active: true, soldToday: 7, prepMinutes: 18,
      items: [
        { ingredientId: 'ing-09', name: 'Papa Amarilla', qty: 0.3, unit: 'kg', cost: 1.14, wastePct: 15 },
        { ingredientId: 'ing-11', name: 'Pollo Entero', qty: 0.15, unit: 'kg', cost: 1.47, wastePct: 20 },
        { ingredientId: 'ing-01', name: 'Limón Sutil', qty: 0.05, unit: 'kg', cost: 0.47, wastePct: 8 },
      ],
    },
    {
      id: 'rec-anticuchos', name: 'Anticuchos de Corazón', category: 'Criollos', kind: 'dish', emoji: '🍢',
      description: 'Brochetas marinadas en ají panca, con papa dorada y choclo.',
      sellPrice: 26, cost: 9.1, marginPct: 65, active: true, soldToday: 13, prepMinutes: 15,
      items: [
        { ingredientId: 'ing-08', name: 'Lomo de Res', qty: 0.18, unit: 'kg', cost: 6.84, wastePct: 10 },
        { ingredientId: 'ing-09', name: 'Papa Amarilla', qty: 0.15, unit: 'kg', cost: 0.57, wastePct: 15 },
        { ingredientId: 'ing-06', name: 'Choclo Desgranado', qty: 0.08, unit: 'kg', cost: 0.48, wastePct: 5 },
      ],
    },
    {
      id: 'rec-chicharron-pollo', name: 'Chicharrón de Pollo', category: 'Piqueos', kind: 'dish', emoji: '🍗',
      description: 'Trozos de pollo crocante con salsa huancaína y yucas.',
      sellPrice: 24, cost: 7.2, marginPct: 70, active: true, soldToday: 16, prepMinutes: 14,
      items: [
        { ingredientId: 'ing-11', name: 'Pollo Entero', qty: 0.35, unit: 'kg', cost: 3.43, wastePct: 18 },
        { ingredientId: 'ing-14', name: 'Aceite de Oliva', qty: 0.05, unit: 'L', cost: 1.4, wastePct: 0 },
      ],
    },
    {
      id: 'rec-leche-tigre', name: 'Leche de Tigre', category: 'Bases', kind: 'sub_recipe', emoji: '🥛',
      description: 'Base cítrica del ceviche. Rinde 1 litro.',
      sellPrice: 0, cost: 12.4, marginPct: 0, active: true, soldToday: 0, prepMinutes: 10,
      items: [
        { ingredientId: 'ing-01', name: 'Limón Sutil', qty: 0.6, unit: 'kg', cost: 5.62, wastePct: 8 },
        { ingredientId: 'ing-02', name: 'Pescado Lenguado', qty: 0.1, unit: 'kg', cost: 3.2, wastePct: 5 },
        { ingredientId: 'ing-04', name: 'Ají Limo', qty: 0.03, unit: 'kg', cost: 0.26, wastePct: 5 },
        { ingredientId: 'ing-07', name: 'Cilantro', qty: 0.02, unit: 'kg', cost: 0.24, wastePct: 5 },
      ],
    },
    {
      id: 'rec-salsa-huancaina', name: 'Salsa Huancaína', category: 'Bases', kind: 'sub_recipe', emoji: '🫕',
      description: 'Crema de ají amarillo y queso fresco. Rinde 800 ml.',
      sellPrice: 0, cost: 9.8, marginPct: 0, active: true, soldToday: 0, prepMinutes: 12,
      items: [
        { ingredientId: 'ing-12', name: 'Ají Amarillo', qty: 0.2, unit: 'kg', cost: 1.4, wastePct: 10 },
        { ingredientId: 'ing-19', name: 'Queso Fresco', qty: 0.3, unit: 'kg', cost: 5.4, wastePct: 3 },
        { ingredientId: 'ing-18', name: 'Leche Evaporada', qty: 0.5, unit: 'lata', cost: 2.05, wastePct: 0 },
      ],
    },
    {
      id: 'rec-pisco-sour', name: 'Pisco Sour', category: 'Cocteles', kind: 'dish', emoji: '🍸',
      description: 'Clásico de la casa: pisco quebranta, limón y clara.',
      sellPrice: 25, cost: 6.2, marginPct: 75, active: true, soldToday: 31, prepMinutes: 5,
      items: [
        { ingredientId: 'ing-15', name: 'Pisco Quebranta', qty: 0.12, unit: 'botella', cost: 5.04, wastePct: 0 },
        { ingredientId: 'ing-01', name: 'Limón Sutil', qty: 0.08, unit: 'kg', cost: 0.75, wastePct: 8 },
      ],
    },
    {
      id: 'rec-maracuya-sour', name: 'Maracuyá Sour', category: 'Cocteles', kind: 'dish', emoji: '🍹',
      description: 'Versión tropical del sour con pulpa de maracuyá.',
      sellPrice: 26, cost: 6.8, marginPct: 74, active: true, soldToday: 14, prepMinutes: 5,
      items: [
        { ingredientId: 'ing-15', name: 'Pisco Quebranta', qty: 0.12, unit: 'botella', cost: 5.04, wastePct: 0 },
        { ingredientId: 'ing-17', name: 'Maracuyá', qty: 0.1, unit: 'kg', cost: 0.65, wastePct: 12 },
      ],
    },
    {
      id: 'rec-chilcano', name: 'Chilcano de Pisco', category: 'Cocteles', kind: 'dish', emoji: '🥂',
      description: 'Refrescante: pisco, ginger ale y limón.',
      sellPrice: 22, cost: 5.5, marginPct: 75, active: true, soldToday: 19, prepMinutes: 4,
      items: [
        { ingredientId: 'ing-15', name: 'Pisco Quebranta', qty: 0.1, unit: 'botella', cost: 4.2, wastePct: 0 },
        { ingredientId: 'ing-01', name: 'Limón Sutil', qty: 0.04, unit: 'kg', cost: 0.37, wastePct: 8 },
      ],
    },
    {
      id: 'rec-cuba-libre', name: 'Cuba Libre', category: 'Cocteles', kind: 'dish', emoji: '🥃',
      description: 'Ron blanco, cola y limón.',
      sellPrice: 20, cost: 4.9, marginPct: 76, active: false, soldToday: 0, prepMinutes: 3,
      items: [
        { ingredientId: 'ing-16', name: 'Ron Blanco', qty: 0.1, unit: 'botella', cost: 3.5, wastePct: 0 },
        { ingredientId: 'ing-01', name: 'Limón Sutil', qty: 0.03, unit: 'kg', cost: 0.28, wastePct: 8 },
      ],
    },
  ]

  // 20 mesas: 12 ocupadas + 2 por cobrar = 14 activas (KPI del Home), 1 reservada, 5 libres
  const zones = ['Salón', 'Salón', 'Salón', 'Salón', 'Salón', 'Salón', 'Salón', 'Salón', 'Terraza', 'Terraza', 'Terraza', 'Terraza', 'Barra', 'Barra', 'Barra', 'Karaoke', 'Karaoke', 'Karaoke', 'Karaoke', 'Karaoke']
  const statuses: DiningTable['status'][] = ['occupied', 'occupied', 'bill', 'occupied', 'free', 'occupied', 'occupied', 'free', 'occupied', 'occupied', 'free', 'reserved', 'occupied', 'occupied', 'free', 'occupied', 'occupied', 'bill', 'occupied', 'free']
  const waiters = ['Lucía', 'Jorge', 'Rosa', 'Miguel']

  const tables: DiningTable[] = zones.map((zone, i) => {
    const status = statuses[i] as DiningTable['status']
    const active = status === 'occupied' || status === 'bill'
    return {
      id: `mesa-${i + 1}`,
      number: i + 1,
      zone,
      seats: zone === 'Barra' ? 2 : zone === 'Karaoke' ? 8 : 4,
      status,
      openedAt: active ? iso((((i % 4) + 1) * 0.5) * HOUR) : undefined,
      orderId: active ? `ord-${i + 1}` : undefined,
      waiter: active ? waiters[i % waiters.length] : undefined,
      guests: active ? (zone === 'Karaoke' ? 6 : 2 + (i % 3)) : undefined,
    }
  })

  const orderSeeds: Array<{ tableIdx: number, lines: Array<[string, number, OrderItemStatusSeed]> }> = [
    { tableIdx: 0, lines: [['rec-ceviche-clasico', 2, 'served'], ['rec-pisco-sour', 2, 'served'], ['rec-causa-limena', 1, 'preparing']] },
    { tableIdx: 1, lines: [['rec-lomo-saltado', 1, 'preparing'], ['rec-chilcano', 2, 'served']] },
    { tableIdx: 2, lines: [['rec-arroz-mariscos', 2, 'served'], ['rec-maracuya-sour', 2, 'served'], ['rec-anticuchos', 1, 'served']] },
    { tableIdx: 3, lines: [['rec-chicharron-pollo', 1, 'pending'], ['rec-pisco-sour', 3, 'served']] },
    { tableIdx: 5, lines: [['rec-aji-gallina', 2, 'preparing'], ['rec-chilcano', 1, 'served']] },
    { tableIdx: 6, lines: [['rec-ceviche-clasico', 1, 'served'], ['rec-lomo-saltado', 1, 'pending']] },
    { tableIdx: 8, lines: [['rec-anticuchos', 2, 'served'], ['rec-maracuya-sour', 1, 'preparing']] },
    { tableIdx: 9, lines: [['rec-causa-limena', 2, 'served']] },
    { tableIdx: 12, lines: [['rec-pisco-sour', 2, 'served']] },
    { tableIdx: 13, lines: [['rec-chilcano', 2, 'pending']] },
    { tableIdx: 15, lines: [['rec-chicharron-pollo', 2, 'served'], ['rec-pisco-sour', 4, 'served'], ['rec-cuba-libre', 2, 'served']] },
    { tableIdx: 16, lines: [['rec-lomo-saltado', 2, 'preparing'], ['rec-maracuya-sour', 2, 'served']] },
    { tableIdx: 17, lines: [['rec-arroz-mariscos', 1, 'served'], ['rec-ceviche-clasico', 1, 'served'], ['rec-pisco-sour', 2, 'served']] },
    { tableIdx: 18, lines: [['rec-aji-gallina', 1, 'pending'], ['rec-chilcano', 1, 'pending']] },
  ]

  const orders: Order[] = orderSeeds.map(({ tableIdx, lines }) => {
    const table = tables[tableIdx] as DiningTable
    return {
      id: `ord-${tableIdx + 1}`,
      tableId: table.id,
      openedAt: table.openedAt ?? iso(HOUR),
      status: 'open',
      payments: [],
      items: lines.map(([recipeId, qty, status], li) => {
        const recipe = recipes.find(r => r.id === recipeId) as Recipe
        return {
          id: `oi-${tableIdx + 1}-${li + 1}`,
          recipeId,
          name: recipe.name,
          qty,
          unitPrice: recipe.sellPrice,
          status,
        }
      }),
    }
  })

  const saleSeeds: Array<[string, number, Array<[string, number]>, Sale['method'], Sale['docType']]> = [
    ['10:42', 5, [['rec-ceviche-clasico', 1], ['rec-chilcano', 2]], 'yape', 'boleta'],
    ['11:15', 3, [['rec-lomo-saltado', 2], ['rec-pisco-sour', 2]], 'card', 'boleta'],
    ['12:03', 8, [['rec-aji-gallina', 1]], 'cash', 'boleta'],
    ['12:40', 2, [['rec-arroz-mariscos', 2], ['rec-maracuya-sour', 2]], 'card', 'factura'],
    ['13:10', 11, [['rec-chicharron-pollo', 1], ['rec-pisco-sour', 1]], 'plin', 'boleta'],
    ['13:55', 6, [['rec-causa-limena', 2], ['rec-chilcano', 2]], 'cash', 'boleta'],
    ['14:20', 1, [['rec-ceviche-clasico', 2], ['rec-pisco-sour', 2]], 'yape', 'boleta'],
    ['15:05', 9, [['rec-anticuchos', 2]], 'cash', 'boleta'],
    ['15:48', 4, [['rec-lomo-saltado', 1], ['rec-maracuya-sour', 1]], 'card', 'factura'],
    ['16:30', 7, [['rec-aji-gallina', 2], ['rec-chilcano', 1]], 'yape', 'boleta'],
    ['17:12', 14, [['rec-pisco-sour', 3]], 'cash', 'boleta'],
    ['18:02', 10, [['rec-ceviche-clasico', 1], ['rec-arroz-mariscos', 1]], 'card', 'boleta'],
  ]

  let boletaN = 1042
  let facturaN = 218
  const today = new Date().toISOString().slice(0, 10)

  const sales: Sale[] = saleSeeds.map(([time, mesa, lines, method, docType], i) => {
    const items = lines.map(([recipeId, qty]) => {
      const recipe = recipes.find(r => r.id === recipeId) as Recipe
      return { name: recipe.name, qty, unitPrice: recipe.sellPrice, total: qty * recipe.sellPrice }
    })
    const total = items.reduce((sum, it) => sum + it.total, 0)
    const subtotal = +(total / 1.18).toFixed(2)
    const number = docType === 'boleta' ? ++boletaN : ++facturaN
    return {
      id: `sale-${i + 1}`,
      serie: docType === 'boleta' ? 'B001' : 'F001',
      number,
      docType,
      date: `${today}T${time}:00-05:00`,
      tableLabel: `Mesa ${mesa}`,
      customer: docType === 'factura' ? 'Inversiones Wong SAC' : undefined,
      customerDoc: docType === 'factura' ? '20100123456' : undefined,
      items,
      subtotal,
      igv: +(total - subtotal).toFixed(2),
      total,
      method,
      status: i === 7 ? 'void' : 'issued',
    }
  })

  const movements: InventoryMovement[] = [
    { id: 'mov-1', ingredientId: 'ing-02', ingredientName: 'Pescado Lenguado', type: 'purchase', qty: 10, unit: 'kg', date: iso(6 * HOUR), note: 'Terminal pesquero', user: 'Carlos' },
    { id: 'mov-2', ingredientId: 'ing-01', ingredientName: 'Limón Sutil', type: 'sale', qty: -3.2, unit: 'kg', date: iso(5 * HOUR), note: 'Consumo del servicio' },
    { id: 'mov-3', ingredientId: 'ing-07', ingredientName: 'Cilantro', type: 'waste', qty: -0.3, unit: 'kg', date: iso(4 * HOUR), note: 'Hojas marchitas', user: 'Rosa' },
    { id: 'mov-4', ingredientId: 'ing-08', ingredientName: 'Lomo de Res', type: 'purchase', qty: 8, unit: 'kg', date: iso(26 * HOUR), note: 'Proveedor La Parada', user: 'Carlos' },
    { id: 'mov-5', ingredientId: 'ing-14', ingredientName: 'Aceite de Oliva', type: 'sale', qty: -1.5, unit: 'L', date: iso(24 * HOUR) },
    { id: 'mov-6', ingredientId: 'ing-09', ingredientName: 'Papa Amarilla', type: 'adjustment', qty: -1.2, unit: 'kg', date: iso(30 * HOUR), note: 'Conteo físico: diferencia', user: 'María' },
    { id: 'mov-7', ingredientId: 'ing-15', ingredientName: 'Pisco Quebranta', type: 'purchase', qty: 12, unit: 'botella', date: iso(70 * HOUR), user: 'Carlos' },
    { id: 'mov-8', ingredientId: 'ing-11', ingredientName: 'Pollo Entero', type: 'sale', qty: -4.5, unit: 'kg', date: iso(8 * HOUR) },
  ]

  const shoppingList: ShoppingItem[] = [
    { id: 'shop-1', ingredientId: 'ing-01', name: 'Limón Sutil', suggestedQty: 8, unit: 'kg', estimatedCost: 74.88, reason: 'Stock crítico: 2.5 kg (mín. 5)', urgent: true, checked: false },
    { id: 'shop-2', ingredientId: 'ing-14', name: 'Aceite de Oliva', suggestedQty: 6, unit: 'L', estimatedCost: 168, reason: 'Stock crítico: 2 L (mín. 4)', urgent: true, checked: false },
    { id: 'shop-3', ingredientId: 'ing-07', name: 'Cilantro', suggestedQty: 1, unit: 'kg', estimatedCost: 12, reason: 'Stock crítico: 200 g (mín. 500 g)', urgent: true, checked: false },
    { id: 'shop-4', ingredientId: 'ing-02', name: 'Pescado Lenguado', suggestedQty: 5, unit: 'kg', estimatedCost: 160, reason: 'Forecast: fin de semana alto', urgent: false, checked: false },
    { id: 'shop-5', ingredientId: 'ing-19', name: 'Queso Fresco', suggestedQty: 2, unit: 'kg', estimatedCost: 36, reason: 'Consumo proyectado huancaína', urgent: false, checked: true },
  ]

  const settings: AppSettings = {
    business: {
      name: 'Motif Restobar Karaoke',
      legalName: 'Motif Group E.I.R.L.',
      ruc: '20612345678',
      address: 'Av. Próceres de la Independencia 1532',
      district: 'San Juan de Lurigancho, Lima',
      phone: '+51 987 654 321',
      email: 'hola@motif.pe',
    },
    hours: {
      days: [
        { day: 'Lunes', opens: '18:00', closes: '23:00', closed: true },
        { day: 'Martes', opens: '18:00', closes: '23:30', closed: false },
        { day: 'Miércoles', opens: '18:00', closes: '23:30', closed: false },
        { day: 'Jueves', opens: '18:00', closes: '00:30', closed: false },
        { day: 'Viernes', opens: '18:00', closes: '02:00', closed: false },
        { day: 'Sábado', opens: '13:00', closes: '02:00', closed: false },
        { day: 'Domingo', opens: '13:00', closes: '22:00', closed: false },
      ],
    },
    payments: { cash: true, card: true, yape: true, plin: true, tipPct: 10 },
    tables: {
      zones: [
        { id: 'zone-salon', name: 'Salón', tables: 8 },
        { id: 'zone-terraza', name: 'Terraza', tables: 4 },
        { id: 'zone-barra', name: 'Barra', tables: 3 },
        { id: 'zone-karaoke', name: 'Karaoke', tables: 5 },
      ],
    },
    tax: { igvPct: 18, pricesIncludeTax: true, boletaSerie: 'B001', facturaSerie: 'F001' },
    menu: { showPrices: true, showUnavailable: false, highlightPromos: true },
  }

  return {
    ingredients,
    recipes,
    tables,
    orders,
    sales,
    movements,
    shoppingList,
    settings,
    chatHistory: [],
    ingestions: [],
    seq: 1000,
  }
}

type OrderItemStatusSeed = 'pending' | 'preparing' | 'served'

const globalDb = globalThis as typeof globalThis & { __gastroMockDb?: MockDb }

export function useMockDb(): MockDb {
  globalDb.__gastroMockDb ??= seed()
  return globalDb.__gastroMockDb
}

export function nextId(db: MockDb, prefix: string): string {
  db.seq += 1
  return `${prefix}-${db.seq}`
}

/** Sobre estándar de respuesta (frontend_context.md §6). */
export function ok<T>(data: T, meta?: { totalCount: number, page: number, unreadCount?: number }): { success: true, data: T, meta?: { totalCount: number, page: number, unreadCount?: number } } {
  return { success: true, data, ...(meta ? { meta } : {}) }
}
