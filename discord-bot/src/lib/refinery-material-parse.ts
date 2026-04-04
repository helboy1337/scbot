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

export function bestResourceMatch(line: string, resources: ResourceLite[]) {
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
export function fixMaterialLineTypos(line: string) {
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

/** Alleen het rechterpaneel met ertsregels; voorkomt sidebar (Raw) + manifest-getallen. */
function sliceMaterialsSelectedRegion(text: string): string {
  const idx = text.search(/MATERIALS\s+SELECTED/i);
  if (idx < 0) return text;
  const rest = text.slice(idx);
  const end = rest.search(/\n\s*TOTAL\s+COST\b/i);
  return (end > 0 ? rest.slice(0, end) : rest).slice(0, 4000);
}

const MAX_MATERIAL_SCU = 50000;

/** QTY/yield uit UI: decimale SCU (15,4 / 15.4) + gehele getallen, links-naar-rechts. */
function extractOrderedNumbers(segment: string): number[] {
  const found: { idx: number; val: number }[] = [];
  const re = /\b(\d+[.,]\d{1,3})\b|\b(\d{1,5})\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(segment)) !== null) {
    const dec = m[1];
    const ints = m[2];
    const val = dec != null ? cleanNumber(dec) : Number(ints);
    if (!Number.isFinite(val)) continue;
    if (val === 2999) continue;
    if (dec == null && val < 1) continue;
    if (dec != null && val < 0.01) continue;
    if (val > MAX_MATERIAL_SCU) continue;
    found.push({ idx: m.index, val });
  }
  found.sort((a, b) => a.idx - b.idx);
  return found.map((f) => f.val);
}

/**
 * Eerst getallen op dezelfde regel na "(ORE)" (voorkomt dat de volgende ertsregel meetelt),
 * anders volgende regels. Ondersteunt kleine yields (1-cijferig) en decimale SCU.
 */
function collectQtyYieldFromFollowingLines(lines: string[], startIdx: number): number[] {
  const firstLine = lines[startIdx]!;
  const oreSplit = firstLine.split(/\(ORE\)/i);
  const afterOre = oreSplit.length > 1 ? oreSplit[1]!.trim() : firstLine;
  const onLine = extractOrderedNumbers(afterOre);
  if (onLine.length >= 2) return onLine.slice(0, 2);

  const nums: number[] = [];
  for (let k = startIdx; k < Math.min(startIdx + 8, lines.length); k++) {
    const seg = lines[k]!;
    if (k > startIdx && /\(ORE\)/i.test(seg)) break;
    for (const n of extractOrderedNumbers(seg)) {
      if (nums.length && nums[nums.length - 1] === n) continue;
      nums.push(n);
      if (nums.length >= 2) return nums;
    }
  }
  return nums;
}

function dedupeOrePairs(
  pairs: Array<{ resourceSlug: string; qty: number; yld: number; confidence: number }>,
): { inputs: ParsedEntry[]; outputs: ParsedEntry[] } {
  const bySlug = new Map<
    string,
    { resourceSlug: string; qty: number; yld: number; confidence: number }
  >();
  for (const p of pairs) {
    if (p.qty < p.yld) continue;
    const prev = bySlug.get(p.resourceSlug);
    if (!prev || p.confidence > prev.confidence) {
      bySlug.set(p.resourceSlug, p);
    }
  }
  const inputs: ParsedEntry[] = [];
  const outputs: ParsedEntry[] = [];
  for (const p of bySlug.values()) {
    inputs.push({ resourceSlug: p.resourceSlug, qty: p.qty, confidence: p.confidence });
    outputs.push({ resourceSlug: p.resourceSlug, qty: p.yld, confidence: p.confidence });
  }
  return { inputs, outputs };
}

/**
 * Parseert SC-raffinage: alleen regels met (ORE) in het MATERIALS SELECTED-blok.
 * QTY = ruwe erts-SCU, YIELD = wat je na raffinage overhoudt (UI-kolom).
 * Getallen mogen op de volgende regels staan (typisch voor OCR).
 */
export function parseRefineryQtyYieldRows(
  text: string,
  resources: ResourceLite[],
): { inputs: ParsedEntry[]; outputs: ParsedEntry[] } {
  const focused = sliceMaterialsSelectedRegion(text);
  const lines = focused
    .split(/\r?\n/)
    .map((l) => fixMaterialLineTypos(l.trim()))
    .filter(Boolean);

  const pairs: Array<{ resourceSlug: string; qty: number; yld: number; confidence: number }> = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (isNoiseRefineryLine(line)) continue;
    const upper = line.toUpperCase();
    if (/\(RAW\)/i.test(line)) continue;
    if (!/\(ORE\)/i.test(line)) continue;

    const best = bestResourceMatch(upper, resources);
    if (!best || best.score < 0.45) continue;

    const nums = collectQtyYieldFromFollowingLines(lines, i);
    if (nums.length < 2) continue;

    let qty = nums[0]!;
    let yld = nums[1]!;
    if (nums.length >= 3 && Math.abs(nums[0]! - (nums[1]! + nums[2]!)) <= 2.5) {
      qty = nums[1]!;
      yld = nums[2]!;
    }

    if (qty > 50000 || yld > 50000) continue;
    if (qty < yld) {
      const t = qty;
      qty = yld;
      yld = t;
    }

    pairs.push({ resourceSlug: best.slug, qty, yld, confidence: best.score });
  }

  const deduped = dedupeOrePairs(pairs);
  if (deduped.inputs.length > 0) return deduped;

  return parseRefineryQtyYieldRowsFallback(text, resources);
}

/** Fallback als MATERIALS SELECTED ontbreekt in OCR. */
function parseRefineryQtyYieldRowsFallback(
  text: string,
  resources: ResourceLite[],
): { inputs: ParsedEntry[]; outputs: ParsedEntry[] } {
  const lines = text
    .split(/\r?\n/)
    .map((l) => fixMaterialLineTypos(l.trim()))
    .filter(Boolean);
  const pairs: Array<{ resourceSlug: string; qty: number; yld: number; confidence: number }> = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (isNoiseRefineryLine(line)) continue;
    const upper = line.toUpperCase();
    if (/\(RAW\)/i.test(line)) continue;
    if (!/\(ORE\)/i.test(line)) continue;

    const best = bestResourceMatch(upper, resources);
    if (!best || best.score < 0.45) continue;

    const nums = collectQtyYieldFromFollowingLines(lines, i);
    if (nums.length < 2) continue;

    let qty = nums[0]!;
    let yld = nums[1]!;
    if (qty < yld) {
      const t = qty;
      qty = yld;
      yld = t;
    }
    pairs.push({ resourceSlug: best.slug, qty, yld, confidence: best.score });
  }
  return dedupeOrePairs(pairs);
}
