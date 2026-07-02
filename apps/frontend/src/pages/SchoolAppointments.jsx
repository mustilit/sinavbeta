import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { schoolAppointments } from "@/api/dalClient";
import { useAuth } from "@/lib/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CalendarClock, Plus, Trash2, AlertCircle, CheckCircle2, XCircle, ChevronLeft, ChevronRight, Loader2, CalendarCheck, Save } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { tr as trLocale } from "date-fns/locale";

const STATUS_META = {
  PENDING: { color: "bg-amber-100 text-amber-700" },
  CONFIRMED: { color: "bg-emerald-100 text-emerald-700" },
  CANCELLED: { color: "bg-slate-200 text-slate-600" },
  COMPLETED: { color: "bg-indigo-100 text-indigo-700" },
};
const PAGE_SIZE = 20;

/** E-Sınıf — Öğretmen randevu yönetimi: haftalık uygunluk + alınan randevular. */
export default function SchoolAppointments() {
  const { user } = useAuth();
  const { t } = useTranslation("school");
  const qc = useQueryClient();
  const role = user?.school?.schoolRole;
  const isTeacher = ["TEACHER", "DEPT_HEAD"].includes(role);
  const [tab, setTab] = useState("appointments"); // appointments | availability
  const [fStatus, setFStatus] = useState("ALL");
  const [fScope, setFScope] = useState("upcoming");
  const [page, setPage] = useState(1);
  // Uygunluk düzenleyici — local state; Kaydet ile tüm set sunucuya yazılır.
  const [slots, setSlots] = useState([]);
  const [dirty, setDirty] = useState(false);
  const [newDay, setNewDay] = useState("1");
  const [newStart, setNewStart] = useState("09:00");
  const [newEnd, setNewEnd] = useState("09:30");

  const DAYS = [1, 2, 3, 4, 5, 6, 0]; // Pazartesi başlangıçlı hafta

  useEffect(() => { setPage(1); }, [fStatus, fScope]);

  const { data: apptData, isLoading: apptLoading } = useQuery({
    queryKey: ["school-appointments", "teacher", fStatus, fScope, page],
    queryFn: () => schoolAppointments.teacherList({
      status: fStatus === "ALL" ? undefined : fStatus,
      scope: fScope,
      page,
      pageSize: PAGE_SIZE,
    }),
    enabled: isTeacher,
  });
  const appointments = apptData?.items ?? [];
  const total = apptData?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const { data: availData, isLoading: availLoading } = useQuery({
    queryKey: ["school-appointments", "availability"],
    queryFn: () => schoolAppointments.availability(),
    enabled: isTeacher,
  });
  useEffect(() => {
    if (availData?.slots && !dirty) setSlots(availData.slots.map((s) => ({ dayOfWeek: s.dayOfWeek, startTime: s.startTime, endTime: s.endTime })));
  }, [availData, dirty]);

  const saveAvailability = useMutation({
    mutationFn: (nextSlots) => schoolAppointments.setAvailability(nextSlots),
    onSuccess: () => {
      toast.success(t("appointments.availabilitySaved"));
      setDirty(false);
      qc.invalidateQueries({ queryKey: ["school-appointments"] });
    },
    onError: (e) => toast.error(e?.response?.data?.message ?? t("appointments.availabilitySaveFailed")),
  });
  const updateStatus = useMutation({
    mutationFn: ({ id, status }) => schoolAppointments.updateStatus(id, { status }),
    onSuccess: () => { toast.success(t("common.updated")); qc.invalidateQueries({ queryKey: ["school-appointments"] }); },
    onError: (e) => toast.error(e?.response?.data?.message ?? t("common.error")),
  });

  if (!isTeacher) {
    return (
      <div className="max-w-lg mx-auto text-center py-20">
        <AlertCircle className="w-12 h-12 mx-auto mb-3 text-slate-300" />
        <h2 className="text-xl font-semibold text-slate-900">{t("common.accessDenied")}</h2>
      </div>
    );
  }

  const addSlot = () => {
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(newStart) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(newEnd)) return toast.error(t("appointments.invalidTime"));
    if (newStart >= newEnd) return toast.error(t("appointments.invalidRange"));
    const day = Number(newDay);
    const overlaps = slots.some((s) => s.dayOfWeek === day && newStart < s.endTime && s.startTime < newEnd);
    if (overlaps) return toast.error(t("appointments.overlap"));
    setSlots((prev) => [...prev, { dayOfWeek: day, startTime: newStart, endTime: newEnd }]);
    setDirty(true);
  };
  const removeSlot = (idx) => { setSlots((prev) => prev.filter((_, i) => i !== idx)); setDirty(true); };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center"><CalendarClock className="w-5 h-5 text-indigo-600" /></div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{t("appointments.title")}</h1>
          <p className="text-sm text-slate-500">{t("appointments.teacherSubtitle")}</p>
        </div>
      </div>

      <div className="flex gap-1 border-b border-slate-200">
        {["appointments", "availability"].map((k) => (
          <button key={k} type="button" onClick={() => setTab(k)}
            className={`px-4 py-2.5 min-h-10 text-sm font-medium border-b-2 -mb-px ${tab === k ? "border-indigo-600 text-indigo-600" : "border-transparent text-slate-600 hover:text-slate-900"}`}>
            {t(`appointments.tabs.${k}`)}
          </button>
        ))}
      </div>

      {tab === "appointments" ? (
        <>
          <div className="flex flex-col sm:flex-row gap-2">
            <Select value={fScope} onValueChange={setFScope}>
              <SelectTrigger className="w-full sm:w-44" aria-label={t("appointments.scopeFilter")}><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="upcoming">{t("appointments.scopeUpcoming")}</SelectItem>
                <SelectItem value="all">{t("appointments.scopeAll")}</SelectItem>
              </SelectContent>
            </Select>
            <Select value={fStatus} onValueChange={setFStatus}>
              <SelectTrigger className="w-full sm:w-44" aria-label={t("appointments.statusFilter")}><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">{t("appointments.statusAll")}</SelectItem>
                {["PENDING", "CONFIRMED", "CANCELLED", "COMPLETED"].map((s) => (
                  <SelectItem key={s} value={s}>{t(`appointments.status.${s}`)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {apptLoading ? (
            <div className="space-y-2">{[0, 1, 2].map((i) => <div key={i} className="h-16 bg-slate-100 rounded-xl animate-pulse" />)}</div>
          ) : appointments.length === 0 ? (
            <div className="text-center py-16 text-slate-500">
              <CalendarCheck className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>{t("appointments.emptyTeacher")}</p>
            </div>
          ) : (
            <>
              <div className="space-y-2">
                {appointments.map((a) => (
                  <Card key={a.id}>
                    <CardContent className="p-4 flex items-center gap-4 flex-wrap">
                      <div className="flex-1 min-w-48">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-slate-900">{a.studentName ?? "—"}</span>
                          {a.studentClassroom && <Badge className="bg-slate-100 text-slate-600">{a.studentClassroom}</Badge>}
                          <Badge className="bg-indigo-50 text-indigo-600">{t(`appointments.types.${a.appointmentType}`)}</Badge>
                          <Badge className={STATUS_META[a.status]?.color ?? "bg-slate-100 text-slate-600"}>{t(`appointments.status.${a.status}`)}</Badge>
                        </div>
                        <p className="text-xs text-slate-500 mt-1">
                          {format(new Date(`${a.date}T00:00:00`), "d MMMM yyyy EEEE", { locale: trLocale })} · {a.startTime}–{a.endTime}
                        </p>
                        {a.notes && <p className="text-xs text-slate-600 mt-1">{t("appointments.studentNote", { note: a.notes })}</p>}
                      </div>
                      <div className="flex gap-1 shrink-0">
                        {a.status === "PENDING" && (
                          <>
                            <Button size="sm" variant="outline" className="h-8 gap-1 text-xs text-emerald-600 border-emerald-200 hover:bg-emerald-50" disabled={updateStatus.isPending} onClick={() => updateStatus.mutate({ id: a.id, status: "CONFIRMED" })}>
                              <CheckCircle2 className="w-3.5 h-3.5" /> {t("appointments.confirm")}
                            </Button>
                            <Button size="sm" variant="outline" className="h-8 gap-1 text-xs text-rose-600 border-rose-200 hover:bg-rose-50" disabled={updateStatus.isPending} onClick={() => updateStatus.mutate({ id: a.id, status: "CANCELLED" })}>
                              <XCircle className="w-3.5 h-3.5" /> {t("appointments.reject")}
                            </Button>
                          </>
                        )}
                        {a.status === "CONFIRMED" && (
                          <>
                            <Button size="sm" variant="outline" className="h-8 gap-1 text-xs text-indigo-600 border-indigo-200 hover:bg-indigo-50" disabled={updateStatus.isPending} onClick={() => updateStatus.mutate({ id: a.id, status: "COMPLETED" })}>
                              <CalendarCheck className="w-3.5 h-3.5" /> {t("appointments.complete")}
                            </Button>
                            <Button size="sm" variant="outline" className="h-8 gap-1 text-xs text-rose-600 border-rose-200 hover:bg-rose-50" disabled={updateStatus.isPending} onClick={() => updateStatus.mutate({ id: a.id, status: "CANCELLED" })}>
                              <XCircle className="w-3.5 h-3.5" /> {t("appointments.cancel")}
                            </Button>
                          </>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
              {pageCount > 1 && (
                <div className="flex items-center justify-center gap-3 pt-1">
                  <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}><ChevronLeft className="w-4 h-4" /> {t("common.prev")}</Button>
                  <span className="text-sm text-slate-500">{t("common.page", { page, total: pageCount })}</span>
                  <Button variant="outline" size="sm" disabled={page >= pageCount} onClick={() => setPage((p) => Math.min(pageCount, p + 1))}>{t("common.next")} <ChevronRight className="w-4 h-4" /></Button>
                </div>
              )}
            </>
          )}
        </>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-slate-500">{t("appointments.availabilityHint")}</p>

          {/* Yeni slot ekleme satırı */}
          <div className="flex flex-col sm:flex-row gap-2 sm:items-end rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex-1">
              <Label>{t("appointments.day")}</Label>
              <Select value={newDay} onValueChange={setNewDay}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DAYS.map((d) => <SelectItem key={d} value={String(d)}>{t(`appointments.days.${d}`)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="st">{t("appointments.startTime")}</Label>
              <Input id="st" type="time" value={newStart} onChange={(e) => setNewStart(e.target.value)} className="w-full sm:w-32" />
            </div>
            <div>
              <Label htmlFor="et">{t("appointments.endTime")}</Label>
              <Input id="et" type="time" value={newEnd} onChange={(e) => setNewEnd(e.target.value)} className="w-full sm:w-32" />
            </div>
            <Button type="button" variant="outline" className="gap-1" onClick={addSlot}><Plus className="w-4 h-4" /> {t("appointments.addSlot")}</Button>
          </div>

          {availLoading ? (
            <div className="h-32 bg-slate-100 rounded-xl animate-pulse" />
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {DAYS.map((d) => {
                const daySlots = slots
                  .map((s, idx) => ({ ...s, idx }))
                  .filter((s) => s.dayOfWeek === d)
                  .sort((a, b) => a.startTime.localeCompare(b.startTime));
                return (
                  <div key={d} className="rounded-xl border border-slate-200 bg-white p-3">
                    <h3 className="text-sm font-semibold text-slate-700 mb-2">{t(`appointments.days.${d}`)}</h3>
                    {daySlots.length === 0 ? (
                      <p className="text-xs text-slate-400">{t("appointments.noSlots")}</p>
                    ) : (
                      <ul className="space-y-1">
                        {daySlots.map((s) => (
                          <li key={s.idx} className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-2.5 py-1.5">
                            <span className="text-sm text-slate-700">{s.startTime}–{s.endTime}</span>
                            <button type="button" onClick={() => removeSlot(s.idx)} className="p-2 rounded hover:bg-rose-50 text-rose-500 min-h-10 min-w-10 flex items-center justify-center" aria-label={t("appointments.removeSlot", { day: t(`appointments.days.${d}`), time: `${s.startTime}–${s.endTime}` })}>
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          <div className="flex justify-end">
            <Button className="bg-indigo-600 hover:bg-indigo-700 gap-2" disabled={!dirty || saveAvailability.isPending} onClick={() => saveAvailability.mutate(slots)}>
              {saveAvailability.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} {t("appointments.saveAvailability")}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
