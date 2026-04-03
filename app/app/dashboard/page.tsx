import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export default async function DashboardPage() {
  const user = await requireUser();

  const [recentRuns, recentJobs, stations] = await Promise.all([
    prisma.miningRun.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 5,
      include: { location: true, items: { include: { resource: true } } },
    }),
    prisma.refineryJob.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 5,
      include: { location: true, outputs: { include: { resource: true } } },
    }),
    prisma.inventoryBalance.findMany({
      where: { userId: user.id },
      include: { location: true, resource: true },
      orderBy: [{ location: { name: "asc" } }, { resource: { name: "asc" } }],
      take: 12,
    }),
  ]);

  return (
    <div className="space-y-6">
      <section className="sc-shell rounded-2xl p-5 sm:p-7">
        <p className="sc-title text-xs text-cyan-300/80">Pilot Dashboard</p>
        <h1 className="mt-2 text-2xl font-bold sm:text-3xl">Welkom, {user.scHandle || user.email}</h1>
        <p className="sc-muted mt-2">
          Gebruik de snelle acties om mining/refinery logs toe te voegen en je inventory bij
          te houden.
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          <Link href="/log/mining/new" className="sc-btn-primary px-3 py-2">
            Nieuwe mining run
          </Link>
          <Link href="/log/refinery/new" className="sc-btn-secondary px-3 py-2">
            Nieuwe refinery job
          </Link>
          <Link href="/inventory" className="sc-btn-secondary px-3 py-2">
            Naar inventory
          </Link>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <div className="sc-card p-5">
          <h2 className="sc-title text-xs font-semibold text-cyan-200">Recente mining runs</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {recentRuns.map((run) => (
              <li key={run.id} className="sc-card-strong rounded-lg p-2.5">
                <p className="font-medium">{run.location.name}</p>
                <p className="sc-muted">
                  {run.items.map((item) => `${item.resource.name}: ${item.quantity}`).join(", ")}
                </p>
              </li>
            ))}
            {recentRuns.length === 0 && <li className="sc-muted">Nog geen runs gelogd.</li>}
          </ul>
        </div>
        <div className="sc-card p-5">
          <h2 className="sc-title text-xs font-semibold text-cyan-200">Recente refinery jobs</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {recentJobs.map((job) => (
              <li key={job.id} className="sc-card-strong rounded-lg p-2.5">
                <p className="font-medium">
                  {job.location.name} - {job.method}
                </p>
                <p className="sc-muted">
                  Output:{" "}
                  {job.outputs.map((out) => `${out.resource.name}: ${out.quantity}`).join(", ")}
                </p>
              </li>
            ))}
            {recentJobs.length === 0 && <li className="sc-muted">Nog geen jobs gelogd.</li>}
          </ul>
        </div>
      </section>

      <section className="sc-card p-5">
        <h2 className="sc-title text-xs font-semibold text-cyan-200">Inventory highlights</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[520px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-700/70">
                <th className="p-2 sc-muted">Station</th>
                <th className="p-2 sc-muted">Resource</th>
                <th className="p-2 sc-muted">Hoeveelheid</th>
              </tr>
            </thead>
            <tbody>
              {stations.map((row) => (
                <tr key={row.id} className="border-b border-slate-800/80">
                  <td className="p-2">{row.location.name}</td>
                  <td className="p-2">{row.resource.name}</td>
                  <td className="p-2">{row.quantity.toFixed(2)}</td>
                </tr>
              ))}
              {stations.length === 0 && (
                <tr>
                  <td className="sc-muted p-2" colSpan={3}>
                    Nog geen inventory data.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
