import type { ForecastDriver } from "#shared/types/domain";

/** Presentation model for a single forecast driver chip. */
export interface ForecastDriverChip {
  key: string;
  /** ISO date (yyyy-mm-dd) of the underlying driver — kept for sorting/testing. */
  date: string;
  icon: string;
  label: string;
  /** Short display date, e.g. "28 jun" (see {@link formatShortDate}). */
  dateLabel: string;
  /** Signed, rounded percentage, e.g. "+35%"; `null` when there is no historical comparison. */
  impactLabel: string | null;
  isPositive: boolean;
  /** Full sentence for screen readers — chips convey icon + color, this is the text equivalent. */
  ariaLabel: string;
}

const DRIVER_ICONS: Record<string, string> = {
  holiday: "i-lucide-flag",
  gastro_event: "i-lucide-party-popper",
  weather: "i-lucide-cloud-sun",
  weekend: "i-lucide-calendar-days",
  payday: "i-lucide-banknote",
};
/** Icon for any driver kind the frontend doesn't recognize yet — never crashes on a new kind. */
const DEFAULT_DRIVER_ICON = "i-lucide-calendar";

const WEEKEND_KIND = "weekend";
const WEEKEND_LABEL = "Fin de semana";

/** Long, accessible date for `aria-label` (e.g. "28 de junio"), Lima timezone. */
function accessibleDate(date: string): string {
  const d = new Date(`${date}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return date;
  return new Intl.DateTimeFormat("es-PE", {
    day: "numeric",
    month: "long",
    timeZone: "America/Lima",
  }).format(d);
}

function buildChip(
  driver: ForecastDriver,
  labelOverride?: string,
): ForecastDriverChip {
  const label = labelOverride ?? driver.label;
  const impactPct =
    driver.impactPct === null ? null : Math.round(driver.impactPct);
  const impactLabel =
    impactPct === null ? null : `${impactPct >= 0 ? "+" : ""}${impactPct}%`;
  const impactPhrase =
    impactPct === null
      ? "sin comparación histórica disponible"
      : impactPct >= 0
        ? `sube la demanda proyectada ${impactPct}%`
        : `baja la demanda proyectada ${Math.abs(impactPct)}%`;

  return {
    key: `${driver.kind}-${driver.date}`,
    date: driver.date,
    icon: DRIVER_ICONS[driver.kind] ?? DEFAULT_DRIVER_ICON,
    label,
    dateLabel: formatShortDate(driver.date),
    impactLabel,
    isPositive: impactPct === null || impactPct >= 0,
    ariaLabel: `${label}, ${accessibleDate(driver.date)}, ${impactPhrase}`,
  };
}

/**
 * Groups raw forecast drivers into a short, narratable list of chips.
 *
 * WHY: core-ai emits one driver row per affected calendar day, so a 14-day
 * horizon spanning two weekends produces four `"weekend"` rows carrying the
 * SAME impact figure. Showing all of them would drown out the genuinely
 * newsworthy events — a named holiday or gastro event is worth more screen
 * real estate than a repeated "Fin de semana" chip. Editorial rule applied
 * here: every named driver (`holiday`/`gastro_event`/`weather`/`payday`/any
 * unrecognized kind) gets its own chip; `weekend` rows collapse into a single
 * chip for the SOONEST upcoming weekend only. The result is sorted by date
 * and hard-capped at `maxChips` (closest events win).
 *
 * @param drivers Raw drivers from the BFF (already bounded to the forecast window).
 * @param maxChips Hard cap on the number of chips returned. Default 4.
 */
export function groupForecastDrivers(
  drivers: ForecastDriver[],
  maxChips = 4,
): ForecastDriverChip[] {
  const sorted = [...drivers].sort((a, b) => a.date.localeCompare(b.date));
  const named = sorted
    .filter((d) => d.kind !== WEEKEND_KIND)
    .map((d) => buildChip(d));
  const nextWeekend = sorted.find((d) => d.kind === WEEKEND_KIND);

  const chips = nextWeekend
    ? [...named, buildChip(nextWeekend, WEEKEND_LABEL)]
    : named;

  return chips.sort((a, b) => a.date.localeCompare(b.date)).slice(0, maxChips);
}
