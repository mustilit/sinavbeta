import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { createPageUrl } from "@/utils";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/AuthContext";
import { LanguageSwitcherCompact } from "@/components/layout/LanguageSwitcherCompact";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Home,
  Search,
  BookOpen,
  BarChart3,
  Plus,
  Settings,
  Users,
  ShoppingBag,
  GraduationCap,
  Briefcase,
  LogOut,
  Award,
  User,
  AlertTriangle,
  Banknote,
  ShieldAlert,
  Megaphone,
  RefreshCw,
  Zap,
  Mail,
  Shield,
  Target,
  Database,
  History,
  FileText,
  StickyNote,
  Layers,
  BookMarked,
  Compass,
  ShieldCheck,
} from "lucide-react";

/**
 * Sidebar — yan menü.
 *
 * `collapsed=true` iken **rail mode**: lg+ ekranlarda dar bir kolon olarak
 * kalır, sadece ikonlar görünür (etiketler `lg:hidden` ile gizlenir, hover'da
 * `title` ile görünür). Mobilde ise (`lg` altında) her zaman tam genişlik —
 * kullanıcı hamburger ile açtığında menüyü etiketleriyle görür.
 */
/**
 * RailLabel — Rail mode'da (sidebar daralmış) ikon hover'ında sağdan açılan
 * beyaz tooltip etiketi. `enabled=false` ise children'ı doğrudan render eder.
 *
 * Radix Tooltip Portal kullanır → aside'ın overflow clip'lemesini bypass eder.
 * sideOffset=12 ile ikon ile etiket arasında 12px boşluk kalır (rail genişliği
 * lg:w-20 = 80px, icon 40px → etiket sidebar dışında belirir).
 *
 * Light + dark mode'a uygun beyaz arka plan + ince border + shadow.
 */
function RailLabel({ label, enabled, children }) {
  if (!enabled) return children;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent
        side="right"
        sideOffset={12}
        className={cn(
          "bg-white text-slate-900 border border-slate-200 shadow-md",
          "dark:bg-gray-900 dark:text-gray-100 dark:border-gray-700",
          "px-3 py-1.5 text-sm font-medium",
        )}
      >
        {label}
      </TooltipContent>
    </Tooltip>
  );
}

