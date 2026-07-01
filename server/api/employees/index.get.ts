import { backendFetch } from "../../utils/backend";

interface Envelope<T> {
  success: boolean;
  data: T;
}

/** Backend DTO para un empleado (salary solo presente en respuestas a owner). */
export interface EmployeeView {
  id: string;
  tenantId: string;
  firstName: string;
  lastName: string;
  dni: string;
  position: "mozo" | "cocina" | "caja" | "otro";
  /** Solo presente si el token pertenece a un owner. */
  salary?: string;
  phone: string | null;
  /** ISO datetime string o null si no se registró. */
  hiredAt: string | null;
  active: boolean;
  userId: string | null;
  createdAt: string;
  updatedAt: string;
}

// HU-13-01 · Lista todos los empleados del tenant. El backend omite el campo
// `salary` automáticamente si el JWT no es de owner (CASL).
export default defineEventHandler(async (event) => {
  const res = await backendFetch<Envelope<EmployeeView[]>>(
    event,
    "/api/employees",
  );
  return ok(res.data, { totalCount: res.data.length, page: 1 });
});
