import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/lib/AuthContext";
import { createPageUrl } from "@/utils";
import { buildPageUrl, useAppNavigate } from "@/lib/navigation";
import { Button } from "@/components/ui/button";
import { LanguageSwitcherCompact } from "@/components/layout/LanguageSwitcherCompact";
import { GraduationCap } from "lucide-react";

/**
 * PublicHeader — login olmayan kullanıcılar için paylaşılan üst bar.
 * Tüm public sayfalarda Layout tarafından render edilir (TakeTest + LiveSession hariç).
 * sticky top-0 ile scroll'da sabit kalır.
 *
 * Marka adı (Sınav Salonu) i18n'lenmez; nav linkleri ve buton dile göre değişir.
 */
export default function PublicHeader() {
  const { t } = useTranslation(["pages", "common"]);
  const { user } = useAuth();
  const navigate = useAppNavigate();

  return (
    <header className="bg-white/80 backdrop-blur-sm border-b border-slate-100 sticky top-0 z-30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <Link to={createPageUrl("Home")} className="flex items-center gap-3 hover:opacity-90 transition-opacity">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{ backgroundColor: "#0000CD" }}
            >
              <GraduationCap className="w-6 h-6 text-white" />
            </div>
            {/* Marka adı — i18n'lenmiyor, her dilde aynı */}
            <span className="text-xl font-bold text-slate-900">{t("common:sidebar.brandName")}</span>
          </Link>

          <nav className="flex items-center gap-3">
            {/* Dil seçici — login olmadan da erişilebilir; sadece bayrak görünür, tıklayınca açılır */}
            <LanguageSwitcherCompact />
            {!user && (
              <>
                <Button
                  onClick={() => navigate(buildPageUrl("Login", { from: createPageUrl("Explore") }))}
                  style={{ backgroundColor: "#0000CD" }}
                  className="hover:opacity-90"
                >
                  {t("pages:home.nav.login")}
                </Button>
                {/* E-Sınıf (okul) girişi — aynı giriş ekranı; okul kullanıcısı giriş yapınca okul paneline yönlenir */}
                <Button
                  variant="outline"
                  onClick={() => navigate(buildPageUrl("Login", { from: createPageUrl("Home"), context: "school" }))}
                  className="border-indigo-600 text-indigo-700 hover:bg-indigo-50"
                >
                  {t("pages:home.nav.eSinif", { defaultValue: "E-Sınıf" })}
                </Button>
              </>
            )}
          </nav>
        </div>
      </div>
    </header>
  );
}
