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

type MiningOcrResult = {
  rawText: string;
  entries: ParsedEntry[];
  avgConfidence: number;
};

type RefineryOcrResult = {
  rawText: string;
  inputs: ParsedEntry[];
  outputs: ParsedEntry[];
  avgConfidence: number;
};

const ocrCache = new Map<
  string,
  { at: number; value: MiningOcrResult | RefineryOcrResult }
>();
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

async function recognizeFast(file: File, kind: "mining" | "refinery") {
  const buffer = Buffer.from(await file.arrayBuffer());
  const cacheKey = `${kind}:${hashBuffer(buffer)}`;
  const cached = ocrCache.get(cacheKey);
  if (cached && Date.now() - cached.at < OCR_CACHE_TTL_MS) {
    return { rawText: cached.value.rawText, fromCache: true, cacheKey };
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
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost,
      );
    }
  }
  return dp[m][n];
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
    const qty = cleanNumber(qtyMatch[1]);
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

export async function extractEntriesFromScreenshot(file: File, resources: ResourceLite[]) {
  const { rawText, fromCache, cacheKey } = await recognizeFast(file, "mining");
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

export async function extractRefineryFromScreenshot(file: File, resources: ResourceLite[]) {
  const { rawText, fromCache, cacheKey } = await recognizeFast(file, "refinery");
  if (fromCache) {
    const cached = ocrCache.get(cacheKey);
    if (cached) return cached.value as RefineryOcrResult;
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

  const fallbackAll = parseEntriesFromText(rawText, resources);
  const inputs = inputLines.length
    ? parseEntriesFromText(inputLines.join("\n"), resources)
    : fallbackAll;
  const outputs = outputLines.length
    ? parseEntriesFromText(outputLines.join("\n"), resources)
    : fallbackAll;

  const all = [...inputs, ...outputs];
  const avgConfidence = all.length
    ? all.reduce((sum, e) => sum + e.confidence, 0) / all.length
    : 0;
  const value: RefineryOcrResult = { rawText, inputs, outputs, avgConfidence };
  storeCachedResult(cacheKey, value);
  return value;
}
