import { notFound } from "next/navigation";
import { createManualInventoryAction } from "@/app/actions";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type Props = {
  params: Promise<{ slug: string }>;
};

export default async function StationInventoryPage({ params }: Props) {
  const user = await requireUser();
  const { slug } = await params;

  const station = await prisma.location.findUnique({
    where: { slug },
  });
  if (!station) notFound();

  const [balances, mutations, resources] = await Promise.all([
    prisma.inventoryBalance.findMany({
      where: { userId: user.id, locationId: station.id },
      include: { resource: true },
      orderBy: { resource: { name: "asc" } },
    }),
    prisma.inventoryMutation.findMany({
      where: { userId: user.id, locationId: station.id },
      include: { resource: true },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
    prisma.resource.findMany({ orderBy: { name: "asc" } }),
  ]);

  return (
    <div className="space-y-6">
      <section className="sc-shell rounded-2xl p-5">
        <h1 className="text-2xl font-bold">{station.name}</h1>
        <p className="sc-muted text-sm">Type: {station.type}</p>
      </section>

      <section className="sc-card p-5">
        <h2 className="sc-title text-xs font-semibold text-cyan-200">Current voorraad</h2>
        <ul className="mt-3 grid gap-2 text-sm md:grid-cols-2">
          {balances.map((b) => (
            <li key={b.id} className="sc-card-strong rounded p-2">
              {b.resource.name}: {b.quantity.toFixed(2)} {b.resource.unit}
            </li>
          ))}
          {balances.length === 0 && <li className="sc-muted">Geen voorraad op dit station.</li>}
        </ul>
      </section>

      <section className="sc-card p-5">
        <h2 className="font-semibold">Handmatige correctie</h2>
        <form action={createManualInventoryAction} className="mt-3 grid gap-3 md:grid-cols-4">
          <input type="hidden" name="locationId" value={station.id} />
          <select name="resourceSlug" required className="sc-select px-3 py-2">
            <option value="">Selecteer resource</option>
            {resources.map((resource) => (
              <option key={resource.id} value={resource.slug}>
                {resource.name}
              </option>
            ))}
          </select>
          <input
            name="delta"
            type="number"
            step="0.01"
            required
            placeholder="+ of - hoeveelheid"
            className="sc-input px-3 py-2"
          />
          <input name="note" placeholder="Notitie" className="sc-input px-3 py-2" />
          <button type="submit" className="sc-btn-primary px-3 py-2">
            Opslaan
          </button>
        </form>
      </section>

      <section className="sc-card p-5">
        <h2 className="font-semibold">Mutatiegeschiedenis</h2>
        <ul className="mt-3 space-y-2 text-sm">
          {mutations.map((m) => (
            <li key={m.id} className="sc-card-strong rounded p-2">
              {new Date(m.createdAt).toLocaleString("nl-NL")} - {m.resource.name} -{" "}
              {m.delta > 0 ? "+" : ""}
              {m.delta.toFixed(2)} ({m.source}) {m.note ? `- ${m.note}` : ""}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
