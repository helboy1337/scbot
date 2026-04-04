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
import { estimateOreSaleSummary } from "./lib/ore-sale-estimate.js";
import { lookupScanHudValue } from "./lib/mining-scan-hud.js";
import {
  dominantOre,
  estimateFracturePiecesRange,
  estimateOreScu,
  parseScanComposition,
} from "./lib/mining-scan.js";
import { parseResourceLines } from "./lib/parse-lines.js";
import { prisma } from "./lib/prisma.js";
import {
  fetchCommodityPricesByDbSlug,
  formatUexTradeLocation,
  rankSellOpportunities,
  resolveUexCommodityForTrade,
  sellStatusForSeller,
  uexCommodityPageUrl,
} from "./lib/uex-trade.js";
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
      return;
    }

    if (
      focused.name === "goederen" &&
      (interaction.commandName === "handel" || interaction.commandName === "trade")
    ) {
      const q = focused.value.trim().toLowerCase();
      const all = await prisma.resource.findMany({ take: 500, orderBy: { name: "asc" } });
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
      case "scan":
        await handleScan(interaction);
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
      case "handel":
      case "trade":
        await handleHandel(interaction);
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
        "**Mining & raffinage:** `/scan hud`, `/scan compositie`, `/mining log`, `/mining lijst`, `/raffinage log`, `/raffinage lijst`, `/raffinage wis`",
        "**Handel (UEX):** `/handel verkoop` of `/trade sell` — ook goederen die niet in de DB staan (UEX lookup)",
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

async function handleScan(interaction: ChatInputCommandInteraction) {
  const sub = interaction.options.getSubcommand(true);
  if (sub === "hud") {
    await handleScanHud(interaction);
    return;
  }
  await handleScanCompositie(interaction);
}

async function handleScanHud(interaction: ChatInputCommandInteraction) {
  await defer(interaction);
  const getal = interaction.options.getNumber("getal", true);
  const matches = lookupScanHudValue(getal);

  const embed = new EmbedBuilder()
    .setTitle("Scanner HUD-getal")
    .setColor(0x2ecc71)
    .addFields({ name: "Ingevoerde waarde", value: String(Math.round(getal)), inline: true });

  if (!matches.length) {
    embed.addFields({
      name: "Resultaat",
      value:
        "Geen exacte match in de referentietabel (1–10 stenen, vaste basiswaarden per erts). " +
        "Controleer het getal of of de tabel nog overeenkomt met jouw gameversie.",
      inline: false,
    });
    embed.setFooter({
      text: "Tabel: totaal = basiswaarde × aantal rotsen. Community-referentie; patch-afhankelijk.",
    });
    await interaction.editReply({ embeds: [embed] });
    return;
  }

  const lines = matches.map(
    (m) =>
      `**${m.displayName}** (\`${m.slug}\`) — **${m.stones}** ${m.stones === 1 ? "rots" : "rotsen"} ` +
      `(${m.base} × ${m.stones} = ${getal})`,
  );

  embed.addFields({
    name: matches.length > 1 ? "Meerdere mogelijkheden" : "Match",
    value: lines.join("\n").slice(0, 1024),
    inline: false,
  });

  if (matches.length > 1) {
    embed.addFields({
      name: "Let op",
      value:
        "Meerdere ertsen delen dezelfde basiswaarde (o.a. Stieron en Quantanium). " +
        "Gebruik context op locatie of de hand-tool.",
      inline: false,
    });
  }

  embed.setFooter({
    text: "Referentietabel 1–10 stenen; geen officiële CIG-datatie.",
  });

  await interaction.editReply({ embeds: [embed] });
}

async function handleScanCompositie(interaction: ChatInputCommandInteraction) {
  await defer(interaction);
  const waarde = interaction.options.getString("waarde", true).trim();
  const massaScu = interaction.options.getNumber("massa_scu");

  const resources = await prisma.resource.findMany({ select: { slug: true, name: true } });
  const { lines, sumPercent, warnings } = parseScanComposition(waarde, resources);
  const dom = dominantOre(lines);

  const embed = new EmbedBuilder().setTitle("Mining-scan (compositie)").setColor(0x3498db);

  if (dom) {
    embed.addFields({
      name: "Hoofd-erts",
      value: `**${dom.displayName}** (\`${dom.slug}\`) — ${dom.percent}%`,
      inline: false,
    });
  } else if (lines.some((l) => l.slug)) {
    embed.addFields({
      name: "Hoofd-erts",
      value:
        "Geen duidelijke keuze op het hoogste nuttige percentage. Bekijk de regels hieronder.",
      inline: false,
    });
  } else {
    embed.addFields({
      name: "Hoofd-erts",
      value: "Geen erts herkend. Probeer bv. `40% Gold` of `Quantanium 12,5` per regel.",
      inline: false,
    });
  }

  const lineTexts = lines.map((l) => {
    if (l.isInert) return `• ${l.percent}% ${l.rawLabel} _(inert / vulstof)_`;
    if (l.slug && l.displayName)
      return `• ${l.percent}% ${l.rawLabel} → **${l.displayName}**`;
    return `• ${l.percent}% ${l.rawLabel} _(geen match)_`;
  });

  embed.addFields({
    name: "Compositie",
    value: lineTexts.length ? lineTexts.join("\n").slice(0, 1024) : "—",
    inline: false,
  });

  embed.addFields({
    name: "Som percentages",
    value: lines.length ? `${sumPercent.toFixed(1)}%` : "—",
    inline: true,
  });

  if (massaScu != null && massaScu > 0) {
    const oreScu = estimateOreScu(lines, massaScu);
    const pieces = estimateFracturePiecesRange(massaScu);
    const oreLines =
      oreScu.map((o) => `• **${o.name}**: ~${o.scu.toFixed(2)} SCU`).join("\n") || "—";
    embed.addFields({
      name: `Bij massa ${massaScu} SCU`,
      value: `${oreLines.slice(0, 900)}\n\n**Fracture-brokken (ruwe bandbreedte):** ${pieces.low}–${pieces.high}\n_Afhankelijk van laser, instellingen en patch._`,
      inline: false,
    });
  } else {
    embed.setFooter({
      text: "Tip: optioneel `massa_scu` invullen voor SCU per erts + grove fracture-schatting.",
    });
  }

  if (warnings.length) {
    embed.addFields({
      name: "Let op",
      value: warnings.join("\n").slice(0, 1024),
      inline: false,
    });
  }

  await interaction.editReply({ embeds: [embed] });
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

  if (sub === "wis") {
    await defer(interaction);
    const confirm = interaction.options.getString("bevestig", true).trim().toUpperCase();
    if (confirm !== "WIS") {
      await interaction.editReply({
        content: "Niet uitgevoerd. Zet **bevestig** exact op `WIS` (hoofdletters).",
      });
      return;
    }
    const ookVoorraad = interaction.options.getBoolean("ook_voorraad") ?? false;
    const deletedJobs = await prisma.refineryJob.deleteMany({ where: { userId: discordUser.id } });
    let voorraadMsg = "";
    if (ookVoorraad) {
      const mut = await prisma.inventoryMutation.deleteMany({ where: { userId: discordUser.id } });
      const bal = await prisma.inventoryBalance.deleteMany({ where: { userId: discordUser.id } });
      voorraadMsg = ` Voorraad gewist (${bal.count} balances, ${mut.count} mutaties).`;
    }
    await interaction.editReply({
      content: `**${deletedJobs.count}** raffinage-job(s) verwijderd.${voorraadMsg}`,
    });
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

    const outputLinesForEstimate: { resourceSlug: string; qty: number; name?: string }[] = [];
    for (const entry of outputs) {
      const resource = await prisma.resource.findUnique({ where: { slug: entry.resourceSlug } });
      if (!resource) continue;
      outputLinesForEstimate.push({
        resourceSlug: entry.resourceSlug,
        qty: entry.qty,
        name: resource.name,
      });
    }

    const est = estimateOreSaleSummary(outputLinesForEstimate);
    const replyParts = [
      `Raffinage-job opgeslagen @ **${location.name}** (${method}).`,
      "",
      "**Geschatte verkoopwaarde** (output-yield × indicatieve prijs per SCU — **geen** live markt):",
      ...est.lines,
    ];
    if (est.totalMin > 0 || est.totalMax > 0) {
      replyParts.push(
        "",
        `**Totaal (bekende ertsen):** ~${est.totalMin.toLocaleString("nl-NL")} – ~${est.totalMax.toLocaleString("nl-NL")} aUEC`,
      );
    }
    replyParts.push(
      "",
      "_Prijzen verschillen sterk per terminal, patch en economie; check o.a. [UEX](https://uexcorp.space/commodities) of in-game._",
    );

    await interaction.editReply({ content: replyParts.join("\n").slice(0, 2000) });
  }
}

async function handleHandel(interaction: ChatInputCommandInteraction) {
  const sub = interaction.options.getSubcommand();
  if (sub !== "verkoop" && sub !== "sell") {
    await safeReply(interaction, { content: "Unknown subcommand.", ephemeral: true });
    return;
  }

  await defer(interaction);

  try {
    const goederenRaw = interaction.options.getString("goederen", true).trim();
    const scu = interaction.options.getNumber("scu", true);
    const alleenRuim =
      interaction.options.getBoolean("alleen_ruime_vraag") ?? false;
    const maxBoxScu = interaction.options.getInteger("max_box_scu");

    const slugKey = goederenRaw.toLowerCase();
    const dbResource = await prisma.resource.findUnique({ where: { slug: slugKey } });

    let rows: Awaited<ReturnType<typeof fetchCommodityPricesByDbSlug>>;
    let displayName: string;
    let resolvedSlug: string;
    let resolutionHint: string | null = null;

    if (dbResource) {
      displayName = dbResource.name;
      resolvedSlug = dbResource.slug;
      rows = await fetchCommodityPricesByDbSlug(dbResource.slug);
      if (!rows.length) {
        const uex = await resolveUexCommodityForTrade(dbResource.name);
        if (uex) {
          rows = uex.rows;
          displayName = uex.displayName;
          resolvedSlug = uex.slug;
          resolutionHint = `_No UEX rows for DB slug \`${dbResource.slug}\`; matched **${uex.displayName}** on UEX._`;
        }
      }
    } else {
      const uex = await resolveUexCommodityForTrade(goederenRaw);
      if (!uex) {
        await interaction.editReply({
          content: `Unknown **${goederenRaw}**: not in bot database and no UEX commodity match. Try [UEX commodities](https://uexcorp.space/commodities) or a clearer name (e.g. \`stims\`, \`iron\`).`,
        });
        return;
      }
      rows = uex.rows;
      displayName = uex.displayName;
      resolvedSlug = uex.slug;
      resolutionHint =
        uex.matchKind === "catalog"
          ? `_Resolved from UEX catalog (your input: “${goederenRaw}” → **${uex.displayName}**, slug \`${uex.slug}\`)._`
          : `_Resolved on UEX (not in bot database). Using **${uex.displayName}** (\`${uex.slug}\`)._`;
    }

    if (!rows.length) {
      await interaction.editReply({
        content: `No UEX trade rows for **${displayName}** (\`${resolvedSlug}\`). Check [UEX](https://uexcorp.space/commodities).`,
      });
      return;
    }

    const ranked = rankSellOpportunities(rows, {
      userScu: scu,
      alleenRuimeVraag: alleenRuim,
      maxCargoBoxScu: maxBoxScu,
    });

    if (!ranked.length) {
      const hints = [
        "No terminals matched:",
        "• **price > 0** and buy-side not **no demand** (status 7)",
      ];
      if (alleenRuim) hints.push("• **alleen_ruime_vraag** removes high fill levels");
      if (maxBoxScu != null) {
        hints.push(
          `• **max_box_scu ${maxBoxScu}** — UEX \`container_sizes\` must include **${maxBoxScu}** (or unknown sizes still pass)`,
        );
      }
      hints.push("", "Relax an option or try after the next UEX update (~hourly).");
      await interaction.editReply({ content: hints.join("\n") });
      return;
    }

    const showMax = 12;
    const top = ranked.slice(0, showMax);
    const lines: string[] = [
      `**${displayName}** · sell **${scu} SCU**`,
      "_UEX community data (not live in-game). **Buy-side status:** more room for you means the terminal wants to **fill up** — that’s **better** for selling. Less room = **worse** for you._",
    ];
    if (resolutionHint) lines.push("", resolutionHint);
    if (maxBoxScu != null) {
      lines.push(
        "",
        `_**max_box_scu ${maxBoxScu}**: UEX \`container_sizes\` must include **${maxBoxScu}** (rows with no size data are kept — double-check in-game)._`,
      );
    }
    lines.push(
      "",
      `_**${rows.length}** UEX terminals · **${ranked.length}** pass filters · showing **${top.length}** best_`,
      "",
    );

    for (let i = 0; i < top.length; i++) {
      const r = top[i]!;
      const stLabel = sellStatusForSeller(r.status_sell);
      const loc = formatUexTradeLocation(r);
      const warn = r.demandNote ? ` _${r.demandNote}_` : "";
      lines.push(
        `**${i + 1}.** ${loc}`,
        `   ~**${r.price_sell.toLocaleString("en-US")}** aUEC/SCU → gross ~**${r.estGrossAuec.toLocaleString("en-US")}** aUEC · **${stLabel}**${warn}`,
      );
      if (maxBoxScu != null) {
        const grids = r.container_sizes?.trim()
          ? `\`container_sizes\`: ${r.container_sizes}`
          : "no grid list from UEX";
        lines.push(`   _${grids}_`);
      }
      lines.push("");
    }

    lines.push(
      `[All terminals on UEX](${uexCommodityPageUrl(resolvedSlug)}) · verify in-game.`,
    );

    const embed = new EmbedBuilder()
      .setTitle("Sell — top options")
      .setDescription(lines.join("\n").slice(0, 4096))
      .setColor(0x5865f2)
      .setFooter({
        text: `UEX · ${resolvedSlug} · game ${top[0]?.game_version ?? "?"}`,
      });

    await interaction.editReply({ embeds: [embed] });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown error";
    await interaction.editReply({
      content: `Could not load UEX: ${msg}`,
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
