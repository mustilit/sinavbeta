// @ts-nocheck
import { Controller, Get, Header } from '@nestjs/common';
import { Public } from '../decorators/public.decorator';
import { getMetricsSnapshot } from '../../infrastructure/metrics/metrics';

/**
 * Prometheus metrik endpoint'i — request sayısı, uptime ve bellek kullanımını
 * text/plain formatında döndürür. Prometheus scraping için açık tutulmuştur (@Public).
 */
@Controller('metrics')
export class MetricsController {
  @Public()
  @Get()
  @Header('Content-Type', 'text/plain; version=0.0.4')
  metrics(): string {
    const snapshot = getMetricsSnapshot();
    const lines: string[] = [];

    lines.push('# HELP dal_requests_total Toplam HTTP istek sayısı');
    lines.push('# TYPE dal_requests_total counter');
    lines.push(`dal_requests_total ${snapshot.requestCount}`);

    lines.push('# HELP dal_process_uptime_seconds Process uptime in seconds');
    lines.push('# TYPE dal_process_uptime_seconds gauge');
    lines.push(`dal_process_uptime_seconds ${snapshot.uptimeSeconds}`);

    lines.push('# HELP dal_process_rss_bytes Resident set size in bytes');
    lines.push('# TYPE dal_process_rss_bytes gauge');
    lines.push(`dal_process_rss_bytes ${snapshot.memory.rss}`);

    return lines.join('\n') + '\n';
  }
}

