import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rows = await prisma.inventoryBalance.findMany({
    where: { userId: user.id },
    include: { location: true, resource: true },
    orderBy: [{ location: { name: "asc" } }, { resource: { name: "asc" } }],
  });

  const csv = [
    "station,resource_slug,resource_name,quantity,unit",
    ...rows.map(
      (row) =>
        `${row.location.slug},${row.resource.slug},${row.resource.name},${row.quantity},${row.resource.unit}`,
    ),
  ].join("\n");

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="inventory-export.csv"',
    },
  });
}
