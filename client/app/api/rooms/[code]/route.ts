import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { randomPastel } from "@/lib/colors";
import { displayName as userDisplayName } from "@/lib/display";

type Params = { params: Promise<{ code: string }> };

export async function GET(_req: Request, { params }: Params) {
  const { code } = await params;
  const room = await prisma.room.findUnique({
    where: { code: code.toLowerCase() },
    include: {
      host: { select: { id: true, name: true, image: true } },
      members: {
        include: {
          user: { select: { id: true, name: true, email: true, image: true } },
        },
        orderBy: { joinedAt: "asc" },
      },
    },
  });

  if (!room) {
    return NextResponse.json({ error: "Room not found" }, { status: 404 });
  }

  return NextResponse.json({ room });
}

const joinSchema = z.object({
  color: z.string().optional(),
  displayName: z.string().min(1).max(40).optional(),
});

export async function POST(req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { code } = await params;
  const room = await prisma.room.findUnique({
    where: { code: code.toLowerCase() },
    include: { _count: { select: { members: true } } },
  });

  if (!room) {
    return NextResponse.json({ error: "Room not found" }, { status: 404 });
  }

  if (room._count.members >= room.maxPlayers) {
    const existing = await prisma.roomMember.findUnique({
      where: {
        roomId_userId: { roomId: room.id, userId: session.user.id },
      },
    });
    if (!existing) {
      return NextResponse.json({ error: "Room is full" }, { status: 403 });
    }
  }

  const body = await req.json().catch(() => ({}));
  const parsed = joinSchema.safeParse(body);
  const color = parsed.success && parsed.data.color ? parsed.data.color : randomPastel();
  const displayName =
    (parsed.success && parsed.data.displayName) ||
    userDisplayName({
      username: session.user.username,
      name: session.user.name,
      email: session.user.email,
    });

  const member = await prisma.roomMember.upsert({
    where: {
      roomId_userId: { roomId: room.id, userId: session.user.id },
    },
    create: {
      roomId: room.id,
      userId: session.user.id,
      displayName,
      color,
      isOnline: false,
    },
    update: {
      displayName,
      color,
      lastSeenAt: new Date(),
    },
  });

  await prisma.room.update({
    where: { id: room.id },
    data: { updatedAt: new Date() },
  });

  return NextResponse.json({
    room: { id: room.id, code: room.code, name: room.name },
    member,
  });
}

export async function DELETE(_req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { code } = await params;
  const room = await prisma.room.findUnique({ where: { code: code.toLowerCase() } });
  if (!room) {
    return NextResponse.json({ error: "Room not found" }, { status: 404 });
  }
  if (room.hostId !== session.user.id) {
    return NextResponse.json({ error: "Only the host can delete this room" }, { status: 403 });
  }

  await prisma.room.delete({ where: { id: room.id } });
  return NextResponse.json({ ok: true });
}
