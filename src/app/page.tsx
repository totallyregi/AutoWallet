import { auth } from "@/auth";
import Link from "next/link";
import { redirect } from "next/navigation";

export default async function Home() {
  const session = await auth();
  if (session) redirect("/dashboard");

  return (
    <main className="relative min-h-[100svh] overflow-hidden bg-zinc-950 px-6 py-10 text-zinc-100">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(14,165,233,0.22),transparent_40%),radial-gradient(circle_at_80%_10%,rgba(139,92,246,0.2),transparent_35%),radial-gradient(circle_at_50%_90%,rgba(34,197,94,0.14),transparent_45%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:42px_42px]" />
      <div className="mx-auto flex min-h-[calc(100svh-5rem)] w-full max-w-5xl items-center justify-center">
        <section className="relative w-full rounded-3xl border border-zinc-700/70 bg-zinc-900/65 p-8 shadow-2xl shadow-black/40 backdrop-blur-md sm:p-12">
          <div className="mx-auto max-w-3xl text-center">
            <div
              className="mx-auto mb-8 flex h-36 w-36 items-center justify-center rounded-[2rem] border border-white/20 bg-gradient-to-br from-sky-500 via-cyan-400 to-violet-500 text-5xl font-bold text-white shadow-[0_20px_80px_rgba(14,165,233,0.38)]"
              style={{ animation: "fadeUp 650ms ease-out both" }}
            >
              AW
            </div>
            <h1
              className="text-balance text-5xl font-semibold tracking-tight sm:text-7xl"
              style={{ animation: "fadeUp 700ms ease-out 120ms both" }}
            >
              AutoWallet
            </h1>
            <p
              className="mx-auto mt-4 max-w-2xl text-pretty text-base text-zinc-300 sm:text-lg"
              style={{ animation: "fadeUp 750ms ease-out 260ms both" }}
            >
              Track your spending with smart email parsing, receipt capture, and a
              clean overview of where your money goes.
            </p>

            <div
              className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row"
              style={{ animation: "fadeUp 700ms ease-out 380ms both" }}
            >
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
      <style>{`
        @keyframes fadeUp {
          from {
            opacity: 0;
            transform: translateY(16px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </main>
  );
}
