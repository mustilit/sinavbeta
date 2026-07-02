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

// Ayraç olarak ")", ".", "-" hepsi kabul edilir (1. / 1- / 1) ve A) / a- / a. ...).
const QUESTION_RE = /^(\d{1,3})\s*[).\-]\s*(.+)$/;                 // "1- 144..." | "1. ..." | "1) ..."
const QUESTION_SORU_RE = /^soru\s*[:.)\-]\s*(.+)$/i;              // "Soru: ..."
const OPTION_RE = /^([A-Ea-e])\s*[).\-]\s*(.+)$/;                 // "a- 12" | "A) 12" | "a. 12"
const ANSWER_RE = /^(?:\*\s*|cevap\s*[:.)\-]?\s*)([A-Ea-e])\b/i;  // "Cevap: a" | "Cevap A" | "*A"

/**
 * Düz metin satır dizisinden soru listesi üret (DOCX fallback + PDF ortak).
 * Esnek format: soru "1." / "1-" / "1)" / "Soru:"; şık "A)" / "a-" / "a.";
 * doğru cevap "Cevap: a" / "Cevap A" / "*A". Harf büyük/küçük fark etmez.
 */
export function buildQuestionsFromLines(lines, makeEmpty) {
  const questions = [];
  let current = null;
  for (const raw of lines) {
    const line = (raw || "").trim();
    if (!line) continue;

    const ans = line.match(ANSWER_RE);
    const opt = line.match(OPTION_RE);
    const q = line.match(QUESTION_RE);
    const qSoru = line.match(QUESTION_SORU_RE);

    if (ans && current) {
      // Önce cevap satırı: "Cevap" da harfle başladığı için şık/sorudan ÖNCE bakılır.
      const idx = LETTERS.indexOf(ans[1].toUpperCase());
      if (idx >= 0) {
        current.options = current.options.map((o, i) => ({ ...o, isCorrect: i === idx }));
      }
    } else if (opt && current) {
      const idx = LETTERS.indexOf(opt[1].toUpperCase());
      if (idx >= 0 && idx < current.options.length) {
        current.options[idx].content = opt[2].trim();
      }
    } else if (q) {
      if (current) questions.push(current);
      current = makeEmpty();
      current.content = q[2].trim();
    } else if (qSoru) {
      if (current) questions.push(current);
      current = makeEmpty();
      current.content = qSoru[1].trim();
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
        const clone = /** @type {Element} */ (qLi.cloneNode(true));
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
    for (const item of /** @type {any[]} */ (content.items)) {
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
