import { defineStore } from "pinia";

/**
 * Clave de `sessionStorage` donde el plugin `onboarding-persist.client`
 * serializa el progreso del wizard (fix E01-3). Vive aquí para que el plugin y
 * cualquier limpieza compartan la misma constante (sin strings mágicos).
 */
export const ONBOARDING_STORAGE_KEY = "gastronomia:onboarding";

export interface OnboardingArea {
  id: string;
  name: string;
  tables: number;
}

export interface OnboardingAccount {
  name: string;
  email: string;
  password: string;
  tips: boolean;
}

export interface OnboardingRestaurant {
  name: string;
  cuisine: string;
  address: string;
  phone: string;
  ruc: string;
  logoName: string | null;
}

export interface OnboardingSetup {
  currency: "PEN" | "USD" | "EUR";
  igv: number;
  igvIncluded: boolean;
  areas: OnboardingArea[];
  sameSchedule: boolean;
  openTime: string;
  closeTime: string;
  closeAnyDay: boolean;
  closedDays: string[];
  payments: Record<string, boolean>;
}

interface OnboardingState {
  account: OnboardingAccount;
  emailVerified: boolean;
  restaurant: OnboardingRestaurant;
  setup: OnboardingSetup;
  setupSkipped: boolean;
  importDone: boolean;
  registered: boolean;
}

function defaultSetup(): OnboardingSetup {
  return {
    currency: "PEN",
    igv: 18,
    igvIncluded: true,
    areas: [
      { id: "a-salon", name: "Salón principal", tables: 10 },
      { id: "a-terraza", name: "Terraza", tables: 4 },
    ],
    sameSchedule: true,
    openTime: "19:00",
    closeTime: "03:00",
    closeAnyDay: false,
    closedDays: [],
    payments: {
      efectivo: true,
      tarjeta: true,
      yape: true,
      plin: true,
      transferencia: false,
      sodexo: false,
    },
  };
}

export const useOnboardingStore = defineStore("onboarding", {
  state: (): OnboardingState => ({
    account: { name: "", email: "", password: "", tips: false },
    emailVerified: false,
    restaurant: {
      name: "",
      cuisine: "",
      address: "",
      phone: "",
      ruc: "",
      logoName: null,
    },
    setup: defaultSetup(),
    setupSkipped: false,
    importDone: false,
    registered: false,
  }),

  getters: {
    firstName: (state): string =>
      state.account.name.trim().split(/\s+/)[0] ?? "",
    totalTables: (state): number =>
      state.setup.areas.reduce((sum, a) => sum + a.tables, 0),
  },

  actions: {
    // Defaults que aplica el modal "¿Saltar configuración del local?"
    applySetupDefaults(): void {
      this.setup = {
        ...defaultSetup(),
        areas: [{ id: "a-salon", name: "Salón principal", tables: 10 }],
      };
      this.setupSkipped = true;
    },
  },
});
