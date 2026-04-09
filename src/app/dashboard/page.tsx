import { auth } from "@/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { logoutAction } from "./actions";
import { DashboardClient } from "./dashboard-client";

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  return (
    <div className="mx-auto flex min-h-full w-full max-w-[1500px] flex-col px-4 py-6 sm:px-6 lg:px-8">
      <nav className="mb-10 flex items-center justify-between gap-4">
        <Link href="/dashboard" className="text-lg font-semibold tracking-tight">
          Finance Tracker
        </Link>
        <div className="flex items-center gap-4">
          <span className="hidden text-sm text-zinc-600 sm:inline dark:text-zinc-400">
            {session.user.email ?? session.user.name}
          </span>
          <form action={logoutAction}>
            <button
              type="submit"
              className="text-sm font-medium text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
            >
              Sign out
            </button>
          </form>
        </div>
      </nav>
      <DashboardClient
        googleOAuthEnabled={Boolean(
          process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET,
        )}
      />
    </div>
  );
}
