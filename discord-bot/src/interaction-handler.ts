import { MutationSource } from "@prisma/client";
import {
  ApplicationCommandOptionType,
  type AutocompleteInteraction,
  type ChatInputCommandInteraction,
  EmbedBuilder,
  MessageFlags,
} from "discord.js";
import { createTrackedIssue } from "./lib/github.js";
import { applyInventoryMutation } from "./lib/inventory.js";
import { extractEntriesFromBuffer, extractRefineryFromBuffer } from "./lib/ocr.js";
import { parseResourceLines } from "./lib/parse-lines.js";
import { prisma } from "./lib/prisma.js";
import { ensureDiscordUser } from "./lib/user.js";

async function safeReply(
  interaction: ChatInputCommandInteraction,
  payload: { content?: string; embeds?: EmbedBuilder[]; ephemeral?: boolean },
) {
  const flags = payload.ephemeral ? MessageFlags.Ephemeral : undefined;
  if (interaction.deferred || interaction.replied) {
    await interaction.editReply({
      content: payload.content,
      embeds: payload.embeds,
    });
  } else {
    await interaction.reply({
      content: payload.content,
      embeds: payload.embeds,
      flags,
    });
  }
}

async function defer(interaction: ChatInputCommandInteraction, ephemeral = true) {
  await interaction.deferReply({ flags: ephemeral ? MessageFlags.Ephemeral : undefined });
}

async function attachmentToBuffer(url: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download mislukt (${res.status})`);
  return Buffer.from(await res.arrayBuffer());
}

export async function handleAutocomplete(interaction: AutocompleteInteraction) {
  const focused = interaction.options.getFocused(true);
  if (focused.type !== ApplicationCommandOptionType.String) {
    await interaction.respond([]);
    return;
  }

  try {
    if (focused.name === "locatie") {
      const q = focused.value.trim().toLowerCase();
      const all = await prisma.location.findMany({
        take: 200,
        include: { body: true },
      });
      const locs = all
        .filter(
          (l) =>
            !q ||
            l.slug.toLowerCase().includes(q) ||
            l.name.toLowerCase().includes(q) ||
            l.body.name.toLowerCase().includes(q),
        )
        .slice(0, 25);
      await interaction.respond(
        locs.map((l) => ({
          name: `${l.body.name} — ${l.name}`.slice(0, 100),
          value: l.id,
        })),
      );
      return;
    }

    if (focused.name === "methode" && interaction.commandName === "raffinage") {
      const q = focused.value.trim().toLowerCase();
      const methods = await prisma.refineryMethod.findMany({ orderBy: { label: "asc" } });
      const filtered = methods
        .filter(
          (m) =>
            !q ||
            m.label.toLowerCase().includes(q) ||
            m.slug.includes(q.replace(/\s+/g, "-")),
        )
        .slice(0, 25);
      await interaction.respond(
        filtered.map((m) => ({
          name: m.label.slice(0, 100),
          value: m.label.slice(0, 64),
        })),
      );
      return;
    }

    if (focused.name === "resource" && interaction.commandName === "voorraad") {
      const q = focused.value.trim().toLowerCase();
      const all = await prisma.resource.findMany({ take: 500 });
      const res = all
        .filter(
          (r) => !q || r.slug.toLowerCase().includes(q) || r.name.toLowerCase().includes(q),
        )
        .slice(0, 25);
      await interaction.respond(
        res.map((r) => ({
          name: `${r.name} (${r.slug})`.slice(0, 100),
          value: r.slug,
        })),
      );
    }
  } catch {
    await interaction.respond([]);
  }
}

export async function handleChatCommand(interaction: ChatInputCommandInteraction) {
  const { commandName } = interaction;

  try {
    switch (commandName) {
      case "help":
        await handleHelp(interaction);
        break;
      case "bug":
        await handleBugIdee(interaction, "bug");
        break;
      case "idee":
        await handleBugIdee(interaction, "feature");
        break;
      case "profiel":
        await handleProfiel(interaction);
        break;
      case "universum":
        await handleUniversum(interaction);
        break;
      case "mining":
        await handleMining(interaction);
        break;
      case "raffinage":
        await handleRaffinage(interaction);
        break;
      case "voorraad":
        await handleVoorraad(interaction);
        break;
      default:
        await safeReply(interaction, { content: "Onbekend commando.", ephemeral: true });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Er ging iets mis.";
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply({ content: `Fout: ${msg}` });
    } else {
      await interaction.reply({ content: `Fout: ${msg}`, flags: MessageFlags.Ephemeral });
    }
  }
}

async function handleHelp(interaction: ChatInputCommandInteraction) {
  const embed = new EmbedBuilder()
    .setTitle("SC Discord-bot")
    .setDescription(
      [
        "**Mining & raffinage:** `/mining log`, `/mining lijst`, `/raffinage log`, `/raffinage lijst`",
        "**Voorraad:** `/voorraad toon`, `/voorraad pas_aan`",
        "**Universum:** `/universum zoek`",
        "**Profiel:** `/profiel toon`, `/profiel rsi`",
        "**GitHub (auto-agent):** `/bug`, `/idee` — maakt issues met label `auto-agent` als `GITHUB_*` is ingesteld.",
        "",
        "Handmatig: `slug:aantal` per regel. **OCR:** mining — lege `regels` + screenshot. Raffinage — screenshot alleen mag; bot leest inputs/outputs en probeert locatie/methode uit de UI.",
      ].join("\n"),
    )
    .setColor(0x5865f2);
  await safeReply(interaction, { embeds: [embed], ephemeral: true });
}

async function handleBugIdee(
  interaction: ChatInputCommandInteraction,
  kind: "bug" | "feature",
) {
  await defer(interaction);
  const titel = interaction.options.getString("titel", true);
  const beschrijving = interaction.options.getString("beschrijving", true);
  const created = await createTrackedIssue({
    kind,
    title: titel,
    body: beschrijving,
    reporterTag: interaction.user.tag,
    reporterId: interaction.user.id,
  });

  if (!created) {
    await interaction.editReply({
      content:
        "GitHub is niet geconfigureerd. Zet `GITHUB_TOKEN`, `GITHUB_REPO_OWNER` en `GITHUB_REPO_NAME` in `.env`.",
    });
    return;
  }

  await interaction.editReply({
    content: `Issue **#${created.number}** aangemaakt: ${created.htmlUrl}`,
  });
}

