import { useCallback, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { GoogleOAuthProvider, GoogleLogin } from "@react-oauth/google";
import { useAuth } from "@/lib/AuthContext";
import { useAppNavigate } from "@/lib/navigation";
import { createPageUrl } from "@/utils";
import api from "@/lib/api/apiClient";
import { toast } from "sonner";

/**
 * GoogleSignInButton — Login/Register sayfaları için Google ile giriş butonu.
 *
 * Client ID öncelik sırası:
 *   1) Backend `/site/service-status` (admin panelinden yönetilir — runtime)
 *   2) `VITE_GOOGLE_CLIENT_ID` ortam değişkeni (build-time fallback)
 *
 * Hiçbiri yoksa buton gizlenir (dev'de küçük bir bilgi notu görünür).
 */
export default function GoogleSignInButton({ role, text = "signin_with", safeFrom = null }) {
  const { data: ss } = useQuery({
    queryKey: ["serviceStatus"],
    queryFn: async () => {
      try {
        const { data } = await api.get("/site/service-status");
        return data;
      } catch {
        return null;
      }
    },
    staleTime: 60_000,
  });
  const clientId =
    (ss?.googleClientId && ss.googleClientId.trim()) ||
    import.meta.env.VITE_GOOGLE_CLIENT_ID ||
    "";

  const { loginWithGoogle } = useAuth();
  const navigate = useAppNavigate();
  const [loading, setLoading] = useState(false);

  const onSuccess = useCallback(
    async (credentialResponse) => {
      const idToken = credentialResponse?.credential;
      if (!idToken) {
        toast.error("Google yanıtı geçersiz");
        return;
      }
      setLoading(true);
      try {
        const { isNewUser } = await loginWithGoogle(idToken, role);
        if (isNewUser) toast.success("Hoş geldin! Hesabın oluşturuldu.");
        const target = safeFrom || createPageUrl("Home");
        navigate(target, { replace: true });
      } catch (err) {
        const msg =
          err?.response?.data?.error ||
          err?.response?.data?.message ||
          err?.message ||
          "Google ile giriş başarısız";
        toast.error(msg);
      } finally {
        setLoading(false);
      }
    },
    [loginWithGoogle, navigate, role, safeFrom],
  );

  const onError = useCallback(() => {
    toast.error("Google girişi iptal edildi veya başarısız oldu");
  }, []);

  if (!clientId) {
    // Yapılandırma eksik — buton gösterilmez, dev'de admin paneline yönlendiren ipucu
    if (import.meta.env.DEV) {
      return (
        <p className="text-xs text-slate-600 text-center">
          Google girişi yapılandırılmamış — admin panelinden Client ID giriniz.
        </p>
      );
    }
    return null;
  }

  return (
    <GoogleOAuthProvider clientId={clientId}>
      <div className="flex justify-center" aria-busy={loading}>
        <GoogleLogin
          onSuccess={onSuccess}
          onError={onError}
          text={text}
          shape="rectangular"
          size="large"
          locale="tr_TR"
          width="320"
          theme="outline"
          useOneTap={false}
        />
      </div>
    </GoogleOAuthProvider>
  );
}
