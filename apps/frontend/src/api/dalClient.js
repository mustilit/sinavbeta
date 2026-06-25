/**
 * Dal backend API client - replaces base44 SDK
 * Maps our backend endpoints to the format expected by Sınav Salonu UI
 * Tüm istekler @/lib/api/apiClient üzerinden geçer (tek nokta, 401 yönetimi)
 */
import api from '@/lib/api/apiClient';

// --- Auth ---
export const auth = {
  async login(email, password, opts = {}) {
    const body = {
      email: typeof email === 'string' ? email.trim().toLowerCase() : email,
      password: typeof password === 'string' ? password : String(password),
      ...(opts.turnstileToken ? { turnstileToken: opts.turnstileToken } : {}),
    };
    const { data } = await api.post('/auth/login', body);
    if (!data || (!data.user && !data.token)) {
      throw new Error('Beklenmeyen sunucu yanıtı');
    }
    return data;
  },
  async register(email, username, password, opts = {}) {
    // Sprint 14 — Sözleşme onayı zorunluluğu: opts.acceptedTermsContractId
    // (CANDIDATE üyelik) ve opts.acceptedPrivacyContractId (PRIVACY/KVKK) backend'in
    // doğruladığı aktif contract ID'leri olmalı. Eşleşmezse 400 (TERMS_NOT_ACCEPTED).
    const body = {
      email,
      username,
      password,
      ...(opts.turnstileToken ? { turnstileToken: opts.turnstileToken } : {}),
      ...(opts.acceptedTermsContractId ? { acceptedTermsContractId: opts.acceptedTermsContractId } : {}),
      ...(opts.acceptedPrivacyContractId ? { acceptedPrivacyContractId: opts.acceptedPrivacyContractId } : {}),
    };
    const { data } = await api.post('/auth/register', body);
    return data;
  },
  // Email doğrulama — kullanıcı /VerifyEmail?token=... linkine tıklayınca
  async verifyEmail(token) {
    const { data } = await api.post('/auth/verify-email', { token });
    return data; // { ok: true, userId, email, role }
  },
  // Email doğrulama bağlantısını yeniden gönder
  async resendEmailVerification(email) {
    const { data } = await api.post('/auth/resend-verification', { email });
    return data; // { message }
  },
  async registerEducator(email, username, password, opts = {}) {
    // opts: { firstName, lastName, turnstileToken, acceptedEducatorContractId,
    //        acceptedPrivacyContractId, cvUrl, specializations, educationInfo, bio }
    // Sprint 17 — wizard step 2 alanları: cvUrl (zorunlu), specializations[] (zorunlu, en az 1),
    //             educationInfo (opsiyonel), bio (opsiyonel)
    const body = {
      email,
      username,
      password,
      firstName: opts.firstName ?? '',
      lastName: opts.lastName ?? '',
      ...(opts.turnstileToken ? { turnstileToken: opts.turnstileToken } : {}),
      ...(opts.acceptedEducatorContractId ? { acceptedEducatorContractId: opts.acceptedEducatorContractId } : {}),
      ...(opts.acceptedPrivacyContractId ? { acceptedPrivacyContractId: opts.acceptedPrivacyContractId } : {}),
      ...(opts.cvUrl ? { cvUrl: opts.cvUrl } : {}),
      ...(opts.specializations?.length ? { specializations: opts.specializations } : {}),
      ...(opts.educationInfo ? { educationInfo: opts.educationInfo } : {}),
      ...(opts.bio ? { bio: opts.bio } : {}),
      ...(opts.linkedinUrl ? { linkedinUrl: opts.linkedinUrl } : {}),
      ...(opts.websiteUrl ? { websiteUrl: opts.websiteUrl } : {}),
    };
    const { data } = await api.post('/auth/register/educator', body);
    return data;
  },
  /**
   * Email ve username'in uygun olup olmadığını kayıt formundan ÖNCE kontrol eder
   * (sözleşme dialog'u açılmadan önce). Fail-open: backend hatası varsa true döner —
   * gerçek kontrol kayıt isteğinde tekrar yapılır, kullanıcı dead-end'te kalmaz.
   */
  async checkAvailability(email, username) {
    try {
      const qs = new URLSearchParams();
      if (email) qs.set('email', email);
      if (username) qs.set('username', username);
      const { data } = await api.get('/auth/check-availability?' + qs.toString());
      return {
        emailAvailable: data?.emailAvailable !== false,
        usernameAvailable: data?.usernameAvailable !== false,
      };
    } catch {
      return { emailAvailable: true, usernameAvailable: true };
    }
  },
  // Eğiticinin onboarding tamamlanma durumu (firstName/lastName + cv + uzmanlık alanı)
  async educatorOnboardingStatus() {
    try {
      const { data } = await api.get('/educators/me/onboarding-status');
      return data; // { complete, hasName, hasCv, hasSpecialization, emailVerified }
    } catch {
      return { complete: false, hasName: false, hasCv: false, hasSpecialization: false, emailVerified: false };
    }
  },
  async loginWithGoogle(idToken, role) {
    const body = role ? { idToken, role } : { idToken };
    const { data } = await api.post('/auth/google', body);
    if (!data?.token || !data?.user) {
      throw new Error('Beklenmeyen sunucu yanıtı');
    }
    return data;
  },
  async me() {
    const { data } = await api.get('/auth/me');
    const user = data?.user ?? data;
    if (!user) return null;
    try {
      const { data: prefs } = await api.get('/me/preferences');
      const merged = { ...user, ...(prefs && typeof prefs === 'object' ? prefs : {}) };
      merged.full_name = merged.full_name ?? merged.username;
      return merged;
    } catch {
      return { ...user, full_name: user.full_name ?? user.username };
    }
  },
  async updateMe(body) {
    const { data } = await api.patch('/me/preferences', body);
    return data?.preferences ?? data ?? {};
  },
  /**
   * Hassas profil alanları (telefon, website, LinkedIn) için 6 haneli OTP iste.
   * Email kullanıcıya gönderilir. 10 dakika geçerli.
   * @returns {Promise<{ sentTo: string, expiresAt: string }>}
   */
  async requestSensitiveProfileOtp() {
    const { data } = await api.post('/me/preferences/sensitive/request');
    return data;
  },
  /**
   * OTP'yi doğrula ve hassas alanları uygula.
   * @param {{ code: string, phone?: string, website?: string, linkedin?: string }} body
   */
  async verifySensitiveProfileChange(body) {
    const { data } = await api.post('/me/preferences/sensitive/verify', body);
    return data;
  },
  /**
   * Oturum açmış kullanıcının şifresini değiştirir.
   * Mevcut şifre backend'de doğrulanır; yeni şifre tekrarı UI'da kontrol edilir.
   * @param {string} currentPassword
   * @param {string} newPassword
   * @returns {Promise<{ message: string }>}
   */
  async changePassword(currentPassword, newPassword) {
    const { data } = await api.post('/auth/change-password', { currentPassword, newPassword });
    return data;
  },
  // Onaylı cihazlar (Profil > Güvenlik): listele + onayı kaldır.
  async listDevices() {
    const { data } = await api.get('/me/devices');
    return Array.isArray(data) ? data : [];
  },
  async revokeDevice(deviceId) {
    const { data } = await api.delete(`/me/devices/${deviceId}`);
    return data;
  },
  logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('dal_auth');
    localStorage.removeItem('base44_access_token');
    sessionStorage.removeItem('token');
    sessionStorage.removeItem('dal_auth');
  },
  redirectToLogin(returnUrl) {
    window.location.href = '/Login' + (returnUrl ? `?from=${encodeURIComponent(returnUrl)}` : '');
  },
  isAuthenticated() {
    return !!(
      sessionStorage.getItem('token') || sessionStorage.getItem('dal_auth') ||
      localStorage.getItem('token') || localStorage.getItem('dal_auth')
    );
  },
};

// --- Entities (mapped to Dal backend) ---

// ExamType: GET /site/exam-types (public) or /admin/exam-types
const examTypeAdapter = (e) => ({
  id: e.id,
  name: e.name,
  slug: e.slug,
  description: e.description ?? null,
  is_active: e.active !== false,
  // Sınav türü logosu: havuzdan seçilen ikon key'i (metadata.icon) + geriye dönük yüklenen URL.
  icon: e.metadata?.icon ?? e.icon ?? null,
  iconUrl: e.metadata?.iconUrl ?? e.iconUrl ?? null,
});

// GradeLevel (Sınıf): GET /site/grade-levels (public) or /admin/grade-levels
const gradeLevelAdapter = (e) => ({
  id: e.id,
  name: e.name,
  slug: e.slug,
  description: e.description ?? null,
  is_active: e.active !== false,
  icon: e.metadata?.icon ?? e.icon ?? null,
  iconUrl: e.metadata?.iconUrl ?? e.iconUrl ?? null,
});

function roleToUserType(role) {
  const r = (role || '').toString().toUpperCase();
  if (r === 'EDUCATOR') return 'educator';
  if (r === 'ADMIN') return 'admin';
  return 'candidate';
}

function educatorStatusFromUser(u) {
  const role = (u?.role || '').toString().toUpperCase();
  if (role !== 'EDUCATOR') return null;
  const meta = (u?.metadata && typeof u.metadata === 'object') ? u.metadata : {};
  if (meta?.educator_status) return String(meta.educator_status);
  return u?.educatorApprovedAt ? 'approved' : 'pending';
}

function userAdapter(u) {
  return {
    id: u.id,
    email: u.email,
    full_name: u.username,
    username: u.username,
    role: u.role,
    user_type: roleToUserType(u.role),
    educator_status: educatorStatusFromUser(u),
    rejection_reason: u?.metadata?.rejection_reason ?? null,
    created_date: u.createdAt,
    createdAt: u.createdAt,
    metadata: u.metadata ?? {},
  };
}

function normalizeRefund(r) {
  return {
    id: r.id,
    source: r.source ?? 'TEST',
    purchaseId: r.purchaseId ?? null,
    candidateId: r.candidateId ?? null,
    educatorId: r.educatorId ?? null,
    testId: r.testId ?? null,
    test_package_title: r.testTitle ?? r.test_package_title ?? '',
    reason: r.reason ?? '',
    description: r.description ?? '',
    status: r.status ?? 'PENDING',
    status_lower: (r.status ?? 'PENDING').toLowerCase(),
    educator_deadline: r.educatorDeadline ?? null,
    educator_decided_at: r.educatorDecidedAt ?? null,
    appeal_reason: r.appealReason ?? '',
    appealed_at: r.appealedAt ?? null,
    decided_by: r.decidedBy ?? null,
    decided_at: r.decidedAt ?? null,
    admin_notes: r.adminNotes ?? '',
    amount: r.amount ?? (r.amountCents != null ? r.amountCents / 100 : 0),
    created_date: r.createdAt ?? r.created_date ?? null,
    updated_date: r.updatedAt ?? null,
  };
}

export async function getAdminStats() {
  const { data } = await api.get('/admin/stats');
  return data;
}

