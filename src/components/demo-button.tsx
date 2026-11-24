"use client";

import { useFormStatus } from "react-dom";
import { startDemo } from "@/app/demo/actions";

function Inner({ label, className }: { label: string; className: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={className}>
      {pending ? (
        <>
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
          Building your demo wallet…
        </>
      ) : (
        <>
          {label}
          <span aria-hidden="true">→</span>
        </>
      )}
    </button>
  );
}

/** Starts a private, pre-filled demo account. No sign-up needed. */
export function DemoButton({
  label = "Try the live demo",
  className = "aw-btn-primary h-12 px-6 text-sm",
}: {
  label?: string;
  className?: string;
}) {
  return (
    <form action={startDemo}>
      <Inner label={label} className={className} />
    </form>
  );
}
