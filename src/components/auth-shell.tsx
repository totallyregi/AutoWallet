import Link from "next/link";
import { DemoButton } from "@/components/demo-button";

/** Split-screen auth layout: brand story on the left, form card on the right. */
export function AuthShell({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="grid min-h-[100svh] lg:grid-cols-[1fr_1.05fr]">
      <aside className="aw-hero-card relative hidden flex-col justify-between rounded-none border-0 border-r p-12 lg:flex">
        <Link href="/" className="flex items-center gap-2.5 text-lg font-bold">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-400 to-teal-500 text-sm font-extrabold text-emerald-950">AW</span>
          AutoWallet
        </Link>
        <div>
          <p className="text-4xl font-extrabold leading-tight tracking-tight">
            Every receipt,<br />every card alert,<br /><span className="aw-gradient-text">one clear picture.</span>
          </p>
          <div className="mt-10 grid max-w-md grid-cols-3 gap-3">
            {[["3", "ways to import"], ["3", "currencies"], ["0", "manual entry"]].map(([v, l], i) => (
              <div key={l} className="aw-pop rounded-2xl border border-white/10 bg-white/5 p-4" style={{ ["--d" as string]: `${200 + i * 120}ms` }}>
                <p className="font-mono text-2xl font-semibold">{v}</p>
                <p className="text-xs text-emerald-50/60">{l}</p>
              </div>
            ))}
          </div>
        </div>
        <p className="text-xs text-emerald-50/50">Gemini-powered parsing · your data stays in your account</p>
      </aside>
      <main className="flex items-center justify-center px-5 py-12">
        <div className="aw-rise w-full max-w-md">
          <Link href="/" className="mb-8 flex items-center gap-2 text-lg font-bold lg:hidden">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-400 to-teal-500 text-xs font-extrabold text-emerald-950">AW</span>
            AutoWallet
          </Link>
          <h1 className="text-3xl font-extrabold tracking-tight">{title}</h1>
          <p className="mb-8 mt-2 text-sm text-[var(--aw-muted)]">{subtitle}</p>
          <div className="aw-card p-6">{children}</div>
          <div className="mt-6 flex flex-col items-center gap-2 text-center">
            <p className="text-xs text-[var(--aw-muted)]">Just looking around?</p>
            <DemoButton label="Explore the demo wallet" className="aw-btn-ghost h-11 w-full px-5 text-sm" />
          </div>
        </div>
      </main>
    </div>
  );
}
