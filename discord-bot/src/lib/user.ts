import { prisma } from "./prisma.js";

export async function ensureDiscordUser(discordId: string) {
  const existing = await prisma.user.findUnique({ where: { discordId } });
  if (existing) return existing;
  return prisma.user.create({
    data: { discordId },
  });
}
