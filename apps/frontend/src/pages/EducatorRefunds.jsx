import { useState } from "react";
import { useTranslation } from "react-i18next";
import { entities } from "@/api/dalClient";
import { useAuth } from "@/lib/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CheckCircle, XCircle, Clock, RefreshCw, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { tr } from "date-fns/locale";

// status etiketleri artık i18n key — render anında t() ile çözülür.
const STATUS_KEY = {
  PENDING: "pages:educatorRefunds.status.PENDING",
  EDUCATOR_APPROVED: "pages:educatorRefunds.status.EDUCATOR_APPROVED",
  EDUCATOR_REJECTED: "pages:educatorRefunds.status.EDUCATOR_REJECTED",
  APPEAL_PENDING: "pages:educatorRefunds.status.APPEAL_PENDING",
  ESCALATED: "pages:educatorRefunds.status.ESCALATED",
  APPROVED: "pages:educatorRefunds.status.APPROVED",
  REJECTED: "pages:educatorRefunds.status.REJECTED",
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

// reason key haritası — render anında t() ile çevrilir.
const REASON_KEY = {
  wrong_content: "pages:educatorRefunds.reasons.wrong_content",
  defective_questions: "pages:educatorRefunds.reasons.defective_questions",
  not_working: "pages:educatorRefunds.reasons.not_working",
  quality_issue: "pages:educatorRefunds.reasons.quality_issue",
  other: "pages:educatorRefunds.reasons.other",
};

function safeFormatDate(dateStr) {
  if (!dateStr) return "-";
  try {
    return formatDistanceToNow(new Date(dateStr), { addSuffix: true, locale: tr });
  } catch {
    return dateStr;
  }
}

function EducatorRefunds() {
  const { t } = useTranslation(["pages"]);
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState(null);
  const [rejectReason, setRejectReason] = useState("");
  const [showRejectInput, setShowRejectInput] = useState(false);

  const { data: refunds = [], isLoading } = useQuery({
    queryKey: ["educator-refunds"],
    queryFn: () => entities.RefundRequest.listForEducator(),
    enabled: ["EDUCATOR", "ADMIN"].includes((user?.role || "").toUpperCase()),
  });

  const approveMutation = useMutation({
    mutationFn: (id) => entities.RefundRequest.educatorApprove(id),
    onSuccess: () => {
      toast.success(t("pages:educatorRefunds.toasts.approved"));
      queryClient.invalidateQueries({ queryKey: ["educator-refunds"] });
      setSelected(null);
    },
    onError: (err) => toast.error(err?.response?.data?.message ?? t("pages:educatorRefunds.toasts.actionFailed")),
  });

  const rejectMutation = useMutation({
    mutationFn: ({ id, reason }) => entities.RefundRequest.educatorReject(id, reason),
    onSuccess: () => {
      toast.success(t("pages:educatorRefunds.toasts.rejected"));
      queryClient.invalidateQueries({ queryKey: ["educator-refunds"] });
      setSelected(null);
      setRejectReason("");
      setShowRejectInput(false);
    },
    onError: (err) => toast.error(err?.response?.data?.message ?? t("pages:educatorRefunds.toasts.actionFailed")),
  });

  const pending = refunds.filter((r) => r.status === "PENDING");
  const reviewed = refunds.filter((r) => r.status !== "PENDING");

  const isMutating = approveMutation.isPending || rejectMutation.isPending;

  if (!["EDUCATOR", "ADMIN"].includes((user?.role || "").toUpperCase())) {
    return (
      <div className="text-center py-20">
        <h2 className="text-xl font-semibold text-slate-900">{t("pages:educatorRefunds.accessDenied")}</h2>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900">{t("pages:titles.educatorRefunds")}</h1>
        <p className="text-slate-500 mt-2">
          {t("pages:titles.educatorRefundsDesc")}
        </p>
      </div>

      {/* Deadline uyarısı */}
      {pending.some((r) => r.educator_deadline && new Date(r.educator_deadline) < new Date(Date.now() + 2 * 24 * 60 * 60 * 1000)) && (
        <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg mb-6 text-amber-800 text-sm">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {t("pages:educatorRefunds.deadlineWarning")}
        </div>
      )}

      <Tabs defaultValue="pending" className="space-y-6">
        <TabsList>
          <TabsTrigger value="pending">
            {t("pages:educatorRefunds.tabs.pending")}
            {pending.length > 0 && (
              <span className="ml-2 bg-amber-500 text-white text-xs rounded-full px-1.5 py-0.5">{pending.length}</span>
            )}
          </TabsTrigger>
          <TabsTrigger value="reviewed">{t("pages:educatorRefunds.tabs.reviewed")} ({reviewed.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="pending">
          {isLoading ? (
            <div className="space-y-4">
              {[1, 2].map((i) => <div key={i} className="h-24 bg-slate-100 rounded-lg animate-pulse" />)}
            </div>
          ) : pending.length === 0 ? (
            <Card>
              <CardContent className="text-center py-12">
                <CheckCircle className="w-12 h-12 text-emerald-300 mx-auto mb-3" />
                <p className="text-slate-500">{t("pages:educatorRefunds.empty.noPending")}</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {pending.map((r) => (
                <Card key={r.id}>
                  <CardContent className="p-6">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start gap-4">
                        <div className="p-3 bg-amber-50 rounded-xl">
                          <RefreshCw className="w-5 h-5 text-amber-600" />
                        </div>
                        <div>
                          {/* test_package_title user-generated */}
                          <p className="font-semibold text-slate-900 flex items-center gap-2">
                            {r.test_package_title || t("pages:educatorRefunds.card.testFallback")}
                            {r.source && r.source !== "TEST" && (
                              <Badge className={r.source === "TUNNEL" ? "bg-indigo-100 text-indigo-700" : "bg-amber-100 text-amber-700"}>
                                {t(`pages:refundSource.${r.source}`)}
                              </Badge>
                            )}
                          </p>
                          <p className="text-sm text-slate-500 mt-0.5">
                            {REASON_KEY[r.reason] ? t(REASON_KEY[r.reason]) : (r.reason ?? t("pages:educatorRefunds.card.reasonFallback"))}
                          </p>
                          {r.description && (
                            <p className="text-sm text-slate-600 mt-1 italic">"{r.description}"</p>
                          )}
                          <div className="flex items-center gap-3 mt-2 text-xs text-slate-400">
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {safeFormatDate(r.created_date)}
                            </span>
                            {r.educator_deadline && (
                              <span className={`font-medium ${new Date(r.educator_deadline) < new Date() ? "text-rose-500" : "text-amber-600"}`}>
                                {t("pages:educatorRefunds.card.deadline", { when: safeFormatDate(r.educator_deadline) })}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <Button size="sm" onClick={() => { setSelected(r); setShowRejectInput(false); setRejectReason(""); }}>
                        {t("pages:educatorRefunds.card.review")}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="reviewed">
          {reviewed.length === 0 ? (
            <Card>
              <CardContent className="text-center py-12">
                <p className="text-slate-500">{t("pages:educatorRefunds.empty.noReviewed")}</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {reviewed.map((r) => (
                <Card key={r.id}>
                  <CardContent className="p-5">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <Badge className={STATUS_COLOR[r.status] ?? "bg-slate-100 text-slate-600"}>
                            {STATUS_KEY[r.status] ? t(STATUS_KEY[r.status]) : r.status}
                          </Badge>
                        </div>
                        <p className="font-medium text-slate-900">{r.test_package_title || t("pages:educatorRefunds.card.testFallback")}</p>
                        <p className="text-xs text-slate-400 mt-0.5">{safeFormatDate(r.created_date)}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* İnceleme dialog */}
      <Dialog open={!!selected} onOpenChange={() => { setSelected(null); setShowRejectInput(false); setRejectReason(""); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("pages:educatorRefunds.dialog.title")}</DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-4 mt-2">
              <div className="p-4 bg-slate-50 rounded-lg space-y-2 text-sm">
                <p><span className="text-slate-500">{t("pages:educatorRefunds.dialog.testLabel")}</span> <span className="font-medium">{selected.test_package_title}</span></p>
                <p><span className="text-slate-500">{t("pages:educatorRefunds.dialog.reasonLabel")}</span> {REASON_KEY[selected.reason] ? t(REASON_KEY[selected.reason]) : (selected.reason ?? "-")}</p>
                {selected.description && (
                  <p><span className="text-slate-500">{t("pages:educatorRefunds.dialog.descLabel")}</span> {selected.description}</p>
                )}
                {selected.educator_deadline && (
                  <p>
                    <span className="text-slate-500">{t("pages:educatorRefunds.dialog.deadlineLabel")}</span>{" "}
                    <span className={new Date(selected.educator_deadline) < new Date() ? "text-rose-600 font-medium" : "text-amber-700"}>
                      {safeFormatDate(selected.educator_deadline)}
                    </span>
                  </p>
                )}
              </div>

              {showRejectInput ? (
                <div className="space-y-3">
                  <Textarea
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    placeholder={t("pages:educatorRefunds.dialog.rejectPlaceholder")}
                    rows={3}
                  />
                  <div className="flex gap-2 justify-end">
                    <Button variant="ghost" size="sm" onClick={() => setShowRejectInput(false)}>
                      {t("pages:educatorRefunds.dialog.back")}
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      disabled={isMutating || (rejectReason.trim().length > 0 && rejectReason.trim().length < 5)}
                      onClick={() => rejectMutation.mutate({ id: selected.id, reason: rejectReason.trim() || undefined })}
                    >
                      <XCircle className="w-4 h-4 mr-1.5" />
                      {t("pages:educatorRefunds.dialog.reject")}
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex gap-3 justify-end">
                  <Button
                    variant="outline"
                    className="text-rose-600 border-rose-200 hover:bg-rose-50"
                    disabled={isMutating}
                    onClick={() => setShowRejectInput(true)}
                  >
                    <XCircle className="w-4 h-4 mr-1.5" />
                    {t("pages:educatorRefunds.dialog.reject")}
                  </Button>
                  <Button
                    className="bg-emerald-600 hover:bg-emerald-700"
                    disabled={isMutating}
                    onClick={() => approveMutation.mutate(selected.id)}
                  >
                    <CheckCircle className="w-4 h-4 mr-1.5" />
                    {t("pages:educatorRefunds.dialog.approve")}
                  </Button>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default EducatorRefunds;
