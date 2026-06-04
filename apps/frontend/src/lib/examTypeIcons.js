/**
 * Sınav türü logo havuzu.
 *
 * Hepsi lucide çizgi (outline) ikon — tutarlı görsel dil. Admin, sınav türü
 * oluştur/güncelleme ekranında bu havuzdan KEY seçer; key `metadata.icon`'da saklanır
 * (URL değil). Gösterim tarafı `getExamTypeIcon(key)` ile key → bileşen çözer.
 *
 * Yeni ikon eklerken: listeye yeni satır ekle; MEVCUT key'leri DEĞİŞTİRME (DB'de saklı).
 */
import {
  GraduationCap, BookOpen, Award, Calculator, FlaskConical, Atom, Microscope,
  Stethoscope, HeartPulse, Scale, Landmark, Globe, Languages, Brain, PenTool,
  Ruler, Cpu, Code, Music, Palette, Briefcase, Building2, Dumbbell, Leaf,
  // Sprint genişletme — ek konular
  Sigma, Binary, Percent, LineChart, BarChart3, TestTube, Dna, Telescope,
  Magnet, Mountain, Compass, Sprout, Tractor, TreePine, PawPrint, Baby,
  Syringe, Pill, Activity, Gavel, ScrollText, Crown, Castle, Church, Vote,
  Handshake, Banknote, Coins, Presentation, School, Notebook, Library,
  PencilRuler, Drama, Paintbrush, Camera, Film, Mic, Newspaper, Utensils,
  ChefHat, Terminal, Database, Network, Keyboard, Wrench, Hammer, HardHat,
  ShieldCheck, Factory, Gauge, Plane, Rocket, Ship, Shield, Swords, Target,
  Puzzle, Lightbulb,
} from "lucide-react";

