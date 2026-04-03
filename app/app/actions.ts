"use server";

import { MutationSource } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { applyInventoryMutation } from "@/lib/inventory";
import { extractEntriesFromScreenshot, extractRefineryFromScreenshot } from "@/lib/ocr";
import { prisma } from "@/lib/prisma";
import { saveScreenshot } from "@/lib/upload";
import {
  createSession,
  destroySession,
  hashPassword,
  requireUser,
  verifyPassword,
} from "@/lib/auth";
import { slugify } from "@/lib/slug";

const registerSchema = z.object({
  email: z.email(),
  password: z.string().min(8),
  scHandle: z.string().optional(),
});

export async function registerAction(formData: FormData) {
  const parsed = registerSchema.safeParse({
    email: String(formData.get("email") || ""),
    password: String(formData.get("password") || ""),
    scHandle: String(formData.get("scHandle") || ""),
  });

  if (!parsed.success) throw new Error("Ongeldige registratiegegevens.");
  const { email, password, scHandle } = parsed.data;
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) throw new Error("Dit emailadres bestaat al.");

  const user = await prisma.user.create({
    data: {
      email,
      passwordHash: await hashPassword(password),
      scHandle: scHandle || null,
    },
  });

  const starterOrg = await prisma.organization.create({
    data: {
      name: `${scHandle || email.split("@")[0]} Crew`,
      inviteCode: randomUUID().replace(/-/g, "").slice(0, 10).toUpperCase(),
    },
  });

  await prisma.organizationMember.create({
    data: {
      organizationId: starterOrg.id,
      userId: user.id,
      role: "OWNER",
    },
  });

  await createSession(user.id);
  redirect("/dashboard");
}

export async function loginAction(formData: FormData) {
  const email = String(formData.get("email") || "");
  const password = String(formData.get("password") || "");
  const user = await prisma.user.findUnique({ where: { email } });

  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    throw new Error("Onjuiste login.");
  }

  await createSession(user.id);
  redirect("/dashboard");
}

export async function logoutAction() {
  await destroySession();
  redirect("/login");
}

export async function createMiningRunAction(formData: FormData) {
  const user = await requireUser();
  const entryMode = String(formData.get("entryMode") || "manual");
  const locationId = String(formData.get("locationId") || "");
  const shipVehicle = String(formData.get("shipVehicle") || "");
  const notes = String(formData.get("notes") || "");
  const entries = String(formData.get("entries") || "");
  const screenshot = formData.get("screenshot") as File | null;
  const ocrMeta = String(formData.get("ocrMeta") || "");

  const parseManualLines = (value: string) =>
    value
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [resourceSlug, qtyRaw] = line.split(":");
        return { resourceSlug: resourceSlug?.trim(), qty: Number(qtyRaw) };
      })
      .filter((item) => item.resourceSlug && Number.isFinite(item.qty) && item.qty > 0);

  let parsedEntries = parseManualLines(entries);
  let ocrNote: string | null = null;
  if (entryMode === "screenshot") {
    if (parsedEntries.length === 0) {
      if (!screenshot || screenshot.size === 0) {
        throw new Error("Upload een screenshot om automatisch uit te lezen.");
      }
      const resources = await prisma.resource.findMany({
        select: { slug: true, name: true },
      });
      const ocr = await extractEntriesFromScreenshot(screenshot, resources);
      parsedEntries = ocr.entries;
      ocrNote = `OCR mode gebruikt (${parsedEntries.length} regels herkend, confidence ${Math.round(ocr.avgConfidence * 100)}%).`;
    } else if (ocrMeta) {
      ocrNote = ocrMeta;
    }
  }

  if (!locationId || parsedEntries.length === 0) {
    throw new Error("Geen geldige resource regels gevonden. Gebruik handmatige invoer als OCR niets herkent.");
  }

  await prisma.$transaction(async (tx) => {
    const run = await tx.miningRun.create({
      data: {
        userId: user.id,
        locationId,
        shipVehicle: shipVehicle || null,
        notes: [notes, ocrNote].filter(Boolean).join(" | ") || null,
      },
    });

    for (const entry of parsedEntries) {
      const resource = await tx.resource.findUnique({
        where: { slug: entry.resourceSlug! },
      });
      if (!resource) continue;

      await tx.miningRunItem.create({
        data: {
          runId: run.id,
          resourceId: resource.id,
          quantity: entry.qty,
          unit: resource.unit,
        },
      });

      await applyInventoryMutation(tx, {
        userId: user.id,
        locationId,
        resourceId: resource.id,
        delta: entry.qty,
        source: MutationSource.MINING,
        referenceId: run.id,
      });
    }

    if (screenshot && screenshot.size > 0) {
      const file = await saveScreenshot(screenshot);
      if (file) {
        await tx.screenshot.create({
          data: {
            ...file,
            miningRunId: run.id,
          },
        });
      }
    }
  });

  revalidatePath("/dashboard");
  revalidatePath("/inventory");
  redirect("/dashboard");
}