export default function Sidebar({ user, currentPage, collapsed = false }) {
  const { t } = useTranslation();
  const { logout } = useAuth();
  const role = (user?.role || '').toString().toUpperCase();
  const isEducator = role === "EDUCATOR";
  const isApprovedEducator = isEducator && (user?.status === "ACTIVE" || user?.educatorApprovedAt);
  const isAdmin = role === "ADMIN";
  const isWorker = role === "WORKER";

  const candidateLinks = [
    { name: t("sidebar.candidate.home"), page: "Home", icon: Home },
    { name: t("sidebar.candidate.explore"), page: "Explore", icon: Search },
    { name: t("sidebar.candidate.myTests"), page: "MyTests", icon: BookOpen },
    // Canlı teste kod ile katılım — eğiticinin paylaştığı joinCode'u girip katılır.
    // E-posta davetindeki link de buraya (/LiveSessionJoin?code=...) gelir.
    { name: t("sidebar.candidate.joinLive"), page: "LiveSessionJoin", icon: Zap },
    // Eğitici vitrini — aday eğiticileri keşfeder, profil ve paketlerine gider.
    { name: t("sidebar.candidate.educators"), page: "Educators", icon: Briefcase },
    { name: t("sidebar.candidate.myResults"), page: "MyResults", icon: BarChart3 },
    // Konu Performansım — BookOpen (MyTests) ile çakışıyordu; Target ikonu
    // "konu hâkimiyeti / hedef tutturma" semantiğine de uyuyor
    { name: t("sidebar.candidate.myTopicReport"), page: "MyTopicReport", icon: Target },
    // Tüneller artık Keşfet + Satın Aldıklarım sayfalarında sekme olarak sunulur (ayrı menü yok).
    { name: t("sidebar.candidate.myObjections"), page: "MyObjections", icon: AlertTriangle },
    { name: t("sidebar.candidate.myNotes"), page: "MyNotes", icon: StickyNote },
    { name: t("sidebar.candidate.profileSettings"), page: "ProfileSettings", icon: User },
  ];

  const educatorLinks = isApprovedEducator ? [
    { name: t("sidebar.educator.dashboard"), page: "EducatorDashboard", icon: Home },
    { name: t("sidebar.educator.myTestPackages"), page: "MyTestPackages", icon: BookOpen },
    { name: t("sidebar.educator.createTest"), page: "CreateTest", icon: Plus },
    { name: t("sidebar.educator.myTunnels"), page: "ManageTunnels", icon: Layers },
    { name: t("sidebar.educator.myWrittenTests"), page: "ManageWrittenTests", icon: FileText },
    { name: t("sidebar.educator.mySales"), page: "MySales", icon: ShoppingBag },
    { name: t("sidebar.educator.myDiscountCodes"), page: "MyDiscountCodes", icon: Award },
    { name: t("sidebar.educator.myAds"), page: "MyAds", icon: Megaphone },
    { name: t("sidebar.educator.myLiveSessions"), page: "MyLiveSessions", icon: Zap },
    { name: t("sidebar.educator.refunds"), page: "EducatorRefunds", icon: RefreshCw },
    { name: t("sidebar.educator.questionReports"), page: "QuestionReports", icon: Settings },
    { name: t("sidebar.educator.moderationStatus"), page: "MyModerationStatus", icon: Shield },
    // Profil Ayarları her zaman en altta — sık erişilen iş eylemlerinden sonra
    { name: t("sidebar.educator.settings"), page: "EducatorSettings", icon: User },
  ] : [
    { name: t("sidebar.educator.settings"), page: "EducatorSettings", icon: User },
  ];

  const adminLinks = [
    { name: t("sidebar.admin.dashboard"), page: "AdminDashboard", icon: Settings },
    { name: t("sidebar.admin.candidateReport"), page: "AdminCandidateReport", icon: Users },
    { name: t("sidebar.admin.educatorReport"), page: "AdminEducatorReport", icon: GraduationCap },
    // İçerik Yönetimi: Sınav Türleri + Soru Konuları tek sayfada iki sekme.
    // Eski /ManageExamTypes ve /ManageTopics route'ları çalışmaya devam eder.
    { name: t("sidebar.admin.contentManagement"), page: "ContentManagement", icon: BookOpen },
    { name: t("sidebar.admin.users"), page: "ManageUsers", icon: Users },
    { name: t("sidebar.admin.userActivity"), page: "AdminUserActivity", icon: History },
    { name: t("sidebar.admin.tests"), page: "ManageTests", icon: BookOpen },
    { name: t("sidebar.admin.discountCodes"), page: "MyDiscountCodes", icon: Award },
    { name: t("sidebar.admin.claims"), page: "AdminClaims", icon: ShoppingBag },
    { name: t("sidebar.admin.revenue"), page: "AdminRevenue", icon: Banknote },
    { name: t("sidebar.admin.systemControls"), page: "AdminSystemControls", icon: ShieldAlert },
    { name: t("sidebar.admin.tunnelApprovals"), page: "AdminTunnels", icon: ShieldCheck },
    // Paket Yönetimi: Canlı Test + Reklam paketleri tek sayfada iki sekme.
    // Eski /ManageLiveTiers ve /AdminAdPackages route'ları çalışmaya devam eder
    // (deep-link / bookmark backward compatibility).
    { name: t("sidebar.admin.packagesManagement"), page: "ManagePackages", icon: Megaphone },
    { name: t("sidebar.admin.emailManagement"), page: "EmailManagement", icon: Mail },
    { name: t("sidebar.admin.riskyContent"), page: "RiskyContent", icon: ShieldAlert },
    { name: t("sidebar.admin.contracts"), page: "ManageContracts", icon: FileText },
    { name: t("sidebar.admin.backup"), page: "BackupManagement", icon: Database },
    { name: t("sidebar.admin.schools", { defaultValue: "E-Sınıf Okulları" }), page: "AdminSchools", icon: GraduationCap },
  ];

  // E-Sınıf menüleri (User.role=CANDIDATE; bağlam user.school'da)
  const schoolCtx = user?.school;
  const isSchoolManager = ["SCHOOL_ADMIN", "BRANCH_ADMIN"].includes(schoolCtx?.schoolRole);
  const isSchoolTeacher = ["TEACHER", "DEPT_HEAD"].includes(schoolCtx?.schoolRole);
  const schoolLinks = [
    { name: t("sidebar.esinif.panel", { defaultValue: "Okul Paneli" }), page: "SchoolPanel", icon: Home },
    { name: t("sidebar.esinif.users", { defaultValue: "Kullanıcılar" }), page: "SchoolUsers", icon: Users },
    { name: t("sidebar.esinif.branches", { defaultValue: "Şubeler & Sınıflar" }), page: "SchoolBranches", icon: BookOpen },
    { name: t("sidebar.esinif.departments", { defaultValue: "Zümreler" }), page: "SchoolDepartments", icon: Layers },
    { name: t("sidebar.esinif.subjects", { defaultValue: "Dersler" }), page: "SchoolSubjects", icon: BookMarked },
    { name: t("sidebar.esinif.reports", { defaultValue: "Raporlar" }), page: "SchoolReports", icon: BarChart3 },
  ];
  const teacherLinks = [
    { name: t("sidebar.esinif.panel", { defaultValue: "Okul Paneli" }), page: "SchoolPanel", icon: Home },
    // Seviye sorumlusu / sınıf öğretmeni / zümre başkanı yetki alanı kadar yapıyı görür
    ...(schoolCtx?.canViewStructure ? [
      { name: t("sidebar.esinif.branches", { defaultValue: "Şubeler & Sınıflar" }), page: "SchoolBranches", icon: BookMarked },
      { name: t("sidebar.esinif.departments", { defaultValue: "Zümreler" }), page: "SchoolDepartments", icon: Layers },
    ] : []),
    { name: t("sidebar.esinif.examPool", { defaultValue: "Sınav Havuzu" }), page: "SchoolExamPool", icon: BookOpen },
    { name: t("sidebar.esinif.assignments", { defaultValue: "Ödevler" }), page: "SchoolAssignments", icon: Layers },
    ...(schoolCtx?.canViewStructure ? [{ name: t("sidebar.esinif.reports", { defaultValue: "Raporlar" }), page: "SchoolReports", icon: BarChart3 }] : []),
    { name: t("sidebar.esinif.live", { defaultValue: "Canlı Sınav" }), page: "SchoolLive", icon: Zap },
  ];
  const isSchoolStudent = schoolCtx?.schoolRole === "STUDENT";
  const studentLinks = [
    { name: t("sidebar.esinif.explore", { defaultValue: "Keşfet" }), page: "StudentExplore", icon: Compass },
    { name: t("sidebar.esinif.myAssignments", { defaultValue: "Ödevlerim" }), page: "StudentAssignments", icon: BookOpen },
    { name: t("sidebar.esinif.myReports", { defaultValue: "Raporlarım" }), page: "StudentReports", icon: BarChart3 },
    { name: t("sidebar.esinif.joinLive", { defaultValue: "Canlı Sınava Katıl" }), page: "StudentLive", icon: Zap },
  ];

  const workerPages = Array.isArray(user?.workerPages) ? user.workerPages : [];
  const workerLinks = adminLinks.filter(link => link.page && workerPages.includes(link.page));

  let links = candidateLinks;
  if (isAdmin) {
    links = [...adminLinks, { divider: true }, ...candidateLinks];
  } else if (isSchoolManager) {
    // Okul yöneticisi marketplace menüsü görmez — yalnız E-Sınıf menüsü
    links = schoolLinks;
  } else if (isSchoolTeacher) {
    // Öğretmen/zümre başkanı — panel + sınav havuzu + ödevler
    links = teacherLinks;
  } else if (isSchoolStudent) {
    // Öğrenci — ödevlerim
    links = studentLinks;
  } else if (schoolCtx?.schoolRole) {
    links = [schoolLinks[0]];
  } else if (isWorker) {
    links = workerLinks;
  } else if (isEducator) {
    links = [
      ...educatorLinks,
      ...(isApprovedEducator ? [] : [
        { divider: true },
        {
          name: t("sidebar.pendingApproval"),
          page: "EducatorSettings",
          icon: Settings,
          isPending: true
        }
      ])
    ];
  }

  const SCHOOL_ROLE_LABEL = {
    SCHOOL_ADMIN: t("sidebar.esinif.roleSchoolAdmin", { defaultValue: "Okul Yöneticisi" }),
    BRANCH_ADMIN: t("sidebar.esinif.roleBranchAdmin", { defaultValue: "Şube Yöneticisi" }),
    DEPT_HEAD: t("sidebar.esinif.roleDeptHead", { defaultValue: "Zümre Başkanı" }),
    TEACHER: t("sidebar.esinif.roleTeacher", { defaultValue: "Öğretmen" }),
    STUDENT: t("sidebar.esinif.roleStudent", { defaultValue: "Öğrenci" }),
  };
  const roleLabel = schoolCtx?.schoolRole
    ? SCHOOL_ROLE_LABEL[schoolCtx.schoolRole]
    : isAdmin
    ? t("roles.admin")
    : isWorker
    ? t("roles.worker")
    : isEducator
    ? t("roles.educator")
    : t("roles.candidate");

  const handleLogout = () => logout(true);

  // Rail-mode yardımcısı: `collapsed` true ise lg+ ekranlarda `lg:hidden`
  // (yani mobilde her zaman görünür). String'i template literal'a koyduğunda
  // Tailwind regexini bozmaması için ayrı utility.
  const labelHidden = collapsed ? "lg:hidden" : "";

  return (
    <TooltipProvider delayDuration={300} skipDelayDuration={500}>
    <aside
      className={cn(
        "w-64 bg-white dark:bg-gray-900 border-r border-slate-200 dark:border-gray-800",
        "h-screen lg:h-screen flex flex-col overflow-y-auto",
        "transition-[width] duration-200",
        collapsed && "lg:w-20",
      )}
    >
      {/* Header: marka — collapse toggle artık Layout'taki dış kenar handle'ında */}
      <div
        className={cn(
          "border-b border-slate-100 dark:border-gray-800",
          collapsed
            ? "p-3 lg:px-2 lg:py-4 flex items-center gap-2 lg:justify-center"
            : "p-6 flex items-center gap-2",
        )}
      >
        <RailLabel label={t("sidebar.brandName")} enabled={collapsed}>
          <Link
            to={createPageUrl("Home")}
            className={cn(
              "flex items-center min-w-0",
              collapsed ? "gap-3 lg:gap-0 lg:justify-center" : "gap-3",
            )}
            aria-label={t("sidebar.brandName")}
          >
            <div className="w-10 h-10 bg-gradient-to-br from-indigo-600 to-indigo-500 rounded-xl flex items-center justify-center shrink-0">
              <GraduationCap className="w-6 h-6 text-white" />
            </div>
            <span className={cn("text-xl font-bold text-slate-900 dark:text-gray-50 truncate", labelHidden)}>
              {t("sidebar.brandName")}
            </span>
          </Link>
        </RailLabel>
      </div>

      {/* Nav */}
      <nav className={cn("flex-1", collapsed ? "p-3 lg:p-2" : "p-4")} aria-label={t("sidebar.ariaNav")}>
        <ul className="space-y-1">
          {links.map((link, idx) =>
            link.divider ? (
              <li key={idx} className="my-4 border-t border-slate-200 dark:border-gray-700" />
            ) : (
              <li key={link.page}>
                <RailLabel label={link.name} enabled={collapsed}>
                  <Link
                    to={createPageUrl(link.page)}
                    aria-label={collapsed ? link.name : undefined}
                    className={cn(
                      "flex items-center rounded-xl text-sm font-medium transition-all",
                      "gap-3 px-4 py-3",
                      collapsed && "lg:gap-0 lg:justify-center lg:px-3",
                      currentPage === link.page
                        ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300"
                        : "text-slate-600 hover:bg-slate-50 hover:text-slate-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100"
                    )}
                  >
                    <link.icon className="w-5 h-5 shrink-0" aria-hidden="true" />
                    <span className={labelHidden}>{link.name}</span>
                  </Link>
                </RailLabel>
              </li>
            )
          )}
        </ul>
      </nav>

      {/* Footer: tema + dil + kullanıcı + çıkış */}
      <div
        className={cn(
          "border-t border-slate-100 dark:border-gray-800 space-y-1",
          collapsed ? "p-3 lg:p-2" : "p-4",
        )}
      >
        {/* Dil (tema değişimi artık global değil — yalnız test çözüm ekranında) */}
        <div
          className={cn(
            "flex items-center gap-2 px-4 py-2",
            collapsed && "lg:flex-col lg:items-center lg:px-0 lg:gap-2",
          )}
        >
          <LanguageSwitcherCompact />
        </div>

        {/* Kullanıcı bilgisi */}
        <div
          className={cn(
            "flex items-center gap-3 px-4 py-3",
            collapsed && "lg:gap-0 lg:justify-center lg:px-0",
          )}
          title={collapsed ? (user?.full_name || user?.username) : undefined}
        >
          {(user?.profile_image_url || user?.metadata?.profile_image_url) ? (
            <img
              src={user.profile_image_url || user.metadata.profile_image_url}
              alt={user?.full_name || user?.username || t("sidebar.profileAlt")}
              className="w-10 h-10 rounded-full object-cover shrink-0 border border-slate-200 dark:border-gray-700"
            />
          ) : isAdmin ? (
            <div
              className="w-10 h-10 bg-gradient-to-br from-indigo-600 to-indigo-500 rounded-full flex items-center justify-center shrink-0"
              title={t("sidebar.brandName")}
            >
              <GraduationCap className="w-6 h-6 text-white" aria-hidden="true" />
            </div>
          ) : (
            <div className="w-10 h-10 bg-gradient-to-br from-slate-100 to-slate-200 dark:from-gray-700 dark:to-gray-600 rounded-full flex items-center justify-center shrink-0">
              <span className="text-sm font-semibold text-slate-600 dark:text-gray-200">
                {(user?.full_name || user?.username || "?")[0]?.toUpperCase()}
              </span>
            </div>
          )}
          <div className={cn("flex-1 min-w-0", labelHidden)}>
            {/* user.full_name / user.username user-generated — çevrilmez */}
            <p className="text-sm font-medium text-slate-900 dark:text-gray-100 truncate">{user?.full_name || user?.username}</p>
            <p className="text-xs text-slate-500 dark:text-gray-500 truncate">{roleLabel}</p>
          </div>
        </div>

        <RailLabel label={t("navigation.logout")} enabled={collapsed}>
          <button
            onClick={handleLogout}
            aria-label={collapsed ? t("navigation.logout") : undefined}
            className={cn(
              "w-full flex items-center rounded-xl text-sm font-medium transition-all",
              "gap-3 px-4 py-3",
              "text-slate-600 dark:text-gray-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-900/20 dark:hover:text-rose-400",
              collapsed && "lg:gap-0 lg:justify-center lg:px-3",
            )}
          >
            <LogOut className="w-5 h-5 shrink-0" aria-hidden="true" />
            <span className={labelHidden}>{t("navigation.logout")}</span>
          </button>
        </RailLabel>
      </div>
    </aside>
    </TooltipProvider>
  );
}
