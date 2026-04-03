import { importInventoryCsvAction } from "@/app/actions";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export default async function ImportInventoryPage() {
  await requireUser();
  const locations = await prisma.location.findMany({ orderBy: { name: "asc" } });

  return (
    <div className="sc-shell mx-auto max-w-2xl rounded-2xl p-5">
      <h1 className="sc-title text-xl font-bold sm:text-2xl">Inventory CSV import</h1>
      <p className="sc-muted mt-1 text-sm">
        CSV formaat: <code>resource_slug,delta,note</code>
      </p>
      <form action={importInventoryCsvAction} className="mt-4 space-y-3">
        <select name="locationId" required className="sc-select px-3 py-2">
          <option value="">Selecteer station</option>
          {locations.map((location) => (
            <option key={location.id} value={location.id}>
              {location.name}
            </option>
          ))}
        </select>
        <input name="csv" type="file" accept=".csv,text/csv" required className="sc-input px-3 py-2" />
        <button type="submit" className="sc-btn-primary px-4 py-2">
          Importeren
        </button>
      </form>
    </div>
  );
}
