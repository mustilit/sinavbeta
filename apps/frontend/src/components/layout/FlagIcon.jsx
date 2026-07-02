/**
 * FlagIcon — basit inline SVG bayraklar.
 *
 * Tarayıcı font'larına bağımlı kalmadan (özellikle Chrome+Windows
 * regional-indicator emojilerini bayrak yerine harf gösterir) tüm
 * platformlarda tutarlı görünüm sağlar.
 *
 * Bayraklar tasarım olarak basitleştirilmiştir; mükemmel doğruluk
 * yerine tanınabilirlik öncelikli.
 *
 * Kullanım: <FlagIcon code="tr" className="w-5 h-4" />
 */
export function FlagIcon({ code, className = "w-5 h-4 rounded-sm overflow-hidden" }) {
  const sharedProps = {
    viewBox: "0 0 30 20",
    xmlns: "http://www.w3.org/2000/svg",
    className,
    role: "img",
    "aria-hidden": true,
    preserveAspectRatio: "xMidYMid slice",
  };

  switch ((code || "").toLowerCase()) {
    case "tr":
      // Türk bayrağı — TS-EN ISO oran 2:3 (30×20 viewBox).
      // Hilal: dış çember r=5, kesim çemberi r=4 sağa 1.25 birim ofsetli (kırmızıyla maskelenir).
      // Yıldız: beş köşeli, dış yarıçap 2.5 / iç yarıçap 2.5·sin18°/sin54° ≈ 0.955.
      return (
        <svg {...sharedProps}>
          <rect width="30" height="20" fill="#E30A17" />
          {/* Hilal: beyaz dolu daire + üzerine kırmızı kesim dairesi */}
          <circle cx="11" cy="10" r="5" fill="#fff" />
          <circle cx="12.25" cy="10" r="4" fill="#E30A17" />
          {/* Beş köşeli yıldız (5/5 tepe), tam orantılı 5'lik nokta */}
          <polygon
            fill="#fff"
            points="17.5,7.5 18.06,9.23 19.88,9.23 18.41,10.30 18.97,12.02 17.5,10.96 16.03,12.02 16.59,10.30 15.12,9.23 16.94,9.23"
          />
        </svg>
      );
    case "en":
    case "gb":
      // Union Jack — basitleştirilmiş
      return (
        <svg {...sharedProps}>
          <rect width="30" height="20" fill="#012169" />
          {/* Diyagonaller (beyaz) */}
          <path d="M0,0 L30,20 M30,0 L0,20" stroke="#fff" strokeWidth="3" />
          {/* Diyagonaller (kırmızı) */}
          <path d="M0,0 L30,20 M30,0 L0,20" stroke="#C8102E" strokeWidth="1.5" />
          {/* Haç (beyaz) */}
          <path d="M15,0 V20 M0,10 H30" stroke="#fff" strokeWidth="5" />
          {/* Haç (kırmızı) */}
          <path d="M15,0 V20 M0,10 H30" stroke="#C8102E" strokeWidth="3" />
        </svg>
      );
    case "es":
      return (
        <svg {...sharedProps}>
          <rect width="30" height="20" fill="#AA151B" />
          <rect y="5" width="30" height="10" fill="#F1BF00" />
        </svg>
      );
    case "zh":
      // Çin Halk Cumhuriyeti — kırmızı zemin + sol-üst sarı yıldız
      return (
        <svg {...sharedProps}>
          <rect width="30" height="20" fill="#EE1C25" />
          <polygon
            points="6,3 7,5.5 9.5,5.5 7.5,7 8.3,9.5 6,8 3.7,9.5 4.5,7 2.5,5.5 5,5.5"
            fill="#FFFF00"
          />
        </svg>
      );
    case "de":
      return (
        <svg {...sharedProps}>
          <rect width="30" height="6.67" y="0" fill="#000" />
          <rect width="30" height="6.67" y="6.67" fill="#DD0000" />
          <rect width="30" height="6.67" y="13.33" fill="#FFCE00" />
        </svg>
      );
    default:
      return (
        <svg {...sharedProps}>
          <rect width="30" height="20" fill="#9ca3af" />
        </svg>
      );
  }
}
