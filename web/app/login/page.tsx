"use client";
import { useState } from "react";
import { signIn } from "next-auth/react";

// Mirrors the provider list in auth.ts. The dev sign-in only renders when the
// server was started with ALLOW_DEV_LOGIN=true outside production.
const DEV_LOGIN = process.env.NEXT_PUBLIC_ALLOW_DEV_LOGIN === "true";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleGoogle() {
    setLoading(true);
    setError(null);
    // Let NextAuth handle the redirect; on failure it returns to /login?error=
    await signIn("google", { callbackUrl: "/app" });
  }

  async function handleDevSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const result = await signIn("dev", { email, redirect: false });
    setLoading(false);
    if (result?.error) {
      setError("Access denied. Check your email is on the allowed list.");
    } else {
      window.location.href = "/app";
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-paper px-4">
      <div className="w-full max-w-sm rounded-xl border border-line bg-white p-8 shadow-softer">
        <h1 className="mb-1 font-display text-[26px] font-medium text-ink">
          ScribeAI
        </h1>
        <p className="mb-6 text-[13.5px] text-mute">
          Sign in to structure and search your notes.
        </p>

        <button
          onClick={() => void handleGoogle()}
          disabled={loading}
          className="flex w-full items-center justify-center gap-2.5 rounded-md border border-line bg-white px-3 py-2.5 text-[14px] font-medium text-ink transition-colors hover:bg-paper disabled:opacity-50"
        >
          <svg width="17" height="17" viewBox="0 0 18 18" aria-hidden="true">
            <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62Z" />
            <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.34A9 9 0 0 0 9 18Z" />
            <path fill="#FBBC05" d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.94H.96a9 9 0 0 0 0 8.12l3.01-2.34Z" />
            <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.46 3.44 1.35l2.58-2.58C13.46.9 11.43 0 9 0A9 9 0 0 0 .96 4.94l3.01 2.34C4.68 5.16 6.66 3.58 9 3.58Z" />
          </svg>
          {loading ? "Redirecting…" : "Continue with Google"}
        </button>

        {error && <p className="mt-4 text-[13px] text-coral">{error}</p>}

        {DEV_LOGIN && (
          <>
            <div className="my-5 flex items-center gap-3 text-[11px] uppercase tracking-wide text-mute">
              <span className="h-px flex-1 bg-line" />
              dev only
              <span className="h-px flex-1 bg-line" />
            </div>
            <form onSubmit={(e) => void handleDevSubmit(e)} className="space-y-3">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@clinic.com"
                required
                className="w-full rounded-md border border-line bg-paper px-3 py-2.5 text-[14px] text-ink outline-none focus:border-teal"
              />
              <button
                type="submit"
                disabled={loading || !email.trim()}
                className="btn-ghost w-full rounded-md border border-line py-2.5 text-[14px] font-medium text-ink disabled:opacity-50"
              >
                Sign in without Google
              </button>
            </form>
          </>
        )}

        <p className="mt-6 text-[12px] leading-relaxed text-mute">
          Beta. Use sample or de-identified notes only — no PHI.
        </p>
      </div>
    </div>
  );
}
