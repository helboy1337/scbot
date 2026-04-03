import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function Home() {
  const user = await getCurrentUser();
  if (user) redirect("/dashboard");
  return (
    <div className="grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
      <section className="sc-shell rounded-2xl p-6 sm:p-10">
        <p className="sc-title text-xs text-cyan-300/90">Industrial Operations Console</p>
        <h1 className="mt-3 text-3xl font-bold leading-tight sm:text-5xl">
          Star Citizen Mining & Refinery Hub
        </h1>
        <p className="sc-muted mt-4 max-w-2xl text-sm sm:text-base">
          Een snelle, moderne cockpit voor je mining-runs, refinery-jobs en persoonlijke
          inventory per station. Geoptimaliseerd voor desktop en mobiel.
        </p>
        <div className="mt-7 flex flex-wrap gap-3">
          <Link href="/register" className="sc-btn-primary px-5 py-2.5">
            Start gratis
          </Link>
          <Link href="/login" className="sc-btn-secondary px-5 py-2.5">
            Inloggen
          </Link>
        </div>
      </section>
      <aside className="sc-card p-6">
        <h2 className="sc-title text-sm font-semibold text-cyan-200">Features</h2>
        <ul className="mt-4 space-y-3 text-sm">
          <li className="sc-muted">Realtime overzicht van inventory per station</li>
          <li className="sc-muted">Logging met screenshot bewijs</li>
          <li className="sc-muted">Refinery methodes + output tracking</li>
          <li className="sc-muted">Crew samenwerking en CSV import/export</li>
        </ul>
      </aside>
    </div>
  );
}
