import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type Props = {
  params: Promise<{ slug: string }>;
};

export default async function BodyDetailPage({ params }: Props) {
  await requireUser();
  const { slug } = await params;
  const body = await prisma.celestialBody.findUnique({
    where: { slug },
    include: {
      resources: { include: { resource: true }, orderBy: { resource: { name: "asc" } } },
      locations: { orderBy: { name: "asc" } },
    },
  });

  if (!body) notFound();

  return (
    <div className="sc-shell space-y-4 rounded-2xl p-5">
      <h1 className="text-2xl font-bold">{body.name}</h1>
      <p className="sc-muted">
        {body.system} - {body.type}
      </p>
      <p className="sc-muted">{body.description || "Geen beschrijving beschikbaar."}</p>

      <section>
        <h2 className="font-semibold">Resources</h2>
        <ul className="mt-2 space-y-2">
          {body.resources.map((entry) => (
            <li key={entry.id} className="sc-card-strong rounded p-2 text-sm">
              {entry.resource.name} ({entry.resource.category}) {entry.isMain ? "- Main" : ""}
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="font-semibold">Locaties</h2>
        <ul className="mt-2 space-y-2">
          {body.locations.map((loc) => (
            <li key={loc.id} className="sc-card-strong rounded p-2 text-sm">
              {loc.name} - {loc.type}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
