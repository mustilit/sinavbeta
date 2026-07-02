/**
 * lint-staged config — Sınav Salonu monorepo.
 *
 * Function form kullanılır çünkü:
 *   - Backend/Frontend tsc tüm projeyi kontrol eder (staged dosya argümanı kabul etmez)
 *   - Frontend ESLint relative path'i kendi tsconfig'inden çözümler
 *   - Windows + monorepo'da `cd subdir &&` güvensiz
 *
 * Hook'u atlamak için: git commit --no-verify (önerilmez).
 *
 * Frontend typecheck (checkJs) 2026-07'ye kadar burada YOKTU — bu yüzden
 * `npm run typecheck` sessizce 4266 hataya çıkmıştı, hiç kimse fark etmedi.
 * Artık backend ile simetrik: staged .js/.jsx varsa tam proje typecheck de
 * çalışır. Detay: `.claude/skills/frontend-typecheck/SKILL.md`.
 */

const path = require('path');

module.exports = {
  // Backend TS dosyaları staged ise → tüm backend project'i tsc --noEmit
  // (tek dosya bağlam izolasyonu yapmak monorepo'da risk; full check güvenli).
  'apps/backend/**/*.ts': () => [
    'npm --prefix apps/backend run typecheck',
  ],

  // Frontend JS/JSX staged ise → cross-platform Node script ile ESLint --fix
  // (Windows cmd.exe `cd subdir &&` formatını yanlış yorumluyordu; Git Bash + cmd
  // farklı davranır). scripts/lint-staged-frontend.js cwd'yi process.chdir ile
  // bağımsız ayarlar. Ardından tüm frontend project'i checkJs typecheck (tek
  // dosya argümanı kabul etmez; backend'deki full-check pattern'iyle simetrik).
  'apps/frontend/**/*.{js,jsx}': (files) => {
    if (files.length === 0) return [];
    const args = files.map((f) => `"${f}"`).join(' ');
    return [
      `node scripts/lint-staged-frontend.js ${args}`,
      'npm --prefix apps/frontend run typecheck',
    ];
  },
};
