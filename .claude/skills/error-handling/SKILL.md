---
name: error-handling
description: 500 Internal Server Error'larını önler. NestJS exception filter, domain exception, async hata yutma, validation hatası → 400 dönüşümü, log stratejisi. Her endpoint/service yazılırken ve "neden 500 dönüyor" sorusu olduğunda referans alın.
---

# Error Handling — 500 Hatasını Önleme Kılavuzu

## Temel İlke

500 = "bilinmeyen hata, kod yutmuş". Üretimde 500 görmek = bug. Her beklenen hata 4xx olmalı (400/401/403/404/409). 500 sadece kod gerçekten patlamışsa.

## Mimari Notu

Sinav Salonu **Clean Architecture** kullanıyor: `application/use-cases/` iş mantığı, `infrastructure/repositories/` Prisma implementasyonu, `nest/controllers/` ince HTTP katmanı. Aşağıdaki örnekler "service" diye anılan yer aslında **Use Case sınıfı**dır.

## NestJS — Exception Hierarchy

**Built-in exception'lar — kullan:**
```ts
import {
  BadRequestException,        // 400
  UnauthorizedException,      // 401
  ForbiddenException,         // 403
  NotFoundException,          // 404
  ConflictException,          // 409
  UnprocessableEntityException, // 422
  HttpException,              // custom status
} from '@nestjs/common';
```

**Service'te:**
```ts
async findByIdOrThrow(id: string) {
  const exam = await this.prisma.exam.findUnique({ where: { id } });
  if (!exam) throw new NotFoundException(`Exam ${id} not found`);
  return exam;
}

async purchase(userId: string, examId: string) {
  const exam = await this.findByIdOrThrow(examId);

  if (!exam.publishedAt) {
    throw new BadRequestException('Yayımlanmamış sınav satın alınamaz');
  }
  if (exam.educatorId === userId) {
    throw new ForbiddenException('Kendi sınavınızı satın alamazsınız');
  }
  const existing = await this.prisma.purchase.findUnique({
    where: { userId_examId: { userId, examId } },
  });
  if (existing) {
    throw new ConflictException('Bu sınavı zaten satın aldınız');
  }
  // ...
}
```

Her domain kuralı **kod akışı kararı yanına** exception fırlatsın. "Önce kontrol et, sonra yap" — kontrolü atlamak 500 üretir.

## Global Exception Filter

`apps/backend/src/nest/filters/http-exception.filter.ts`:

```ts
import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Request, Response } from 'express';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | object = 'Internal server error';
    let code = 'INTERNAL_ERROR';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const resp = exception.getResponse();
      message = typeof resp === 'string' ? resp : (resp as any).message ?? resp;
      code = (resp as any).code ?? `HTTP_${status}`;
    } else if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      // Prisma'nın bilinen hatalarını anlamlı status'a çevir
      const map = this.mapPrismaError(exception);
      status = map.status;
      message = map.message;
      code = map.code;
    } else if (exception instanceof Prisma.PrismaClientValidationError) {
      status = HttpStatus.BAD_REQUEST;
      message = 'Geçersiz veri';
      code = 'VALIDATION_ERROR';
    }

    // 5xx ise log + Sentry
    if (status >= 500) {
      this.logger.error({
        path: req.url,
        method: req.method,
        userId: (req as any).user?.id,
        error: exception instanceof Error ? exception.stack : exception,
      });
    }

    res.status(status).json({
      statusCode: status,
      code,
      message,
      timestamp: new Date().toISOString(),
      path: req.url,
    });
  }

  private mapPrismaError(e: Prisma.PrismaClientKnownRequestError) {
    switch (e.code) {
      case 'P2002': // unique constraint
        return {
          status: HttpStatus.CONFLICT,
          message: 'Kayıt zaten mevcut',
          code: 'DUPLICATE',
        };
      case 'P2025': // record not found
        return {
          status: HttpStatus.NOT_FOUND,
          message: 'Kayıt bulunamadı',
          code: 'NOT_FOUND',
        };
      case 'P2003': // foreign key violation
        return {
          status: HttpStatus.BAD_REQUEST,
          message: 'İlişkili kayıt geçersiz',
          code: 'FOREIGN_KEY',
        };
      default:
        return {
          status: HttpStatus.INTERNAL_SERVER_ERROR,
          message: `Veritabanı hatası: ${e.code}`,
          code: 'DB_ERROR',
        };
    }
  }
}
```