export const entities = {
  User: {
    list: async (sort = '-created_date', limit = 200) => {
      const sortParam = sort === 'created_date' ? 'createdAt' : '-createdAt';
      const { data } = await api.get('/admin/users', { params: { sort: sortParam, limit } });
      const list = Array.isArray(data) ? data : (data?.items ?? []);
      return list.map(userAdapter);
    },
    update: async (id, body) => {
      const { data } = await api.patch(`/admin/users/${id}`, body);
      return userAdapter(data);
    },
    filter: async () => {
      // Not supported; prefer list
      return [];
    },
  },

  EducatorProfile: {
    filter: async () => {
      // Profile is stored on User.metadata in this backend; no separate collection
      return [];
    },
    create: async (body) => {
      // Save into educator metadata
      const metadata = {
        bio: body.bio,
        education: body.education,
        website: body.website,
        linkedin: body.linkedin,
        specialized_exam_types: body.specialized_exam_types,
        profile_image_url: body.profile_image_url,
        cv_url: body.cv_url,
      };
      await api.patch('/educators/me', { metadata });
      return { id: 'me', ...body };
    },
    update: async (_id, body) => {
      const metadata = {
        bio: body.bio,
        education: body.education,
        website: body.website,
        linkedin: body.linkedin,
        specialized_exam_types: body.specialized_exam_types,
        profile_image_url: body.profile_image_url,
        cv_url: body.cv_url,
      };
      await api.patch('/educators/me', { metadata });
      return { id: _id, ...body };
    },
    delete: async () => {},
    list: async () => [],
  },

  ExamType: {
    filter: async (opts = {}) => {
      try {
        const res = await api.get('/site/exam-types');
        const data = res?.data ?? res;
        let list = Array.isArray(data) ? data : (data?.items ?? data?.data ?? []);
        const mapped = list.map(examTypeAdapter);
        if (opts.is_active === true) return mapped.filter((e) => e.is_active);
        return mapped;
      } catch (err) {
        console.warn('[dalClient] ExamType.filter failed:', err?.message || err);
        return [];
      }
    },
    list: async (sort, limit) => {
      const { data } = await api.get('/admin/exam-types');
      let list = Array.isArray(data) ? data : data?.items ?? [];
      return list.map(examTypeAdapter);
    },
    create: async (body) => {
      const { data } = await api.post('/admin/exam-types', body);
      return examTypeAdapter(data);
    },
    update: async (id, body) => {
      const { data } = await api.patch(`/admin/exam-types/${id}`, body);
      return examTypeAdapter(data);
    },
    delete: async (id) => {
      await api.delete(`/admin/exam-types/${id}`);
    },
  },

  GradeLevel: {
    filter: async (opts = {}) => {
      try {
        const res = await api.get('/site/grade-levels');
        const data = res?.data ?? res;
        let list = Array.isArray(data) ? data : (data?.items ?? data?.data ?? []);
        const mapped = list.map(gradeLevelAdapter);
        if (opts.is_active === true) return mapped.filter((e) => e.is_active);
        return mapped;
      } catch (err) {
        console.warn('[dalClient] GradeLevel.filter failed:', err?.message || err);
        return [];
      }
    },
    list: async () => {
      const { data } = await api.get('/admin/grade-levels?activeOnly=false');
      let list = Array.isArray(data) ? data : data?.items ?? [];
      return list.map(gradeLevelAdapter);
    },
    create: async (body) => {
      const { data } = await api.post('/admin/grade-levels', body);
      return gradeLevelAdapter(data);
    },
    update: async (id, body) => {
      const { data } = await api.patch(`/admin/grade-levels/${id}`, body);
      return gradeLevelAdapter(data);
    },
    delete: async (id) => {
      await api.delete(`/admin/grade-levels/${id}`);
    },
  },

  Purchase: {
    filter: async (opts = {}) => {
      // Educator sales: /educators/me/sales
      if (opts.educator_email) {
        try {
          const { data } = await api.get('/educators/me/sales');
          const list = Array.isArray(data) ? data : [];
          return list.map((p) => ({
            id: p.id,
            user_email: p.candidateEmail,
            user_name: p.candidateName ?? p.candidateEmail,
            test_package_id: p.testId,
            test_package_title: p.testTitle,
            price_paid: p.amountCents != null ? p.amountCents / 100 : 0,
            status: p.status === 'ACTIVE' ? 'completed' : p.status === 'REFUNDED' ? 'refunded' : 'pending',
            created_date: p.createdAt,
            kind: p.kind ?? 'package', // 'package' | 'tunnel'
          }));
        } catch {
          return [];
        }
      }
      const { data } = await api.get('/me/purchases');
      let list = Array.isArray(data) ? data : [];
      // test_package_id hem testId (eski sistem) hem packageId (yeni sistem)
      // hem de paketin içerdiği ExamTest ID'leri ile eşleşebilir.
      // Paket satın alındıysa içindeki tüm testler erişilebilir olmalı.
      if (opts.test_package_id) {
        const target = opts.test_package_id;
        list = list.filter((p) => {
          if ((p.testId ?? p.test?.id) === target) return true;
          if (p.packageId === target) return true;
          // Paket içindeki herhangi bir ExamTest hedef ID ile eşleşiyor mu?
          const pkgTests = p.package?.tests ?? [];
          return pkgTests.some((t) => t.id === target);
        });
      }
      return list.map((p) => {
        // Paketten satın alındıysa packageId üzerinden eşleştir; yoksa testId
        const pkgId = p.packageId ?? null;
        const testPkgId = pkgId ?? p.testId ?? p.test?.id ?? null;

        // Test snapshot: paket varsa paket verisinden; yoksa test verisinden
        let snapshot = null;
        if (p.package) {
          snapshot = {
            id: p.package.id,
            title: p.package.title,
            price: p.package.priceCents != null ? p.package.priceCents / 100 : 0,
          };
        } else if (p.test) {
          snapshot = testPackageAdapter(p.test);
        }

        return {
          id: p.id,
          user_email: opts.user_email,
          // Yeni sistemde packageId, eski sistemde testId kullanılır
          test_package_id: testPkgId,
          test_id: p.testId,
          package_id: pkgId,
          test: p.test,
          package: p.package,
          attempt: p.attempt,
          // Paketteki tüm testlerin attempt'ları (backend p.attempts) — TakeTest
          // ve TestProgress için doğru attempt'ı bulmaya yarar
          attempts: Array.isArray(p.attempts) ? p.attempts : (p.attempt ? [p.attempt] : []),
          // "Paketi yeniden çöz" zaman damgası — Home "Devam Et" bu turu hesaplar
          attemptsResetAt: p.attemptsResetAt ?? null,
          payment_status: p.paymentStatus,
          test_package_snapshot: snapshot,
          // ProfileSettings ve diğer sayfalar için düzleştirilmiş alanlar
          test_package_title: p.package?.title ?? p.test?.title ?? '',
          price_paid: p.amountCents != null ? p.amountCents / 100 : 0,
          created_date: p.createdAt ?? null,
          educator_email: p.test?.educatorId ?? null,
          // Paketten gelen ExamTest listesi — TestDetail'de test butonları için
          tests_snapshot: pkgId && p.test
            ? [{ id: p.test.id, title: p.test.title, duration_minutes: p.test.durationMinutes ?? 60, test_package_id: testPkgId }]
            : null,
        };
      });
    },
    create: async (body) => {
      // Sprint 14 — acceptedDistanceSaleContractId zorunlu (backend 400 atar yoksa).
      // Çağıran taraf önceden GET /contracts/active?type=DISTANCE_SALE ile aktif
      // contract ID'sini almalı ve kullanıcıya "Mesafeli Satış Sözleşmesi'ni onaylıyorum"
      // checkbox'ı göstermeli.
      const testId = body.test_package_id ?? body.test_id;
      const { data } = await api.post(`/purchases/${testId}`, {
        discountCode: body.discount_code,
        paymentProvider: body.payment_provider,
        ...(body.acceptedDistanceSaleContractId
          ? { acceptedDistanceSaleContractId: body.acceptedDistanceSaleContractId }
          : {}),
      });
      return data;
    },
    initiatePayment: async (packageId, provider, callbackUrl) => {
      const { data } = await api.post(`/purchases/package/${packageId}/initiate`, { provider, callbackUrl });
      return data;
    },
    getPaymentStatus: async (packageId) => {
      const { data } = await api.get(`/purchases/package/${packageId}/status`);
      return data;
    },
    verifyPayment: async (token, provider) => {
      const { data } = await api.post('/purchases/package/verify', { token, provider });
      return data;
    },
  },

  TestPackage: {
    filter: async (opts = {}, sort = '-publishedAt', limit = 50) => {
      if (opts.id) {
        try {
          // Önce marketplace/packages endpoint'ini dene (yeni sistem — TestPackage)
          const { data } = await api.get(`/marketplace/packages/${opts.id}`);
          return data ? [publicPackageDetailAdapter(data)] : [];
        } catch (err) {
          const status = err?.response?.status;
          // 404: paket gerçekten yok → boş döndür (kullanıcıya "bulunamadı" göster)
          // Diğer hatalar (500, ağ vb.): throw et → TanStack Query retry mekanizması devreye girsin
          if (status === 404) {
            return [];
          }
          console.error('[dalClient] TestPackage.filter id lookup failed:', err?.message || err, 'id:', opts.id, 'status:', status);
          throw err;
        }
      }
      // Educator'ın kendi paketleri — GET /packages
      if (opts.educator_owns === true || opts.my_tests === true) {
        try {
          const { data } = await api.get('/packages');
          const list = Array.isArray(data) ? data : [];
          return list.map((pkg) => ({
            id: pkg.id,
            title: pkg.title,
            description: pkg.description ?? '',
            priceCents: pkg.priceCents,
            price: pkg.priceCents != null ? pkg.priceCents / 100 : 0,
            difficulty: pkg.difficulty ?? 'medium',
            is_published: !!pkg.publishedAt,
            publishedAt: pkg.publishedAt ?? null,
            createdAt: pkg.createdAt,
            updatedAt: pkg.updatedAt,
            tests: pkg.tests ?? [],
            question_count: (pkg.tests ?? []).reduce((s, t) => s + (t.questionCount ?? 0), 0),
            exam_type_id: (pkg.tests ?? []).find((t) => t.examTypeId)?.examTypeId ?? null,
            exam_type_name: (pkg.tests ?? []).find((t) => t.examTypeName)?.examTypeName ?? null,
            grade_level_id: (pkg.tests ?? []).find((t) => t.gradeLevelId)?.gradeLevelId ?? null,
            grade_level_name: (pkg.tests ?? []).find((t) => t.gradeLevelName)?.gradeLevelName ?? null,
            total_sales: pkg.saleCount ?? 0,
            average_rating: pkg.ratingAvg ?? null,
            rating_count: pkg.ratingCount ?? 0,
          }));
        } catch (err) {
          console.warn('[dalClient] TestPackage.filter educator_owns failed:', err?.message || err);
          return [];
        }
      }
      // Yayınlı paket listesi — yeni TestPackage tabanlı endpoint (tek kaynak)
      const params = { limit: limit || 50 };
      if (opts.exam_type_id) params.examTypeId = opts.exam_type_id;
      if (opts.grade_level_id) params.gradeLevelId = opts.grade_level_id;
      if (opts.q) params.q = opts.q;
      const { data } = await api.get('/marketplace/packages', { params });
      const items = data?.items ?? [];
      return items.map(marketplacePackageAdapter);
    },
    list: async (sort, limit) => {
      const { data } = await api.get('/marketplace/packages', { params: { limit: limit || 100 } });
      return (data?.items ?? []).map(marketplacePackageAdapter);
    },
    create: async (body) => {
      const payload = {
        title: body.title,
        examTypeId: body.exam_type_id,
        gradeLevelId: body.grade_level_id,
        topicId: body.topic_id,
        isTimed: body.is_timed ?? false,
        duration: body.duration,
        price: body.price != null ? Math.round(body.price * 100) : null,
        questions: (body.questions ?? []).map((q) => ({
          content: q.content,
          order: q.order ?? 0,
          options: (q.options ?? []).map((o) => ({ content: o.content, isCorrect: o.is_correct ?? o.isCorrect ?? false })),
        })),
      };
      const { data } = await api.post('/tests', payload);
      return testPackageAdapter(data);
    },
    update: async (id, body) => {
      const payload = {};
      if (body.title != null) payload.title = body.title;
      if (body.is_published != null) {
        if (body.is_published) await api.put(`/tests/${id}/publish`);
        else await api.put(`/tests/${id}/unpublish`);
        return (await api.get(`/tests/${id}`)).data;
      }
      if (Object.keys(payload).length) await api.patch(`/tests/${id}`, payload);
      const { data } = await api.get(`/tests/${id}`);
      return testPackageAdapter(data);
    },
  },

  // Test = our ExamTest (single test with questions). test_package_id = our test id
  Test: {
    filter: async (opts = {}, sort) => {
      if (opts.test_package_id || opts.test_id) {
        const id = opts.test_package_id ?? opts.test_id;
        // Önce TestPackage olarak dene (paketin tüm testlerini getirir);
        // bulunamazsa tekil ExamTest endpoint'ine düş.
        // NOT: /tests/:id endpoint'i TestPackage CUID verildiğinde paketteki ilk
        // ExamTest'i döndürdüğü için (fuzzy resolution), paket önce sorgulanır —
        // yoksa paketin tüm testleri yerine sadece ilki gelir.
        try {
          const { data } = await api.get(`/marketplace/packages/${id}`);
          if (data?.tests?.length) {
            return data.tests.map((t, i) => ({
              id: t.id,
              title: t.title,
              test_package_id: id,
              order_index: i,
              duration_minutes: t.duration ?? t.durationMinutes ?? 60,
              question_count: t.questionCount ?? 0,
            }));
          }
        } catch (pkgErr) {
          // Paket bulunamadı — tekil ExamTest olabilir
        }
        try {
          const { data } = await api.get(`/tests/${id}`);
          if (data) return [{ id: data.id, test_package_id: id, order_index: 0, duration_minutes: data.duration ?? data.durationMinutes ?? 60, title: data.title, ...data }];
        } catch (testErr) {
          // Hiçbir şey bulunamadı
        }
        return [];
      }
      return [];
    },
  },

  // Question = ExamQuestion from GET /tests/:id
  Question: {
    filter: async (opts = {}, sort) => {
      if (opts.test_package_id || opts.test_id) {
        const id = opts.test_package_id ?? opts.test_id;
        try {
          const { data } = await api.get(`/tests/${id}`);
          if (!data?.questions) return [];
          return (data.questions || []).map((q, i) => ({
            id: q.id,
            test_id: data.id,
            test_package_id: data.id,
            content: q.content,
            order_index: q.order ?? i,
            options: (q.options || []).map((o) => ({ id: o.id, content: o.content, is_correct: o.isCorrect })),
          }));
        } catch (err) {
          console.warn('[dalClient] Question.filter failed for id:', id, err?.message);
          return [];
        }
      }
      return [];
    },
    list: async () => [],
  },

  // TestResult = attempt when SUBMITTED (from /me/purchases)
  // Bir paket satın alımı (Purchase) → paketteki HER test için ayrı bir TestAttempt olabilir.
  // Backend p.attempts[] olarak paketteki tüm test'lerin attempt'larını döner.
  // Aşağıda hem p.attempts dizisini (paket alımı) hem de p.attempt (eski tekil alım) destekliyoruz.
  TestResult: {
    filter: async (opts = {}) => {
      try {
        const res = await api.get('/me/purchases');
        const data = res?.data ?? res;
        const list = Array.isArray(data) ? data : (data?.items ?? data?.data ?? []);
        const results = [];
        for (const p of list) {
          const pkgId = p.packageId ?? p.testId ?? p.test_id;
          // Hedef paket/test ile eşleşmeyen satırları atla
          // (Purchase doğrudan p.testId/p.packageId üzerinden ya da paket içindeki testlerden biri üzerinden eşleşebilir)
          if (opts.test_package_id) {
            const matchesPurchase =
              p.testId === opts.test_package_id ||
              p.packageId === opts.test_package_id ||
              (p.package?.tests ?? []).some((t) => t.id === opts.test_package_id);
            if (!matchesPurchase) continue;
          }
          // Paketteki TÜM testlerin attempt'larını topla; eski tekil alımlarda fallback olarak p.attempt
          const allAttempts = Array.isArray(p.attempts) && p.attempts.length > 0
            ? p.attempts
            : (p.attempt ? [p.attempt] : []);
          const test = p?.test ?? p?.testPackage ?? {};
          for (const attempt of allAttempts) {
            if (!attempt || (attempt.status !== 'SUBMITTED' && attempt.status !== 'TIMEOUT')) continue;
            // Gerçek çözüm süresi: önce checkpoint'ten kaydedilen elapsedSeconds,
            // yoksa submittedAt-startedAt farkı (completedAt yerine submit kullan — daha güvenilir)
            const correctCount = attempt.correctCount ?? attempt.correct_count ?? 0;
            const wrongCount  = attempt.wrongCount  ?? attempt.wrong_count  ?? 0;
            const emptyCount  = attempt.emptyCount  ?? attempt.empty_count  ?? 0;
            const totalQ = test?._count?.questions ?? (correctCount + wrongCount + emptyCount);
            const score = totalQ > 0 ? Math.round((correctCount / totalQ) * 100) : 0;
            const metaElapsed = attempt.metadata?.elapsedSeconds ?? null;
            const started = attempt.startedAt ? new Date(attempt.startedAt).getTime() : 0;
            const submitted = (attempt.submittedAt ?? attempt.completedAt)
              ? new Date(attempt.submittedAt ?? attempt.completedAt).getTime() : 0;
            const calcTime = submitted && started ? Math.floor((submitted - started) / 1000) : 0;
            const timeSpent = metaElapsed ?? calcTime;
            results.push({
              id: attempt.id,
              user_email: opts.user_email,
              test_package_id: pkgId,
              // attempt.testId paketteki çözülen tekil testin id'si — paket id'si değil
              test_id: attempt.testId ?? p.testId ?? p.test_id,
              test_package_title: test?.title ?? p?.testTitle ?? '',
              exam_type_id: test?.examTypeId ?? p?.examTypeId ?? null,
              exam_type_name: test?.examTypeName ?? p?.examTypeName ?? null,
              score,
              correct_count: correctCount,
              wrong_count: wrongCount,
              empty_count: emptyCount,
              question_count: test?._count?.questions ?? null,
              time_spent_seconds: timeSpent,
              // Gecikmeli teslim süresi (saniye); null = zamanında
              overtime_seconds: attempt.overtimeSeconds ?? null,
              created_date: attempt.completedAt ?? attempt.submittedAt ?? p.createdAt ?? p.created_date,
            });
          }
        }
        return results.sort((a, b) => new Date(b.created_date || 0).getTime() - new Date(a.created_date || 0).getTime());
      } catch (err) {
        console.warn('[dalClient] TestResult.filter failed:', err?.message || err);
        return [];
      }
    },
  },

  // TestProgress = attempt when IN_PROGRESS
  TestProgress: {
    filter: async (opts = {}) => {
      const { data } = await api.get('/me/purchases');
      const list = Array.isArray(data) ? data : [];
      const progress = [];
      for (const p of list) {
        const pkgId = p.packageId ?? p.testId;
        // Hedef paket/test ile eşleşmeyen satırları atla
        if (opts.test_package_id) {
          const matchesPurchase =
            p.testId === opts.test_package_id ||
            p.packageId === opts.test_package_id ||
            (p.package?.tests ?? []).some((t) => t.id === opts.test_package_id);
          if (!matchesPurchase) continue;
        }
        // Paketteki tüm testler için attempt'ları kontrol et
        const allAttempts = Array.isArray(p.attempts) && p.attempts.length > 0
          ? p.attempts
          : (p.attempt ? [p.attempt] : []);
        for (const a of allAttempts) {
          // PAUSED de 'devam ediyor' sayılır — aday teste geri dönüp resume edebilir.
          // Aksi takdirde 'Kaydet ve Çık' diyen aday test başlamamış gibi görüyordu.
          if (opts.is_completed === false && a.status !== 'IN_PROGRESS' && a.status !== 'PAUSED') continue;
          if (opts.is_completed === true && a.status !== 'SUBMITTED' && a.status !== 'TIMEOUT') continue;
          progress.push({
            id: a.id,
            user_email: opts.user_email,
            test_package_id: pkgId,
            test_id: a.testId,
            is_completed: a.status === 'SUBMITTED' || a.status === 'TIMEOUT',
          });
        }
      }
      return progress;
    },
    update: async (id, body) => {
      if (body.is_completed) {
        await api.post(`/attempts/${id}/finish`);
      }
      return {};
    },
    create: async () => ({}),
  },

  // Review
  Review: {
    // Paket review listesi — aday başına TEK satır (yeni model).
    // Offset-based paging. İki kullanım:
    //   packageReviews(id, 20)              → legacy: limit=20, offset=0
    //   packageReviews(id, { limit, offset }) → yeni: prev/next paging
    // Dönüş: { avg, count, items[] }
    //   avg   = paketi puanlayan farklı adayların verdiği puanların ortalaması
    //   count = paketi puanlayan farklı aday sayısı (offset'ten bağımsız toplam)
    //   items = [{ candidateId, candidateName, rating, comment, createdAt }]
    packageReviews: async (packageId, optsOrLimit = {}) => {
      if (!packageId) return { avg: null, count: 0, items: [] };
      const opts =
        typeof optsOrLimit === 'number'
          ? { limit: optsOrLimit, offset: 0 }
          : { limit: optsOrLimit.limit ?? 10, offset: optsOrLimit.offset ?? 0 };
      try {
        const { data } = await api.get(`/marketplace/packages/${packageId}/reviews`, { params: opts });
        return data ?? { avg: null, count: 0, items: [] };
      } catch {
        return { avg: null, count: 0, items: [] };
      }
    },
    // Adayın paket için kendi review'u (yeni model: tek kayıt).
    // Dönüş: { rating, comment, createdAt, updatedAt } | null
    myPackageReview: async (packageId) => {
      if (!packageId) return null;
      try {
        const { data } = await api.get(`/marketplace/packages/${packageId}/my-review`);
        return data ?? null;
      } catch {
        return null;
      }
    },
    // Adayın paket review'unu yarat veya güncelle (upsert).
    // body: { rating: 1-5, comment?: string, educatorRating?: 1-5 }
    upsertPackageReview: async (packageId, body) => {
      if (!packageId) throw new Error('packageId required');
      const payload = {};
      if (body.rating != null || body.testRating != null) {
        payload.testRating = body.rating ?? body.testRating;
      }
      if (body.educatorRating != null || body.educator_rating != null) {
        payload.educatorRating = body.educatorRating ?? body.educator_rating;
      }
      if (body.comment !== undefined) payload.comment = body.comment;
      const { data } = await api.post(`/marketplace/packages/${packageId}/reviews`, payload);
      return data;
    },
  },

  // PackageView: görüntülenme izleme
  //
  // - track(packageId): TestDetail sayfası mount edildiğinde fire-and-forget.
  //   Backend ipHash bazlı rate-limit ile spam filtreler. UX'i hiç bloklamaz.
  // - educatorViewStats(ids?): eğitici kendi paketlerinin görüntülenme metriklerini alır.
  PackageView: {
    track: async (packageId, sessionId) => {
      if (!packageId) return;
      try {
        await api.post(`/marketplace/packages/${packageId}/view`, sessionId ? { sessionId } : {});
      } catch {
        // log/track hatası UX'i bozmasın — sessizce yut
      }
    },
    educatorViewStats: async (ids) => {
      try {
        const params = Array.isArray(ids) && ids.length > 0 ? { ids: ids.join(',') } : undefined;
        const { data } = await api.get('/educators/me/packages/views', { params });
        return Array.isArray(data) ? data : [];
      } catch {
        return [];
      }
    },
  },

  // DiscountCode: educator's discount codes
  DiscountCode: {
    filter: async (opts = {}, sort) => {
      try {
        const res = await api.get('/educators/me/discount-codes');
      const data = res?.data ?? res;
      const list = Array.isArray(data) ? data : (data?.items ?? data?.data ?? []);
      return list.map((d) => ({
        id: d.id,
        code: d.code,
        percentOff: d.percentOff,
        discount_percent: d.percentOff,
        percent_off: d.percentOff,
        maxUses: d.maxUses,
        max_uses: d.maxUses,
        usedCount: d.usedCount,
        current_uses: d.usedCount,
        used_count: d.usedCount,
        isActive: d.isActive ?? true,
        is_active: d.isActive ?? true,
        validFrom: d.validFrom,
        valid_from: d.validFrom,
        validUntil: d.validUntil,
        valid_until: d.validUntil,
        description: d.description,
        createdAt: d.createdAt,
        created_date: d.createdAt,
      }));
      } catch {
        return [];
      }
    },
    create: async (body) => {
      const percentOff = body.discount_percent ?? body.percent_off ?? body.percentOff ?? 10;
      const maxUses    = body.max_uses ?? body.maxUses;
      const validFrom  = body.valid_from  || null;
      const validUntil = body.valid_until || null;
      const description = body.description || null;
      // Opsiyonel alanları yalnızca değer varsa gönder — null/undefined ile @IsDateString() çakışmasını önler
      const payload = {
        code: body.code,
        percentOff,
        ...(maxUses   != null ? { maxUses }              : {}),
        ...(validFrom          ? { validFrom }            : {}),
        ...(validUntil         ? { validUntil }           : {}),
        ...(description        ? { description }          : {}),
      };
      const { data } = await api.post('/educators/me/discount-codes', payload);
      return data;
    },
    toggle: async (id) => {
      const { data } = await api.patch(`/educators/me/discount-codes/${id}/toggle`);
      return data;
    },
    // Admin: tüm indirim kodlarını listele (creator bilgisiyle)
    adminFilter: async () => {
      try {
        const { data } = await api.get('/admin/discount-codes');
        const list = Array.isArray(data) ? data : [];
        return list.map((d) => ({
          id: d.id,
          code: d.code,
          percentOff: d.percentOff,
          discount_percent: d.percentOff,
          maxUses: d.maxUses,
          max_uses: d.maxUses,
          usedCount: d.usedCount,
          current_uses: d.usedCount,
          isActive: d.isActive ?? true,
          is_active: d.isActive ?? true,
          validFrom: d.validFrom,
          valid_from: d.validFrom,
          validUntil: d.validUntil,
          valid_until: d.validUntil,
          description: d.description,
          createdAt: d.createdAt,
          created_date: d.createdAt,
          creatorId: d.creatorId,
          creatorUsername: d.creatorUsername,
          creatorEmail: d.creatorEmail,
          creatorRole: d.creatorRole,
        }));
      } catch {
        return [];
      }
    },
    // Admin: kendi kullanıcısı olarak yeni kod oluştur
    adminCreate: async (body) => {
      const percentOff = body.discount_percent ?? body.percent_off ?? body.percentOff ?? 10;
      const maxUses    = body.max_uses ?? body.maxUses;
      const validFrom  = body.valid_from  || null;
      const validUntil = body.valid_until || null;
      const description = body.description || null;
      const payload = {
        code: body.code,
        percentOff,
        ...(maxUses   != null ? { maxUses }   : {}),
        ...(validFrom         ? { validFrom } : {}),
        ...(validUntil        ? { validUntil }: {}),
        ...(description       ? { description }: {}),
      };
      const { data } = await api.post('/admin/discount-codes', payload);
      return data;
    },
    // Admin: herhangi bir kodu aktif/pasif yap
    adminToggle: async (id) => {
      const { data } = await api.patch(`/admin/discount-codes/${id}/toggle`);
      return data;
    },
  },

  // RefundRequest
  RefundRequest: {
    // Aday: kendi iade taleplerini listele
    filter: async (opts = {}) => {
      const { data } = await api.get('/me/refunds');
      const list = Array.isArray(data) ? data : [];
      return list.map((r) => normalizeRefund(r));
    },
    // Aday: iade talebi oluştur (source: TEST | TUNNEL | WRITTEN)
    create: async (body) => {
      const { data } = await api.post('/refunds', {
        purchaseId: body.purchase_id ?? body.purchaseId,
        source: body.source ?? 'TEST',
        reason: body.reason,
        description: body.description,
      });
      return data;
    },
    // Aday: EDUCATOR_REJECTED iade talebine itiraz
    appeal: async (refundId, reason) => {
      const { data } = await api.post(`/refunds/${refundId}/appeal`, { reason });
      return data;
    },
    // Eğitici: kendi testlerine ait iade taleplerini listele
    listForEducator: async () => {
      const { data } = await api.get('/educator/refunds');
      const list = Array.isArray(data) ? data : [];
      return list.map((r) => normalizeRefund(r));
    },
    // Eğitici: iade talebini onayla → EDUCATOR_APPROVED
    educatorApprove: async (refundId) => {
      const { data } = await api.post(`/educator/refunds/${refundId}/approve`);
      return data;
    },
    // Eğitici: iade talebini reddet → EDUCATOR_REJECTED
    educatorReject: async (refundId, reason) => {
      const { data } = await api.post(`/educator/refunds/${refundId}/reject`, { reason });
      return data;
    },
    // Admin: iade taleplerini statüye göre listele
    list: async (statusFilter) => {
      const status = statusFilter ?? 'actionable';
      const { data } = await api.get('/admin/refunds', { params: { status } });
      const list = Array.isArray(data) ? data : [];
      return list.map((r) => normalizeRefund(r));
    },
    // Admin: iade talebini onayla → APPROVED
    adminApprove: async (refundId, adminNotes) => {
      const { data } = await api.post(`/admin/refunds/${refundId}/approve`, { adminNotes });
      return data;
    },
    // Admin: iade talebini reddet → REJECTED
    adminReject: async (refundId, reason) => {
      const { data } = await api.post(`/admin/refunds/${refundId}/reject`, { reason });
      return data;
    },
  },

  // Topic (legacy flat adapter — kept for backward compat)
  Topic: {
    list: async () => {
      const { data } = await api.get('/admin/topics');
      return Array.isArray(data) ? data : [];
    },
    create: async (body) => {
      const { data } = await api.post('/admin/topics', {
        name: body.name,
        examTypeIds: body.examTypeIds ?? (body.exam_type_id ? [body.exam_type_id] : []),
        parentId: body.parentId ?? null,
        active: body.active !== false,
      });
      return data;
    },
    update: async (id, body) => {
      const { data } = await api.patch(`/admin/topics/${id}`, body);
      return data;
    },
    delete: async (id) => {
      await api.delete(`/admin/topics/${id}`);
    },
  },

  // Follow
  Follow: {
    filter: async (opts = {}) => {
      const { data } = await api.get('/follows', { params: { followType: 'EDUCATOR' } });
      const list = Array.isArray(data) ? data : data?.items ?? [];
      if (opts.educator_email) {
        const educatorId = opts.educator_email;
        return list.filter((f) => f.educatorId === educatorId || f.educator?.id === educatorId);
      }
      return list;
    },
    create: async (body) => {
      const educatorId = body.educator_id ?? body.educatorId ?? body.educator_email;
      await api.post('/follows', { followType: 'EDUCATOR', educatorId });
      return {};
    },
    delete: async (id) => {
      await api.delete('/follows', { data: { followType: 'EDUCATOR', educatorId: id } });
    },
  },

  // Attempt API (for TakeTest)
  Attempt: {
    getState: async (attemptId) => {
      const { data } = await api.get(`/attempts/${attemptId}/state`);
      return data;
    },
    submitAnswer: async (attemptId, questionId, optionId) => {
      const body = optionId ? { questionId, optionId } : { questionId };
      await api.post(`/attempts/${attemptId}/answers`, body);
    },
    finish: async (attemptId) => {
      const { data } = await api.post(`/attempts/${attemptId}/finish`);
      return data;
    },
    timeout: async (attemptId) => {
      const { data } = await api.post(`/attempts/${attemptId}/timeout`);
      return data;
    },
    getResult: async (attemptId) => {
      const { data } = await api.get(`/attempts/${attemptId}/result`);
      return data;
    },
  },

  // Objection (question report from candidate during/after test)
  Objection: {
    create: async (body) => {
      const { data } = await api.post('/objections', {
        attemptId: body.attempt_id ?? body.attemptId,
        questionId: body.question_id ?? body.questionId,
        reason: body.reason,
        attachmentUrl: body.attachment_url,
      });
      return data;
    },
  },

  // QuestionReport = Objection (educator objections)
  QuestionReport: {
    filter: async (opts = {}) => {
      try {
        const params = opts.status ? `?status=${opts.status}` : '';
        const { data } = await api.get(`/educators/me/objections${params}`);
        return Array.isArray(data) ? data : [];
      } catch {
        return [];
      }
    },
    answer: async (id, answerText) => {
      const { data } = await api.post(`/educators/me/objections/${id}/answer`, { answerText });
      return data;
    },
  },
};

