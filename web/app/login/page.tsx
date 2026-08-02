"use client";
import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Logo } from "@/components/logo";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const result = await signIn("credentials", { email, redirect: false });
    setLoading(false);
    if (result?.error) {
      setError("Access denied. Check your email is on the allowed list.");
    } else {
      router.push("/app");
    }
  }

  return (
    <div className="bg-hairline relative flex min-h-screen items-center justify-center bg-paper px-6">
      <div className="w-full max-w-sm">
        <a href="/" className="mb-8 flex justify-center" aria-label="ScribeAI home">
          <Logo size={26} />
        </a>
        <div className="rounded-xl border border-line bg-white p-8 shadow-card">
          <h1 className="mb-1 font-display text-[22px] font-medium text-ink">
            Sign in
          </h1>
          <p className="mb-6 text-[13.5px] text-mute">
            Enter your email to access your notes.
          </p>
          <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
            <div>
              <label htmlFor="email" className="mb-1.5 block text-[12px] font-semibold uppercase tracking-wide text-mute">
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@clinic.com"
                required
                autoFocus
                className="w-full rounded-md border border-line bg-paper px-3 py-2.5 text-[14px] text-ink outline-none transition-colors focus:border-teal"
              />
            </div>
            {error && (
              <p className="rounded-md border border-coral/40 bg-coral/5 px-3 py-2 text-[13px] text-coral">
                {error}
              </p>
            )}
            <button
              type="submit"
              disabled={loading || !email.trim()}
              className="btn-primary flex w-full items-center justify-center gap-2 rounded-md py-2.5 text-[14px] font-medium shadow-card disabled:opacity-50"
            >
              {loading ? (
                <>
                  <Spinner /> Signing in…
                </>
              ) : (
                "Sign in"
              )}
            </button>
          </form>
        </div>
        <p className="mt-6 text-center text-[12.5px] text-mute">
          No account yet? Signing in creates one automatically.
        </p>
      </div>
    </div>
  );
}

function Spinner() {
  return (
    <span
      className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white"
      aria-hidden="true"
    />
  );
}
