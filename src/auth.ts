import NextAuth from "next-auth";
import type { NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import bcrypt from "bcryptjs";
import prisma from "@/lib/prisma";

const providers: NextAuthConfig["providers"] = [
  Credentials({
    name: "Email",
    credentials: {
      email: { label: "Email", type: "email" },
      password: { label: "Password", type: "password" },
    },
    async authorize(credentials) {
      const email = credentials?.email as string | undefined;
      const password = credentials?.password as string | undefined;
      if (!email || !password) return null;
      const user = await prisma.user.findUnique({ where: { email } });
      if (!user?.password) return null;
      const ok = await bcrypt.compare(password, user.password);
      if (!ok) return null;
      return { id: user.id, email: user.email ?? undefined, name: user.name ?? undefined, image: user.image ?? undefined };
    },
  }),
];

if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  providers.unshift(
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      allowDangerousEmailAccountLinking: true,
      authorization: {
        params: {
          access_type: "offline",
          // Google only returns a refresh_token when the user sees the consent screen.
          prompt: "consent",
          scope: [
            "openid",
            "https://www.googleapis.com/auth/userinfo.email",
            "https://www.googleapis.com/auth/userinfo.profile",
            "https://www.googleapis.com/auth/gmail.readonly",
          ].join(" "),
        },
      },
    }),
  );
}

export const authConfig: NextAuthConfig = {
  trustHost: true,
  adapter: PrismaAdapter(prisma),
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers,
  callbacks: {
    async jwt({ token, user, account }) {
      if (user) token.sub = user.id;

      // PrismaAdapter creates the Account row but may not merge new tokens on re-login.
      // Persist Google tokens here whenever OAuth returns them (esp. refresh_token after prompt=consent).
      if (account?.provider === "google") {
        const data: {
          refresh_token?: string;
          access_token?: string;
          expires_at?: number;
          token_type?: string;
          scope?: string;
          id_token?: string;
        } = {};
        if (account.refresh_token) data.refresh_token = account.refresh_token;
        if (account.access_token) data.access_token = account.access_token;
        if (account.expires_at != null) data.expires_at = account.expires_at;
        if (account.token_type) data.token_type = account.token_type;
        if (account.scope) data.scope = account.scope;
        if (account.id_token) data.id_token = account.id_token;

        if (Object.keys(data).length > 0) {
          try {
            await prisma.account.updateMany({
              where: {
                provider: "google",
                providerAccountId: account.providerAccountId,
              },
              data,
            });
          } catch (err) {
            console.error("[auth] Could not persist Google tokens:", err);
          }
        }
      }

      return token;
    },
    session({ session, token }) {
      if (session.user && token.sub) {
        session.user.id = token.sub;
      }
      return session;
    },
  },
};

export const { handlers, auth, signIn, signOut } = NextAuth(authConfig);
