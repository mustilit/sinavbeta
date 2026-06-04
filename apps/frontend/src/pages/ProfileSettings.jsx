import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { entities, auth } from "@/api/dalClient";
import { useAuth } from "@/lib/AuthContext";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import SensitiveProfileOtpDialog from "@/components/settings/SensitiveProfileOtpDialog";
import { toast } from "sonner";
import { User, Save, Phone, Globe, Linkedin, Undo2, Clock, CheckCircle2, XCircle, ShoppingBag, Filter, GraduationCap, AlertCircle, MessageSquare, Camera, Lock, KeyRound, Eye, EyeOff } from "lucide-react";
import RefundRequestModal from "@/components/refund/RefundRequestModal";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

// Helper function to format phone number in Turkish format (05XX XXX XX XX)
function formatPhone(raw) {
  const d = String(raw ?? "").replace(/\D/g, "").slice(0, 11);
  if (d.length <= 4) return d;
  if (d.length <= 7) return `${d.slice(0, 4)} ${d.slice(4)}`;
  if (d.length <= 9) return `${d.slice(0, 4)} ${d.slice(4, 7)} ${d.slice(7)}`;
  return `${d.slice(0, 4)} ${d.slice(4, 7)} ${d.slice(7, 9)} ${d.slice(9, 11)}`;
}

// Helper function to validate URLs
function isValidUrl(url) {
  if (!url) return true;
  try {
    const u = new URL(url);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

const defaultFormData = {
  phone: "",
  website: "",
  linkedin: "",
  interested_exam_types: [],
  notification_preferences: {
    email_new_tests: true,
    email_promotions: true,
    email_educator_updates: true,
    email_test_reminders: true
  }
};

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
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  });
}

