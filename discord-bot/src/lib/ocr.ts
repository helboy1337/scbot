import { createHash } from "node:crypto";
import { createWorker, PSM, type Worker } from "tesseract.js";

type ResourceLite = {
  slug: string;
  name: string;
};

type ParsedEntry = {
  resourceSlug: string;
  qty: number;
  confidence: number;
};

export type MiningOcrResult = {
  rawText: string;
  entries: ParsedEntry[];
  avgConfidence: number;
};

export type LocationInferLite = {
  id: string;
  name: string;
  slug: string;
  bodyName: string;
};

export type RefineryOcrResult = {
  rawText: string;
  inputs: ParsedEntry[];
  outputs: ParsedEntry[];
  avgConfidence: number;
  inferredMethod: string | null;
  inferredLocationId: string | null;
};

/** Teksten die vaak op SC-raffinage-UI voorkomen (subset; uitbreidbaar). */
const REFINERY_METHOD_HINTS = [
  "Dinyx",
  "Pyro",
  "Ferron",
  "Orkan",
  "Excel",
  "Electrostar",
  "Sakura",
  "Ranta",
  "Gendrome",
  "Solventech",
];

const ocrCache = new Map<string, { at: number; value: MiningOcrResult | RefineryOcrResult }>();
const OCR_CACHE_TTL_MS = 10 * 60 * 1000;

let workerPromise: Promise<Worker> | null = null;

async function getWorker() {
  if (!workerPromise) {
    workerPromise = (async () => {
      const worker = await createWorker("eng");
      await worker.setParameters({
        tessedit_pageseg_mode: PSM.SINGLE_BLOCK,
        preserve_interword_spaces: "1",
      });
      return worker;
    })();
  }
  return workerPromise;
}

function hashBuffer(buffer: Buffer) {
  return createHash("sha1").update(buffer).digest("hex");
}

async function recognizeFast(buffer: Buffer, kind: "mining" | "refinery") {
  const cacheKey = `${kind}:${hashBuffer(buffer)}`;
  const cached = ocrCache.get(cacheKey);
  if (cached && Date.now() - cached.at < OCR_CACHE_TTL_MS) {
    return { rawText: (cached.value as MiningOcrResult).rawText || "", fromCache: true, cacheKey };
  }

  const worker = await getWorker();
  const result = await worker.recognize(buffer);
  const rawText = result.data?.text || "";
  return { rawText, fromCache: false, cacheKey };
}

function storeCachedResult(key: string, value: MiningOcrResult | RefineryOcrResult) {
  ocrCache.set(key, { at: Date.now(), value });
}

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

function parseEntriesFromText(text: string, resources: ResourceLite[]) {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const entries: ParsedEntry[] = [];
  const seen = new Set<string>();

  for (const line of lines) {
    const upper = line.toUpperCase();
    const qtyMatch = upper.match(/(\d+(?:[.,]\d+)?)/);
    if (!qtyMatch) continue;
    const qty = cleanNumber(qtyMatch[1]!);
    if (qty <= 0) continue;

    const best = bestResourceMatch(upper, resources);
    if (!best || best.score < 0.62) continue;
    const key = `${best.slug}:${qty}`;
    if (!seen.has(key)) {
      entries.push({ resourceSlug: best.slug, qty, confidence: best.score });
      seen.add(key);
    }
  }

  return entries;
}

/** Zelfde als parseEntriesFromText maar behoudt volgorde per regel (geen dedup) — nodig voor input/output-split. */
function parseEntriesOrderedPerLine(text: string, resources: ResourceLite[]) {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const entries: ParsedEntry[] = [];
  for (const line of lines) {
    const upper = line.toUpperCase();
    const qtyMatch = upper.match(/(\d+(?:[.,]\d+)?)/);
    if (!qtyMatch) continue;
    const qty = cleanNumber(qtyMatch[1]!);
    if (qty <= 0) continue;
    const best = bestResourceMatch(upper, resources);
    if (!best || best.score < 0.62) continue;
    entries.push({ resourceSlug: best.slug, qty, confidence: best.score });
  }
  return entries;
}

function splitEntriesMidpoint(entries: ParsedEntry[]) {
  if (entries.length < 2) {
    return { inputs: entries, outputs: [] as ParsedEntry[] };
  }
  const mid = Math.floor(entries.length / 2);
  return { inputs: entries.slice(0, mid), outputs: entries.slice(mid) };
}

