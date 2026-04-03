import { MutationSource, Prisma } from "@prisma/client";
import { prisma } from "./prisma";

type MutationInput = {
  userId: string;
  locationId: string;
  resourceId: string;
  delta: number;
  source: MutationSource;
  referenceId?: string;
  note?: string;
};

export async function applyInventoryMutation(
  tx: Prisma.TransactionClient,
  input: MutationInput,
) {
  await tx.inventoryMutation.create({
    data: {
      userId: input.userId,
      locationId: input.locationId,
      resourceId: input.resourceId,
      delta: input.delta,
      source: input.source,
      referenceId: input.referenceId,
      note: input.note,
    },
  });

  const existing = await tx.inventoryBalance.findUnique({
    where: {
      userId_locationId_resourceId: {
        userId: input.userId,
        locationId: input.locationId,
        resourceId: input.resourceId,
      },
    },
  });

  if (existing) {
    await tx.inventoryBalance.update({
      where: { id: existing.id },
      data: { quantity: existing.quantity + input.delta },
    });
  } else {
    await tx.inventoryBalance.create({
      data: {
        userId: input.userId,
        locationId: input.locationId,
        resourceId: input.resourceId,
        quantity: input.delta,
      },
    });
  }
}

export async function createManualMutation(input: MutationInput) {
  await prisma.$transaction(async (tx) => {
    await applyInventoryMutation(tx, input);
  });
}
