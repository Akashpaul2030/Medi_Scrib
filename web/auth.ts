import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";

// If ALLOWED_EMAILS is set, only listed emails can sign in.
// If empty, anyone with a Google account can.
const ALLOWED = (process.env.ALLOWED_EMAILS ?? "")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

// The old any-email-is-fine login is a development convenience only. It is
// gated behind an explicit flag AND a non-production build, so a deploy that
// forgets to unset the flag still refuses to enable it.
const DEV_LOGIN =
  process.env.ALLOW_DEV_LOGIN === "true" && process.env.NODE_ENV !== "production";

const providers = [];

if (process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET) {
  providers.push(
    Google({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
    }),
  );
}

if (DEV_LOGIN) {
  providers.push(
    Credentials({
      id: "dev",
      name: "Development sign-in",
      credentials: { email: { label: "Email", type: "email" } },
      async authorize(credentials) {
        const email = String(credentials?.email ?? "").toLowerCase().trim();
        if (!email) return null;
        return { id: email, email, name: email };
      },
    }),
  );
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers,
  session: { strategy: "jwt" },
  callbacks: {
    // Runs for every provider. Google has already proved the address belongs
    // to the person; this only applies the allow-list on top.
    signIn({ user }) {
      const email = (user?.email ?? "").toLowerCase().trim();
      if (!email) return false;
      if (ALLOWED.length > 0 && !ALLOWED.includes(email)) return false;
      return true;
    },
    jwt({ token, user }) {
      // Identity is the email, not the provider's opaque id, because that is
      // what the API and Stripe both key on.
      if (user?.email) token.sub = user.email.toLowerCase().trim();
      return token;
    },
    session({ session, token }) {
      if (token.sub) session.user.id = token.sub;
      return session;
    },
  },
  pages: { signIn: "/login" },
});
