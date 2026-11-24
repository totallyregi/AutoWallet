import { auth } from "@/auth";
import { DemoButton } from "@/components/demo-button";
import Link from "next/link";
import { redirect } from "next/navigation";

const MERCHANTS = ["FairPrice", "Grab", "Starbucks", "Shopee", "Netflix", "Uniqlo", "Singtel", "Toast Box", "Spotify", "Cold Storage", "GrabFood", "IKEA"];

const FEATURES = [
  {
    title: "Reads your bank emails",
    body: "Connect Gmail and every card alert becomes a clean transaction: merchant, amount, date and category. Duplicates and reversals are handled for you.",
    icon: "M3 7l9 6 9-6M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z",
    tone: "#34d399",
  },
  {
    title: "Snap a receipt",
    body: "Photos and PDFs go through Gemini vision. Low-confidence reads are flagged for a quick human check instead of silently guessed.",
    icon: "M4 8h3l2-3h6l2 3h3v11H4zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z",
    tone: "#2dd4bf",
  },
  {
    title: "See where it goes",
    body: "Category splits, month-on-month trends, top merchants and a financial coach that points out what changed.",
    icon: "M4 19V9m6 10V5m6 14v-7m4 7H2",
    tone: "#a3e635",
  },
  {
    title: "Any currency",
    body: "Spend in SGD, USD or EUR and view everything in one currency, converted at the day's rate.",
    icon: "M12 3v18M17 7.5c0-1.9-2.2-3-5-3s-5 1.1-5 3 2.2 3 5 3 5 1.1 5 3-2.2 3-5 3-5-1.1-5-3",
    tone: "#fbbf24",
  },
];

