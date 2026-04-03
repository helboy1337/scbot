import { PrismaClient } from "@prisma/client";

const p = new PrismaClient();
const catalog = await p.refineryMethod.findMany({ orderBy: { label: "asc" } });
console.log("RefineryMethod in catalogus (DB):", catalog.length, catalog.map((m) => m.label));

const rows = await p.refineryJob.findMany({ select: { method: true }, distinct: ["method"] });
console.log(
  "Distinct method-strings op opgeslagen jobs:",
  rows.length ? rows.map((r) => r.method) : "(nog geen jobs)",
);
console.log("Totaal refinery jobs:", await p.refineryJob.count());
await p.$disconnect();
