import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { extractEntriesFromScreenshot, extractRefineryFromScreenshot } from "@/lib/ocr";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const formData = await request.formData();
  const kind = String(formData.get("kind") || "mining");
  const screenshot = formData.get("screenshot") as File | null;
  if (!screenshot || screenshot.size === 0) {
    return NextResponse.json({ error: "Screenshot ontbreekt" }, { status: 400 });
  }

  const resources = await prisma.resource.findMany({
    select: { slug: true, name: true },
  });

  if (kind === "refinery") {
    const parsed = await extractRefineryFromScreenshot(screenshot, resources);
    return NextResponse.json({
      inputs: parsed.inputs,
      outputs: parsed.outputs,
      avgConfidence: parsed.avgConfidence,
      rawText: parsed.rawText,
    });
  }

  const parsed = await extractEntriesFromScreenshot(screenshot, resources);
  return NextResponse.json({
    entries: parsed.entries,
    avgConfidence: parsed.avgConfidence,
    rawText: parsed.rawText,
  });
}
