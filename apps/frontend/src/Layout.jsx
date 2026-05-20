import { useState } from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";
import Sidebar from "@/components/layout/Sidebar";
import { Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AUTH_PAGES } from "@/lib/routeRoles";
import { ConsentBanner } from "@/components/ConsentBanner";
import { TierUpgradePrompt } from "@/components/TierUpgradePrompt";

export default function Layout({ children, currentPageName }) {
  const { user } = useAuth();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const path = (location.pathname || "").replace(/\/+$/, "") || "/";
  const isAuthPage = AUTH_PAGES.includes(currentPageName) ||
    /^\/login$/i.test(path) || /^\/register$/i.test(path);
  const isFullScreen = currentPageName === "TakeTest";

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
        <div className="min-h-screen bg-slate-50 dark:bg-gray-900">
          <div className="p-4 lg:p-8">{children}</div>
        </div>
        <ConsentBanner />
        <TierUpgradePrompt />
      </>
    );
  }

  // Giriş yok: sidebar yok (public sayfalar)
  if (!user) {
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

  // Giriş yapmış: sidebar + içerik
  return (
    <>
    <div className="min-h-screen bg-slate-50 dark:bg-gray-950 flex">
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
      <div
        id="sidebar"
        className={`
          fixed lg:static inset-y-0 left-0 z-40 transform transition-transform duration-300
          ${sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}
        `}
      >
        <Sidebar user={user} currentPage={currentPageName} />
      </div>
      <main className="flex-1 lg:ml-0 min-h-screen" id="main">
        <div className="p-6 lg:p-8">{children}</div>
      </main>
    </div>
    <ConsentBanner />
    <TierUpgradePrompt />
    </>
  );
}
