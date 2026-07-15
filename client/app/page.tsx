"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function Home() {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === "authenticated") {
      router.replace("/dashboard");
    }
  }, [status, router]);

  return (
    <main className="page-shell">
      <div className="page-blob" aria-hidden />
      <div className="glass-card" style={{ textAlign: "center" }}>
        <h1 className="brand-title">Boops!</h1>
        <p className="brand-subtitle">
          spatial audio chat — boop when you&apos;re close.
          <br />
          oops when you&apos;re not.
        </p>

        {status === "loading" ? (
          <p className="brand-subtitle">loading…</p>
        ) : session ? (
          <Link href="/dashboard" className="btn-primary" style={{ display: "inline-block" }}>
            go to dashboard
          </Link>
        ) : (
          <div className="space-y-3">
            <Link href="/login" className="btn-primary" style={{ display: "block" }}>
              log in
            </Link>
            <Link href="/register" className="btn-secondary" style={{ display: "block" }}>
              create account
            </Link>
          </div>
        )}
      </div>
    </main>
  );
}
