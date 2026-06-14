import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AgentRuntimeService } from './agent-runtime/agent-runtime.service';
import { CriticAgent } from './agent-runtime/critic.agent';
import { PrismaService } from './prisma.service';
import { RetrieverAgent } from './agent-runtime/retriever.agent';
import { ResolverAgent } from './agent-runtime/resolver.agent';
import { RouterAgent } from './agent-runtime/router.agent';
import { SupportProcessor } from './support.processor';
import { GuardrailService } from './guardrails/guardrail.service';

const redisHost = process.env.REDIS_HOST ?? 'localhost';
const redisPort = process.env.REDIS_PORT
  ? Number(process.env.REDIS_PORT)
  : 6379;

@Module({
  imports: [
    BullModule.forRoot({
      connection: { host: redisHost, port: redisPort },
    }),
    BullModule.registerQueue({ name: 'support' }),
  ],
  controllers: [AppController],
  providers: [
    AppService,
    PrismaService,
    SupportProcessor,
    AgentRuntimeService,
    RouterAgent,
    RetrieverAgent,
    ResolverAgent,
    CriticAgent,
    GuardrailService,
  ],
})
export class AppModule {}
