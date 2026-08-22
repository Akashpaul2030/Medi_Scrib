"use client";

import { useEffect, useState } from "react";
import { API_URL } from "@/lib/api";

// Paddle.js is loaded from their CDN at runtime rather than bundled, because
// Paddle require the live script for PCI scope — a pinned copy is not supported.
declare global {
  interface Window {
    Paddle?: {
      Environment: { set: (env: string) => void };
      Initialize: (opts: { token: string }) => void;
      Checkout: {
        open: (opts: {
          transactionId?: string;
          settings?: { successUrl?: string; theme?: string };
        }) => void;
      };
    };
  }
}

function loadPaddleScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.Paddle) return resolve();
    const existing = document.querySelector<HTMLScriptElement>("script[data-paddle]");
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("Paddle.js failed to load")));
      return;
    }
    const script = document.createElement("script");
    script.src = "https://cdn.paddle.com/paddle/v2/paddle.js";
    script.async = true;
    script.dataset.paddle = "true";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Paddle.js failed to load"));
    document.head.appendChild(script);
  });
}

/**
 * Paddle sends the buyer here with `?_ptxn=<transaction id>` after the API
 * creates a transaction. This page's only job is to open the payment overlay
 * for that transaction.
 *
 * Credits and subscriptions are granted by the webhook, never here — a browser
 * that closes early must not be able to change what someone was given.
 */
export default function CheckoutPage() {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const params = new URLSearchParams(window.location.search);
        const transactionId = params.get("_ptxn");
        if (!transactionId) {
          setError("No checkout in progress.");
          return;
        }

        const cfg = (await fetch(`${API_URL}/billing/config`).then((r) => r.json())) as {
          enabled: boolean;
          client_token: string;
          environment: string;
        };
        if (cancelled) return;
        if (!cfg.enabled || !cfg.client_token) {
          setError("Payments are not switched on yet.");
          return;
        }

        await loadPaddleScript();
        if (cancelled || !window.Paddle) return;

        if (cfg.environment === "sandbox") {
          window.Paddle.Environment.set("sandbox");
        }
        window.Paddle.Initialize({ token: cfg.client_token });
        window.Paddle.Checkout.open({
          transactionId,
          settings: { successUrl: `${window.location.origin}/app?billing=success` },
        });
      } catch (e: unknown) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Could not start checkout.");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center bg-paper px-4">
      <div className="w-full max-w-sm rounded-xl border border-line bg-white p-8 text-center shadow-softer">
        <h1 className="mb-2 font-display text-[22px] font-medium text-ink">
          {error ? "Checkout unavailable" : "Opening secure checkout…"}
        </h1>
        <p className="text-[13.5px] text-mute">
          {error ?? "Paddle handles the payment. This only takes a moment."}
        </p>
        <a
          href="/app"
          className="mt-6 inline-block text-[13px] font-medium text-teal hover:underline"
        >
          Back to the app
        </a>
      </div>
    </div>
  );
}
