import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth-shell";
import { SignUpForm } from "./ui";

export default async function SignupPage() {
  const session = await auth();
  if (session) redirect("/dashboard");

  return (
    <AuthShell title="Create your wallet" subtitle="Start tracking expenses from your emails and receipts.">
      <SignUpForm />
    </AuthShell>
  );
}