`main.ts`'te kayıt:
```ts
app.useGlobalFilters(new HttpExceptionFilter());
```

## Validation 500 Olmasın

DTO validation **400 dönmeli**, asla 500. `main.ts`'te:

```ts
app.useGlobalPipes(new ValidationPipe({
  whitelist: true,           // bilinmeyen alanları sil
  forbidNonWhitelisted: true,// bilinmeyen alan = 400
  transform: true,           // string → number/Date dönüşümü
  transformOptions: { enableImplicitConversion: true },
}));
```

## Async Hata Yutma — En Sık 500 Sebebi

**Yanlış:**
```ts
async create(dto: CreateExamDto) {
  try {
    return await this.prisma.exam.create({ data: dto });
  } catch (e) {
    console.log(e);  // yutuldu, undefined döndü, frontend 200 sandı, sonra patladı
  }
}
```

**Doğru:** Hiçbir try/catch koyma — global filter zaten halledecek. Domain kontrolünü ÖNCEDEN yap.

```ts
async create(educatorId: string, dto: CreateExamDto) {
  if (dto.price < 0) throw new BadRequestException('Fiyat negatif olamaz');
  return this.prisma.exam.create({ data: { ...dto, educatorId } });
  // Prisma hatası fırlarsa, filter Prisma error mapping ile 4xx'e çevirir
}
```

try/catch sadece şuna gerek var:
- Hatayı **bilinçli olarak** başka bir hataya dönüştürmek
- Side-effect cleanup (file delete, lock release)
- Retry mekanizması

## Null Safety

```ts
// Yanlış — exam null ise .questions erişimi 500
const exam = await this.prisma.exam.findUnique({ where: { id } });
return exam.questions.length;

// Doğru
const exam = await this.findByIdOrThrow(id);  // null ise NotFound
return exam.questions?.length ?? 0;
```

## Frontend Tarafı (React + TanStack Query)

Stack: React 18 + Vite + JavaScript + TanStack Query. dalClient.js merkezi API.

**dalClient hata sınıfı:**
```js
// apps/frontend/src/api/dalClient.js
export class ApiError extends Error {
  constructor(status, code, message, fieldErrors) {
    super(message);
    this.status = status;
    this.code = code;
    this.fieldErrors = fieldErrors;
  }
}

async function request(path, init = {}) {
  const res = await fetch(`${API_URL}${path}`, { ...init, credentials: 'include' });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(res.status, body.code, body.message, body.fieldErrors);
  }
  return res.status === 204 ? null : res.json();
}
```

**Mutation onError pattern:**
```jsx
const createExam = useMutation({
  mutationFn: (data) => dalClient.exams.create(data),
  onSuccess: (exam) => {
    queryClient.invalidateQueries({ queryKey: ['exams'] });
    toast.success('Sınav oluşturuldu');
  },
  onError: (err) => {
    if (err.status === 422 && err.fieldErrors) {
      setFieldErrors(err.fieldErrors);
    } else if (err.status === 401) {
      navigate('/login');
    } else if (err.status >= 500) {
      toast.error('Sunucu hatası, lütfen tekrar deneyin');
      Sentry.captureException(err);
    } else {
      toast.error(err.message);
    }
  },
});
```

**Query global error boundary:**
```js
// apps/frontend/src/lib/queryClient.js
import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (failureCount, error) => {
        // 4xx retry etme — kullanıcı hatası, tekrar denemek anlamsız
        if (error?.status >= 400 && error?.status < 500) return false;
        return failureCount < 2;
      },
      onError: (err) => {
        if (err?.status >= 500) Sentry.captureException(err);
      },
    },
    mutations: {
      onError: (err) => {
        if (err?.status >= 500) Sentry.captureException(err);
      },
    },
  },
});
```

