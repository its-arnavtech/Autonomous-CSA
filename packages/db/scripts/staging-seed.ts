import {
  KnowledgeArticleStatus,
  PrismaClient,
  TicketPriority,
  TicketStatus,
} from '@prisma/client';
import { validateStagingSeedEnv } from '../../../scripts/lib/staging-tools.mjs';

const prisma = new PrismaClient();

type StagingUser = {
  envName: string;
  displayName: string;
  role: 'OWNER' | 'ADMIN' | 'AGENT' | 'VIEWER';
};

const users: StagingUser[] = [
  { envName: 'STAGING_OWNER_EMAIL', displayName: 'Staging Owner', role: 'OWNER' },
  { envName: 'STAGING_ADMIN_EMAIL', displayName: 'Staging Admin', role: 'ADMIN' },
  { envName: 'STAGING_AGENT_EMAIL', displayName: 'Staging Agent', role: 'AGENT' },
  { envName: 'STAGING_VIEWER_EMAIL', displayName: 'Staging Viewer', role: 'VIEWER' },
];

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

async function main() {
  validateStagingSeedEnv(process.env);
  const passwordHash = required('STAGING_USER_PASSWORD_HASH');

  const organization = await prisma.organization.upsert({
    where: { slug: 'staging-smoke' },
    update: { name: 'Autonomous CSA Staging' },
    create: {
      slug: 'staging-smoke',
      name: 'Autonomous CSA Staging',
    },
  });

  for (const userConfig of users) {
    const email = required(userConfig.envName).toLowerCase();
    const user = await prisma.user.upsert({
      where: { normalizedEmail: email },
      update: {
        email,
        displayName: userConfig.displayName,
        isActive: true,
      },
      create: {
        email,
        normalizedEmail: email,
        passwordHash,
        displayName: userConfig.displayName,
      },
    });

    await prisma.organizationMembership.upsert({
      where: {
        userId_organizationId: {
          userId: user.id,
          organizationId: organization.id,
        },
      },
      update: { role: userConfig.role },
      create: {
        userId: user.id,
        organizationId: organization.id,
        role: userConfig.role,
      },
    });
  }

  await prisma.organizationSettings.upsert({
    where: { orgId: organization.id },
    update: {
      autoRespond: false,
      requireHumanApproval: true,
      maxAgentCostCents: 50,
      maxAutoSendCostCents: 25,
    },
    create: {
      orgId: organization.id,
      autoRespond: false,
      requireHumanApproval: true,
      maxAgentCostCents: 50,
      maxAutoSendCostCents: 25,
    },
  });

  await prisma.knowledgeArticle.upsert({
    where: { id: 'staging-knowledge-login-reset' },
    update: {
      orgId: organization.id,
      title: 'Reset a locked account',
      body: 'Verify the requester, rotate the temporary credential, and ask the customer to sign in with a new password.',
      status: KnowledgeArticleStatus.PUBLISHED,
      tags: ['login', 'password', 'account'],
    },
    create: {
      id: 'staging-knowledge-login-reset',
      orgId: organization.id,
      title: 'Reset a locked account',
      body: 'Verify the requester, rotate the temporary credential, and ask the customer to sign in with a new password.',
      status: KnowledgeArticleStatus.PUBLISHED,
      tags: ['login', 'password', 'account'],
    },
  });

  const existingTicket = await prisma.ticket.findFirst({
    where: {
      orgId: organization.id,
      subject: 'Staging sample login issue',
    },
  });

  if (!existingTicket) {
    await prisma.ticket.create({
      data: {
        orgId: organization.id,
        subject: 'Staging sample login issue',
        status: TicketStatus.OPEN,
        priority: TicketPriority.NORMAL,
        customerEmail: 'sample.customer@example.test',
        customerName: 'Sample Staging Customer',
        messages: {
          create: {
            orgId: organization.id,
            direction: 'INBOUND',
            body: 'I cannot sign in after resetting my password.',
          },
        },
      },
    });
  }

  console.log(JSON.stringify({
    event: 'staging.seed.completed',
    organizationSlug: organization.slug,
    seededUsers: users.length,
  }));
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