/**
 * Tek kaynak adapter: tüm marketplace paket endpointleri (liste ve detay) için ortak shape.
 * Liste endpointi bazı alanları döndürmeyebilir; bunlar varsayılan değerlerle tamamlanır.
 */
function packageAdapter(pkg) {
  return {
    id: pkg.id,
    title: pkg.title,
    description: pkg.description ?? '',
    educator_email: pkg.educatorId ?? '',
    educator_name: pkg.educatorUsername ?? '',
    exam_type_id: pkg.examTypeId ?? null,
    exam_type_name: pkg.examTypeName ?? null,
    grade_level_id: pkg.gradeLevelId ?? null,
    grade_level_name: pkg.gradeLevelName ?? null,
    question_count: pkg.questionCount ?? (pkg.tests ?? []).reduce((s, t) => s + (t.questionCount ?? 0), 0),
    test_count: pkg.testCount ?? (pkg.tests ?? []).length,
    price: pkg.priceCents != null ? pkg.priceCents / 100 : 0,
    priceCents: pkg.priceCents ?? 0,
    difficulty: pkg.difficulty ?? 'medium',
    cover_image: pkg.coverImageUrl ?? null,
    has_solutions: pkg.hasSolutions ?? false,
    is_published: !!pkg.publishedAt,
    is_active: !!pkg.publishedAt,
    total_sales: pkg.saleCount ?? 0,
    average_rating: pkg.ratingAvg ?? null,
    rating_count: pkg.ratingCount ?? 0,
    is_timed: false,
    duration: null,
    created_date: pkg.publishedAt,
    createdAt: pkg.publishedAt,
    packageId: pkg.id,
    _tests: pkg.tests ?? [],
  };
}

