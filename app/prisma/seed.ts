import { BodyType, LocationType, PrismaClient } from "@prisma/client";
import seed from "./seed-data.json";

const prisma = new PrismaClient();

async function main() {
  for (const bodyData of seed.bodies) {
    const body = await prisma.celestialBody.upsert({
      where: { slug: bodyData.slug },
      update: {
        name: bodyData.name,
        type: bodyData.type as BodyType,
        system: bodyData.system,
        description: bodyData.description,
      },
      create: {
        slug: bodyData.slug,
        name: bodyData.name,
        type: bodyData.type as BodyType,
        system: bodyData.system,
        description: bodyData.description,
      },
    });

    for (const loc of bodyData.locations) {
      await prisma.location.upsert({
        where: { slug: loc.slug },
        update: {
          name: loc.name,
          type: loc.type as LocationType,
          bodyId: body.id,
        },
        create: {
          slug: loc.slug,
          name: loc.name,
          type: loc.type as LocationType,
          bodyId: body.id,
        },
      });
    }

    for (const res of bodyData.resources) {
      const resource = await prisma.resource.upsert({
        where: { slug: res.slug },
        update: {
          name: res.name,
          category: res.category,
        },
        create: {
          slug: res.slug,
          name: res.name,
          category: res.category,
          unit: "SCU",
        },
      });

      await prisma.bodyResource.upsert({
        where: {
          bodyId_resourceId: {
            bodyId: body.id,
            resourceId: resource.id,
          },
        },
        update: {
          isMain: res.isMain,
        },
        create: {
          bodyId: body.id,
          resourceId: resource.id,
          isMain: res.isMain,
        },
      });
    }
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