// label = admin'in seçerken gördüğü konu ipucu (TR — admin paneli TR).
export const EXAM_TYPE_ICONS = [
  // --- Çekirdek (ilk sürüm — key'ler DB'de, DEĞİŞTİRME) ---
  { key: "graduation-cap", Icon: GraduationCap, label: "Akademik / Genel" },
  { key: "book-open",      Icon: BookOpen,      label: "Okuma / Edebiyat" },
  { key: "award",          Icon: Award,         label: "Sertifika / Başarı" },
  { key: "calculator",     Icon: Calculator,    label: "Matematik" },
  { key: "flask",          Icon: FlaskConical,  label: "Kimya" },
  { key: "atom",           Icon: Atom,          label: "Fizik" },
  { key: "microscope",     Icon: Microscope,    label: "Biyoloji / Lab" },
  { key: "stethoscope",    Icon: Stethoscope,   label: "Tıp (TUS)" },
  { key: "heart-pulse",    Icon: HeartPulse,    label: "Sağlık" },
  { key: "scale",          Icon: Scale,         label: "Hukuk / Adalet" },
  { key: "landmark",       Icon: Landmark,      label: "Devlet / Tarih (KPSS)" },
  { key: "globe",          Icon: Globe,         label: "Coğrafya / Genel" },
  { key: "languages",      Icon: Languages,     label: "Dil (YDS / YÖKDİL)" },
  { key: "brain",          Icon: Brain,         label: "Genel Yetenek" },
  { key: "pen-tool",       Icon: PenTool,       label: "Yazım / Tasarım" },
  { key: "ruler",          Icon: Ruler,         label: "Geometri / Teknik" },
  { key: "cpu",            Icon: Cpu,           label: "Bilişim" },
  { key: "code",           Icon: Code,          label: "Yazılım" },
  { key: "music",          Icon: Music,         label: "Müzik" },
  { key: "palette",        Icon: Palette,       label: "Sanat / Tasarım" },
  { key: "briefcase",      Icon: Briefcase,     label: "Meslek / İş" },
  { key: "building",       Icon: Building2,     label: "Mimarlık / İnşaat" },
  { key: "dumbbell",       Icon: Dumbbell,      label: "Spor / Beden" },
  { key: "leaf",           Icon: Leaf,          label: "Çevre / Ziraat" },

  // --- Matematik / Veri ---
  { key: "sigma",          Icon: Sigma,         label: "İstatistik / Olasılık" },
  { key: "percent",        Icon: Percent,       label: "Oran / Yüzde" },
  { key: "binary",         Icon: Binary,        label: "Mantık / İkili Sistem" },
  { key: "line-chart",     Icon: LineChart,     label: "Grafik / Trend" },
  { key: "bar-chart-3",    Icon: BarChart3,     label: "Veri / İstatistik" },

  // --- Fen bilimleri ---
  { key: "test-tube",      Icon: TestTube,      label: "Deney / Laboratuvar" },
  { key: "dna",            Icon: Dna,           label: "Genetik / Biyoloji" },
  { key: "telescope",      Icon: Telescope,     label: "Astronomi / Gökbilim" },
  { key: "magnet",         Icon: Magnet,        label: "Manyetizma / Fizik" },

  // --- Coğrafya / Doğa / Tarım ---
  { key: "mountain",       Icon: Mountain,      label: "Coğrafya / Yer Bilimi" },
  { key: "compass",        Icon: Compass,       label: "Pusula / Yön Bulma" },
  { key: "sprout",         Icon: Sprout,        label: "Tarım / Ziraat" },
  { key: "tractor",        Icon: Tractor,       label: "Tarım Makineleri" },
  { key: "tree-pine",      Icon: TreePine,      label: "Orman / Çevre" },
  { key: "paw-print",      Icon: PawPrint,      label: "Veterinerlik / Hayvan" },

  // --- Sağlık dalları ---
  { key: "syringe",        Icon: Syringe,       label: "Hemşirelik / Aşılama" },
  { key: "pill",           Icon: Pill,          label: "Eczacılık / Farmakoloji" },
  { key: "activity",       Icon: Activity,      label: "Yaşamsal Bulgular" },
  { key: "baby",           Icon: Baby,          label: "Çocuk Gelişimi / Okul Öncesi" },

  // --- Sosyal / Hukuk / Tarih / Din ---
  { key: "gavel",          Icon: Gavel,         label: "Hukuk / Yargı (Tokmak)" },
  { key: "scroll-text",    Icon: ScrollText,    label: "Tarih / Belge" },
  { key: "crown",          Icon: Crown,         label: "Tarih / Hanedan" },
  { key: "castle",         Icon: Castle,        label: "Tarih / Mimari Miras" },
  { key: "church",         Icon: Church,        label: "Din / İlahiyat" },
  { key: "vote",           Icon: Vote,          label: "Vatandaşlık / Siyaset" },
  { key: "handshake",      Icon: Handshake,     label: "Sosyal / İş Birliği" },

  // --- Ekonomi / İş / Eğitim ---
  { key: "banknote",       Icon: Banknote,      label: "Ekonomi / Finans" },
  { key: "coins",          Icon: Coins,         label: "Muhasebe / Para" },
  { key: "presentation",   Icon: Presentation,  label: "Eğitim / ÖABT" },
  { key: "school",         Icon: School,        label: "Okul / Öğretmenlik" },
  { key: "notebook",       Icon: Notebook,      label: "Ders Notu / Genel" },
  { key: "library",        Icon: Library,       label: "Kütüphane / Edebiyat" },

  // --- Sanat / Medya ---
  { key: "pencil-ruler",   Icon: PencilRuler,   label: "Teknik Resim / Tasarım" },
  { key: "paintbrush",     Icon: Paintbrush,    label: "Resim / Güzel Sanatlar" },
  { key: "drama",          Icon: Drama,         label: "Tiyatro / Sahne Sanatları" },
  { key: "camera",         Icon: Camera,        label: "Fotoğraf / Medya" },
  { key: "film",           Icon: Film,          label: "Sinema / Film" },
  { key: "mic",            Icon: Mic,           label: "Konuşma / İletişim" },
  { key: "newspaper",      Icon: Newspaper,     label: "Gazetecilik / Basın" },
  { key: "utensils",       Icon: Utensils,      label: "Gastronomi / Mutfak" },
  { key: "chef-hat",       Icon: ChefHat,       label: "Aşçılık / Gastronomi" },

  // --- Bilişim / Teknik ---
  { key: "terminal",       Icon: Terminal,      label: "Komut Satırı / Yazılım" },
  { key: "database",       Icon: Database,      label: "Veritabanı / Bilişim" },
  { key: "network",        Icon: Network,       label: "Ağ / Sistem" },
  { key: "keyboard",       Icon: Keyboard,      label: "Klavye / Ofis" },
  { key: "wrench",         Icon: Wrench,        label: "Teknik / Bakım Onarım" },
  { key: "hammer",         Icon: Hammer,        label: "İnşaat / El İşi" },
  { key: "hard-hat",       Icon: HardHat,       label: "İş Sağlığı ve Güvenliği" },
  { key: "shield-check",   Icon: ShieldCheck,   label: "Güvenlik / Denetim" },
  { key: "factory",        Icon: Factory,       label: "Endüstri / Üretim" },
  { key: "gauge",          Icon: Gauge,         label: "Ölçüm / Mühendislik" },

  // --- Ulaşım / Savunma ---
  { key: "plane",          Icon: Plane,         label: "Havacılık / Pilotaj" },
  { key: "rocket",         Icon: Rocket,        label: "Uzay / Havacılık" },
  { key: "ship",           Icon: Ship,          label: "Denizcilik / Gemicilik" },
  { key: "shield",         Icon: Shield,        label: "Askeri / MSÜ" },
  { key: "swords",         Icon: Swords,        label: "Askeri / Savunma" },

  // --- Genel yetenek / Mantık ---
  { key: "target",         Icon: Target,        label: "Hedef / Genel Yetenek" },
  { key: "puzzle",         Icon: Puzzle,        label: "Mantık / Bulmaca" },
  { key: "lightbulb",      Icon: Lightbulb,     label: "Fikir / Genel Kültür" },
];

const ICON_MAP = Object.fromEntries(EXAM_TYPE_ICONS.map((e) => [e.key, e.Icon]));

/** key → lucide bileşeni. Bilinmeyen/boş key → GraduationCap (güvenli fallback). */
export function getExamTypeIcon(key) {
  return (key && ICON_MAP[key]) || GraduationCap;
}
