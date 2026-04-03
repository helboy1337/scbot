import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";

export async function Nav() {
  const user = await getCurrentUser();

  return (
    <header className="sticky top-0 z-40 border-b border-slate-700/60 bg-slate-950/70 backdrop-blur">
      <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-3 px-3 py-3 sm:px-6">
        <Link href={user ? "/dashboard" : "/"} className="sc-title text-sm font-semibold sm:text-base">
          Star Citizen Mining Hub
        </Link>
        <nav className="flex max-w-full items-center gap-2 overflow-x-auto text-xs sm:text-sm">
          {user ? (
            <>
              <Link href="/dashboard" className="sc-btn-secondary px-3 py-1.5 whitespace-nowrap">
                Dashboard
              </Link>
              <Link href="/universe" className="sc-btn-secondary px-3 py-1.5 whitespace-nowrap">
                Universe
              </Link>
              <Link href="/inventory" className="sc-btn-secondary px-3 py-1.5 whitespace-nowrap">
                Inventory
              </Link>
              <Link href="/crew" className="sc-btn-secondary px-3 py-1.5 whitespace-nowrap">
                Crew
              </Link>
              <Link href="/log/mining/new" className="sc-btn-secondary px-3 py-1.5 whitespace-nowrap">
                Mining
              </Link>
              <Link href="/log/refinery/new" className="sc-btn-secondary px-3 py-1.5 whitespace-nowrap">
                Refinery
              </Link>
              <Link href="/admin/universe" className="sc-btn-secondary px-3 py-1.5 whitespace-nowrap">
                Admin
              </Link>
              <form action="/logout" method="post">
                <button type="submit" className="sc-btn-primary px-3 py-1.5 whitespace-nowrap">
                  Logout
                </button>
              </form>
            </>
          ) : (
            <>
              <Link href="/login" className="sc-btn-secondary px-3 py-1.5">
                Login
              </Link>
              <Link href="/register" className="sc-btn-primary px-3 py-1.5">
                Register
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