async function handleProfiel(interaction: ChatInputCommandInteraction) {
  const sub = interaction.options.getSubcommand();
  const user = await ensureDiscordUser(interaction.user.id);

  if (sub === "toon") {
    await safeReply(interaction, {
      content: user.rsiHandle
        ? `RSI-handle: **${user.rsiHandle}**`
        : "Nog geen RSI-handle. Gebruik `/profiel rsi handle:jouwhandle`.",
      ephemeral: true,
    });
    return;
  }

  if (sub === "rsi") {
    const handle = interaction.options.getString("handle", true).trim();
    await prisma.user.update({
      where: { id: user.id },
      data: { rsiHandle: handle },
    });
    await safeReply(interaction, {
      content: `RSI-handle opgeslagen: **${handle}**`,
      ephemeral: true,
    });
  }
}

async function handleUniversum(interaction: ChatInputCommandInteraction) {
  const sub = interaction.options.getSubcommand();
  if (sub !== "zoek") return;

  await defer(interaction);
  const query = interaction.options.getString("query", true).trim().toLowerCase();
  if (!query) {
    await interaction.editReply({ content: "Geef een zoekterm." });
    return;
  }

  const allBodies = await prisma.celestialBody.findMany({ include: { locations: true } });
  const bodies = allBodies
    .filter(
      (b) =>
        b.name.toLowerCase().includes(query) ||
        b.slug.toLowerCase().includes(query) ||
        b.system.toLowerCase().includes(query),
    )
    .slice(0, 5);

  const allLocs = await prisma.location.findMany({ include: { body: true } });
  const locs = allLocs
    .filter(
      (l) => l.name.toLowerCase().includes(query) || l.slug.toLowerCase().includes(query),
    )
    .slice(0, 10);

  const lines: string[] = [];
  for (const b of bodies) {
    lines.push(`**${b.name}** (${b.type}, ${b.system}) — ${b.locations.map((l) => l.name).join(", ")}`);
  }
  for (const l of locs) {
    lines.push(`• ${l.body.name} → **${l.name}** [\`${l.slug}\`]`);
  }

  await interaction.editReply({
    content: lines.length ? lines.slice(0, 15).join("\n") : "Geen resultaten.",
  });
}

