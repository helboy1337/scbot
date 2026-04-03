import Link from "next/link";
import { registerAction } from "../actions";

export default function RegisterPage() {
  return (
    <div className="sc-shell mx-auto max-w-md rounded-2xl p-6 sm:p-7">
      <p className="sc-title text-xs text-cyan-300/80">Pilot Registration</p>
      <h1 className="mt-2 text-2xl font-semibold">Registreren</h1>
      <form action={registerAction} className="mt-4 space-y-3">
        <div>
          <label htmlFor="email" className="mb-1 block text-sm font-medium sc-muted">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            className="sc-input px-3 py-2.5"
          />
        </div>
        <div>
          <label htmlFor="password" className="mb-1 block text-sm font-medium sc-muted">
            Wachtwoord (min. 8)
          </label>
          <input
            id="password"
            name="password"
            type="password"
            minLength={8}
            required
            className="sc-input px-3 py-2.5"
          />
        </div>
        <div>
          <label htmlFor="scHandle" className="mb-1 block text-sm font-medium sc-muted">
            SC handle (optioneel)
          </label>
          <input id="scHandle" name="scHandle" className="sc-input px-3 py-2.5" />
        </div>
        <button type="submit" className="sc-btn-primary w-full px-4 py-2.5">
          Account maken
        </button>
      </form>
      <p className="sc-muted mt-3 text-sm">
        Al een account? <Link href="/login">Log hier in</Link>.
      </p>
    </div>
  );
}
