const UEX_BASE = "https://api.uexcorp.space/2.0";

export type UexCommodityPriceRow = {
  price_sell: number;
  price_sell_avg: number;
  scu_sell: number;
  scu_sell_avg: number;
  scu_sell_stock: number;
  status_sell: number | null;
  commodity_name: string;
  commodity_slug: string;
  star_system_name: string | null;
  planet_name: string | null;
  orbit_name: string | null;
  moon_name: string | null;
  space_station_name: string | null;
  city_name: string | null;
  outpost_name: string | null;
  terminal_name: string;
  terminal_code: string;
  terminal_slug: string;
  /** UEX: accepted cargo grid sizes in SCU, e.g. `"1,2,4,8,16,24,32"`. */
  container_sizes?: string | null;
  game_version: string | null;
};

type UexApiListResponse<T> = { status: string; data: T; message?: string };

function locationParts(row: UexCommodityPriceRow): string[] {
  const parts: string[] = [];
  if (row.star_system_name) parts.push(row.star_system_name);
  if (row.space_station_name) parts.push(row.space_station_name);
  else if (row.city_name) {
    if (row.planet_name) parts.push(`${row.planet_name} — ${row.city_name}`);
    else parts.push(row.city_name);
  } else if (row.outpost_name) parts.push(row.outpost_name);
  else if (row.moon_name) parts.push(row.moon_name);
  else if (row.planet_name) parts.push(row.planet_name);
  if (row.orbit_name && !row.space_station_name && !row.city_name) parts.push(`(${row.orbit_name})`);
  return parts.filter(Boolean);
}

export function formatUexTradeLocation(row: UexCommodityPriceRow): string {
  const loc = locationParts(row).join(" · ");
  return loc ? `${loc} — ${row.terminal_name}` : row.terminal_name;
}

/**
 * UEX `status_sell`: how full the terminal’s **buy** side is. **Lower code = better for you:**
 * they have more room to take your cargo and want to fill stock — that is strong demand from your perspective.
 * Higher codes = less room / weaker demand — harder to sell your full load.
 */
export function sellStatusForSeller(code: number | null): string {
  if (code == null || code === 0) return "unknown";
  const t: Record<number, string> = {
    1: "Best — lots of room to sell; terminal wants stock (strong demand)",
    2: "Very good — high buy capacity",
    3: "Good — solid room for your sales",
    4: "Fair — terminal is filling up",
    5: "Limited — less room; harder to offload volume",
    6: "Poor — very little room left",
    7: "No demand — worst for selling (buy side full)",
  };
  return t[code] ?? `status ${code}`;
}

export function uexCommoditySlugCandidates(dbSlug: string): string[] {
  const s = dbSlug.trim().toLowerCase();
  const out: string[] = [s];
  if (s.endsWith("-ore")) out.push(s.replace(/-ore$/, ""));
  return [...new Set(out)];
}

async function fetchPricesForSlug(commoditySlug: string): Promise<UexCommodityPriceRow[]> {
  const url = `${UEX_BASE}/commodities_prices?commodity_slug=${encodeURIComponent(commoditySlug)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`UEX commodities_prices: ${res.status}`);
  const json = (await res.json()) as UexApiListResponse<UexCommodityPriceRow[]>;
  if (json.status !== "ok" || !Array.isArray(json.data)) {
    throw new Error(json.message || "UEX commodities_prices: onverwacht antwoord");
  }
  return json.data;
}

export async function fetchCommodityPricesByDbSlug(dbSlug: string): Promise<UexCommodityPriceRow[]> {
  const candidates = uexCommoditySlugCandidates(dbSlug);
  for (const slug of candidates) {
    const rows = await fetchPricesForSlug(slug);
    if (rows.length > 0) return rows;
  }
  return [];
}

export async function fetchCommodityPricesByCommodityName(name: string): Promise<UexCommodityPriceRow[]> {
  const url = `${UEX_BASE}/commodities_prices?commodity_name=${encodeURIComponent(name.trim())}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`UEX commodities_prices: ${res.status}`);
  const json = (await res.json()) as UexApiListResponse<UexCommodityPriceRow[]>;
  if (json.status !== "ok" || !Array.isArray(json.data)) {
    throw new Error(json.message || "UEX commodities_prices: unexpected response");
  }
  return json.data;
}

type UexCatalogCommodity = {
  id: number;
  name: string;
  code: string;
};

let commoditiesCatalogCache: { at: number; list: UexCatalogCommodity[] } | null = null;
const COMMODITIES_CATALOG_TTL_MS = 3_600_000;

async function fetchUexCommoditiesCatalog(): Promise<UexCatalogCommodity[]> {
  if (
    commoditiesCatalogCache &&
    Date.now() - commoditiesCatalogCache.at < COMMODITIES_CATALOG_TTL_MS
  ) {
    return commoditiesCatalogCache.list;
  }
  const res = await fetch(`${UEX_BASE}/commodities`);
  if (!res.ok) throw new Error(`UEX commodities: ${res.status}`);
  const json = (await res.json()) as UexApiListResponse<UexCatalogCommodity[]>;
  if (json.status !== "ok" || !Array.isArray(json.data)) {
    throw new Error(json.message || "UEX commodities: unexpected response");
  }
  commoditiesCatalogCache = { at: Date.now(), list: json.data };
  return json.data;
}

