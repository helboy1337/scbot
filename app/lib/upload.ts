import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

export async function saveScreenshot(file: File) {
  if (!file || file.size === 0) return null;
  if (!file.type.startsWith("image/")) return null;

  const bytes = Buffer.from(await file.arrayBuffer());
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const fileName = `${Date.now()}-${randomUUID()}-${safeName}`;
  const uploadDir = join(process.cwd(), "public", "uploads");
  await mkdir(uploadDir, { recursive: true });
  const fullPath = join(uploadDir, fileName);
  await writeFile(fullPath, bytes);

  return {
    filePath: `/uploads/${fileName}`,
    originalName: file.name,
    mimeType: file.type,
  };
}
