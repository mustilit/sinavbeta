import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { school as schoolApi } from "@/api/dalClient";
import { useAuth } from "@/lib/AuthContext";
import { createPageUrl } from "@/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Users, Building2, BookOpen, Radio, ChevronRight, GraduationCap, AlertCircle } from "lucide-react";

const ADMIN_ROLES = ["SCHOOL_ADMIN", "BRANCH_ADMIN"];
const TEACHER_ROLES = ["TEACHER", "DEPT_HEAD"];

const ROLE_LABEL = {
  SCHOOL_ADMIN: "Okul Yöneticisi",
  BRANCH_ADMIN: "Şube Yöneticisi",
  DEPT_HEAD: "Zümre Başkanı",
  TEACHER: "Öğretmen",
  STUDENT: "Öğrenci",
};

/** E-Sınıf okul paneli — okul yöneticisi/şube yöneticisi için özet + kota + hızlı erişim. */
export default function SchoolPanel() {
  const { user } = useAuth();
  const ctx = user?.school;
  const isManager = ADMIN_ROLES.includes(ctx?.schoolRole);

  const { data: quota } = useQuery({
    queryKey: ["esinif", "quota"],
    queryFn: schoolApi.quota,
    enabled: isManager,
  });

  if (!ctx?.schoolRole) {
    return (
      <div className="max-w-lg mx-auto text-center py-20">
        <AlertCircle className="w-12 h-12 mx-auto mb-3 text-slate-300" />
        <h2 className="text-xl font-semibold text-slate-900">Erişim yok</h2>
        <p className="text-slate-500 mt-2">Bu sayfa yalnızca E-Sınıf kullanıcıları içindir.</p>
      </div>
    );
  }

  const isTeacher = TEACHER_ROLES.includes(ctx.schoolRole);

  if (isTeacher) {
    return (
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center"><GraduationCap className="w-5 h-5 text-indigo-600" /></div>
          <div><h1 className="text-2xl font-bold text-slate-900">{ctx.schoolName}</h1><p className="text-sm text-slate-500">{ROLE_LABEL[ctx.schoolRole]} paneli</p></div>
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <Link to={createPageUrl("SchoolExamPool")} className="group">
            <Card className="hover:shadow-lg hover:shadow-slate-200/60 transition-all">
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <div className="w-11 h-11 rounded-xl bg-slate-50 flex items-center justify-center"><BookOpen className="w-5 h-5 text-indigo-600" /></div>
                  <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-indigo-500" />
                </div>
                <p className="font-semibold text-slate-900 mt-3">Sınav Havuzu</p>
                <p className="text-sm text-slate-500">Test, Tünel ve Yazılı sınav oluştur</p>
              </CardContent>
            </Card>
          </Link>
        </div>
        <p className="text-sm text-slate-400">Ödev atama ve sonuç raporları yakında bu panele eklenecek.</p>
      </div>
    );
  }

  if (!isManager) {
    return (
      <div className="max-w-lg mx-auto text-center py-20">
        <GraduationCap className="w-12 h-12 mx-auto mb-3 text-indigo-300" />
        <h2 className="text-xl font-semibold text-slate-900">Merhaba, {ROLE_LABEL[ctx.schoolRole]}</h2>
        <p className="text-slate-500 mt-2">{ctx.schoolName} · Modülünüz (ödev/sınav) yakında bu panele eklenecek.</p>
      </div>
    );
  }

  const cards = [
    { to: "SchoolUsers", icon: Users, label: "Kullanıcılar", desc: "Öğretmen ve öğrenci yönetimi" },
    { to: "SchoolBranches", icon: Building2, label: "Şubeler & Sınıflar", desc: "Şube ve sınıf düzeni" },
    { to: "SchoolDepartments", icon: BookOpen, label: "Zümreler", desc: "Zümre ve öğretmen atama" },
  ];

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center"><GraduationCap className="w-5 h-5 text-indigo-600" /></div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{ctx.schoolName}</h1>
          <p className="text-sm text-slate-500">{ROLE_LABEL[ctx.schoolRole]} paneli</p>
        </div>
      </div>

      {/* Kota özeti */}
      <div className="grid sm:grid-cols-2 gap-4">
        <Card>
          <CardContent className="p-5 flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-indigo-50 flex items-center justify-center"><Users className="w-6 h-6 text-indigo-600" /></div>
            <div>
              <p className="text-2xl font-bold text-slate-900">{quota ? `${quota.usedUsers}/${quota.maxUsers || "∞"}` : "…"}</p>
              <p className="text-sm text-slate-500">Kullanıcı kotası{quota?.maxUsers ? ` · ${quota.remainingUsers} kalan` : ""}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5 flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-amber-50 flex items-center justify-center"><Radio className="w-6 h-6 text-amber-600" /></div>
            <div>
              <p className="text-2xl font-bold text-slate-900">{quota ? `${quota.usedLiveCount}/${quota.annualLiveLimit || "∞"}` : "…"}</p>
              <p className="text-sm text-slate-500">Yıllık canlı sınav{quota?.annualLiveLimit ? ` · ${quota.remainingLive} kalan` : ""}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Hızlı erişim */}
      <div className="grid sm:grid-cols-3 gap-4">
        {cards.map(({ to, icon: Icon, label, desc }) => (
          <Link key={to} to={createPageUrl(to)} className="group">
            <Card className="hover:shadow-lg hover:shadow-slate-200/60 transition-all">
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <div className="w-11 h-11 rounded-xl bg-slate-50 flex items-center justify-center"><Icon className="w-5 h-5 text-indigo-600" /></div>
                  <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-indigo-500" />
                </div>
                <p className="font-semibold text-slate-900 mt-3">{label}</p>
                <p className="text-sm text-slate-500">{desc}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