// Geriye dönük uyumluluk için takma adlar
const publicPackageDetailAdapter = packageAdapter;
const marketplacePackageAdapter = packageAdapter;

// Adapter: Dal ExamTest -> Sınav Salonu TestPackage shape
function testPackageAdapter(t) {
  return {
    id: t.id,
    title: t.title,
    educator_email: t.educator?.email ?? t.educatorId,
    educator_name: t.educator?.username ?? '',
    exam_type_id: t.examTypeId,
    topic_id: t.topicId,
    question_count: t.questionCount ?? t.questions?.length ?? 0,
    price: t.priceCents != null ? t.priceCents / 100 : 0,
    is_published: !!t.publishedAt,
    is_active: t.status !== 'UNPUBLISHED',
    total_sales: t._count?.Purchase ?? 0,
    average_rating: t.ratingAvg ?? null,
    rating_count: t.ratingCount ?? 0,
    is_timed: t.isTimed,
    duration: t.duration,
    created_date: t.createdAt,
    createdAt: t.createdAt,
    packageId: t.packageId ?? null,
  };
}

/** topics — admin ağaç CRUD API (ManageTopics sayfası için) */
export const topics = {
  /** Tam ağaç — inactive dahil, admin paneli için */
  tree: async () => {
    const { data } = await api.get('/admin/topics/tree');
    return Array.isArray(data) ? data : [];
  },
  /** Düz liste — opsiyonel examTypeId filtresi */
  flat: async (examTypeId) => {
    const params = examTypeId ? { examTypeId } : {};
    const { data } = await api.get('/admin/topics', { params });
    return Array.isArray(data) ? data : [];
  },
  /** Yeni konu — parentId ile alt konu oluşturulabilir */
  create: async ({ name, examTypeIds = [], parentId = null, active = true }) => {
    const { data } = await api.post('/admin/topics', { name, examTypeIds, parentId, active });
    return data;
  },
  /** Konu güncelle */
  update: async (id, body) => {
    const { data } = await api.patch(`/admin/topics/${id}`, body);
    return data;
  },
  /** Konu sil */
  remove: async (id) => {
    await api.delete(`/admin/topics/${id}`);
  },
};

