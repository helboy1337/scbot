/**
 * Indicatieve verkoopprijzen (aUEC per SCU) voor refined output na raffinage.
 * Bandbreedtes grof afgestemd op community-handel (o.a. UEX universe-gemiddelden), niet live — sterk per terminal/patch.
 */
export type OrePriceBand = { minPerScu: number; maxPerScu: number };

const ORE_SELL_PRICE_PER_SCU: Record<string, OrePriceBand> = {
  quantanium: { minPerScu: 120000, maxPerScu: 155000 },
  gold: { minPerScu: 24000, maxPerScu: 35000 },
  iron: { minPerScu: 2400, maxPerScu: 4000 },
  copper: { minPerScu: 2800, maxPerScu: 4000 },
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