function Icon({ d, className = "h-5 w-5" }: { d: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

/** Animated product vignette: a receipt is scanned and lands in the wallet. */
function HeroVisual() {
  const bars = [38, 62, 45, 80, 56, 92, 70];
  return (
    <div className="relative mx-auto h-[460px] w-full max-w-[460px]" aria-hidden="true">
      {/* Receipt being scanned */}
      <div className="aw-float absolute left-0 top-6 w-52 rotate-[-6deg] rounded-2xl bg-white p-4 text-zinc-800 shadow-2xl shadow-black/40" style={{ animationDelay: "0.4s" }}>
        <p className="text-center text-[11px] font-bold tracking-[0.2em]">FAIRPRICE FINEST</p>
        <p className="mb-3 text-center text-[9px] text-zinc-500">Tanjong Pagar · 21 Nov</p>
        {[["Avocados ×3", "7.95"], ["Greek yoghurt", "5.40"], ["Sourdough", "6.20"], ["Oat milk", "4.85"], ["Salmon fillet", "18.90"]].map(([k, v]) => (
          <div key={k} className="flex justify-between border-b border-dashed border-zinc-200 py-1 font-mono text-[10px]">
            <span>{k}</span><span>{v}</span>
          </div>
        ))}
        <div className="mt-2 flex justify-between font-mono text-xs font-bold"><span>TOTAL</span><span>SGD 43.30</span></div>
        <span className="absolute inset-x-3 h-0.5 rounded-full bg-emerald-400 shadow-[0_0_18px_4px_rgba(52,211,153,0.7)]" style={{ animation: "awScan 2.8s ease-in-out infinite" }} />
      </div>

      {/* Wallet card */}
      <div className="aw-pop absolute right-0 top-16 w-72 overflow-hidden rounded-3xl border border-emerald-400/25 bg-gradient-to-br from-emerald-900/90 via-[#0b1f19] to-[#071310] p-5 shadow-[0_30px_80px_-20px_rgba(16,185,129,0.45)] backdrop-blur" style={{ ["--d" as string]: "250ms" }}>
        <div className="flex items-center justify-between text-xs text-emerald-100/70">
          <span>November spend</span>
          <span className="rounded-full bg-emerald-400/15 px-2 py-0.5 font-semibold text-emerald-300">−8% vs Oct</span>
        </div>
        <p className="mt-2 font-mono text-4xl font-semibold tracking-tight text-white">$1,284<span className="text-xl text-emerald-200/60">.60</span></p>
        <div className="mt-5 flex h-20 items-end gap-2">
          {bars.map((h, i) => (
            <span
              key={i}
              className="flex-1 origin-bottom rounded-md bg-gradient-to-t from-emerald-500 to-teal-300"
              style={{ height: `${h}%`, animation: `awGrow 0.9s cubic-bezier(0.22,1,0.36,1) ${0.5 + i * 0.08}s both`, opacity: i === bars.length - 1 ? 1 : 0.55 + i * 0.05 }}
            />
          ))}
        </div>
      </div>

      {/* New transaction toast */}
      <div className="aw-pop absolute bottom-24 left-6 flex w-72 items-center gap-3 rounded-2xl border border-white/10 bg-zinc-900/85 p-3 shadow-2xl backdrop-blur" style={{ ["--d" as string]: "1100ms" }}>
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-400/15 text-emerald-300"><Icon d="M5 12l4 4L19 6" /></span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-white">FairPrice Finest</p>
          <p className="text-xs text-zinc-400">Groceries · from receipt · 97% sure</p>
        </div>
        <span className="font-mono text-sm font-semibold text-white">−43.30</span>
      </div>

      {/* Category donut */}
      <div className="aw-pop absolute bottom-0 right-4 flex items-center gap-3 rounded-2xl border border-white/10 bg-zinc-900/85 p-3 pr-4 shadow-2xl backdrop-blur" style={{ ["--d" as string]: "1500ms" }}>
        <svg viewBox="0 0 42 42" className="h-14 w-14 -rotate-90">
          {[["#34d399", 38, 0], ["#2dd4bf", 24, 38], ["#a3e635", 18, 62], ["#fbbf24", 20, 80]].map(([c, v, o]) => (
            <circle key={String(c)} cx="21" cy="21" r="15.9" fill="none" stroke={String(c)} strokeWidth="6" strokeDasharray={`${v} ${100 - Number(v)}`} strokeDashoffset={-Number(o)} pathLength={100} />
          ))}
        </svg>
        <div className="text-xs">
          <p className="font-semibold text-white">Food &amp; dining</p>
          <p className="text-zinc-400">38% of spend</p>
        </div>
      </div>
    </div>
  );
}

export default async function Home() {
  const session = await auth();
  if (session) redirect("/dashboard");

  return (
    <main className="dark relative min-h-[100svh] overflow-hidden bg-[#060a09] text-zinc-100">
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:48px_48px] [mask-image:radial-gradient(ellipse_at_top,black,transparent_70%)]" />

      <header className="relative mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <Link href="/" className="flex items-center gap-2.5 text-lg font-bold tracking-tight">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-400 to-teal-500 text-sm font-extrabold text-emerald-950 shadow-[0_8px_24px_-6px_rgba(52,211,153,0.7)]">AW</span>
          AutoWallet
        </Link>
        <nav className="flex items-center gap-2 text-sm">
          <Link href="/login" className="rounded-xl px-4 py-2 font-semibold text-zinc-300 transition hover:text-white">Sign in</Link>
          <Link href="/signup" className="aw-btn-ghost h-10 px-4 text-sm">Create account</Link>
        </nav>
      </header>

      <section className="relative mx-auto grid max-w-6xl items-center gap-12 px-6 pb-16 pt-8 lg:grid-cols-[1.05fr_1fr] lg:pt-16">
        <div>
          <p className="aw-rise inline-flex items-center gap-2 rounded-full border border-emerald-400/25 bg-emerald-400/10 px-3 py-1 text-xs font-semibold text-emerald-300">
            <span className="aw-pulse h-2 w-2 rounded-full bg-emerald-400" /> AI expense tracking · Gemini powered
          </p>
          <h1 className="aw-rise mt-5 text-balance text-5xl font-extrabold leading-[1.02] tracking-tight sm:text-6xl lg:text-7xl" style={{ ["--d" as string]: "80ms" }}>
            Your spending,<br /><span className="aw-gradient-text">sorted automatically.</span>
          </h1>
          <p className="aw-rise mt-5 max-w-xl text-pretty text-lg text-zinc-400" style={{ ["--d" as string]: "160ms" }}>
            AutoWallet turns bank emails and receipt photos into a categorised, multi-currency picture of where your money goes. No spreadsheets, no manual entry.
          </p>
          <div className="aw-rise mt-8 flex flex-col gap-3 sm:flex-row sm:items-center" style={{ ["--d" as string]: "240ms" }}>
            <DemoButton />
            <Link href="/signup" className="aw-btn-ghost h-12 px-6 text-sm">Start with your own data</Link>
          </div>
          <p className="aw-rise mt-4 text-xs text-zinc-500" style={{ ["--d" as string]: "300ms" }}>
            The demo opens a private sample wallet with 3 months of spending. Nothing to sign up for.
          </p>
        </div>
        <HeroVisual />
      </section>

      <div className="relative border-y border-white/5 bg-white/[0.02] py-4 [mask-image:linear-gradient(90deg,transparent,black_10%,black_90%,transparent)]">
        <div className="aw-marquee">
          {[...MERCHANTS, ...MERCHANTS].map((m, i) => (
            <span key={i} className="whitespace-nowrap rounded-full border border-white/10 px-4 py-1.5 text-sm text-zinc-400">{m}</span>
          ))}
        </div>
      </div>

      <section className="relative mx-auto max-w-6xl px-6 py-20">
        <h2 className="text-center text-3xl font-bold tracking-tight sm:text-4xl">Everything lands in one place</h2>
        <p className="mx-auto mt-3 max-w-xl text-center text-zinc-400">Three ways in, one clean ledger out.</p>
        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((f, i) => (
            <div key={f.title} className="aw-card aw-kpi aw-rise p-6" style={{ ["--kpi" as string]: f.tone, ["--d" as string]: `${i * 80}ms` }}>
              <span className="aw-kpi-icon"><Icon d={f.icon} /></span>
              <h3 className="mt-4 font-bold">{f.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-zinc-400">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="relative mx-auto max-w-6xl px-6 pb-24">
        <div className="aw-hero-card grid gap-8 p-8 sm:p-12 lg:grid-cols-3">
          {[["01", "Capture", "Forward an email, link Gmail, paste text or snap a receipt."], ["02", "Understand", "AI extracts merchant, amount, date and category, then flags anything unsure."], ["03", "Decide", "Watch trends, spot outliers and see exactly where to cut back."]].map(([n, t, b]) => (
            <div key={n}>
              <span className="font-mono text-sm text-emerald-300">{n}</span>
              <h3 className="mt-2 text-xl font-bold">{t}</h3>
              <p className="mt-2 text-sm text-emerald-50/70">{b}</p>
            </div>
          ))}
          <div className="flex flex-col items-start gap-3 border-t border-white/10 pt-6 lg:col-span-3 lg:flex-row lg:items-center lg:justify-between">
            <p className="text-lg font-semibold">See it with real-looking data in 5 seconds.</p>
            <DemoButton label="Open the demo wallet" />
          </div>
        </div>
      </section>

      <footer className="border-t border-white/5 py-8 text-center text-xs text-zinc-500">
        AutoWallet · Next.js, Prisma, PostgreSQL and Gemini · Built by Reginald Yang
      </footer>
    </main>
  );
}
