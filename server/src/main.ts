import { NestFactory } from '@nestjs/core';
import { AppModule } from '@/app.module';
import { Logger, ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import compression from 'compression';
import { AllExceptionsFilter } from '@/common/filters/all-exceptions.filter';
import { LoggingInterceptor } from '@/common/interceptors/logging.interceptor';
import { requestContextMiddleware } from '@/common/logging/request-context';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { resolve } from 'node:path';

// Boots the Nest app: security headers, CORS, validation, Swagger, then listens.
async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true,
  });

  const isProduction = process.env.NODE_ENV === 'production';

  const enableSwagger = !isProduction;

  app.setGlobalPrefix('api/v1');

  app.use(
    helmet({
      contentSecurityPolicy: enableSwagger ? false : undefined,
      crossOriginEmbedderPolicy: false,
    }),
  );

  // First in the chain so every later log line can be tied to one request.
  app.use(requestContextMiddleware);

  app.use(compression());

  app.use(cookieParser());

  if (!process.env.CLOUDINARY_URL) {
    app.useStaticAssets(resolve(process.env.UPLOAD_DIR ?? 'uploads'), {
      prefix: '/uploads',

      maxAge: '30d',
      index: false,
      setHeaders: (res) => {
        res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
      },
    });
  }

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

  app.useGlobalFilters(new AllExceptionsFilter());

  app.useGlobalInterceptors(new LoggingInterceptor());

  app.enableCors({
    origin: process.env.ALLOWED_ORIGINS?.split(',') ?? 'http://localhost:3000',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
  });

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
      .addServer(
        `http://localhost:${process.env.PORT ?? 3000}`,
        'Development server',
      )
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
bootstrap().catch((e) => {
  Logger.error('Error starting server', e);
  process.exit(1);
});