export async function createRefineryJobAction(formData: FormData) {
  const user = await requireUser();
  const entryMode = String(formData.get("entryMode") || "manual");
  const locationId = String(formData.get("locationId") || "");
  const method = String(formData.get("method") || "Dinyx");
  const costAuecRaw = String(formData.get("costAuec") || "");
  const durationHoursRaw = String(formData.get("durationHours") || "");
  const notes = String(formData.get("notes") || "");
  const inputEntries = String(formData.get("inputEntries") || "");
  const outputEntries = String(formData.get("outputEntries") || "");
  const screenshot = formData.get("screenshot") as File | null;
  const ocrMeta = String(formData.get("ocrMeta") || "");

  const parseLines = (value: string) =>
    value
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [resourceSlug, qtyRaw] = line.split(":");
        return { resourceSlug: resourceSlug?.trim(), qty: Number(qtyRaw) };
      })
      .filter((item) => item.resourceSlug && Number.isFinite(item.qty) && item.qty > 0);

  let inputs = parseLines(inputEntries);
  let outputs = parseLines(outputEntries);
  let ocrNote: string | null = null;
  if (entryMode === "screenshot") {
    if (inputs.length === 0 || outputs.length === 0) {
      if (!screenshot || screenshot.size === 0) {
        throw new Error("Upload een screenshot om automatisch uit te lezen.");
      }
      const resources = await prisma.resource.findMany({
        select: { slug: true, name: true },
      });
      const ocr = await extractRefineryFromScreenshot(screenshot, resources);
      inputs = ocr.inputs;
      outputs = ocr.outputs;
      ocrNote = `OCR mode gebruikt (inputs: ${inputs.length}, outputs: ${outputs.length}, confidence ${Math.round(ocr.avgConfidence * 100)}%).`;
    } else if (ocrMeta) {
      ocrNote = ocrMeta;
    }
  }
  if (!locationId || inputs.length === 0 || outputs.length === 0) {
    throw new Error("Onvoldoende data herkend. Probeer handmatige invoer als OCR niet genoeg vindt.");
  }

  await prisma.$transaction(async (tx) => {
    const job = await tx.refineryJob.create({
      data: {
        userId: user.id,
        locationId,
        method,
        costAuec: costAuecRaw ? Number(costAuecRaw) : null,
        durationHours: durationHoursRaw ? Number(durationHoursRaw) : null,
        notes: [notes, ocrNote].filter(Boolean).join(" | ") || null,
      },
    });

    for (const entry of inputs) {
      const resource = await tx.resource.findUnique({
        where: { slug: entry.resourceSlug! },
      });
      if (!resource) continue;
      await tx.refineryJobInput.create({
        data: {
          jobId: job.id,
          resourceId: resource.id,
          quantity: entry.qty,
          unit: resource.unit,
        },
      });
      await applyInventoryMutation(tx, {
        userId: user.id,
        locationId,
        resourceId: resource.id,
        delta: -entry.qty,
        source: MutationSource.REFINERY,
        referenceId: job.id,
      });
    }

    for (const entry of outputs) {
      const resource = await tx.resource.findUnique({
        where: { slug: entry.resourceSlug! },
      });
      if (!resource) continue;
      await tx.refineryJobOutput.create({
        data: {
          jobId: job.id,
          resourceId: resource.id,
          quantity: entry.qty,
          unit: resource.unit,
        },
      });
      await applyInventoryMutation(tx, {
        userId: user.id,
        locationId,
        resourceId: resource.id,
        delta: entry.qty,
        source: MutationSource.REFINERY,
        referenceId: job.id,
      });
    }

    if (screenshot && screenshot.size > 0) {
      const file = await saveScreenshot(screenshot);
      if (file) {
        await tx.screenshot.create({
          data: {
            ...file,
            refineryJobId: job.id,
          },
        });
      }
    }
  });

  revalidatePath("/dashboard");
  revalidatePath("/inventory");
  redirect("/dashboard");
}

export async function createManualInventoryAction(formData: FormData) {
  const user = await requireUser();
  const locationId = String(formData.get("locationId") || "");
  const resourceSlug = String(formData.get("resourceSlug") || "");
  const delta = Number(formData.get("delta"));
  const note = String(formData.get("note") || "");
  if (!locationId || !resourceSlug || !Number.isFinite(delta) || delta === 0) {
    throw new Error("Ongeldige inventory mutatie.");
  }
  const resource = await prisma.resource.findUnique({ where: { slug: resourceSlug } });
  if (!resource) throw new Error("Resource niet gevonden.");

  await prisma.$transaction(async (tx) => {
    await applyInventoryMutation(tx, {
      userId: user.id,
      locationId,
      resourceId: resource.id,
      delta,
      source: MutationSource.MANUAL,
      note: note || undefined,
    });
  });

  revalidatePath("/inventory");
}

