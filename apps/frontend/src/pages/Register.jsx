import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { auth, entities, contracts } from '@/api/dalClient';
import api from '@/lib/api/apiClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { createPageUrl } from '@/utils';
import { useAppNavigate } from '@/lib/navigation';
import { Link } from 'react-router-dom';
import GoogleSignInButton from '@/components/auth/GoogleSignInButton';
import TurnstileWidget from '@/components/auth/TurnstileWidget';
import { GraduationCap, Briefcase, Upload, CheckCircle, ChevronRight, ChevronLeft, Loader2, AlertTriangle } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

// --- Adım göstergesi ---
function StepIndicator({ current, total }) {
  return (
    <div className="flex items-center justify-center gap-2 mb-6" aria-label={`${current}/${total}. adım`}>
      {Array.from({ length: total }, (_, i) => {
        const n = i + 1;
        const done = n < current;
        const active = n === current;
        return (
          <div key={n} className="flex items-center gap-2">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold border-2 transition-all ${
                done
                  ? 'bg-indigo-600 border-indigo-600 text-white'
                  : active
                  ? 'border-indigo-600 text-indigo-600 bg-white'
                  : 'border-slate-300 text-slate-400 bg-white'
              }`}
              aria-current={active ? 'step' : undefined}
            >
              {done ? <CheckCircle className="w-4 h-4" aria-hidden="true" /> : n}
            </div>
            {n < total && (
              <div
                className={`w-8 h-0.5 ${n < current ? 'bg-indigo-600' : 'bg-slate-200'}`}
                aria-hidden="true"
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

// --- Sözleşme bölümü (inline, dialog değil) ---
function ContractSection({ contract, checked, onCheck }) {
  const { t } = useTranslation(['auth']);
  return (
    <div className="rounded-lg border border-slate-200">
      <div className="px-4 py-2 border-b border-slate-200 bg-slate-50 font-medium text-sm text-slate-800">
        {contract.title}
        {contract.version != null && (
          <span className="ml-2 text-xs font-normal text-slate-400">v{contract.version}</span>
        )}
      </div>
      <div className="max-h-44 overflow-y-auto p-4 prose prose-sm prose-slate max-w-none">
        <ReactMarkdown>{contract.content || ''}</ReactMarkdown>
      </div>
      <label className="flex items-center gap-2 px-4 py-3 border-t border-slate-200 cursor-pointer text-sm text-slate-700">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onCheck(e.target.checked)}
          className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
          aria-required="true"
        />
        {t('auth:register.contractDialog.accept', { defaultValue: 'Okudum, kabul ediyorum.' })}
      </label>
    </div>
  );
}

export default function Register() {
  const { t } = useTranslation(['auth', 'common']);
  const navigate = useAppNavigate();

  // Rol seçimi — URL param'dan başla
  const [role, setRole] = useState(() => {
    const p = new URLSearchParams(window.location.search).get('role');
    return p === 'educator' ? 'educator' : 'candidate';
  });
  const isEducator = role === 'educator';

  // Wizard adımı: aday için 1→3 (step 2 atlanır), eğitici için 1→2→3
  const [step, setStep] = useState(1);
  const totalSteps = isEducator ? 3 : 3; // UI tutarlılığı için her zaman 3 göster

  // Step 1 state
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [turnstileToken, setTurnstileToken] = useState(null);

  // Step 2 state (eğitici)
  const [cvUrl, setCvUrl] = useState('');
  const [uploadingCv, setUploadingCv] = useState(false);
  const [specializations, setSpecializations] = useState([]);
  const [educationInfo, setEducationInfo] = useState('');
  const [bio, setBio] = useState('');
  const [linkedinUrl, setLinkedinUrl] = useState('');
  const [websiteUrl, setWebsiteUrl] = useState('');

  // Step 3 state (sözleşmeler)
  const [termsContract, setTermsContract] = useState(null);
  const [privacyContract, setPrivacyContract] = useState(null);
  const [contractsLoading, setContractsLoading] = useState(false);
  const [contractsError, setContractsError] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [acceptedPrivacy, setAcceptedPrivacy] = useState(false);

  // Genel
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  // Uzmanlık alanları (public endpoint)
  const { data: examTypes = [] } = useQuery({
    queryKey: ['examTypes'],
    queryFn: () => entities.ExamType.filter({ is_active: true }),
    staleTime: 300_000,
  });

  const selectRole = (next) => {
    setRole(next);
    setError(null);
    setStep(1);
    try {
      const url = new URL(window.location.href);
      url.searchParams.set('role', next);
      window.history.replaceState({}, '', url);
    } catch { /* ignore */ }
  };

  // Step 1 → 2 (veya 1 → 3 aday için)
  const handleStep1Next = async (e) => {
    e.preventDefault();
    setError(null);

    // Şifre eşleşme kontrolü
    if (password !== passwordConfirm) {
      setError(t('auth:errors.passwordMismatch', { defaultValue: 'Şifreler eşleşmiyor.' }));
      return;
    }
    if (password.length < 6) {
      setError(t('auth:errors.passwordWeak', { defaultValue: 'Şifre en az 6 karakter olmalı.' }));
      return;
    }
    if (isEducator && (!firstName.trim() || !lastName.trim())) {
      setError(t('auth:register.firstLastRequired', { defaultValue: 'Ad ve soyad zorunludur.' }));
      return;
    }

    // Uygunluk kontrolü (fail-open)
    try {
      const check = await auth.checkAvailability(email, username);
      if (!check.emailAvailable) {
        setError(t('auth:register.emailTaken', { defaultValue: 'Bu e-posta adresi zaten kayıtlı.' }));
        return;
      }
      if (!check.usernameAvailable) {
        setError(t('auth:register.usernameTaken', { defaultValue: 'Bu kullanıcı adı kullanılıyor.' }));
        return;
      }
    } catch { /* fail-open */ }

    if (isEducator) {
      setStep(2);
    } else {
      // Aday: direkt sözleşme adımına
      await loadContracts();
      setStep(3);
    }
  };

  // Step 2 → 3 (eğitici)
  const handleStep2Next = async (e) => {
    e.preventDefault();
    setError(null);

    if (!cvUrl) {
      setError(t('auth:register.cvRequired', { defaultValue: 'CV yüklemesi zorunludur.' }));
      return;
    }
    if (specializations.length === 0) {
      setError(t('auth:register.specializationRequired', { defaultValue: 'En az bir uzmanlık alanı seçilmelidir.' }));
      return;
    }

    await loadContracts();
    setStep(3);
  };

  const loadContracts = async () => {
    setContractsLoading(true);
    setContractsError(false);
    setAcceptedTerms(false);
    setAcceptedPrivacy(false);
    const termsType = isEducator ? 'EDUCATOR' : 'CANDIDATE';
    try {
      const [tc, pc] = await Promise.all([
        contracts.getActive(termsType).catch(() => null),
        contracts.getActive('PRIVACY').catch(() => null),
      ]);
      if (!tc || !pc) {
        setContractsError(true);
      } else {
        setTermsContract(tc);
        setPrivacyContract(pc);
      }
    } finally {
      setContractsLoading(false);
    }
  };

  // CV yükleme
  const handleCvUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.type !== 'application/pdf') {
      setError(t('auth:register.cvPdfOnly', { defaultValue: 'Yalnızca PDF dosyası yükleyebilirsiniz.' }));
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError(t('auth:register.cvTooLarge', { defaultValue: 'CV dosyası 5 MB\'den küçük olmalıdır.' }));
      return;
    }
    setError(null);
    setUploadingCv(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await api.post('/upload/image', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      const url = res.data?.url || res.data?.fileUrl || res.data?.file_url;
      if (!url) throw new Error('URL alınamadı');
      setCvUrl(url);
    } catch {
      setError(t('auth:register.cvUploadFailed', { defaultValue: 'CV yükleme başarısız. Tekrar deneyin.' }));
    } finally {
      setUploadingCv(false);
      e.target.value = '';
    }
  };

  // Uzmanlık toggle
  const toggleSpecialization = (id) => {
    setSpecializations((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  // Son adım: kayıt tamamla
  const handleRegister = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      if (isEducator) {
        await auth.registerEducator(email, username, password, {
          firstName,
          lastName,
          turnstileToken,
          acceptedEducatorContractId: termsContract?.id,
          acceptedPrivacyContractId: privacyContract?.id,
          cvUrl,
          specializations,
          educationInfo: educationInfo || undefined,
          bio: bio || undefined,
          linkedinUrl: linkedinUrl || undefined,
          websiteUrl: websiteUrl || undefined,
        });
        navigate(createPageUrl('VerifyEmail') + `?email=${encodeURIComponent(email)}&role=educator`, { replace: true });
      } else {
        await auth.register(email, username, password, {
          turnstileToken,
          acceptedTermsContractId: termsContract?.id,
          acceptedPrivacyContractId: privacyContract?.id,
        });
        navigate(createPageUrl('VerifyEmail') + `?email=${encodeURIComponent(email)}`, { replace: true });
      }
    } catch (err) {
      const data = err?.response?.data;
      const msg =
        (typeof data?.error === 'string' ? data.error : data?.error?.message) ||
        data?.message ||
        t('auth:register.failed');
      setError(typeof msg === 'string' ? msg : t('auth:register.failed'));
    } finally {
      setLoading(false);
    }
  };

  const canSubmit = acceptedTerms && acceptedPrivacy && Boolean(termsContract?.id) && Boolean(privacyContract?.id) && !loading;

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
      <div className="w-full max-w-md">
        {/* Marka başlığı */}
        <Link
          to={createPageUrl('Home')}
          className="flex items-center justify-center gap-3 mb-8"
          aria-label={t('auth:register.brandAriaLabel')}
        >
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-600 to-indigo-500 flex items-center justify-center shadow-md">
            <GraduationCap className="w-7 h-7 text-white" aria-hidden="true" />
          </div>
          <span className="text-2xl font-bold text-slate-900">{t('common:sidebar.brandName')}</span>
        </Link>

        <h1 className="text-2xl font-bold text-slate-900 mb-2 text-center">{t('auth:register.title')}</h1>

        {/* Adım göstergesi */}
        <StepIndicator current={step} total={totalSteps} />

        {/* Rol seçici — yalnızca step 1'de görünür */}
        {step === 1 && (
          <div className="mb-6">
            <p className="text-sm font-medium text-slate-700 mb-2 text-center">
              {t('auth:register.roleSelect.label', { defaultValue: 'Nasıl kaydolmak istersiniz?' })}
            </p>
            <div className="grid grid-cols-2 gap-3">
              {[
                {
                  val: 'candidate',
                  label: t('auth:register.roleSelect.candidate', { defaultValue: 'Aday' }),
                  desc: t('auth:register.roleSelect.candidateDesc', { defaultValue: 'Test paketi satın al, çöz, skorunu takip et' }),
                  Icon: GraduationCap,
                },
                {
                  val: 'educator',
                  label: t('auth:register.roleSelect.educator', { defaultValue: 'Eğitici' }),
                  desc: t('auth:register.roleSelect.educatorDesc', { defaultValue: 'Test ve paket oluştur, yayımla, sat' }),
                  Icon: Briefcase,
                },
              ].map(({ val, label, desc, Icon }) => {
                const active = role === val;
                return (
                  <button
                    key={val}
                    type="button"
                    onClick={() => selectRole(val)}
                    aria-pressed={active}
                    className={`p-4 rounded-xl border-2 text-left transition-all min-h-10 ${
                      active ? 'border-indigo-500 bg-indigo-50' : 'border-slate-200 hover:border-slate-300 bg-white'
                    }`}
                  >
                    <Icon className={`w-5 h-5 mb-2 ${active ? 'text-indigo-600' : 'text-slate-400'}`} aria-hidden="true" />
                    <p className="font-medium text-sm text-slate-900">{label}</p>
                    <p className="text-xs text-slate-600 mt-0.5">{desc}</p>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* ======= ADIM 1: Temel bilgiler ======= */}
        {step === 1 && (
          <form onSubmit={handleStep1Next} className="space-y-4">
            {isEducator && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="reg-first" className="block text-sm font-medium text-slate-700 mb-1">
                    {t('auth:register.firstName')}
                  </label>
                  <Input
                    id="reg-first"
                    type="text"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    placeholder={t('auth:register.firstNamePlaceholder')}
                    required
                    minLength={2}
                    maxLength={50}
                    className="w-full"
                  />
                </div>
                <div>
                  <label htmlFor="reg-last" className="block text-sm font-medium text-slate-700 mb-1">
                    {t('auth:register.lastName')}
                  </label>
                  <Input
                    id="reg-last"
                    type="text"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    placeholder={t('auth:register.lastNamePlaceholder')}
                    required
                    minLength={2}
                    maxLength={50}
                    className="w-full"
                  />
                </div>
              </div>
            )}

            <div>
              <label htmlFor="reg-email" className="block text-sm font-medium text-slate-700 mb-1">
                {t('auth:register.email')}
              </label>
              <Input
                id="reg-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t('auth:register.emailPlaceholder')}
                required
                className="w-full"
              />
            </div>

            <div>
              <label htmlFor="reg-username" className="block text-sm font-medium text-slate-700 mb-1">
                {t('auth:register.username')}
              </label>
              <Input
                id="reg-username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder={t('auth:register.usernamePlaceholder')}
                required
                className="w-full"
              />
            </div>

            <div>
              <label htmlFor="reg-password" className="block text-sm font-medium text-slate-700 mb-1">
                {t('auth:register.password')}
              </label>
              <Input
                id="reg-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                className="w-full"
              />
            </div>

            <div>
              <label htmlFor="reg-password-confirm" className="block text-sm font-medium text-slate-700 mb-1">
                {t('auth:register.passwordConfirm', { defaultValue: 'Şifre tekrarı' })}
              </label>
              <Input
                id="reg-password-confirm"
                type="password"
                value={passwordConfirm}
                onChange={(e) => setPasswordConfirm(e.target.value)}
                required
                minLength={6}
                className="w-full"
              />
            </div>

            {error && (
              <p role="alert" className="text-sm text-red-600">
                {error}
              </p>
            )}

            <TurnstileWidget onSuccess={setTurnstileToken} action="register" />

            <Button type="submit" className="w-full bg-indigo-600 hover:bg-indigo-700">
              {t('auth:register.wizard.next', { defaultValue: 'İleri' })}
              <ChevronRight className="w-4 h-4 ml-1" aria-hidden="true" />
            </Button>
          </form>
        )}

        {/* ======= ADIM 2: Eğitici bilgileri (sadece eğitici) ======= */}
        {step === 2 && isEducator && (
          <form onSubmit={handleStep2Next} className="space-y-5">
            <p className="text-sm text-slate-600 bg-slate-100 rounded-lg px-4 py-2">
              {t('auth:register.wizard.step2Desc', { defaultValue: 'Başvurunuzu değerlendirmemiz için aşağıdaki bilgileri doldurun.' })}
            </p>

            {/* CV yükleme */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                {t('auth:register.wizard.cvLabel', { defaultValue: 'CV (PDF) — Zorunlu' })}
              </label>
              {cvUrl ? (
                <div className="flex items-center gap-3 p-4 bg-emerald-50 border border-emerald-200 rounded-lg">
                  <CheckCircle className="w-5 h-5 text-emerald-600 flex-shrink-0" aria-hidden="true" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-emerald-900">
                      {t('auth:register.wizard.cvUploaded', { defaultValue: 'CV yüklendi' })}
                    </p>
                    <a href={cvUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-emerald-600 hover:underline truncate block">
                      {t('auth:register.wizard.cvView', { defaultValue: 'Görüntüle' })}
                    </a>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => document.getElementById('wizard-cv-upload').click()}
                    disabled={uploadingCv}
                  >
                    {t('auth:register.wizard.cvChange', { defaultValue: 'Değiştir' })}
                  </Button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => document.getElementById('wizard-cv-upload').click()}
                  disabled={uploadingCv}
                  className="w-full p-6 border-2 border-dashed border-slate-300 rounded-lg hover:border-indigo-400 hover:bg-indigo-50/50 transition-colors disabled:opacity-50 min-h-10"
                  aria-label={t('auth:register.wizard.cvUploadAriaLabel', { defaultValue: 'CV PDF dosyası yükle' })}
                >
                  <div className="flex flex-col items-center gap-2">
                    {uploadingCv ? (
                      <Loader2 className="w-8 h-8 text-indigo-400 animate-spin" aria-hidden="true" />
                    ) : (
                      <Upload className="w-8 h-8 text-slate-400" aria-hidden="true" />
                    )}
                    <p className="text-sm font-medium text-slate-900">
                      {uploadingCv
                        ? t('auth:register.wizard.cvUploading', { defaultValue: 'Yükleniyor…' })
                        : t('auth:register.wizard.cvUpload', { defaultValue: 'PDF dosyası seçin' })}
                    </p>
                    <p className="text-xs text-slate-500">
                      {t('auth:register.wizard.cvFormat', { defaultValue: 'PDF, maks. 5 MB' })}
                    </p>
                  </div>
                </button>
              )}
              <input
                id="wizard-cv-upload"
                type="file"
                accept=".pdf"
                onChange={handleCvUpload}
                className="hidden"
                aria-hidden="true"
              />
            </div>

            {/* Uzmanlık alanları */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                {t('auth:register.wizard.specializationsLabel', { defaultValue: 'Uzmanlık Alanları — En az 1 seçin' })}
              </label>
              {examTypes.length === 0 ? (
                <p className="text-sm text-slate-400">
                  {t('auth:register.wizard.specializationsLoading', { defaultValue: 'Yükleniyor…' })}
                </p>
              ) : (
                <div className="grid grid-cols-1 gap-2 max-h-48 overflow-y-auto pr-1">
                  {examTypes.map((exam) => {
                    const checked = specializations.includes(exam.id);
                    return (
                      <label
                        key={exam.id}
                        className={`flex items-center gap-3 p-3 rounded-lg border-2 cursor-pointer transition-all ${
                          checked ? 'border-indigo-500 bg-indigo-50' : 'border-slate-200 hover:border-slate-300 bg-white'
                        }`}
                      >
                        <Checkbox
                          checked={checked}
                          onCheckedChange={() => toggleSpecialization(exam.id)}
                          aria-label={exam.name}
                        />
                        <span className="text-sm font-medium text-slate-900">{exam.name}</span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Mezuniyet bilgisi (opsiyonel) */}
            <div>
              <label htmlFor="wizard-education" className="block text-sm font-medium text-slate-700 mb-1">
                {t('auth:register.wizard.educationLabel', { defaultValue: 'Mezuniyet Bilgisi (opsiyonel)' })}
              </label>
              <Textarea
                id="wizard-education"
                value={educationInfo}
                onChange={(e) => setEducationInfo(e.target.value)}
                placeholder={t('auth:register.wizard.educationPlaceholder', { defaultValue: 'Örn: İTÜ Matematik Bölümü, 2018' })}
                rows={2}
                className="w-full"
              />
            </div>

            {/* Bio (opsiyonel) */}
            <div>
              <label htmlFor="wizard-bio" className="block text-sm font-medium text-slate-700 mb-1">
                {t('auth:register.wizard.bioLabel', { defaultValue: 'Tanıtım Metni (opsiyonel)' })}
              </label>
              <Textarea
                id="wizard-bio"
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder={t('auth:register.wizard.bioPlaceholder', { defaultValue: 'Kendinizi kısaca tanıtın…' })}
                rows={3}
                className="w-full"
              />
            </div>

            {/* LinkedIn ve kişisel web sitesi — opsiyonel ama admin için değerli bağlantılar */}
            <div>
              <label htmlFor="wizard-linkedin" className="block text-sm font-medium text-slate-700 mb-1">
                {t('auth:register.wizard.linkedinLabel', { defaultValue: 'LinkedIn Profili (opsiyonel)' })}
              </label>
              <Input
                id="wizard-linkedin"
                type="url"
                value={linkedinUrl}
                onChange={(e) => setLinkedinUrl(e.target.value)}
                placeholder="https://www.linkedin.com/in/..."
                className="w-full"
              />
            </div>

            <div>
              <label htmlFor="wizard-website" className="block text-sm font-medium text-slate-700 mb-1">
                {t('auth:register.wizard.websiteLabel', { defaultValue: 'Kişisel Web Sitesi (opsiyonel)' })}
              </label>
              <Input
                id="wizard-website"
                type="url"
                value={websiteUrl}
                onChange={(e) => setWebsiteUrl(e.target.value)}
                placeholder="https://..."
                className="w-full"
              />
            </div>

            {error && (
              <p role="alert" className="text-sm text-red-600">
                {error}
              </p>
            )}

            <div className="flex gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => { setStep(1); setError(null); }}
                className="flex-1 min-h-10"
              >
                <ChevronLeft className="w-4 h-4 mr-1" aria-hidden="true" />
                {t('auth:register.wizard.back', { defaultValue: 'Geri' })}
              </Button>
              <Button type="submit" className="flex-1 bg-indigo-600 hover:bg-indigo-700 min-h-10">
                {t('auth:register.wizard.next', { defaultValue: 'İleri' })}
                <ChevronRight className="w-4 h-4 ml-1" aria-hidden="true" />
              </Button>
            </div>
          </form>
        )}

        {/* ======= ADIM 3: Sözleşmeler ======= */}
        {step === 3 && (
          <form onSubmit={handleRegister} className="space-y-4">
            <p className="text-sm font-medium text-slate-700 text-center">
              {t('auth:register.contractDialog.title', { defaultValue: 'Sözleşmeleri Onayla' })}
            </p>
            <p className="text-xs text-slate-500 text-center">
              {t('auth:register.contractDialog.desc', { defaultValue: 'Kaydı tamamlamak için aşağıdaki metinleri okuyup onaylayın.' })}
            </p>

            {contractsLoading && (
              <div className="py-8 flex justify-center" role="status" aria-live="polite">
                <Loader2 className="w-6 h-6 animate-spin text-indigo-600" aria-hidden="true" />
                <span className="sr-only">
                  {t('auth:register.contractDialog.loading', { defaultValue: 'Yükleniyor…' })}
                </span>
              </div>
            )}

            {!contractsLoading && contractsError && (
              <div role="alert" className="rounded-lg bg-rose-50 border border-rose-200 p-4 text-sm text-rose-700">
                <div className="flex gap-2">
                  <AlertTriangle className="w-5 h-5 flex-shrink-0" aria-hidden="true" />
                  <span>
                    {t('auth:register.contractsLoadFailed', { defaultValue: 'Sözleşme metinleri şu an yüklenemedi.' })}
                  </span>
                </div>
                <div className="mt-3">
                  <Button type="button" variant="outline" size="sm" onClick={loadContracts}>
                    {t('auth:register.contractDialog.retry', { defaultValue: 'Tekrar dene' })}
                  </Button>
                </div>
              </div>
            )}

            {!contractsLoading && !contractsError && termsContract && privacyContract && (
              <div className="space-y-4">
                <ContractSection contract={termsContract} checked={acceptedTerms} onCheck={setAcceptedTerms} />
                <ContractSection contract={privacyContract} checked={acceptedPrivacy} onCheck={setAcceptedPrivacy} />
              </div>
            )}

            {error && (
              <p role="alert" className="text-sm text-red-600">
                {error}
              </p>
            )}

            <div className="flex gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setStep(isEducator ? 2 : 1);
                  setError(null);
                }}
                className="flex-1 min-h-10"
              >
                <ChevronLeft className="w-4 h-4 mr-1" aria-hidden="true" />
                {t('auth:register.wizard.back', { defaultValue: 'Geri' })}
              </Button>
              <Button
                type="submit"
                disabled={!canSubmit}
                className="flex-1 bg-indigo-600 hover:bg-indigo-700 min-h-10"
              >
                {loading
                  ? t('auth:register.submitting')
                  : t('auth:register.contractDialog.confirm', { defaultValue: 'Onayla ve Kaydı Tamamla' })}
              </Button>
            </div>
          </form>
        )}

        {/* Google ile kayıt — yalnızca step 1 */}
        {step === 1 && (
          <div className="mt-6">
            <div className="relative my-4" aria-hidden="true">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-slate-200" />
              </div>
              <div className="relative flex justify-center text-xs">
                <span className="bg-slate-50 px-2 text-slate-500">{t('common:common.or')}</span>
              </div>
            </div>
            <GoogleSignInButton text="signup_with" role={isEducator ? 'EDUCATOR' : 'CANDIDATE'} />
          </div>
        )}

        <p className="mt-4 text-center text-sm text-slate-600">
          {t('auth:register.haveAccount')}{' '}
          <Link to={createPageUrl('Login')} className="text-indigo-600 underline hover:no-underline">
            {t('auth:register.login')}
          </Link>
        </p>
        {step === 1 && (
          <p className="mt-2 text-center">
            <Link to={createPageUrl('Home')} className="text-sm text-slate-500 hover:text-slate-700">
              {t('auth:register.backToHome')}
            </Link>
          </p>
        )}
      </div>
    </div>
  );
}
