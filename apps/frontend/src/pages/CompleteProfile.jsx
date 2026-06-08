import { useState, useEffect } from "react";
import { auth } from "@/api/dalClient";
import { useAuth } from "@/lib/AuthContext";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { User, Phone, MapPin, Save, Globe } from "lucide-react";

const TURKISH_CITIES = [
  "Adana", "Adıyaman", "Afyonkarahisar", "Ağrı", "Aksaray", "Amasya", "Ankara", "Antalya",
  "Ardahan", "Artvin", "Aydın", "Balıkesir", "Bartın", "Batman", "Bayburt", "Bilecik",
  "Bingöl", "Bitlis", "Bolu", "Burdur", "Bursa", "Çanakkale", "Çankırı", "Çorum",
  "Denizli", "Diyarbakır", "Düzce", "Edirne", "Elazığ", "Erzincan", "Erzurum", "Eskişehir",
  "Gaziantep", "Giresun", "Gümüşhane", "Hakkari", "Hatay", "Iğdır", "Isparta", "İstanbul",
  "İzmir", "Kahramanmaraş", "Karabük", "Karaman", "Kars", "Kastamonu", "Kayseri", "Kırıkkale",
  "Kırklareli", "Kırşehir", "Kilis", "Kocaeli", "Konya", "Kütahya", "Malatya", "Manisa",
  "Mardin", "Mersin", "Muğla", "Muş", "Nevşehir", "Niğde", "Ordu", "Osmaniye",
  "Rize", "Sakarya", "Samsun", "Siirt", "Sinop", "Sivas", "Şanlıurfa", "Şırnak",
  "Tekirdağ", "Tokat", "Trabzon", "Tunceli", "Uşak", "Van", "Yalova", "Yozgat", "Zonguldak"
];

const COUNTRY_CODES = [
  { code: "+1", country: "ABD/Kanada" },
  { code: "+44", country: "İngiltere" },
  { code: "+49", country: "Almanya" },
  { code: "+33", country: "Fransa" },
  { code: "+39", country: "İtalya" },
  { code: "+34", country: "İspanya" },
  { code: "+31", country: "Hollanda" },
  { code: "+32", country: "Belçika" },
  { code: "+41", country: "İsviçre" },
  { code: "+43", country: "Avusturya" },
  { code: "+46", country: "İsveç" },
  { code: "+47", country: "Norveç" },
  { code: "+45", country: "Danimarka" },
  { code: "+358", country: "Finlandiya" },
  { code: "+7", country: "Rusya" },
  { code: "+86", country: "Çin" },
  { code: "+81", country: "Japonya" },
  { code: "+82", country: "Güney Kore" },
  { code: "+91", country: "Hindistan" },
  { code: "+971", country: "BAE" },
  { code: "+966", country: "Suudi Arabistan" },
  { code: "+61", country: "Avustralya" },
  { code: "+64", country: "Yeni Zelanda" }
];

