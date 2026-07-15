import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  normalizeEmail,
  parseDisplayName,
  validateNewUsername,
} from "@/lib/user-identity";

const schema = z.object({
  name: z.string().min(1).max(40),
  username: z.string(),
  email: z.string().email(),
  password: z.string().min(6).max(72),
});

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }

    const email = normalizeEmail(parsed.data.email);
    const displayName = parseDisplayName(parsed.data.name);
    if (!displayName.ok) {
      return NextResponse.json({ error: displayName.error }, { status: 400 });
    }
    if (!displayName.value) {
      return NextResponse.json({ error: "Display name is required" }, { status: 400 });
    }

    const usernameCheck = await validateNewUsername(parsed.data.username, { email });
    if (!usernameCheck.ok) {
      return NextResponse.json({ error: usernameCheck.error }, { status: 409 });
    }

    const existingEmail = await prisma.user.findUnique({ where: { email } });
    if (existingEmail) {
      return NextResponse.json({ error: "Email already registered" }, { status: 409 });
    }

    const passwordHash = await bcrypt.hash(parsed.data.password, 10);
    const user = await prisma.user.create({
      data: {
        name: displayName.value,
        username: usernameCheck.username,
        email,
        passwordHash,
      },
      select: { id: true, name: true, username: true, email: true },
    });

    return NextResponse.json({ user }, { status: 201 });
  } catch (err) {
    console.error("register error", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
