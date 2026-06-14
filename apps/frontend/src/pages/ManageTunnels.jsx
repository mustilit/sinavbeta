import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Plus, Pencil, Eye, Loader2, Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { tunnels as tunnelApi } from "@/api/dalClient";
import { createPageUrl } from "@/utils";

const STATUS = {
  DRAFT: { label: "Taslak", cls: "bg-slate-100 text-slate-600" },
  PENDING_APPROVAL: { label: "Onay Bekliyor", cls: "bg-amber-100 text-amber-700" },
  APPROVED: { label: "Onaylandı", cls: "bg-emerald-100 text-emerald-700" },
  PUBLISHED: { label: "Yayında", cls: "bg-emerald-100 text-emerald-700" },
  REJECTED: { label: "Reddedildi", cls: "bg-rose-100 text-rose-700" },
  UNPUBLISHED: { label: "Yayından Kaldırıldı", cls: "bg-slate-100 text-slate-600" },
};

/** Eğiticinin tünelleri — liste + durum + düzenle (DRAFT/REJECTED). */
export default function ManageTunnels() {
  const navigate = useNavigate();
  const { data, isLoading } = useQuery({
    queryKey: ["myTunnels"],
    queryFn: () => tunnelApi.mine(),
    staleTime: 10_000,
  });
  const items = data?.items ?? [];

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900">
            <Layers className="h-6 w-6 text-indigo-600" /> Tünellerim
          </h1>
          <p className="mt-1 text-sm text-slate-500">Oluşturduğun tüneller ve onay durumları</p>
        </div>
        <Button onClick={() => navigate(createPageUrl("CreateTunnel"))}>
          <Plus className="mr-2 h-4 w-4" /> Yeni Tünel
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>
      ) : items.length === 0 ? (
        <div className="py-16 text-center">
          <Layers className="mx-auto mb-3 h-10 w-10 text-slate-300" />
          <p className="text-sm text-slate-500">Henüz tünelin yok. "Yeni Tünel" ile başla.</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {items.map((t) => {
            const s = STATUS[t.status] || STATUS.DRAFT;
            const editable = t.status === "DRAFT" || t.status === "REJECTED";
            return (
              <li key={t.id}>
                <Card>
                  <CardContent className="flex flex-wrap items-center gap-3 p-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-slate-900">{t.title}</span>
                        <span className={"rounded-full px-2 py-0.5 text-xs font-medium " + s.cls}>{s.label}</span>
                      </div>
                      <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-slate-500">
                        {t.examTypeName && <span>{t.examTypeName}</span>}
                        {t.topicName && <span>· {t.topicName}</span>}
                        <span>· {t.layerCount} katman</span>
                        <span>· {t.questionCount} soru</span>
                      </div>
                    </div>
                    <Button
                      variant={editable ? "default" : "outline"}
                      size="sm"
                      onClick={() => navigate(createPageUrl("CreateTunnel") + `?id=${t.id}`)}
                    >
                      {editable ? <><Pencil className="mr-1.5 h-4 w-4" /> Düzenle</> : <><Eye className="mr-1.5 h-4 w-4" /> Görüntüle</>}
                    </Button>
                  </CardContent>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
