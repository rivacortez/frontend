import type { ApiResponse } from "#shared/types/api";

// HU-13-01 · Gestión de empleados (E13). Todas las mutaciones invalidan la
// lista completa; no hay paginación en v1 (el backend devuelve todos en uno).

export type EmployeePosition = "mozo" | "cocina" | "caja" | "otro";

export interface Employee {
  id: string;
  tenantId: string;
  firstName: string;
  lastName: string;
  dni: string;
  position: EmployeePosition;
  /** Solo presente en respuestas a usuarios con rol 'owner'. */
  salary?: string;
  phone: string | null;
  /** ISO datetime string o null. */
  hiredAt: string | null;
  active: boolean;
  userId: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Payload para crear o actualizar un empleado. El campo `salary` solo es
 * procesado por el BFF cuando el rol de sesión es 'owner'; el BFF lo filtra
 * antes de reenviar al backend para managers.
 */
export interface EmployeePayload {
  firstName: string;
  lastName: string;
  dni: string;
  position: EmployeePosition;
  phone?: string | null;
  hiredAt?: string | null;
  active?: boolean;
  userId?: string | null;
  salary?: string;
}

/** Lista todos los empleados del tenant (orden: lastName asc, devuelto por el backend). */
export function useEmployees() {
  return useQuery({
    key: () => ["employees"] as const,
    query: () =>
      $fetch<ApiResponse<Employee[]>>("/api/employees").then((r) => r.data),
  });
}

/** Detalle de un empleado individual por id. */
export function useEmployee(id: MaybeRefOrGetter<string>) {
  return useQuery({
    key: () => ["employees", toValue(id)] as const,
    query: () =>
      $fetch<ApiResponse<Employee>>(`/api/employees/${toValue(id)}`).then(
        (r) => r.data,
      ),
  });
}

/** Crea un empleado nuevo (POST /api/employees → 201). */
export function useCreateEmployee() {
  const cache = useQueryCache();
  return useMutation({
    mutation: (payload: EmployeePayload) =>
      $fetch<ApiResponse<Employee>>("/api/employees", {
        method: "POST",
        body: payload,
      }).then((r) => r.data),
    onSettled: () => cache.invalidateQueries({ key: ["employees"] }),
  });
}

/** Edición parcial de un empleado existente (PATCH /api/employees/:id). */
export function useUpdateEmployee() {
  const cache = useQueryCache();
  return useMutation({
    mutation: ({ id, ...payload }: Partial<EmployeePayload> & { id: string }) =>
      $fetch<ApiResponse<Employee>>(`/api/employees/${id}`, {
        method: "PATCH",
        body: payload,
      }).then((r) => r.data),
    onSettled: () => cache.invalidateQueries({ key: ["employees"] }),
  });
}

/**
 * Baja (soft-delete) de un empleado (DELETE /api/employees/:id).
 * El backend marca `active: false`; la lista se refresca automáticamente.
 */
export function useDeleteEmployee() {
  const cache = useQueryCache();
  return useMutation({
    mutation: (id: string) =>
      $fetch<ApiResponse<null>>(`/api/employees/${id}`, { method: "DELETE" }),
    onSettled: () => cache.invalidateQueries({ key: ["employees"] }),
  });
}
