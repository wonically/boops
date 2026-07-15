import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { parseUsername } from "@/lib/username";

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

    const usernameResult = parseUsername(parsed.data.username);
    if (!usernameResult.success) {
      return NextResponse.json(
        { error: usernameResult.error.issues[0]?.message || "Invalid username" },
        { status: 400 }
      );
    }

    const email = parsed.data.email.toLowerCase();
    const username = usernameResult.data;

    const existingEmail = await prisma.user.findUnique({ where: { email } });
    if (existingEmail) {
      return NextResponse.json({ error: "Email already registered" }, { status: 409 });
    }

    const existingUsername = await prisma.user.findUnique({ where: { username } });
    if (existingUsername) {
      return NextResponse.json({ error: "Username already taken" }, { status: 409 });
    }

    const passwordHash = await bcrypt.hash(parsed.data.password, 10);
    const user = await prisma.user.create({
      data: {
        name: parsed.data.name.trim(),
        username,
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