async function handleMining(interaction: ChatInputCommandInteraction) {
  const sub = interaction.options.getSubcommand();
  const discordUser = await ensureDiscordUser(interaction.user.id);

  if (sub === "lijst") {
    await defer(interaction);
    const runs = await prisma.miningRun.findMany({
      where: { userId: discordUser.id },
      orderBy: { createdAt: "desc" },
      take: 5,
      include: { location: { include: { body: true } }, items: { include: { resource: true } } },
    });
    if (!runs.length) {
      await interaction.editReply({ content: "Nog geen mining-runs." });
      return;
    }
    const text = runs
      .map((r) => {
        const items = r.items.map((i) => `${i.resource.slug}:${i.quantity}`).join(", ");
        return `**${r.createdAt.toISOString().slice(0, 10)}** ${r.location.body.name} / ${r.location.name} — ${items}`;
      })
      .join("\n");
    await interaction.editReply({ content: text.slice(0, 2000) });
    return;
  }

  if (sub === "log") {
    await defer(interaction);
    const locationId = interaction.options.getString("locatie", true);
    let regels = interaction.options.getString("regels")?.trim() ?? "";
    const schip = interaction.options.getString("schip");
    const notitie = interaction.options.getString("notitie");
    const screenshot = interaction.options.getAttachment("screenshot");

    const location = await prisma.location.findUnique({ where: { id: locationId } });
    if (!location) {
      await interaction.editReply({ content: "Locatie ongeldig. Kies opnieuw via autocomplete." });
      return;
    }

    const resources = await prisma.resource.findMany({ select: { slug: true, name: true } });
    let ocrNote: string | null = null;
    let parsed = parseResourceLines(regels);

    if (parsed.length === 0 && screenshot) {
      const buf = await attachmentToBuffer(screenshot.url);
      const ocr = await extractEntriesFromBuffer(buf, resources);
      parsed = ocr.entries.map((e) => ({ resourceSlug: e.resourceSlug, qty: e.qty }));
      ocrNote = `OCR (${parsed.length} regels, ~${Math.round(ocr.avgConfidence * 100)}% confidence).`;
    }

    if (parsed.length === 0) {
      await interaction.editReply({
        content: "Geen regels en geen bruikbare OCR. Vul `regels` in of upload een screenshot.",
      });
      return;
    }

    await prisma.$transaction(async (tx) => {
      const run = await tx.miningRun.create({
        data: {
          userId: discordUser.id,
          locationId,
          shipVehicle: schip ?? null,
          notes: [notitie, ocrNote, screenshot ? `Screenshot: ${screenshot.url}` : null]
            .filter(Boolean)
            .join(" | ") || null,
        },
      });

      for (const entry of parsed) {
        const resource = await tx.resource.findUnique({ where: { slug: entry.resourceSlug } });
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
          userId: discordUser.id,
          locationId,
          resourceId: resource.id,
          delta: entry.qty,
          source: MutationSource.MINING,
          referenceId: run.id,
        });
      }
    });

    await interaction.editReply({
      content: `Mining-run opgeslagen op **${location.name}** (${parsed.length} regels verwerkt).`,
    });
  }
}

