import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { AppModule } from './app.module';
import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { Request, Response } from 'express';

/** Catches every unhandled exception and logs only a one-line summary. */
@Catch()
class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const message =
      exception instanceof HttpException
        ? (exception.getResponse() as any)?.message ?? exception.message
        : (exception as any)?.response?.data?.error?.message ??
          (exception as any)?.message ??
          'Internal server error';

    if (status >= 500) {
      this.logger.error(`${req.method} ${req.url} → ${status}: ${message}`);
    }

    res.status(status).json({
      statusCode: status,
      message,
      error:
        exception instanceof HttpException
          ? (exception.getResponse() as any)?.error
          : 'Internal Server Error',
    });
  }
}

function getAllowedOrigins(): (string | RegExp)[] {
  const base = (process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/$/, '');
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
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

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

  app.useGlobalFilters(new AllExceptionsFilter());
  app.setGlobalPrefix('api');

  const port = process.env.PORT ?? 3001;
  await app.listen(port);
  console.log(`Backend running at http://localhost:${port}/api`);
}

bootstrap();
