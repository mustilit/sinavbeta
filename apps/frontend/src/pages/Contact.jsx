import { useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { createPageUrl } from "@/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Mail, MapPin, ArrowLeft } from "lucide-react";
import { toast } from "sonner";

export default function Contact() {
  const { t } = useTranslation(["pages"]);
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    subject: "",
    message: ""
  });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name || !formData.email || !formData.message) {
      toast.error(t("pages:contact.toasts.missingFields"));
      return;
    }
    // E-posta format kontrolü (regex)
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email.trim())) {
      toast.error(t("pages:contact.toasts.invalidEmail"));
      return;
    }
    // Mesaj en az 12 karakter olmalı (anlamlı içerik)
    if (formData.message.trim().length < 12) {
      toast.error(t("pages:contact.toasts.messageTooShort"));
      return;
    }
    setLoading(true);
    // Simulated submission
    setTimeout(() => {
      toast.success(t("pages:contact.toasts.sent"));
      setFormData({ name: "", email: "", subject: "", message: "" });
      setLoading(false);
    }, 1000);
  };

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <Link
          to={createPageUrl("Home")}
          className="inline-flex items-center gap-2 text-slate-600 hover:text-slate-900 mb-8"
        >
          <ArrowLeft className="w-4 h-4" />
          {t("pages:contact.backToHome")}
        </Link>

        <div className="mb-12">
          <h1 className="text-4xl font-bold text-slate-900 mb-4">{t("pages:titles.contact")}</h1>
          <p className="text-lg text-slate-600">
            {t("pages:contact.subtitle")}
          </p>
        </div>

        <div className="grid lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2">
            <div className="bg-white rounded-2xl border border-slate-200 p-8">
              <h2 className="text-2xl font-bold text-slate-900 mb-6">{t("pages:contact.formTitle")}</h2>
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="grid sm:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      {t("pages:contact.nameLabel")}
                    </label>
                    <Input
                      placeholder={t("pages:contact.namePlaceholder")}
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      {t("pages:contact.emailLabel")}
                    </label>
                    <Input
                      type="email"
                      placeholder={t("pages:contact.emailPlaceholder")}
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      required
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    {t("pages:contact.subjectLabel")}
                  </label>
                  <Input
                    placeholder={t("pages:contact.subjectPlaceholder")}
                    value={formData.subject}
                    onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    {t("pages:contact.messageLabel")}
                  </label>
                  <Textarea
                    placeholder={t("pages:contact.messagePlaceholder")}
                    rows={6}
                    value={formData.message}
                    onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                    required
                    minLength={12}
                  />
                </div>
                <Button
                  type="submit"
                  disabled={loading}
                  className="w-full sm:w-auto"
                  style={{backgroundColor: '#0000CD'}}
                >
                  {loading ? t("pages:contact.sending") : t("pages:contact.sendButton")}
                </Button>
              </form>
            </div>
          </div>

          <div className="space-y-6">
            <div className="bg-white rounded-2xl border border-slate-200 p-6">
              <div className="flex items-start gap-4 mb-6">
                <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0" style={{backgroundColor: 'rgba(0, 0, 205, 0.1)'}}>
                  <Mail className="w-6 h-6" style={{color: '#0000CD'}} />
                </div>
                <div>
                  <h3 className="font-semibold text-slate-900 mb-1">{t("pages:contact.emailTitle")}</h3>
                  {/* Email addresses — brand assets, çevrilmez */}
                  <p className="text-slate-600 text-sm">info@sinavsalonu.com</p>
                  <p className="text-slate-600 text-sm">destek@sinavsalonu.com</p>
                </div>
              </div>

              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0" style={{backgroundColor: 'rgba(0, 0, 205, 0.1)'}}>
                  <MapPin className="w-6 h-6" style={{color: '#0000CD'}} />
                </div>
                <div>
                  <h3 className="font-semibold text-slate-900 mb-1">{t("pages:contact.addressTitle")}</h3>
                  <p className="text-slate-600 text-sm whitespace-pre-line">
                    {t("pages:contact.addressBody")}
                  </p>
                </div>
              </div>
            </div>


          </div>
        </div>
      </div>
    </div>
  );
}