async function handleRaffinage(interaction: ChatInputCommandInteraction) {
  const sub = interaction.options.getSubcommand();
  const discordUser = await ensureDiscordUser(interaction.user.id);

  if (sub === "lijst") {
    await defer(interaction);
    const jobs = await prisma.refineryJob.findMany({
      where: { userId: discordUser.id },
      orderBy: { createdAt: "desc" },
      take: 5,
      include: {
        location: { include: { body: true } },
        inputs: { include: { resource: true } },
        outputs: { include: { resource: true } },
      },
    });
    if (!jobs.length) {
      await interaction.editReply({ content: "Nog geen raffinage-jobs." });
      return;
    }
    const text = jobs
      .map((j) => {
        const ins = j.inputs.map((i) => `${i.resource.slug}:${i.quantity}`).join(", ");
        const outs = j.outputs.map((i) => `${i.resource.slug}:${i.quantity}`).join(", ");
        return `**${j.createdAt.toISOString().slice(0, 10)}** ${j.method} @ ${j.location.name} — in: ${ins} → out: ${outs}`;
      })
      .join("\n");
    await interaction.editReply({ content: text.slice(0, 2000) });
    return;
  }

  if (sub === "log") {
    await defer(interaction);
    const locationIdOpt = interaction.options.getString("locatie");
    const methodOpt = interaction.options.getString("methode");
    let inputsRaw = interaction.options.getString("inputs")?.trim() ?? "";
    let outputsRaw = interaction.options.getString("outputs")?.trim() ?? "";
    const cost = interaction.options.getInteger("kosten_auec");
    const duration = interaction.options.getNumber("duur_uren");
    const notitie = interaction.options.getString("notitie");
    const screenshot = interaction.options.getAttachment("screenshot");

    const resources = await prisma.resource.findMany({ select: { slug: true, name: true } });
    const locationRows = await prisma.location.findMany({ include: { body: true } });
    const locationInfer = locationRows.map((l) => ({
      id: l.id,
      name: l.name,
      slug: l.slug,
      bodyName: l.body.name,
    }));

    if (!screenshot && (!locationIdOpt || !methodOpt?.trim())) {
      await interaction.editReply({
        content:
          "Zonder screenshot: kies **locatie** en vul **methode** in. Of upload een **screenshot** — dan leest de bot inputs/outputs en probeert locatie en methode uit de game-UI.",
      });
      return;
    }

    let inputs = parseResourceLines(inputsRaw);
    let outputs = parseResourceLines(outputsRaw);
    let ocrNote: string | null = null;
    let resolvedLocationId = locationIdOpt ?? null;
    let method = methodOpt?.trim() ?? "";

    if (screenshot) {
      const buf = await attachmentToBuffer(screenshot.url);
      const ocr = await extractRefineryFromBuffer(buf, resources, locationInfer);
      if (inputs.length === 0) inputs = ocr.inputs.map((e) => ({ resourceSlug: e.resourceSlug, qty: e.qty }));
      if (outputs.length === 0) outputs = ocr.outputs.map((e) => ({ resourceSlug: e.resourceSlug, qty: e.qty }));
      if (!resolvedLocationId && ocr.inferredLocationId) resolvedLocationId = ocr.inferredLocationId;
      if (!method && ocr.inferredMethod) method = ocr.inferredMethod;
      const inferBits = [
        !locationIdOpt && ocr.inferredLocationId ? "locatie uit OCR" : null,
        !methodOpt?.trim() && ocr.inferredMethod ? `methode \`${ocr.inferredMethod}\` (OCR)` : null,
      ].filter(Boolean);
      ocrNote = [
        `OCR: ${inputs.length} input(s) (ruwe QTY), ${outputs.length} output(s) (yield uit UI), ~${Math.round(ocr.avgConfidence * 100)}% confidence`,
        inferBits.length ? `(${inferBits.join(", ")})` : null,
      ]
        .filter(Boolean)
        .join(" ");
    }

    if (inputs.length === 0 || outputs.length === 0) {
      await interaction.editReply({
        content:
          "Geen bruikbare inputs/outputs. Vul **inputs** en **outputs** in (slug:aantal), of upload een duidelijke screenshot van het raffinage-scherm.",
      });
      return;
    }

    if (!resolvedLocationId) {
      await interaction.editReply({
        content:
          "Geen locatie: kies **locatie** via autocomplete, of gebruik een screenshot waar station-/locatienaam in de UI leesbaar is.",
      });
      return;
    }

    if (!method) {
      await interaction.editReply({
        content:
          "Geen methode: vul **methode** in (bijv. Dinyx, Pyro), of zorg dat die tekst op de screenshot staat.",
      });
      return;
    }

    const location = await prisma.location.findUnique({ where: { id: resolvedLocationId } });
    if (!location) {
      await interaction.editReply({ content: "Locatie ongeldig. Kies opnieuw via autocomplete." });
      return;
    }

    await prisma.$transaction(async (tx) => {
      const job = await tx.refineryJob.create({
        data: {
          userId: discordUser.id,
          locationId: resolvedLocationId,
          method,
          costAuec: cost ?? null,
          durationHours: duration ?? null,
          notes: [notitie, ocrNote, screenshot ? `Screenshot: ${screenshot.url}` : null]
            .filter(Boolean)
            .join(" | ") || null,
        },
      });

      for (const entry of inputs) {
        const resource = await tx.resource.findUnique({ where: { slug: entry.resourceSlug } });
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
          userId: discordUser.id,
          locationId: resolvedLocationId,
          resourceId: resource.id,
          delta: -entry.qty,
          source: MutationSource.REFINERY,
          referenceId: job.id,
        });
      }

      for (const entry of outputs) {
        const resource = await tx.resource.findUnique({ where: { slug: entry.resourceSlug } });
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
          userId: discordUser.id,
          locationId: resolvedLocationId,
          resourceId: resource.id,
          delta: entry.qty,
          source: MutationSource.REFINERY,
          referenceId: job.id,
        });
      }
    });

    await interaction.editReply({
      content: `Raffinage-job opgeslagen @ **${location.name}** (${method}).`,
    });
  }
}

