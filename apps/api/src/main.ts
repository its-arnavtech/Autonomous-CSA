import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  const config = new DocumentBuilder()
    .setTitle('Agentic Support API')
    .setDescription('REST API for the Agentic AI Customer Support Platform')
    .setVersion('1.0')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document);

  const rawPort = process.env.PORT;
  const port = rawPort ? parseInt(rawPort, 10) : 3001;
  if (isNaN(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid PORT value: "${rawPort}"`);
  }
  await app.listen(port);
  console.log(`API listening on http://localhost:${port}`);
}
void bootstrap();
