import type { NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import GitHub from "next-auth/providers/github";
import type { Provider } from "next-auth/providers";

/**
 * Edge-safe auth config (no Prisma / Node APIs).
 * Used by middleware. Full auth with Prisma lives in auth.ts.
 */
const providers: Provider[] = [
  Credentials({
    name: "Email",
    credentials: {
      email: { label: "Email", type: "email" },
      password: { label: "Password", type: "password" },
    },
    authorize: async () => null,
  }),
];

if (process.env.AUTH_GOOGLE_CLIENT_ID && process.env.AUTH_GOOGLE_CLIENT_SECRET) {
  providers.push(
    Google({
      clientId: process.env.AUTH_GOOGLE_CLIENT_ID,
      clientSecret: process.env.AUTH_GOOGLE_CLIENT_SECRET,
      allowDangerousEmailAccountLinking: true,
    })
  );
}

if (process.env.AUTH_GITHUB_ID && process.env.AUTH_GITHUB_SECRET) {
  providers.push(
    GitHub({
      clientId: process.env.AUTH_GITHUB_ID,
      clientSecret: process.env.AUTH_GITHUB_SECRET,
      allowDangerousEmailAccountLinking: true,
    })
  );
}

export const authConfig = {
  session: { strategy: "jwt" },
  trustHost: true,
  // Omit secret here — middleware bundles config at build time and would
  // inline undefined. Auth.js reads AUTH_SECRET from the runtime env instead.
  pages: {
    signIn: "/login",
  },
  providers,
  callbacks: {
    async jwt({ token, user, account }) {
      if (user?.id) token.id = user.id;
      // OAuth first login — adapter user id
      if (account && user) {
        token.id = user.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.id) {
        session.user.id = token.id as string;
      }
      return session;
    },
    authorized({ auth, request }) {
      const { pathname } = request.nextUrl;
      const isLoggedIn = !!auth?.user;

      const protectedPaths = ["/dashboard", "/room"];
      const needsAuth = protectedPaths.some((p) => pathname.startsWith(p));

      if (needsAuth) return isLoggedIn;

      if ((pathname === "/login" || pathname === "/register") && isLoggedIn) {
        return Response.redirect(new URL("/dashboard", request.nextUrl.origin));
      }

      return true;
    },
  },
} satisfies NextAuthConfig;
