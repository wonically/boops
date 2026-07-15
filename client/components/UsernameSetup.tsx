"use client";

import { FormEvent, useState } from "react";
import { useSession } from "next-auth/react";

type Props = {
  onSaved: () => void;
};

export function UsernameSetup({ onSaved }: Props) {
  const { data: session, update } = useSession();
  const [username, setUsername] = useState("");
  const [name, setName] = useState(session?.user?.name || "");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    const res = await fetch("/api/users/me", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, name: name || undefined }),
    });
    const data = await res.json();
    setLoading(false);

    if (!res.ok) {
      setError(data.error || "Could not save username");
      return;
    }

    await update({ username: data.user.username, name: data.user.name });
    onSaved();
  };

  return (
    <div
      className="rounded-2xl p-4 mb-6"
      style={{ background: "var(--input-bg)", border: "1px solid var(--border)" }}
    >
      <p className="label">pick a username</p>
      <p className="brand-subtitle" style={{ textAlign: "left", marginTop: 0 }}>
        friends can find you by username
      </p>
      <form onSubmit={onSubmit} className="space-y-3">
        <input
          className="field"
          placeholder="username (e.g. wony_nguyen)"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          required
          minLength={3}
          maxLength={20}
          pattern="[a-zA-Z0-9_]+"
        />
        <input
          className="field"
          placeholder="display name (optional)"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={40}
        />
        {error && <p className="text-sm text-rose-500">{error}</p>}
        <button type="submit" className="btn-primary" disabled={loading}>
          {loading ? "saving…" : "save username"}
        </button>
      </form>
    </div>
  );
}
