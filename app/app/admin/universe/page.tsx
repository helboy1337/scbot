import {
  createBodyAction,
  createLocationAction,
  createResourceAction,
} from "@/app/actions";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export default async function AdminUniversePage() {
  await requireUser();
  const bodies = await prisma.celestialBody.findMany({
    orderBy: { name: "asc" },
    include: { locations: true, resources: { include: { resource: true } } },
  });

  return (
    <div className="space-y-6">
      <h1 className="sc-title text-xl font-bold sm:text-2xl">Admin universe data</h1>

      <section className="sc-card p-5">
        <h2 className="font-semibold">Nieuwe body</h2>
        <form action={createBodyAction} className="mt-3 grid gap-3 md:grid-cols-4">
          <input name="name" placeholder="Naam" required className="sc-input px-3 py-2" />
          <input
            name="system"
            defaultValue="Stanton"
            placeholder="System"
            className="sc-input px-3 py-2"
          />
          <select name="type" className="sc-select px-3 py-2">
            <option value="PLANET">PLANET</option>
            <option value="MOON">MOON</option>
          </select>
          <button type="submit" className="sc-btn-primary px-3 py-2">
            Opslaan
          </button>
        </form>
      </section>

      <section className="sc-card p-5">
        <h2 className="font-semibold">Nieuwe locatie</h2>
        <form action={createLocationAction} className="mt-3 grid gap-3 md:grid-cols-4">
          <select name="bodyId" className="sc-select px-3 py-2" required>
            <option value="">Selecteer body</option>
            {bodies.map((body) => (
              <option key={body.id} value={body.id}>
                {body.name}
              </option>
            ))}
          </select>
          <input name="name" placeholder="Locatienaam" required className="sc-input px-3 py-2" />
          <select name="type" className="sc-select px-3 py-2">
            <option value="STATION">STATION</option>
            <option value="LANDING_ZONE">LANDING_ZONE</option>
            <option value="OUTPOST">OUTPOST</option>
          </select>
          <button type="submit" className="sc-btn-primary px-3 py-2">
            Opslaan
          </button>
        </form>
      </section>

      <section className="sc-card p-5">
        <h2 className="font-semibold">Nieuwe resource-koppeling</h2>
        <form action={createResourceAction} className="mt-3 grid gap-3 md:grid-cols-5">
          <select name="bodyId" className="sc-select px-3 py-2" required>
            <option value="">Selecteer body</option>
            {bodies.map((body) => (
              <option key={body.id} value={body.id}>
                {body.name}
              </option>
            ))}
          </select>
          <input name="name" placeholder="Resource naam" required className="sc-input px-3 py-2" />
          <input name="category" placeholder="Categorie" defaultValue="Ore" className="sc-input px-3 py-2" />
          <label className="sc-input flex items-center gap-2 px-3 py-2">
            <input name="isMain" type="checkbox" /> Main
          </label>
          <button type="submit" className="sc-btn-primary px-3 py-2">
            Opslaan
          </button>
        </form>
      </section>

      <section className="sc-card p-5">
        <h2 className="font-semibold">Huidige data</h2>
        <div className="mt-3 space-y-4">
          {bodies.map((body) => (
            <article key={body.id} className="sc-card-strong rounded p-3 text-sm">
              <h3 className="font-medium">{body.name}</h3>
              <p className="sc-muted">Locaties: {body.locations.map((l) => l.name).join(", ") || "-"}</p>
              <p className="sc-muted">
                Resources:{" "}
                {body.resources
                  .map((r) => `${r.resource.name}${r.isMain ? " (main)" : ""}`)
                  .join(", ") || "-"}
              </p>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
