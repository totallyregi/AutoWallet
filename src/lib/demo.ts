import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";
import prisma from "@/lib/prisma";
import type { Prisma, TransactionSource } from "@prisma/client";

/**
 * Guest demo accounts. Each visitor gets a private throwaway user so demo data is
 * never shared or overwritten by someone else. The creation time is encoded in the
 * email so old demo users can be cleaned up without a schema change.
 */
export const DEMO_DOMAIN = "demo.autowallet.site";
export const DEMO_AI_IMPORT_LIMIT = 5;
const DEMO_TTL_MS = 24 * 60 * 60 * 1000;
const SEED_PREFIX = "demo-seed-";

export function isDemoEmail(email: string | null | undefined): boolean {
  return Boolean(email?.endsWith(`@${DEMO_DOMAIN}`));
}

const CATEGORY_NAMES: Record<string, string> = {
  groceries: "Groceries",
  "food-dining": "Food & dining",
  transport: "Transport",
  shopping: "Shopping",
  entertainment: "Entertainment",
  "bills-utilities": "Bills & utilities",
  health: "Health",
  travel: "Travel",
};

type Template = { merchant: string; slug: string; min: number; max: number; perMonth: number; source: TransactionSource };

const TEMPLATES: Template[] = [
  { merchant: "FairPrice Finest", slug: "groceries", min: 28, max: 96, perMonth: 4, source: "email" },
  { merchant: "Cold Storage", slug: "groceries", min: 18, max: 64, perMonth: 2, source: "image" },
  { merchant: "Sheng Siong", slug: "groceries", min: 12, max: 45, perMonth: 1, source: "image" },
  { merchant: "Starbucks", slug: "food-dining", min: 6.5, max: 14, perMonth: 4, source: "email" },
  { merchant: "GrabFood", slug: "food-dining", min: 14, max: 38, perMonth: 5, source: "email" },
  { merchant: "Toast Box", slug: "food-dining", min: 5, max: 11, perMonth: 3, source: "manual" },
  { merchant: "Din Tai Fung", slug: "food-dining", min: 42, max: 95, perMonth: 1, source: "image" },
  { merchant: "Grab", slug: "transport", min: 9, max: 26, perMonth: 5, source: "email" },
  { merchant: "SimplyGo (MRT/Bus)", slug: "transport", min: 15, max: 32, perMonth: 1, source: "email" },
  { merchant: "Shopee", slug: "shopping", min: 12, max: 78, perMonth: 2, source: "email" },
  { merchant: "Uniqlo", slug: "shopping", min: 29, max: 119, perMonth: 1, source: "image" },
  { merchant: "Netflix", slug: "entertainment", min: 19.98, max: 19.98, perMonth: 1, source: "email" },
  { merchant: "Spotify", slug: "entertainment", min: 10.98, max: 10.98, perMonth: 1, source: "email" },
  { merchant: "Golden Village", slug: "entertainment", min: 13.5, max: 31, perMonth: 1, source: "text" },
  { merchant: "Singtel", slug: "bills-utilities", min: 48, max: 48, perMonth: 1, source: "email" },
  { merchant: "SP Group", slug: "bills-utilities", min: 72, max: 118, perMonth: 1, source: "email" },
  { merchant: "Guardian", slug: "health", min: 8, max: 42, perMonth: 1, source: "image" },
  { merchant: "Anytime Fitness", slug: "health", min: 89, max: 89, perMonth: 1, source: "email" },
];

const ONE_OFFS = [
  { merchant: "Scoot", slug: "travel", amount: 318.4, daysAgo: 52, source: "email" as TransactionSource },
  { merchant: "Agoda", slug: "travel", amount: 426.0, daysAgo: 49, source: "email" as TransactionSource },
  { merchant: "IKEA Tampines", slug: "shopping", amount: 184.9, daysAgo: 23, source: "image" as TransactionSource },
];

