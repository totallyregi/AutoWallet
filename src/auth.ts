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
    jwt({ token, user }) {
      if (user) token.sub = user.id;
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
