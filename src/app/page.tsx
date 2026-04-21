import { auth } from "@/auth";
import Link from "next/link";
import { redirect } from "next/navigation";

export default async function Home() {
  const session = await auth();
  if (session) redirect("/dashboard");

  return (
    <main className="min-h-[100svh] bg-zinc-950 px-6 py-10 text-zinc-100">
      <div className="mx-auto flex min-h-[calc(100svh-5rem)] w-full max-w-5xl items-center justify-center">
        <section className="w-full rounded-3xl border border-zinc-800 bg-zinc-900/60 p-8 shadow-2xl backdrop-blur sm:p-12">
          <div className="mx-auto max-w-3xl text-center">
            <div className="mx-auto mb-8 flex h-24 w-24 items-center justify-center rounded-3xl bg-gradient-to-br from-sky-500 to-violet-500 text-3xl font-bold text-white shadow-lg shadow-sky-500/30">
              AW
            </div>
            <h1 className="text-balance text-5xl font-semibold tracking-tight sm:text-6xl">
              AutoWallet
            </h1>
            <p className="mx-auto mt-4 max-w-2xl text-pretty text-base text-zinc-300 sm:text-lg">
              Track your spending with smart email parsing, receipt capture, and a
              clean overview of where your money goes.
            </p>

            <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link
                href="/login"
                className="inline-flex h-11 min-w-40 items-center justify-center rounded-xl bg-zinc-100 px-6 text-sm font-semibold text-zinc-900 transition hover:bg-white"
              >
                Sign in
              </Link>
              <Link
                href="/signup"
                className="inline-flex h-11 min-w-40 items-center justify-center rounded-xl border border-zinc-700 bg-zinc-900 px-6 text-sm font-semibold text-zinc-100 transition hover:border-zinc-500 hover:bg-zinc-800"
              >
                Sign up
              </Link>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
