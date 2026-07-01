import { z } from "zod";
import { backendFetch } from "../../utils/backend";
import type { EmployeeView } from "./index.get";

interface Envelope<T> {
  success: boolean;
  data: T;
}

const POSITION_VALUES = ["mozo", "cocina", "caja", "otro"] as const;

const createEmployeeSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  dni: z.string().min(1),
  position: z.enum(POSITION_VALUES),
  phone: z.string().min(1).nullable().optional(),
  hiredAt: z.string().nullable().optional(),
  active: z.boolean().optional(),
  userId: z.string().uuid().nullable().optional(),
  /**
   * Salary is accepted in the schema but only forwarded to the backend when
   * the session role is 'owner'. Managers cannot set or modify salary.
   * Format: /^\d+(\.\d{1,2})?$/ (e.g. "1500" or "1500.50").
   */
  salary: z
    .string()
    .regex(/^\d+(\.\d{1,2})?$/)
    .optional(),
});

// HU-13-01 · Alta de empleado (201). Salary gating: el campo se incluye en el
// body hacia el backend solo si el rol de la sesión es 'owner'; managers no
// pueden fijar salarios (restricción del dominio, no solo del backend).
export default defineEventHandler(async (event) => {
  const body = await readValidatedBody(event, createEmployeeSchema.parse);
  const session = await getUserSession(event);
  const role = session.user?.role;

  // Build the backend payload explicitly to control which fields are forwarded.
  const payload: Record<string, unknown> = {
    firstName: body.firstName,
    lastName: body.lastName,
    dni: body.dni,
    position: body.position,
    phone: body.phone,
    hiredAt: body.hiredAt,
    active: body.active,
    userId: body.userId,
  };

  if (role === "owner" && body.salary !== undefined) {
    payload.salary = body.salary;
  }

  const res = await backendFetch<Envelope<EmployeeView>>(
    event,
    "/api/employees",
    {
      method: "POST",
      body: payload,
    },
  );
  return ok(res.data);
});
