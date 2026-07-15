import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

type RouteContext = { params: Promise<{ id: string }> };

const actionSchema = z.object({
  action: z.enum(["accept", "reject"]),
});

export async function PATCH(req: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const body = await req.json();
  const parsed = actionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const friendship = await prisma.friendship.findUnique({ where: { id } });
  if (!friendship) {
    return NextResponse.json({ error: "Request not found" }, { status: 404 });
  }
  if (friendship.addresseeId !== session.user.id) {
    return NextResponse.json({ error: "Only the recipient can respond" }, { status: 403 });
  }
  if (friendship.status !== "PENDING") {
    return NextResponse.json({ error: "Request already handled" }, { status: 409 });
  }

  if (parsed.data.action === "reject") {
    await prisma.friendship.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  }

  const updated = await prisma.friendship.update({
    where: { id },
    data: { status: "ACCEPTED" },
    include: {
      requester: { select: { id: true, username: true, name: true, image: true } },
      addressee: { select: { id: true, username: true, name: true, image: true } },
    },
  });

  return NextResponse.json({ friendship: updated });
}

export async function DELETE(_req: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const friendship = await prisma.friendship.findUnique({ where: { id } });
  if (!friendship) {
    return NextResponse.json({ error: "Friendship not found" }, { status: 404 });
  }

  const isParticipant =
    friendship.requesterId === session.user.id || friendship.addresseeId === session.user.id;
  if (!isParticipant) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await prisma.friendship.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
