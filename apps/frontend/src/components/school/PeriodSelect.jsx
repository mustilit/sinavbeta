import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { school as schoolApi } from "@/api/dalClient";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

/**
 * E-Sınıf dönem (akademik dönem) seçici.
 * Dönemsel sayfalarda (Ödevler/Raporlar/Canlı/Öğrenciler) kullanılır.
 * Varsayılan: okulun güncel dönemi. Geçmiş dönemler arşiv için seçilebilir.
 *
 * props:
 *   value    — seçili periodId (string | "")
 *   onChange — (periodId) => void
 *   className
 */
export function PeriodSelect({ value, onChange, className = "w-48" }) {
  const { data } = useQuery({ queryKey: ["esinif", "periods"], queryFn: () => schoolApi.periods() });
  const periods = data?.periods ?? [];
  const currentPeriodId = data?.currentPeriodId ?? null;

  // İlk yüklemede seçim yoksa güncel döneme kilitle.
  useEffect(() => {
    if (!value && currentPeriodId) onChange?.(currentPeriodId);
  }, [value, currentPeriodId, onChange]);

  // Tek dönem varsa dropdown göstermeye gerek yok.
  if (periods.length <= 1) return null;

  return (
    <Select value={value || currentPeriodId || ""} onValueChange={onChange}>
      <SelectTrigger className={className}><SelectValue placeholder="Dönem" /></SelectTrigger>
      <SelectContent>
        {periods.map((p) => (
          <SelectItem key={p.id} value={p.id}>
            {p.name}{p.id === currentPeriodId ? " (Güncel)" : ""}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
