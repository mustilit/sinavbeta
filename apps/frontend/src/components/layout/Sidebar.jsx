import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/AuthContext";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
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
  PowerOff,
  Server,
  FileText,
  ShieldX,
  Shield,
} from "lucide-react";

export default function Sidebar({ user, currentPage }) {
  const { logout } = useAuth();
  const role = (user?.role || '').toString().toUpperCase();
  const isEducator = role === "EDUCATOR";
  const isApprovedEducator = isEducator && (user?.status === "ACTIVE" || user?.educatorApprovedAt);
  const isAdmin = role === "ADMIN";
  const isWorker = role === "WORKER";

  const candidateLinks = [
    { name: "Ana Sayfa", page: "Home", icon: Home },
    { name: "Testleri Keşfet", page: "Explore", icon: Search },
    { name: "Satın Alınan Testler", page: "MyTests", icon: BookOpen },
    { name: "Performans Raporları", page: "MyResults", icon: BarChart3 },
    // Konu bazlı performans raporu — zamana bağlı konu analizi
    { name: "Konu Performansım", page: "MyTopicReport", icon: BookOpen },
    { name: "Profil Ayarları", page: "ProfileSettings", icon: User },
  ];

  const educatorLinks = isApprovedEducator ? [
    { name: "Dashboard", page: "EducatorDashboard", icon: Home },
    { name: "Test Paketlerim", page: "MyTestPackages", icon: BookOpen },
    { name: "Yeni Test Oluştur", page: "CreateTest", icon: Plus },
    { name: "Satışlarım", page: "MySales", icon: ShoppingBag },
    { name: "İndirim Kodları", page: "MyDiscountCodes", icon: Award },
    // Reklam yönetimi: eğiticinin öne çıkarma satın alması ve gösterim takibi
    { name: "Reklamlarım", page: "MyAds", icon: Megaphone },
    { name: "Canlı Testlerim", page: "MyLiveSessions", icon: Zap },
    { name: "İade Talepleri", page: "EducatorRefunds", icon: RefreshCw },
    { name: "Hata Bildirimleri", page: "QuestionReports", icon: Settings },
    { name: "Profil Ayarları", page: "EducatorSettings", icon: User },
    { name: "İçerik Durumum", page: "MyModerationStatus", icon: Shield },
  ] : [
    { name: "Profil Ayarları", page: "EducatorSettings", icon: User },
  ];

  const adminLinks = [
    { name: "Yönetim Paneli", page: "AdminDashboard", icon: Settings },
    { name: "Aday Raporu", page: "AdminCandidateReport", icon: Users },
    { name: "Eğitici Raporu", page: "AdminEducatorReport", icon: GraduationCap },
    { name: "Sınav Türleri", page: "ManageExamTypes", icon: Award },
    { name: "Soru Konuları", page: "ManageTopics", icon: BookOpen },
    { name: "Kullanıcılar", page: "ManageUsers", icon: Users },
    { name: "Tüm Testler", page: "ManageTests", icon: BookOpen },
    { name: "İade Talepleri", page: "ManageRefunds", icon: ShoppingBag },
    { name: "Hata Bildirimleri", page: "AdminObjections", icon: AlertTriangle },
    { name: "Komisyon Raporu", page: "AdminCommissionReport", icon: Banknote },
    // Reklam satın alım raporu — eğiticilerin öne çıkarma aktivitesini gösterir
    { name: "Reklam Raporu", page: "AdminAdReport", icon: Megaphone },
    { name: "Sistem Kontrolleri", page: "AdminSystemControls", icon: ShieldAlert },
    { name: "Canlı Test Paketleri", page: "ManageLiveTiers", icon: Zap },
    // ── Mail Yönetimi (6 alt modül tek sayfada sekmeli) ───────────────
    { name: "Mail Yönetimi", page: "EmailManagement", icon: Mail },
    // ── İçerik Moderasyonu (4 alt modül tek sayfada sekmeli) ──────────
    { name: "Riskli İçerik", page: "RiskyContent", icon: ShieldAlert },
  ];

  // Worker: yalnızca kendisine atanan admin sayfaları
  const workerPages = Array.isArray(user?.workerPages) ? user.workerPages : [];
  const workerLinks = adminLinks.filter(link => link.page && workerPages.includes(link.page));

  let links = candidateLinks;
  if (isAdmin) {
    links = [...adminLinks, { divider: true }, ...candidateLinks];
  } else if (isWorker) {
    links = workerLinks;
  } else if (isEducator) {
    links = [
      ...educatorLinks,
      ...(isApprovedEducator ? [] : [
        { divider: true },
        {
          name: "⚠️ Hesap Onayı Bekleniyor",
          page: "EducatorSettings",
          icon: Settings,
          isPending: true
        }
      ])
    ];
  }

  const handleLogout = () => logout(true);

  return (
    <aside className="w-64 bg-white dark:bg-gray-900 border-r border-slate-200 dark:border-gray-800 min-h-screen flex flex-col">
      <div className="p-6 border-b border-slate-100 dark:border-gray-800">
        <Link to={createPageUrl("Home")} className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-indigo-600 to-indigo-500 rounded-xl flex items-center justify-center">
            <GraduationCap className="w-6 h-6 text-white" />
          </div>
          <span className="text-xl font-bold text-slate-900 dark:text-gray-50">Sınav Salonu</span>
        </Link>
      </div>

      <nav className="flex-1 p-4" aria-label="Ana navigasyon">
        <ul className="space-y-1">
          {links.map((link, idx) =>
            link.divider ? (
              <li key={idx} className="my-4 border-t border-slate-200 dark:border-gray-700" />
            ) : (
              <li key={link.page}>
                <Link
                  to={createPageUrl(link.page)}
                  className={cn(
                    "flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all",
                    currentPage === link.page
                      ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300"
                      : "text-slate-600 hover:bg-slate-50 hover:text-slate-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100"
                  )}
                >
                  <link.icon className="w-5 h-5 shrink-0" aria-hidden="true" />
                  {link.name}
                </Link>
              </li>
            )
          )}
        </ul>
      </nav>

      <div className="p-4 border-t border-slate-100 dark:border-gray-800 space-y-1">
        {/* Tema değiştirici */}
        <div className="flex items-center justify-between px-4 py-2">
          <span className="text-xs font-medium text-slate-500 dark:text-gray-500">Tema</span>
          <ThemeToggle />
        </div>

        {/* Kullanıcı bilgisi */}
        <div className="flex items-center gap-3 px-4 py-3">
          <div className="w-10 h-10 bg-gradient-to-br from-slate-100 to-slate-200 dark:from-gray-700 dark:to-gray-600 rounded-full flex items-center justify-center shrink-0">
            <span className="text-sm font-semibold text-slate-600 dark:text-gray-200">
              {(user?.full_name || user?.username || "?")[0]?.toUpperCase()}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-slate-900 dark:text-gray-100 truncate">{user?.full_name || user?.username}</p>
            <p className="text-xs text-slate-500 dark:text-gray-500 truncate">
              {isAdmin ? "Yönetici" : isWorker ? "Çalışan" : isEducator ? "Eğitici" : "Aday"}
            </p>
          </div>
        </div>

        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-slate-600 dark:text-gray-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-900/20 dark:hover:text-rose-400 transition-all"
        >
          <LogOut className="w-5 h-5" aria-hidden="true" />
          Çıkış Yap
        </button>
      </div>
    </aside>
  );
}
