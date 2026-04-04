/** Eén rots / cluster: basiswaarde uit scanner-HUD (kolom 1); totaal = basis × aantal stenen (1–10). */

export type OreScanBaseRow = {
  /** Weergavenaam zoals in de referentietabel */
  displayName: string;
  /** Overeenkomstig resource-slug in de database waar bekend (anders zelfde als typische SC-slug). */
  slug: string;
  base: number;
};

/** Volgorde en waarden zoals community-referentietabel (hoog → laag basis). */
export const ORE_SCAN_BASE_VALUES: readonly OreScanBaseRow[] = [
  { displayName: "Ice", slug: "ice", base: 4300 },
  { displayName: "Aluminium", slug: "aluminium", base: 4285 },
  { displayName: "Iron", slug: "iron", base: 4270 },
  { displayName: "Silicon", slug: "silicon", base: 4255 },
  { displayName: "Copper", slug: "copper", base: 4240 },
  { displayName: "Corundum", slug: "corundum", base: 4225 },
  { displayName: "Quartz", slug: "quartz", base: 4210 },
  { displayName: "Tin", slug: "tin", base: 4195 },
  { displayName: "Hephaestanite", slug: "hephaestanite", base: 4180 },
  { displayName: "Torite", slug: "torite", base: 3900 },
  { displayName: "Agricium", slug: "agricium", base: 3885 },
  { displayName: "Tungsten", slug: "tungsten", base: 3870 },
  { displayName: "Titanium", slug: "titanium", base: 3855 },
  { displayName: "Aslarite", slug: "aslarite", base: 3840 },
  { displayName: "Laranite", slug: "laranite", base: 3825 },
  { displayName: "Bexalite", slug: "bexalite", base: 3600 },
  { displayName: "Gold", slug: "gold", base: 3585 },
  { displayName: "Borase", slug: "borase", base: 3570 },
  { displayName: "Taranite", slug: "taranite", base: 3555 },
  { displayName: "Beryl", slug: "beryl", base: 3540 },
  { displayName: "Lindium", slug: "lindium", base: 3400 },
  { displayName: "Riccite", slug: "riccite", base: 3385 },
  { displayName: "Ouratite", slug: "ouratite", base: 3370 },
  { displayName: "Savrillium", slug: "savrillium", base: 3185 },
  { displayName: "Stieron", slug: "stieron", base: 3170 },
  { displayName: "Quantanium", slug: "quantanium", base: 3170 },
] as const;

export const SCAN_HUD_STONES_MIN = 1;
export const SCAN_HUD_STONES_MAX = 10;

export type ScanHudMatch = {
  displayName: string;
  slug: string;
  stones: number;
  base: number;
};

/**
 * Bepaalt welk erts en hoeveel stenen/clusters bij een scanner-totaal horen.
 * Meerdere treffers mogelijk (zelfde basis, bv. Stieron en Quantanium op 3170).
 */
export function lookupScanHudValue(total: number): ScanHudMatch[] {
  const n = Math.round(Number(total));
  if (!Number.isFinite(n) || n <= 0) return [];

  const out: ScanHudMatch[] = [];
  for (const row of ORE_SCAN_BASE_VALUES) {
    if (n % row.base !== 0) continue;
    const stones = n / row.base;
    if (
      stones >= SCAN_HUD_STONES_MIN &&
      stones <= SCAN_HUD_STONES_MAX &&
      Number.isInteger(stones)
    ) {
      out.push({
        displayName: row.displayName,
        slug: row.slug,
        stones,
        base: row.base,
      });
    }
  }
  return out;
}
