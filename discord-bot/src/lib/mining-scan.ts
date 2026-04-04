import type { ResourceLite } from "./refinery-material-parse.js";

function levenshtein(a: string, b: string) {
  const m = a.length;
  const n = b.length;
  const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i]![0] = i;
  for (let j = 0; j <= n; j++) dp[0]![j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i]![j] = Math.min(dp[i - 1]![j]! + 1, dp[i]![j - 1]! + 1, dp[i - 1]![j - 1]! + cost);
    }
  }
  return dp[m]![n]!;
}

function normalizeToken(value: string) {
  return value
    .toUpperCase()
    .replace(/[0O]/g, "O")
    .replace(/[1I|]/g, "I")
    .replace(/[^A-Z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function similarity(a: string, b: string) {
  const aa = normalizeToken(a);
  const bb = normalizeToken(b);
  if (!aa || !bb) return 0;
  if (aa.includes(bb) || bb.includes(aa)) return 0.96;
  const dist = levenshtein(aa, bb);
  const maxLen = Math.max(aa.length, bb.length);
  return Math.max(0, 1 - dist / maxLen);
}

function bestOreMatch(label: string, resources: ResourceLite[]) {
  let best: { slug: string; name: string; score: number } | null = null;
  for (const resource of resources) {
    const slugToken = resource.slug.replace(/-/g, " ");
    const score = Math.max(similarity(label, slugToken), similarity(label, resource.name));
    if (!best || score > best.score) {
      best = { slug: resource.slug, name: resource.name, score };
    }
  }
  if (!best || best.score < 0.45) return null;
  return best;
}

const INERT_HINT = /\b(inert|junk|waste|ballast|material\s*filler|vulstof)\b/i;

function parsePercent(s: string): number | null {
  const t = s.replace(",", ".").replace(/^\s*(\d+(?:\.\d+)?)\s*%?\s*$/i, "$1");
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0 || n > 100) return null;
  return n;
}

export type ScanOreLine = {
  percent: number;
  rawLabel: string;
  isInert: boolean;
  slug: string | null;
  displayName: string | null;
  matchScore: number;
};

/**
 * Parseert vrije scanner-tekst: regels als "40% Gold", "Quantanium 12,5", "Gold: 30%".
 */
export function parseScanComposition(raw: string, resources: ResourceLite[]): {
  lines: ScanOreLine[];
  sumPercent: number;
  warnings: string[];
} {
  const chunks = raw
    .split(/[\n;,]+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const lines: ScanOreLine[] = [];
  for (const chunk of chunks) {
    let percent: number | null = null;
    let label = "";

    let m = chunk.match(/^(\d+(?:[.,]\d+)?)\s*%?\s*[:\-–]?\s*(.+)$/i);
    if (m) {
      percent = parsePercent(m[1]!);
      label = m[2]!.trim();
    } else {
      m = chunk.match(/^(.+?)\s*[:\-–]?\s*(\d+(?:[.,]\d+)?)\s*%?$/i);
      if (m) {
        label = m[1]!.trim();
        percent = parsePercent(m[2]!);
      }
    }

    if (percent == null || !label) continue;

    const isInert = INERT_HINT.test(label);
    const match = isInert ? null : bestOreMatch(label, resources);
    lines.push({
      percent,
      rawLabel: label,
      isInert,
      slug: match?.slug ?? null,
      displayName: match?.name ?? null,
      matchScore: match?.score ?? 0,
    });
  }

  const sumPercent = lines.reduce((s, l) => s + l.percent, 0);
  const warnings: string[] = [];
  if (lines.length === 0) {
    warnings.push("Geen herkenbare regels. Probeer bv. `40% Gold` of `Quantanium 12,5` op aparte regels.");
  } else if (sumPercent > 102) {
    warnings.push(`Som der percentages (${sumPercent.toFixed(1)}%) is hoog — check invoer.`);
  } else if (sumPercent < 85) {
    warnings.push(`Som der percentages (${sumPercent.toFixed(1)}%) — mogelijk onvolledige scan of inert niet vermeld.`);
  }

  return { lines, sumPercent, warnings };
}

/** Gekozen erts: hoogste nuttige percentage met bekende match. */
export function dominantOre(lines: ScanOreLine[]): ScanOreLine | null {
  const candidates = lines.filter((l) => !l.isInert && l.slug);
  if (!candidates.length) return null;
  return candidates.reduce((a, b) => (b.percent > a.percent ? b : a));
}

/** Ruwe SCU erts per stof als totale rotsmassa bekend is. */
export function estimateOreScu(lines: ScanOreLine[], massScu: number): { name: string; slug: string; scu: number }[] {
  if (!massScu || massScu <= 0) return [];
  const out: { name: string; slug: string; scu: number }[] = [];
  for (const l of lines) {
    if (l.isInert || !l.slug || !l.displayName) continue;
    out.push({
      slug: l.slug,
      name: l.displayName,
      scu: (massScu * l.percent) / 100,
    });
  }
  return out;
}

/**
 * Zeer grove schatting van fracture-brokken op basis van rots-SCU (game hangt af van laser/instellingen/patch).
 */
export function estimateFracturePiecesRange(massScu: number): { low: number; high: number } {
  const m = Math.max(0, massScu);
  if (m <= 0) return { low: 0, high: 0 };
  const low = Math.max(2, Math.floor(m / 6));
  const high = Math.min(45, Math.max(low + 1, Math.ceil(m / 2)));
  return { low, high };
}
