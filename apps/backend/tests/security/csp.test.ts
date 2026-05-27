/**
 * CSP builder unit testleri.
 * Env değişkenleri restore edilir — test isolation korunur.
 */
import { buildCspDirectivesFromEnv } from '../../src/nest/security/csp';

const originalEnv = { ...process.env };

afterEach(() => {
  // Env değişkenlerini restore et
  Object.keys(process.env).forEach((k) => {
    if (!(k in originalEnv)) delete process.env[k];
    else process.env[k] = originalEnv[k];
  });
});

describe('buildCspDirectivesFromEnv', () => {
  // --- defaultSrc ---

  describe('defaultSrc', () => {
    it('her zaman self ile başlar', () => {
      const csp = buildCspDirectivesFromEnv();
      expect(csp.defaultSrc).toEqual(["'self'"]);
    });
  });

  // --- frameAncestors ---

  describe('frameAncestors', () => {
    it("her zaman none içerir (clickjacking koruması)", () => {
      const csp = buildCspDirectivesFromEnv();
      expect(csp.frameAncestors).toEqual(["'none'"]);
    });
  });

  // --- connectSrc ---

  describe('connectSrc', () => {
    it("CSP_CONNECT_SRC tanımlanmamışsa sadece 'self' döner", () => {
      delete process.env.CSP_CONNECT_SRC;
      const csp = buildCspDirectivesFromEnv();
      expect(csp.connectSrc).toEqual(["'self'"]);
    });

    it('CSP_CONNECT_SRC virgülle ayrılmış değerleri içerir', () => {
      process.env.CSP_CONNECT_SRC = 'https://api.posthog.com,https://sentry.io';
      const csp = buildCspDirectivesFromEnv();
      expect(csp.connectSrc).toContain("'self'");
      expect(csp.connectSrc).toContain('https://api.posthog.com');
      expect(csp.connectSrc).toContain('https://sentry.io');
    });

    it("'self' duplicate eklenmez", () => {
      process.env.CSP_CONNECT_SRC = "'self',https://example.com";
      const csp = buildCspDirectivesFromEnv();
      const selfCount = csp.connectSrc.filter((v) => v === "'self'").length;
      expect(selfCount).toBe(1);
    });
  });

  // --- styleSrc ---

  describe('styleSrc', () => {
    it("CSP_STYLE_SRC tanımlı değilse 'self' ve 'unsafe-inline' döner", () => {
      delete process.env.CSP_STYLE_SRC;
      const csp = buildCspDirectivesFromEnv();
      expect(csp.styleSrc).toContain("'self'");
      expect(csp.styleSrc).toContain("'unsafe-inline'");
    });

    it("CSP_STYLE_SRC tanımlıysa 'self' ile birlikte döner", () => {
      process.env.CSP_STYLE_SRC = 'https://fonts.googleapis.com';
      const csp = buildCspDirectivesFromEnv();
      expect(csp.styleSrc).toContain("'self'");
      expect(csp.styleSrc).toContain('https://fonts.googleapis.com');
    });
  });

  // --- imgSrc ---

  describe('imgSrc', () => {
    it('data: ve https: her zaman imgSrc içinde bulunur', () => {
      const csp = buildCspDirectivesFromEnv();
      expect(csp.imgSrc).toContain('data:');
      expect(csp.imgSrc).toContain('https:');
    });
  });

  // --- reportUri ---

  describe('reportUri', () => {
    it("CSP_REPORT_ENDPOINT tanımlı değilse '/csp-report' döner", () => {
      delete process.env.CSP_REPORT_ENDPOINT;
      const csp = buildCspDirectivesFromEnv();
      expect(csp.reportUri).toBe('/csp-report');
    });

    it('CSP_REPORT_ENDPOINT özel değer tanımlandığında kullanılır', () => {
      process.env.CSP_REPORT_ENDPOINT = 'https://csp.example.com/report';
      const csp = buildCspDirectivesFromEnv();
      expect(csp.reportUri).toBe('https://csp.example.com/report');
    });
  });
});
