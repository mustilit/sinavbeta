import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Zap, FileText, CheckCircle2 } from "lucide-react";

const SEEN_KEY = "dal_livesession_intro_seen";

/**
 * Canlı Test sayfası ilk açıldığında "Canlı Test Nedir?" pop-up'ını ilk seferde
 * otomatik açar (localStorage ile tek sefer). Dönen setOpen ile "Canlı Test nedir?"
 * butonundan tekrar açılabilir. (Tünel intro deseniyle birebir.)
 */
export function useLiveSessionIntro(active) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!active) return;
    let seen = false;
    try { seen = localStorage.getItem(SEEN_KEY) === "1"; } catch { /* yoksay */ }
    if (!seen) {
      setOpen(true);
      try { localStorage.setItem(SEEN_KEY, "1"); } catch { /* yoksay */ }
    }
  }, [active]);
  return { open, setOpen };
}

/**
 * LiveSessionInfoModal — "Canlı Test Nedir?" bilgilendirme pop-up'ı.
 * TunnelInfoModal ile aynı görsellik/yapı (amber tema). Canlı test mantığını
 * (eş zamanlı, kodla katılım, soru-soru ilerleme) anlatır. Tüm metinler i18n
 * (pages:liveSessionInfo.*, 5 dil).
 */
export function LiveSessionInfoModal({ open, onClose }) {
  const { t } = useTranslation(["pages"]);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-amber-500 to-orange-500 text-white">
              <Zap className="h-5 w-5" aria-hidden="true" />
            </span>
            {t("pages:liveSessionInfo.title")}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <p className="text-sm text-slate-600">{t("pages:liveSessionInfo.intro")}</p>

          {/* Normal test vs Canlı test karşılaştırması */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <div className="flex items-center gap-1.5 text-sm font-semibold text-slate-700">
                <FileText className="h-4 w-4" aria-hidden="true" /> {t("pages:liveSessionInfo.normalLabel")}
              </div>
              <p className="mt-1 text-xs text-slate-500">{t("pages:liveSessionInfo.normalDesc")}</p>
            </div>
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
              <div className="flex items-center gap-1.5 text-sm font-semibold text-amber-700">
                <Zap className="h-4 w-4" aria-hidden="true" /> {t("pages:liveSessionInfo.liveLabel")}
              </div>
              <p className="mt-1 text-xs text-amber-600/80">{t("pages:liveSessionInfo.liveDesc")}</p>
            </div>
          </div>

          {/* Nasıl çalışır */}
          <ul className="space-y-2">
            {["point1", "point2", "point3", "point4"].map((k) => (
              <li key={k} className="flex items-start gap-2 text-sm text-slate-600">
                <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-emerald-500" aria-hidden="true" />
                <span>{t(`pages:liveSessionInfo.${k}`)}</span>
              </li>
            ))}
          </ul>

          <div className="flex justify-end pt-2">
            <Button onClick={onClose} className="bg-amber-500 text-white hover:bg-amber-600">
              {t("pages:liveSessionInfo.gotIt")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
