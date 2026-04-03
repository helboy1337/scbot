/**
 * Indicatieve verkoopprijzen (aUEC per SCU) voor erts / raffinage-output.
 * Star Citizen-prijzen verschillen per locatie, patch en vraag/aanbod — dit is een grove bandbreedte.
 * Bron: community-handel (o.a. UEX-stijl ranges), niet live gesynchroniseerd.
 */
export type OrePriceBand = { minPerScu: number; maxPerScu: number };

const ORE_SELL_PRICE_PER_SCU: Record<string, OrePriceBand> = {
  quantanium: { minPerScu: 12000, maxPerScu: 22000 },
  gold: { minPerScu: 6000, maxPerScu: 14000 },
  iron: { minPerScu: 1, maxPerScu: 8 },
  copper: { minPerScu: 4, maxPerScu: 18 },
  laranite: { minPerScu: 25, maxPerScu: 55 },
  agricium: { minPerScu: 15, maxPerScu: 45 },
  tungsten: { minPerScu: 12, maxPerScu: 35 },
  titanium: { minPerScu: 18, maxPerScu: 40 },
  bexalite: { minPerScu: 35, maxPerScu: 90 },
  borase: { minPerScu: 8, maxPerScu: 28 },
  corundum: { minPerScu: 8, maxPerScu: 30 },
  "hadanite": { minPerScu: 200, maxPerScu: 350 },
  dolivine: { minPerScu: 80, maxPerScu: 180 },
  aphorite: { minPerScu: 120, maxPerScu: 220 },
};

export function getOrePriceBand(slug: string): OrePriceBand | null {
  const b = ORE_SELL_PRICE_PER_SCU[slug.toLowerCase()];
  return b ?? null;
}

export type OutputLine = { resourceSlug: string; qty: number; name?: string };

export function estimateOreSaleSummary(outputs: OutputLine[]): {
  lines: string[];
  totalMin: number;
  totalMax: number;
  unknownSlugs: string[];
} {
  const lines: string[] = [];
  let totalMin = 0;
  let totalMax = 0;
  const unknownSlugs: string[] = [];

  for (const o of outputs) {
    const slug = o.resourceSlug.toLowerCase();
    const label = o.name ?? slug;
    const band = getOrePriceBand(slug);
    if (!band) {
      unknownSlugs.push(slug);
      lines.push(`• **${label}** (${o.qty} SCU): *geen indicatieve prijs — check zelf terminal/UEX*`);
      continue;
    }

    const lo = Math.round(o.qty * band.minPerScu);
    const hi = Math.round(o.qty * band.maxPerScu);
    totalMin += lo;
    totalMax += hi;
    lines.push(
      `• **${label}** (${o.qty} SCU): ~${lo.toLocaleString("nl-NL")} – ~${hi.toLocaleString("nl-NL")} aUEC`,
    );
  }

  return { lines, totalMin, totalMax, unknownSlugs };
}