export default function CompleteProfile() {
  const navigate = useNavigate();
  const { user, isLoadingAuth } = useAuth();
  const [formData, setFormData] = useState({
    phone: "",
    city: "",
    country_code: "+90"
  });
  const [saving, setSaving] = useState(false);
  const [isInternational, setIsInternational] = useState(false);

  const loading = isLoadingAuth;

  useEffect(() => {
    if (loading) return;
    if (!user) {
      navigate(createPageUrl("Home"));
      return;
    }
    if (user.phone && user.city) {
      // Profili zaten tamam olan aday bu sayfaya düşerse ana sayfaya gönder.
      navigate(createPageUrl("Home"), { replace: true });
      return;
    }
    setFormData({
      phone: user.phone || "",
      city: user.city || "",
      country_code: user.country_code || "+90"
    });
    if (user.city === "Yurt Dışı") {
      setIsInternational(true);
    }
  }, [user, loading, navigate]);

  const formatPhoneNumber = (value) => {
    // Sadece rakamları al
    const numbers = value.replace(/\D/g, '');
    
    // Yurt dışı numarası ise sadece rakamları döndür (maksimum 15 karakter)
    if (isInternational) {
      return numbers.slice(0, 15);
    }
    
    // 0 ile başlamazsa ekle
    let formatted = numbers;
    if (formatted.length > 0 && formatted[0] !== '0') {
      formatted = '0' + formatted;
    }
    
    // Maksimum 11 karakter (05XX XXX XX XX)
    formatted = formatted.slice(0, 11);
    
    // Format uygula: 05XX XXX XX XX
    if (formatted.length > 4) {
      formatted = formatted.slice(0, 4) + ' ' + formatted.slice(4);
    }
    if (formatted.length > 8) {
      formatted = formatted.slice(0, 8) + ' ' + formatted.slice(8);
    }
    if (formatted.length > 11) {
      formatted = formatted.slice(0, 11) + ' ' + formatted.slice(11);
    }
    
    return formatted;
  };

  const handlePhoneChange = (e) => {
    const formatted = formatPhoneNumber(e.target.value);
    setFormData({ ...formData, phone: formatted });
  };

  const handleCityChange = (value) => {
    setFormData({ ...formData, city: value });
    
    if (value === "Yurt Dışı") {
      setIsInternational(true);
      // Yurt dışı seçilince telefonu temizle
      setFormData(prev => ({ ...prev, city: value, phone: "", country_code: "+1" }));
    } else {
      setIsInternational(false);
      // Türkiye seçilince ülke kodunu +90 yap ve telefonu temizle
      setFormData(prev => ({ ...prev, city: value, phone: "", country_code: "+90" }));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!formData.phone.trim() || !formData.city.trim()) {
      toast.error("Lütfen tüm alanları doldurun");
      return;
    }

    // Telefon numarası validasyonu
    const phoneNumbers = formData.phone.replace(/\D/g, '');
    if (isInternational) {
      if (phoneNumbers.length < 7 || phoneNumbers.length > 15) {
        toast.error("Lütfen geçerli bir telefon numarası girin");
        return;
      }
    } else {
      if (phoneNumbers.length !== 11 || !phoneNumbers.startsWith('0')) {
        toast.error("Lütfen geçerli bir telefon numarası girin");
        return;
      }
    }

    setSaving(true);
    try {
      // Get preferred user type from localStorage
      const preferredUserType = sessionStorage.getItem('preferred_user_type');
      const role = preferredUserType === 'educator' ? 'educator' : 'user';
      
      await auth.updateMe({
        ...formData,
        role: role
      });
      
      toast.success("Profiliniz tamamlandı");
      
      // Eğitici → EducatorSettings. Aday → telefon+şehir alındıktan sonra doğrudan
      // ANA SAYFA (SelectExamTypes onboarding'i zorunlu değil; ilgi alanı sonra
      // seçilebilir). replace: true → geri tuşu fullscreen onboarding'e dönmesin.
      if (role === 'educator') {
        navigate(createPageUrl("EducatorSettings"));
      } else {
        navigate(createPageUrl("Home"), { replace: true });
      }
    } catch (error) {
      toast.error("Profil güncellenemedi");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        <div className="bg-white rounded-2xl shadow-xl p-8 border border-slate-100">
          <div className="flex items-center justify-center mb-6">
            <div className="w-20 h-20 bg-gradient-to-br from-indigo-100 to-violet-100 rounded-full flex items-center justify-center">
              <User className="w-10 h-10 text-indigo-600" />
            </div>
          </div>

          <div className="text-center mb-8">
            <h1 className="text-2xl font-bold text-slate-900 mb-2">Hoş Geldiniz!</h1>
            <p className="text-slate-600">
              {user?.full_name || "Profil"} bilgilerinizi tamamlayın
            </p>
            <p className="text-sm text-slate-500 mt-1">{user?.email}</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <Label htmlFor="city" className="flex items-center gap-2 mb-2">
                <MapPin className="w-4 h-4" />
                Şehir
              </Label>
              <Select
                value={formData.city}
                onValueChange={handleCityChange}
                required
              >
                <SelectTrigger>
                  <SelectValue placeholder="Şehir seçin" />
                </SelectTrigger>
                <SelectContent className="max-h-[300px]">
                  <SelectItem value="Yurt Dışı">🌍 Yurt Dışı</SelectItem>
                  {TURKISH_CITIES.map((city) => (
                    <SelectItem key={city} value={city}>
                      {city}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {isInternational && (
              <div>
                <Label htmlFor="country_code" className="flex items-center gap-2 mb-2">
                  <Globe className="w-4 h-4" />
                  Ülke Kodu
                </Label>
                <Select
                  value={formData.country_code}
                  onValueChange={(value) => setFormData({ ...formData, country_code: value })}
                  required
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Ülke kodu seçin" />
                  </SelectTrigger>
                  <SelectContent className="max-h-[300px]">
                    {COUNTRY_CODES.map((item) => (
                      <SelectItem key={item.code} value={item.code}>
                        {item.code} ({item.country})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div>
              <Label htmlFor="phone" className="flex items-center gap-2 mb-2">
                <Phone className="w-4 h-4" />
                Telefon Numarası
              </Label>
              <div className="flex gap-2">
                {isInternational && (
                  <div className="w-20 shrink-0">
                    <Input
                      value={formData.country_code}
                      disabled
                      className="text-center bg-slate-50"
                    />
                  </div>
                )}
                <Input
                  id="phone"
                  type="tel"
                  placeholder={isInternational ? "1234567890" : "0532 123 45 67"}
                  value={formData.phone}
                  onChange={handlePhoneChange}
                  maxLength={isInternational ? 15 : 14}
                  required
                  className="flex-1"
                />
              </div>
              <p className="text-xs text-slate-500 mt-1">
                {isInternational ? "Ülke kodu olmadan numaranızı girin" : "Format: 05XX XXX XX XX"}
              </p>
            </div>

            <Button 
              type="submit" 
              className="w-full bg-indigo-600 hover:bg-indigo-700"
              disabled={saving}
            >
              <Save className="w-4 h-4 mr-2" />
              {saving ? "Kaydediliyor..." : "Profili Tamamla"}
            </Button>
          </form>

          <p className="text-xs text-slate-500 text-center mt-6">
            Bu bilgiler güvenli bir şekilde saklanır ve yalnızca sizinle iletişim için kullanılır.
          </p>
        </div>
      </div>
    </div>
  );
}