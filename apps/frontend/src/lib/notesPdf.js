/**
 * notesPdf — Kullanıcı notlarını PDF olarak dışa aktarır.
 *
 * Türkçe karakter güvenliği için notlar gizli bir HTML kabına basılıp html2canvas
 * ile görüntüye çevrilir, ardından jsPDF ile çok sayfalı A4 PDF üretilir (jsPDF'in
 * varsayılan fontu ç/ş/ğ/ı/ö/ü'yü bozardı). Her iki kütüphane de lazy import edilir.
 *
 * Girdi: { items: Array<{id,body,testTitle?,questionOrder?,questionExcerpt?,createdAt}>,
 *          title?: string, subtitle?: string, fileName?: string }
 */
const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function noteCardHtml(n) {
  const date = (() => { try { return new Date(n.createdAt).toLocaleString("tr-TR"); } catch { return ""; } })();
  const scope = n.questionOrder ? `Soru ${esc(n.questionOrder)}` : "Genel";
  const head = [n.testTitle ? `<strong style="color:#4338ca">${esc(n.testTitle)}</strong>` : "", `<span style="color:#475569">${scope}</span>`, `<span style="color:#94a3b8">${esc(date)}</span>`]
    .filter(Boolean).join(' <span style="color:#cbd5e1">·</span> ');
  const excerpt = n.questionExcerpt ? `<div style="font-size:11px;color:#94a3b8;font-style:italic;margin:2px 0 4px">“${esc(n.questionExcerpt)}”</div>` : "";
  return `<div style="border:1px solid #e2e8f0;border-radius:10px;padding:10px 12px;margin-bottom:8px;page-break-inside:avoid">
    <div style="font-size:11px;margin-bottom:2px;word-break:break-word;overflow-wrap:anywhere">${head}</div>${excerpt}
    <div style="font-size:13px;white-space:pre-wrap;line-height:1.5;word-break:break-word;overflow-wrap:anywhere">${esc(n.body)}</div>
  </div>`;
}

/**
 * Tüm notları sayfa sayfa toplar (liste pageSize üst sınırı 100). Export "tüm notlar"
 * için kullanılır; verilen filtrelere uyan kayıtları biriktirir.
 * @param {(params:object)=>Promise<{items:Array,total:number}>} listFn
 * @param {object} baseParams page/pageSize HARİÇ filtreler
 */
export async function collectAllNotes(listFn, baseParams = {}) {
  const pageSize = 100;
  let page = 1;
  let total = Infinity;
  const out = [];
  while (out.length < total && page <= 200) {
    const res = await listFn({ ...baseParams, page, pageSize });
    const items = res?.items ?? [];
    out.push(...items);
    total = typeof res?.total === "number" ? res.total : out.length;
    if (items.length < pageSize) break;
    page += 1;
  }
  return out;
}

export async function exportNotesPdf(/** @type {any} */ { items = [], title = "Notlarım", subtitle = "", fileName } = {}) {
  const [{ default: jsPDF }, html2canvasMod] = await Promise.all([import("jspdf"), import("html2canvas")]);
  const html2canvas = html2canvasMod.default;

  const container = document.createElement("div");
  container.style.cssText = "position:fixed;left:-99999px;top:0;width:794px;padding:32px;background:#ffffff;font-family:Arial,Helvetica,sans-serif;color:#0f172a;";
  container.innerHTML =
    `<h1 style="font-size:22px;margin:0 0 4px">${esc(title)}</h1>` +
    `<p style="font-size:12px;color:#64748b;margin:0 0 16px">${[esc(subtitle), new Date().toLocaleString("tr-TR")].filter(Boolean).join(" · ")}</p>` +
    (items.length ? items.map(noteCardHtml).join("") : `<p style="color:#94a3b8">Not yok.</p>`);
  document.body.appendChild(container);

  try {
    const canvas = await html2canvas(container, { scale: 2, backgroundColor: "#ffffff", windowWidth: 794 });
    const pdf = new jsPDF({ unit: "pt", format: "a4" });
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const imgH = (canvas.height * pageW) / canvas.width;
    const img = canvas.toDataURL("image/png");
    let heightLeft = imgH;
    let position = 0;
    pdf.addImage(img, "PNG", 0, position, pageW, imgH);
    heightLeft -= pageH;
    while (heightLeft > 0) {
      position -= pageH;
      pdf.addPage();
      pdf.addImage(img, "PNG", 0, position, pageW, imgH);
      heightLeft -= pageH;
    }
    pdf.save(fileName || `notlarim-${new Date().toISOString().slice(0, 10)}.pdf`);
  } finally {
    document.body.removeChild(container);
  }
}
