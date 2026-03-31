import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const categories = [
  { name: "Groceries", slug: "groceries" },
  { name: "Food & dining", slug: "food-dining" },
  { name: "Travel", slug: "travel" },
  { name: "Transport", slug: "transport" },
  { name: "Shopping", slug: "shopping" },
  { name: "Entertainment", slug: "entertainment" },
  { name: "Bills & utilities", slug: "bills-utilities" },
  { name: "Health", slug: "health" },
  { name: "Education", slug: "education" },
  { name: "Other", slug: "other" },
];

async function main() {
  for (const c of categories) {
    await prisma.category.upsert({
      where: { slug: c.slug },
      update: { name: c.name },
      create: c,
    });
  }

  const demoEmail = "demo@example.com";
  const hash = await bcrypt.hash("demo12345", 10);
  await prisma.user.upsert({
    where: { email: demoEmail },
    update: { password: hash, name: "Demo User" },
    create: {
      email: demoEmail,
      name: "Demo User",
      password: hash,
    },
  });

  console.log("Seeded categories and demo user (demo@example.com / demo12345)");
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
