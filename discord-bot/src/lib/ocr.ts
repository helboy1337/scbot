import { createHash } from "node:crypto";
import { createWorker, PSM, type Worker } from "tesseract.js";
import {
  parseRefineryQtyYieldRows,
  type ParsedEntry,
  type ResourceLite,
} from "./refinery-material-parse.js";

export type { ParsedEntry, ResourceLite };

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

const REFINERY_METHOD_HINTS = [
  "XCR Reaction",
  "Dinyx Solventech",
  "Pyrolytic",
  "Electrostar",
  "Solventech",
  "Gendrome",
  "Dinyx",
  "Ferron",
  "Orkan",
  "Excel",
  "Sakura",
  "Ranta",
  "XCR",
  "Pyro",
];

const REFINERY_METHOD_REGEX: RegExp[] = [
  /XCR\s*REACTION/i,
  /X\s*C\s*R\s*REACT(?:ION|1ON)/i,
  /DINYX\s*SOLVENTECH/i,
  /PYROLYTIC/i,
  /ELECTROSTAR/i,
  /FERRON/i,
  /ORKAN/i,
  /GENDROME/i,
];

const ocrCache = new Map<string, { at: number; value: MiningOcrResult | RefineryOcrResult }>();
const OCR_CACHE_TTL_MS = 10 * 60 * 1000;

let miningWorkerPromise: Promise<Worker> | null = null;
let refineryWorkerPromise: Promise<Worker> | null = null;

async function getMiningWorker() {
  if (!miningWorkerPromise) {
    miningWorkerPromise = (async () => {
      const worker = await createWorker("eng");
      await worker.setParameters({
        tessedit_pageseg_mode: PSM.SINGLE_BLOCK,
        preserve_interword_spaces: "1",
      });
      return worker;
    })();
  }
  return miningWorkerPromise;
}

async function getRefineryWorker() {
  if (!refineryWorkerPromise) {
    refineryWorkerPromise = (async () => {
      const worker = await createWorker("eng");
      await worker.setParameters({
        tessedit_pageseg_mode: PSM.SPARSE_TEXT,
        preserve_interword_spaces: "1",
      });
      return worker;
    })();
  }
  return refineryWorkerPromise;
}

function hashBuffer(buffer: Buffer) {
  return createHash("sha1").update(buffer).digest("hex");
}

async function recognizeFast(buffer: Buffer) {
  const cacheKey = `mining:${hashBuffer(buffer)}`;
  const cached = ocrCache.get(cacheKey);
  if (cached && Date.now() - cached.at < OCR_CACHE_TTL_MS) {
    return { rawText: (cached.value as MiningOcrResult).rawText || "", fromCache: true, cacheKey };
  }

  const worker = await getMiningWorker();
  const result = await worker.recognize(buffer);
  const rawText = result.data?.text || "";
  return { rawText, fromCache: false, cacheKey };
}

async function preprocessRefineryImage(buffer: Buffer): Promise<Buffer> {
  try {
    const sharp = (await import("sharp")).default;
    const meta = await sharp(buffer).metadata();
    const w = meta.width ?? 1200;
    const targetW = Math.min(Math.round(w * 2), 2800);
    return await sharp(buffer)
      .resize({ width: targetW, withoutEnlargement: false })
      .greyscale()
      .normalize()
      .linear(1.12, -18)
      .png()
      .toBuffer();
  } catch {
    return buffer;
  }
}

function mergeOcrBlocks(...texts: string[]) {
  const lineSet = new Map<string, string>();
  for (const t of texts) {
    for (const raw of t.split(/\r?\n/)) {
      const line = raw.trim();
      if (line.length < 2) continue;
      const key = line.toUpperCase().replace(/\s+/g, " ").slice(0, 120);
      const prev = lineSet.get(key);
      if (!prev || line.length > prev.length) lineSet.set(key, line);
    }
  }
  return [...lineSet.values()].join("\n");
}

async function recognizeRefineryRaw(buffer: Buffer): Promise<string> {
  const pre = await preprocessRefineryImage(buffer);
  const w = await getRefineryWorker();
  await w.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT });
  const r1 = await w.recognize(pre);
  await w.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_BLOCK });
  const r2 = await w.recognize(pre);
  await w.setParameters({ tessedit_pageseg_mode: PSM.AUTO });
  const r3 = await w.recognize(pre);
  await w.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT });
  return mergeOcrBlocks(
    r1.data?.text || "",
    r2.data?.text || "",
    r3.data?.text || "",
  );
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

function methodLabelFromRegexMatch(m: RegExpMatchArray): string | null {
  const raw = m[0]?.trim();
  if (!raw) return null;
  const t = raw.replace(/\s+/g, " ");
  if (/^X/i.test(t) && /REACT/i.test(t)) return "XCR Reaction";
  if (/DINYX\s*SOLVENTECH/i.test(t)) return "Dinyx Solventech";
  if (/PYROLYTIC/i.test(t)) return "Pyrolytic";
  if (/ELECTROSTAR/i.test(t)) return "Electrostar";
  if (/FERRON/i.test(t)) return "Ferron";
  if (/ORKAN/i.test(t)) return "Orkan";
  if (/GENDROME/i.test(t)) return "Gendrome";
  return t.slice(0, 64);
}