/** LiveSession Tier yönetimi (Admin) */
export const liveSessionTiers = {
  list: async () => {
    const { data } = await api.get('/live-sessions/tiers');
    return Array.isArray(data) ? data : [];
  },
  listAll: async () => {
    const { data } = await api.get('/live-sessions/tiers/all');
    return Array.isArray(data) ? data : [];
  },
  listAdmin: async () => {
    const { data } = await api.get('/live-sessions/tiers/all');
    return Array.isArray(data) ? data : [];
  },
  create: async (body) => {
    const { data } = await api.post('/live-sessions/tiers', body);
    return data;
  },
  update: async (id, body) => {
    const { data } = await api.put(`/live-sessions/tiers/${id}`, body);
    return data;
  },
  remove: async (id) => {
    const { data } = await api.delete(`/live-sessions/tiers/${id}`);
    return data;
  },
};

/**
 * Admin kullanıcı arama — GET /admin/users?q=...
 * Email veya isim üzerinde substring araması. limit default 20.
 */
export const adminUsers = {
  search: async ({ q, limit = 20 } = {}) => {
    const { data } = await api.get('/admin/users', { params: { q, limit } });
    return Array.isArray(data) ? data : (data?.items ?? []);
  },
};

/**
 * Admin eğitici durum yönetimi.
 *   - approve: pending başvuruyu onayla (status → ACTIVE + educatorApprovedAt)
 *   - reject:  pending başvuruyu reddet (status → REJECTED + rejectionReason + rejectedAt). Sebep zorunlu.
 *   - suspend / unsuspend: aktif eğiticiyi askıya al / askıdan kaldır
 */
export const adminEducators = {
  /**
   * Admin için eğitici başvurusu detayı — popup "İncele" ekranı kullanır.
   * Döner: { id, email, username, firstName, lastName, role, status, emailVerified,
   *         educatorApprovedAt, rejectionReason, rejectedAt, createdAt,
   *         metadata: { cv_url, education_info, bio }, specializations: [{id, name}],
   *         contractAcceptances: [{contract, acceptedAt, ip, userAgent}] }
   */
  getDetail: async (educatorId) => {
    const { data } = await api.get(`/admin/educators/${educatorId}`);
    return data;
  },
  approve: async (educatorId) => {
    const { data } = await api.post(`/admin/educators/${educatorId}/approve`);
    return data;
  },
  reject: async (educatorId, reason) => {
    const { data } = await api.post(`/admin/educators/${educatorId}/reject`, { reason });
    return data;
  },
  suspend: async (educatorId) => {
    const { data } = await api.post(`/admin/educators/${educatorId}/suspend`);
    return data;
  },
  unsuspend: async (educatorId) => {
    const { data } = await api.post(`/admin/educators/${educatorId}/unsuspend`);
    return data;
  },
};

/**
 * Admin audit log listesi — GET /admin/audit
 * actorId + tarih aralığı + action/entity filtreleri.
 * Backend page/limit'le offset pagination yapar.
 */
export const adminAudit = {
  list: async ({ actorId, from, to, action, entityType, entityId, page = 1, limit = 50 } = {}) => {
    const params = {};
    if (actorId) params.actorId = actorId;
    if (from) params.from = from;
    if (to) params.to = to;
    if (action) params.action = action;
    if (entityType) params.entityType = entityType;
    if (entityId) params.entityId = entityId;
    if (page) params.page = page;
    if (limit) params.limit = limit;
    const { data } = await api.get('/admin/audit', { params });
    return data;
  },
};

/**
 * Admin reklam paketi CRUD — /admin/ad-packages endpoint'leri.
 * Eğitici "Reklamı Satın Al" akışında bu paketler liste olarak görünür
 * (public endpoint /ad-packages aktif olanları döner).
 */
export const adminAdPackages = {
  list: async ({ activeOnly = false } = {}) => {
    const { data } = await api.get('/admin/ad-packages', {
      params: { activeOnly: activeOnly ? 'true' : 'false' },
    });
    return Array.isArray(data) ? data : (data?.items ?? []);
  },
  create: async (body) => {
    const { data } = await api.post('/admin/ad-packages', body);
    return data;
  },
  update: async (id, body) => {
    const { data } = await api.patch(`/admin/ad-packages/${id}`, body);
    return data;
  },
  remove: async (id) => {
    const { data } = await api.delete(`/admin/ad-packages/${id}`);
    return data;
  },
};

/** Misafir token'ı varsa X-Live-Guest-Token header config'i döner (yoksa undefined). */
function guestHeaderCfg(guestToken) {
  return guestToken ? { headers: { 'X-Live-Guest-Token': guestToken } } : undefined;
}

/** LiveSession işlemleri */
export const liveSessions = {
  create: async (body) => {
    const { data } = await api.post('/live-sessions', body);
    return data;
  },
  listMy: async ({ cursor, status, limit = 20 } = {}) => {
    const qs = new URLSearchParams();
    if (cursor?.id) qs.set('cursorId', cursor.id);
    if (cursor?.createdAt) qs.set('cursorCreatedAt', cursor.createdAt);
    if (limit) qs.set('limit', String(limit));
    if (status) qs.set('status', status);
    const { data } = await api.get(`/live-sessions/my?${qs.toString()}`);
    // v9.x öncesi: dizi döndürüyordu. v9.x+: { items, round2, nextCursor }
    if (Array.isArray(data)) return { items: data, round2: [], nextCursor: null };
    return {
      items: Array.isArray(data?.items) ? data.items : [],
      round2: Array.isArray(data?.round2) ? data.round2 : [],
      nextCursor: data?.nextCursor ?? null,
    };
  },
  pay: async (id, opts = {}) => {
    // Sprint 15 #4 — opts.promoCode opsiyonel (admin PlatformPromoCode, LIVE_SESSION scope)
    const body = opts.promoCode ? { promoCode: opts.promoCode } : {};
    const { data } = await api.post(`/live-sessions/${id}/pay`, body);
    return data;
  },
  start: async (id) => {
    const { data } = await api.post(`/live-sessions/${id}/start`);
    return data;
  },
  next: async (id) => {
    const { data } = await api.post(`/live-sessions/${id}/next`);
    return data;
  },
  prev: async (id) => {
    const { data } = await api.post(`/live-sessions/${id}/prev`);
    return data;
  },
  toggleStats: async (id) => {
    const { data } = await api.post(`/live-sessions/${id}/toggle-stats`);
    return data;
  },
  end: async (id) => {
    const { data } = await api.post(`/live-sessions/${id}/end`);
    return data;
  },
  createRound2: async (id) => {
    const { data } = await api.post(`/live-sessions/${id}/round2`);
    return data;
  },
  getComparison: async (id) => {
    const { data } = await api.get(`/live-sessions/${id}/comparison`);
    return data;
  },
  // guestToken: login'siz (misafir) katılımcı kimliği. Verilirse X-Live-Guest-Token
  // header'ı eklenir; kayıtlı kullanıcıda null → JWT kullanılır.
  getState: async (id, guestToken) => {
    const { data } = await api.get(`/live-sessions/${id}/state`, guestHeaderCfg(guestToken));
    return data;
  },
  getByCode: async (code) => {
    const { data } = await api.get(`/live-sessions/code/${code}`);
    return data;
  },
  // displayName: misafir adı (login'siz katılımda). Kayıtlı kullanıcıda undefined.
  join: async (code, displayName) => {
    const { data } = await api.post(`/live-sessions/join/${code}`, displayName ? { displayName } : {});
    return data;
  },
  ping: async (id, guestToken) => {
    const { data } = await api.post(`/live-sessions/${id}/ping`, {}, guestHeaderCfg(guestToken));
    return data;
  },
  submitAnswer: async (id, questionId, optionId, guestToken) => {
    const { data } = await api.post(`/live-sessions/${id}/answer`, { questionId, optionId }, guestHeaderCfg(guestToken));
    return data;
  },
};

// ── Email Trafiği Modülü ────────────────────────────────────────────────
export const adminEmail = {
  dashboard: async () => {
    const { data } = await api.get('/admin/email/dashboard');
    return data;
  },
  listLogs: async ({ cursorId, cursorQueuedAt, limit, queue, status, recipientRole, templateKey, emailSearch, from, to } = {}) => {
    const qs = new URLSearchParams();
    if (cursorId) qs.set('cursorId', cursorId);
    if (cursorQueuedAt) qs.set('cursorQueuedAt', cursorQueuedAt);
    if (limit) qs.set('limit', String(limit));
    if (queue) qs.set('queue', queue);
    if (status) qs.set('status', status);
    if (recipientRole) qs.set('recipientRole', recipientRole);
    if (templateKey) qs.set('templateKey', templateKey);
    if (emailSearch) qs.set('emailSearch', emailSearch);
    if (from) qs.set('from', from);
    if (to) qs.set('to', to);
    const { data } = await api.get(`/admin/email/logs?${qs.toString()}`);
    return data;
  },
  getLog: async (id) => {
    const { data } = await api.get(`/admin/email/logs/${id}`);
    return data;
  },
  retryLog: async (id) => {
    const { data } = await api.post(`/admin/email/logs/${id}/retry`);
    return data;
  },
  listProviders: async () => {
    const { data } = await api.get('/admin/email/providers');
    return data;
  },
  createProvider: async (body) => {
    const { data } = await api.post('/admin/email/providers', body);
    return data;
  },
  updateProvider: async (id, body) => {
    const { data } = await api.patch(`/admin/email/providers/${id}`, body);
    return data;
  },
  deleteProvider: async (id) => {
    const { data } = await api.delete(`/admin/email/providers/${id}`);
    return data;
  },
  testProvider: async (id, { toEmail, subject } = {}) => {
    const { data } = await api.post(`/admin/email/providers/${id}/test`, { toEmail, subject });
    return data;
  },
  toggleKillSwitch: async (body) => {
    const { data } = await api.patch('/admin/email/kill-switches', body);
    return data;
  },
  listSuppressions: async ({ cursor, limit, search } = {}) => {
    const qs = new URLSearchParams();
    if (cursor) qs.set('cursor', cursor);
    if (limit) qs.set('limit', String(limit));
    if (search) qs.set('search', search);
    const { data } = await api.get(`/admin/email/suppressions?${qs.toString()}`);
    return data;
  },
  addSuppression: async (body) => {
    const { data } = await api.post('/admin/email/suppressions', body);
    return data;
  },
  removeSuppression: async (id) => {
    const { data } = await api.delete(`/admin/email/suppressions/${id}`);
    return data;
  },
  listTemplates: async () => {
    const { data } = await api.get('/admin/email/templates');
    return data;
  },
  updateTemplate: async (id, body) => {
    const { data } = await api.patch(`/admin/email/templates/${id}`, body);
    return data;
  },
};

export const meEmailPreferences = {
  get: async () => {
    const { data } = await api.get('/me/email-preferences');
    return data;
  },
  update: async (body) => {
    const { data } = await api.patch('/me/email-preferences', body);
    return data;
  },
};

export const emailPublic = {
  unsubscribe: async (token, category) => {
    const qs = new URLSearchParams();
    qs.set('token', token);
    if (category) qs.set('category', category);
    const { data } = await api.get(`/unsubscribe?${qs.toString()}`);
    return data;
  },
};


