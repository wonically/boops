import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { makeRoomCode, randomPastel } from "@/lib/colors";
import { displayName } from "@/lib/display";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rooms = await prisma.room.findMany({
    where: {
      OR: [
        { hostId: session.user.id },
        { members: { some: { userId: session.user.id } } },
        { isPublic: true },
      ],
    },
    include: {
      host: { select: { id: true, name: true, username: true, email: true, image: true } },
      members: {
        where: { isOnline: true },
        select: {
          id: true,
          displayName: true,
          color: true,
          userId: true,
          isOnline: true,
        },
      },
      _count: { select: { members: true } },
    },
    orderBy: { updatedAt: "desc" },
    take: 50,
  });

  return NextResponse.json({ rooms });
}

const createSchema = z.object({
  name: z.string().min(1).max(60),
  isPublic: z.boolean().optional(),
  color: z.string().optional(),
});

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  let code = makeRoomCode();
  for (let i = 0; i < 5; i++) {
    const clash = await prisma.room.findUnique({ where: { code } });
    if (!clash) break;
    code = makeRoomCode();
  }

  const color = parsed.data.color || randomPastel();

  const label = displayName({
    username: session.user.username,
    name: session.user.name,
    email: session.user.email,
  });

  const room = await prisma.room.create({
    data: {
      code,
      name: parsed.data.name.trim(),
      isPublic: parsed.data.isPublic ?? true,
      hostId: session.user.id,
      members: {
        create: {
          userId: session.user.id,
          displayName: label,
          color,
          isOnline: false,
        },
      },
    },
    include: {
      host: { select: { id: true, name: true, username: true } },
      members: true,
    },
  });

  return NextResponse.json({ room }, { status: 201 });
}
