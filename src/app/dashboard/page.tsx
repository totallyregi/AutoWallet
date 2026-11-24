import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import { redirect } from "next/navigation";
import { DashboardShell } from "./dashboard-shell";
import { isDemoEmail } from "@/lib/demo";

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  // Demo accounts are throwaway, so Gmail linking is switched off for them.
  const isDemo = isDemoEmail(session.user.email);
  const googleOAuthEnabled =
    !isDemo && Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

  const googleAccount = await prisma.account.findFirst({
    where: { userId: session.user.id, provider: "google" },
    select: { refresh_token: true },
  });
  const hasGoogleLink = Boolean(googleAccount);
  const hasGmailToken = Boolean(googleAccount?.refresh_token?.trim());

  let gmailConnection:
    | "oauth_disabled"
    | "not_linked"
    | "needs_reconnect"
    | "connected" = "oauth_disabled";
  if (googleOAuthEnabled) {
    if (!hasGoogleLink) gmailConnection = "not_linked";
    else if (!hasGmailToken) gmailConnection = "needs_reconnect";
    else gmailConnection = "connected";
  }

  return (
    <DashboardShell
      userEmail={session.user.email ?? null}
      userName={session.user.name ?? null}
      googleOAuthEnabled={googleOAuthEnabled}
      gmailConnection={gmailConnection}
      gmailDisplayEmail={session.user.email ?? null}
      isDemo={isDemo}
    />
  );
}
