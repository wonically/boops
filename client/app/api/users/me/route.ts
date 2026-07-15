import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { parseUsername } from "@/lib/username";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, username: true, name: true, email: true, image: true },
  });

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  return NextResponse.json({ user });
}

const updateSchema = z.object({
  username: z.string().optional(),
  name: z.string().max(40).optional(),
});

export async function PATCH(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  if (parsed.data.username === undefined && parsed.data.name === undefined) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const data: { username?: string; name?: string | null } = {};

  if (parsed.data.username !== undefined) {
    const usernameResult = parseUsername(parsed.data.username);
    if (!usernameResult.success) {
      return NextResponse.json(
        { error: usernameResult.error.issues[0]?.message || "Invalid username" },
        { status: 400 }
      );
    }

    const username = usernameResult.data;
    const taken = await prisma.user.findFirst({
      where: { username, NOT: { id: session.user.id } },
      select: { id: true },
    });
    if (taken) {
      return NextResponse.json({ error: "Username already taken" }, { status: 409 });
    }
    data.username = username;
  }

  if (parsed.data.name !== undefined) {
    const trimmed = parsed.data.name.trim();
    data.name = trimmed.length > 0 ? trimmed : null;
  }

  const user = await prisma.user.update({
    where: { id: session.user.id },
    data,
    select: { id: true, username: true, name: true, email: true, image: true },
  });

  return NextResponse.json({ user });
}
