import { createRefineryJobAction } from "@/app/actions";
import { OcrRefineryAssistant } from "@/app/log/components/ocr-refinery-assistant";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const methods = [
  "Cormack Method",
  "Pyrometric Chromalysis",
  "Gaskin Process",
  "XCR Reaction",
  "Ferron Exchange",
  "Electrostarolysis",
  "Dinyx Solventation",
  "Thermonatic Deposition",
  "Kazen Winnowing",
];

export default async function NewRefineryJobPage() {
  await requireUser();
  const [locations, resources] = await Promise.all([
    prisma.location.findMany({ orderBy: { name: "asc" } }),
    prisma.resource.findMany({ orderBy: { name: "asc" } }),
  ]);

  return (
    <div className="sc-shell rounded-2xl p-5">
      <h1 className="sc-title text-xl font-bold sm:text-2xl">Nieuwe refinery job</h1>
      <p className="sc-muted mt-1 text-sm">
        Input/output-formaat: 1 regel per item, bijvoorbeeld `quantanium:20`
      </p>
      <form
        action={createRefineryJobAction}
        className="mt-4 space-y-3"
      >
        <div>
          <label className="mb-1 block text-sm font-medium sc-muted">Locatie</label>
          <select name="locationId" required className="sc-select px-3 py-2">
            <option value="">Selecteer locatie</option>
            {locations.map((location) => (
              <option key={location.id} value={location.id}>
                {location.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium sc-muted">Refinery methode</label>
          <select name="method" className="sc-select px-3 py-2">
            {methods.map((method) => (
              <option key={method} value={method}>
                {method}
              </option>
            ))}
          </select>
        </div>
        <OcrRefineryAssistant
          inputPlaceholder={resources.slice(0, 2).map((r) => `${r.slug}:10`).join("\n")}
          outputPlaceholder={resources.slice(2, 4).map((r) => `${r.slug}:8`).join("\n")}
        />
        <div className="grid gap-3 md:grid-cols-2">
          <input
            name="costAuec"
            type="number"
            placeholder="Kosten aUEC"
            className="sc-input px-3 py-2"
          />
          <input
            name="durationHours"
            type="number"
            step="0.1"
            placeholder="Duur uren"
            className="sc-input px-3 py-2"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium sc-muted">Notities</label>
          <textarea name="notes" rows={3} className="sc-textarea px-3 py-2" />
        </div>
        <button type="submit" className="sc-btn-primary px-4 py-2">
          Refinery job opslaan
        </button>
      </form>
    </div>
  );
}