function normCompact(value: string) {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function inferRefineryMethodFromText(rawText: string): string | null {
  const lower = rawText.toLowerCase();
  let best: string | null = null;
  let bestLen = 0;
  for (const hint of REFINERY_METHOD_HINTS) {
    if (lower.includes(hint.toLowerCase()) && hint.length >= bestLen) {
      best = hint;
      bestLen = hint.length;
    }
  }
  return best;
}

export function inferLocationIdFromText(
  rawText: string,
  locations: LocationInferLite[],
): string | null {
  const text = normCompact(rawText);
  let best: { id: string; score: number } | null = null;
  for (const loc of locations) {
    const patterns = [
      normCompact(`${loc.bodyName}${loc.name}`),
      normCompact(loc.name),
      normCompact(loc.slug.replace(/-/g, " ")),
      normCompact(`${loc.bodyName}${loc.slug.replace(/-/g, "")}`),
    ];
    for (const p of patterns) {
      if (p.length < 4) continue;
      if (text.includes(p) && p.length >= (best?.score ?? 0)) {
        best = { id: loc.id, score: p.length };
      }
    }
  }
  return best?.id ?? null;
}

export async function extractEntriesFromBuffer(buffer: Buffer, resources: ResourceLite[]) {
  const { rawText, fromCache, cacheKey } = await recognizeFast(buffer, "mining");
  if (fromCache) {
    const cached = ocrCache.get(cacheKey);
    if (cached) return cached.value as MiningOcrResult;
  }
  const entries = parseEntriesFromText(rawText, resources);
  const avgConfidence = entries.length
    ? entries.reduce((sum, e) => sum + e.confidence, 0) / entries.length
    : 0;
  const value: MiningOcrResult = { rawText, entries, avgConfidence };
  storeCachedResult(cacheKey, value);
  return value;
}

export async function extractRefineryFromBuffer(
  buffer: Buffer,
  resources: ResourceLite[],
  locations: LocationInferLite[] = [],
) {
  const withInference = (
    base: Omit<RefineryOcrResult, "inferredMethod" | "inferredLocationId">,
  ): RefineryOcrResult => ({
    ...base,
    inferredMethod: inferRefineryMethodFromText(base.rawText),
    inferredLocationId:
      locations.length > 0 ? inferLocationIdFromText(base.rawText, locations) : null,
  });

  const { rawText, fromCache, cacheKey } = await recognizeFast(buffer, "refinery");
  if (fromCache) {
    const cached = ocrCache.get(cacheKey);
    if (cached) {
      const v = cached.value as RefineryOcrResult;
      return withInference({
        rawText: v.rawText,
        inputs: v.inputs,
        outputs: v.outputs,
        avgConfidence: v.avgConfidence,
      });
    }
  }

  const lines = rawText.split(/\r?\n/);

  const inputLines: string[] = [];
  const outputLines: string[] = [];
  let mode: "input" | "output" | null = null;

  for (const line of lines) {
    const upper = line.toUpperCase();
    if (upper.includes("INPUT") || upper.includes("RAW") || upper.includes("UNREFINED")) {
      mode = "input";
      continue;
    }
    if (upper.includes("OUTPUT") || upper.includes("RESULT") || upper.includes("REFINED")) {
      mode = "output";
      continue;
    }
    if (mode === "input") inputLines.push(line);
    if (mode === "output") outputLines.push(line);
  }

  const sectionInputs = parseEntriesOrderedPerLine(inputLines.join("\n"), resources);
  const sectionOutputs = parseEntriesOrderedPerLine(outputLines.join("\n"), resources);
  const orderedFull = parseEntriesOrderedPerLine(rawText, resources);

  let inputs: ParsedEntry[];
  let outputs: ParsedEntry[];

  if (sectionInputs.length > 0 && sectionOutputs.length > 0) {
    inputs = sectionInputs;
    outputs = sectionOutputs;
  } else {
    ({ inputs, outputs } = splitEntriesMidpoint(orderedFull));
  }

  const all = [...inputs, ...outputs];
  const avgConfidence = all.length
    ? all.reduce((sum, e) => sum + e.confidence, 0) / all.length
    : 0;

  const value = withInference({ rawText, inputs, outputs, avgConfidence });
  storeCachedResult(cacheKey, value);
  return value;
}
