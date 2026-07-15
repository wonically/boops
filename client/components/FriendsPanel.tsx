"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";

type FriendUser = {
  id: string;
  username: string | null;
  name: string | null;
  image: string | null;
  isOnline?: boolean;
};

type FriendshipRow = {
  id: string;
  status: "PENDING" | "ACCEPTED";
  direction: "incoming" | "outgoing";
  user: FriendUser;
};

type Props = {
  enabled: boolean;
};

function friendLabel(user: FriendUser) {
  return user.username ? `@${user.username}` : user.name || "booper";
}

export function FriendsPanel({ enabled }: Props) {
  const [friends, setFriends] = useState<FriendshipRow[]>([]);
  const [incoming, setIncoming] = useState<FriendshipRow[]>([]);
  const [outgoing, setOutgoing] = useState<FriendshipRow[]>([]);
  const [username, setUsername] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const loadFriends = useCallback(async () => {
    if (!enabled) return;
    const res = await fetch("/api/friends");
    if (!res.ok) return;
    const data = await res.json();
    setFriends(data.friends || []);
    setIncoming(data.incoming || []);
    setOutgoing(data.outgoing || []);
  }, [enabled]);

  useEffect(() => {
    loadFriends();
    if (!enabled) return;
    const timer = setInterval(loadFriends, 15000);
    return () => clearInterval(timer);
  }, [enabled, loadFriends]);

  const sendRequest = async (e: FormEvent) => {
    e.preventDefault();
    if (!username.trim()) return;
    setLoading(true);
    setError("");
    const res = await fetch("/api/friends", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: username.trim() }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(data.error || "Could not send request");
      return;
    }
    setUsername("");
    loadFriends();
  };

  const respond = async (id: string, action: "accept" | "reject") => {
    await fetch(`/api/friends/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    loadFriends();
  };

  const remove = async (id: string) => {
    await fetch(`/api/friends/${id}`, { method: "DELETE" });
    loadFriends();
  };

  if (!enabled) {
    return (
      <p className="brand-subtitle" style={{ margin: 0 }}>
        set a username above to add friends
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <form onSubmit={sendRequest} className="flex gap-2">
        <input
          className="field flex-1"
          placeholder="add friend by username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />
        <button type="submit" className="btn-secondary" disabled={loading}>
          add
        </button>
      </form>
      {error && <p className="text-sm text-rose-500">{error}</p>}

      {incoming.length > 0 && (
        <div>
          <p className="label">incoming requests</p>
          <div className="space-y-2">
            {incoming.map((row) => (
              <div key={row.id} className="flex items-center justify-between gap-2">
                <span style={{ color: "var(--text)", fontWeight: 600 }}>{friendLabel(row.user)}</span>
                <div className="flex gap-2">
                  <button type="button" className="chip" onClick={() => respond(row.id, "accept")}>
                    accept
                  </button>
                  <button type="button" className="chip chip-danger" onClick={() => respond(row.id, "reject")}>
                    decline
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {outgoing.length > 0 && (
        <div>
          <p className="label">sent requests</p>
          <div className="space-y-2">
            {outgoing.map((row) => (
              <div key={row.id} className="flex items-center justify-between gap-2">
                <span style={{ color: "var(--text)" }}>{friendLabel(row.user)}</span>
                <button type="button" className="chip" onClick={() => remove(row.id)}>
                  cancel
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        <p className="label">friends ({friends.length})</p>
        {friends.length === 0 ? (
          <p className="brand-subtitle" style={{ margin: 0 }}>
            no friends yet — add someone by username
          </p>
        ) : (
          <div className="space-y-2">
            {friends.map((row) => (
              <div key={row.id} className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span
                    className="inline-block w-2 h-2 rounded-full"
                    style={{ background: row.user.isOnline ? "#7dcea0" : "var(--text-soft)" }}
                    title={row.user.isOnline ? "online" : "offline"}
                  />
                  <span style={{ color: "var(--text)", fontWeight: 600 }}>{friendLabel(row.user)}</span>
                  {row.user.name && row.user.username && (
                    <span className="label" style={{ margin: 0 }}>
                      {row.user.name}
                    </span>
                  )}
                </div>
                <button type="button" className="chip chip-danger" onClick={() => remove(row.id)}>
                  remove
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