/** İçerik Moderasyonu — Eğitici tarafı (kendi durumu) */
export const meModeration = {
  /**
   * Eğitici'nin moderasyon durumu — risk profili, son ihlaller, aktif aksiyon
   */
  getStatus: async () => {
    const { data } = await api.get('/me/moderation-status');
    return data ?? { riskScore: null, recentViolations: [], activeAction: null, suspendedUntil: null, isBanned: false };
  },
};

/** İçelik Moderasyonu (Admin Panel) */
export const adminModeration = {
  /**
   * İnceleme kuyruğu — cursor pagination
   * @param {Object} opts - { cursor, limit, category, dateFrom, dateTo, userId }
   */
  listQueue: async (opts = {}) => {
    const qs = new URLSearchParams();
    if (opts.cursor?.id) qs.set('cursorId', opts.cursor.id);
    if (opts.cursor?.createdAt) qs.set('cursorCreatedAt', opts.cursor.createdAt);
    if (opts.limit) qs.set('limit', String(opts.limit));
    if (opts.category) qs.set('category', opts.category);
    if (opts.dateFrom) qs.set('dateFrom', opts.dateFrom);
    if (opts.dateTo) qs.set('dateTo', opts.dateTo);
    if (opts.userId) qs.set('userId', opts.userId);
    if (opts.status) qs.set('status', opts.status);
    const { data } = await api.get(`/admin/moderation/queue?${qs.toString()}`);
    return data ?? { items: [], nextCursor: null };
  },

  /**
   * Moderasyon sonucu detayı
   */
  getResult: async (id) => {
    const { data } = await api.get(`/admin/moderation/results/${id}`);
    return data;
  },

  /**
   * Moderasyon sonucunu onay (clean)
   */
  approveResult: async (id, { reviewerNote } = {}) => {
    const { data } = await api.post(`/admin/moderation/results/${id}/approve`, { reviewerNote });
    return data;
  },

  /**
   * Moderasyon sonucunu reddet (violation confirmed)
   */
  rejectResult: async (id, { reviewerNote } = {}) => {
    const { data } = await api.post(`/admin/moderation/results/${id}/reject`, { reviewerNote });
    return data;
  },

  /**
   * Riskli eğiticiler listesi — cursor pagination
   * @param {Object} opts - { cursor, limit, riskLevel, category, dateFrom, dateTo, q }
   */
  listRiskyEducators: async (opts = {}) => {
    const qs = new URLSearchParams();
    // Backend cursor: { computedScore, userId } → query param: cursorUserId + cursorScore
    if (opts.cursor?.userId) qs.set('cursorUserId', opts.cursor.userId);
    if (opts.cursor?.computedScore) qs.set('cursorScore', String(opts.cursor.computedScore));
    if (opts.limit) qs.set('limit', String(opts.limit));
    if (opts.riskLevel?.length) qs.set('riskLevel', opts.riskLevel.join(','));
    if (opts.category) qs.set('category', opts.category);
    if (opts.dateFrom) qs.set('dateFrom', opts.dateFrom);
    if (opts.dateTo) qs.set('dateTo', opts.dateTo);
    if (opts.q) qs.set('q', opts.q);
    const { data } = await api.get(`/admin/moderation/risky-educators?${qs.toString()}`);
    const raw = data ?? { items: [], nextCursor: null };
    // Backend EducatorRiskScore satırını UI'ın beklediği FLAT şekle indir: user alanı
    // nested geliyor (r.user.username vb.); id = educator userId (aksiyon + detay linki
    // bunu kullanır). username her zaman string olsun ki list render'ı (initial harf) patlamasın.
    return {
      ...raw,
      items: (raw.items ?? []).map((r) => ({
        ...r,
        id: r.userId ?? r.id,
        username: r.user?.username ?? r.username ?? '—',
        email: r.user?.email ?? r.email ?? '',
        isBanned: r.user?.isBanned ?? r.isBanned ?? false,
        suspendedUntil: r.user?.suspendedUntil ?? r.suspendedUntil ?? null,
      })),
    };
  },

  /**
   * Eğitici ihlal geçmişi — cursor pagination
   */
  getEducatorViolations: async (educatorId, opts = {}) => {
    const qs = new URLSearchParams();
    if (opts.cursor?.id) qs.set('cursorId', opts.cursor.id);
    if (opts.cursor?.createdAt) qs.set('cursorCreatedAt', opts.cursor.createdAt);
    if (opts.limit) qs.set('limit', String(opts.limit));
    const { data } = await api.get(`/admin/moderation/educators/${educatorId}/violations?${qs.toString()}`);
    return data ?? { items: [], nextCursor: null };
  },

  /**
   * Eğitici üzerine aksiyon uygula (uyar, askıya al, banla)
   */
  applyAction: async (educatorId, {
    actionType,  // WARN, ACCOUNT_SUSPENDED, ACCOUNT_BANNED, ESCALATED_TO_ADMIN
    reason,      // min 20 karakter
    durationDays, // opsiyonel, SUSPEND için gerekli
    violationId  // opsiyonel
  }) => {
    const { data } = await api.post(`/admin/moderation/educators/${educatorId}/actions`, {
      actionType,
      reason,
      durationDays,
      violationId,
    });
    return data;
  },

  /**
   * Eğitici üzerine uygulanan aksiyonu iptal et
   */
  revokeAction: async (actionId) => {
    await api.delete(`/admin/moderation/actions/${actionId}`);
  },

  /**
   * Yasak kelimeler listesi — cursor pagination
   */
  listBlockedTerms: async (opts = {}) => {
    const qs = new URLSearchParams();
    if (opts.cursor?.id) qs.set('cursorId', opts.cursor.id);
    if (opts.limit) qs.set('limit', String(opts.limit));
    if (opts.category) qs.set('category', opts.category);
    if (opts.isActive !== undefined) qs.set('isActive', String(opts.isActive));
    if (opts.term) qs.set('term', opts.term);
    const { data } = await api.get(`/admin/moderation/blocked-terms?${qs.toString()}`);
    return data ?? { items: [], nextCursor: null };
  },

  /**
   * Yeni yasak kelime ekle
   */
  createBlockedTerm: async ({ term, pattern, category, severity, isActive }) => {
    const { data } = await api.post(`/admin/moderation/blocked-terms`, {
      term,
      pattern,
      category,
      severity,
      isActive: isActive !== false,
    });
    return data;
  },

  /**
   * Yasak kelime güncelle
   */
  updateBlockedTerm: async (id, partial) => {
    const { data } = await api.patch(`/admin/moderation/blocked-terms/${id}`, partial);
    return data;
  },

  /**
   * Yasak kelime sil
   */
  deleteBlockedTerm: async (id) => {
    await api.delete(`/admin/moderation/blocked-terms/${id}`);
  },
};

export const adminBackup = {
  getSettings: async () => {
    const { data } = await api.get('/admin/backup/settings');
    return data;
  },
  updateSettings: async (body) => {
    const { data } = await api.patch('/admin/backup/settings', body);
    return data;
  },
  runNow: async () => {
    const { data } = await api.post('/admin/backup/run-now');
    return data;
  },
  listLogs: async (opts = {}) => {
    const qs = new URLSearchParams();
    if (opts.cursor?.id) qs.set('cursorId', opts.cursor.id);
    if (opts.limit) qs.set('limit', String(opts.limit));
    if (opts.status) qs.set('status', opts.status);
    const { data } = await api.get(`/admin/backup/logs?${qs.toString()}`);
    return data ?? { items: [], nextCursor: null };
  },
};


/**
 * Platform Promo Codes — Sprint 15 #3/4.
 *
 * Eğiticinin canlı test (LiveSession) ve reklam paketi (AdPurchase) satın
 * almasında kullandığı admin-issued promo kodu. `DiscountCode` modelinden
 * AYRI: bunlar admin yönetir, scope LIVE_SESSION/AD_PACKAGE.
 */
export const platformPromoCodes = {
  /** Admin: tüm promo kodlarını listele (cursor pagination + opsiyonel filter) */
  list: async ({ cursor, limit = 50, scope, onlyActive } = {}) => {
    const qs = new URLSearchParams();
    if (cursor) qs.set('cursor', cursor);
    if (limit) qs.set('limit', String(limit));
    if (scope) qs.set('scope', scope);
    if (onlyActive) qs.set('onlyActive', 'true');
    const { data } = await api.get(`/admin/platform-promo-codes?${qs.toString()}`);
    return data ?? { items: [], nextCursor: null };
  },
  /** Admin: yeni kod oluştur */
  create: async (input) => {
    const { data } = await api.post('/admin/platform-promo-codes', input);
    return data;
  },
  /** Admin: aktif/pasif toggle */
  toggle: async (id, isActive) => {
    const { data } = await api.patch(`/admin/platform-promo-codes/${id}/toggle`, { isActive });
    return data;
  },
  /** Admin: sil (dikkat — usage kayıtları cascade) */
  delete: async (id) => {
    await api.delete(`/admin/platform-promo-codes/${id}`);
  },
  /** Educator: ödeme öncesi promo kodu doğrula (validate, usage atmaz) */
  validate: async (code, scope, basePriceCents) => {
    const { data } = await api.post('/platform-promo-codes/validate', {
      code,
      scope,
      basePriceCents,
    });
    return data;
  },
};

/**
 * Discounts API — Sprint 15 #2.
 *
 * Aday paket satın almadan önce indirim kodunu doğrular. Backend 200 dönerse
 * indirim oranı + son fiyatı UI gösterir; submit'te aynı kod Purchase.create
 * body'sine eklenir (gerçek `usedCount++` orada race-condition korumalı).
 */
export const discounts = {
  /**
   * @param {string} code - Kullanıcının girdiği kod
   * @param {string} packageId - TestPackage ID
   * @param {number} basePriceCents - Paket baz fiyatı (cents)
   * @returns { code, percentOff, discountCents, finalAmountCents, description }
   */
  validate: async (code, packageId, basePriceCents) => {
    const { data } = await api.post('/discounts/validate', {
      code,
      packageId,
      basePriceCents,
    });
    return data;
  },
};

/**
 * Contracts API — Sprint 14.
 *
 * Frontend, Register / Purchase / Educator-onboarding akışlarında
 * aktif sözleşme metnini fetch edip kullanıcıya gösterir, kabul checkbox'ı
 * ile birlikte contract.id'yi backend'e gönderir.
 *
 * ContractType: 'CANDIDATE' | 'EDUCATOR' | 'PRIVACY' | 'DISTANCE_SALE'
 */
export const contracts = {
  /** Aktif sözleşmeyi tipine göre getir. Auth gerekmez. */
  getActive: async (type) => {
    const { data } = await api.get(`/contracts/active?type=${encodeURIComponent(type)}`);
    return data; // { id, type, version, title, content, publishedAt }
  },
  /**
   * Kabul kaydı oluştur. Idempotent: aynı user + contract için tek satır.
   * Auth zorunlu (CANDIDATE/EDUCATOR/ADMIN).
   *
   * NOT: Register + Purchase akışı kendi içinde acceptance kaydını üretir
   * (RegisterUseCase + PurchaseUseCase atomik). Bu endpoint sadece
   * profil sonrası "Yeni sözleşme yayımlandı, kabul et" gibi senaryolar için.
   */
  accept: async (contractId) => {
    const { data } = await api.post('/contracts/accept', { contractId });
    return data; // { acceptedAt }
  },

  // ── Admin (ManageContracts sayfası) — ADMIN rolü ──
  /** Admin: tüm sözleşmeleri listele (tip filtresi opsiyonel; verilmezse 4 tip de gelir). */
  adminList: async (type) => {
    const qs = type ? `?type=${encodeURIComponent(type)}` : '';
    const { data } = await api.get(`/admin/contracts${qs}`);
    return Array.isArray(data) ? data : (data?.items ?? []);
  },
  /**
   * Admin: yeni sözleşme versiyonu oluştur (varsayılan isActive=false).
   * @param {{type:string, version:number, title:string, content:string, isActive?:boolean}} input
   */
  adminCreate: async (input) => {
    const { data } = await api.post('/admin/contracts', input);
    return data;
  },
  /** Admin: sözleşmeyi güncelle (kısmi — title/content/isActive). */
  adminUpdate: async (id, patch) => {
    const { data } = await api.patch(`/admin/contracts/${id}`, patch);
    return data;
  },
  /** Admin: sözleşmeyi tipi için aktif versiyon yap (diğer versiyonlar pasifleşir). */
  adminSetActive: async (id) => {
    const { data } = await api.post(`/admin/contracts/${id}/set-active`, {});
    return data;
  },
};

