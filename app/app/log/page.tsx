import Link from "next/link";
import { requireUser } from "@/lib/auth";

export default async function LogIndexPage() {
  await requireUser();
  return (
    <div className="space-y-4">
      <h1 className="sc-title text-xl font-bold sm:text-2xl">Logs</h1>
      <div className="grid gap-4 md:grid-cols-2">
        <Link href="/log/mining/new" className="sc-card p-5">
          <h2 className="font-semibold">Mining run invoeren</h2>
          <p className="sc-muted mt-1 text-sm">Voeg resources en screenshot toe.</p>
        </Link>
        <Link href="/log/refinery/new" className="sc-card p-5">
          <h2 className="font-semibold">Refinery job invoeren</h2>
          <p className="sc-muted mt-1 text-sm">Input/output + methode + screenshot.</p>
        </Link>
      </div>
    </div>
  );
}
