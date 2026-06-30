/**
 * reportPdf — Bir DOM düğümünü görünür haliyle yakalayıp çok sayfalı A4 PDF üretir.
 * "Filtreli ekranda ne varsa" — rapor sayfalarının o anki (filtrelenmiş) halini PDF'e döker.
 *
 * html2canvas + jsPDF lazy import edilir (ikisi de ağır; yalnız PDF tıklanınca yüklenir).
 * PDF'e girmesini istemediğin öğeleri `data-html2canvas-ignore="true"` ile işaretle
 * (örn. PDF/Excel butonları). Çok uzun içerik A4 sayfalarına dilimlenir.
 *
 * @param {HTMLElement} node Yakalanacak kök düğüm
 * @param {{ fileName?: string }} [opts]
 */
export async function exportElementToPdf(node, { fileName = "rapor.pdf" } = {}) {
  if (!node) return;
  const html2canvas = (await import("html2canvas")).default;
  const { jsPDF } = await import("jspdf");

  const canvas = await html2canvas(node, {
    backgroundColor: "#ffffff",
    scale: 2,
    useCORS: true,
    logging: false,
  });

  const pdf = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const margin = 24;
  const usableW = pageW - margin * 2;
  const usableH = pageH - margin * 2;

  // canvas px → pt ölçeği (genişliğe sığdır) + sayfa başına düşen canvas px yüksekliği
  const pxPerPt = canvas.width / usableW;
  const pageContentPx = usableH * pxPerPt;

  let renderedPx = 0;
  let first = true;
  while (renderedPx < canvas.height) {
    const sliceH = Math.min(pageContentPx, canvas.height - renderedPx);
    const pageCanvas = document.createElement("canvas");
    pageCanvas.width = canvas.width;
    pageCanvas.height = Math.ceil(sliceH);
    const cctx = pageCanvas.getContext("2d");
    cctx.fillStyle = "#ffffff";
    cctx.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
    cctx.drawImage(canvas, 0, renderedPx, canvas.width, sliceH, 0, 0, canvas.width, sliceH);

    if (!first) pdf.addPage();
    pdf.addImage(pageCanvas.toDataURL("image/png"), "PNG", margin, margin, usableW, sliceH / pxPerPt);
    renderedPx += sliceH;
    first = false;
  }

  pdf.save(fileName);
}
