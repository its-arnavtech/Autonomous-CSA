import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import {
  getQueueConnection,
  getQueueDefaults,
  SUPPORT_DEAD_LETTER_QUEUE_NAME,
  SUPPORT_QUEUE_NAME,
} from './queue/queue.config';
import { AgentRuntimeService } from './agent-runtime/agent-runtime.service';
import { CriticAgent } from './agent-runtime/critic.agent';
import { RetrieverAgent } from './agent-runtime/retriever.agent';
import { ResolverAgent } from './agent-runtime/resolver.agent';
import { RouterAgent } from './agent-runtime/router.agent';
import { SupportProcessor } from './support.processor';
import { GuardrailService } from './guardrails/guardrail.service';
import { LlmService } from './llm/llm.service';
import { ObservabilityModule } from './observability/observability.module';
import { PrismaModule } from './prisma.module';
import { QueueLifecycleService } from './queue/queue-lifecycle.service';
import { WorkerShutdownStateService } from './runtime/worker-shutdown-state.service';

const queueDefaults = getQueueDefaults();

@Module({
  imports: [
    BullModule.forRoot({
      connection: getQueueConnection(),
      defaultJobOptions: {
        attempts: queueDefaults.attempts,
        backoff: {
          type: 'exponential',
          delay: queueDefaults.backoffBaseMs,
        },
        removeOnComplete: {
          count: queueDefaults.removeOnCompleteCount,
        },
        removeOnFail: {
          count: queueDefaults.removeOnFailCount,
        },
      },
    }),
    BullModule.registerQueue({ name: SUPPORT_QUEUE_NAME }),
    BullModule.registerQueue({ name: SUPPORT_DEAD_LETTER_QUEUE_NAME }),
    PrismaModule,
    ObservabilityModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    SupportProcessor,
    AgentRuntimeService,
    RouterAgent,
    RetrieverAgent,
    ResolverAgent,
    CriticAgent,
    GuardrailService,
    LlmService,
    QueueLifecycleService,
    WorkerShutdownStateService,
  ],
})
export class AppModule {}
