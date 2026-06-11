import { useState, useEffect, useRef } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useTranslation, Trans } from "react-i18next";
import { auth } from "@/api/dalClient";
import { createPageUrl } from "@/utils";
import { useAppNavigate } from "@/lib/navigation";
import { Button } from "@/components/ui/button";
import { GraduationCap, Mail, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";

/**
 * VerifyEmail — Email doğrulama sayfası.
 *
 * İki mod:
 *   1) URL'de `?token=...` varsa: token'ı backend'e gönderip otomatik doğrular.
 *      Başarılı: aday → SelectExamTypes (ilgi alanı seçimi onboarding), aksi → Login
 *      Başarısız: hata mesajı + tekrar gönder butonu
 *
 *   2) Token yoksa (kayıt sonrası landing): "E-postanı kontrol et" mesajı +
 *      e-posta adresi + "Yeniden gönder" butonu.
 */
export default function VerifyEmail() {
  const { t } = useTranslation(["auth", "common"]);
  const [searchParams] = useSearchParams();
  const navigate = useAppNavigate();
  const token = searchParams.get("token");
  const emailFromQuery = searchParams.get("email") ?? "";

  // status: 'idle' (just landed) | 'verifying' | 'success' | 'error'
  const [status, setStatus] = useState(token ? "verifying" : "idle");
  const [message, setMessage] = useState("");
  const [resending, setResending] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [emailInput, setEmailInput] = useState(emailFromQuery);

  // Token tek seferlik POST atılmalı — React 18 strict mode double-mount güvenliği
  const verifyAttempted = useRef(false);

  useEffect(() => {
    if (!token || verifyAttempted.current) return;
    verifyAttempted.current = true;

    (async () => {
      try {
        const res = await auth.verifyEmail(token);
        setStatus("success");
        setMessage(t("auth:verifyEmail.successMessage"));
        // Doğrulama sonrası kullanıcı oturum açmamış olabilir → Login'e gönder.
        // Email pre-fill için query param ekle.
        // Sprint 17: eğitici wizard'dan geldiği için artık EducatorDashboard'a yönlendir.
        // (EducatorOnboarding adımı kayıt sırasında tamamlandı)
        const params = new URLSearchParams();
        if (res?.email) params.set("email", res.email);
        if (res?.role === "CANDIDATE") params.set("next", "SelectExamTypes");
        if (res?.role === "EDUCATOR") params.set("next", "EducatorDashboard");
        const target = createPageUrl("Login") + (params.toString() ? `?${params}` : "");
        setTimeout(() => navigate(target, { replace: true }), 1800);
      } catch (err) {
        setStatus("error");
        const code = err?.response?.data?.code || "";
        if (code === "TOKEN_EXPIRED") {
          setMessage(t("auth:verifyEmail.tokenExpired"));
        } else {
          setMessage(t("auth:verifyEmail.invalidToken"));
        }
      }
    })();
  }, [token, navigate, t]);

  // Resend cooldown geri sayımı — kullanıcı butona kıvrak basamasın
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const id = setTimeout(() => setResendCooldown((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [resendCooldown]);

  const handleResend = async (e) => {
    e?.preventDefault?.();
    const email = (emailInput || "").trim().toLowerCase();
    if (!email) return;
    setResending(true);
    try {
      await auth.resendEmailVerification(email);
      setMessage(t("auth:verifyEmail.resendSuccess"));
      setResendCooldown(60); // 60 saniye cooldown
    } catch {
      setMessage(t("auth:verifyEmail.resendFailed"));
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
      <div className="w-full max-w-md">
        <Link
          to={createPageUrl("Home")}
          className="flex items-center justify-center gap-3 mb-8"
        >
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-600 to-indigo-500 flex items-center justify-center shadow-md">
            <GraduationCap className="w-7 h-7 text-white" aria-hidden="true" />
          </div>
          <span className="text-2xl font-bold text-slate-900">
            {t("common:sidebar.brandName")}
          </span>
        </Link>

        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
          {/* Verifying */}
          {status === "verifying" && (
            <div className="text-center space-y-4">
              <Loader2 className="w-12 h-12 text-indigo-600 mx-auto animate-spin" aria-hidden="true" />
              <h1 className="text-xl font-semibold text-slate-900">
                {t("auth:verifyEmail.verifying")}
              </h1>
            </div>
          )}

          {/* Success */}
          {status === "success" && (
            <div className="text-center space-y-4">
              <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto" aria-hidden="true" />
              <h1 className="text-xl font-semibold text-slate-900">
                {t("auth:verifyEmail.successTitle")}
              </h1>
              <p className="text-sm text-slate-600">{message}</p>
              <p className="text-xs text-slate-400">{t("auth:verifyEmail.redirectingHint")}</p>
            </div>
          )}

          {/* Error */}
          {status === "error" && (
            <div className="text-center space-y-4">
              <AlertCircle className="w-12 h-12 text-rose-500 mx-auto" aria-hidden="true" />
              <h1 className="text-xl font-semibold text-slate-900">
                {t("auth:verifyEmail.errorTitle")}
              </h1>
              <p className="text-sm text-slate-600">{message}</p>

              <form onSubmit={handleResend} className="space-y-3 mt-4">
                <label htmlFor="resend-email" className="sr-only">
                  {t("auth:verifyEmail.emailLabel")}
                </label>
                <input
                  id="resend-email"
                  type="email"
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                  placeholder={t("auth:verifyEmail.emailPlaceholder")}
                  required
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
                <Button
                  type="submit"
                  disabled={resending || resendCooldown > 0 || !emailInput.trim()}
                  className="w-full bg-indigo-600 hover:bg-indigo-700"
                >
                  {resendCooldown > 0
                    ? t("auth:verifyEmail.resendCooldown", { seconds: resendCooldown })
                    : resending
                    ? t("auth:verifyEmail.resending")
                    : t("auth:verifyEmail.resend")}
                </Button>
              </form>
            </div>
          )}

          {/* Idle: kayıt sonrası landing */}
          {status === "idle" && (
            <div className="text-center space-y-4">
              <div className="w-16 h-16 mx-auto rounded-full bg-indigo-100 flex items-center justify-center">
                <Mail className="w-8 h-8 text-indigo-600" aria-hidden="true" />
              </div>
              <h1 className="text-xl font-semibold text-slate-900">
                {t("auth:verifyEmail.checkInboxTitle")}
              </h1>
              <p className="text-sm text-slate-600">
                {emailFromQuery
                  ? <Trans i18nKey="auth:verifyEmail.checkInboxDescWithEmail" values={{ email: emailFromQuery }} />
                  : t("auth:verifyEmail.checkInboxDesc")}
              </p>
              <p className="text-xs text-slate-500">{t("auth:verifyEmail.checkSpam")}</p>

              {message && (
                <p className="text-sm text-emerald-600 bg-emerald-50 rounded-lg p-2">{message}</p>
              )}

              <form onSubmit={handleResend} className="space-y-3 pt-4 border-t border-slate-100">
                <p className="text-xs text-slate-500">{t("auth:verifyEmail.notReceived")}</p>
                <label htmlFor="resend-email-idle" className="sr-only">
                  {t("auth:verifyEmail.emailLabel")}
                </label>
                <input
                  id="resend-email-idle"
                  type="email"
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                  placeholder={t("auth:verifyEmail.emailPlaceholder")}
                  required
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
                <Button
                  type="submit"
                  variant="outline"
                  disabled={resending || resendCooldown > 0 || !emailInput.trim()}
                  className="w-full"
                >
                  {resendCooldown > 0
                    ? t("auth:verifyEmail.resendCooldown", { seconds: resendCooldown })
                    : resending
                    ? t("auth:verifyEmail.resending")
                    : t("auth:verifyEmail.resend")}
                </Button>
              </form>
            </div>
          )}
        </div>

        <p className="mt-4 text-center text-sm">
          <Link to={createPageUrl("Login")} className="text-slate-600 hover:text-slate-900">
            {t("auth:verifyEmail.backToLogin")}
          </Link>
        </p>
      </div>
    </div>
  );
}
