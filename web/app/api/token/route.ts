import { SignJWT } from "jose";
import { auth } from "@/auth";

// Short-lived so a leaked token is worth little; the browser transparently
// asks for another when this one expires.
const TTL_SECONDS = 900;

/**
 * Mints the bearer token the FastAPI backend accepts.
 *
 * This runs on the server, which is the only place that has both the signed-in
 * session and API_JWT_SECRET. The browser never sees the secret — it just
 * receives a token that says "this is who I am", signed by someone the API
 * trusts.
 */
export async function GET() {
  const session = await auth();
  const email = session?.user?.email?.toLowerCase().trim();

  if (!email) {
    return Response.json({ error: "Not signed in" }, { status: 401 });
  }

  const secret = process.env.API_JWT_SECRET;
  if (!secret) {
    console.error("API_JWT_SECRET is not set; cannot mint API tokens");
    return Response.json({ error: "Server misconfigured" }, { status: 500 });
  }

  const now = Math.floor(Date.now() / 1000);
  const token = await new SignJWT({ email })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(email)
    .setIssuedAt(now)
    .setExpirationTime(now + TTL_SECONDS)
    .sign(new TextEncoder().encode(secret));

  return Response.json(
    { token, expiresAt: (now + TTL_SECONDS) * 1000 },
    // Never let a token sit in a shared cache.
    { headers: { "Cache-Control": "no-store" } },
  );
}