/** Small deterministic PRNG so every demo looks plausible but not identical. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

async function categoryIds(): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const [slug, name] of Object.entries(CATEGORY_NAMES)) {
    const c = await prisma.category.upsert({ where: { slug }, update: {}, create: { slug, name } });
    out[slug] = c.id;
  }
  return out;
}

function snippet(merchant: string, amount: number, when: Date): string {
  const d = when.toLocaleDateString("en-SG", { day: "2-digit", month: "short", year: "numeric" });
  return `Transaction alert: A transaction of SGD ${amount.toFixed(2)} was made with your card ending 4821 on ${d} at ${merchant.toUpperCase()}. If unauthorised, call 1800 111 1111.`;
}

export async function seedDemoTransactions(userId: string) {
  const cats = await categoryIds();
  const rand = rng(Date.now() % 100000);
  const now = new Date();
  const rows: Prisma.TransactionCreateManyInput[] = [];
  let n = 0;

  for (let month = 0; month < 3; month++) {
    for (const t of TEMPLATES) {
      for (let k = 0; k < t.perMonth; k++) {
        const daysAgo = Math.floor(month * 30 + rand() * 30);
        const when = new Date(now.getTime() - daysAgo * 86400000 - Math.floor(rand() * 12) * 3600000);
        if (when > now) continue;
        const amount = Math.round((t.min + (t.max - t.min) * rand()) * 100) / 100;
        const lowConfidence = t.source === "image" && rand() < 0.15;
        rows.push({
          userId,
          amount,
          currency: "SGD",
          occurredAt: when,
          merchant: t.merchant,
          source: t.source,
          categoryId: cats[t.slug],
          confidence: lowConfidence ? 0.58 : Math.round((0.86 + rand() * 0.13) * 100) / 100,
          needsReview: lowConfidence,
          rawSnippet: t.source === "email" ? snippet(t.merchant, amount, when) : null,
          externalId: `${SEED_PREFIX}${userId}-${n++}`,
        });
      }
    }
  }
  for (const o of ONE_OFFS) {
    const when = new Date(now.getTime() - o.daysAgo * 86400000);
    rows.push({
      userId, amount: o.amount, currency: "SGD", occurredAt: when, merchant: o.merchant, source: o.source,
      categoryId: cats[o.slug], confidence: 0.94, needsReview: false,
      rawSnippet: o.source === "email" ? snippet(o.merchant, o.amount, when) : null,
      externalId: `${SEED_PREFIX}${userId}-${n++}`,
    });
  }
  await prisma.transaction.createMany({ data: rows });
}

/** Delete demo users older than DEMO_TTL_MS (their transactions cascade). */
export async function cleanupOldDemoUsers() {
  const demos = await prisma.user.findMany({
    where: { email: { endsWith: `@${DEMO_DOMAIN}` } },
    select: { id: true, email: true },
  });
  const cutoff = Date.now() - DEMO_TTL_MS;
  const stale = demos
    .filter((u) => {
      const ts = Number(u.email?.match(/^demo-(\d+)-/)?.[1]);
      return Number.isFinite(ts) && ts < cutoff;
    })
    .map((u) => u.id);
  if (stale.length) await prisma.user.deleteMany({ where: { id: { in: stale } } });
  return stale.length;
}

export async function createDemoUser() {
  const email = `demo-${Date.now()}-${randomBytes(4).toString("hex")}@${DEMO_DOMAIN}`;
  const password = randomBytes(18).toString("base64url");
  const user = await prisma.user.create({
    data: {
      email,
      name: "Demo explorer",
      password: await bcrypt.hash(password, 10),
      preferredImportCurrency: "SGD",
    },
  });
  await seedDemoTransactions(user.id);
  return { email, password };
}

/** Returns an error message when a demo user has used up their AI imports, else null. */
export async function demoImportLimitReached(userId: string, email: string | null | undefined): Promise<string | null> {
  if (!isDemoEmail(email)) return null;
  const used = await prisma.transaction.count({
    where: {
      userId,
      source: { in: ["image", "text"] },
      // Imports may have no externalId; NULL would slip past a bare NOT startsWith.
      OR: [{ externalId: null }, { NOT: { externalId: { startsWith: SEED_PREFIX } } }],
    },
  });
  return used >= DEMO_AI_IMPORT_LIMIT
    ? `The demo includes ${DEMO_AI_IMPORT_LIMIT} AI imports. Create a free account to keep importing receipts and emails.`
    : null;
}
