import { Suspense } from 'react';
import { ThemeProvider } from 'next-themes';
import { Toaster } from "@/components/ui/toaster"
import { Toaster as SonnerToaster } from "sonner"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import NavigationTracker from '@/lib/NavigationTracker'
import { pagesConfig } from './pages.config'
import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import { AuthRoute, ProtectedRoute } from '@/lib/RouteGuards';
import { AUTH_PAGES, isProtectedPage } from '@/lib/routeRoles';
import { ErrorBoundary } from '@/components/ErrorBoundary';

const PageFallback = () => (
  <div className="fixed inset-0 flex items-center justify-center bg-white">
    <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
  </div>
);

const { Pages, Layout, mainPage } = pagesConfig;
const mainPageKey = mainPage ?? Object.keys(Pages)[0];
const MainPage = mainPageKey ? Pages[mainPageKey] : <></>;

const LayoutWrapper = ({ children, currentPageName }) =>
  Layout ? <Layout currentPageName={currentPageName}>{children}</Layout> : <>{children}</>;

// Kök "/" — E-Sınıf kullanıcısının açılış sayfası kendi paneli/ödevleri olmalı.
// Öğrenci → Ödevlerim, okul yöneticisi/öğretmen → Okul Paneli. Marketplace
// kullanıcısı (user.school yok) eskisi gibi Ana Sayfa görür (golden rule: değişmez).
const RootRoute = () => {
  const { user } = useAuth();
  const role = user?.school?.schoolRole;
  if (role === 'STUDENT') return <Navigate to="/StudentAssignments" replace />;
  if (role) return <Navigate to="/SchoolPanel" replace />;
  return <LayoutWrapper currentPageName={mainPageKey}><MainPage /></LayoutWrapper>;
};

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError } = useAuth();

  if (isLoadingPublicSettings || isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-white">
        <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (authError) {
    if (authError.type === 'user_not_registered') {
      return <UserNotRegisteredError />;
    }
    if (authError.type === 'auth_required') {
      const from = typeof window !== 'undefined' ? window.location.pathname + window.location.search : '/';
      // stale auth → query cache'i temizle (rol değişimi/çıkış-giriş senaryosu)
      queryClientInstance.clear();
      window.location.replace('/Login' + (from && from !== '/' ? `?from=${encodeURIComponent(from)}` : ''));
      return null;
    }
  }

  const renderRoute = (pageName, Page) => {
    const content = <LayoutWrapper currentPageName={pageName}><Page /></LayoutWrapper>;
    if (AUTH_PAGES.includes(pageName)) {
      return <AuthRoute>{content}</AuthRoute>;
    }
    if (isProtectedPage(pageName)) {
      return <ProtectedRoute pageName={pageName}>{content}</ProtectedRoute>;
    }
    return content;
  };

  return (
    <Suspense fallback={<PageFallback />}>
      <Routes>
        <Route path="/" element={<RootRoute />} />
        {Object.entries(Pages).map(([path, Page]) => {
          // Dinamik parametreli sayfalar
          const paramPaths = {
            ModerationResultDetail: '/yonetim/moderasyon/sonuc/:id',
            EducatorViolationDetail: '/yonetim/moderasyon/eğitici/:id',
            // Sprint 14 — 4 yasal metin tek slug-paramlı sayfa paylaşır
            // (uyelik / kvkk / mesafeli-satis / egitici-hizmet)
            LegalDocument: '/sozlesmeler/:slug',
          };
          const routePath = paramPaths[path] || `/${path}`;
          return (
            <Route
              key={path}
              path={routePath}
              element={renderRoute(path, Page)}
            />
          );
        })}
        <Route path="*" element={<PageNotFound />} />
      </Routes>
    </Suspense>
  );
};

// defaultTheme="light": İlk ziyarette her zaman açık tema. enableSystem={false}
// olduğu için Chrome/OS koyu mod tercihine otomatik geçilmez. Kullanıcı
// sidebar'daki ThemeToggle ile manuel olarak koyu temaya geçebilir; tercih
// localStorage'da kalır. (Birçok bileşenin `dark:` varyantı eksik olduğu için
// sistem mode aktifken görüntü tutarsız oluyordu — açık temayı default yapmak
// görüntüyü preview ile birebir aynı tutuyor.)
function App() {
  // forcedTheme="light": Uygulama genelinde HER ZAMAN açık tema. Tema değişimi
  // artık global değil; yalnızca test çözüm ekranında "bej okuma modu" olarak
  // sunulur (TakeTest, data-exam-theme ile scope'lu). Diğer sayfalar etkilenmez.
  return (
    <ThemeProvider attribute="class" defaultTheme="light" forcedTheme="light" enableSystem={false} disableTransitionOnChange>
      <ErrorBoundary>
        <AuthProvider>
          <QueryClientProvider client={queryClientInstance}>
            <Router>
              <NavigationTracker />
              <AuthenticatedApp />
            </Router>
            <Toaster />
            <SonnerToaster position="top-right" richColors closeButton />
          </QueryClientProvider>
        </AuthProvider>
      </ErrorBoundary>
    </ThemeProvider>
  );
}

export default App;
