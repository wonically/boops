import { prisma } from "@/lib/prisma";
import { parseUsername } from "@/lib/username";

/** Display names are not unique — many users can share the same name. */
export function parseDisplayName(value: unknown) {
  if (typeof value !== "string") return { ok: false as const, error: "Invalid display name" };
  const trimmed = value.trim();
  if (trimmed.length === 0) return { ok: true as const, value: null };
  if (trimmed.length > 40) return { ok: false as const, error: "Display name must be at most 40 characters" };
  return { ok: true as const, value: trimmed };
}

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

/** Username must not match this user's email (they are separate identifiers). */
export function usernameConflictsWithEmail(username: string, email: string | null | undefined) {
  if (!email) return false;
  const normalizedEmail = normalizeEmail(email);
  const localPart = normalizedEmail.split("@")[0] ?? "";
  return username === normalizedEmail || username === localPart;
}

export async function assertUsernameAvailable(username: string, excludeUserId?: string) {
  const takenByUsername = await prisma.user.findFirst({
    where: { username, ...(excludeUserId ? { NOT: { id: excludeUserId } } : {}) },
    select: { id: true },
  });
  if (takenByUsername) {
    return { ok: false as const, error: "Username already taken" };
  }

  // Usernames cannot collide with another account's email
  const takenByEmail = await prisma.user.findFirst({
    where: {
      email: username,
      ...(excludeUserId ? { NOT: { id: excludeUserId } } : {}),
    },
    select: { id: true },
  });
  if (takenByEmail) {
    return { ok: false as const, error: "Username conflicts with an existing email" };
  }

  return { ok: true as const, username };
}

export async function validateNewUsername(
  rawUsername: unknown,
  options?: { email?: string | null; excludeUserId?: string }
) {
  const parsed = parseUsername(rawUsername);
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message || "Invalid username" };
  }

  if (usernameConflictsWithEmail(parsed.data, options?.email)) {
    return { ok: false as const, error: "Username must be different from your email" };
  }

  return assertUsernameAvailable(parsed.data, options?.excludeUserId);
}
