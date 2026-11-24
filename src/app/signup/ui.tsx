"use client";

import Link from "next/link";
import { signIn } from "next-auth/react";
import { useState } from "react";

export function SignUpForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      const response = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          email,
          password,
          confirmPassword,
        }),
      });
      const data = (await response
        .json()
        .catch(() => ({ error: "Server returned an invalid response" }))) as {
        error?: string;
      };
      if (!response.ok) throw new Error(data.error ?? "Signup failed");

      const loginResult = await signIn("credentials", {
        email,
        password,
        redirect: false,
        callbackUrl: "/dashboard",
      });

      if (loginResult?.error) {
        window.location.href = "/login?created=1";
        return;
      }

      if (loginResult?.url) {
        window.location.href = loginResult.url;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Signup failed");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
        Name
        <input
          className="aw-input mt-1.5 w-full px-3.5 py-2.5"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          autoComplete="name"
        />
      </label>
      <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
        Email
        <input
          className="aw-input mt-1.5 w-full px-3.5 py-2.5"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoComplete="email"
        />
      </label>
      <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
        Password
        <input
          className="aw-input mt-1.5 w-full px-3.5 py-2.5"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          autoComplete="new-password"
          minLength={8}
        />
      </label>
      <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
        Confirm password
        <input
          className="aw-input mt-1.5 w-full px-3.5 py-2.5"
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          required
          autoComplete="new-password"
          minLength={8}
        />
      </label>
      {error && (
        <p className="text-sm text-red-600 dark:text-red-400" role="alert">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="aw-btn-primary mt-1 h-11 text-sm"
      >
        {pending ? "Creating account..." : "Create account"}
      </button>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        Already have an account?{" "}
        <Link className="font-semibold text-emerald-500 hover:underline" href="/login">
          Sign in
        </Link>
      </p>
    </form>
  );
}
