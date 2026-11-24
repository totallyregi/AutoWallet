"use server";

import { signIn } from "@/auth";
import { cleanupOldDemoUsers, createDemoUser } from "@/lib/demo";

/** Creates a private demo account full of sample spending and signs the visitor in. */
export async function startDemo() {
  try {
    await cleanupOldDemoUsers();
  } catch (err) {
    console.error("[demo] cleanup failed", err);
  }
  const { email, password } = await createDemoUser();
  await signIn("credentials", { email, password, redirectTo: "/dashboard" });
}