export async function createBodyAction(formData: FormData) {
  await requireUser();
  const name = String(formData.get("name") || "");
  const system = String(formData.get("system") || "Stanton");
  const type = String(formData.get("type") || "PLANET") as "PLANET" | "MOON";
  if (!name) throw new Error("Naam is verplicht.");

  await prisma.celestialBody.create({
    data: {
      name,
      slug: slugify(name),
      system,
      type,
    },
  });
  revalidatePath("/universe");
  revalidatePath("/admin/universe");
}

export async function createLocationAction(formData: FormData) {
  await requireUser();
  const bodyId = String(formData.get("bodyId") || "");
  const name = String(formData.get("name") || "");
  const type = String(formData.get("type") || "STATION") as
    | "STATION"
    | "LANDING_ZONE"
    | "OUTPOST";
  if (!bodyId || !name) throw new Error("Locatiegegevens missen.");

  await prisma.location.create({
    data: {
      bodyId,
      name,
      slug: slugify(name),
      type,
    },
  });
  revalidatePath("/universe");
  revalidatePath("/admin/universe");
}

export async function createResourceAction(formData: FormData) {
  await requireUser();
  const bodyId = String(formData.get("bodyId") || "");
  const name = String(formData.get("name") || "");
  const category = String(formData.get("category") || "Ore");
  const isMain = String(formData.get("isMain") || "") === "on";
  if (!bodyId || !name) throw new Error("Resourcegegevens missen.");

  const slug = slugify(name);
  const resource = await prisma.resource.upsert({
    where: { slug },
    update: { name, category },
    create: {
      name,
      slug,
      category,
      unit: "SCU",
    },
  });

  await prisma.bodyResource.upsert({
    where: {
      bodyId_resourceId: {
        bodyId,
        resourceId: resource.id,
      },
    },
    update: { isMain },
    create: {
      bodyId,
      resourceId: resource.id,
      isMain,
    },
  });

  revalidatePath("/universe");
  revalidatePath("/admin/universe");
}

export async function createOrganizationAction(formData: FormData) {
  const user = await requireUser();
  const name = String(formData.get("name") || "").trim();
  if (!name) throw new Error("Naam is verplicht.");

  const org = await prisma.organization.create({
    data: {
      name,
      inviteCode: randomUUID().replace(/-/g, "").slice(0, 10).toUpperCase(),
      memberships: {
        create: {
          userId: user.id,
          role: "OWNER",
        },
      },
    },
  });

  revalidatePath("/crew");
  redirect(`/crew?org=${org.id}`);
}

export async function joinOrganizationAction(formData: FormData) {
  const user = await requireUser();
  const inviteCode = String(formData.get("inviteCode") || "")
    .trim()
    .toUpperCase();
  if (!inviteCode) throw new Error("Invite code is verplicht.");

  const organization = await prisma.organization.findUnique({
    where: { inviteCode },
  });
  if (!organization) throw new Error("Organization niet gevonden.");

  await prisma.organizationMember.upsert({
    where: {
      organizationId_userId: {
        organizationId: organization.id,
        userId: user.id,
      },
    },
    update: {},
    create: {
      organizationId: organization.id,
      userId: user.id,
      role: "MEMBER",
    },
  });

  revalidatePath("/crew");
}

export async function importInventoryCsvAction(formData: FormData) {
  const user = await requireUser();
  const locationId = String(formData.get("locationId") || "");
  const file = formData.get("csv") as File | null;

  if (!locationId || !file || file.size === 0) {
    throw new Error("Locatie en CSV-bestand zijn verplicht.");
  }

  const content = await file.text();
  const rows = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (rows.length <= 1) throw new Error("CSV bevat geen data.");

  const dataRows = rows[0].toLowerCase().includes("resource_slug") ? rows.slice(1) : rows;

  await prisma.$transaction(async (tx) => {
    for (const row of dataRows) {
      const [resourceSlugRaw, deltaRaw, noteRaw] = row.split(",");
      const resourceSlug = (resourceSlugRaw || "").trim();
      const delta = Number((deltaRaw || "").trim());
      const note = (noteRaw || "").trim();

      if (!resourceSlug || !Number.isFinite(delta) || delta === 0) continue;

      const resource = await tx.resource.findUnique({
        where: { slug: resourceSlug },
      });
      if (!resource) continue;

      await applyInventoryMutation(tx, {
        userId: user.id,
        locationId,
        resourceId: resource.id,
        delta,
        source: MutationSource.MANUAL,
        note: note || "CSV import",
      });
    }
  });

  revalidatePath("/inventory");
}
