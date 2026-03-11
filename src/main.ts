import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

function getAllowedOrigins(): (string | RegExp)[] {
  const base = process.env.FRONTEND_URL || 'http://localhost:3000';
  // Accept both www and non-www variants automatically
  try {
    const url = new URL(base);
    const origins: (string | RegExp)[] = [base];
    if (url.hostname.startsWith('www.')) {
      origins.push(`${url.protocol}//${url.hostname.slice(4)}${url.port ? ':' + url.port : ''}`);
    } else {
      origins.push(`${url.protocol}//www.${url.hostname}${url.port ? ':' + url.port : ''}`);
    }
    return origins;
  } catch {
    return [base];
  }
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.enableCors({
    origin: getAllowedOrigins(),
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  app.setGlobalPrefix('api');

  const port = process.env.PORT ?? 3001;
  await app.listen(port);
  console.log(`Backend running at http://localhost:${port}/api`);
}

bootstrap();
