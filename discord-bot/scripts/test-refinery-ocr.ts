/**
 * Run: npx tsx scripts/test-refinery-ocr.ts
 * Met screenshot: npx tsx scripts/test-refinery-ocr.ts "C:\pad\naar\refinery.png"
 */
import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { extractRefineryFromBuffer } from "../src/lib/ocr.js";
import { parseRefineryQtyYieldRows } from "../src/lib/refinery-material-parse.js";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`ASSERT: ${msg}`);
}

const sampleResources = [
  { slug: "iron", name: "Iron" },
  { slug: "gold", name: "Gold" },
];

const ideal = `
ARC-L2 LIVELY PATHWAY STATION
02 // PROCESSING SELECTION
XCR Reaction
IRON (ORE) 680 405
GOLD (ORE) 241 154
`;

const noisy = `
ARC L2 LIVELY PATHWAY STAT1ON
XCR React1on HIGH SPEED
1RON (ORE) 680 405
G0LD (ORE) 241 154
IN MANIFEST: 921
`;

console.log("--- parseRefineryQtyYieldRows (ideal) ---");
const p1 = parseRefineryQtyYieldRows(ideal, sampleResources);
assert(p1.inputs.length === 2, `ideal inputs count ${p1.inputs.length}`);
assert(p1.outputs.length === 2, `ideal outputs count ${p1.outputs.length}`);
assert(
  p1.inputs.find((i) => i.resourceSlug === "iron")?.qty === 680,
  `iron qty ${JSON.stringify(p1.inputs)}`,
);
assert(
  p1.outputs.find((i) => i.resourceSlug === "iron")?.qty === 405,
  `iron yield ${JSON.stringify(p1.outputs)}`,
);
assert(p1.outputs.find((i) => i.resourceSlug === "gold")?.qty === 154, "gold yield");
console.log("OK ideal");

console.log("--- parseRefineryQtyYieldRows (noisy) ---");
const p2 = parseRefineryQtyYieldRows(noisy, sampleResources);
assert(p2.inputs.length === 2, `noisy inputs ${p2.inputs.length}`);
assert(p2.outputs.length === 2, `noisy outputs ${p2.outputs.length}`);
assert(p2.inputs.find((i) => i.resourceSlug === "iron")?.qty === 680, "noisy iron qty");
console.log("OK noisy");

const imagePath = process.argv[2];
if (imagePath) {
  console.log(`--- extractRefineryFromBuffer file: ${imagePath} ---`);
  const buf = readFileSync(imagePath);
  const prisma = new PrismaClient();
  const resources = await prisma.resource.findMany({ select: { slug: true, name: true } });
  const locationRows = await prisma.location.findMany({ include: { body: true } });
  const locationInfer = locationRows.map((l) => ({
    id: l.id,
    name: l.name,
    slug: l.slug,
    bodyName: l.body.name,
  }));
  const r = await extractRefineryFromBuffer(buf, resources, locationInfer);
  console.log("inferredMethod:", r.inferredMethod);
  console.log("inferredLocationId:", r.inferredLocationId);
  console.log("inputs:", r.inputs);
  console.log("outputs:", r.outputs);
  console.log("--- rawText (first 1200 chars) ---\n", r.rawText.slice(0, 1200));
  await prisma.$disconnect();
} else {
  console.log("(Geen image-pad: alleen unit-tests.)");
}

console.log("Alle tests geslaagd.");
