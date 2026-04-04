import {
  type ResourceLite,
  bestResourceMatch,
  fixMaterialLineTypos,
} from "./refinery-material-parse.js";

const INERT_LABEL = /\b(inert|inerte|waste|afval)\b/i;

/** Grove aanname voor HUD-“stenen” na breuk; spel geeft geen vaste kg per fragment. */
const FRAG_KG_TYPICAL_MIN = 75;
const FRAG_KG_TYPICAL_MAX = 220;

export type ScanCompositionEntry = {
  rawLabel: string;
  percent: number;
  resourceSlug: string | null;
  resourceName: string | null;
  matchScore: number;
};

export type MiningScanParseResult = {
  massKg: number | null;
  entries: ScanCompositionEntry[];
  dominant: ScanCompositionEntry | null;
  inertPercent: number | null;
};

function cleanOreLabel(raw: string) {
  return raw
    .replace(/\(.*?\)/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\b(ore|erts)\b/gi, "")
    .trim();
}

function extractMassKg(text: string): { kg: number | null; rest: string } {
  const patterns: RegExp[] = [
    /\b(?:mass|gewicht|massa)\s*[:\s]?\s*(\d+(?:[.,]\d+)?)\s*(?:k\s*g|kg)\b/gi,
    /\b(\d+(?:[.,]\d+)?)\s*(?:k\s*g|kg)\b/gi,
  ];
  let rest = text;
  let kg: number | null = null;
  for (const re of patterns) {
    const m = re.exec(text);
    if (m?.[1]) {
      const n = Number(m[1].replace(",", "."));
      if (Number.isFinite(n) && n > 0) {
        kg = n;
        rest = text.slice(0, m.index) + text.slice(m.index + m[0].length);
        break;
      }
    }
  }
  return { kg, rest: rest.replace(/\s+/g, " ").trim() };
}

/**
 * Leest vrije tekst van een mining-scan (HUD): percentages per materiaal, optioneel massa in kg.
 */
export function parseMiningScanText(text: string, resources: ResourceLite[]): MiningScanParseResult {
  const { kg: massKg, rest } = extractMassKg(text.trim());
  const work = rest.replace(/\s+/g, " ").trim();

  const found: { rawLabel: string; percent: number }[] = [];

  const rePercentFirst =
    /(\d+(?:[.,]\d+)?)\s*%\s*([^%,/|]+?)(?=\s*(?:\d+(?:[.,]\d+)?\s*%|[,/|]|$))/gi;
  let m: RegExpExecArray | null;
  while ((m = rePercentFirst.exec(work)) !== null) {
    const pct = Number(m[1]!.replace(",", "."));
    const label = cleanOreLabel(m[2]!);
    if (Number.isFinite(pct) && pct > 0 && label.length >= 2) {
      found.push({ rawLabel: label, percent: pct });
    }
  }

  const reNameFirst =
    /([A-Za-z][A-Za-z0-9\s'-]{1,45}?)\s+(\d+(?:[.,]\d+)?)\s*%/gi;
  while ((m = reNameFirst.exec(work)) !== null) {
    const label = cleanOreLabel(m[1]!);
    const pct = Number(m[2]!.replace(",", "."));
    if (Number.isFinite(pct) && pct > 0 && label.length >= 2 && !INERT_LABEL.test(label)) {
      found.push({ rawLabel: label, percent: pct });
    }
  }

  const merged = new Map<string, { rawLabel: string; percent: number }>();
  for (const row of found) {
    const key = row.rawLabel.toLowerCase();
    const prev = merged.get(key);
    if (prev) merged.set(key, { rawLabel: row.rawLabel, percent: prev.percent + row.percent });
    else merged.set(key, row);
  }

  let inertPercent: number | null = null;
  const oreRows: { rawLabel: string; percent: number }[] = [];
  for (const row of merged.values()) {
    if (INERT_LABEL.test(row.rawLabel)) {
      inertPercent = (inertPercent ?? 0) + row.percent;
    } else {
      oreRows.push(row);
    }
  }

  const matchThreshold = 0.55;
  const entries: ScanCompositionEntry[] = oreRows.map((row) => {
    const match = bestResourceMatch(fixMaterialLineTypos(row.rawLabel), resources);
    const ok = match && match.score >= matchThreshold;
    const slug = ok ? match!.slug : null;
    const resMeta = slug ? resources.find((r) => r.slug === slug) : undefined;
    return {
      rawLabel: row.rawLabel,
      percent: row.percent,
      resourceSlug: slug,
      resourceName: resMeta?.name ?? null,
      matchScore: match?.score ?? 0,
    };
  });

  const comparable = entries.filter((e) => e.resourceSlug);
  let dominant: ScanCompositionEntry | null = null;
  for (const e of comparable) {
    if (!dominant || e.percent > dominant.percent) dominant = e;
  }
  if (!dominant && entries.length === 1) dominant = entries[0]!;

  return { massKg, entries, dominant, inertPercent };
}

export function formatFragmentEstimate(massKg: number): { min: number; max: number } {
  const min = Math.max(1, Math.floor(massKg / FRAG_KG_TYPICAL_MAX));
  const max = Math.max(min, Math.ceil(massKg / FRAG_KG_TYPICAL_MIN));
  return { min, max };
}
