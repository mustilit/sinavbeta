import { useRef, useEffect, useCallback, forwardRef, useImperativeHandle } from "react";
import { cn } from "@/lib/utils";

/**
 * Soru kartı üzerine şeffaf çizim katmanı.
 * isActive=true → fare ile kalem çizgisi çekebilir
 * isActive=false → pointer-events:none, altındaki butonlar çalışır, çizgiler görünür kalır
 * ref.clear() → tüm çizgileri siler
 */
const QuestionCanvas = forwardRef(function QuestionCanvas(
  { isActive, questionId, onHasDrawings },
  ref
) {
  const canvasRef = useRef(null);
  const drawing = useRef(false);
  const last = useRef(null);

  useImperativeHandle(ref, () => ({
    clear() {
      const c = canvasRef.current;
      if (!c) return;
      c.getContext("2d").clearRect(0, 0, c.width, c.height);
      onHasDrawings?.(false);
    },
    /** Boş mu? (hiç çizilmemiş — tüm pikseller şeffaf) */
    isBlank() {
      const c = canvasRef.current;
      if (!c || !c.width || !c.height) return true;
      const data = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
      for (let i = 3; i < data.length; i += 4) if (data[i] !== 0) return false;
      return true;
    },
    /** Çizimi PNG dataURL olarak ver (boşsa null). */
    toDataURL() {
      const c = canvasRef.current;
      if (!c) return null;
      const data = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
      let blank = true;
      for (let i = 3; i < data.length; i += 4) if (data[i] !== 0) { blank = false; break; }
      return blank ? null : c.toDataURL("image/png");
    },
    /** Kayıtlı çizimi geri yükle (resume / öz-kıyas). */
    loadDataUrl(url) {
      const c = canvasRef.current;
      if (!c || !url) return;
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        const ctx = c.getContext("2d");
        ctx.clearRect(0, 0, c.width, c.height);
        ctx.drawImage(img, 0, 0, c.width, c.height);
        onHasDrawings?.(true);
      };
      img.src = url;
    },
  }));

  // Soru değişince çizgileri sıfırla
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    c.getContext("2d").clearRect(0, 0, c.width, c.height);
    onHasDrawings?.(false);
  }, [questionId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Canvas iç çözünürlüğünü container boyutuna eşitle
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const sync = () => {
      const parent = c.parentElement;
      if (!parent) return;
      // Mevcut çizimi geçici canvas'a kopyala
      const tmp = document.createElement("canvas");
      tmp.width = c.width;
      tmp.height = c.height;
      tmp.getContext("2d").drawImage(c, 0, 0);
      c.width = parent.offsetWidth;
      c.height = parent.offsetHeight;
      // Geri yükle
      c.getContext("2d").drawImage(tmp, 0, 0);
    };
    const ro = new ResizeObserver(sync);
    ro.observe(c.parentElement);
    sync();
    return () => ro.disconnect();
  }, []);

  const getXY = (e, c) => {
    const r = c.getBoundingClientRect();
    if (e.touches) {
      return { x: e.touches[0].clientX - r.left, y: e.touches[0].clientY - r.top };
    }
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const onDown = useCallback((e) => {
    if (!isActive) return;
    drawing.current = true;
    last.current = getXY(e, canvasRef.current);
  }, [isActive]);

  const onMove = useCallback((e) => {
    if (!drawing.current || !isActive) return;
    e.preventDefault();
    const c = canvasRef.current;
    const ctx = c.getContext("2d");
    const pos = getXY(e, c);
    ctx.beginPath();
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#1e40af";
    ctx.moveTo(last.current.x, last.current.y);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    last.current = pos;
    onHasDrawings?.(true);
  }, [isActive, onHasDrawings]);

  const onUp = useCallback(() => {
    drawing.current = false;
    last.current = null;
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className={cn(
        "absolute inset-0 rounded-2xl",
        isActive ? "pointer-events-auto z-10" : "pointer-events-none z-10"
      )}
      style={{ cursor: isActive ? "crosshair" : "default" }}
      onMouseDown={onDown}
      onMouseMove={onMove}
      onMouseUp={onUp}
      onMouseLeave={onUp}
      onTouchStart={onDown}
      onTouchMove={onMove}
      onTouchEnd={onUp}
    />
  );
});

export default QuestionCanvas;
