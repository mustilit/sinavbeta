import { useState } from "react";
import { Layers } from "lucide-react";
import { TunnelGrid } from "@/components/tunnel/TunnelGrid";

/**
 * Aday tünel sayfası (geriye uyum / doğrudan link). Tünel içeriği artık Keşfet
 * ve Satın Aldıklarım sayfalarında sekme olarak da sunulur; bu sayfa ikisini
 * tek yerde toplar: "Keşfet" (satın alınmamış) + "Satın Aldıklarım".
 */
export default function Tunnels() {
  const [tab, setTab] = useState("discover"); // "discover" | "mine"
  const tabBtn = (key, label) => (
    <button
      type="button"
      onClick={() => setTab(key)}
      className={
        "inline-flex items-center gap-2 whitespace-nowrap border-b-2 -mb-px px-4 py-2.5 min-h-10 text-sm font-medium transition-colors " +
        (tab === key ? "border-indigo-600 text-indigo-600" : "border-transparent text-slate-600 hover:text-slate-900")
      }
    >
      {label}
    </button>
  );

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <header className="mb-5">
        <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900">
          <Layers className="h-6 w-6 text-indigo-600" /> Tüneller
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Bir konuyu, çeldirici şıklara rağmen tüm sorularını doğru cevaplayana kadar derinlemesine öğren.
        </p>
      </header>
      <div className="mb-5 flex flex-wrap gap-1 border-b border-slate-200">
        {tabBtn("discover", "Keşfet")}
        {tabBtn("mine", "Satın Aldıklarım")}
      </div>
      <TunnelGrid mode={tab} />
    </div>
  );
}
