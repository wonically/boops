"use client";

import { signIn } from "next-auth/react";
import { useEffect, useState } from "react";

type Props = {
  callbackUrl?: string;
};

type ProviderMap = Record<string, { id: string; name: string }>;

export function OAuthButtons({ callbackUrl = "/dashboard" }: Props) {
  const [providers, setProviders] = useState<ProviderMap>({});
  const [loading, setLoading] = useState<"google" | "github" | null>(null);

  useEffect(() => {
    fetch("/api/auth/providers")
      .then((r) => r.json())
      .then((data: ProviderMap) => setProviders(data || {}))
      .catch(() => setProviders({}));
  }, []);

  const hasGoogle = !!providers.google;
  const hasGitHub = !!providers.github;

  if (!hasGoogle && !hasGitHub) {
    return (
      <p className="brand-subtitle" style={{ margin: 0, fontSize: "0.8rem" }}>
        OAuth not configured yet — add Google/GitHub keys to{" "}
        <code style={{ fontSize: "0.75rem" }}>client/.env.local</code>
      </p>
    );
  }

  const start = async (provider: "google" | "github") => {
    setLoading(provider);
    await signIn(provider, { callbackUrl });
  };

  return (
    <div className="space-y-3">
      {hasGoogle && (
        <button
          type="button"
          className="btn-secondary"
          style={{
            width: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "0.6rem",
          }}
          onClick={() => start("google")}
          disabled={!!loading}
        >
          <GoogleIcon />
          {loading === "google" ? "redirecting…" : "continue with Google"}
        </button>
      )}

      {hasGitHub && (
        <button
          type="button"
          className="btn-secondary"
          style={{
            width: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "0.6rem",
          }}
          onClick={() => start("github")}
          disabled={!!loading}
        >
          <GitHubIcon />
          {loading === "github" ? "redirecting…" : "continue with GitHub"}
        </button>
      )}
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
      <path
        fill="#FFC107"
        d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 5.1 29.3 3 24 3 12.3 3 3 12.3 3 24s9.3 21 21 21 21-9.3 21-21c0-1.4-.1-2.7-.4-3.5z"
      />
      <path
        fill="#FF3D00"
        d="M6.3 14.7l6.6 4.8C14.7 16 19 13 24 13c3 0 5.8 1.1 7.9 3l5.7-5.7C34 5.1 29.3 3 24 3 16.1 3 9.3 7.5 6.3 14.7z"
      />
      <path
        fill="#4CAF50"
        d="M24 45c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 36.3 26.7 37 24 37c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.2 40.4 16 45 24 45z"
      />
      <path
        fill="#1976D2"
        d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.3 4.2-4.1 5.6l.1.1 6.2 5.2C39.2 36.9 45 32 45 24c0-1.4-.1-2.7-.4-3.5z"
      />
    </svg>
  );
}

function GitHubIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 .3a12 12 0 0 0-3.8 23.4c.6.1.8-.3.8-.6v-2.1c-3.3.7-4-1.6-4-1.6-.5-1.3-1.3-1.7-1.3-1.7-1.1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1.1 1.8 2.8 1.3 3.5 1 .1-.8.4-1.3.8-1.6-2.7-.3-5.5-1.3-5.5-6 0-1.3.5-2.4 1.2-3.2-.1-.3-.5-1.5.1-3.1 0 0 1-.3 3.3 1.2a11.4 11.4 0 0 1 6 0C17.8 3.7 18.8 4 18.8 4c.6 1.6.2 2.8.1 3.1.8.8 1.2 1.9 1.2 3.2 0 4.7-2.8 5.7-5.5 6 .4.4.8 1.1.8 2.2v3.3c0 .3.2.7.8.6A12 12 0 0 0 12 .3z" />
    </svg>
  );
}
