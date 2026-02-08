import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { SupportProcessor } from './support.processor';

const redisHost = process.env.REDIS_HOST ?? 'localhost';
const redisPort = process.env.REDIS_PORT ? Number(process.env.REDIS_PORT) : 6379;

@Module({
  imports: [
    BullModule.forRoot({
      connection: { host: redisHost, port: redisPort },
    }),
    BullModule.registerQueue({ name: 'support' }),
  ],
  controllers: [AppController],
  providers: [AppService, SupportProcessor],
})
export class AppModule {}
