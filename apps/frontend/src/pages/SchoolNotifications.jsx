import { useState } from "react";
import { useInfiniteQuery, useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { schoolNotifications } from "@/api/dalClient";
import { useAuth } from "@/lib/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Bell, BellOff, BookOpen, Award, Mail, CheckCircle2, CalendarClock, CheckCheck, Send, AlertCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { tr as trLocale } from "date-fns/locale";

const TYPE_ICON = {
  NEW_ASSIGNMENT: BookOpen,
  ASSIGNMENT_GRADED: Award,
  MESSAGE: Mail,
  OFFLINE_DONE: CheckCircle2,
  APPOINTMENT: CalendarClock,
};
const TYPE_COLOR = {
  NEW_ASSIGNMENT: "bg-indigo-50 text-indigo-600",
  ASSIGNMENT_GRADED: "bg-emerald-50 text-emerald-600",
  MESSAGE: "bg-sky-50 text-sky-600",
  OFFLINE_DONE: "bg-amber-50 text-amber-600",
  APPOINTMENT: "bg-violet-50 text-violet-600",
};
const TYPES = ["NEW_ASSIGNMENT", "ASSIGNMENT_GRADED", "MESSAGE", "OFFLINE_DONE", "APPOINTMENT"];

/** E-Sınıf — Bildirimler. Tüm okul rolleri; personel sınıflarına mesaj gönderebilir. */
export default function SchoolNotifications() {
  const { user } = useAuth();
  const { t } = useTranslation("school");
  const qc = useQueryClient();
  const role = user?.school?.schoolRole;
  const isStaff = ["TEACHER", "DEPT_HEAD", "SCHOOL_ADMIN", "BRANCH_ADMIN"].includes(role);
  const [tab, setTab] = useState("all"); // all | unread
  const [type, setType] = useState("ALL");
  const [composeOpen, setComposeOpen] = useState(false);
  const [pickedClassrooms, setPickedClassrooms] = useState(new Set());

  const listParams = { isRead: tab === "unread" ? false : undefined, type: type === "ALL" ? undefined : type };
  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey: ["school-notifications", "list", tab, type],
    queryFn: ({ pageParam }) => schoolNotifications.list({ ...listParams, cursor: pageParam ?? undefined, limit: 30 }),
    initialPageParam: null,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled: !!role,
  });
  const items = data?.pages.flatMap((p) => p.items) ?? [];
  const unreadCount = data?.pages[0]?.unreadCount ?? 0;

  const { data: targets } = useQuery({
    queryKey: ["school-notifications", "message-targets"],
    queryFn: () => schoolNotifications.messageTargets(),
    enabled: composeOpen && isStaff,
  });
  const classrooms = targets?.classrooms ?? [];

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["school-notifications"] });
  };
  const markRead = useMutation({
    mutationFn: (id) => schoolNotifications.markRead(id),
    onSuccess: invalidate,
  });
  const markAll = useMutation({
    mutationFn: () => schoolNotifications.markAllRead(),
    onSuccess: () => { toast.success(t("notifications.allMarkedRead")); invalidate(); },
    onError: (e) => toast.error(e?.response?.data?.message ?? t("common.error")),
  });
  const send = useMutation({
    mutationFn: (body) => schoolNotifications.sendMessage(body),
    onSuccess: (res) => {
      toast.success(t("notifications.sentToast", { count: res.sent }));
      setComposeOpen(false);
      setPickedClassrooms(new Set());
    },
    onError: (e) => toast.error(e?.response?.data?.message ?? t("notifications.sendFailed")),
  });

  if (!role) {
    return (
      <div className="max-w-lg mx-auto text-center py-20">
        <AlertCircle className="w-12 h-12 mx-auto mb-3 text-slate-300" />
        <h2 className="text-xl font-semibold text-slate-900">{t("common.accessDenied")}</h2>
      </div>
    );
  }

  const toggleClassroom = (id) => setPickedClassrooms((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const submitMessage = (e) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const title = (f.get("title") ?? "").toString().trim();
    if (!title) return toast.error(t("notifications.titleRequired"));
    send.mutate({
      title,
      body: (f.get("body") ?? "").toString().trim() || undefined,
      classroomIds: pickedClassrooms.size ? [...pickedClassrooms] : undefined,
    });
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center"><Bell className="w-5 h-5 text-indigo-600" /></div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{t("notifications.title")}</h1>
            <p className="text-sm text-slate-500">{unreadCount > 0 ? t("notifications.unreadSummary", { count: unreadCount }) : t("notifications.allRead")}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {unreadCount > 0 && (
            <Button variant="outline" className="gap-2" disabled={markAll.isPending} onClick={() => markAll.mutate()}>
              <CheckCheck className="w-4 h-4" /> {t("notifications.markAllRead")}
            </Button>
          )}
          {isStaff && (
            <Button className="bg-indigo-600 hover:bg-indigo-700 gap-2" onClick={() => setComposeOpen(true)}>
              <Send className="w-4 h-4" /> {t("notifications.compose")}
            </Button>
          )}
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
        <div className="flex gap-1 border-b border-slate-200 flex-1">
          {["all", "unread"].map((k) => (
            <button key={k} type="button" onClick={() => setTab(k)}
              className={`px-4 py-2.5 min-h-10 text-sm font-medium border-b-2 -mb-px ${tab === k ? "border-indigo-600 text-indigo-600" : "border-transparent text-slate-600 hover:text-slate-900"}`}>
              {t(`notifications.tabs.${k}`)}
            </button>
          ))}
        </div>
        <Select value={type} onValueChange={setType}>
          <SelectTrigger className="w-full sm:w-52" aria-label={t("notifications.typeFilter")}><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">{t("notifications.types.all")}</SelectItem>
            {TYPES.map((k) => <SelectItem key={k} value={k}>{t(`notifications.types.${k}`)}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="space-y-2">{[0, 1, 2].map((i) => <div key={i} className="h-16 bg-slate-100 rounded-xl animate-pulse" />)}</div>
      ) : items.length === 0 ? (
        <div className="text-center py-16 text-slate-500">
          <BellOff className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>{t("notifications.empty")}</p>
        </div>
      ) : (
        <>
          <ul className="space-y-2">
            {items.map((n) => {
              const Icon = TYPE_ICON[n.type] ?? Bell;
              const senderName = n.sender ? `${n.sender.firstName ?? ""} ${n.sender.lastName ?? ""}`.trim() || n.sender.username : null;
              return (
                <li key={n.id}>
                  <button
                    type="button"
                    onClick={() => { if (!n.isRead) markRead.mutate(n.id); }}
                    className={`w-full text-left flex items-start gap-3 rounded-xl border px-4 py-3 transition-colors min-h-10 ${n.isRead ? "border-slate-200 bg-white" : "border-indigo-200 bg-indigo-50/40 hover:bg-indigo-50"}`}
                    aria-label={n.isRead ? n.title : t("notifications.markReadAria", { title: n.title })}
                  >
                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${TYPE_COLOR[n.type] ?? "bg-slate-50 text-slate-500"}`}>
                      <Icon className="w-4 h-4" aria-hidden="true" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-sm truncate ${n.isRead ? "text-slate-700" : "font-semibold text-slate-900"}`}>{n.title}</span>
                        <Badge className="bg-slate-100 text-slate-500 text-[10px]">{t(`notifications.types.${n.type}`)}</Badge>
                        {!n.isRead && <span className="w-2 h-2 rounded-full bg-indigo-500 shrink-0" aria-hidden="true" />}
                      </div>
                      {n.body && <p className="text-xs text-slate-600 mt-1 line-clamp-3 whitespace-pre-line">{n.body}</p>}
                      <p className="text-[11px] text-slate-400 mt-1">
                        {format(new Date(n.createdAt), "d MMM yyyy HH:mm", { locale: trLocale })}
                        {senderName ? ` · ${t("notifications.from", { name: senderName })}` : ""}
                      </p>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
          {hasNextPage && (
            <div className="text-center">
              <Button variant="outline" disabled={isFetchingNextPage} onClick={() => fetchNextPage()} className="gap-2">
                {isFetchingNextPage && <Loader2 className="w-4 h-4 animate-spin" />} {t("notifications.loadMore")}
              </Button>
            </div>
          )}
        </>
      )}

      {/* Mesaj gönder — personel: kapsam içindeki sınıf öğrencilerine */}
      <Dialog open={composeOpen} onOpenChange={setComposeOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{t("notifications.composeTitle")}</DialogTitle></DialogHeader>
          <form onSubmit={submitMessage} className="space-y-3">
            <div>
              <Label htmlFor="nt">{t("notifications.messageTitle")}</Label>
              <Input id="nt" name="title" maxLength={200} required placeholder={t("notifications.messageTitlePlaceholder")} />
            </div>
            <div>
              <Label htmlFor="nb">{t("notifications.messageBody")}</Label>
              <Textarea id="nb" name="body" maxLength={4000} rows={4} placeholder={t("notifications.messageBodyPlaceholder")} />
            </div>
            <div>
              <div className="flex items-center justify-between">
                <Label>{t("notifications.targets")}</Label>
                <span className="text-xs text-slate-400">{pickedClassrooms.size === 0 ? t("notifications.targetsAll") : t("notifications.targetsSelected", { count: pickedClassrooms.size })}</span>
              </div>
              <div className="max-h-40 overflow-y-auto space-y-1 mt-1 border border-slate-200 rounded-lg p-2">
                {classrooms.length === 0 ? (
                  <p className="text-xs text-slate-400 p-2">{t("notifications.noClassrooms")}</p>
                ) : classrooms.map((c) => (
                  <label key={c.id} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-slate-50 cursor-pointer">
                    <input type="checkbox" checked={pickedClassrooms.has(c.id)} onChange={() => toggleClassroom(c.id)} className="rounded" />
                    <span className="text-sm">{c.name}</span>
                  </label>
                ))}
              </div>
            </div>
            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" onClick={() => setComposeOpen(false)}>{t("common.cancel")}</Button>
              <Button type="submit" disabled={send.isPending} className="bg-indigo-600 hover:bg-indigo-700 gap-2">
                {send.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} {t("notifications.send")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
