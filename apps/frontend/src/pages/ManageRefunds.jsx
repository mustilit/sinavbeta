import { useState } from "react";
import { entities } from "@/api/dalClient";
import { useAuth } from "@/lib/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { RefreshCw, CheckCircle, XCircle, Filter, Clock, AlertTriangle } from "lucide-react";
import { Pagination } from "@/components/ui/Pagination";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { tr } from "date-fns/locale";

const STATUS_LABEL = {
  PENDING: "Bekliyor (Eğitici)",
  EDUCATOR_APPROVED: "Eğitici Onayladı",
  EDUCATOR_REJECTED: "Eğitici Reddetti",
  APPEAL_PENDING: "İtiraz Var",
  ESCALATED: "Süre Doldu",
  APPROVED: "İade Yapıldı",
  REJECTED: "Reddedildi",
};

const STATUS_COLOR = {
  PENDING: "bg-amber-100 text-amber-700",
  EDUCATOR_APPROVED: "bg-blue-100 text-blue-700",
  EDUCATOR_REJECTED: "bg-rose-100 text-rose-700",
  APPEAL_PENDING: "bg-purple-100 text-purple-700",
  ESCALATED: "bg-orange-100 text-orange-700",
  APPROVED: "bg-emerald-100 text-emerald-700",
  REJECTED: "bg-slate-100 text-slate-600",
};

const REASON_LABEL = {
  wrong_content: "İçerik beklentiyi karşılamadı",
  defective_questions: "Hatalı soru var",
  not_working: "Teknik sorun",
  quality_issue: "Kalite problemi",
  other: "Diğer",
};

// Statüler admin aksiyonu gerektiriyor mu?
const NEEDS_ADMIN_ACTION = ["EDUCATOR_APPROVED", "APPEAL_PENDING", "ESCALATED"];

function safeFormatDate(dateStr) {
  if (!dateStr) return "-";
  try {
    return formatDistanceToNow(new Date(dateStr), { addSuffix: true, locale: tr });
  } catch {
    return dateStr;
  }
}

