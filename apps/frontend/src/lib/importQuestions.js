/**
 * Soru içe aktarma — DOCX ve PDF ortak ayrıştırma mantığı.
 *
 * Çekirdek: `buildQuestionsFromLines` — düz metin satırlarından soru üretir.
 * Hem DOCX (yapısal liste başarısızsa) hem PDF (her zaman) bu fonksiyonu kullanır
 * → "parçalama mantığı" tek yerde, ikisinde de birebir aynı.
 *
 * Desteklenen düz-metin formatı:
 *   "1. Soru metni"  veya  "Soru: ..."   → yeni soru
 *   "A) Şık metni" ... "E) Şık"          → şıklar (A-E)
 *   "*A"  veya  "Cevap: A"               → doğru şık işareti
 *
 * Heavy lib'ler (mammoth, pdfjs-dist) dinamik import — entry bundle'a girmez.
 */
export const LETTERS = ["A", "B", "C", "D", "E"];

/** Düz metin satır dizisinden soru listesi üret (DOCX fallback + PDF ortak). */
export function buildQuestionsFromLines(lines, makeEmpty) {
  const questions = [];
  let current = null;
  for (const line of lines) {
    if (/^(soru:|\d+\s*\.)/i.test(line)) {
      if (current) questions.push(current);
      current = makeEmpty();
      current.content = line.replace(/^(soru:|\d+\s*\.\s*)/i, "").trim();
    } else if (current && /^([A-E])\s*\)\s*(.+)/.test(line)) {
      const m = line.match(/^([A-E])\s*\)\s*(.+)/);
      const idx = LETTERS.indexOf(m[1]);
      if (idx >= 0 && idx < current.options.length) {
        current.options[idx].content = m[2].trim();
      }
    } else if (current && /^\*|cevap:/i.test(line)) {
      const m = line.match(/^[*]*\s*([A-E])/i);
      if (m) {
        const idx = LETTERS.indexOf(m[1].toUpperCase());
        if (idx >= 0) {
          current.options = current.options.map((o, i) => ({ ...o, isCorrect: i === idx }));
        }
      }
    }
  }
  if (current) questions.push(current);
  return questions;
}

/** DOCX → soru. Önce yapısal <ol><li>, sonuç yoksa düz-metin satır parser'ı. */
export async function parseDocxToQuestions(file, makeEmpty) {
  const mammoth = await import("mammoth");
  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.convertToHtml({ arrayBuffer });
  const div = document.createElement("div");
  div.innerHTML = result.value;
  const questions = [];

  const topLists = Array.from(div.children).filter((el) => el.tagName === "OL" || el.tagName === "UL");
  for (const list of topLists) {
    const questionItems = Array.from(list.children).filter((el) => el.tagName === "LI");
    for (const qLi of questionItems) {
      const subList = Array.from(qLi.children).find((el) => el.tagName === "OL" || el.tagName === "UL");
      let qText;
      if (subList) {
        const clone = qLi.cloneNode(true);
        clone.querySelectorAll("ol, ul").forEach((n) => n.remove());
        qText = clone.textContent.trim();
      } else {
        qText = qLi.textContent.trim();
      }
      if (!qText) continue;
      const q = makeEmpty();
      q.content = qText;
      if (subList) {
        const optionItems = Array.from(subList.children).filter((el) => el.tagName === "LI");
        optionItems.slice(0, q.options.length).forEach((optLi, i) => {
          q.options[i].content = optLi.textContent.trim();
        });
      }
      questions.push(q);
    }
  }

  if (questions.length === 0) {
    const lines = Array.from(div.querySelectorAll("p, li"))
      .map((el) => el.textContent.trim())
      .filter((t) => t.length > 0);
    return buildQuestionsFromLines(lines, makeEmpty);
  }
  return questions;
}

/** PDF → metin satırları → aynı düz-metin parser'ı (DOCX ile birebir mantık). */
export async function parsePdfToQuestions(file, makeEmpty) {
  const pdfjs = await import("pdfjs-dist");
  // Worker'ı Vite ile bundle et (?url → ayrı chunk URL'i).
  const workerUrl = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

  const arrayBuffer = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data: arrayBuffer }).promise;
  const lines = [];

  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    // Metin parçalarını y-konumuna göre satırlara grupla (PDF'te yapısal liste yok).
    let cur = [];
    let curY = null;
    const flush = () => {
      if (cur.length) {
        const text = cur.join(" ").replace(/\s+/g, " ").trim();
        if (text) lines.push(text);
        cur = [];
      }
    };
    for (const item of content.items) {
      const y = Array.isArray(item.transform) ? Math.round(item.transform[5]) : null;
      if (curY === null) curY = y;
      else if (y !== null && Math.abs(y - curY) > 3) { flush(); curY = y; }
      if (item.str) cur.push(item.str);
      if (item.hasEOL) { flush(); curY = null; }
    }
    flush();
  }

  return buildQuestionsFromLines(lines, makeEmpty);
}
