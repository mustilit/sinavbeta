/**
 * components/ui/*.jsx için yanına .d.ts üretir (typecheck amaçlı, runtime etkisi yok).
 *
 * Neden: ui primitive'leri tipsiz JS (shadcn tarzı). checkJs modunda TS bu
 * bileşenlerin prop'larını `{}` çıkarsıyor ve HER kullanımda (variant/size/
 * className...) binlerce yanlış-pozitif TS2322/TS2559/TS2741 üretiyordu.
 * ui klasörü zaten typecheck kapsamı dışı (jsconfig exclude) — bu .d.ts'ler
 * export'ları `any` olarak bildirip tüketici sayfaların denetimini temiz bırakır.
 *
 * Kullanım: node scripts/generate-ui-dts.mjs
 * Yeni ui bileşeni eklendiğinde veya export listesi değiştiğinde yeniden çalıştır
 * (eksik export, tüketen dosyada TS2305 "has no exported member" olarak görünür).
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const UI_DIR = join(dirname(fileURLToPath(import.meta.url)), '../src/components/ui');

const files = readdirSync(UI_DIR).filter((f) => f.endsWith('.jsx') && !f.includes('.test.'));
let generated = 0;

for (const file of files) {
  const src = readFileSync(join(UI_DIR, file), 'utf8');
  const names = new Set();
  let hasDefault = false;

  // export { A, B as C, ... }  (çok satırlı olabilir)
  for (const m of src.matchAll(/export\s*\{([\s\S]*?)\}/g)) {
    for (const part of m[1].split(',')) {
      const p = part.trim();
      if (!p) continue;
      if (p === 'default' || p.endsWith(' as default')) { hasDefault = true; continue; }
      const asMatch = p.match(/^\S+\s+as\s+(\S+)$/);
      names.add(asMatch ? asMatch[1] : p);
    }
  }
  // export const/function/let/var X
  for (const m of src.matchAll(/export\s+(?:const|function|let|var)\s+([A-Za-z0-9_$]+)/g)) {
    names.add(m[1]);
  }
  if (/export\s+default\s/.test(src)) hasDefault = true;

  if (!names.size && !hasDefault) continue;

  const lines = ['// AUTO-GENERATED — scripts/generate-ui-dts.mjs (elle düzenleme; yeniden üret)'];
  for (const n of [...names].sort()) lines.push(`export declare const ${n}: any;`);
  if (hasDefault) {
    lines.push('declare const _default: any;');
    lines.push('export default _default;');
  }
  writeFileSync(join(UI_DIR, file.replace(/\.jsx$/, '.d.ts')), lines.join('\n') + '\n');
  generated++;
}

console.log(`ui .d.ts üretildi: ${generated}/${files.length} dosya`);
