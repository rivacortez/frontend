import { z } from 'zod'

export const loginSchema = z.object({
  email: z.email('Email no válido').transform(v => v.toLowerCase()),
  password: z.string().min(1, 'Ingresa tu contraseña'),
})

export type LoginInput = z.infer<typeof loginSchema>

export const registerSchema = z.object({
  name: z.string().min(2, 'Ingresa tu nombre completo'),
  email: z.email('Email no válido').transform(v => v.toLowerCase()),
  password: z.string().min(8, 'Mínimo 8 caracteres'),
  restaurantName: z.string().min(2, 'Ingresa el nombre de tu restaurante'),
})

export type RegisterInput = z.infer<typeof registerSchema>

// HU-01-06 · Cambio de contraseña. Espeja backend/src/shared/auth/auth.schema.ts:
// la contraseña nueva debe ser "fuerte" (mín. 12 + mayúscula, minúscula, dígito, símbolo).
export const strongPasswordSchema = z
  .string()
  .min(12, 'Mínimo 12 caracteres')
  .regex(/[A-Z]/, 'Requiere una mayúscula')
  .regex(/[a-z]/, 'Requiere una minúscula')
  .regex(/[0-9]/, 'Requiere un dígito')
  .regex(/[^A-Za-z0-9]/, 'Requiere un símbolo')

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Ingresa tu contraseña actual'),
  newPassword: strongPasswordSchema,
})

export type ChangePasswordInput = z.infer<typeof changePasswordSchema>