/** Extra regels zodat locatie-match ARC-L2 + stationnaam vindt bij gebroken OCR. */
function augmentTextForLocationMatch(rawText: string): string {
  const parts = [rawText];
  const compact = normCompact(rawText);

  const lagrangeStation = rawText.match(
    /\b((?:ARC|HUR|MIC|CRU)\s*[-–]?\s*L\s*[1-5])\s+([A-Z][A-Za-z0-9\s]{3,52}?(?:Station|STATION))\b/im,
  );
  if (lagrangeStation) {
    parts.push(normCompact(lagrangeStation[0]!.replace(/\s+/g, " ")));
    parts.push(normCompact(`${lagrangeStation[1]} ${lagrangeStation[2]}`));
  }

  if (/\bLIVELY\s+PATHWAY\b/i.test(rawText)) {
    parts.push("ARCL2LIVELYPATHWAYSTATION");
    parts.push("LIVELYPATHWAYSTATION");
  }

  if (/ARCL2|ARCL\s*2|ARC\s*L\s*2/i.test(compact) || /\bARC\s*[-]?\s*L\s*2\b/i.test(rawText)) {
    parts.push("ARCL2LIVELYPATHWAYSTATION");
  }

  return parts.join("\n");
}

export function inferRefineryMethodFromText(rawText: string): string | null {
  const compact = rawText.replace(/\s+/g, "").toUpperCase();
  if (/XCR|X\.?C\.?R\.?/.test(compact) && /REACT/.test(compact)) return "XCR Reaction";

  const lower = rawText.toLowerCase();
  for (const hint of REFINERY_METHOD_HINTS) {
    if (lower.includes(hint.toLowerCase())) return hint;
  }
  for (const re of REFINERY_METHOD_REGEX) {
    const m = rawText.match(re);
    if (m) return methodLabelFromRegexMatch(m);
  }
  return null;
}

const LOCATION_STOPWORDS = new Set(
  ["STATION", "OUTPOST", "HARBOR", "HABOUR", "PORT", "LZ", "LANDING", "ZONE", "SPACEPORT"].map((s) =>
    normCompact(s),
  ),
);

function significantNameTokens(name: string) {
  const whole = normCompact(name);
  const parts = name
    .split(/[\s\-_/]+/)
    .map((w) => normCompact(w))
    .filter((w) => w.length >= 4 && !LOCATION_STOPWORDS.has(w));
  if (whole.length >= 5 && !LOCATION_STOPWORDS.has(whole)) {
    return [...parts, whole];
  }
  return parts;
}

export function inferLocationIdFromText(
  rawText: string,
  locations: LocationInferLite[],
): string | null {
  const augmented = augmentTextForLocationMatch(rawText);
  const text = normCompact(augmented);
  let best: { id: string; score: number } | null = null;

  for (const loc of locations) {
    const patterns = [
      normCompact(`${loc.bodyName}${loc.name}`),
      normCompact(loc.name),
      normCompact(loc.slug.replace(/-/g, " ")),
      normCompact(`${loc.bodyName}${loc.slug.replace(/-/g, "")}`),
      normCompact(`${loc.bodyName} ${loc.name}`),
    ];
    for (const p of patterns) {
      if (p.length < 4) continue;
      if (text.includes(p) && p.length >= (best?.score ?? 0)) {
        best = { id: loc.id, score: p.length };
      }
    }
  }
  if (best) return best.id;

  let bestToken: { id: string; score: number } | null = null;
  for (const loc of locations) {
    const tokens = [
      ...significantNameTokens(loc.name),
      ...significantNameTokens(loc.bodyName),
      ...significantNameTokens(loc.slug.replace(/-/g, " ")),
    ];
    const unique = [...new Set(tokens)];
    let hits = 0;
    for (const t of unique) {
      if (t.length >= 5 && text.includes(t)) hits++;
    }
    if (hits >= 2 && hits >= (bestToken?.score ?? 0)) {
      bestToken = { id: loc.id, score: hits };
    }
  }
  return bestToken?.id ?? null;
}

export async function extractEntriesFromBuffer(buffer: Buffer, resources: ResourceLite[]) {
  const { rawText, fromCache, cacheKey } = await recognizeFast(buffer);
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
  const cacheKey = `refineryV6:${hashBuffer(buffer)}`;

  const withInference = (
    base: Omit<RefineryOcrResult, "inferredMethod" | "inferredLocationId">,
  ): RefineryOcrResult => ({
    ...base,
    inferredMethod: inferRefineryMethodFromText(base.rawText),
    inferredLocationId:
      locations.length > 0 ? inferLocationIdFromText(base.rawText, locations) : null,
  });

  const cached = ocrCache.get(cacheKey);
  if (cached && Date.now() - cached.at < OCR_CACHE_TTL_MS) {
    const v = cached.value as RefineryOcrResult;
    return withInference({
      rawText: v.rawText,
      inputs: v.inputs,
      outputs: v.outputs,
      avgConfidence: v.avgConfidence,
    });
  }

  const rawText = await recognizeRefineryRaw(buffer);
  const table = parseRefineryQtyYieldRows(rawText, resources);

  let inputs: ParsedEntry[];
  let outputs: ParsedEntry[];

  if (table.inputs.length > 0 && table.outputs.length > 0) {
    inputs = table.inputs;
    outputs = table.outputs;
  } else {
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
    if (sectionInputs.length > 0 && sectionOutputs.length > 0) {
      inputs = sectionInputs;
      outputs = sectionOutputs;
    } else {
      ({ inputs, outputs } = splitEntriesMidpoint(orderedFull));
    }
  }

  const all = [...inputs, ...outputs];
  const avgConfidence = all.length
    ? all.reduce((sum, e) => sum + e.confidence, 0) / all.length
    : 0;

  const value = withInference({ rawText, inputs, outputs, avgConfidence });
  storeCachedResult(cacheKey, value);
  return value;
}
