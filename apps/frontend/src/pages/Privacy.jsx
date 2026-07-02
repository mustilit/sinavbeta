import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { createPageUrl } from "@/utils";
import { ArrowLeft, Shield } from "lucide-react";

/**
 * Privacy (Gizlilik Politikası) sayfası — KVKK kapsamındaki veri
 * toplama, kullanım, güvenlik, paylaşım ve kullanıcı hakları bilgilerini
 * açıklayan statik yasal bilgi sayfası.
 */
export default function Privacy() {
  const { t } = useTranslation(["pages"]);

  const renderSection = (titleKey, bodyKey) => (
    <section>
      <h2 className="text-2xl font-bold text-slate-900 mb-4">{t(titleKey)}</h2>
      <p className="text-slate-600 leading-relaxed">{t(bodyKey)}</p>
    </section>
  );

  const renderListSection = (titleKey, introKey, listKey) => {
    const items = t(listKey, { returnObjects: true });
    const list = Array.isArray(items) ? items : [];
    return (
      <section>
        <h2 className="text-2xl font-bold text-slate-900 mb-4">{t(titleKey)}</h2>
        <p className="text-slate-600 leading-relaxed mb-3">{t(introKey)}</p>
        <ul className="list-disc list-inside space-y-2 text-slate-600">
          {list.map((item, idx) => (
            <li key={idx}>{item}</li>
          ))}
        </ul>
      </section>
    );
  };

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <Link
          to={createPageUrl("Home")}
          className="inline-flex items-center gap-2 text-slate-600 hover:text-slate-900 mb-8"
        >
          <ArrowLeft className="w-4 h-4" />
          {t("pages:privacy.backToHome")}
        </Link>

        <div className="mb-12">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{backgroundColor: 'rgba(0, 0, 205, 0.1)'}}>
              <Shield className="w-6 h-6" style={{color: '#0000CD'}} />
            </div>
            <h1 className="text-4xl font-bold text-slate-900">{t("pages:titles.privacy")}</h1>
          </div>
          <p className="text-slate-600">{t("pages:privacy.lastUpdated")}</p>
        </div>

        <div className="prose prose-slate max-w-none space-y-8">
          {renderSection("pages:privacy.s1Title", "pages:privacy.s1Body")}
          {renderListSection("pages:privacy.s2Title", "pages:privacy.s2Intro", "pages:privacy.s2List")}
          {renderListSection("pages:privacy.s3Title", "pages:privacy.s3Intro", "pages:privacy.s3List")}
          {renderSection("pages:privacy.s4Title", "pages:privacy.s4Body")}

          <section>
            <h2 className="text-2xl font-bold text-slate-900 mb-4">{t("pages:privacy.s5Title")}</h2>
            <p className="text-slate-600 leading-relaxed">{t("pages:privacy.s5Intro")}</p>
            <ul className="list-disc list-inside space-y-2 text-slate-600 mt-3">
              {/** @type {any[]} */ (t("pages:privacy.s5List", { returnObjects: true }) || []).map((item, idx) => (
                <li key={idx}>{item}</li>
              ))}
            </ul>
          </section>

          {renderListSection("pages:privacy.s6Title", "pages:privacy.s6Intro", "pages:privacy.s6List")}
          {renderSection("pages:privacy.s7Title", "pages:privacy.s7Body")}
          {renderSection("pages:privacy.s8Title", "pages:privacy.s8Body")}
        </div>
      </div>
    </div>
  );
}
