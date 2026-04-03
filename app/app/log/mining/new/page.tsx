import { createMiningRunAction } from "@/app/actions";
import { OcrMiningAssistant } from "@/app/log/components/ocr-mining-assistant";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export default async function NewMiningRunPage() {
  await requireUser();
  const [locations, resources] = await Promise.all([
    prisma.location.findMany({ orderBy: { name: "asc" } }),
    prisma.resource.findMany({ orderBy: { name: "asc" } }),
  ]);

  return (
    <div className="sc-shell rounded-2xl p-5">
      <h1 className="sc-title text-xl font-bold sm:text-2xl">Nieuwe mining run</h1>
      <p className="sc-muted mt-1 text-sm">
        Entries-formaat: 1 regel per item, bijvoorbeeld `quantanium:32.5`
      </p>
      <form action={createMiningRunAction} className="mt-4 space-y-3">
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
          <label className="mb-1 block text-sm font-medium sc-muted">Schip / vehicle</label>
          <input name="shipVehicle" className="sc-input px-3 py-2" />
        </div>
        <OcrMiningAssistant placeholder={resources.slice(0, 4).map((r) => `${r.slug}:10`).join("\n")} />
        <div>
          <label className="mb-1 block text-sm font-medium sc-muted">Notities</label>
          <textarea name="notes" rows={3} className="sc-textarea px-3 py-2" />
        </div>
        <button type="submit" className="sc-btn-primary px-4 py-2">
          Mining run opslaan
        </button>
      </form>
    </div>
  );
}
