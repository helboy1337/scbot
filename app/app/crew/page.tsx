import { createOrganizationAction, joinOrganizationAction } from "@/app/actions";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export default async function CrewPage() {
  const user = await requireUser();

  const memberships = await prisma.organizationMember.findMany({
    where: { userId: user.id },
    include: {
      organization: {
        include: {
          memberships: {
            include: { user: true },
          },
        },
      },
    },
    orderBy: { joinedAt: "desc" },
  });

  const memberIds = memberships.flatMap((m) =>
    m.organization.memberships.map((mm) => mm.userId),
  );

  const sharedBalances = await prisma.inventoryBalance.groupBy({
    by: ["resourceId"],
    where: {
      userId: { in: memberIds.length ? memberIds : [user.id] },
    },
    _sum: { quantity: true },
  });

  const resources = await prisma.resource.findMany({
    where: { id: { in: sharedBalances.map((b) => b.resourceId) } },
  });
  const resourceMap = new Map(resources.map((r) => [r.id, r]));

  return (
    <div className="space-y-6">
      <section className="sc-shell rounded-2xl p-5">
        <h1 className="sc-title text-xl font-bold sm:text-2xl">Crew samenwerking</h1>
        <p className="sc-muted mt-1 text-sm">
          Maak een crew aan of join via invite code. Hieronder zie je gedeelde resource totalen.
        </p>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <form action={createOrganizationAction} className="sc-card p-5">
          <h2 className="font-semibold">Nieuwe crew</h2>
          <div className="mt-3 flex gap-2">
            <input
              name="name"
              required
              placeholder="Crew naam"
              className="sc-input px-3 py-2"
            />
            <button className="sc-btn-primary px-3 py-2">Aanmaken</button>
          </div>
        </form>
        <form action={joinOrganizationAction} className="sc-card p-5">
          <h2 className="font-semibold">Join crew</h2>
          <div className="mt-3 flex gap-2">
            <input
              name="inviteCode"
              required
              placeholder="Invite code"
              className="sc-input px-3 py-2 uppercase"
            />
            <button className="sc-btn-primary px-3 py-2">Join</button>
          </div>
        </form>
      </section>

      <section className="sc-card p-5">
        <h2 className="font-semibold">Jouw crews</h2>
        <ul className="mt-3 space-y-3 text-sm">
          {memberships.map((membership) => (
            <li key={membership.id} className="sc-card-strong rounded p-3">
              <p className="font-medium">{membership.organization.name}</p>
              <p className="sc-muted">Invite: {membership.organization.inviteCode}</p>
              <p className="sc-muted">
                Members:{" "}
                {membership.organization.memberships
                  .map((mm) => mm.user.scHandle || mm.user.email)
                  .join(", ")}
              </p>
            </li>
          ))}
        </ul>
      </section>

      <section className="sc-card p-5">
        <h2 className="font-semibold">Gedeelde resource totalen</h2>
        <ul className="mt-3 grid gap-2 md:grid-cols-2">
          {sharedBalances.map((balance) => (
            <li key={balance.resourceId} className="sc-card-strong rounded p-2 text-sm">
              {resourceMap.get(balance.resourceId)?.name || balance.resourceId}:{" "}
              {(balance._sum.quantity || 0).toFixed(2)}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
