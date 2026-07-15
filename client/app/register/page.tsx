"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { OAuthButtons } from "@/components/OAuthButtons";

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    const res = await fetch("/api/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, username, email, password }),
    });
    const data = await res.json();
    if (!res.ok) {
      setLoading(false);
      setError(data.error || "Could not register");
      return;
    }

    const login = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });
    setLoading(false);
    if (login?.error) {
      setError("Account created — please log in");
      router.push("/login");
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
        <p className="brand-subtitle">create an account to host rooms</p>

        <OAuthButtons />

        <div className="divider" style={{ margin: "1.25rem 0" }}>
          or email
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          <input
            className="field"
            type="text"
            placeholder="username — unique, for friends (@handle)"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            minLength={3}
            maxLength={20}
            pattern="[a-zA-Z0-9_]+"
          />
          <input
            className="field"
            type="text"
            placeholder="display name — can match others"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
          <input
            className="field"
            type="email"
            placeholder="email — unique, for sign-in"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <input
            className="field"
            type="password"
            placeholder="password (6+ chars)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
          />
          {error && <p className="text-sm text-rose-500">{error}</p>}
          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? "creating…" : "sign up"}
          </button>
        </form>

        <p className="brand-subtitle" style={{ marginTop: "1.25rem", marginBottom: 0 }}>
          already have an account?{" "}
          <Link href="/login" style={{ color: "var(--text)", fontWeight: 600 }}>
            log in
          </Link>
        </p>
      </div>
    </main>
  );
}
