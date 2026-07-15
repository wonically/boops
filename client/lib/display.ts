type NamedUser = {
  username?: string | null;
  name?: string | null;
  email?: string | null;
};

export function displayName(user: NamedUser, fallback = "booper") {
  return user.name || user.username || user.email?.split("@")[0] || fallback;
}
