/**
 * Canonieke raffinagemethoden (Star Citizen UI). Gebruikt door seed + OCR + Discord-autocomplete.
 * Langere labels eerder in OCR — substring-match.
 */
export const REFINERY_METHOD_LABELS: readonly string[] = [
  "XCR Reaction",
  "Dinyx Solventech",
  "Pyrolytic",
  "Electrostar",
  "Ferron",
  "Orkan",
  "Excel",
  "Sakura",
  "Ranta",
  "Gendrome",
  "Solventech",
  "Dinyx",
  "XCR",
  "Pyro",
];

export function refineryMethodSlug(label: string) {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