/**
 * Aday kişisel notları (CANDIDATE). Soru çözerken "+ Not" ile alınır; Notlarım
 * sayfasında adresli (test/konu/sınav türü) görünür ve filtrelenir.
 */
export const notes = {
  /**
   * Not oluştur. questionId → soru-bağlı (adres otomatik); testId → test bağlamı;
   * ikisi de yoksa serbest ("genel") not.
   * @param {{ body:string, questionId?:string, testId?:string, attemptId?:string }} input
   */
  create: async (input) => {
    const { data } = await api.post('/candidate-notes', input);
    return data;
  },
  /**
   * Notları listele (numaralı sayfalama + filtreler).
   * @param {{ page?:number, pageSize?:number, limit?:number, topicId?:string, testId?:string, examTypeId?:string, q?:string, scope?:'general' }} [params]
   * @returns {Promise<{ items:Array, total:number, page:number, pageSize:number }>}
   */
  list: async (params = {}) => {
    const clean = Object.fromEntries(
      Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== ''),
    );
    const { data } = await api.get('/candidate-notes', { params: clean });
    return data;
  },
  /** Filtre seçenekleri (notlarda geçen konu/test/sınav türü + serbest not var mı). */
  facets: async () => {
    const { data } = await api.get('/candidate-notes/facets');
    return data; // { topics, tests, examTypes, hasGeneral }
  },
  /** Not metnini güncelle (adresleme değişmez). */
  update: async (id, body) => {
    const { data } = await api.patch(`/candidate-notes/${id}`, { body });
    return data;
  },
  /** Notu sil. */
  remove: async (id) => {
    const { data } = await api.delete(`/candidate-notes/${id}`);
    return data;
  },
};

/**
 * Tünel modülü (Faz 1: eğitici oluşturma + admin onay).
 */
export const tunnels = {
  /** Wizard 1 — tünel oluştur (DRAFT). */
  create: async (input) => {
    const { data } = await api.post('/tunnels', input);
    return data;
  },
  /** Eğiticinin tünelleri. */
  mine: async () => {
    const { data } = await api.get('/tunnels/mine');
    return data; // { items }
  },
  /** Tünel detayı (katman+soru+seçenek). */
  get: async (id) => {
    const { data } = await api.get(`/tunnels/${id}`);
    return data;
  },
  /** Wizard 1'e dönüş — tünel meta güncelle (başlık/konu/fiyat/kapak). */
  update: async (id, input) => {
    const { data } = await api.patch(`/tunnels/${id}`, input);
    return data;
  },
  /** Soru/şık/kapak görseli yükle → URL döner (normal test ile aynı endpoint). */
  uploadImage: async (file) => {
    const fd = new FormData();
    fd.append('file', file);
    const { data } = await api.post('/upload/image', fd);
    return data.url || data.fileUrl || data.file_url || '';
  },
  /** Wizard 2 — katman bazlı soruları kaydet. */
  saveQuestions: async (id, layers) => {
    const { data } = await api.patch(`/tunnels/${id}/questions`, { layers });
    return data;
  },
  /** Onaya gönder. */
  submit: async (id) => {
    const { data } = await api.post(`/tunnels/${id}/submit`, {});
    return data;
  },
  // ── Admin ──
  adminPending: async () => {
    const { data } = await api.get('/admin/tunnels/pending');
    return data; // { items }
  },
  adminGet: async (id) => {
    const { data } = await api.get(`/admin/tunnels/${id}`);
    return data;
  },
  adminApprove: async (id) => {
    const { data } = await api.post(`/admin/tunnels/${id}/approve`, {});
    return data;
  },
  adminReject: async (id, reason) => {
    const { data } = await api.post(`/admin/tunnels/${id}/reject`, { reason });
    return data;
  },
};

/**
 * Aday tünel akışı — pazar, satın alma, başlat/sürdür, çöz (adaptif).
 */
export const candidateTunnels = {
  list: async (params = {}) => {
    const { data } = await api.get('/candidate-tunnels', { params });
    return data; // { items }
  },
  meta: async (id) => {
    const { data } = await api.get(`/candidate-tunnels/${id}`);
    return data; // { ...summary, purchased, attemptStatus }
  },
  /** Satın al. body: { discountCode?, paymentProvider?, acceptedDistanceSaleContractId? } */
  purchase: async (id, body = {}) => {
    const { data } = await api.post(`/candidate-tunnels/${id}/purchase`, body);
    return data;
  },
  /** İndirim kodu önizleme doğrulaması → { code, percentOff, discountCents, finalAmountCents } */
  validateDiscount: async (id, code) => {
    const { data } = await api.post(`/candidate-tunnels/${id}/validate-discount`, { code });
    return data;
  },
  /** Aday tünel raporu (ilerleme + durum) → { items } */
  reports: async () => {
    const { data } = await api.get('/candidate-tunnels/reports');
    return data;
  },
  /** Tünel değerlendirmeleri → { avg, count, items } */
  reviews: async (id, { limit = 5, offset = 0 } = {}) => {
    const { data } = await api.get(`/candidate-tunnels/${id}/reviews`, { params: { limit, offset } });
    return data ?? { avg: null, count: 0, items: [] };
  },
  /** Adayın kendi değerlendirmesi → { rating, comment } | null */
  myReview: async (id) => {
    try {
      const { data } = await api.get(`/candidate-tunnels/${id}/my-review`);
      return data ?? null;
    } catch { return null; }
  },
  /** Değerlendirme oluştur/güncelle */
  upsertReview: async (id, { rating, comment }) => {
    const { data } = await api.post(`/candidate-tunnels/${id}/reviews`, { rating, comment });
    return data;
  },
  start: async (id) => {
    const { data } = await api.post(`/candidate-tunnels/${id}/start`, {});
    return data; // state
  },
  play: async (id) => {
    const { data } = await api.get(`/candidate-tunnels/${id}/play`);
    return data; // state
  },
  answer: async (id, selectedOptionId) => {
    const { data } = await api.post(`/candidate-tunnels/${id}/answer`, { selectedOptionId });
    return data; // { correct, correctOptionId, completed, state }
  },
  report: async (id, { questionId, reason }) => {
    const { data } = await api.post(`/candidate-tunnels/${id}/report`, { questionId, reason });
    return data; // { ok, id }
  },
};

// --- Written Tests (Yazılı Test — eğitici modülü) ---
export const writtenTests = {
  /** Yeni yazılı test paketi oluştur */
  createPackage: async (body) => {
    const { data } = await api.post('/written-packages', body);
    return data;
  },
  /** Paketi güncelle (PATCH) */
  updatePackage: async (id, body) => {
    const { data } = await api.patch(`/written-packages/${id}`, body);
    return data;
  },
  /** Eğiticinin kendi yazılı paketlerini listele */
  listMine: async () => {
    const { data } = await api.get('/written-packages/mine');
    return data;
  },
  /** Tek paket detayı (testler + sorular dahil) */
  getPackage: async (id) => {
    const { data } = await api.get(`/written-packages/${id}`);
    return data;
  },
  /** Paketi yayınla */
  publishPackage: async (id) => {
    const { data } = await api.put(`/written-packages/${id}/publish`);
    return data;
  },
  /** Paketi yayından kaldır */
  unpublishPackage: async (id) => {
    const { data } = await api.put(`/written-packages/${id}/unpublish`);
    return data;
  },
  /** Pakete yeni test ekle */
  createTest: async (packageId, body) => {
    const { data } = await api.post(`/written-packages/${packageId}/tests`, body);
    return data;
  },
  /** Testi güncelle */
  updateTest: async (testId, body) => {
    const { data } = await api.patch(`/written-tests/${testId}`, body);
    return data;
  },
  /** Testi sil */
  deleteTest: async (testId) => {
    const { data } = await api.delete(`/written-tests/${testId}`);
    return data;
  },
  /** Teste soru ekle */
  createQuestion: async (testId, body) => {
    const { data } = await api.post(`/written-tests/${testId}/questions`, body);
    return data;
  },
  /** Soruyu güncelle */
  updateQuestion: async (testId, questionId, body) => {
    const { data } = await api.patch(`/written-tests/${testId}/questions/${questionId}`, body);
    return data;
  },
  /** Soruyu sil */
  deleteQuestion: async (testId, questionId) => {
    const { data } = await api.delete(`/written-tests/${testId}/questions/${questionId}`);
    return data;
  },
  /** Görsel yükle (soru/çözüm) */
  uploadImage: async (file) => {
    const fd = new FormData();
    fd.append('file', file);
    const { data } = await api.post('/upload/image', fd);
    return data;
  },
};

/** Aday yazılı test akışı (pazar / satın alma / çözme). */
export const candidateWritten = {
  /** Yayımlanmış yazılı paketler (pazar). featured=true → aktif reklamlar en üste (AD_BOOSTED). */
  listPackages: async ({ limit = 20, cursor, featured } = {}) => {
    const qs = new URLSearchParams();
    if (limit) qs.set('limit', String(limit));
    if (cursor) qs.set('cursor', cursor);
    if (featured) qs.set('featured', '1');
    const { data } = await api.get(`/candidate-written/packages?${qs.toString()}`);
    return data;
  },
  /** Paket detay (çözüm sızdırmaz) */
  getPackage: async (id) => {
    const { data } = await api.get(`/candidate-written/packages/${id}`);
    return data;
  },
  /** Adayın satın aldığı yazılı paketler (test + deneme durumu) */
  myPackages: async () => {
    const { data } = await api.get('/candidate-written/my-packages');
    return data;
  },
  /** İndirim kodu önizleme */
  validateDiscount: async (id, code) => {
    const { data } = await api.post(`/candidate-written/packages/${id}/validate-discount`, { code });
    return data;
  },
  /** Paket satın al */
  purchase: async (id, body = {}) => {
    const { data } = await api.post(`/candidate-written/packages/${id}/purchase`, body);
    return data;
  },
  /** Test çözmeye başla / sürdür → { attemptId, resumed } */
  start: async (testId) => {
    const { data } = await api.post(`/candidate-written/tests/${testId}/start`, {});
    return data;
  },
  /** Deneme durumu */
  getState: async (attemptId) => {
    const { data } = await api.get(`/candidate-written/attempts/${attemptId}/state`);
    return data;
  },
  /** Metin cevap + kalem çizimi kaydet (ikisi de boş → sil) */
  submitAnswer: async (attemptId, { questionId, textAnswer, drawingUrl }) => {
    const { data } = await api.post(`/candidate-written/attempts/${attemptId}/answer`, { questionId, textAnswer, drawingUrl });
    return data;
  },
  /** Denemeyi teslim et */
  finish: async (attemptId) => {
    const { data } = await api.post(`/candidate-written/attempts/${attemptId}/finish`, {});
    return data;
  },
  /** Süre aşımı teslimi */
  timeout: async (attemptId) => {
    const { data } = await api.post(`/candidate-written/attempts/${attemptId}/timeout`, {});
    return data;
  },
  /** Soru çözümünü getir (çözümü gör) */
  getSolution: async (attemptId, questionId) => {
    const { data } = await api.get(`/candidate-written/attempts/${attemptId}/questions/${questionId}/solution`);
    return data;
  },
  /** Hata bildirimi */
  report: async (testId, { questionId, reason }) => {
    const { data } = await api.post(`/candidate-written/tests/${testId}/report`, { questionId, reason });
    return data;
  },
  /** Kalem çizimini (PNG dataURL) yükle → { url } (cevaba drawingUrl olarak eklenir) */
  uploadDrawing: async (dataUrl) => {
    const blob = await (await fetch(dataUrl)).blob();
    const fd = new FormData();
    fd.append('file', new File([blob], 'drawing.png', { type: 'image/png' }));
    const { data } = await api.post('/upload/image', fd);
    return data;
  },
  /** Paket değerlendirmeleri → { avg, count, items } */
  reviews: async (id, { limit = 5, offset = 0 } = {}) => {
    const { data } = await api.get(`/candidate-written/packages/${id}/reviews`, { params: { limit, offset } });
    return data ?? { avg: null, count: 0, items: [] };
  },
  /** Adayın kendi değerlendirmesi → { rating, comment } | null */
  myReview: async (id) => {
    const { data } = await api.get(`/candidate-written/packages/${id}/my-review`);
    return data;
  },
  /** Değerlendirme oluştur/güncelle */
  upsertReview: async (id, { rating, comment }) => {
    const { data } = await api.post(`/candidate-written/packages/${id}/review`, { rating, comment });
    return data;
  },
};

