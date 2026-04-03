import Link from "next/link";
import { loginAction } from "../actions";

export default function LoginPage() {
  return (
    <div className="sc-shell mx-auto max-w-md rounded-2xl p-6 sm:p-7">
      <p className="sc-title text-xs text-cyan-300/80">Access Terminal</p>
      <h1 className="mt-2 text-2xl font-semibold">Inloggen</h1>
      <form action={loginAction} className="mt-4 space-y-3">
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
            Wachtwoord
          </label>
          <input
            id="password"
            name="password"
            type="password"
            required
            className="sc-input px-3 py-2.5"
          />
        </div>
        <button type="submit" className="sc-btn-primary w-full px-4 py-2.5">
          Login
        </button>
      </form>
      <p className="sc-muted mt-3 text-sm">
        Nog geen account? <Link href="/register">Registreer hier</Link>.
      </p>
    </div>
  );
}
