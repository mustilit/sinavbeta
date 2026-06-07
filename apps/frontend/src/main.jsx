// Sentry must be initialized before React
import * as Sentry from '@sentry/react';

if (import.meta.env.VITE_SENTRY_DSN) {
  Sentry.init({
    dsn: import.meta.env.VITE_SENTRY_DSN,
    environment: import.meta.env.MODE,
    integrations: [Sentry.browserTracingIntegration()],
    // Production'da %10 örnekleme — daha fazlası ücret patlatır
    tracesSampleRate: 0.1,
    // PII gönderme (varsayılan false ama açıkça belirtelim)
    sendDefaultPii: false,
  });
}

import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'
import './lib/i18n';              // side-effect: i18next init
import { initAnalytics } from './lib/analytics';
import { setupPwa } from './lib/pwa';
import { setupChunkErrorRecovery } from './lib/chunkReload';

// Tema migration: eski sürümlerde defaultTheme="system" idi; bazı bileşenlerin
// dark: varyantları eksik olduğundan tutarsız görünüm oluyordu. Yeni ayar
// "light" default + sistem temasını otomatik takip etmeme yönündedir. Eski
// kullanıcıların localStorage'unda 'system' değeri varsa onu temizleyerek
// yeni default'a (light) düşmesini sağlıyoruz. Kullanıcı toggle ile koyu
// temaya geçtiyse ('dark' kayıtlıysa) tercihi korunur.
try {
  if (typeof window !== 'undefined' && localStorage.getItem('theme') === 'system') {
    localStorage.removeItem('theme');
  }
} catch { /* sessiz */ }

initAnalytics();
// Deploy sonrası / geçici ağ hatasında eski lazy-route chunk'ı indirilemezse
// tek-sefer otomatik reload (kullanıcı "Bir şeyler ters gitti" ekranını görmez).
setupChunkErrorRecovery();
// Sprint 11 #3 — Service worker + offline shell. Dev'de devOptions.enabled=false
// olduğundan virtual modül noop döner; prod build'de aktif.
setupPwa();

ReactDOM.createRoot(document.getElementById('root')).render(
  <App />
)
