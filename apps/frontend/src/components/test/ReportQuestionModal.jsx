import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const reportTypes = [
  { value: "wrong_answer", label: "Doğru cevap yanlış" },
  { value: "unclear_question", label: "Soru belirsiz/anlaşılmıyor" },
  { value: "missing_option", label: "Eksik veya hatalı şık" },
  { value: "typo", label: "Yazım hatası" },
  { value: "other", label: "Diğer" }
];

export default function ReportQuestionModal({ open, onClose, onSubmit, questionNumber }) {
  const [reportType, setReportType] = useState("");
  const [description, setDescription] = useState("");

  // Backend (Objection) reason için en az 5 karakter ister; modalda da zorla ki
  // gönderim sessizce reddedilip modal açık kalmasın.
  const MIN_DESC = 5;
  const descValid = description.trim().length >= MIN_DESC;

  const handleSubmit = () => {
    if (!reportType || !descValid) return;
    onSubmit({ report_type: reportType, description });
    setReportType("");
    setDescription("");
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Soru {questionNumber} - Hata Bildir</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-4">
          <div className="space-y-2">
            <Label>Hata Türü *</Label>
            <Select value={reportType} onValueChange={setReportType}>
              <SelectTrigger>
                <SelectValue placeholder="Seçin" />
              </SelectTrigger>
              <SelectContent>
                {reportTypes.map((type) => (
                  <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          <div className="space-y-2">
            <Label>Açıklama *</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Hatayı detaylı şekilde açıklayın..."
              rows={4}
            />
            {description.trim().length > 0 && !descValid && (
              <p className="text-xs text-rose-600">Açıklama en az {MIN_DESC} karakter olmalı.</p>
            )}
          </div>

          <div className="flex gap-3 justify-end pt-4">
            <Button variant="outline" onClick={onClose}>İptal</Button>
            <Button
              onClick={handleSubmit}
              disabled={!reportType || !descValid}
              className="bg-rose-600 hover:bg-rose-700"
            >
              Bildir
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}