function scoreCatalogMatch(query: string, c: UexCatalogCommodity): number {
  const ql = query.trim().toLowerCase();
  if (ql.length < 2) return 0;
  const nameL = c.name.toLowerCase();
  const codeL = c.code.toLowerCase();
  if (nameL === ql) return 100;
  if (codeL === ql) return 98;
  if (nameL.startsWith(ql)) return 85;
  if (codeL.startsWith(ql)) return 83;
  if (nameL.includes(ql)) return 70;
  return 0;
}

/**
 * Live UEX lookup: `commodities_prices?commodity_name=` first, then fuzzy match on `/commodities` + prices by exact commodity name.
 */
export async function resolveUexCommodityForTrade(query: string): Promise<{
  rows: UexCommodityPriceRow[];
  displayName: string;
  slug: string;
  matchKind: "name_query" | "catalog";
} | null> {
  const q = query.trim();
  if (!q) return null;

  let rows = await fetchCommodityPricesByCommodityName(q);
  if (rows.length > 0) {
    const r0 = rows[0]!;
    return {
      rows,
      displayName: r0.commodity_name,
      slug: r0.commodity_slug,
      matchKind: "name_query",
    };
  }

  const catalog = await fetchUexCommoditiesCatalog();
  let best: UexCatalogCommodity | null = null;
  let bestScore = 0;
  for (const c of catalog) {
    const s = scoreCatalogMatch(q, c);
    if (s > bestScore) {
      bestScore = s;
      best = c;
    }
  }
  if (!best || bestScore < 70) return null;

  rows = await fetchCommodityPricesByCommodityName(best.name);
  if (!rows.length) return null;
  const r0 = rows[0]!;
  return {
    rows,
    displayName: r0.commodity_name,
    slug: r0.commodity_slug,
    matchKind: "catalog",
  };
}

/** UEX commodity info page (slug from API). */
export function uexCommodityPageUrl(slug: string): string {
  return `https://uexcorp.space/commodities/info/name/${encodeURIComponent(slug)}/`;
}

/** Parse UEX `container_sizes` (comma- or pipe-separated SCU grid sizes). */
export function parseContainerSizesScu(raw: string | null | undefined): number[] | null {
  if (raw == null || String(raw).trim() === "") return null;
  const nums = String(raw)
    .split(/[,|]/)
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n) && n > 0);
  return nums.length ? [...new Set(nums)].sort((a, b) => a - b) : null;
}

/** True if UEX lists this box size; missing data → true (don’t hide unknown terminals). */
export function terminalAcceptsCargoBoxSize(row: UexCommodityPriceRow, maxBoxScu: number): boolean {
  const sizes = parseContainerSizesScu(row.container_sizes);
  if (sizes == null) return true;
  return sizes.includes(maxBoxScu);
}

export type SellSortOptions = {
  userScu: number;
  /** Only status 1–4 when true. */
  alleenRuimeVraag: boolean;
  /** Largest SCU grid box you use; must appear in UEX `container_sizes` when present. */
  maxCargoBoxScu: number | null;
};

export type RankedSellRow = UexCommodityPriceRow & {
  estGrossAuec: number;
  demandNote: string | null;
};

export function rankSellOpportunities(
  rows: UexCommodityPriceRow[],
  opts: SellSortOptions,
): RankedSellRow[] {
  const filtered = rows.filter((r) => {
    if (!r.price_sell || r.price_sell <= 0) return false;
    const st = r.status_sell;
    if (st == null || st === 0) return true;
    if (st >= 7) return false;
    if (opts.alleenRuimeVraag && st > 4) return false;
    if (
      opts.maxCargoBoxScu != null &&
      !terminalAcceptsCargoBoxSize(r, opts.maxCargoBoxScu)
    ) {
      return false;
    }
    return true;
  });

  const userScu = opts.userScu;
  const ranked: RankedSellRow[] = filtered.map((r) => {
    let demandNote: string | null = null;
    const avgDem = r.scu_sell_avg;
    if (avgDem > 0 && userScu > avgDem) {
      demandNote = `reported demand ~${Math.round(avgDem)} SCU is below your ${userScu} SCU`;
    } else if (avgDem > 0 && userScu > avgDem * 0.85) {
      demandNote = `tight demand (~${Math.round(avgDem)} SCU reported)`;
    }
    return {
      ...r,
      estGrossAuec: Math.round(r.price_sell * userScu),
      demandNote,
    };
  });

  ranked.sort((a, b) => {
    const pd = b.price_sell - a.price_sell;
    if (Math.abs(pd) > 0.01) return pd;
    const sa = a.status_sell ?? 99;
    const sb = b.status_sell ?? 99;
    if (sa !== sb) return sa - sb;
    const da = a.scu_sell_avg || 0;
    const db = b.scu_sell_avg || 0;
    return db - da;
  });

  return ranked;
}