async function handleVoorraad(interaction: ChatInputCommandInteraction) {
  const sub = interaction.options.getSubcommand();
  const discordUser = await ensureDiscordUser(interaction.user.id);

  if (sub === "toon") {
    await defer(interaction);
    const balances = await prisma.inventoryBalance.findMany({
      where: { userId: discordUser.id, quantity: { gt: 0 } },
      orderBy: { quantity: "desc" },
      take: 20,
      include: { location: { include: { body: true } }, resource: true },
    });
    if (!balances.length) {
      await interaction.editReply({ content: "Geen voorraadregels (nog). Log mining of raffinage." });
      return;
    }
    const lines = balances.map(
      (b) =>
        `• **${b.resource.name}** ${b.quantity} ${b.resource.unit} @ ${b.location.body.name} / ${b.location.name}`,
    );
    await interaction.editReply({ content: lines.join("\n").slice(0, 2000) });
    return;
  }

  if (sub === "pas_aan") {
    await defer(interaction);
    const locationId = interaction.options.getString("locatie", true);
    const slug = interaction.options.getString("resource", true).trim().toLowerCase();
    const delta = interaction.options.getNumber("delta", true);
    const note = interaction.options.getString("notitie");

    const resource = await prisma.resource.findUnique({ where: { slug } });
    if (!resource) {
      await interaction.editReply({ content: `Resource \`${slug}\` niet gevonden.` });
      return;
    }

    await prisma.$transaction(async (tx) => {
      await applyInventoryMutation(tx, {
        userId: discordUser.id,
        locationId,
        resourceId: resource.id,
        delta,
        source: MutationSource.MANUAL,
        note: note ?? undefined,
      });
    });

    await interaction.editReply({ content: `Voorraad bijgewerkt: **${resource.name}** ${delta >= 0 ? "+" : ""}${delta} SCU.` });
  }
}
