export type ResourceLite = {
  slug: string;
  name: string;
};

export type ParsedEntry = {
  resourceSlug: string;
  qty: number;
  confidence: number;
};

function cleanNumber(value: string) {
  const normalized = value.replace(",", ".").replace(/[^\d.]/g, "");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function levenshtein(a: string, b: string) {
  const m = a.length;
  const n = b.length;
  const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i]![0] = i;
  for (let j = 0; j <= n; j++) dp[0]![j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i]![j] = Math.min(
        dp[i - 1]![j]! + 1,
        dp[i]![j - 1]! + 1,
        dp[i - 1]![j - 1]! + cost,
      );
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

function bestResourceMatch(line: string, resources: ResourceLite[]) {
  let best: { slug: string; score: number } | null = null;
  for (const resource of resources) {
    const slugToken = resource.slug.replace(/-/g, " ");
    const nameToken = resource.name;
    const score = Math.max(similarity(line, slugToken), similarity(line, nameToken));
    if (!best || score > best.score) {
      best = { slug: resource.slug, score };
    }
  }
  return best;
}

/** Typische Tesseract-fouten op game-UI. */
function fixMaterialLineTypos(line: string) {
  return line
    .replace(/\b1RON\b/gi, "IRON")
    .replace(/\bG0LD\b/gi, "GOLD")
    .replace(/\bQUANTAINIUM\b/gi, "QUANTANIUM")
    .replace(/\bT1TANIUM\b/gi, "TITANIUM")
    .replace(/\bC0PPER\b/gi, "COPPER")
    .replace(/\bTUN65TEN\b/gi, "TUNGSTEN");
}

function isNoiseRefineryLine(line: string) {
  const u = line.toUpperCase();
  return (
    /\b(MANIFEST|WORKLOAD|SURCHARGE|CSCU|INERT|FREE\s*SPACE|SPECIALIZATION|PROCESSING\s*TIME|TOTAL\s*COST|AUEC|SETUP\s*WORK|CONFIRM|CANCEL)\b/.test(
      u,
    ) ||
    /\b\d{1,2}\s*[MMS]\s+\d{1,2}\s*[S]\b/.test(u) ||
    /HIGH\s+SPEED.*HIGH\s+COST/i.test(u)
  );
}

/**
 * Parseert SC-raffinage-tabelregels: materiaal + QTY + YIELD (twee getallen).
 * Input = ruwe hoeveelheid erts, output = verwachte yield (refined).
 */
export function parseRefineryQtyYieldRows(
  text: string,
  resources: ResourceLite[],
): { inputs: ParsedEntry[]; outputs: ParsedEntry[] } {
  const inputs: ParsedEntry[] = [];
  const outputs: ParsedEntry[] = [];
  const lines = text
    .split(/\r?\n/)
    .map((l) => fixMaterialLineTypos(l.trim()))
    .filter(Boolean);

  for (const line of lines) {
    if (isNoiseRefineryLine(line)) continue;
    const upper = line.toUpperCase();
    const best = bestResourceMatch(upper, resources);
    if (!best || best.score < 0.45) continue;

    const hasOre = /\(ORE\)|\bORE\b/.test(upper);
    const resMeta = resources.find((r) => r.slug === best.slug);
    const nameHit =
      upper.includes(best.slug.replace(/-/g, " ").toUpperCase()) ||
      Boolean(resMeta && upper.includes(resMeta.name.toUpperCase()));
    if (!hasOre && !nameHit && best.score < 0.65) continue;

    const nums = [...upper.matchAll(/\b(\d{2,5})\b/g)]
      .map((m) => Number(m[1]))
      .filter((n) => Number.isFinite(n) && n >= 10);

    if (nums.length < 2) continue;

    let qty: number;
    let yld: number;
    if (nums.length === 2) {
      [qty, yld] = nums;
    } else {
      const a = nums[0]!;
      const b = nums[1]!;
      const c = nums[2]!;
      if (nums.length >= 3 && Math.abs(a - (b + c)) <= 2) {
        qty = b;
        yld = c;
      } else {
        qty = nums[nums.length - 2]!;
        yld = nums[nums.length - 1]!;
      }
    }

    if (qty === 2999 || yld === 2999) continue;
    if (qty > 50000 || yld > 50000) continue;

    if (qty < yld) {
      const t = qty;
      qty = yld;
      yld = t;
    }

    inputs.push({ resourceSlug: best.slug, qty, confidence: best.score });
    outputs.push({ resourceSlug: best.slug, qty: yld, confidence: best.score });
  }

  return { inputs, outputs };
}
