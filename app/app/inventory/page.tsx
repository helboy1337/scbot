import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export default async function InventoryPage() {
  const user = await requireUser();
  const grouped = await prisma.inventoryBalance.findMany({
    where: { userId: user.id },
    include: { location: true, resource: true },
    orderBy: [{ location: { name: "asc" } }, { resource: { name: "asc" } }],
  });

  const byStation = grouped.reduce<Record<string, typeof grouped>>((acc, row) => {
    (acc[row.location.slug] ||= []).push(row);
    return acc;
  }, {});

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="sc-title text-xl font-bold sm:text-2xl">Persoonlijke inventory</h1>
        <div className="flex gap-2">
          <Link href="/inventory/import" className="sc-btn-secondary px-3 py-1 text-sm">
            CSV import
          </Link>
          <Link href="/inventory/export" className="sc-btn-secondary px-3 py-1 text-sm">
            CSV export
          </Link>
        </div>
      </div>
      {Object.entries(byStation).map(([slug, rows]) => (
        <article key={slug} className="sc-card p-5">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-lg font-semibold">{rows[0].location.name}</h2>
            <Link href={`/inventory/${slug}`} className="sc-btn-secondary px-3 py-1 text-sm">
              Open station
            </Link>
          </div>
          <ul className="grid gap-2 text-sm md:grid-cols-2">
            {rows.map((row) => (
              <li key={row.id} className="sc-card-strong rounded p-2">
                {row.resource.name}: {row.quantity.toFixed(2)} {row.resource.unit}
              </li>
            ))}
          </ul>
        </article>
      ))}
      {grouped.length === 0 && (
        <p className="sc-card sc-muted p-4">
          Nog geen inventory. Voeg een mining/refinery log toe.
        </p>
      )}
    </div>
  );
}
