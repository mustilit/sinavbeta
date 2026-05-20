// @ts-nocheck
import { env } from '../../config/env';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogContext {
  requestId?: string;
  tenantId?: string;
  [key: string]: unknown;
}

function baseLog(level: LogLevel, message: string, context?: LogContext) {
  const payload = {
    level,
    msg: message,
    time: new Date().toISOString(),
    requestId: context?.requestId,
    tenantId: context?.tenantId,
    ...context,
  };

  if (env.NODE_ENV === 'production') {
    // Production: JSON structured logs
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(payload));
  } else {
    // Dev: daha okunabilir format
    // eslint-disable-next-line no-console
    console[level](`[${level.toUpperCase()}] ${message}`, context || {});
  }
}

export const logger = {
  debug(message: string, context?: LogContext) {
    baseLog('debug', message, context);
  },
  info(message: string, context?: LogContext) {
    baseLog('info', message, context);
  },
  warn(message: string, context?: LogContext) {
    baseLog('warn', message, context);
  },
  error(message: string, context?: LogContext) {
    baseLog('error', message, context);
  },
};

export function getRequestLogContext(req: any): LogContext {
  const tenant = req?.tenant as { id?: string } | undefined;
  return {
    requestId: req?.requestId as string | undefined,
    tenantId: tenant?.id,
  };
}

