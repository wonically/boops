"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signOut, useSession } from "next-auth/react";

type ProfileUser = {
  id: string;
  username: string | null;
  name: string | null;
  email: string | null;
  image: string | null;
};

export default function ProfilePage() {
  const { data: session, status, update } = useSession();
  const router = useRouter();
  const [user, setUser] = useState<ProfileUser | null>(null);
  const [username, setUsername] = useState("");
  const [name, setName] = useState("");
  const [friendCount, setFriendCount] = useState(0);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [meRes, friendsRes] = await Promise.all([
      fetch("/api/users/me"),
      fetch("/api/friends"),
    ]);

    if (meRes.status === 401) {
      router.push("/login");
      return;
    }

    if (meRes.ok) {
      const data = await meRes.json();
      setUser(data.user);
      setUsername(data.user.username || "");
      setName(data.user.name || "");
    }

    if (friendsRes.ok) {
      const data = await friendsRes.json();
      setFriendCount((data.friends || []).length);
    }

    setLoading(false);
  }, [router]);

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login");
  }, [status, router]);

  useEffect(() => {
    if (status === "authenticated") load();
  }, [status, load]);

  const onSave = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    setSaving(true);

    const res = await fetch("/api/users/me", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: username.trim() || undefined,
        name: name.trim() || undefined,
      }),
    });
    const data = await res.json();
    setSaving(false);

    if (!res.ok) {
      setError(data.error || "Could not save profile");
      return;
    }

    setUser(data.user);
    setUsername(data.user.username || "");
    setName(data.user.name || "");
    await update({
      username: data.user.username,
      name: data.user.name,
    });
    setSuccess("profile saved");
  };

  if (status === "loading" || loading || !user) {
    return (
      <main className="page-shell">
        <p className="brand-subtitle">loading…</p>
      </main>
    );
  }

  return (
    <main className="page-shell" style={{ alignItems: "flex-start", paddingTop: "4.5rem" }}>
      <div className="page-blob" aria-hidden />
      <div className="glass-card" style={{ maxWidth: "28rem" }}>
        <div className="flex items-start justify-between gap-4 mb-6">
          <div>
            <h1 className="brand-title" style={{ textAlign: "left", fontSize: "2rem" }}>
              profile
            </h1>
            <p className="brand-subtitle" style={{ textAlign: "left", marginBottom: 0 }}>
              {user.username ? `@${user.username}` : "set a username so friends can find you"}
            </p>
          </div>
          <Link href="/dashboard" className="chip">
            dashboard
          </Link>
        </div>

        <div
          className="rounded-2xl p-4 mb-6"
          style={{ background: "var(--input-bg)", border: "1px solid var(--border)" }}
        >
          <div className="flex items-center gap-3">
            <div
              className="w-12 h-12 rounded-full flex items-center justify-center font-bold"
              style={{
                background: "var(--btn-primary)",
                color: "var(--btn-primary-text)",
                fontSize: "1.1rem",
              }}
            >
              {(user.username || user.name || user.email || "?").slice(0, 1).toUpperCase()}
            </div>
            <div>
              <p style={{ margin: 0, fontWeight: 700, color: "var(--text)" }}>
                {user.name || user.username || "booper"}
              </p>
              <p className="label" style={{ marginBottom: 0 }}>
                {user.email}
                {friendCount > 0 && (
                  <>
                    {" · "}
                    {friendCount} friend{friendCount === 1 ? "" : "s"}
                  </>
                )}
              </p>
            </div>
          </div>
        </div>

        <form onSubmit={onSave} className="space-y-4" autoComplete="off">
          <div>
            <p className="label">username</p>
            <p className="brand-subtitle" style={{ textAlign: "left", marginTop: 0, marginBottom: "0.5rem" }}>
              unique across all users
            </p>
            <input
              className="field"
              type="text"
              name="boops-profile-username"
              placeholder="letters, numbers, _"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              minLength={3}
              maxLength={20}
              pattern="[a-zA-Z0-9_]+"
              required
              autoComplete="off"
              data-1p-ignore="true"
              data-lpignore="true"
              data-form-type="other"
            />
          </div>
          <div>
            <p className="label">display name</p>
            <p className="brand-subtitle" style={{ textAlign: "left", marginTop: 0, marginBottom: "0.5rem" }}>
              can be the same as other users
            </p>
            <input
              className="field"
              type="text"
              name="boops-profile-displayname"
              placeholder="how you show up in rooms"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={40}
              autoComplete="nickname"
              data-1p-ignore="true"
              data-lpignore="true"
            />
          </div>
          <div>
            <p className="label">email</p>
            <p className="brand-subtitle" style={{ textAlign: "left", marginTop: 0, marginBottom: "0.5rem" }}>
              unique across all users
            </p>
            <input
              className="field"
              type="email"
              name="boops-profile-email"
              value={user.email || ""}
              disabled
              readOnly
              autoComplete="off"
            />
          </div>

          {error && <p className="text-sm text-rose-500">{error}</p>}
          {success && <p className="text-sm" style={{ color: "#5a9e7a" }}>{success}</p>}

          <button type="submit" className="btn-primary" disabled={saving}>
            {saving ? "saving…" : "save profile"}
          </button>
        </form>

        <div className="flex gap-2 mt-6">
          <button
            type="button"
            className="chip chip-danger"
            onClick={() => signOut({ callbackUrl: "/" })}
          >
            log out
          </button>
        </div>
      </div>
    </main>
  );
}
