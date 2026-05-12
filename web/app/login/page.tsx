"use client";
import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";

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
    <div className="flex min-h-screen items-center justify-center bg-paper">
      <div className="w-full max-w-sm rounded-xl border border-line bg-white p-8 shadow-softer">
        <h1 className="mb-1 font-display text-[26px] font-medium text-ink">
          ScribeAI
        </h1>
        <p className="mb-6 text-[13.5px] text-mute">
          Enter your email to sign in.
        </p>
        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@clinic.com"
            required
            autoFocus
            className="w-full rounded-md border border-line bg-paper px-3 py-2.5 text-[14px] text-ink outline-none focus:border-teal"
          />
          {error && (
            <p className="text-[13px] text-coral">{error}</p>
          )}
          <button
            type="submit"
            disabled={loading || !email.trim()}
            className="btn-primary w-full rounded-md py-2.5 text-[14px] font-medium disabled:opacity-50"
          >
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