// ════════════════════════════════════════════════════════════════════════
// E-Sınıf (Okul) modülü — Sprint 1 Foundation
// ════════════════════════════════════════════════════════════════════════

/** Platform Admin — okul + dönem yönetimi (/admin/schools, /admin/academic-periods) */
export const adminSchools = {
  listPeriods: async () => (await api.get('/admin/academic-periods')).data,
  createPeriod: async (body) => (await api.post('/admin/academic-periods', body)).data,
  /** { items, total, page, pageSize, totalPages } döner. Filtre: q, schoolType, adminEmail, periodId */
  list: async ({ q, schoolType, adminEmail, periodId, page, pageSize } = {}) => {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (schoolType) params.set('schoolType', schoolType);
    if (adminEmail) params.set('adminEmail', adminEmail);
    if (periodId) params.set('periodId', periodId);
    if (page) params.set('page', String(page));
    if (pageSize) params.set('pageSize', String(pageSize));
    const qs = params.toString();
    return (await api.get(`/admin/schools${qs ? `?${qs}` : ''}`)).data;
  },
  create: async (body) => (await api.post('/admin/schools', body)).data,
  update: async (id, body) => (await api.patch(`/admin/schools/${id}`, body)).data,
  deactivate: async (id) => (await api.delete(`/admin/schools/${id}`)).data,
  /** body: { email, firstName?, lastName? } → { email, tempPassword } döner */
  assignAdmin: async (id, body) => (await api.post(`/admin/schools/${id}/assign-admin`, body)).data,
  /** Okula dönem yetkilendirmesi ekle/çıkar (çoklu dönem) */
  addPeriod: async (id, periodId) => (await api.post(`/admin/schools/${id}/periods`, { periodId })).data,
  removePeriod: async (id, periodId) => (await api.delete(`/admin/schools/${id}/periods/${periodId}`)).data,
};

/** Okul Yöneticisi / Şube Yöneticisi — okul içi yönetim (/school/*) */
export const school = {
  // Ağaç: Şube → Seviye → Sınıf
  tree: async () => (await api.get('/school/tree')).data,
  // Şube
  listBranches: async () => (await api.get('/school/branches')).data,
  createBranch: async (body) => (await api.post('/school/branches', body)).data,
  assignBranchAdmin: async (id, body) => (await api.post(`/school/branches/${id}/assign-admin`, body)).data,
  // Seviye
  createLevel: async (body) => (await api.post('/school/levels', body)).data,
  assignLevelAdmin: async (id, body) => (await api.post(`/school/levels/${id}/assign-admin`, body)).data,
  deleteLevel: async (id) => (await api.delete(`/school/levels/${id}`)).data,
  // Sınıf
  listClassrooms: async ({ branchId } = {}) => {
    const qs = new URLSearchParams();
    if (branchId) qs.set('branchId', branchId);
    return (await api.get(`/school/classrooms?${qs.toString()}`)).data;
  },
  createClassroom: async (body) => (await api.post('/school/classrooms', body)).data,
  assignStudents: async (id, schoolUserIds) => (await api.post(`/school/classrooms/${id}/students`, { schoolUserIds })).data,
  /** Excel: toplu öğrenci oluştur → { count, created:[{name,username,tempPassword}] } */
  bulkCreateStudents: async (id, students) => (await api.post(`/school/classrooms/${id}/students/bulk`, { students })).data,
  assignClassroomAdmin: async (id, body) => (await api.post(`/school/classrooms/${id}/assign-admin`, body)).data,
  deleteClassroom: async (id) => (await api.delete(`/school/classrooms/${id}`)).data,
  // Zümre
  departmentTree: async () => (await api.get('/school/department-tree')).data,
  listDepartments: async () => (await api.get('/school/departments')).data,
  createDepartment: async (body) => (await api.post('/school/departments', body)).data,
  deleteDepartment: async (id) => (await api.delete(`/school/departments/${id}`)).data,
  departmentMembers: async (id) => (await api.get(`/school/departments/${id}/members`)).data,
  assignMembers: async (id, body) => (await api.post(`/school/departments/${id}/members`, body)).data,
  // Ders havuzu
  listSubjects: async () => (await api.get('/school/subjects')).data,
  createSubject: async (body) => (await api.post('/school/subjects', body)).data,
  deleteSubject: async (id) => (await api.delete(`/school/subjects/${id}`)).data,
  // Kullanıcılar
  listUsers: async ({ role, q, branchId, cursor, limit = 30 } = {}) => {
    const qs = new URLSearchParams();
    if (role) qs.set('role', role);
    if (q) qs.set('q', q);
    if (branchId) qs.set('branchId', branchId);
    if (cursor) qs.set('cursor', cursor);
    if (limit) qs.set('limit', String(limit));
    return (await api.get(`/school/users?${qs.toString()}`)).data;
  },
  /** { schoolUserId, username, tempPassword } döner */
  createUser: async (body) => (await api.post('/school/users', body)).data,
  setUserActive: async (id, isActive) => (await api.patch(`/school/users/${id}/active`, { isActive })).data,
  /** { username, tempPassword } döner */
  resetPassword: async (id) => (await api.post(`/school/users/${id}/reset-password`)).data,
  // Kota
  quota: async () => (await api.get('/school/quota')).data,

  // Sınav havuzu (Sprint 2) — öğretmen/zümre başkanı
  exams: {
    list: async ({ examType, gradeLevel, includeArchived, q } = {}) => {
      const qs = new URLSearchParams();
      if (examType) qs.set('examType', examType);
      if (gradeLevel != null) qs.set('gradeLevel', String(gradeLevel));
      if (includeArchived) qs.set('includeArchived', '1');
      if (q) qs.set('q', q);
      return (await api.get(`/school/exams?${qs.toString()}`)).data;
    },
    get: async (id) => (await api.get(`/school/exams/${id}`)).data,
    create: async (body) => (await api.post('/school/exams', body)).data,
    update: async (id, body) => (await api.patch(`/school/exams/${id}`, body)).data,
    saveQuestions: async (id, questions) => (await api.post(`/school/exams/${id}/questions`, { questions })).data,
    archive: async (id, isArchived) => (await api.patch(`/school/exams/${id}/archive`, { isArchived })).data,
    remove: async (id) => (await api.delete(`/school/exams/${id}`)).data,
  },

  // Ödevler (Sprint 3) — öğretmen/zümre başkanı
  assignments: {
    list: async ({ classroomId } = {}) => {
      const qs = new URLSearchParams();
      if (classroomId) qs.set('classroomId', classroomId);
      return (await api.get(`/school/assignments?${qs.toString()}`)).data;
    },
    create: async (body) => (await api.post('/school/assignments', body)).data,
    report: async (id) => (await api.get(`/school/assignments/${id}/report`)).data,
    releaseResults: async (id) => (await api.post(`/school/assignments/${id}/release-results`)).data,
    setStatus: async (id, status) => (await api.patch(`/school/assignments/${id}/status`, { status })).data,
  },

  // Yazılı değerlendirme (Sprint 4)
  grading: {
    get: async (submissionId) => (await api.get(`/school/submissions/${submissionId}/grading`)).data,
    grade: async (submissionId, body) => (await api.post(`/school/submissions/${submissionId}/grade`, body)).data,
  },

  // Raporlar (Sprint 5)
  reports: {
    overview: async () => (await api.get('/school/reports/overview')).data,
    branch: async (branchId) => (await api.get(`/school/reports/branch/${branchId}`)).data,
    /** Filtreli kırılım: { from, to, gradeLevel, classroomId, departmentId } → şube/seviye/sınıf + highlights */
    breakdown: async ({ from, to, gradeLevel, classroomId, departmentId } = {}) => {
      const qs = new URLSearchParams();
      if (from) qs.set('from', from);
      if (to) qs.set('to', to);
      if (gradeLevel) qs.set('gradeLevel', String(gradeLevel));
      if (classroomId) qs.set('classroomId', classroomId);
      if (departmentId) qs.set('departmentId', departmentId);
      const s = qs.toString();
      return (await api.get(`/school/reports/breakdown${s ? `?${s}` : ''}`)).data;
    },
    /** Tek sınıf detayı: classroomId + { from, to, departmentId } */
    classroom: async (classroomId, { from, to, departmentId } = {}) => {
      const qs = new URLSearchParams();
      if (from) qs.set('from', from);
      if (to) qs.set('to', to);
      if (departmentId) qs.set('departmentId', departmentId);
      const s = qs.toString();
      return (await api.get(`/school/reports/classroom/${classroomId}${s ? `?${s}` : ''}`)).data;
    },
  },

  // Canlı sınav — öğretmen host (Sprint 4-B)
  live: {
    list: async () => (await api.get('/school/live')).data,
    create: async (body) => (await api.post('/school/live', body)).data,
    host: async (id) => (await api.get(`/school/live/${id}/host`)).data,
    start: async (id) => (await api.post(`/school/live/${id}/start`)).data,
    advance: async (id) => (await api.post(`/school/live/${id}/advance`)).data,
    end: async (id) => (await api.post(`/school/live/${id}/end`)).data,
  },
};

// E-Sınıf öğrenci canlı sınav katılımı (Sprint 4-B)
export const studentLive = {
  join: async (joinCode) => (await api.post('/school/live/join', { joinCode })).data,
  state: async (id) => (await api.get(`/school/live/${id}/state`)).data,
  answer: async (id, body) => (await api.post(`/school/live/${id}/answer`, body)).data,
};

// E-Sınıf öğrenci ödev çözme (Sprint 3)
export const studentAssignments = {
  list: async ({ filter } = {}) => {
    const qs = new URLSearchParams();
    if (filter) qs.set('filter', filter);
    return (await api.get(`/student/assignments?${qs.toString()}`)).data;
  },
  get: async (id) => (await api.get(`/student/assignments/${id}`)).data,
  start: async (id) => (await api.post(`/student/assignments/${id}/start`)).data,
  saveAnswer: async (id, body) => (await api.put(`/student/assignments/${id}/answer`, body)).data,
  submit: async (id) => (await api.post(`/student/assignments/${id}/submit`)).data,
  result: async (id) => (await api.get(`/student/assignments/${id}/result`)).data,
  /** Yazılı foto cevap yükle → URL döner (Sharp pipeline). */
  uploadImage: async (file) => {
    const fd = new FormData();
    fd.append('file', file);
    const { data } = await api.post('/upload/image', fd);
    return data.url || data.fileUrl || data.file_url || '';
  },
};

export default api;
export { api };
