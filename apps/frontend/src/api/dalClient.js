/**
 * Dal backend API client - replaces base44 SDK
 * Maps our backend endpoints to the format expected by Sınav Salonu UI
 * Tüm istekler @/lib/api/apiClient üzerinden geçer (tek nokta, 401 yönetimi)
 */
import api from '@/lib/api/apiClient';

// --- Auth ---
export const auth = {
  async login(email, password) {
    const body = {
      email: typeof email === 'string' ? email.trim().toLowerCase() : email,
      password: typeof password === 'string' ? password : String(password),
    };
    const { data } = await api.post('/auth/login', body);
    if (!data || (!data.user && !data.token)) {
      throw new Error('Beklenmeyen sunucu yanıtı');
    }
    return data;
  },
  async register(email, username, password) {
    const { data } = await api.post('/auth/register', { email, username, password });
    return data;
  },
  async registerEducator(email, username, password) {
    const { data } = await api.post('/auth/register/educator', { email, username, password });
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
  is_active: e.active !== false,
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
          }));
        } catch {
          return [];
        }
      }
      const { data } = await api.get('/me/purchases');
      let list = Array.isArray(data) ? data : [];
      // test_package_id hem testId (eski sistem) hem packageId (yeni sistem) ile eşleşebilir
      if (opts.test_package_id) {
        list = list.filter((p) =>
          (p.testId ?? p.test?.id) === opts.test_package_id ||
          p.packageId === opts.test_package_id
        );
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
      const testId = body.test_package_id ?? body.test_id;
      const { data } = await api.post(`/purchases/${testId}`, {
        discountCode: body.discount_code,
        paymentProvider: body.payment_provider,
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
        // Önce ExamTest olarak dene; bulunamazsa marketplace/packages endpoint'ini dene (TestPackage ID)
        try {
          const { data } = await api.get(`/tests/${id}`);
          if (data) return [{ id: data.id, test_package_id: id, order_index: 0, duration_minutes: data.durationMinutes ?? 60, title: data.title, ...data }];
        } catch (testErr) {
          // ExamTest bulunamadı — TestPackage ID olabilir
        }
        try {
          const { data } = await api.get(`/marketplace/packages/${id}`);
          if (data?.tests?.length) {
            return data.tests.map((t, i) => ({
              id: t.id,
              title: t.title,
              test_package_id: id,
              order_index: i,
              duration_minutes: 60,
              question_count: t.questionCount ?? 0,
            }));
          }
        } catch (pkgErr) {
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
  TestResult: {
    filter: async (opts = {}) => {
      try {
        const res = await api.get('/me/purchases');
        const data = res?.data ?? res;
        const list = Array.isArray(data) ? data : (data?.items ?? data?.data ?? []);
        const results = [];
        for (const p of list) {
          const pkgId = p.packageId ?? p.testId ?? p.test_id;
          if (opts.test_package_id && p.testId !== opts.test_package_id && p.packageId !== opts.test_package_id) continue;
          const attempt = p?.attempt ?? p?.attempts?.[0];
          if (attempt && (attempt.status === 'SUBMITTED' || attempt.status === 'TIMEOUT')) {
            // Gerçek çözüm süresi: önce checkpoint'ten kaydedilen elapsedSeconds,
            // yoksa submittedAt-startedAt farkı (completedAt yerine submit kullan — daha güvenilir)
            const correctCount = attempt.correctCount ?? attempt.correct_count ?? 0;
            const wrongCount  = attempt.wrongCount  ?? attempt.wrong_count  ?? 0;
            const emptyCount  = attempt.emptyCount  ?? attempt.empty_count  ?? 0;
            const test = p?.test ?? p?.testPackage ?? {};
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
              test_id: p.testId ?? p.test_id,
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
        if (opts.test_package_id && p.testId !== opts.test_package_id && p.packageId !== opts.test_package_id) continue;
        if (opts.is_completed === false && p.attempt && p.attempt.status === 'IN_PROGRESS') {
          progress.push({
            id: p.attempt.id,
            user_email: opts.user_email,
            test_package_id: pkgId,
            test_id: p.testId,
            is_completed: false,
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
    filter: async (opts = {}, sort, limit) => {
      const testId = opts.test_package_id ?? opts.test_id;
      if (!testId) return [];
      const { data } = await api.get(`/tests/${testId}/reviews`, { params: { limit: limit || 20 } });
      const items = data?.items ?? [];
      return items.map((r) => ({
        id: r.id,
        test_package_id: testId,
        reviewer_email: r.candidateId,
        rating: r.testRating,
        review_type: 'test',
        created_date: r.createdAt,
      }));
    },
    myReview: async (examTestId) => {
      if (!examTestId) return null;
      try {
        const { data } = await api.get(`/tests/${examTestId}/my-review`);
        return data ?? null;
      } catch {
        return null;
      }
    },
    create: async (body) => {
      const testId = body.exam_test_id ?? body.test_package_id ?? body.test_id;
      const payload = { comment: body.comment };
      if (body.educator_rating != null) payload.educatorRating = body.educator_rating;
      if (body.rating != null || body.testRating != null) payload.testRating = body.rating ?? body.testRating;
      const { data } = await api.post(`/tests/${testId}/reviews`, payload);
      return data;
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
  },

  // RefundRequest
  RefundRequest: {
    // Aday: kendi iade taleplerini listele
    filter: async (opts = {}) => {
      const { data } = await api.get('/me/refunds');
      const list = Array.isArray(data) ? data : [];
      return list.map((r) => normalizeRefund(r));
    },
    // Aday: iade talebi oluştur
    create: async (body) => {
      const { data } = await api.post('/refunds', {
        purchaseId: body.purchase_id ?? body.purchaseId,
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

/** LiveSession işlemleri */
export const liveSessions = {
  create: async (body) => {
    const { data } = await api.post('/live-sessions', body);
    return data;
  },
  listMy: async () => {
    const { data } = await api.get('/live-sessions/my');
    return Array.isArray(data) ? data : [];
  },
  pay: async (id) => {
    const { data } = await api.post(`/live-sessions/${id}/pay`);
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
  getState: async (id) => {
    const { data } = await api.get(`/live-sessions/${id}/state`);
    return data;
  },
  getByCode: async (code) => {
    const { data } = await api.get(`/live-sessions/code/${code}`);
    return data;
  },
  join: async (code) => {
    const { data } = await api.post(`/live-sessions/join/${code}`);
    return data;
  },
  ping: async (id) => {
    const { data } = await api.post(`/live-sessions/${id}/ping`);
    return data;
  },
  submitAnswer: async (id, questionId, optionId) => {
    const { data } = await api.post(`/live-sessions/${id}/answer`, { questionId, optionId });
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
    if (opts.cursor?.id) qs.set('cursorId', opts.cursor.id);
    if (opts.cursor?.computedScore) qs.set('cursorScore', String(opts.cursor.computedScore));
    if (opts.limit) qs.set('limit', String(opts.limit));
    if (opts.riskLevel?.length) qs.set('riskLevel', opts.riskLevel.join(','));
    if (opts.category) qs.set('category', opts.category);
    if (opts.dateFrom) qs.set('dateFrom', opts.dateFrom);
    if (opts.dateTo) qs.set('dateTo', opts.dateTo);
    if (opts.q) qs.set('q', opts.q);
    const { data } = await api.get(`/admin/moderation/risky-educators?${qs.toString()}`);
    return data ?? { items: [], nextCursor: null };
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


export default api;
export { api };
