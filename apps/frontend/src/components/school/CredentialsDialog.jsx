import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Copy, KeyRound, Check } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

/**
 * Okul kullanıcısı oluşturma/şifre sıfırlama sonrası üretilen kimlik bilgilerini
 * (kullanıcı adı + geçici şifre) TEK SEFER gösterir. Şifre yalnız bu anda görünür.
 * @param {{ open:boolean, onClose:()=>void, creds:{username:string,tempPassword:string}|null, title?:string }} props
 */
export default function CredentialsDialog({ open, onClose, creds, title = "Kullanıcı Bilgileri" }) {
  const [copied, setCopied] = useState(false);
  if (!creds) return null;

  // Okul yöneticisi e-posta ile, öğrenci/öğretmen kullanıcı adı ile giriş yapar.
  const isEmail = !creds.username && !!creds.email;
  const identifier = creds.username ?? creds.email;
  const identifierLabel = isEmail ? "E-posta" : "Kullanıcı adı";

  const copyAll = async () => {
    const text = `${identifierLabel}: ${identifier}\nGeçici şifre: ${creds.tempPassword}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success("Panoya kopyalandı");
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Kopyalanamadı");
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
              <KeyRound className="h-5 w-5" aria-hidden="true" />
            </span>
            {title}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">
            Geçici şifre yalnızca şimdi görünür. Kullanıcıya güvenli şekilde iletin.
          </p>
          <div className="rounded-lg border border-slate-200 divide-y divide-slate-100">
            <div className="flex items-center justify-between px-4 py-3">
              <span className="text-sm text-slate-500">{identifierLabel}</span>
              <span className="font-mono font-semibold text-slate-900">{identifier}</span>
            </div>
            <div className="flex items-center justify-between px-4 py-3">
              <span className="text-sm text-slate-500">Geçici şifre</span>
              <span className="font-mono font-semibold text-slate-900">{creds.tempPassword}</span>
            </div>
          </div>
        </div>
        <DialogFooter className="gap-2 sm:justify-between">
          <Button variant="outline" onClick={copyAll} className="gap-2">
            {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
            Kopyala
          </Button>
          <Button onClick={onClose} className="bg-indigo-600 hover:bg-indigo-700">Tamam</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
