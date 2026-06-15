import { PrismaClient, TicketPriority, TicketStatus } from '@prisma/client';

const prisma = new PrismaClient();
const DEMO_USER_EMAIL = 'demo.owner@example.com';
const DEMO_USER_PASSWORD_HASH =
  '$argon2id$v=19$m=19456,t=2,p=1$n3CJohVwONdwvc/nvNEahw$2Q8TahhCchN9SJmPTxgJVtOG2CCBseyPKCjkpk29bQM';

async function main() {
  const organization = await prisma.organization.upsert({
    where: { slug: 'org_demo' },
    update: { name: 'Demo Organization' },
    create: {
      slug: 'org_demo',
      name: 'Demo Organization',
    },
  });

  const demoUser = await prisma.user.upsert({
    where: { normalizedEmail: DEMO_USER_EMAIL },
    update: {
      email: DEMO_USER_EMAIL,
      displayName: 'Demo Owner',
      isActive: true,
    },
    create: {
      email: DEMO_USER_EMAIL,
      normalizedEmail: DEMO_USER_EMAIL,
      passwordHash: DEMO_USER_PASSWORD_HASH,
      displayName: 'Demo Owner',
    },
  });

  await prisma.organizationMembership.upsert({
    where: {
      userId_organizationId: {
        userId: demoUser.id,
        organizationId: organization.id,
      },
    },
    update: { role: 'OWNER' },
    create: {
      userId: demoUser.id,
      organizationId: organization.id,
      role: 'OWNER',
    },
  });

  const existingTicket = await prisma.ticket.findFirst({
    where: {
      orgId: organization.id,
      subject: 'Sample login issue',
    },
  });

  if (!existingTicket) {
    await prisma.ticket.create({
      data: {
        orgId: organization.id,
        subject: 'Sample login issue',
        status: TicketStatus.OPEN,
        priority: TicketPriority.NORMAL,
        customerEmail: 'sample.customer@example.com',
        customerName: 'Sample Customer',
        messages: {
          create: {
            orgId: organization.id,
            direction: 'INBOUND',
            body: 'I cannot log in to my account.',
          },
        },
      },
    });
  }

  await prisma.organizationSettings.upsert({
    where: { orgId: organization.id },
    update: {},
    create: {
      orgId: organization.id,
    },
  });
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
