// @ts-nocheck
import { ExceptionFilter, Catch, ArgumentsHost, HttpException, HttpStatus } from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import { PrismaAuditLogRepository } from '../../infrastructure/repositories/PrismaAuditLogRepository';
import { AppError } from '../../application/errors/AppError';
import { Request, Response } from 'express';
import { Sentry } from '../../instrument';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const req = ctx.getRequest<Request>();
    const res = ctx.getResponse<Response>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = 'INTERNAL_ERROR';
    let message: string | string[] = 'Internal server error';
    let details: any = undefined;

    const maybe: any = exception as any;
    const isThrottle =
      exception instanceof ThrottlerException ||
      maybe?.name === 'ThrottlerException' ||
      maybe?.status === HttpStatus.TOO_MANY_REQUESTS ||
      maybe?.statusCode === HttpStatus.TOO_MANY_REQUESTS;

    if (exception instanceof AppError) {
      status = (exception as AppError).status;
      code = (exception as AppError).code;
      message = (exception as AppError).message;
      details = (exception as AppError).details;
    } else if (isThrottle) {
      status = HttpStatus.TOO_MANY_REQUESTS;
      code = 'TOO_MANY_REQUESTS';
      message = 'Too many requests';
      details = undefined;
      // Retry-After header (saniye cinsinden) - AppModule'deki THROTTLE_TTL_SECONDS ile uyumlu.
      const retryAfter =
        Number(process.env.THROTTLE_TTL_SECONDS ?? '60') || 60;
      res.setHeader('Retry-After', String(retryAfter));
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      const resp = exception.getResponse();
      if (typeof resp === 'string') {
        message = resp;
        code = 'ERROR';
      } else if (resp && typeof resp === 'object') {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const r = resp as any;
        // support both { code, message, details } and Nest's { statusCode, message, error }
        code = r.code ?? (r.error ? String(r.error).toUpperCase().replace(/\s+/g, '_') : code);
        message = r.message ?? r.error ?? message;
        details = r.details ?? r;
      }
    } else if (exception && typeof exception === 'object') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const e = exception as any;
      if (e.status != null && e.code != null) {
        status = Number(e.status);
        code = e.code;
        message = e.message ?? message;
        details = e.details;
      } else if (e.message) {
        message = e.message;
        details = e;
      }
    } else if (typeof exception === 'string') {
      message = exception;
      code = 'UNKNOWN';
    }

    const payload = {
      error: {
        code,
        message,
        details,
      },
      path: req.url,
      timestamp: new Date().toISOString(),
    };

    // 5xx hatalarını Sentry'ye ilet — 4xx beklenen client hataları, gürültü yapar
    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      Sentry.captureException(exception, {
        extra: { path: req.url, code },
        tags: { status: String(status) },
      });
    }

    // If this was a throttling event, record an audit log for suspicious activity
    try {
      if (isThrottle || status === HttpStatus.TOO_MANY_REQUESTS) {
        // Basit sampling: her 10 throttling event'inden sadece 1'ini kaydet
        const sampleRate = 0.1;
        if (Math.random() <= sampleRate) {
          const auditRepo = new PrismaAuditLogRepository();
          const xff = req.headers?.['x-forwarded-for'];
          const ip = xff ? (Array.isArray(xff) ? xff[0] : String(xff).split(',')[0].trim()) : req.ip;
          // actorId may be undefined for unauthenticated requests
          const actorId = (req as any).user?.id ?? null;
          auditRepo
            .create({
              action: 'SUSPICIOUS_RATE_LIMIT',
              entityType: 'Throttler',
              entityId: '',
              actorId,
              metadata: { path: req.url, ip, userAgent: req.headers['user-agent'] ?? '', details: { code, sampleRate } },
            })
            .catch(() => {
              // swallow errors to not mask original response
            });
        }
      }
    } catch (e) {
      // ignore audit errors
    }

    res.status(status).json(payload);
  }
}

