import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export default async function UniversePage() {
  await requireUser();
  const bodies = await prisma.celestialBody.findMany({
    include: {
      resources: { include: { resource: true } },
      locations: true,
    },
    orderBy: { name: "asc" },
  });

  return (
    <div className="space-y-4">
      <h1 className="sc-title text-xl font-bold sm:text-2xl">Universe resources</h1>
      {bodies.map((body) => (
        <article key={body.id} className="sc-card p-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold">{body.name}</h2>
              <p className="sc-muted text-sm">
                {body.system} - {body.type}
              </p>
            </div>
            <Link href={`/universe/${body.slug}`} className="sc-btn-secondary px-3 py-1">
              Details
            </Link>
          </div>
          <p className="sc-muted mt-2 text-sm">{body.description || "Geen beschrijving."}</p>
          <p className="mt-2 text-sm">
            Main resources:{" "}
            {body.resources
              .filter((r) => r.isMain)
              .map((r) => r.resource.name)
              .join(", ") || "n.v.t."}
          </p>
          <p className="sc-muted mt-1 text-sm">Locaties: {body.locations.length}</p>
        </article>
      ))}
    </div>
  );
}
