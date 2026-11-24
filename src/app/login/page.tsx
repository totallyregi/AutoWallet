import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth-shell";
import { LoginForm } from "./ui";

export default async function LoginPage() {
  const session = await auth();
  if (session) redirect("/dashboard");

  const hasGoogle = !!(
    process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
  );

  return (
    <AuthShell title="Welcome back" subtitle="Sign in to see where your money went this month.">
      <LoginForm hasGoogle={hasGoogle} />
    </AuthShell>
  );
}
