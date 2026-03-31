import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { LoginForm } from "./ui";

export default async function LoginPage() {
  const session = await auth();
  if (session) redirect("/dashboard");

  const hasGoogle = !!(
    process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
  );

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center px-4">
      <h1 className="mb-2 text-2xl font-semibold tracking-tight">Sign in</h1>
      <p className="mb-8 text-sm text-zinc-600 dark:text-zinc-400">
        Finance Tracker — use your email account or Google when configured.
      </p>
      <LoginForm hasGoogle={hasGoogle} />
      <p className="mt-8 text-xs text-zinc-500">
        Demo (after seed): <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-800">demo@example.com</code> /{" "}
        <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-800">demo12345</code>
      </p>
    </div>
  );
}