export default function ManageRefunds() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState(null);
  const [adminNotes, setAdminNotes] = useState("");
  const [filterStatus, setFilterStatus] = useState("actionable");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [resolvedPage, setResolvedPage] = useState(1);
  const [resolvedPageSize, setResolvedPageSize] = useState(20);

  const { data: refunds = [], isLoading } = useQuery({
    queryKey: ["admin-refunds", filterStatus],
    queryFn: () => entities.RefundRequest.list(filterStatus),
    enabled: (user?.role || "").toUpperCase() === "ADMIN",
  });

  const approveMutation = useMutation({
    mutationFn: ({ id, notes }) => entities.RefundRequest.adminApprove(id, notes),
    onSuccess: () => {
      toast.success("İade onaylandı.");
      queryClient.invalidateQueries({ queryKey: ["admin-refunds"] });
      setSelected(null);
      setAdminNotes("");
    },
    onError: (err) => toast.error(err?.response?.data?.message ?? "İşlem başarısız"),
  });

  const rejectMutation = useMutation({
    mutationFn: ({ id, reason }) => entities.RefundRequest.adminReject(id, reason),
    onSuccess: () => {
      toast.success("İade talebi reddedildi.");
      queryClient.invalidateQueries({ queryKey: ["admin-refunds"] });
      setSelected(null);
      setAdminNotes("");
    },
    onError: (err) => toast.error(err?.response?.data?.message ?? "İşlem başarısız"),
  });

  const isMutating = approveMutation.isPending || rejectMutation.isPending;

  const actionable = refunds.filter((r) => NEEDS_ADMIN_ACTION.includes(r.status));
  const resolved = refunds.filter((r) => !NEEDS_ADMIN_ACTION.includes(r.status));

  const paginatedActionable = actionable.slice((page - 1) * pageSize, page * pageSize);
  const paginatedResolved = resolved.slice((resolvedPage - 1) * resolvedPageSize, resolvedPage * resolvedPageSize);

  if ((user?.role || "").toUpperCase() !== "ADMIN") {
    return (
      <div className="text-center py-20">
        <h2 className="text-xl font-semibold text-slate-900">Erişim Engellendi</h2>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900">İade Yönetimi</h1>
        <p className="text-slate-500 mt-2">
          Eğitici onaylı, itirazlı ve süresi dolmuş iade taleplerini sonuçlandırın.
        </p>
      </div>

      {/* Filtre */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 mb-6 flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-2 text-slate-500 text-sm">
          <Filter className="w-4 h-4" />
          Durum:
        </div>
        <Select value={filterStatus} onValueChange={(v) => { setFilterStatus(v); setPage(1); setResolvedPage(1); }}>
          <SelectTrigger className="w-56">
            <span className="truncate text-sm">{
              filterStatus === "actionable" ? "Admin Aksiyonu Gerekenler" :
              STATUS_LABEL[filterStatus] ?? filterStatus
            }</span>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="actionable">Admin Aksiyonu Gerekenler</SelectItem>
            <SelectItem value="EDUCATOR_APPROVED">Eğitici Onayladı</SelectItem>
            <SelectItem value="APPEAL_PENDING">İtiraz Var</SelectItem>
            <SelectItem value="ESCALATED">Süre Doldu</SelectItem>
            <SelectItem value="APPROVED">İade Yapıldı</SelectItem>
            <SelectItem value="REJECTED">Reddedildi</SelectItem>
            <SelectItem value="PENDING">Eğitici Bekliyor</SelectItem>
            <SelectItem value="EDUCATOR_REJECTED">Eğitici Reddetti</SelectItem>
          </SelectContent>
        </Select>
        {filterStatus === "actionable" && actionable.length > 0 && (
          <span className="text-sm text-amber-700 font-medium bg-amber-50 px-2 py-1 rounded">
            {actionable.length} talep bekliyor
          </span>
        )}
      </div>

      <Tabs defaultValue="actionable" className="space-y-6">
        <TabsList>
          <TabsTrigger value="actionable">
            Aksiyon Gerekiyor
            {actionable.length > 0 && (
              <span className="ml-2 bg-rose-500 text-white text-xs rounded-full px-1.5 py-0.5">{actionable.length}</span>
            )}
          </TabsTrigger>
          <TabsTrigger value="resolved">Sonuçlanan ({resolved.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="actionable">
          {isLoading ? (
            <div className="space-y-4">{[1, 2, 3].map((i) => <div key={i} className="h-24 bg-slate-100 rounded-lg animate-pulse" />)}</div>
          ) : paginatedActionable.length === 0 ? (
            <Card>
              <CardContent className="text-center py-12">
                <CheckCircle className="w-12 h-12 text-emerald-300 mx-auto mb-3" />
                <p className="text-slate-500">Aksiyon bekleyen talep yok</p>
              </CardContent>
            </Card>
          ) : (
            <>
              <div className="space-y-4">
                {paginatedActionable.map((r) => (
                  <Card key={r.id} className={r.status === "APPEAL_PENDING" ? "border-purple-200" : r.status === "ESCALATED" ? "border-orange-200" : ""}>
                    <CardContent className="p-6">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-start gap-4">
                          <div className={`p-3 rounded-xl ${r.status === "APPEAL_PENDING" ? "bg-purple-50" : r.status === "ESCALATED" ? "bg-orange-50" : "bg-blue-50"}`}>
                            {r.status === "ESCALATED" ? <AlertTriangle className="w-5 h-5 text-orange-500" /> :
                             r.status === "APPEAL_PENDING" ? <RefreshCw className="w-5 h-5 text-purple-500" /> :
                             <CheckCircle className="w-5 h-5 text-blue-500" />}
                          </div>
                          <div>
                            <div className="flex items-center gap-2 mb-1">
                              <Badge className={STATUS_COLOR[r.status] ?? "bg-slate-100 text-slate-600"}>
                                {STATUS_LABEL[r.status] ?? r.status}
                              </Badge>
                              {r.source && r.source !== "TEST" && (
                                <Badge className={r.source === "TUNNEL" ? "bg-indigo-100 text-indigo-700" : "bg-amber-100 text-amber-700"}>
                                  {r.source === "TUNNEL" ? "Tünel" : "Yazılı"}
                                </Badge>
                              )}
                            </div>
                            <p className="font-semibold text-slate-900">{r.test_package_title || "Test"}</p>
                            <p className="text-sm text-slate-500 mt-0.5">
                              {REASON_LABEL[r.reason] ?? r.reason ?? "-"}
                            </p>
                            {r.appeal_reason && (
                              <p className="text-sm text-purple-700 mt-1">
                                <span className="font-medium">İtiraz:</span> {r.appeal_reason}
                              </p>
                            )}
                            <div className="flex items-center gap-3 mt-2 text-xs text-slate-400">
                              <span className="flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                {safeFormatDate(r.created_date)}
                              </span>
                            </div>
                          </div>
                        </div>
                        <Button size="sm" onClick={() => { setSelected(r); setAdminNotes(""); }}>
                          İncele
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>

              <div className="mt-4 bg-white border border-slate-200 rounded-xl">
                <Pagination
                  page={page}
                  pageSize={pageSize}
                  total={actionable.length}
                  onPageChange={setPage}
                  onPageSizeChange={(s) => { setPageSize(s); setPage(1); }}
                  pageSizeOptions={[10, 20, 50]}
                />
              </div>
            </>
          )}
        </TabsContent>

        <TabsContent value="resolved">
          {resolved.length === 0 ? (
            <Card>
              <CardContent className="text-center py-12">
                <p className="text-slate-500">Sonuçlanan talep yok</p>
              </CardContent>
            </Card>
          ) : (
            <>
              <div className="space-y-3">
                {paginatedResolved.map((r) => (
                  <Card key={r.id}>
                    <CardContent className="p-5">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <Badge className={STATUS_COLOR[r.status] ?? "bg-slate-100"}>
                              {STATUS_LABEL[r.status] ?? r.status}
                            </Badge>
                          </div>
                          <p className="font-medium text-slate-900">{r.test_package_title || "Test"}</p>
                          <p className="text-xs text-slate-400 mt-0.5">{safeFormatDate(r.created_date)}</p>
                          {r.admin_notes && (
                            <p className="text-sm text-slate-600 mt-1 p-2 bg-slate-50 rounded">
                              <strong>Not:</strong> {r.admin_notes}
                            </p>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
              <div className="mt-4 bg-white border border-slate-200 rounded-xl">
                <Pagination
                  page={resolvedPage}
                  pageSize={resolvedPageSize}
                  total={resolved.length}
                  onPageChange={setResolvedPage}
                  onPageSizeChange={(s) => { setResolvedPageSize(s); setResolvedPage(1); }}
                  pageSizeOptions={[10, 20, 50]}
                />
              </div>
            </>
          )}
        </TabsContent>
      </Tabs>

      {/* İnceleme dialog */}
      <Dialog open={!!selected} onOpenChange={() => { setSelected(null); setAdminNotes(""); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>İade Talebini Sonuçlandır</DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-4 mt-2">
              <div className="p-4 bg-slate-50 rounded-lg space-y-2 text-sm">
                <div className="flex items-center gap-2">
                  <Badge className={STATUS_COLOR[selected.status] ?? "bg-slate-100"}>
                    {STATUS_LABEL[selected.status] ?? selected.status}
                  </Badge>
                </div>
                <p><span className="text-slate-500">Test:</span> <span className="font-medium">{selected.test_package_title}</span></p>
                <p><span className="text-slate-500">Sebep:</span> {REASON_LABEL[selected.reason] ?? selected.reason ?? "-"}</p>
                {selected.description && (
                  <p><span className="text-slate-500">Açıklama:</span> {selected.description}</p>
                )}
                {selected.appeal_reason && (
                  <p className="text-purple-700"><span className="text-slate-500">İtiraz Gerekçesi:</span> {selected.appeal_reason}</p>
                )}
                {selected.status === "EDUCATOR_APPROVED" && (
                  <p className="text-blue-700 text-xs">Eğitici bu iadeyi onayladı. Admin onayından sonra iade işlemi gerçekleşir.</p>
                )}
                {selected.status === "APPEAL_PENDING" && (
                  <p className="text-purple-700 text-xs">Aday eğiticinin ret kararına itiraz etti. Nihai kararı veriniz.</p>
                )}
                {selected.status === "ESCALATED" && (
                  <p className="text-orange-700 text-xs">Eğitici 7 gün içinde yanıtlamadı. Admin olarak sonuçlandırabilirsiniz.</p>
                )}
              </div>

              <Textarea
                value={adminNotes}
                onChange={(e) => setAdminNotes(e.target.value)}
                placeholder="Yönetici notu (opsiyonel)..."
                rows={3}
              />

              <div className="flex gap-3 justify-end">
                <Button
                  variant="outline"
                  className="text-rose-600 border-rose-200 hover:bg-rose-50"
                  disabled={isMutating}
                  onClick={() => rejectMutation.mutate({ id: selected.id, reason: adminNotes.trim() || undefined })}
                >
                  <XCircle className="w-4 h-4 mr-1.5" />
                  Reddet
                </Button>
                <Button
                  className="bg-emerald-600 hover:bg-emerald-700"
                  disabled={isMutating}
                  onClick={() => approveMutation.mutate({ id: selected.id, notes: adminNotes.trim() || undefined })}
                >
                  <CheckCircle className="w-4 h-4 mr-1.5" />
                  Onayla (İade Yap)
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
