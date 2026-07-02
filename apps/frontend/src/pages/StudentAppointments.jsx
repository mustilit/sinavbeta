import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { schoolAppointments } from "@/api/dalClient";
import { useAuth } from "@/lib/AuthContext";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { CalendarClock, AlertCircle, XCircle, CalendarCheck, Loader2, User } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { tr as trLocale } from "date-fns/locale";

const STATUS_META = {
  PENDING: { color: "bg-amber-100 text-amber-700" },
  CONFIRMED: { color: "bg-emerald-100 text-emerald-700" },
  CANCELLED: { color: "bg-slate-200 text-slate-600" },
  COMPLETED: { color: "bg-indigo-100 text-indigo-700" },
};
const APPT_TYPES = ["ACADEMIC", "COUNSELING", "PARENT", "OTHER"];

/** E-Sınıf — Öğrenci randevu: öğretmen seç → uygun slotu seç → tür + not ile rezervasyon. */
export default function StudentAppointments() {
  const { user } = useAuth();
  const { t } = useTranslation("school");
  const qc = useQueryClient();
  const isStudent = user?.school?.schoolRole === "STUDENT";
  const [tab, setTab] = useState("book"); // book | mine
  const [teacherId, setTeacherId] = useState("");
  const [pickedSlot, setPickedSlot] = useState(null); // { availabilityId, date, startTime, endTime }
  const [apptType, setApptType] = useState("ACADEMIC");

  const { data: teachersData, isLoading: teachersLoading } = useQuery({
    queryKey: ["school-appointments", "teachers"],
    queryFn: () => schoolAppointments.teachers(),
    enabled: isStudent,
  });
  const teachers = teachersData?.teachers ?? [];

  const { data: slotsData, isLoading: slotsLoading } = useQuery({
    queryKey: ["school-appointments", "slots", teacherId],
    queryFn: () => schoolAppointments.slots(teacherId, { days: 14 }),
    enabled: isStudent && !!teacherId,
  });
  const days = slotsData?.days ?? [];

  const { data: mineData, isLoading: mineLoading } = useQuery({
    queryKey: ["school-appointments", "mine"],
    queryFn: () => schoolAppointments.mine(),
    enabled: isStudent,
  });
  const myAppointments = mineData?.items ?? [];

  const book = useMutation({
    mutationFn: (/** @type {any} */ body) => schoolAppointments.book(body),
    onSuccess: () => {
      toast.success(t("appointments.booked"));
      setPickedSlot(null);
      qc.invalidateQueries({ queryKey: ["school-appointments"] });
    },
    onError: (e) => {
      const code = e?.response?.data?.code;
      toast.error(code === "SLOT_TAKEN" ? t("appointments.slotTaken") : e?.response?.data?.message ?? t("common.error"));
      qc.invalidateQueries({ queryKey: ["school-appointments", "slots"] });
    },
  });
  const cancel = useMutation({
    mutationFn: (/** @type {any} */ id) => schoolAppointments.cancel(id),
    onSuccess: () => { toast.success(t("appointments.cancelled")); qc.invalidateQueries({ queryKey: ["school-appointments"] }); },
    onError: (e) => toast.error(e?.response?.data?.message ?? t("common.error")),
  });

  if (!isStudent) {
    return (
      <div className="max-w-lg mx-auto text-center py-20">
        <AlertCircle className="w-12 h-12 mx-auto mb-3 text-slate-300" />
        <h2 className="text-xl font-semibold text-slate-900">{t("common.accessDenied")}</h2>
      </div>
    );
  }

  const submitBooking = (e) => {
    e.preventDefault();
    if (!pickedSlot) return;
    const f = new FormData(e.currentTarget);
    book.mutate({
      availabilityId: pickedSlot.availabilityId,
      date: pickedSlot.date,
      appointmentType: apptType,
      notes: (f.get("notes") ?? "").toString().trim() || undefined,
    });
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center"><CalendarClock className="w-5 h-5 text-indigo-600" /></div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{t("appointments.title")}</h1>
          <p className="text-sm text-slate-500">{t("appointments.studentSubtitle")}</p>
        </div>
      </div>

      <div className="flex gap-1 border-b border-slate-200">
        {["book", "mine"].map((k) => (
          <button key={k} type="button" onClick={() => setTab(k)}
            className={`px-4 py-2.5 min-h-10 text-sm font-medium border-b-2 -mb-px ${tab === k ? "border-indigo-600 text-indigo-600" : "border-transparent text-slate-600 hover:text-slate-900"}`}>
            {t(`appointments.tabs.${k}`)}
          </button>
        ))}
      </div>

      {tab === "book" ? (
        <div className="space-y-4">
          <div>
            <Label>{t("appointments.pickTeacher")}</Label>
            {teachersLoading ? (
              <div className="h-10 bg-slate-100 rounded-lg animate-pulse mt-1" />
            ) : teachers.length === 0 ? (
              <p className="text-sm text-slate-500 mt-2">{t("appointments.noTeachers")}</p>
            ) : (
              <Select value={teacherId} onValueChange={setTeacherId}>
                <SelectTrigger className="mt-1"><SelectValue placeholder={t("appointments.teacherPlaceholder")} /></SelectTrigger>
                <SelectContent>
                  {teachers.map((th) => (
                    <SelectItem key={th.userId} value={th.userId}>
                      {th.name}{th.subject ? ` · ${th.subject}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {teacherId && (
            slotsLoading ? (
              <div className="space-y-2">{[0, 1].map((i) => <div key={i} className="h-20 bg-slate-100 rounded-xl animate-pulse" />)}</div>
            ) : days.length === 0 ? (
              <div className="text-center py-12 text-slate-500">
                <CalendarCheck className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p>{t("appointments.noSlotsAvailable")}</p>
              </div>
            ) : (
              <div className="space-y-3">
                {days.map((d) => (
                  <div key={d.date} className="rounded-xl border border-slate-200 bg-white p-4">
                    <h3 className="text-sm font-semibold text-slate-700 mb-2">
                      {format(new Date(`${d.date}T00:00:00`), "d MMMM yyyy EEEE", { locale: trLocale })}
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      {d.slots.map((s) => (
                        <button
                          key={`${s.availabilityId}-${d.date}`}
                          type="button"
                          disabled={s.booked}
                          onClick={() => setPickedSlot({ availabilityId: s.availabilityId, date: d.date, startTime: s.startTime, endTime: s.endTime })}
                          className={`px-3 py-2 min-h-10 rounded-lg text-sm font-medium border transition-colors ${
                            s.mine
                              ? "border-emerald-300 bg-emerald-50 text-emerald-700 cursor-default"
                              : s.booked
                              ? "border-slate-200 bg-slate-100 text-slate-400 cursor-not-allowed line-through"
                              : "border-indigo-200 bg-indigo-50/50 text-indigo-700 hover:bg-indigo-100"
                          }`}
                          aria-label={s.booked ? t("appointments.slotBookedAria", { time: s.startTime }) : t("appointments.slotPickAria", { time: s.startTime })}
                        >
                          {s.startTime}–{s.endTime}{s.mine ? ` · ${t("appointments.yours")}` : ""}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )
          )}
        </div>
      ) : (
        mineLoading ? (
          <div className="space-y-2">{[0, 1].map((i) => <div key={i} className="h-16 bg-slate-100 rounded-xl animate-pulse" />)}</div>
        ) : myAppointments.length === 0 ? (
          <div className="text-center py-16 text-slate-500">
            <CalendarCheck className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p>{t("appointments.emptyMine")}</p>
          </div>
        ) : (
          <div className="space-y-2">
            {myAppointments.map((a) => {
              const cancellable = a.status === "PENDING" || a.status === "CONFIRMED";
              return (
                <Card key={a.id}>
                  <CardContent className="p-4 flex items-center gap-4 flex-wrap">
                    <div className="flex-1 min-w-48">
                      <div className="flex items-center gap-2 flex-wrap">
                        <User className="w-4 h-4 text-slate-400" aria-hidden="true" />
                        <span className="font-medium text-slate-900">{a.teacherName ?? "—"}</span>
                        <Badge className="bg-indigo-50 text-indigo-600">{t(`appointments.types.${a.appointmentType}`)}</Badge>
                        <Badge className={STATUS_META[a.status]?.color ?? "bg-slate-100 text-slate-600"}>{t(`appointments.status.${a.status}`)}</Badge>
                      </div>
                      <p className="text-xs text-slate-500 mt-1">
                        {format(new Date(`${a.date}T00:00:00`), "d MMMM yyyy EEEE", { locale: trLocale })} · {a.startTime}–{a.endTime}
                      </p>
                      {a.teacherNotes && <p className="text-xs text-slate-600 mt-1">{t("appointments.teacherNote", { note: a.teacherNotes })}</p>}
                    </div>
                    {cancellable && (
                      <Button size="sm" variant="outline" className="h-8 gap-1 text-xs text-rose-600 border-rose-200 hover:bg-rose-50" disabled={cancel.isPending} onClick={() => cancel.mutate(a.id)}>
                        <XCircle className="w-3.5 h-3.5" /> {t("appointments.cancel")}
                      </Button>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )
      )}

      {/* Rezervasyon onay dialog'u — tür + not */}
      <Dialog open={!!pickedSlot} onOpenChange={(v) => { if (!v) setPickedSlot(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{t("appointments.bookTitle")}</DialogTitle></DialogHeader>
          {pickedSlot && (
            <form onSubmit={submitBooking} className="space-y-3">
              <p className="text-sm text-slate-600">
                {format(new Date(`${pickedSlot.date}T00:00:00`), "d MMMM yyyy EEEE", { locale: trLocale })} · {pickedSlot.startTime}–{pickedSlot.endTime}
              </p>
              <div>
                <Label>{t("appointments.type")}</Label>
                <Select value={apptType} onValueChange={setApptType}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {APPT_TYPES.map((k) => <SelectItem key={k} value={k}>{t(`appointments.types.${k}`)}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="an">{t("appointments.note")}</Label>
                <Textarea id="an" name="notes" maxLength={500} rows={3} placeholder={t("appointments.notePlaceholder")} />
              </div>
              <DialogFooter className="gap-2">
                <Button type="button" variant="outline" onClick={() => setPickedSlot(null)}>{t("common.cancel")}</Button>
                <Button type="submit" disabled={book.isPending} className="bg-indigo-600 hover:bg-indigo-700 gap-2">
                  {book.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <CalendarCheck className="w-4 h-4" />} {t("appointments.book")}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
