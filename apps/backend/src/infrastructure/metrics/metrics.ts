import { Counter, Histogram, Registry, collectDefaultMetrics } from 'prom-client';

/**
 * prom-client tabanlı merkezi metrik kayıt deposu.
 * Default metrics (process_cpu, nodejs_eventloop_lag, gc, heap, fds…) ile birlikte
 * HTTP request histogram + exception counter sunar.
 *
 * Restart sonrası counter'lar sıfırlanır (Prometheus zaten delta hesaplar).
 * Multi-replica: her replica kendi /metrics endpoint'inden scrape edilir;
 * Prometheus toplam aggregate'i yapar.
 */

export const metricsRegistry = new Registry();
metricsRegistry.setDefaultLabels({ app: 'dal' });

collectDefaultMetrics({ register: metricsRegistry });

export const httpRequestsTotal = new Counter({
  name: 'dal_http_requests_total',
  help: 'Toplam HTTP isteği sayısı (route, method, status_code label\'lı)',
  labelNames: ['route', 'method', 'status_code'],
  registers: [metricsRegistry],
});

export const httpRequestDurationSeconds = new Histogram({
  name: 'dal_http_request_duration_seconds',
  help: 'HTTP istek süresi (saniye) — route, method, status_code label\'lı',
  labelNames: ['route', 'method', 'status_code'],
  // 5ms → 10s arası geniş kova: API + ağır rapor sorgularını birlikte gözler.
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [metricsRegistry],
});

export const httpExceptionsTotal = new Counter({
  name: 'dal_http_exceptions_total',
  help: 'Throw edilmiş exception sayısı (status_code, error_code label\'lı)',
  labelNames: ['status_code', 'error_code'],
  registers: [metricsRegistry],
});

/**
 * Eski API uyumluluğu — request count'u histogram observe'undan çıkar.
 * Yeni kodlar httpRequestsTotal / httpRequestDurationSeconds kullansın.
 */
export const incrementRequestCount = (): void => {
  httpRequestsTotal.inc({ route: 'unknown', method: 'UNKNOWN', status_code: '0' });
};

// ── E-Sınıf (okul) domain metrikleri ────────────────────────────────────────
// Okul akışı marketplace HTTP metriklerinden ayrı segment olarak izlenir
// (teslim hacmi, puanlama, canlı oturum). Grafana: sinavsalonu-overview "E-Sınıf".

export const schoolSubmissionsTotal = new Counter({
  name: 'dal_school_submissions_total',
  help: 'E-Sınıf teslim sayısı (exam_type + kind: ASSIGNMENT|PRACTICE)',
  labelNames: ['exam_type', 'kind'],
  registers: [metricsRegistry],
});

export const schoolGradedTotal = new Counter({
  name: 'dal_school_graded_total',
  help: 'E-Sınıf yazılı teslim puanlama sayısı',
  registers: [metricsRegistry],
});

export const schoolLiveSessionsTotal = new Counter({
  name: 'dal_school_live_sessions_total',
  help: 'E-Sınıf canlı oturum olayları (event: started|ended)',
  labelNames: ['event'],
  registers: [metricsRegistry],
});

export const schoolNotificationsTotal = new Counter({
  name: 'dal_school_notifications_total',
  help: 'E-Sınıf bildirim sayısı (type: NEW_ASSIGNMENT|ASSIGNMENT_GRADED|MESSAGE|OFFLINE_DONE|APPOINTMENT)',
  labelNames: ['type'],
  registers: [metricsRegistry],
});

export const schoolAppointmentsTotal = new Counter({
  name: 'dal_school_appointments_total',
  help: 'E-Sınıf randevu olayları (event: booked|confirmed|cancelled|completed)',
  labelNames: ['event'],
  registers: [metricsRegistry],
});

/** Best-effort metrik kaydı — domain akışını ASLA bozmaz (metrik audit değil). */
export const recordSchoolSubmission = (examType: string, kind: 'ASSIGNMENT' | 'PRACTICE'): void => {
  try { schoolSubmissionsTotal.inc({ exam_type: examType || 'UNKNOWN', kind }); } catch { /* metrik akışı bozmaz */ }
};
export const recordSchoolGraded = (): void => {
  try { schoolGradedTotal.inc(); } catch { /* metrik akışı bozmaz */ }
};
export const recordSchoolLiveEvent = (event: 'started' | 'ended'): void => {
  try { schoolLiveSessionsTotal.inc({ event }); } catch { /* metrik akışı bozmaz */ }
};
export const recordSchoolNotification = (type: string, count = 1): void => {
  try { schoolNotificationsTotal.inc({ type: type || 'UNKNOWN' }, count); } catch { /* metrik akışı bozmaz */ }
};
export const recordSchoolAppointmentEvent = (event: 'booked' | 'confirmed' | 'cancelled' | 'completed'): void => {
  try { schoolAppointmentsTotal.inc({ event }); } catch { /* metrik akışı bozmaz */ }
};
