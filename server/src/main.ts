import { NestFactory } from '@nestjs/core';
import { AppModule } from '@/app.module';
import { Logger, ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import compression from 'compression';
import { AllExceptionsFilter } from '@/common/filters/all-exceptions.filter';
import { LoggingInterceptor } from '@/common/interceptors/logging.interceptor';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { resolve } from 'node:path';

async function bootstrap() {
  // rawBody is required by the Stripe webhook: the signature is computed over the
  // exact bytes Stripe sent, so the parsed JSON body cannot be used to verify it.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true,
  });

  const isProduction = process.env.NODE_ENV === 'production';
  // Swagger serves inline scripts and styles, which helmet's default CSP blocks.
  // It is only ever mounted outside production, so the two are mutually exclusive.
  const enableSwagger = !isProduction;

  //project description
  app.setGlobalPrefix('api/v1')

  // Security headers: HSTS, X-Frame-Options, nosniff, referrer policy, etc.
  app.use(
    helmet({
      contentSecurityPolicy: enableSwagger ? false : undefined,
      crossOriginEmbedderPolicy: false,
    }),
  );

  // gzip responses — product listings and Swagger's JSON are the big ones.
  app.use(compression());

  // The refresh token travels as an httpOnly cookie, so it has to be parsed
  // before the jwt-refresh strategy can read it.
  app.use(cookieParser());

  // Serve uploaded images ourselves, but only on the local storage driver —
  // with Cloudinary configured nothing is ever written to this directory.
  // Mounted outside the api/v1 prefix: these are files, not API routes.
  if (!process.env.CLOUDINARY_URL) {
    app.useStaticAssets(resolve(process.env.UPLOAD_DIR ?? 'uploads'), {
      prefix: '/uploads',
      // Filenames are random and never reused, so a stale cache is impossible.
      maxAge: '30d',
      index: false,
      setHeaders: (res) => {
        // helmet defaults Cross-Origin-Resource-Policy to same-origin, which
        // makes the browser refuse these images: the frontend is a different
        // origin (5173 against the API's 3000). CORS headers do not cover
        // <img>, so this has to be relaxed explicitly.
        res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
      },
    });
  }

  //Set Global validation
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },

    }),
  );

  // Anything thrown anywhere ends up here, so Prisma internals and stack traces
  // never reach a client.
  app.useGlobalFilters(new AllExceptionsFilter());

  // One log line per request: method, path, status, duration.
  app.useGlobalInterceptors(new LoggingInterceptor());

  // Enable CORS
  app.enableCors({
    origin: process.env.ALLOWED_ORIGINS?.split(',') ?? 'http://localhost:3000',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
  });

  // Enable Swagger docs — never in production: it publishes every route, DTO
  // shape and example to anyone who finds /api/docs.
  if (enableSwagger) {
    const config = new DocumentBuilder()
      .setTitle('API Documentation')
      .setDescription('API documentation for the application')
      .setVersion('1.0')
      .addTag('auth', 'Authentication related endpoints')
      .addBearerAuth(
        {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          name: 'JWT',
          description: 'Enter JWT token',
          in: 'header',
        },
        'JWT-auth',
      )
      .addBearerAuth(
        {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          name: 'Refresh-JWT',
          description: 'Enter refresh JWT token',
          in: 'header',
        },
        'JWT-refresh',
      )
      .addServer(`http://localhost:${process.env.PORT ?? 3000}`, 'Development server')
      .build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/docs', app, document, {
      swaggerOptions: {
        persistAuthorization: true,
        tagsSorter: 'alpha',
        operationsSorter: 'alpha',
      },
      customSiteTitle: 'API Documentation',
      customfavIcon: 'https://nestjs.com/img/logo-small.svg',
      customCss: `
        .swagger-ui .topbar {display: none}
        .swagger-ui .info { margin: 50px 0; }
        .swagger-ui .info .title {color: #4A90E2;}
      `,
    });
  }

  // Let Kubernetes/Docker stop the app cleanly: Prisma's onModuleDestroy has to
  // run so in-flight queries finish and the pool is closed.
  app.enableShutdownHooks();

  const port = process.env.PORT ?? 3000;
  await app.listen(port);

  Logger.log(`API ready on http://localhost:${port}/api/v1`, 'Bootstrap');
  if (enableSwagger) {
    Logger.log(`Swagger on http://localhost:${port}/api/docs`, 'Bootstrap');
  } else {
    Logger.log('Swagger disabled (NODE_ENV=production)', 'Bootstrap');
  }
}
bootstrap().catch((e) =>
{
  Logger.error('Error starting server', e);
  process.exit(1)
});