**React Error Boundary** beklenmeyen JS hataları için (TanStack Query'nin yakalayamadığı render hataları):
```jsx
// apps/frontend/src/components/ErrorBoundary.jsx
import { Component } from 'react';

export class ErrorBoundary extends Component {
  state = { hasError: false };
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(error, info) {
    console.error(error, info);
    Sentry.captureException(error);
  }
  render() {
    if (this.state.hasError) return <FallbackUI onReset={() => this.setState({ hasError: false })} />;
    return this.props.children;
  }
}
```

Mutation/Query hataları onError'a düşer; render-time hataları ErrorBoundary'a. İkisi de gerekli.

## Log Kuralları

**Log'a yaz:**
- 5xx exceptions (stack trace)
- Beklenmeyen branch ("bu olmamalıydı" durumları)
- Kritik iş akışı adımları (purchase başlangıç/bitiş)
- **Auth fail path'leri** (`AUTH_LOGIN_FAIL` — kullanıcı bulunamadı, şifre yanlış, askıya alınmış)
- **Admin değişiklikleri** (`ADMIN_SETTINGS_UPDATED`, before/after diff)
- **Para işlemleri** (`PURCHASE`, `REFUND_*`, `PAYOUT_PROCESSED`)

**Log'a YAZMA:**
- Şifre, JWT, kart bilgisi
- Tüm request body'si (PII içerebilir)
- 4xx (kullanıcı hatası, gürültü) — **ama auth fail'lar istisna**, audit log'a yazılmalı
- Beklenen domain hataları

## Audit Log (insert/update/error path'leri)

Hata path'lerinde de audit log yazılmalı — sadece exception fırlatmak yetmez.
Auth/admin/para domain'inde her use case için:

```ts
import { AuditLogger, AuditContext } from '../../../infrastructure/audit/AuditLogger';

@Injectable()
export class LoginUseCase {
  constructor(..., private readonly audit?: AuditLogger) {}

  async execute(dto, ctx?: AuditContext) {
    const user = await this.userRepo.findByEmail(dto.email);
    if (!user) {
      this.audit?.logAsync(ctx ?? {}, {
        action: 'AUTH_LOGIN_FAIL',
        entityType: 'User',
        entityId: 'unknown',
        metadata: { reason: 'user_not_found', email: dto.email },
      });
      throw new Error('INVALID_CREDENTIALS');
    }
    // ...
  }
}
```

Detay ve checklist: `observability` skill'i, "Audit log zorunluluğu" başlığı.

## Sentry Entegrasyonu

Filter'da 5xx için Sentry'e bildir:
```ts
if (status >= 500) {
  Sentry.captureException(exception, {
    tags: { path: req.url, method: req.method },
    user: { id: (req as any).user?.id },
  });
}
```

PII (email, isim) Sentry'ye gitmesin — `beforeSend` hook'unda strip et.

## Checklist (her endpoint/service için)

- [ ] Domain validasyonları service başında, exception fırlatıyor mu?
- [ ] `findByIdOrThrow` pattern kullanılıyor mu, null check unutulmadı mı?
- [ ] try/catch'i sadece bilinçli dönüşüm için kullandın mı, yutmadı mı?
- [ ] Prisma `unique` constraint çakışması beklenen mi (409 mapping var)?
- [ ] Async fonksiyonda await unutulmadı mı?
- [ ] Optional relation/property erişiminde `?.` veya null guard var mı?
- [ ] Test: hata case'leri için unit test var mı?
- [ ] **Korumalı endpoint (`@Roles(...)` ile)** `actorId`'i request'ten alıp use case'e
      geçiyor mu? (Geçmezse use case'in ownership guard'ı atlanır — gizli 200 → güvenlik
      açığı. Audit log da `actorId: null` yazar.) Yazım: `const actorId = (req as any).user?.id;`
- [ ] **Insert/update yapan service / provider** (`*-publish.service.ts`, `*.cron.ts` gibi
      use case dışı katmanlar) audit log yazıyor mu? Detay: `observability` skill'i,
      "Servis/Provider Audit Template" başlığı.

## Hızlı Tanı

Üretimde 500 görüyorsan:
1. Sentry log'unda stack trace'i bul.
2. Sebep kategorisi:
   - Prisma error → mapping eksik, filter güncelle
   - TypeError ('cannot read property X of undefined') → null safety eksik
   - Validation → ValidationPipe yapılandırılmamış
   - Custom Error throw → HttpException'a dönüştür
3. Test ekle, fix yap, deploy.
