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
        username is unique · display name can be shared
      </p>
      <form onSubmit={onSubmit} className="space-y-3" autoComplete="off">
        <input
          className="field"
          type="text"
          name="boops-claim-username"
          placeholder="username (unique @handle)"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          required
          minLength={3}
          maxLength={20}
          pattern="[a-zA-Z0-9_]+"
          autoComplete="off"
          data-1p-ignore="true"
          data-lpignore="true"
          data-form-type="other"
        />
        <input
          className="field"
          type="text"
          name="boops-display-name"
          placeholder="display name (not unique)"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={40}
          autoComplete="nickname"
          data-1p-ignore="true"
          data-lpignore="true"
        />
        {error && <p className="text-sm text-rose-500">{error}</p>}
        <button type="submit" className="btn-primary" disabled={loading}>
          {loading ? "saving…" : "save username"}
        </button>
      </form>
    </div>
  );
}
