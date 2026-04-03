export function parseResourceLines(value: string) {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [resourceSlug, qtyRaw] = line.split(":");
      return { resourceSlug: resourceSlug?.trim(), qty: Number(String(qtyRaw).replace(",", ".")) };
    })
    .filter(
      (item) =>
        Boolean(item.resourceSlug) && Number.isFinite(item.qty) && (item.qty as number) > 0,
    ) as { resourceSlug: string; qty: number }[];
}
