import { PrismaClient, TicketPriority, TicketStatus } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const organization = await prisma.organization.upsert({
    where: { slug: 'org_demo' },
    update: { name: 'Demo Organization' },
    create: {
      slug: 'org_demo',
      name: 'Demo Organization',
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
