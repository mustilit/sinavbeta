import { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { entities, auth } from "@/api/dalClient";
import api from "@/lib/api/apiClient";
import { useAuth } from "@/lib/AuthContext";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import SensitiveProfileOtpDialog from "@/components/settings/SensitiveProfileOtpDialog";
import { toast } from "sonner";
import { User, Save, Globe, Linkedin, Phone, MapPin, FileText, Upload, CheckCircle, GraduationCap, ShieldCheck, Bell, Award, Camera, CreditCard, Building2, Loader2 } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { useQuery } from "@tanstack/react-query";

function resizeImageToBase64(file, maxPx = 256) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = (ev) => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        const scale = Math.min(maxPx / img.width, maxPx / img.height, 1);
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.85));
      };
      img.src = String(ev.target.result);
    };
    reader.readAsDataURL(file);
  });
}

export default function EducatorSettings() {
  const { t } = useTranslation(["pages"]);
  const { user, checkAppState } = useAuth();
  const [initialFormData, setInitialFormData] = useState(null);
  const [formData, setFormData] = useState({
    education: "",
    bio: "",
    phone: "",
    city: "",
    website: "",
    linkedin: "",
    google_scholar_url: "",
    cv_url: "",
    profile_image_url: "",
    specialized_exam_types: [],
    notification_preferences: {
      email_new_tests: true,
      email_promotions: true,
      email_educator_updates: true,
      email_test_reminders: true
    },
    iban: "",
    bankName: "",
    accountHolder: "",
  });
  const [uploadingCV, setUploadingCV] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const queryClient = useQueryClient();

  const hasChanges = initialFormData && JSON.stringify(formData) !== JSON.stringify(initialFormData);

  const { data: examTypes = [] } = useQuery({
    queryKey: ["examTypes"],
    queryFn: () => entities.ExamType.filter({ is_active: true }),
  });

  useEffect(() => {
    if (!user) return;
    const initialData = {
      education: user.education || "",
      bio: user.bio || "",
      phone: user.phone || "",
      city: user.city || "",
      website: user.website || "",
      linkedin: user.linkedin || "",
      google_scholar_url: user.google_scholar_url || "",
      cv_url: user.cv_url || "",
      profile_image_url: user.profile_image_url || "",
      specialized_exam_types: user.specialized_exam_types || [],
      notification_preferences: user.notification_preferences || {
        email_new_tests: true,
        email_promotions: true,
        email_educator_updates: true,
        email_test_reminders: true
      },
      iban: user.iban || "",
      bankName: user.bankName || "",
      // Hesap sahibi adı kayıt sırasında girilen full_name'den gelir, UI'dan
      // değiştirilemez (banka uyumu). Eski kayıtlarda accountHolder farklıysa
      // önceliği full_name'e ver — tek doğru kaynak.
      accountHolder: user.full_name || user.accountHolder || "",
    };
    setFormData(initialData);
    setInitialFormData(initialData);
  }, [user]);

  // OTP akışı için state
  const [otpDialogOpen, setOtpDialogOpen] = useState(false);
  const [pendingSensitiveFields, setPendingSensitiveFields] = useState(null);

  const detectSensitiveChanges = () => {
    if (!initialFormData) return null;
    const changes = {};
    for (const k of ["phone", "website", "linkedin"]) {
      if ((formData[k] ?? "") !== (initialFormData[k] ?? "")) {
        changes[k] = formData[k] ?? "";
      }
    }
    return Object.keys(changes).length ? changes : null;
  };

  const syncEducatorProfile = async () => {
    try {
      const existingProfiles = await entities.EducatorProfile.filter({ educator_email: user.email });
      if (existingProfiles.length > 0) {
        await entities.EducatorProfile.update(existingProfiles[0].id, {
          educator_email: user.email,
          educator_name: user.full_name,
          bio: formData.bio,
          education: formData.education,
          website: formData.website,
          linkedin: formData.linkedin,
          specialized_exam_types: formData.specialized_exam_types,
          profile_image_url: formData.profile_image_url
        });
      } else {
        await entities.EducatorProfile.create({
          educator_email: user.email,
          educator_name: user.full_name,
          bio: formData.bio,
          education: formData.education,
          website: formData.website,
          linkedin: formData.linkedin,
          specialized_exam_types: formData.specialized_exam_types,
          profile_image_url: formData.profile_image_url
        });
      }
    } catch (e) {
      console.log("EducatorProfile sync error:", e);
    }
  };

  const updateMutation = useMutation({
    mutationFn: async () => {
      const sensitive = detectSensitiveChanges();
      // Non-sensitive alanları her zaman gönder (backend hassas alanları strip edecek)
      await auth.updateMe(formData);
      await syncEducatorProfile();
      if (sensitive) {
        setPendingSensitiveFields(sensitive);
        setOtpDialogOpen(true);
        return { needsOtp: true };
      }
      return { needsOtp: false };
    },
    onSuccess: (result) => {
      if (result?.needsOtp) return; // OTP başarılı olunca toast göstereceğiz
      toast.success(t("pages:educatorSettings.toasts.profileUpdated"));
      setInitialFormData(formData);
      queryClient.invalidateQueries({ queryKey: ["educatorUser"] });
    },
    onError: () => {
      toast.error(t("pages:educatorSettings.toasts.updateFailed"));
    }
  });

  // OTP dialog başarılı tamamlandığında çağrılır
  const handleOtpSuccess = () => {
    setInitialFormData(formData);
    setPendingSensitiveFields(null);
    queryClient.invalidateQueries({ queryKey: ["educatorUser"] });
    toast.success(t("pages:educatorSettings.toasts.profileUpdated"));
  };

  // REJECTED durumu: inline edit formu state'i
  const [rejectedCvUrl, setRejectedCvUrl] = useState("");
  const [rejectedSpecializations, setRejectedSpecializations] = useState([]);
  const [rejectedEducation, setRejectedEducation] = useState("");
  const [rejectedBio, setRejectedBio] = useState("");
  const [rejectedLinkedin, setRejectedLinkedin] = useState("");
  const [rejectedWebsite, setRejectedWebsite] = useState("");
  const [uploadingRejectedCv, setUploadingRejectedCv] = useState(false);
  const rejectedCvInputRef = useRef(null);

  // REJECTED durumundaki form'u user değişince önceden dolduran etkisi
  useEffect(() => {
    if (!user || user.educator_status !== "rejected") return;
    setRejectedCvUrl(user.cv_url || user.metadata?.cv_url || "");
    setRejectedSpecializations(user.specialized_exam_types || user.metadata?.specialized_exam_types || []);
    setRejectedEducation(user.education || user.metadata?.education_info || "");
    setRejectedBio(user.bio || "");
    setRejectedLinkedin(user.metadata?.linkedin_url || "");
    setRejectedWebsite(user.metadata?.website_url || "");
  }, [user?.id]);

  const handleRejectedCvUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.type !== "application/pdf") {
      toast.error(t("pages:educatorSettings.toasts.invalidPdf"));
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error(t("pages:educatorSettings.toasts.fileTooBig"));
      return;
    }
    setUploadingRejectedCv(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      // PDF için /upload/document. /upload/image Sharp pipeline magic byte ile
      // PDF'i reddediyor (yukarıdaki normal CV handler'ı ile aynı düzeltme).
      const res = await api.post("/upload/document", fd, { headers: { "Content-Type": "multipart/form-data" } });
      const url = res.data?.url || res.data?.fileUrl || res.data?.file_url;
      if (!url) throw new Error("URL alınamadı");
      setRejectedCvUrl(url);
      toast.success(t("pages:educatorSettings.toasts.cvUploaded"));
    } catch {
      toast.error(t("pages:educatorSettings.toasts.cvUploadFailed"));
    } finally {
      setUploadingRejectedCv(false);
      e.target.value = "";
    }
  };

  const toggleRejectedSpec = (id) => {
    setRejectedSpecializations((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  // Yeniden başvur: önce profili güncelle, sonra status'u pending'e al
  const resubmitApplicationMutation = useMutation({
    mutationFn: async () => {
      // 1. Güncellenmiş alanları PATCH /educators/me ile kaydet
      await api.patch("/educators/me", {
        metadata: {
          cv_url: rejectedCvUrl,
          specialized_exam_types: rejectedSpecializations,
          education_info: rejectedEducation,
          bio: rejectedBio,
          linkedin_url: rejectedLinkedin || null,
          website_url: rejectedWebsite || null,
        },
      });
      // 2. Adanmış resubmit endpoint'i: status REJECTED → PENDING + EDUCATOR_RESUBMITTED
      //    audit log atılır (admin İncele timeline'ında "Eğitici yeniden başvurdu" satırı çıkar).
      await api.post("/educators/me/resubmit-application");
    },
    onSuccess: async () => {
      toast.success(t("pages:educatorSettings.notices.rejected.resubmittedToast"));
      await checkAppState();
      queryClient.invalidateQueries({ queryKey: ["educatorUser"] });
    },
    onError: (err) => {
      // Backend mesajını göster — "Tekrar deneyin" çok genel, sebebi yutuyordu
      const detail =
        err?.response?.data?.message?.message ||
        err?.response?.data?.message ||
        err?.response?.data?.error ||
        err?.message ||
        "";
      const base = t("pages:educatorSettings.notices.rejected.resubmitFailed", { defaultValue: "Yeniden başvuru başarısız" });
      toast.error(detail ? `${base}: ${detail}` : `${base}. Tekrar deneyin.`);
       
      console.error("[resubmit] error:", err?.response?.data || err);
    },
  });

  const handleCVUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Check file type
    const allowedTypes = ['application/pdf'];
    if (!allowedTypes.includes(file.type)) {
      toast.error(t("pages:educatorSettings.toasts.invalidPdf"));
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error(t("pages:educatorSettings.toasts.fileTooBig"));
      return;
    }

    setUploadingCV(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      // PDF için ayrı endpoint — /upload/image Sharp pipeline'ına gider ve magic
      // byte kontrolünde PDF'i reddeder. /upload/document yalnızca PDF kabul eder.
      const res = await api.post("/upload/document", fd, { headers: { "Content-Type": "multipart/form-data" } });
      const file_url = res.data.url || res.data.fileUrl || res.data.file_url;
      setFormData({ ...formData, cv_url: file_url });
      toast.success(t("pages:educatorSettings.toasts.cvUploaded"));
    } catch (error) {
      toast.error(t("pages:educatorSettings.toasts.cvUploadFailed"));
    } finally {
      setUploadingCV(false);
    }
  };

  const handleImageUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const allowedTypes = ['image/jpeg', 'image/png', 'image/jpg', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      toast.error(t("pages:educatorSettings.toasts.invalidImage"));
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error(t("pages:educatorSettings.toasts.imageTooBig"));
      return;
    }

    setUploadingImage(true);
    try {
      const dataUrl = await resizeImageToBase64(file, 256);
      await auth.updateMe({ profile_image_url: dataUrl });
      setFormData(prev => ({ ...prev, profile_image_url: dataUrl }));
      toast.success(t("pages:educatorSettings.toasts.imageUploaded"));
    } catch {
      toast.error(t("pages:educatorSettings.toasts.imageUploadFailed"));
    } finally {
      setUploadingImage(false);
      e.target.value = '';
    }
  };

  if (!user) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900">{t("pages:titles.educatorSettings")}</h1>
        <p className="text-slate-500 mt-2">{t("pages:titles.educatorSettingsDesc")}</p>
      </div>

      {/* Rejection Notice + Inline Profile Update */}
      {user.educator_status === "rejected" && (
        <div className="bg-rose-50 border border-rose-200 rounded-xl p-6 mb-8 space-y-6">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 bg-rose-100 rounded-full flex items-center justify-center flex-shrink-0">
              <ShieldCheck className="w-5 h-5 text-rose-600" />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-rose-900 mb-2">
                {t("pages:educatorSettings.notices.rejected.title")}
              </h3>
              {user.rejection_reason && (
                <p className="text-sm text-rose-700 mb-2">
                  <strong>{t("pages:educatorSettings.notices.rejected.reason")}</strong>{" "}
                  {user.rejection_reason}
                </p>
              )}
              <p className="text-sm text-rose-600">
                {t("pages:educatorSettings.notices.rejected.desc")}
              </p>
            </div>
          </div>

          {/* Profil güncelleme formu (REJECTED durumunda) */}
          <div className="border-t border-rose-200 pt-5 space-y-5">
            <p className="text-sm font-medium text-rose-900">
              {t("pages:educatorSettings.notices.rejected.updateProfileHint", {
                defaultValue: "Aşağıdaki bilgileri güncelleyip \"Yeniden Başvur\" butonuna tıklayın.",
              })}
            </p>

            {/* CV */}
            <div>
              <label className="block text-sm font-medium text-rose-800 mb-2">
                {t("pages:educatorSettings.verification.cvLabel")} —{" "}
                <span className="font-normal text-rose-600">
                  {t("pages:educatorSettings.notices.rejected.cvRequired", { defaultValue: "Zorunlu" })}
                </span>
              </label>
              {rejectedCvUrl ? (
                <div className="flex items-center gap-3 p-3 bg-white border border-emerald-200 rounded-lg">
                  <CheckCircle className="w-5 h-5 text-emerald-600 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-emerald-900">
                      {t("pages:educatorSettings.verification.cvUploaded")}
                    </p>
                    <a href={rejectedCvUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-emerald-600 hover:underline truncate block">
                      {t("pages:educatorSettings.verification.cvView")}
                    </a>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => rejectedCvInputRef.current?.click()}
                    disabled={uploadingRejectedCv}
                  >
                    {t("pages:educatorSettings.verification.cvChange")}
                  </Button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => rejectedCvInputRef.current?.click()}
                  disabled={uploadingRejectedCv}
                  className="w-full p-4 border-2 border-dashed border-rose-300 rounded-lg hover:border-rose-400 hover:bg-rose-50/50 transition-colors disabled:opacity-50 min-h-10"
                  aria-label={t("pages:educatorSettings.verification.cvUpload")}
                >
                  <div className="flex flex-col items-center gap-1">
                    {uploadingRejectedCv ? (
                      <Loader2 className="w-6 h-6 text-rose-400 animate-spin" />
                    ) : (
                      <Upload className="w-6 h-6 text-rose-400" />
                    )}
                    <p className="text-sm font-medium text-rose-800">
                      {uploadingRejectedCv
                        ? t("pages:educatorSettings.verification.cvUploading")
                        : t("pages:educatorSettings.verification.cvUpload")}
                    </p>
                    <p className="text-xs text-rose-500">{t("pages:educatorSettings.verification.cvFormat")}</p>
                  </div>
                </button>
              )}
              <input
                ref={rejectedCvInputRef}
                type="file"
                accept=".pdf"
                onChange={handleRejectedCvUpload}
                className="hidden"
                aria-hidden="true"
              />
            </div>

            {/* Uzmanlık alanları */}
            <div>
              <label className="block text-sm font-medium text-rose-800 mb-2">
                {t("pages:educatorSettings.exams.title")} —{" "}
                <span className="font-normal text-rose-600">
                  {t("pages:educatorSettings.notices.rejected.specRequired", { defaultValue: "En az 1" })}
                </span>
              </label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-48 overflow-y-auto">
                {examTypes.map((exam) => {
                  const checked = rejectedSpecializations.includes(exam.id);
                  return (
                    <label
                      key={exam.id}
                      className={`flex items-center gap-3 p-3 rounded-lg border-2 cursor-pointer transition-all bg-white ${
                        checked ? "border-rose-500 bg-rose-50" : "border-slate-200 hover:border-rose-300"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleRejectedSpec(exam.id)}
                        className="h-4 w-4 rounded border-slate-300 text-rose-600 focus:ring-rose-500"
                      />
                      <span className="text-sm font-medium text-slate-900">{exam.name}</span>
                    </label>
                  );
                })}
              </div>
            </div>

            {/* Mezuniyet bilgisi */}
            <div>
              <label htmlFor="rejected-education" className="block text-sm font-medium text-rose-800 mb-1">
                {t("pages:educatorSettings.profile.educationLabel")}{" "}
                <span className="font-normal text-rose-500">
                  ({t("pages:educatorSettings.profile.optional", { defaultValue: "opsiyonel" })})
                </span>
              </label>
              <Input
                id="rejected-education"
                value={rejectedEducation}
                onChange={(e) => setRejectedEducation(e.target.value)}
                placeholder={t("pages:educatorSettings.profile.educationPlaceholder")}
                className="bg-white"
              />
            </div>

            {/* Bio */}
            <div>
              <label htmlFor="rejected-bio" className="block text-sm font-medium text-rose-800 mb-1">
                {t("pages:educatorSettings.profile.bioLabel")}{" "}
                <span className="font-normal text-rose-500">
                  ({t("pages:educatorSettings.profile.optional", { defaultValue: "opsiyonel" })})
                </span>
              </label>
              <textarea
                id="rejected-bio"
                value={rejectedBio}
                onChange={(e) => setRejectedBio(e.target.value)}
                placeholder={t("pages:educatorSettings.profile.bioPlaceholder")}
                rows={3}
                className="w-full rounded-md border border-input bg-white px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>

            {/* LinkedIn — opsiyonel */}
            <div>
              <label htmlFor="rejected-linkedin" className="block text-sm font-medium text-rose-800 mb-1">
                LinkedIn Profili{' '}
                <span className="font-normal text-rose-500">
                  ({t("pages:educatorSettings.profile.optional", { defaultValue: "opsiyonel" })})
                </span>
              </label>
              <input
                id="rejected-linkedin"
                type="url"
                value={rejectedLinkedin}
                onChange={(e) => setRejectedLinkedin(e.target.value)}
                placeholder="https://www.linkedin.com/in/..."
                className="w-full rounded-md border border-input bg-white px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>

            {/* Kişisel Web Sitesi — opsiyonel */}
            <div>
              <label htmlFor="rejected-website" className="block text-sm font-medium text-rose-800 mb-1">
                Kişisel Web Sitesi{' '}
                <span className="font-normal text-rose-500">
                  ({t("pages:educatorSettings.profile.optional", { defaultValue: "opsiyonel" })})
                </span>
              </label>
              <input
                id="rejected-website"
                type="url"
                value={rejectedWebsite}
                onChange={(e) => setRejectedWebsite(e.target.value)}
                placeholder="https://..."
                className="w-full rounded-md border border-input bg-white px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>

            <Button
              onClick={() => resubmitApplicationMutation.mutate()}
              disabled={
                resubmitApplicationMutation.isPending ||
                !rejectedCvUrl ||
                rejectedSpecializations.length === 0
              }
              className="w-full bg-rose-600 hover:bg-rose-700 min-h-10"
            >
              {resubmitApplicationMutation.isPending
                ? t("pages:educatorSettings.notices.rejected.resubmitting")
                : t("pages:educatorSettings.notices.rejected.resubmit")}
            </Button>
          </div>
        </div>
      )}

      {/* Pending Notice */}
      {user.educator_status === "pending" && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 mb-8">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 bg-amber-100 rounded-full flex items-center justify-center flex-shrink-0">
              <ShieldCheck className="w-5 h-5 text-amber-600" />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-amber-900 mb-2">{t("pages:educatorSettings.notices.pending.title")}</h3>
              <p className="text-sm text-amber-700">
                {t("pages:educatorSettings.notices.pending.desc")}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Approved Notice */}
      {user.educator_status === "approved" && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-6 mb-8">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 bg-emerald-100 rounded-full flex items-center justify-center flex-shrink-0">
              <CheckCircle className="w-5 h-5 text-emerald-600" />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-emerald-900 mb-2">{t("pages:educatorSettings.notices.approved.title")}</h3>
              <p className="text-sm text-emerald-700">
                {t("pages:educatorSettings.notices.approved.desc")}
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-slate-200 p-6 lg:p-8">
        <div className="flex items-center gap-4 mb-8 pb-6 border-b border-slate-100">
          <div className="relative group">
            {formData.profile_image_url ? (
              <img 
                src={formData.profile_image_url} 
                alt={user.full_name}
                className="w-16 h-16 rounded-full object-cover"
              />
            ) : (
              <div className="w-16 h-16 bg-gradient-to-br from-indigo-100 to-violet-100 rounded-full flex items-center justify-center">
                <User className="w-8 h-8 text-indigo-600" />
              </div>
            )}
            <button
              type="button"
              onClick={() => document.getElementById('profile-image-upload').click()}
              disabled={uploadingImage}
              className="absolute inset-0 bg-black/50 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <Camera className="w-6 h-6 text-white" />
            </button>
            <input
              id="profile-image-upload"
              type="file"
              accept="image/*"
              onChange={handleImageUpload}
              className="hidden"
            />
          </div>
          <div>
            <p className="text-lg font-semibold text-slate-900">{user.full_name}</p>
            <p className="text-sm text-slate-500">{user.email}</p>
          </div>
        </div>

        <Tabs defaultValue="profile" className="w-full">
          <TabsList>
            <TabsTrigger value="profile">{t("pages:educatorSettings.tabs.profile")}</TabsTrigger>
            <TabsTrigger value="verification">{t("pages:educatorSettings.tabs.verification")}</TabsTrigger>
            <TabsTrigger value="contact">{t("pages:educatorSettings.tabs.contact")}</TabsTrigger>
            <TabsTrigger value="exams">{t("pages:educatorSettings.tabs.exams")}</TabsTrigger>
            <TabsTrigger value="notifications">{t("pages:educatorSettings.tabs.notifications")}</TabsTrigger>
            <TabsTrigger value="payment">{t("pages:educatorSettings.tabs.payment")}</TabsTrigger>
          </TabsList>

          {/* Profil Tab */}
          <TabsContent value="profile">
            <form onSubmit={(e) => { e.preventDefault(); updateMutation.mutate(); }} className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
                  <GraduationCap className="w-5 h-5 text-indigo-600" />
                  {t("pages:educatorSettings.profile.title")}
                </h3>
                
                <div className="space-y-6">
                  <div>
                    <Label htmlFor="education">{t("pages:educatorSettings.profile.educationLabel")}</Label>
                    <Input
                      id="education"
                      placeholder={t("pages:educatorSettings.profile.educationPlaceholder")}
                      value={formData.education}
                      onChange={(e) => setFormData({ ...formData, education: e.target.value })}
                      className="mt-2"
                    />
                    <p className="text-xs text-slate-500 mt-1">{t("pages:educatorSettings.profile.educationHint")}</p>
                  </div>

                  <div>
                    <Label htmlFor="bio">{t("pages:educatorSettings.profile.bioLabel")}</Label>
                    <Textarea
                      id="bio"
                      placeholder={t("pages:educatorSettings.profile.bioPlaceholder")}
                      value={formData.bio}
                      onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
                      className="mt-2 min-h-32"
                    />
                    <p className="text-xs text-slate-500 mt-1">{t("pages:educatorSettings.profile.bioHint")}</p>
                  </div>
                </div>
              </div>

              <Button 
                type="submit" 
                className="bg-indigo-600 hover:bg-indigo-700"
                disabled={updateMutation.isPending || !hasChanges}
              >
                <Save className="w-4 h-4 mr-2" />
                {updateMutation.isPending ? t("pages:educatorSettings.saving") : t("pages:educatorSettings.saveButton")}
              </Button>
            </form>
          </TabsContent>

          {/* Doğrulama Tab */}
          <TabsContent value="verification">
            <form onSubmit={(e) => { e.preventDefault(); updateMutation.mutate(); }} className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5 text-indigo-600" />
                  {t("pages:educatorSettings.verification.title")}
                </h3>

                <div className="space-y-6">
              <div>
                <Label className="flex items-center gap-2">
                  <FileText className="w-4 h-4" />
                  {t("pages:educatorSettings.verification.cvLabel")}
                </Label>
                <div className="mt-2">
                  {formData.cv_url ? (
                    <div className="flex items-center gap-3 p-4 bg-emerald-50 border border-emerald-200 rounded-lg">
                      <CheckCircle className="w-5 h-5 text-emerald-600" />
                      <div className="flex-1">
                        <p className="text-sm font-medium text-emerald-900">{t("pages:educatorSettings.verification.cvUploaded")}</p>
                        <a
                          href={formData.cv_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-emerald-600 hover:underline"
                        >
                          {t("pages:educatorSettings.verification.cvView")}
                        </a>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => document.getElementById('cv-upload').click()}
                        disabled={uploadingCV}
                      >
                        {t("pages:educatorSettings.verification.cvChange")}
                      </Button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => document.getElementById('cv-upload').click()}
                      disabled={uploadingCV}
                      className="w-full p-6 border-2 border-dashed border-slate-300 rounded-lg hover:border-indigo-400 hover:bg-indigo-50/50 transition-colors disabled:opacity-50"
                    >
                      <div className="flex flex-col items-center gap-2">
                        <Upload className="w-8 h-8 text-slate-400" />
                        <p className="text-sm font-medium text-slate-900">
                          {uploadingCV ? t("pages:educatorSettings.verification.cvUploading") : t("pages:educatorSettings.verification.cvUpload")}
                        </p>
                        <p className="text-xs text-slate-500">{t("pages:educatorSettings.verification.cvFormat")}</p>
                      </div>
                    </button>
                  )}
                  <input
                    id="cv-upload"
                    type="file"
                    accept=".pdf"
                    onChange={handleCVUpload}
                    className="hidden"
                  />
                </div>
                <p className="text-xs text-slate-500 mt-1">{t("pages:educatorSettings.verification.cvHint")}</p>
                </div>
                </div>
              </div>

              <Button 
                type="submit" 
                className="bg-indigo-600 hover:bg-indigo-700"
                disabled={updateMutation.isPending || !hasChanges}
              >
                <Save className="w-4 h-4 mr-2" />
                {updateMutation.isPending ? t("pages:educatorSettings.saving") : t("pages:educatorSettings.saveButton")}
              </Button>
            </form>
          </TabsContent>

          {/* İletişim Tab */}
          <TabsContent value="contact">
            <form onSubmit={(e) => { e.preventDefault(); updateMutation.mutate(); }} className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
                  <Phone className="w-5 h-5 text-indigo-600" />
                  {t("pages:educatorSettings.contact.title")}
                </h3>
            
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <Label htmlFor="phone" className="flex items-center gap-2">
                  <Phone className="w-4 h-4" />
                  {t("pages:educatorSettings.contact.phoneLabel")}
                </Label>
                <Input
                  id="phone"
                  placeholder="0532 123 45 67"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className="mt-2"
                />
              </div>

              <div>
                <Label htmlFor="city" className="flex items-center gap-2">
                  <MapPin className="w-4 h-4" />
                  {t("pages:educatorSettings.contact.cityLabel")}
                </Label>
                <Input
                  id="city"
                  placeholder="İstanbul"
                  value={formData.city}
                  onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                  className="mt-2"
                />
              </div>

              <div>
                <Label htmlFor="website" className="flex items-center gap-2">
                  <Globe className="w-4 h-4" />
                  {t("pages:educatorSettings.contact.websiteLabel")}
                </Label>
                <Input
                  id="website"
                  placeholder="https://example.com"
                  value={formData.website}
                  onChange={(e) => setFormData({ ...formData, website: e.target.value })}
                  className="mt-2"
                />
              </div>

              <div>
                <Label htmlFor="linkedin" className="flex items-center gap-2">
                  <Linkedin className="w-4 h-4" />
                  {t("pages:educatorSettings.contact.linkedinLabel")}
                </Label>
                <Input
                  id="linkedin"
                  placeholder="https://linkedin.com/in/username"
                  value={formData.linkedin}
                  onChange={(e) => setFormData({ ...formData, linkedin: e.target.value })}
                  className="mt-2"
                />
              </div>

              <div className="md:col-span-2">
                <Label htmlFor="google_scholar" className="flex items-center gap-2">
                  <Globe className="w-4 h-4" />
                  {t("pages:educatorSettings.contact.gscholarLabel")}
                </Label>
                <Input
                  id="google_scholar"
                  placeholder="https://scholar.google.com/citations?user=..."
                  value={formData.google_scholar_url}
                  onChange={(e) => setFormData({ ...formData, google_scholar_url: e.target.value })}
                  className="mt-2"
                />
                <p className="text-xs text-slate-500 mt-1">{t("pages:educatorSettings.contact.gscholarHint")}</p>
                </div>
                </div>
              </div>

              <Button 
                type="submit" 
                className="bg-indigo-600 hover:bg-indigo-700"
                disabled={updateMutation.isPending || !hasChanges}
              >
                <Save className="w-4 h-4 mr-2" />
                {updateMutation.isPending ? t("pages:educatorSettings.saving") : t("pages:educatorSettings.saveButton")}
              </Button>
            </form>
          </TabsContent>

          {/* Sınav Tercihleri Tab */}
          <TabsContent value="exams">
            <form onSubmit={(e) => { e.preventDefault(); updateMutation.mutate(); }} className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
                  <Award className="w-5 h-5 text-indigo-600" />
                  {t("pages:educatorSettings.exams.title")}
                </h3>
                <p className="text-sm text-slate-500 mb-6">
                  {t("pages:educatorSettings.exams.desc")}
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {examTypes.map((exam) => (
                    <label
                      key={exam.id}
                      className={`flex items-center gap-3 p-4 rounded-xl border-2 cursor-pointer transition-all ${
                        (formData.specialized_exam_types || []).includes(exam.id)
                          ? "border-indigo-500 bg-indigo-50"
                          : "border-slate-200 hover:border-slate-300 bg-white"
                      }`}
                    >
                      <Checkbox
                        checked={(formData.specialized_exam_types || []).includes(exam.id)}
                        onCheckedChange={(checked) => {
                          const current = formData.specialized_exam_types || [];
                          setFormData({
                            ...formData,
                            specialized_exam_types: checked
                              ? [...current, exam.id]
                              : current.filter(id => id !== exam.id)
                          });
                        }}
                      />
                      <div className="flex-1">
                        <p className="font-semibold text-slate-900">{exam.name}</p>
                        {exam.description && (
                          <p className="text-sm text-slate-500 mt-1">{exam.description}</p>
                        )}
                      </div>
                    </label>
                  ))}
                </div>

                {examTypes.length === 0 && (
                  <p className="text-center text-slate-500 py-8">{t("pages:educatorSettings.exams.noExamTypes")}</p>
                )}
              </div>

              <Button 
                type="submit" 
                className="bg-indigo-600 hover:bg-indigo-700"
                disabled={updateMutation.isPending || !hasChanges}
              >
                <Save className="w-4 h-4 mr-2" />
                {updateMutation.isPending ? t("pages:educatorSettings.saving") : t("pages:educatorSettings.saveButton")}
              </Button>
            </form>
          </TabsContent>

          {/* Bildirimler Tab */}
          <TabsContent value="notifications">
            <form onSubmit={(e) => { e.preventDefault(); updateMutation.mutate(); }} className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
                  <Bell className="w-5 h-5 text-indigo-600" />
                  {t("pages:educatorSettings.notifications.title")}
                </h3>

                <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-slate-900">{t("pages:educatorSettings.notifications.newTests")}</p>
                  <p className="text-sm text-slate-500">{t("pages:educatorSettings.notifications.newTestsDesc")}</p>
                </div>
                <Switch
                  checked={formData.notification_preferences.email_new_tests}
                  onCheckedChange={(checked) => 
                    setFormData({ 
                      ...formData, 
                      notification_preferences: { 
                        ...formData.notification_preferences, 
                        email_new_tests: checked 
                      }
                    })
                  }
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-slate-900">{t("pages:educatorSettings.notifications.promotions")}</p>
                  <p className="text-sm text-slate-500">{t("pages:educatorSettings.notifications.promotionsDesc")}</p>
                </div>
                <Switch
                  checked={formData.notification_preferences.email_promotions}
                  onCheckedChange={(checked) => 
                    setFormData({ 
                      ...formData, 
                      notification_preferences: { 
                        ...formData.notification_preferences, 
                        email_promotions: checked 
                      }
                    })
                  }
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-slate-900">{t("pages:educatorSettings.notifications.educatorUpdates")}</p>
                  <p className="text-sm text-slate-500">{t("pages:educatorSettings.notifications.educatorUpdatesDesc")}</p>
                </div>
                <Switch
                  checked={formData.notification_preferences.email_educator_updates}
                  onCheckedChange={(checked) => 
                    setFormData({ 
                      ...formData, 
                      notification_preferences: { 
                        ...formData.notification_preferences, 
                        email_educator_updates: checked 
                      }
                    })
                  }
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-slate-900">{t("pages:educatorSettings.notifications.testReminders")}</p>
                  <p className="text-sm text-slate-500">{t("pages:educatorSettings.notifications.testRemindersDesc")}</p>
                </div>
                <Switch
                  checked={formData.notification_preferences.email_test_reminders}
                  onCheckedChange={(checked) => 
                    setFormData({ 
                      ...formData, 
                      notification_preferences: { 
                        ...formData.notification_preferences, 
                        email_test_reminders: checked 
                      }
                    })
                  }
                />
                </div>
                </div>
              </div>

              <Button 
                type="submit" 
                className="bg-indigo-600 hover:bg-indigo-700"
                disabled={updateMutation.isPending || !hasChanges}
              >
                <Save className="w-4 h-4 mr-2" />
                {updateMutation.isPending ? t("pages:educatorSettings.saving") : t("pages:educatorSettings.saveButton")}
              </Button>
            </form>
          </TabsContent>
          {/* Ödeme Tab */}
          <TabsContent value="payment">
            <form onSubmit={(e) => { e.preventDefault(); updateMutation.mutate(); }} className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold text-slate-900 mb-2 flex items-center gap-2">
                  <CreditCard className="w-5 h-5 text-indigo-600" />
                  {t("pages:educatorSettings.payment.title")}
                </h3>
                <p className="text-sm text-slate-500 mb-6">
                  {t("pages:educatorSettings.payment.desc")}
                </p>

                <div className="space-y-6">
                  <div>
                    <Label htmlFor="iban" className="flex items-center gap-2">
                      <CreditCard className="w-4 h-4" />
                      {t("pages:educatorSettings.payment.ibanLabel")} <span className="text-rose-500 ml-1">*</span>
                    </Label>
                    <Input
                      id="iban"
                      placeholder={t("pages:educatorSettings.payment.ibanPlaceholder")}
                      value={formData.iban}
                      onChange={(e) => {
                        // normalize: uppercase, keep only alphanumeric
                        const raw = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
                        // insert spaces every 4 chars for display
                        const formatted = raw.match(/.{1,4}/g)?.join(' ') ?? raw;
                        setFormData({ ...formData, iban: formatted });
                      }}
                      className="mt-2 font-mono"
                      maxLength={34} // TR + 24 digits + spaces
                    />
                    {formData.iban && !/^TR\d{24}$/.test(formData.iban.replace(/\s/g, '')) && (
                      <p className="text-xs text-rose-500 mt-1">{t("pages:educatorSettings.payment.ibanError")}</p>
                    )}
                    <p className="text-xs text-slate-500 mt-1">{t("pages:educatorSettings.payment.ibanHint")}</p>
                  </div>

                  <div>
                    <Label htmlFor="accountHolder" className="flex items-center gap-2">
                      <User className="w-4 h-4" />
                      {t("pages:educatorSettings.payment.holderLabel")} <span className="text-rose-500 ml-1">*</span>
                    </Label>
                    {/*
                      Hesap sahibi adı kayıt sırasında girilen full_name'den gelir
                      ve UI'dan değiştirilemez. TKHK + Banka uyumu: ödeme alıcısı
                      hesap profilindeki gerçek kimlikle eşleşmek zorunda. Ad
                      değişikliği destek üzerinden yapılır.
                    */}
                    <Input
                      id="accountHolder"
                      value={user?.full_name || ""}
                      readOnly
                      disabled
                      aria-readonly="true"
                      className="mt-2 bg-slate-50 text-slate-600 cursor-not-allowed"
                    />
                    <p className="text-xs text-slate-500 mt-1">{t("pages:educatorSettings.payment.holderLockedHint")}</p>
                  </div>

                  <div>
                    <Label htmlFor="bankName" className="flex items-center gap-2">
                      <Building2 className="w-4 h-4" />
                      {t("pages:educatorSettings.payment.bankLabel")}
                    </Label>
                    <Input
                      id="bankName"
                      placeholder={t("pages:educatorSettings.payment.bankPlaceholder")}
                      value={formData.bankName}
                      onChange={(e) => setFormData({ ...formData, bankName: e.target.value })}
                      className="mt-2"
                    />
                  </div>
                </div>

                <div className="mt-6 p-4 bg-amber-50 border border-amber-200 rounded-xl">
                  <p className="text-sm text-amber-800">
                    <strong>{t("pages:educatorSettings.payment.important")}</strong> {t("pages:educatorSettings.payment.importantDesc")}
                  </p>
                </div>
              </div>

              <Button
                type="submit"
                className="bg-indigo-600 hover:bg-indigo-700"
                disabled={updateMutation.isPending || !hasChanges}
              >
                <Save className="w-4 h-4 mr-2" />
                {updateMutation.isPending ? t("pages:educatorSettings.saving") : t("pages:educatorSettings.saveButton")}
              </Button>
            </form>
          </TabsContent>
        </Tabs>
      </div>

      {/* Telefon/Website/LinkedIn değişikliği için 6 haneli OTP dialog'u */}
      <SensitiveProfileOtpDialog
        open={otpDialogOpen}
        onOpenChange={setOtpDialogOpen}
        pendingFields={pendingSensitiveFields || {}}
        onSuccess={handleOtpSuccess}
      />
    </div>
  );
}