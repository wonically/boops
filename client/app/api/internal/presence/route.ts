import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

/**
 * Internal API for the Socket.io server to sync online membership.
 * Protected by a shared secret header.
 */
function authorize(req: Request) {
  const secret = req.headers.get("x-boops-secret");
  const expected = process.env.AUTH_SECRET || process.env.BOOPS_INTERNAL_SECRET || "boops-dev-secret-change-me-in-production";
  return secret === expected;
}

const presenceSchema = z.object({
  roomCode: z.string().min(1),
  userId: z.string().min(1),
  socketId: z.string().min(1),
  displayName: z.string().min(1),
  color: z.string().min(1),
  isOnline: z.boolean(),
});

export async function POST(req: Request) {
  if (!authorize(req)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const parsed = presenceSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const room = await prisma.room.findUnique({
    where: { code: parsed.data.roomCode.toLowerCase() },
  });
  if (!room) {
    return NextResponse.json({ error: "Room not found" }, { status: 404 });
  }

  const member = await prisma.roomMember.upsert({
    where: {
      roomId_userId: { roomId: room.id, userId: parsed.data.userId },
    },
    create: {
      roomId: room.id,
      userId: parsed.data.userId,
      displayName: parsed.data.displayName,
      color: parsed.data.color,
      socketId: parsed.data.socketId,
      isOnline: parsed.data.isOnline,
      lastSeenAt: new Date(),
    },
    update: {
      displayName: parsed.data.displayName,
      color: parsed.data.color,
      socketId: parsed.data.isOnline ? parsed.data.socketId : null,
      isOnline: parsed.data.isOnline,
      lastSeenAt: new Date(),
    },
  });

  const members = await prisma.roomMember.findMany({
    where: { roomId: room.id },
    select: {
      userId: true,
      displayName: true,
      color: true,
      isOnline: true,
      socketId: true,
    },
    orderBy: { joinedAt: "asc" },
  });

  return NextResponse.json({ member, members, roomId: room.id, code: room.code });
}

export async function GET(req: Request) {
  if (!authorize(req)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  if (!code) {
    return NextResponse.json({ error: "code required" }, { status: 400 });
  }

  const room = await prisma.room.findUnique({
    where: { code: code.toLowerCase() },
    include: {
      members: {
        select: {
          userId: true,
          displayName: true,
          color: true,
          isOnline: true,
          socketId: true,
        },
      },
    },
  });

  if (!room) {
    return NextResponse.json({ error: "Room not found" }, { status: 404 });
  }

  return NextResponse.json({ room });
}
