import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { configuraApp, verificaSegreti } from './configura-app';

async function bootstrap() {
  verificaSegreti();

  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  configuraApp(app);

  const port = process.env.PORT || 3000;
  await app.listen(port);
  console.log(`🚀 Application is running on: http://localhost:${port}`);
}

bootstrap();