export default function ProfileSettings() {
  const { t } = useTranslation(["pages"]);
  const { user: authUser } = useAuth();
  const [initialFormData, setInitialFormData] = useState(null);
  const [formData, setFormData] = useState({ ...defaultFormData });
  const [uploadingImage, setUploadingImage] = useState(false);
  const [urlErrors, setUrlErrors] = useState({ website: false, linkedin: false });
  const [refundModalOpen, setRefundModalOpen] = useState(false);
  const [selectedPurchase, setSelectedPurchase] = useState(null);
  const [searchPurchase, setSearchPurchase] = useState("");
  const [filterType, setFilterType] = useState("all");
  const [searchFilter, setSearchFilter] = useState("");
  const [appealOpen, setAppealOpen] = useState(false);
  const [appealRefund, setAppealRefund] = useState(null);
  const [appealReason, setAppealReason] = useState("");
  const queryClient = useQueryClient();

  const user = authUser;
  const hasChanges = initialFormData && JSON.stringify(formData) !== JSON.stringify(initialFormData);

  const { data: purchases = [] } = useQuery({
    queryKey: ["userPurchases", user?.email],
    queryFn: () => user ? entities.Purchase.filter({ user_email: user.email }, "-created_date") : [],
    enabled: !!user,
  });

  const { data: refundRequests = [] } = useQuery({
    queryKey: ["refundRequests", user?.email],
    queryFn: () => user ? entities.RefundRequest.filter({ user_email: user.email }, "-created_date") : [],
    enabled: !!user,
  });

  const { data: examTypes = [] } = useQuery({
    queryKey: ["examTypes"],
    queryFn: () => entities.ExamType.filter({ is_active: true }),
  });

  const handleImageUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const allowedTypes = ['image/jpeg', 'image/png', 'image/jpg', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      toast.error(t("pages:profileSettings.toasts.invalidImage"));
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error(t("pages:profileSettings.toasts.imageTooBig"));
      return;
    }
    setUploadingImage(true);
    try {
      const dataUrl = await resizeImageToBase64(file, 256);
      await auth.updateMe({ profile_image_url: dataUrl });
      setFormData(prev => ({ ...prev, profile_image_url: dataUrl }));
      toast.success(t("pages:profileSettings.toasts.imageUploaded"));
    } catch {
      toast.error(t("pages:profileSettings.toasts.imageUploadFailed"));
    } finally {
      setUploadingImage(false);
      e.target.value = '';
    }
  };

  useEffect(() => {
    if (!authUser) return;
    const loadProfile = async () => {
      try {
        const userData = await auth.me();
        const initialData = {
          phone: userData.phone || "",
          website: userData.website || "",
          linkedin: userData.linkedin || "",
          interested_exam_types: userData.interested_exam_types || [],
          notification_preferences: userData.notification_preferences || defaultFormData.notification_preferences,
          profile_image_url: userData.profile_image_url || "",
        };
        setFormData(initialData);
        setInitialFormData({ ...initialData, profile_image_url: initialData.profile_image_url });
      } catch {
        setFormData({ ...defaultFormData });
        setInitialFormData({ ...defaultFormData });
      }
    };
    loadProfile();
  }, [authUser?.id]);

  // Hassas alanlar (phone/website/linkedin) backend tarafından PATCH /me/preferences
  // çağrısından sessizce filtrelenir; OTP doğrulamasından geçmelidir.
  // Aşağıdaki mutation: non-sensitive alanlar normal PATCH ile gider; eğer
  // hassas alanlardan değişiklik varsa OTP dialog'u açılır.
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

  const updateMutation = useMutation({
    mutationFn: async () => {
      const sensitive = detectSensitiveChanges();
      // Non-sensitive kısmı her halükarda gönder (allowSensitive=false → backend zaten strip eder)
      await auth.updateMe(formData);
      if (sensitive) {
        // Hassas değişiklik varsa OTP akışını başlat
        setPendingSensitiveFields(sensitive);
        setOtpDialogOpen(true);
        return { needsOtp: true };
      }
      return { needsOtp: false };
    },
    onSuccess: (result) => {
      if (result?.needsOtp) {
        // OTP dialog açıldı — başarı toast'unu OTP başarılı tamamlanınca göstereceğiz
        return;
      }
      toast.success(t("pages:profileSettings.toasts.profileUpdated"));
      setInitialFormData(formData);
      queryClient.invalidateQueries({ queryKey: ["user"] });
    },
    onError: () => {
      toast.error(t("pages:profileSettings.toasts.updateFailed"));
    }
  });

  // ── Şifre değiştirme ──────────────────────────────────────────────────
  const [passwordForm, setPasswordForm] = useState({ currentPassword: "", newPassword: "", confirmPassword: "" });
  const [showPasswords, setShowPasswords] = useState(false);

  const newPwTooShort = passwordForm.newPassword.length > 0 && passwordForm.newPassword.length < 8;
  const pwMismatch = passwordForm.confirmPassword.length > 0 && passwordForm.newPassword !== passwordForm.confirmPassword;
  const canSubmitPassword =
    passwordForm.currentPassword.length > 0 &&
    passwordForm.newPassword.length >= 8 &&
    passwordForm.newPassword === passwordForm.confirmPassword;

  const changePasswordMutation = useMutation({
    mutationFn: () => auth.changePassword(passwordForm.currentPassword, passwordForm.newPassword),
    onSuccess: () => {
      toast.success(t("pages:profileSettings.security.success"));
      setPasswordForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
    },
    onError: (err) => {
      const d = err?.response?.data;
      const msg =
        d?.error?.message ||
        (typeof d?.error === "string" ? d.error : null) ||
        d?.message ||
        t("pages:profileSettings.security.failed");
      toast.error(msg);
    },
  });

  const handleChangePassword = (e) => {
    e.preventDefault();
    if (passwordForm.newPassword.length < 8) {
      toast.error(t("pages:profileSettings.security.minLength"));
      return;
    }
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      toast.error(t("pages:profileSettings.security.mismatch"));
      return;
    }
    changePasswordMutation.mutate();
  };

  // OTP dialog başarılı olduğunda çağrılır — initial state'i taze formData'ya çek
  const handleOtpSuccess = () => {
    setInitialFormData(formData);
    setPendingSensitiveFields(null);
    queryClient.invalidateQueries({ queryKey: ["user"] });
    toast.success(t("pages:profileSettings.toasts.profileUpdated"));
  };

  const refundMutation = useMutation({
    mutationFn: (data) => entities.RefundRequest.create({
      purchase_id: selectedPurchase.id,
      reason: data.reason,
      description: data.description,
    }),
    onSuccess: () => {
      toast.success(t("pages:profileSettings.toasts.refundRequested"));
      setRefundModalOpen(false);
      setSelectedPurchase(null);
      queryClient.invalidateQueries({ queryKey: ["refundRequests"] });
    },
    onError: (err) => {
      toast.error(err?.response?.data?.message ?? t("pages:profileSettings.toasts.refundFailed"));
    }
  });

  const appealMutation = useMutation({
    mutationFn: () => entities.RefundRequest.appeal(appealRefund.id, appealReason.trim()),
    onSuccess: () => {
      toast.success(t("pages:profileSettings.toasts.appealSubmitted"));
      setAppealOpen(false);
      setAppealRefund(null);
      setAppealReason("");
      queryClient.invalidateQueries({ queryKey: ["refundRequests"] });
    },
    onError: (err) => {
      toast.error(err?.response?.data?.message ?? t("pages:profileSettings.toasts.appealFailed"));
    }
  });

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
        <h1 className="text-3xl font-bold text-slate-900">{t("pages:titles.profileSettings")}</h1>
        <p className="text-slate-500 mt-2">{t("pages:titles.profileSettingsDesc")}</p>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 p-6 lg:p-8">
        <div className="flex items-center gap-4 mb-8 pb-6 border-b border-slate-100">
          <div className="relative group flex-shrink-0">
            {formData.profile_image_url ? (
              <img src={formData.profile_image_url} alt={user.full_name || user.username} className="w-16 h-16 rounded-full object-cover" />
            ) : (user?.role || "").toUpperCase() === "ADMIN" ? (
              // Admin için varsayılan avatar — Sınav Salonu logosu (custom foto yüklenmemişse)
              <div className="w-16 h-16 bg-gradient-to-br from-indigo-600 to-indigo-500 rounded-full flex items-center justify-center" title="Sınav Salonu">
                <GraduationCap className="w-9 h-9 text-white" aria-hidden="true" />
              </div>
            ) : (
              <div className="w-16 h-16 bg-gradient-to-br from-indigo-100 to-violet-100 rounded-full flex items-center justify-center">
                <User className="w-8 h-8 text-indigo-600" />
              </div>
            )}
            <button
              type="button"
              onClick={() => document.getElementById('profile-avatar-upload').click()}
              disabled={uploadingImage}
              className="absolute inset-0 bg-black/50 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
            >
              <Camera className="w-5 h-5 text-white" />
            </button>
            <input id="profile-avatar-upload" type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
          </div>
          <div>
            {/* full_name/username user-generated — çevrilmez */}
            <p className="text-lg font-semibold text-slate-900">{user.full_name || user.username || user.email || t("pages:profileSettings.userFallback")}</p>
            <p className="text-sm text-slate-500">{user.email}</p>
            <p className="text-xs text-slate-400 mt-0.5">{t("pages:profileSettings.avatarHint")}</p>
          </div>
        </div>

        <Tabs defaultValue="contact" className="w-full">
          <TabsList>
            <TabsTrigger value="contact">{t("pages:profileSettings.tabs.contact")}</TabsTrigger>
            <TabsTrigger value="notifications">{t("pages:profileSettings.tabs.notifications")}</TabsTrigger>
            <TabsTrigger value="exams">{t("pages:profileSettings.tabs.exams")}</TabsTrigger>
            <TabsTrigger value="financial">{t("pages:profileSettings.tabs.financial")}</TabsTrigger>
            <TabsTrigger value="security">{t("pages:profileSettings.tabs.security")}</TabsTrigger>
          </TabsList>

          {/* İletişim Tab */}
          <TabsContent value="contact">
            <form onSubmit={(e) => { e.preventDefault(); updateMutation.mutate(); }} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="md:col-span-2">
                  <Label htmlFor="phone" className="flex items-center gap-2">
                    <Phone className="w-4 h-4" />
                    {t("pages:profileSettings.contact.phoneLabel")}
                  </Label>
                  <Input
                    id="phone"
                    placeholder={t("pages:profileSettings.contact.phonePlaceholder")}
                    value={formatPhone(formData.phone)}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value.replace(/\D/g, "").slice(0, 11) })}
                    className={`mt-2 ${formData.phone && formData.phone.length < 11 && formData.phone.length > 0 ? "border-rose-500" : ""}`}
                  />
                  {formData.phone && formData.phone.length < 11 && formData.phone.length > 0 && (
                    <p className="text-sm text-rose-600 mt-1">{t("pages:profileSettings.contact.phoneInvalid")}</p>
                  )}
                </div>

                <div>
                  <Label htmlFor="website" className="flex items-center gap-2">
                    <Globe className="w-4 h-4" />
                    {t("pages:profileSettings.contact.websiteLabel")}
                  </Label>
                  <Input
                    id="website"
                    placeholder="https://example.com"
                    value={formData.website}
                    onChange={(e) => setFormData({ ...formData, website: e.target.value })}
                    onBlur={() => setUrlErrors(e => ({ ...e, website: !isValidUrl(formData.website) }))}
                    className={`mt-2 ${urlErrors.website ? "border-rose-500" : ""}`}
                  />
                  {urlErrors.website && (
                    <p className="text-sm text-rose-600 mt-1">{t("pages:profileSettings.contact.urlInvalid")}</p>
                  )}
                </div>

                <div>
                  <Label htmlFor="linkedin" className="flex items-center gap-2">
                    <Linkedin className="w-4 h-4" />
                    {t("pages:profileSettings.contact.linkedinLabel")}
                  </Label>
                  <Input
                    id="linkedin"
                    placeholder="https://linkedin.com/in/username"
                    value={formData.linkedin}
                    onChange={(e) => setFormData({ ...formData, linkedin: e.target.value })}
                    onBlur={() => setUrlErrors(e => ({ ...e, linkedin: !isValidUrl(formData.linkedin) }))}
                    className={`mt-2 ${urlErrors.linkedin ? "border-rose-500" : ""}`}
                  />
                  {urlErrors.linkedin && (
                    <p className="text-sm text-rose-600 mt-1">{t("pages:profileSettings.contact.urlInvalid")}</p>
                  )}
                </div>
              </div>

              <Button
                type="submit"
                className="bg-indigo-600 hover:bg-indigo-700"
                disabled={updateMutation.isPending || !hasChanges || urlErrors.website || urlErrors.linkedin}
              >
                <Save className="w-4 h-4 mr-2" />
                {updateMutation.isPending ? t("pages:profileSettings.saving") : t("pages:profileSettings.saveButton")}
              </Button>
            </form>
          </TabsContent>

          {/* Bildirimler Tab */}
          <TabsContent value="notifications">
            <form onSubmit={(e) => { e.preventDefault(); updateMutation.mutate(); }} className="space-y-6">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-slate-900">{t("pages:profileSettings.notifications.newTests")}</p>
                    <p className="text-sm text-slate-500">{t("pages:profileSettings.notifications.newTestsDesc")}</p>
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
                    <p className="font-medium text-slate-900">{t("pages:profileSettings.notifications.promotions")}</p>
                    <p className="text-sm text-slate-500">{t("pages:profileSettings.notifications.promotionsDesc")}</p>
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
                    <p className="font-medium text-slate-900">{t("pages:profileSettings.notifications.educatorUpdates")}</p>
                    <p className="text-sm text-slate-500">{t("pages:profileSettings.notifications.educatorUpdatesDesc")}</p>
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
                    <p className="font-medium text-slate-900">{t("pages:profileSettings.notifications.testReminders")}</p>
                    <p className="text-sm text-slate-500">{t("pages:profileSettings.notifications.testRemindersDesc")}</p>
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

              <Button 
                type="submit" 
                className="bg-indigo-600 hover:bg-indigo-700"
                disabled={updateMutation.isPending || !hasChanges}
              >
                <Save className="w-4 h-4 mr-2" />
                {updateMutation.isPending ? t("pages:profileSettings.saving") : t("pages:profileSettings.saveButton")}
              </Button>
            </form>
          </TabsContent>

          {/* Sınav Tercihleri Tab */}
          <TabsContent value="exams">
            <form onSubmit={(e) => { e.preventDefault(); updateMutation.mutate(); }} className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
                  <GraduationCap className="w-5 h-5 text-indigo-600" />
                  {t("pages:profileSettings.exams.title")}
                </h3>
                <p className="text-sm text-slate-500 mb-6">
                  {t("pages:profileSettings.exams.desc")}
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {examTypes.map((exam) => (
                    <label
                      key={exam.id}
                      className={`flex items-center gap-3 p-4 rounded-xl border-2 cursor-pointer transition-all ${
                        (formData.interested_exam_types || []).includes(exam.id)
                          ? "border-indigo-500 bg-indigo-50"
                          : "border-slate-200 hover:border-slate-300 bg-white"
                      }`}
                    >
                      <Checkbox
                        checked={(formData.interested_exam_types || []).includes(exam.id)}
                        onCheckedChange={(checked) => {
                          const current = formData.interested_exam_types || [];
                          setFormData({
                            ...formData,
                            interested_exam_types: checked
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
                  <p className="text-center text-slate-500 py-8">{t("pages:profileSettings.exams.noExamTypes")}</p>
                )}
              </div>

              <Button 
                type="submit" 
                className="bg-indigo-600 hover:bg-indigo-700"
                disabled={updateMutation.isPending || !hasChanges}
              >
                <Save className="w-4 h-4 mr-2" />
                {updateMutation.isPending ? t("pages:profileSettings.saving") : t("pages:profileSettings.saveButton")}
              </Button>
            </form>
          </TabsContent>

          {/* Mali İşlemler Tab */}
          <TabsContent value="financial" className="space-y-6">
            <div className="flex items-center justify-between gap-4">
              {purchases.length > 0 && (
                <Button
                  variant="outline"
                  onClick={() => setRefundModalOpen(true)}
                  className="text-rose-600 border-rose-200 hover:bg-rose-50"
                >
                  <Undo2 className="w-4 h-4 mr-2" />
                  {t("pages:profileSettings.financial.requestRefund")}
                </Button>
              )}
            </div>

            {(purchases.length > 0 || refundRequests.length > 0) && (
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="flex-1 relative">
                    <Input
                      placeholder={t("pages:profileSettings.financial.searchPlaceholder")}
                      value={searchFilter}
                      onChange={(e) => setSearchFilter(e.target.value)}
                      className="pl-10"
                    />
                    <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant={filterType === "all" ? "default" : "outline"}
                      onClick={() => setFilterType("all")}
                      size="sm"
                      className={filterType === "all" ? "bg-indigo-600" : ""}
                    >
                      {t("pages:profileSettings.financial.all")}
                    </Button>
                    <Button
                      variant={filterType === "purchases" ? "default" : "outline"}
                      onClick={() => setFilterType("purchases")}
                      size="sm"
                      className={filterType === "purchases" ? "bg-indigo-600" : ""}
                    >
                      {t("pages:profileSettings.financial.purchases")}
                    </Button>
                    <Button
                      variant={filterType === "refunds" ? "default" : "outline"}
                      onClick={() => setFilterType("refunds")}
                      size="sm"
                      className={filterType === "refunds" ? "bg-indigo-600" : ""}
                    >
                      {t("pages:profileSettings.financial.refunds")}
                    </Button>
                  </div>
                </div>

                <div className="space-y-3">
                  {/* Satın Almalar */}
                  {(filterType === "all" || filterType === "purchases") && purchases
                    .filter((p) => p.test_package_title.toLowerCase().includes(searchFilter.toLowerCase()))
                    .map((purchase) => (
                      <div key={`purchase-${purchase.id}`} className="bg-slate-50 rounded-xl p-4 border border-slate-200">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <ShoppingBag className="w-5 h-5 text-indigo-600" />
                              <p className="font-medium text-slate-900">{purchase.test_package_title}</p>
                            </div>
                            <div className="flex items-center gap-4 text-sm text-slate-500">
                              <span>₺{purchase.price_paid}</span>
                              <span>{new Date(purchase.created_date).toLocaleDateString('tr-TR')}</span>
                            </div>
                          </div>
                          <span className="text-sm font-medium text-indigo-600">{t("pages:profileSettings.financial.purchased")}</span>
                        </div>
                      </div>
                    ))}

                  {/* İade Talepleri */}
                  {(filterType === "all" || filterType === "refunds") && refundRequests
                    .filter((r) => (r.test_package_title ?? "").toLowerCase().includes(searchFilter.toLowerCase()))
                    .map((request) => {
                      const statusConfig = {
                        PENDING: { icon: Clock, color: "text-amber-600", bg: "bg-amber-50", labelKey: "pages:profileSettings.financial.statusLabels.PENDING" },
                        EDUCATOR_APPROVED: { icon: CheckCircle2, color: "text-blue-600", bg: "bg-blue-50", labelKey: "pages:profileSettings.financial.statusLabels.EDUCATOR_APPROVED" },
                        EDUCATOR_REJECTED: { icon: XCircle, color: "text-rose-600", bg: "bg-rose-50", labelKey: "pages:profileSettings.financial.statusLabels.EDUCATOR_REJECTED" },
                        APPEAL_PENDING: { icon: AlertCircle, color: "text-purple-600", bg: "bg-purple-50", labelKey: "pages:profileSettings.financial.statusLabels.APPEAL_PENDING" },
                        ESCALATED: { icon: AlertCircle, color: "text-orange-600", bg: "bg-orange-50", labelKey: "pages:profileSettings.financial.statusLabels.ESCALATED" },
                        APPROVED: { icon: CheckCircle2, color: "text-emerald-600", bg: "bg-emerald-50", labelKey: "pages:profileSettings.financial.statusLabels.APPROVED" },
                        REJECTED: { icon: XCircle, color: "text-slate-600", bg: "bg-slate-50", labelKey: "pages:profileSettings.financial.statusLabels.REJECTED" },
                        // lowercase fallback (old data)
                        pending: { icon: Clock, color: "text-amber-600", bg: "bg-amber-50", labelKey: "pages:profileSettings.financial.statusLabels.pending" },
                        approved: { icon: CheckCircle2, color: "text-emerald-600", bg: "bg-emerald-50", labelKey: "pages:profileSettings.financial.statusLabels.approved" },
                        rejected: { icon: XCircle, color: "text-rose-600", bg: "bg-rose-50", labelKey: "pages:profileSettings.financial.statusLabels.rejected" },
                      };
                      const config = statusConfig[request.status] ?? statusConfig.pending;
                      const Icon = config.icon;
                      const canAppeal = request.status === "EDUCATOR_REJECTED";

                      return (
                        <div key={`refund-${request.id}`} className={`${config.bg} rounded-xl p-4 border border-slate-200`}>
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-2">
                                <Icon className={`w-5 h-5 ${config.color}`} />
                                <p className="font-medium text-slate-900">{request.test_package_title}</p>
                              </div>
                              <p className="text-sm text-slate-600 mb-2">{request.reason}</p>
                              <div className="flex items-center gap-4 text-sm text-slate-500">
                                <span>₺{request.amount}</span>
                                <span>{request.created_date ? new Date(request.created_date).toLocaleDateString('tr-TR') : '-'}</span>
                              </div>
                              {canAppeal && (
                                <p className="text-xs text-rose-600 mt-2">
                                  {t("pages:profileSettings.financial.canAppealHint")}
                                </p>
                              )}
                            </div>
                            <div className="flex flex-col items-end gap-2">
                              <span className={`text-sm font-medium ${config.color}`}>{t(config.labelKey)}</span>
                              {canAppeal && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="text-purple-600 border-purple-200 hover:bg-purple-50 text-xs"
                                  onClick={() => { setAppealRefund(request); setAppealReason(""); setAppealOpen(true); }}
                                >
                                  <MessageSquare className="w-3 h-3 mr-1" />
                                  {t("pages:profileSettings.financial.appealButton")}
                                </Button>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}

                  {/* Sonuç bulunamadı mesajı */}
                  {((filterType === "all" && purchases.filter((p) => p.test_package_title.toLowerCase().includes(searchFilter.toLowerCase())).length === 0 && refundRequests.filter((r) => r.test_package_title.toLowerCase().includes(searchFilter.toLowerCase())).length === 0) ||
                    (filterType === "purchases" && purchases.filter((p) => p.test_package_title.toLowerCase().includes(searchFilter.toLowerCase())).length === 0) ||
                    (filterType === "refunds" && refundRequests.filter((r) => r.test_package_title.toLowerCase().includes(searchFilter.toLowerCase())).length === 0)) && (
                    <p className="text-center text-slate-500 py-8">{t("pages:profileSettings.financial.noResults")}</p>
                  )}
                </div>
              </div>
            )}

            {purchases.length === 0 && refundRequests.length === 0 && (
              <p className="text-center text-slate-500 py-8">{t("pages:profileSettings.financial.noTransactions")}</p>
            )}
          </TabsContent>

          {/* Güvenlik — şifre değiştirme */}
          <TabsContent value="security">
            <form onSubmit={handleChangePassword} className="space-y-6 max-w-md">
              <div className="flex items-center gap-2 text-slate-700 dark:text-slate-200">
                <Lock className="w-5 h-5" />
                <h2 className="text-lg font-semibold">{t("pages:profileSettings.security.title")}</h2>
              </div>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                {t("pages:profileSettings.security.description")}
              </p>

              <div>
                <Label htmlFor="currentPassword" className="flex items-center gap-2">
                  <KeyRound className="w-4 h-4" />
                  {t("pages:profileSettings.security.currentPassword")}
                </Label>
                <Input
                  id="currentPassword"
                  type={showPasswords ? "text" : "password"}
                  autoComplete="current-password"
                  value={passwordForm.currentPassword}
                  onChange={(e) => setPasswordForm({ ...passwordForm, currentPassword: e.target.value })}
                  className="mt-2"
                />
              </div>

              <div>
                <Label htmlFor="newPassword" className="flex items-center gap-2">
                  <Lock className="w-4 h-4" />
                  {t("pages:profileSettings.security.newPassword")}
                </Label>
                <Input
                  id="newPassword"
                  type={showPasswords ? "text" : "password"}
                  autoComplete="new-password"
                  value={passwordForm.newPassword}
                  onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })}
                  className={`mt-2 ${newPwTooShort ? "border-rose-500" : ""}`}
                />
                {newPwTooShort && (
                  <p className="text-sm text-rose-600 mt-1">{t("pages:profileSettings.security.minLength")}</p>
                )}
              </div>

              <div>
                <Label htmlFor="confirmPassword" className="flex items-center gap-2">
                  <Lock className="w-4 h-4" />
                  {t("pages:profileSettings.security.confirmPassword")}
                </Label>
                <Input
                  id="confirmPassword"
                  type={showPasswords ? "text" : "password"}
                  autoComplete="new-password"
                  value={passwordForm.confirmPassword}
                  onChange={(e) => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })}
                  className={`mt-2 ${pwMismatch ? "border-rose-500" : ""}`}
                />
                {pwMismatch && (
                  <p className="text-sm text-rose-600 mt-1">{t("pages:profileSettings.security.mismatch")}</p>
                )}
              </div>

              <button
                type="button"
                onClick={() => setShowPasswords((v) => !v)}
                className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 min-h-10"
              >
                {showPasswords ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                {showPasswords
                  ? t("pages:profileSettings.security.hidePasswords")
                  : t("pages:profileSettings.security.showPasswords")}
              </button>

              <Button
                type="submit"
                className="bg-indigo-600 hover:bg-indigo-700 w-full"
                disabled={changePasswordMutation.isPending || !canSubmitPassword}
              >
                <Save className="w-4 h-4 mr-2" />
                {changePasswordMutation.isPending
                  ? t("pages:profileSettings.security.saving")
                  : t("pages:profileSettings.security.submit")}
              </Button>
            </form>
          </TabsContent>
        </Tabs>
      </div>

      {/* Purchase Selection Modal */}
      {refundModalOpen && !selectedPurchase && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full mx-4">
            <h2 className="text-xl font-bold text-slate-900 mb-4">{t("pages:profileSettings.refundModal.title")}</h2>
            <Input
              placeholder={t("pages:profileSettings.financial.searchPlaceholder")}
              value={searchPurchase}
              onChange={(e) => setSearchPurchase(e.target.value)}
              className="mb-4"
            />
            <div className="space-y-2 max-h-96 overflow-y-auto mb-4">
              {(() => {
                // Sadece HİÇ açılmamış testler için iade alınabilir:
                // - purchase.attempts[] herhangi bir attempt içeriyorsa (IN_PROGRESS, PAUSED, SUBMITTED, TIMEOUT)
                //   test "Devam Et" veya "İncele" durumuna gelmiş demektir → listeden çıkar.
                const eligible = purchases.filter((p) => {
                  const hasAttempts = Array.isArray(p.attempts) && p.attempts.length > 0;
                  const hasMainAttempt = !!p.attempt;
                  return !hasAttempts && !hasMainAttempt;
                });
                const filtered = eligible.filter((p) =>
                  (p.test_package_title ?? "").toLowerCase().includes(searchPurchase.toLowerCase()),
                );
                if (filtered.length === 0) {
                  return (
                    <div className="text-center py-6 px-3 space-y-2">
                      <p className="text-sm text-slate-500">
                        {purchases.length === 0
                          ? t("pages:profileSettings.refundModal.noPurchases")
                          : eligible.length === 0
                          ? t("pages:profileSettings.refundModal.noEligible")
                          : t("pages:profileSettings.refundModal.notFound")}
                      </p>
                      {purchases.length > 0 && eligible.length === 0 && (
                        <p className="text-xs text-slate-400">
                          {t("pages:profileSettings.refundModal.eligibleHint")}
                        </p>
                      )}
                    </div>
                  );
                }
                return filtered.map((purchase) => (
                  <button
                    key={purchase.id}
                    onClick={() => {
                      setSelectedPurchase(purchase);
                      setSearchPurchase("");
                    }}
                    className="w-full text-left p-4 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
                  >
                    <p className="font-medium text-slate-900">{purchase.test_package_title}</p>
                    <div className="flex items-center gap-4 mt-1 text-sm text-slate-500">
                      <span>₺{purchase.price_paid}</span>
                      <span>{new Date(purchase.created_date).toLocaleDateString('tr-TR')}</span>
                    </div>
                  </button>
                ));
              })()}
            </div>
            <Button variant="outline" onClick={() => {
              setRefundModalOpen(false);
              setSearchPurchase("");
            }} className="w-full">
              {t("pages:profileSettings.refundModal.cancel")}
            </Button>
          </div>
        </div>
      )}

      <RefundRequestModal
        open={refundModalOpen && !!selectedPurchase}
        onClose={() => {
          setRefundModalOpen(false);
          setSelectedPurchase(null);
        }}
        purchase={selectedPurchase}
        onSubmit={(data) => refundMutation.mutate(data)}
        isLoading={refundMutation.isPending}
      />

      {/* İtiraz Dialog */}
      <Dialog open={appealOpen} onOpenChange={(o) => { if (!o) { setAppealOpen(false); setAppealRefund(null); setAppealReason(""); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("pages:profileSettings.appealDialog.title")}</DialogTitle>
          </DialogHeader>
          {appealRefund && (
            <div className="space-y-4 mt-2">
              <div className="p-3 bg-slate-50 rounded-lg text-sm">
                {/* test_package_title user-generated — çevrilmez */}
                <p className="font-medium text-slate-900">{appealRefund.test_package_title}</p>
                <p className="text-slate-500 mt-1">{t("pages:profileSettings.appealDialog.rejected")}</p>
              </div>
              <Textarea
                value={appealReason}
                onChange={(e) => setAppealReason(e.target.value)}
                placeholder={t("pages:profileSettings.appealDialog.placeholder")}
                rows={4}
              />
              <div className="flex gap-3 justify-end">
                <Button variant="ghost" size="sm" onClick={() => setAppealOpen(false)}>
                  {t("pages:profileSettings.appealDialog.cancel")}
                </Button>
                <Button
                  className="bg-purple-600 hover:bg-purple-700"
                  size="sm"
                  disabled={appealMutation.isPending || appealReason.trim().length < 5}
                  onClick={() => appealMutation.mutate()}
                >
                  <MessageSquare className="w-4 h-4 mr-1.5" />
                  {t("pages:profileSettings.appealDialog.submit")}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Hassas alan değişikliği OTP dialog'u */}
      <SensitiveProfileOtpDialog
        open={otpDialogOpen}
        onOpenChange={setOtpDialogOpen}
        pendingFields={pendingSensitiveFields || {}}
        onSuccess={handleOtpSuccess}
      />
    </div>
  );
}