import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";

// If ALLOWED_EMAILS is set, only listed emails can sign in.
// If empty (dev), any non-empty email is accepted.
const ALLOWED = (process.env.ALLOWED_EMAILS ?? "")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email", placeholder: "you@clinic.com" },
      },
      async authorize(credentials) {
        const email = String(credentials?.email ?? "").toLowerCase().trim();
        if (!email) return null;
        if (ALLOWED.length > 0 && !ALLOWED.includes(email)) return null;
        return { id: email, email, name: email };
      },
    }),
  ],
  session: { strategy: "jwt" },
  callbacks: {
    jwt({ token, user }) {
      if (user?.id) token.sub = user.id;
      return token;
    },
    session({ session, token }) {
      if (token.sub) session.user.id = token.sub;
      return session;
    },
  },
  pages: { signIn: "/login" },
});
