"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { OAuthButtons } from "@/components/OAuthButtons";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    const res = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });
    setLoading(false);
    if (res?.error) {
      setError("Invalid email or password");
      return;
    }
    router.push("/dashboard");
    router.refresh();
  };

  return (
    <main className="page-shell">
      <div className="page-blob" aria-hidden />
      <div className="glass-card">
        <h1 className="brand-title">Boops!</h1>
        <p className="brand-subtitle">log in to create rooms and see who&apos;s online</p>

        <OAuthButtons />

        <div className="divider" style={{ margin: "1.25rem 0" }}>
          or email
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          <input
            className="field"
            type="email"
            placeholder="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <input
            className="field"
            type="password"
            placeholder="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
          />
          {error && <p className="text-sm text-rose-500">{error}</p>}
          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? "booping in…" : "log in"}
          </button>
        </form>

        <p className="brand-subtitle" style={{ marginTop: "1.25rem", marginBottom: 0 }}>
          new here?{" "}
          <Link href="/register" style={{ color: "var(--text)", fontWeight: 600 }}>
            create an account
          </Link>
        </p>
      </div>
    </main>
  );
}
