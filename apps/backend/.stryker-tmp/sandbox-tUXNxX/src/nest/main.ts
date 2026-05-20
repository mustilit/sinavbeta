// @ts-nocheck
// Sentry must be initialized before any other imports
import '../instrument';
import 'reflect-metadata';
import { webcrypto } from 'node:crypto';
import { NestFactory } from '@nestjs/core';
import { join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import * as express from 'express';
import { AppModule } from './app.module';
import { ValidationPipe, VersioningType, VERSION_NEUTRAL } from '@nestjs/common';
import helmet from 'helmet';
import { buildCspDirectivesFromEnv } from './security/csp';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { JwtService } from '../infrastructure/services/JwtService';
import { Reflector } from '@nestjs/core';
import { HttpExceptionFilter } from './filters/http-exception.filter';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { env } from '../config/env';
import { tenantMiddleware } from '../middleware/tenant.middleware';
import { requestIdMiddleware } from '../middleware/request-id.middleware';
import { validateDatabaseUrl } from '../config/database-url';
import { validateRedisUrl } from '../config/redis';

if (!globalThis.crypto) {
  // 
  globalThis.crypto = webcrypto;
}

async function bootstrap() {
  // Fail-fast: DATABASE_URL ve REDIS_URL yanlış host ile configure edilmiş mi?
  validateDatabaseUrl();
  if (process.env.REDIS_DISABLED !== '1') {
    validateRedisUrl();
  }
  const app = await NestFactory.create(AppModule);
  // Security headers via helmet (CSP driven by env)
  const cspEnabled = process.env.CSP_ENABLED !== 'false';
  const reportOnly = process.env.CSP_REPORT_ONLY === 'true';
  app.use(
    helmet({
      contentSecurityPolicy: cspEnabled
        ? {
            useDefaults: false,
            reportOnly,
            directives: buildCspDirectivesFromEnv(),
          }
        : false,
      referrerPolicy: { policy: 'no-referrer' },
      xssFilter: true,
      noSniff: true,
      frameguard: { action: 'deny' },
      hsts: env.NODE_ENV === 'production' ? { maxAge: 31536000, includeSubDomains: true } : false,
    }),
  );

  // Webhook raw body capture — imza doğrulaması için ham byte'lar şart.
  // Express middleware order önemli: bu kayıt body-parser'dan ÖNCE register edilir,
  // böylece /webhooks/stripe + /webhooks/iyzico için body Buffer olarak gelir.
  // Diğer route'lar Nest'in varsayılan JSON parser'ını kullanmaya devam eder.
  const expressApp = app.getHttpAdapter().getInstance();
  expressApp.use('/webhooks/stripe', express.raw({ type: 'application/json', limit: '2mb' }));
  expressApp.use('/webhooks/iyzico', express.raw({ type: 'application/json', limit: '2mb' }));

  // Request context middleware (requestId + tenant)
  app.use(requestIdMiddleware);
  app.use(tenantMiddleware);

  // Global pipes and guards
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  // Global exception filter for consistent error format
  app.useGlobalFilters(new HttpExceptionFilter());

  // ── API versiyonlama ───────────────────────────────────────────────────
  // URI prefix tabanlı: yeni controller'lar `@Controller({ path: 'foo', version: '1' })`
  // ile `/v1/foo` üzerinden erişilir. Var olan controller'lar VERSION_NEUTRAL altında
  // kalmaya devam eder → URL'leri değişmez, frontend kırılmaz.
  //
  // Migration planı: docs/api-versioning.md
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: VERSION_NEUTRAL,
    prefix: 'v',
  });
  // Swagger / OpenAPI - tsx ile emitDecoratorMetadata uyumsuzluğu nedeniyle devre dışı
  // Dökümantasyon için: npm run build && npm run start ile çalıştırın veya SWAGGER_ENABLED=1 deneyin
  if (process.env.NODE_ENV !== 'production' && process.env.SWAGGER_ENABLED === '1') {
    try {
      const config = new DocumentBuilder()
        .setTitle('Sınav Salonu API')
        .setDescription(
          'Marketplace exam platform API. Yeni endpoint\'ler `/v1/...` prefix\'i altında, ' +
            'eski endpoint\'ler legacy (version-neutral) olarak kalır. ' +
            'Migration rehberi: docs/api-versioning.md',
        )
        .setVersion('1.0')
        .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'bearer')
        .addServer('http://localhost:3000', 'Local')
        .addServer('https://api.staging.sinavsalonu.example', 'Staging')
        .addServer('https://api.sinavsalonu.example', 'Production')
        .build();
      const document = SwaggerModule.createDocument(app, config);
      SwaggerModule.setup('docs', app, document, {
        swaggerOptions: { persistAuthorization: true, displayRequestDuration: true },
      });
      console.log('📚 Swagger docs: /docs');
    } catch (err) {
      console.warn('⚠️ Swagger atlandı:', (err as Error)?.message || err);
    }
  }
  const reflector = app.get(Reflector);
  const jwtService = new JwtService();
  app.useGlobalGuards(new JwtAuthGuard(jwtService, reflector), new RolesGuard(reflector));
  // Uploads klasörünü statik olarak sun
  // CORP: cross-origin — frontend farklı port'tan img src ile erişebilsin
  const uploadsDir = join(process.cwd(), 'uploads');
  if (!existsSync(uploadsDir)) mkdirSync(uploadsDir, { recursive: true });
  app.use('/uploads', (_req: any, res: any, next: any) => {
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    next();
  }, express.static(uploadsDir));

  // Disable Express x-powered-by header for security
  app.getHttpAdapter().getInstance().disable('x-powered-by');
  // Trust proxy if configured (for reverse proxy / load balancer setups)
  if (env.TRUST_PROXY === '1' && env.NODE_ENV === 'production') {
    const httpAdapter = app.getHttpAdapter();
    const instance: any = httpAdapter.getInstance();
    if (instance?.set) {
      instance.set('trust proxy', 1);
    }
  }
  // Enable CORS for frontend
  const allowedOrigins = new Set(
    [
      process.env.CLIENT_URL,
      'http://localhost:5173',
      'http://127.0.0.1:5173',
      'http://localhost:5174',
      'http://127.0.0.1:5174',
    ]
      .filter(Boolean)
      .map((o) => o as string),
  );

  app.enableCors({
    origin: (origin, cb) => {
      // curl/postman gibi origin göndermeyenleri de kabul et
      if (!origin) return cb(null, true);
      return cb(null, allowedOrigins.has(origin));
    },
    credentials: true,
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type', 'Accept'],
  });

  const port = env.PORT ? Number(env.PORT) : 3000;
  await app.listen(port, '0.0.0.0');
  console.log(`🚀 Dal API çalışıyor: http://localhost:${port}`);
}

bootstrap();

