import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { SignUpForm } from "./ui";

export default async function SignupPage() {
  const session = await auth();
  if (session) redirect("/dashboard");

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center px-4">
      <h1 className="mb-2 text-2xl font-semibold tracking-tight">
        Create your account
      </h1>
      <p className="mb-8 text-sm text-zinc-600 dark:text-zinc-400">
        Sign up with email and password to start tracking expenses.
      </p>
      <SignUpForm />
    </div>
  );
}
