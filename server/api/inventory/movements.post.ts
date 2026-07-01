import { z } from "zod";
import { backendFetch } from "../../utils/backend";
import { toFrontendIngredient } from "../../utils/e02-adapter";
import { createMovement, stockMap } from "../../utils/inventory-adapter";

interface Envelope<T> {
  success: boolean;
  data: T;
}
interface BeIngredient {
  id: string;
  sku: string;
  name: string;
  type: string;
  unit: string;
  category: string | null;
  unitCost: string;
  updatedAt: string;
}

// Movimiento de inventario (E05, HU-05-02/03/08). `qty` con signo (entrada +,
// salida/merma −). `reason` OBLIGATORIA para merma (`type:'waste'`); el backend la
// exige (400 si falta) y rechaza stock negativo. `user` del mock se ignora (el
// backend toma el userId del JWT). Compat: aún se acepta `user` en el body.
const createMovementSchema = z.object({
  ingredientId: z.string(),
  type: z.enum(["purchase", "sale", "waste", "adjustment", "count"]),
  qty: z
    .number()
    .refine((n) => n !== 0, { message: "La cantidad no puede ser 0" }),
  note: z.string().optional(),
  reason: z.string().min(1).optional(),
  user: z.string().optional(),
});

export default defineEventHandler(async (event) => {
  const body = await readValidatedBody(event, createMovementSchema.parse);

  // Defensive sign enforcement: the backend accepts signed qty deltas
  // (positive = stock entry, negative = stock exit). The UI already sends the
  // correct sign, but this guard prevents silent stock corruption from any
  // direct API caller that sends an unsigned qty for outgoing/incoming types.
  // `adjustment` is intentionally passed as-is: it represents a signed delta
  // that can be positive or negative depending on the discrepancy direction.
  const signedQty: number =
    body.type === "sale" || body.type === "waste"
      ? -Math.abs(body.qty) // outgoing: force negative
      : body.type === "purchase" || body.type === "count"
        ? Math.abs(body.qty) // incoming: force positive
        : body.qty; // adjustment: caller-determined sign

  const movement = await createMovement(event, {
    ingredientId: body.ingredientId,
    type: body.type,
    qty: signedQty,
    note: body.note,
    reason: body.reason,
  });

  // El frontend espera `{ movement, ingredient }`: devolvemos el insumo con el
  // stock ya actualizado (re-merge desde Inventario) para feedback inmediato.
  const [res, stock] = await Promise.all([
    backendFetch<Envelope<BeIngredient[]>>(event, "/api/ingredients"),
    stockMap(event),
  ]);
  const be = res.data.find((i) => i.id === body.ingredientId);
  const ingredient = be ? toFrontendIngredient(be) : undefined;
  if (ingredient) {
    const sv = stock.get(ingredient.id);
    if (sv) {
      ingredient.stock = Number(sv.stock);
      ingredient.minStock = Number(sv.minStock);
      ingredient.status = sv.status;
    }
  }

  return ok({ movement, ingredient });
});
