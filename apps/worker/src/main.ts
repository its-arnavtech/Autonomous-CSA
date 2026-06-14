import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const rawPort = process.env.PORT;
  const port = rawPort ? parseInt(rawPort, 10) : 3002;
  if (isNaN(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid PORT value: "${rawPort}"`);
  }
  await app.listen(port);
  console.log(`Worker listening on http://localhost:${port}`);
}
void bootstrap();
