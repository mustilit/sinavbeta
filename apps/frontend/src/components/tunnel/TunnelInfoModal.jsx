import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Layers, FileText, CheckCircle2 } from "lucide-react";

const SEEN_KEY = "dal_tunnel_intro_seen";

/**
 * Tünel sekmesi `active` olduğunda "Tünel Nedir?" pop-up'ını ilk seferde otomatik
 * açar (localStorage ile tek sefer). Dönen setOpen ile "Tünel nedir?" butonundan
 * tekrar açılabilir.
 */
export function useTunnelIntro(active) {
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
 * TunnelInfoModal — "Tünel Nedir?" bilgilendirme pop-up'ı.
 * Aday tünel sekmesini ilk açtığında otomatik gösterilir (Explore + MyTests),
 * ayrıca "Tünel nedir?" butonuyla tekrar açılabilir. Tünel'in ne olduğunu ve
 * normal testten farkını anlatır. Tüm metinler i18n (pages:tunnelInfo.*, 5 dil).
 */
export function TunnelInfoModal({ open, onClose }) {
  const { t } = useTranslation(["pages"]);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-500 text-white">
              <Layers className="h-5 w-5" aria-hidden="true" />
            </span>
            {t("pages:tunnelInfo.title")}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <p className="text-sm text-slate-600">{t("pages:tunnelInfo.intro")}</p>

          {/* Normal test vs Tünel karşılaştırması */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <div className="flex items-center gap-1.5 text-sm font-semibold text-slate-700">
                <FileText className="h-4 w-4" aria-hidden="true" /> {t("pages:tunnelInfo.normalLabel")}
              </div>
              <p className="mt-1 text-xs text-slate-500">{t("pages:tunnelInfo.normalDesc")}</p>
            </div>
            <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-3">
              <div className="flex items-center gap-1.5 text-sm font-semibold text-indigo-700">
                <Layers className="h-4 w-4" aria-hidden="true" /> {t("pages:tunnelInfo.tunnelLabel")}
              </div>
              <p className="mt-1 text-xs text-indigo-600/80">{t("pages:tunnelInfo.tunnelDesc")}</p>
            </div>
          </div>

          {/* Nasıl çalışır */}
          <ul className="space-y-2">
            {["point1", "point2", "point3"].map((k) => (
              <li key={k} className="flex items-start gap-2 text-sm text-slate-600">
                <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-emerald-500" aria-hidden="true" />
                <span>{t(`pages:tunnelInfo.${k}`)}</span>
              </li>
            ))}
          </ul>

          <div className="flex justify-end pt-2">
            <Button onClick={onClose} className="bg-indigo-600 text-white hover:bg-indigo-700">
              {t("pages:tunnelInfo.gotIt")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
