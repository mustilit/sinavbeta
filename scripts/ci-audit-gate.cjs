#!/usr/bin/env node
/**
 * CI bağımlılık denetim kapısı (npm audit allowlist gate).
 *
 * `npm audit --audit-level=high` ham haliyle, fix'i major/no-fix olan bilinen
 * açıklarda CI'yı kalıcı kırmızıya çevirir. Bu script yalnızca **allowlist DIŞI**
 * high/critical açıklarda exit 1 verir; böylece:
 *   - YENİ bir high/critical eklenirse CI yine kırılır (gate canlı kalır),
 *   - bilinçli kabul edilen (gerekçeli + reviewBy'lı) residual'lar geçer.
 *
 * Allowlist: çalışılan app dizininde `.audit-allowlist.json`
 *   { "allow": [ { "id": "GHSA-...", "package": "...", "reason": "...", "reviewBy": "YYYY-MM-DD" } ] }
 *
 * Çalıştırma: app dizininde `node ../../scripts/ci-audit-gate.cjs`
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const allowPath = path.join(process.cwd(), '.audit-allowlist.json');
const allowDoc = fs.existsSync(allowPath) ? JSON.parse(fs.readFileSync(allowPath, 'utf8')) : { allow: [] };
const allowed = new Set((allowDoc.allow || []).map((a) => a.id));

// npm audit açık varken non-zero döner → stdout'u yine de yakala
let raw = '';
try {
  raw = execSync('npm audit --json', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
} catch (e) {
  raw = e.stdout ? e.stdout.toString() : '';
}
let report;
try {
  report = JSON.parse(raw);
} catch {
  console.error('ci-audit-gate: npm audit --json çıktısı parse edilemedi');
  process.exit(2);
}

const vulns = report.vulnerabilities || {};
const blocking = new Set();
const accepted = new Set();
const usedAllow = new Set();

for (const name of Object.keys(vulns)) {
  const v = vulns[name];
  if (v.severity !== 'high' && v.severity !== 'critical') continue;
  for (const via of v.via || []) {
    if (typeof via !== 'object' || !via.url) continue;
    const id = via.url.split('/').pop();
    const line = `${v.severity.toUpperCase()} ${via.name || name} ${id} — ${(via.title || '').slice(0, 70)}`;
    if (allowed.has(id)) {
      accepted.add(`${via.name || name} ${id}`);
      usedAllow.add(id);
    } else {
      blocking.add(line);
    }
  }
}

console.log(`ci-audit-gate: ${accepted.size} allowlisted, ${blocking.size} blocking`);

// Artık geçerli olmayan (çözülmüş) allowlist kayıtları → temizlenmeli (uyarı, kırmaz)
const stale = [...allowed].filter((id) => !usedAllow.has(id));
if (stale.length) {
  console.log(`  not: ${stale.length} allowlist kaydı artık tetiklenmiyor (çözülmüş olabilir, temizlenebilir): ${stale.join(', ')}`);
}

if (blocking.size) {
  console.error('\nBLOCKING — allowlist dışı high/critical açık:');
  [...blocking].forEach((b) => console.error('  - ' + b));
  console.error('\nGerçekten düzeltilemiyorsa .audit-allowlist.json içine gerekçe + reviewBy ile ekleyin.');
  process.exit(1);
}
console.log('OK — allowlist dışı high/critical yok.');
