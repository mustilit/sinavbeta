import { useState } from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";
import Sidebar from "@/components/layout/Sidebar";
import PublicHeader from "@/components/layout/PublicHeader";
import PublicFooter from "@/components/layout/PublicFooter";
import { Menu, X, ChevronLeft, ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { AUTH_PAGES } from "@/lib/routeRoles";
import { ConsentBanner } from "@/components/ConsentBanner";
import { TierUpgradePrompt } from "@/components/TierUpgradePrompt";

export default function Layout({ children, currentPageName }) {
  const { user } = useAuth();
  const location = useLocation();
  const { t } = useTranslation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  // Desktop accordion: kullanıcı sidebar'ı sola katlayabilir; default açık.
  // localStorage'da kalıcı — sonraki ziyarette de tercih hatırlanır.
  const [desktopCollapsed, setDesktopCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;
    try { return localStorage.getItem("sidebarCollapsed") === "true"; } catch { return false; }
  });
  const toggleDesktopSidebar = () => {
    setDesktopCollapsed((prev) => {
      const next = !prev;
      try { localStorage.setItem("sidebarCollapsed", String(next)); } catch {}
      return next;
    });
  };

  const path = (location.pathname || "").replace(/\/+$/, "") || "/";
  const isAuthPage = AUTH_PAGES.includes(currentPageName) ||
    /^\/login$/i.test(path) || /^\/register$/i.test(path);
  // Tam ekran sayfalar: sidebar tamamen gizlenir.
  // Soru çözme + canlı test host ekranı + zorunlu onboarding adımları.
  // NOT: LiveSessionJoin bilinçli olarak burada DEĞİL — aday koda girmeden önce
  // soldaki menüde gezinebilsin diye kod giriş ekranında sidebar görünür kalır.
  // Aday bekleme odasına alındığında veya test başladığında sayfanın KENDİSİ
  // tam ekran overlay'e geçer (LiveSessionJoin.jsx → FullscreenStage).
  const FULLSCREEN_PAGES = [
    "TakeTest",
    "TakeTunnel",
    "LiveSessionHost",
    "EducatorOnboarding", // CV + uzmanlık alanı tamamlanana kadar başka yere gidemez
    "SelectExamTypes",    // Aday onboarding'i — ilgi alanı seçilene kadar
    "CompleteProfile",    // Profil tamamlama
  ];
  const isFullScreen = FULLSCREEN_PAGES.includes(currentPageName);

  // Login/Register: sadece içerik, sidebar yok
  if (isAuthPage) {
    return (
      <>
        <div className="min-h-screen bg-white dark:bg-gray-950">
          {children}
        </div>
        <ConsentBanner />
        <TierUpgradePrompt />
      </>
    );
  }

  // Tam ekran (TakeTest vb.): sidebar yok, padding var
  if (isFullScreen) {
    return (
      <>
        <div className="min-h-screen bg-slate-50 dark:bg-gray-900" data-fullscreen>
          <div className="p-4 lg:p-8">{children}</div>
        </div>
        <ConsentBanner />
        <TierUpgradePrompt />
      </>
    );
  }

  // Giriş yok: sidebar yok ama paylaşılan PublicHeader (sticky) + PublicFooter tüm public sayfalarda.
  // Footer içeriği uzun olabileceğinden, ana içeriği esnek tutmak için flex sütun yapısı kullanıyoruz.
  if (!user) {
    return (
      <>
        <div className="min-h-screen bg-white dark:bg-gray-950 flex flex-col">
          <PublicHeader />
          <main className="flex-1">{children}</main>
          <PublicFooter />
        </div>
        <ConsentBanner />
        <TierUpgradePrompt />
      </>
    );
  }

  // Giriş yapmış: sidebar + içerik
  return (
    <>
    <div className="min-h-screen bg-slate-50 dark:bg-gray-950 flex">
      {/* Mobil hamburger — lg altında görünür */}
      <Button
        variant="ghost"
        size="icon"
        aria-label={sidebarOpen ? "Menüyü kapat" : "Menüyü aç"}
        aria-expanded={sidebarOpen}
        aria-controls="sidebar"
        className="fixed top-4 left-4 z-50 lg:hidden"
        onClick={() => setSidebarOpen(!sidebarOpen)}
      >
        {sidebarOpen ? <X className="w-6 h-6" aria-hidden="true" /> : <Menu className="w-6 h-6" aria-hidden="true" />}
      </Button>
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          aria-hidden="true"
          onClick={() => setSidebarOpen(false)}
        />
      )}
      {/*
        Sidebar wrapper:
        - Mobile (default): fixed + slide animation (sidebarOpen state). Mobilde
          her zaman tam genişlik açılır — `collapsed` rail-mode'u sadece lg+'da
          devreye girer.
        - Desktop (lg+): sticky top-0 + h-screen → scroll'da sabit kalır,
          sayfayla aşağı kaymaz.
        - Desktop collapsed: rail mode (lg:w-20) — sadece ikonlar görünür,
          tıklanan ikon hover'da etiket başlığı (`title`) gösterir.
      */}
      <div
        id="sidebar"
        className={`
          fixed lg:sticky lg:top-0 lg:h-screen lg:self-start
          inset-y-0 left-0 z-40 transform transition-transform duration-300
          ${sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}
        `}
      >
        <Sidebar
          user={user}
          currentPage={currentPageName}
          collapsed={desktopCollapsed}
        />
        {/* Rail toggle — yan menünün sağ kenarında dikey orta, ince ok handle'ı.
            Sadece lg+ ekranlarda görünür; tıklayınca rail/expanded geçişini yapar. */}
        <button
          type="button"
          onClick={toggleDesktopSidebar}
          aria-label={desktopCollapsed ? t("sidebar.expandAria") : t("sidebar.collapseAria")}
          title={desktopCollapsed ? t("sidebar.expandAria") : t("sidebar.collapseAria")}
          className="hidden lg:flex absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 z-50
                     items-center justify-center w-5 h-12
                     bg-white dark:bg-gray-900
                     border border-slate-200 dark:border-gray-700 rounded-full
                     text-slate-400 hover:text-indigo-600 dark:text-gray-500 dark:hover:text-indigo-400
                     hover:bg-slate-50 dark:hover:bg-gray-800 transition-colors shadow-sm
                     focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300"
        >
          {desktopCollapsed
            ? <ChevronRight className="w-3 h-3" aria-hidden="true" />
            : <ChevronLeft className="w-3 h-3" aria-hidden="true" />}
        </button>
      </div>
      <main className="flex-1 lg:ml-0 min-h-screen flex flex-col" id="main">
        <div className="flex-1 p-6 lg:p-8">{children}</div>
        {/* Footer login sonrası da içeriğin altında kalır (Sidebar'ın yanında, ana sütunun tam genişliğinde). */}
        <PublicFooter />
      </main>
    </div>
    <ConsentBanner />
    <TierUpgradePrompt />
    </>
  );
}
