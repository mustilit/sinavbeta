import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createPageUrl } from '@/utils';
import api from '@/lib/api/apiClient';
import { entities } from '@/api/dalClient';
import { useAuth } from '@/lib/AuthContext';
import TestPackageCard from '@/components/ui/TestPackageCard';
import PaginationBar from '@/components/ui/PaginationBar';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import RatingStars from '@/components/ui/StarRating';
import { toast } from 'sonner';
import { ArrowLeft, Star, BookOpen, Users, GraduationCap, MessageSquare, User } from 'lucide-react';
import { buildPageUrl, useAppNavigate } from '@/lib/navigation';

const PAGE_SIZE = 10;

function isEmailLike(v) {
  return typeof v === 'string' && v.includes('@');
}

function StarRating({ value, size = 'sm' }) {
  const stars = [1, 2, 3, 4, 5];
  return (
    <div className="flex gap-0.5">
      {stars.map((s) => (
        <Star
          key={s}
          className={`${size === 'sm' ? 'w-3.5 h-3.5' : 'w-4 h-4'} ${
            s <= Math.round(value) ? 'fill-amber-400 text-amber-400' : 'text-slate-300'
          }`}
        />
      ))}
    </div>
  );
}

export default function EducatorProfile() {
  const navigate = useAppNavigate();
  const { user } = useAuth();
  const urlParams = new URLSearchParams(window.location.search);
  const idOrEmail = urlParams.get('email') || urlParams.get('id') || '';

  const endpoint = useMemo(() => {
    if (!idOrEmail) return null;
    if (isEmailLike(idOrEmail)) return `/educators/by-email?email=${encodeURIComponent(idOrEmail)}`;
    return `/educators/${encodeURIComponent(idOrEmail)}`;
  }, [idOrEmail]);

  // Eğitici profil verisi
  const { data, isLoading, isError } = useQuery({
    queryKey: ['educatorPage', idOrEmail],
    queryFn: async () => {
      const res = await api.get(endpoint);
      return res?.data ?? res;
    },
    enabled: !!endpoint,
    retry: 1,
  });

  // Sınav türleri (uzmanlık alanı adlarını çözmek için)
  const { data: examTypes = [] } = useQuery({
    queryKey: ['examTypesPublic'],
    queryFn: async () => {
      const res = await api.get('/site/exam-types');
      return Array.isArray(res?.data) ? res.data : [];
    },
    staleTime: 5 * 60 * 1000,
  });

  // Eğiticiye ait yorumlar
  const { data: reviews = [] } = useQuery({
    queryKey: ['educatorReviews', idOrEmail],
    queryFn: async () => {
      const educatorId = data?.educator?.id;
      if (!educatorId) return [];
      const res = await api.get(`/educators/${educatorId}/reviews?limit=20`);
      const raw = res?.data ?? res;
      return Array.isArray(raw) ? raw : [];
    },
    enabled: !!data?.educator?.id,
    staleTime: 2 * 60 * 1000,
  });

  // Aday için: bu eğiticiyi puanlayabilir mi (satın alma var mı) + mevcut puanı.
  const isCandidate = (user?.role || '').toString().toUpperCase() === 'CANDIDATE';
  const educatorId = data?.educator?.id;
  const { data: myRating } = useQuery({
    queryKey: ['educatorMyRating', educatorId],
    queryFn: async () => {
      const res = await api.get(`/educators/${educatorId}/my-rating`);
      return res?.data ?? res;
    },
    enabled: !!educatorId && isCandidate,
    staleTime: 60_000,
  });

  const { data: purchases = [] } = useQuery({
    queryKey: ['purchases', user?.id],
    queryFn: () => entities.Purchase.filter({}),
    enabled: !!user,
  });

  const { data: myResults = [] } = useQuery({
    queryKey: ['results', user?.email],
    queryFn: () => entities.TestResult.filter({ user_email: user?.email }),
    enabled: !!user,
  });

  const { data: testProgress = [] } = useQuery({
    queryKey: ['testProgress', user?.id],
    queryFn: () => entities.TestProgress.filter({ user_email: user?.email, is_completed: false }),
    enabled: !!user,
  });

  const queryClient = useQueryClient();
  const [showRateModal, setShowRateModal] = useState(false);
  const [ratingValue, setRatingValue] = useState(0);
  const [ratingComment, setRatingComment] = useState('');

  const openRateModal = () => {
    setRatingValue(myRating?.rating ?? 0);
    setRatingComment(myRating?.comment ?? '');
    setShowRateModal(true);
  };

  const rateMutation = useMutation({
    mutationFn: ({ rating, comment }) => api.post(`/educators/${educatorId}/rate`, { rating, comment }),
    onSuccess: () => {
      toast.success('Değerlendirmeniz kaydedildi');
      queryClient.invalidateQueries({ queryKey: ['educatorPage', idOrEmail] });
      queryClient.invalidateQueries({ queryKey: ['educatorReviews', idOrEmail] });
      queryClient.invalidateQueries({ queryKey: ['educatorMyRating', educatorId] });
      setShowRateModal(false);
    },
    onError: (err) => {
      toast.error(err?.response?.data?.message || err?.response?.data?.error || 'Değerlendirme kaydedilemedi');
    },
  });

  const purchasedIds = new Set(purchases.map(p => p.test_package_id));
  const completedIds = new Set(myResults.map(r => r.test_package_id));
  const inProgressIds = new Set(testProgress.map(p => p.test_package_id));
  const attemptByTestId = {};
  purchases.forEach((p) => {
    if (p.test_package_id && p.attempt) attemptByTestId[p.test_package_id] = p.attempt;
  });

  // Uzmanlık alanları — tüm hook'lardan sonra, early return'lardan önce hesaplanır
  const examTypeMap = useMemo(
    () => Object.fromEntries(examTypes.map((et) => [et.id, et.name])),
    [examTypes]
  );
  const tests = data?.tests?.items || [];
  const specialties = useMemo(() => {
    const seen = new Set();
    return tests
      .filter((t) => t.examTypeId && !seen.has(t.examTypeId) && seen.add(t.examTypeId))
      .map((t) => ({ id: t.examTypeId, name: examTypeMap[t.examTypeId] || t.examTypeId }));
  }, [tests, examTypeMap]);

  // Paging — 10 test / sayfa
  const [testsPage, setTestsPage] = useState(1);
  const testsTotalPages = Math.max(1, Math.ceil(tests.length / PAGE_SIZE));
  const testsCurrentPage = Math.min(testsPage, testsTotalPages);
  const pagedTests = useMemo(
    () => tests.slice((testsCurrentPage - 1) * PAGE_SIZE, testsCurrentPage * PAGE_SIZE),
    [tests, testsCurrentPage],
  );

  if (!idOrEmail) {
    return (
      <div className="max-w-4xl mx-auto text-center py-20">
        <h2 className="text-2xl font-bold text-slate-900">Eğitici bulunamadı</h2>
        <Link to={createPageUrl('Educators')} className="text-indigo-600 mt-4 inline-block">
          Eğiticilere Dön
        </Link>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="max-w-6xl mx-auto animate-pulse">
        <div className="h-8 bg-slate-200 rounded w-40 mb-6" />
        <div className="h-48 bg-slate-200 rounded-2xl mb-6" />
        <div className="grid gap-6 grid-cols-[repeat(auto-fill,minmax(280px,1fr))]">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-56 bg-slate-200 rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }

  if (isError || !data?.educator) {
    return (
      <div className="max-w-4xl mx-auto text-center py-20">
        <h2 className="text-2xl font-bold text-slate-900">Eğitici yüklenemedi</h2>
        <p className="text-slate-500 mt-2">Lütfen daha sonra tekrar deneyin.</p>
        <div className="mt-6">
          <Link to={createPageUrl('Educators')}>
            <Button className="bg-indigo-600 hover:bg-indigo-700">Eğiticilere Dön</Button>
          </Link>
        </div>
      </div>
    );
  }

  const educator = data.educator;
  const stats = data.stats || {};

  return (
    <div className="max-w-6xl mx-auto">
      <Link
        to={createPageUrl('Educators')}
        className="inline-flex items-center gap-2 text-slate-600 hover:text-slate-900 mb-6"
      >
        <ArrowLeft className="w-4 h-4" />
        Eğiticilere Dön
      </Link>

      {/* Profil Kartı */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 mb-6">
        <div className="flex flex-col md:flex-row md:items-start gap-6">
          {/* Avatar */}
          <div className="w-20 h-20 rounded-full overflow-hidden flex-shrink-0 bg-gradient-to-br from-indigo-100 to-violet-100 flex items-center justify-center">
            {educator.avatarUrl ? (
              <img src={educator.avatarUrl} alt={educator.displayName} className="w-full h-full object-cover" />
            ) : (
              <User className="w-10 h-10 text-indigo-600" />
            )}
          </div>

          <div className="flex-1 min-w-0">
            <h1 className="text-3xl font-bold text-slate-900 mb-1">{educator.displayName}</h1>

            {/* Bio */}
            {educator.bio ? (
              <p className="text-slate-600 max-w-2xl mb-4">{educator.bio}</p>
            ) : (
              <p className="text-slate-400 italic mb-4 text-sm">Henüz tanıtım metni eklenmemiş.</p>
            )}

            {/* İstatistikler */}
            <div className="flex flex-wrap items-center gap-3 mb-4">
              <Badge className="bg-slate-100 text-slate-700 border-0">
                <BookOpen className="w-3.5 h-3.5 mr-1.5" />
                {stats.totalPublishedTests ?? tests.length} test
              </Badge>
              {/* Eğitici puanı (Review.educatorRating ortalaması) — yalnızca varsa göster.
                  Puan yoksa rozet hiç render edilmez; test puanından türetilmez. */}
              {stats.ratingAvg != null && (stats.ratingCount ?? 0) > 0 && (
                <Badge className="bg-amber-50 text-amber-700 border-0">
                  <Star className="w-3.5 h-3.5 mr-1.5 fill-amber-400 text-amber-400" />
                  {Number(stats.ratingAvg).toFixed(1)}
                  <span className="ml-1 text-amber-500">({stats.ratingCount} yorum)</span>
                </Badge>
              )}
              {stats.totalPurchases != null && (
                <Badge className="bg-indigo-50 text-indigo-700 border-0">
                  <Users className="w-3.5 h-3.5 mr-1.5" />
                  {stats.totalPurchases} satış
                </Badge>
              )}
            </div>

            {/* Uzmanlık Alanları */}
            {specialties.length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="flex items-center gap-1 text-xs font-medium text-slate-500">
                  <GraduationCap className="w-3.5 h-3.5" />
                  Uzmanlık:
                </span>
                {specialties.map((s) => (
                  <span
                    key={s.id}
                    className="text-xs px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-700 font-medium"
                  >
                    {s.name}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Aday bu eğiticiden test satın almışsa eğiticiyi puanlayabilir
              (educatorRating — test puanından bağımsız). Kartın sağ üstünde. */}
          {isCandidate && myRating?.eligible && (
            <div className="flex-shrink-0 md:ml-auto">
              <Button
                onClick={openRateModal}
                variant={myRating?.rating ? 'outline' : 'default'}
                className={myRating?.rating ? '' : 'bg-indigo-600 hover:bg-indigo-700'}
              >
                <Star
                  className={`w-4 h-4 mr-1.5 ${myRating?.rating ? 'fill-amber-400 text-amber-400' : ''}`}
                  aria-hidden="true"
                />
                {myRating?.rating ? `Puanını Güncelle (${myRating.rating}/5)` : 'Eğiticiyi Değerlendir'}
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Testler */}
      <h2 className="text-xl font-semibold text-slate-900 mb-4">Testler</h2>
      {tests.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-2xl border border-slate-200 mb-6">
          <BookOpen className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500">Bu eğiticinin yayında testi yok.</p>
        </div>
      ) : (
        <>
          <div className="grid gap-6 grid-cols-[repeat(auto-fill,minmax(280px,1fr))] mb-8">
            {pagedTests.map((t) => (
              <TestPackageCard
                key={t.id}
                test={{
                  id: t.id,
                  title: t.title,
                  educator_email: educator.id,
                  educator_name: educator.displayName,
                  exam_type_id: t.examTypeId,
                  question_count: t.questionCount,
                  price: t.priceCents != null ? t.priceCents / 100 : 0,
                  average_rating: t.ratingAvg,
                  rating_count: t.ratingCount,
                  is_published: true,
                  is_active: true,
                }}
                isPurchased={purchasedIds.has(t.id)}
                isCompleted={completedIds.has(t.id)}
                isInProgress={inProgressIds.has(t.id)}
                attempt={attemptByTestId[t.id] ?? null}
                onBuy={() => navigate(buildPageUrl('TestDetail', { id: t.id }))}
              />
            ))}
          </div>
          <PaginationBar
            page={testsCurrentPage}
            totalPages={testsTotalPages}
            onPageChange={setTestsPage}
          />
        </>
      )}

      {/* Yorumlar */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6">
        <h2 className="text-xl font-semibold text-slate-900 mb-5 flex items-center gap-2">
          <MessageSquare className="w-5 h-5 text-indigo-500" />
          Yorumlar
          {reviews.length > 0 && (
            <span className="text-sm font-normal text-slate-400">({reviews.length})</span>
          )}
        </h2>

        {reviews.length === 0 ? (
          <div className="text-center py-10">
            <MessageSquare className="w-10 h-10 text-slate-200 mx-auto mb-3" />
            <p className="text-slate-400 text-sm">Henüz yorum yapılmamış.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {reviews.map((r) => (
              <div key={r.id} className="border border-slate-100 rounded-xl p-4">
                <div className="flex items-start justify-between gap-4 mb-2">
                  <div>
                    <p className="text-xs text-slate-400 font-medium mb-1">{r.testTitle}</p>
                    <div className="flex items-center gap-3">
                      {r.testRating != null && (
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs text-slate-500">Test:</span>
                          <StarRating value={r.testRating} />
                        </div>
                      )}
                      {r.educatorRating != null && (
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs text-slate-500">Eğitici:</span>
                          <StarRating value={r.educatorRating} />
                        </div>
                      )}
                    </div>
                  </div>
                  <span className="text-xs text-slate-400 whitespace-nowrap">
                    {new Date(r.createdAt).toLocaleDateString('tr-TR')}
                  </span>
                </div>
                {r.comment && (
                  <p className="text-sm text-slate-700 mt-2 leading-relaxed">{r.comment}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Eğiticiyi Değerlendir modalı — yalnızca satın almış aday açabilir.
          Eğitici puanı (educatorRating) test puanından bağımsızdır. */}
      <Dialog open={showRateModal} onOpenChange={setShowRateModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{myRating?.rating ? 'Puanını Güncelle' : 'Eğiticiyi Değerlendir'}</DialogTitle>
            <DialogDescription>
              {educator.displayName} ile deneyiminizi puanlayın. Bu puan yalnızca eğiticiye aittir, teste değil.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <RatingStars value={ratingValue} onChange={setRatingValue} size="lg" />
              {ratingValue > 0 && (
                <span className="text-lg font-medium text-slate-700">{ratingValue}/5</span>
              )}
            </div>
            <Textarea
              placeholder="Yorumunuz (isteğe bağlı)"
              value={ratingComment}
              onChange={(e) => setRatingComment(e.target.value)}
              rows={4}
            />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowRateModal(false)}>
                İptal
              </Button>
              <Button
                onClick={() => rateMutation.mutate({ rating: ratingValue, comment: ratingComment })}
                disabled={ratingValue === 0 || rateMutation.isPending}
                className="bg-indigo-600 hover:bg-indigo-700"
              >
                {rateMutation.isPending ? 'Kaydediliyor…' : myRating?.rating ? 'Güncelle' : 'Gönder'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
