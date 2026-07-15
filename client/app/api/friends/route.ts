import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { parseUsername } from "@/lib/username";

const userSelect = {
  id: true,
  username: true,
  name: true,
  image: true,
} as const;

async function getOnlineUserIds(userIds: string[]) {
  if (userIds.length === 0) return new Set<string>();

  const online = await prisma.roomMember.findMany({
    where: { userId: { in: userIds }, isOnline: true },
    select: { userId: true },
    distinct: ["userId"],
  });

  return new Set(online.map((row) => row.userId));
}

function mapFriendship(
  row: {
    id: string;
    requesterId: string;
    addresseeId: string;
    status: "PENDING" | "ACCEPTED";
    requester: { id: string; username: string | null; name: string | null; image: string | null };
    addressee: { id: string; username: string | null; name: string | null; image: string | null };
  },
  meId: string,
  onlineIds: Set<string>
) {
  const friend = row.requesterId === meId ? row.addressee : row.requester;
  return {
    id: row.id,
    status: row.status,
    direction: row.requesterId === meId ? "outgoing" : "incoming",
    user: {
      ...friend,
      isOnline: onlineIds.has(friend.id),
    },
  };
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const me = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { username: true },
  });
  if (!me?.username) {
    return NextResponse.json({ error: "Set a username before using friends" }, { status: 400 });
  }

  const rows = await prisma.friendship.findMany({
    where: {
      OR: [{ requesterId: session.user.id }, { addresseeId: session.user.id }],
    },
    include: {
      requester: { select: userSelect },
      addressee: { select: userSelect },
    },
    orderBy: { updatedAt: "desc" },
  });

  const otherIds = rows.map((row) =>
    row.requesterId === session.user!.id ? row.addresseeId : row.requesterId
  );
  const onlineIds = await getOnlineUserIds(otherIds);

  const friendships = rows.map((row) => mapFriendship(row, session.user!.id, onlineIds));

  return NextResponse.json({
    friends: friendships.filter((f) => f.status === "ACCEPTED"),
    incoming: friendships.filter((f) => f.status === "PENDING" && f.direction === "incoming"),
    outgoing: friendships.filter((f) => f.status === "PENDING" && f.direction === "outgoing"),
  });
}

const requestSchema = z.object({
  username: z.string(),
});

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const me = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { username: true },
  });
  if (!me?.username) {
    return NextResponse.json({ error: "Set a username before adding friends" }, { status: 400 });
  }

  const body = await req.json();
  const parsed = requestSchema.safeParse(body);
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

  const target = await prisma.user.findUnique({
    where: { username: usernameResult.data },
    select: { id: true, username: true, name: true, image: true },
  });
  if (!target) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }
  if (target.id === session.user.id) {
    return NextResponse.json({ error: "You cannot add yourself" }, { status: 400 });
  }

  const existing = await prisma.friendship.findFirst({
    where: {
      OR: [
        { requesterId: session.user.id, addresseeId: target.id },
        { requesterId: target.id, addresseeId: session.user.id },
      ],
    },
    include: {
      requester: { select: userSelect },
      addressee: { select: userSelect },
    },
  });

  if (existing) {
    if (existing.status === "ACCEPTED") {
      return NextResponse.json({ error: "Already friends" }, { status: 409 });
    }
    if (existing.requesterId === session.user.id) {
      return NextResponse.json({ error: "Friend request already sent" }, { status: 409 });
    }
    return NextResponse.json({ error: "They already sent you a request — check incoming" }, { status: 409 });
  }

  const friendship = await prisma.friendship.create({
    data: {
      requesterId: session.user.id,
      addresseeId: target.id,
    },
    include: {
      requester: { select: userSelect },
      addressee: { select: userSelect },
    },
  });

  return NextResponse.json(
    {
      friendship: mapFriendship(friendship, session.user.id, new Set()),
    },
    { status: 201 }
  );
}
