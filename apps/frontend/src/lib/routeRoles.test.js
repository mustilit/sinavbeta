import { describe, it, expect } from 'vitest';
import {
  canAccessPage,
  getHomeForRole,
  normalizeRole,
  isProtectedPage,
  isOnboardingEducator,
  isRejectedEducator,
  AUTH_PAGES,
  ROLES,
  ONBOARDING_EDUCATOR_ALLOWED_PAGES,
  REJECTED_EDUCATOR_ALLOWED_PAGES,
} from './routeRoles';

describe('routeRoles', () => {
  describe('canAccessPage', () => {
    it('allows public pages without user', () => {
      expect(canAccessPage('Explore', null)).toBe(true);
      expect(canAccessPage('Login', null)).toBe(true);
      expect(canAccessPage('Home', null)).toBe(true);
    });

    it('denies admin pages without user', () => {
      expect(canAccessPage('AdminDashboard', null)).toBe(false);
      expect(canAccessPage('ManageTopics', null)).toBe(false);
    });

    it('allows admin pages for ADMIN role', () => {
      expect(canAccessPage('AdminDashboard', { role: 'ADMIN' })).toBe(true);
      expect(canAccessPage('ManageTopics', { role: 'ADMIN' })).toBe(true);
    });

    it('allows educator pages for EDUCATOR role', () => {
      expect(canAccessPage('EducatorDashboard', { role: 'EDUCATOR' })).toBe(true);
      expect(canAccessPage('CreateTest', { role: 'EDUCATOR' })).toBe(true);
    });

    it('allows candidate pages for CANDIDATE role', () => {
      expect(canAccessPage('MyResults', { role: 'CANDIDATE' })).toBe(true);
    });

    it('denies admin pages for WORKER without workerPages', () => {
      expect(canAccessPage('AdminDashboard', { role: 'WORKER', workerPages: [] })).toBe(false);
      expect(canAccessPage('ManageTests', { role: 'WORKER', workerPages: [] })).toBe(false);
    });

    it('allows only assigned pages for WORKER', () => {
      const worker = { role: 'WORKER', workerPages: ['AdminDashboard', 'ManageTests'] };
      expect(canAccessPage('AdminDashboard', worker)).toBe(true);
      expect(canAccessPage('ManageTests', worker)).toBe(true);
      expect(canAccessPage('ManageUsers', worker)).toBe(false);
      expect(canAccessPage('ManageRefunds', worker)).toBe(false);
    });

    it('allows public pages for WORKER regardless of workerPages', () => {
      const worker = { role: 'WORKER', workerPages: [] };
      expect(canAccessPage('Home', worker)).toBe(true);
      expect(canAccessPage('Explore', worker)).toBe(true);
    });

    it('boş dizi (E-Sınıf sayfaları) → giriş yapmış herkes erişebilir', () => {
      // Okul kullanıcıları User.role=CANDIDATE; yetki SchoolUser.schoolRole ile.
      expect(canAccessPage('SchoolPanel', { role: 'CANDIDATE' })).toBe(true);
      expect(canAccessPage('StudentAssignments', { role: 'CANDIDATE' })).toBe(true);
      expect(canAccessPage('SchoolBranches', { role: 'EDUCATOR', status: 'ACTIVE' })).toBe(true);
      // Giriş yoksa yine reddedilir.
      expect(canAccessPage('SchoolPanel', null)).toBe(false);
    });
  });

  describe('getHomeForRole', () => {
    it('returns AdminDashboard for ADMIN', () => {
      expect(getHomeForRole('ADMIN')).toBe('AdminDashboard');
    });
    it('returns EducatorDashboard for EDUCATOR', () => {
      expect(getHomeForRole('EDUCATOR')).toBe('EducatorDashboard');
    });
    it('returns Explore for CANDIDATE or other', () => {
      expect(getHomeForRole('CANDIDATE')).toBe('Explore');
      expect(getHomeForRole('unknown')).toBe('Explore');
    });
    it('returns first workerPage for WORKER', () => {
      expect(getHomeForRole('WORKER', { workerPages: ['ManageTests', 'AdminDashboard'] })).toBe('ManageTests');
    });
    it('returns AdminDashboard for WORKER with no pages', () => {
      expect(getHomeForRole('WORKER', { workerPages: [] })).toBe('AdminDashboard');
      expect(getHomeForRole('WORKER', {})).toBe('AdminDashboard');
    });
  });

  describe('normalizeRole', () => {
    it('küçük harfi büyük harfe çevirir', () => {
      expect(normalizeRole('admin')).toBe('ADMIN');
      expect(normalizeRole('candidate')).toBe('CANDIDATE');
    });
    it('mixed-case temizler', () => {
      expect(normalizeRole('AdMiN')).toBe('ADMIN');
    });
    it('null/undefined/empty → boş string', () => {
      expect(normalizeRole(null)).toBe('');
      expect(normalizeRole(undefined)).toBe('');
      expect(normalizeRole('')).toBe('');
    });
    it('zaten büyük harf olanı dokunmaz', () => {
      expect(normalizeRole('EDUCATOR')).toBe('EDUCATOR');
    });
  });

  describe('isProtectedPage', () => {
    it('public sayfalar korumalı değil', () => {
      expect(isProtectedPage('Home')).toBe(false);
      expect(isProtectedPage('Explore')).toBe(false);
      expect(isProtectedPage('Login')).toBe(false);
    });
    it('rol gerektiren sayfalar korumalı', () => {
      expect(isProtectedPage('AdminDashboard')).toBe(true);
      expect(isProtectedPage('MyResults')).toBe(true);
      expect(isProtectedPage('CreateTest')).toBe(true);
    });
    it('tanımsız sayfa korumalı değil (PUBLIC defaultu)', () => {
      expect(isProtectedPage('NonExistentPage')).toBe(false);
    });
  });

  describe('AUTH_PAGES', () => {
    it('giriş/kayıt sayfalarını listeler', () => {
      expect(AUTH_PAGES).toContain('Login');
      expect(AUTH_PAGES).toContain('Register');
      expect(AUTH_PAGES).toContain('ForgotPassword');
      expect(AUTH_PAGES).toContain('ResetPassword');
      expect(AUTH_PAGES).toContain('VerifyEmail');
    });
  });

  describe('ROLES sabitleri', () => {
    it('4 rol + PUBLIC tanımlı', () => {
      expect(ROLES.ADMIN).toBe('ADMIN');
      expect(ROLES.EDUCATOR).toBe('EDUCATOR');
      expect(ROLES.CANDIDATE).toBe('CANDIDATE');
      expect(ROLES.WORKER).toBe('WORKER');
      expect(ROLES.PUBLIC).toBe('public');
    });
  });

  describe('canAccessPage — ek senaryolar', () => {
    it('ADMIN her sayfaya erişebilir (bilinmeyen sayfa hariç)', () => {
      // Bilinmeyen sayfa PAGE_ROLES'da yok → public sayılır
      expect(canAccessPage('UnknownPage', { role: 'ADMIN' })).toBe(true);
    });
    it('lowercase role normalize edilir', () => {
      expect(canAccessPage('AdminDashboard', { role: 'admin' })).toBe(true);
      expect(canAccessPage('CreateTest', { role: 'educator' })).toBe(true);
    });
    it('CANDIDATE admin sayfasına erişemez', () => {
      expect(canAccessPage('AdminDashboard', { role: 'CANDIDATE' })).toBe(false);
      expect(canAccessPage('ManageUsers', { role: 'CANDIDATE' })).toBe(false);
    });
    it('EDUCATOR aday sayfalarına direkt erişemez (rol uyumsuz)', () => {
      // MyResults CANDIDATE'a açık, EDUCATOR'a değil
      expect(canAccessPage('MyResults', { role: 'EDUCATOR' })).toBe(false);
    });
    it('WORKER workerPages undefined → admin sayfalarına erişemez', () => {
      expect(canAccessPage('AdminDashboard', { role: 'WORKER' })).toBe(false);
    });
  });

  // B9 — onay aşamasındaki eğitici tek sayfa kilidi
  describe('canAccessPage — REJECTED / PENDING eğitici kilidi', () => {
    const educator = (status) => ({ role: 'EDUCATOR', status });

    it('REJECTED eğitici sadece EducatorSettings görür', () => {
      const u = educator('REJECTED');
      expect(canAccessPage('EducatorSettings', u)).toBe(true);
      expect(canAccessPage('EducatorDashboard', u)).toBe(false);
      expect(canAccessPage('CreateTest', u)).toBe(false);
      expect(canAccessPage('MyTestPackages', u)).toBe(false);
      expect(canAccessPage('MyAds', u)).toBe(false);
      expect(canAccessPage('MyLiveSessions', u)).toBe(false);
      expect(canAccessPage('MySales', u)).toBe(false);
      expect(canAccessPage('EmailPreferences', u)).toBe(false);
      expect(canAccessPage('MyModerationStatus', u)).toBe(false);
    });

    it('PENDING_EDUCATOR_APPROVAL eğitici de sadece EducatorSettings görür', () => {
      const u = educator('PENDING_EDUCATOR_APPROVAL');
      expect(canAccessPage('EducatorSettings', u)).toBe(true);
      expect(canAccessPage('CreateTest', u)).toBe(false);
      expect(canAccessPage('EducatorDashboard', u)).toBe(false);
    });

    it('ACTIVE eğitici kilidi geçer — tüm EDUCATOR sayfaları açık', () => {
      const u = educator('ACTIVE');
      expect(canAccessPage('EducatorDashboard', u)).toBe(true);
      expect(canAccessPage('CreateTest', u)).toBe(true);
      expect(canAccessPage('MyAds', u)).toBe(true);
    });

    it('REJECTED eğitici public sayfaları görmeye devam eder', () => {
      const u = educator('REJECTED');
      expect(canAccessPage('Home', u)).toBe(true);
      expect(canAccessPage('Explore', u)).toBe(true);
    });

    it('REJECTED eğitici ADMIN sayfalarına da girmez', () => {
      const u = educator('REJECTED');
      expect(canAccessPage('AdminDashboard', u)).toBe(false);
      expect(canAccessPage('ManageUsers', u)).toBe(false);
    });
  });

  describe('getHomeForRole — onay aşaması yönlendirmesi', () => {
    it('REJECTED eğitici → EducatorSettings', () => {
      expect(getHomeForRole('EDUCATOR', { role: 'EDUCATOR', status: 'REJECTED' }))
        .toBe('EducatorSettings');
    });

    it('PENDING_EDUCATOR_APPROVAL eğitici → EducatorSettings', () => {
      expect(getHomeForRole('EDUCATOR', { role: 'EDUCATOR', status: 'PENDING_EDUCATOR_APPROVAL' }))
        .toBe('EducatorSettings');
    });

    it('ACTIVE eğitici → EducatorDashboard', () => {
      expect(getHomeForRole('EDUCATOR', { role: 'EDUCATOR', status: 'ACTIVE' }))
        .toBe('EducatorDashboard');
    });

    it('Bilinmeyen statüsteki eğitici güvenli tarafa — EducatorSettings', () => {
      expect(getHomeForRole('EDUCATOR', { role: 'EDUCATOR', status: 'WEIRD_VALUE' }))
        .toBe('EducatorSettings');
    });
  });

  describe('helper fonksiyonları (B9)', () => {
    it('isRejectedEducator: sadece REJECTED + EDUCATOR true', () => {
      expect(isRejectedEducator({ role: 'EDUCATOR', status: 'REJECTED' })).toBe(true);
      expect(isRejectedEducator({ role: 'EDUCATOR', status: 'ACTIVE' })).toBe(false);
      expect(isRejectedEducator({ role: 'EDUCATOR', status: 'PENDING_EDUCATOR_APPROVAL' })).toBe(false);
      expect(isRejectedEducator({ role: 'CANDIDATE', status: 'REJECTED' })).toBe(false);
      expect(isRejectedEducator(null)).toBe(false);
    });

    it('isOnboardingEducator: REJECTED ve PENDING ikisi de true', () => {
      expect(isOnboardingEducator({ role: 'EDUCATOR', status: 'REJECTED' })).toBe(true);
      expect(isOnboardingEducator({ role: 'EDUCATOR', status: 'PENDING_EDUCATOR_APPROVAL' })).toBe(true);
      expect(isOnboardingEducator({ role: 'EDUCATOR', status: 'ACTIVE' })).toBe(false);
      expect(isOnboardingEducator({ role: 'CANDIDATE', status: 'REJECTED' })).toBe(false);
      expect(isOnboardingEducator(null)).toBe(false);
    });

    it('whitelist tek sayfa içerir: EducatorSettings', () => {
      expect(Array.from(ONBOARDING_EDUCATOR_ALLOWED_PAGES)).toEqual(['EducatorSettings']);
      // Geriye dönük uyumluluk alias'ı aynı Set'i işaret etsin
      expect(REJECTED_EDUCATOR_ALLOWED_PAGES).toBe(ONBOARDING_EDUCATOR_ALLOWED_PAGES);
    });
  });
});
