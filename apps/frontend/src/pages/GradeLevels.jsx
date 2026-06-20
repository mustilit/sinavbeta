import { useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { createPageUrl } from "@/utils";
import { entities } from "@/api/dalClient";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search, BookOpen } from "lucide-react";
import { getExamTypeIcon } from "@/lib/examTypeIcons";

/** Sınıflar — public liste (ExamTypes deseni). Ana sayfa "Sınıflar" bandı "Tümünü Gör" buraya gider. */
export default function GradeLevels() {
  const { t } = useTranslation(["pages"]);
  const [searchQuery, setSearchQuery] = useState("");

  const { data: gradeLevels = [], isLoading } = useQuery({
    queryKey: ["gradeLevels", "active"],
    queryFn: () => entities.GradeLevel.filter({ is_active: true }),
  });

  const { data: allTests = [] } = useQuery({
    queryKey: ["allPublishedTests"],
    queryFn: () => entities.TestPackage.filter({ is_published: true }),
  });

  const withCount = gradeLevels.map((g) => ({
    ...g,
    testCount: allTests.filter((test) => test.grade_level_id === g.id).length,
  }));

  const filtered = withCount.filter((g) =>
    !searchQuery || g.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900">{t("pages:titles.gradeLevels", { defaultValue: "Sınıflar" })}</h1>
        <p className="text-slate-500 mt-2">{t("pages:titles.gradeLevelsDesc", { defaultValue: "" })}</p>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 p-4 mb-8">
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
          <Input
            placeholder={t("pages:explore.filter.gradeLevel", { defaultValue: "Sınıf" }) + " ara..."}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-12 h-12 border-slate-200"
          />
        </div>
      </div>

      {isLoading ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
            <div key={i} className="bg-white rounded-2xl border border-slate-200 p-6 h-32 animate-pulse">
              <div className="space-y-3">
                <div className="h-5 bg-slate-200 rounded w-3/4" />
                <div className="h-4 bg-slate-200 rounded w-1/2" />
              </div>
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20">
          <div className="w-20 h-20 mx-auto bg-slate-100 rounded-full flex items-center justify-center mb-4">
            <Search className="w-10 h-10 text-slate-400" />
          </div>
          <h3 className="text-xl font-semibold text-slate-900">Sınıf bulunamadı</h3>
          <p className="text-slate-500 mt-2">Farklı bir arama terimi deneyin</p>
        </div>
      ) : (
        <>
          <p className="text-sm text-slate-500 mb-6">{filtered.length} sınıf bulundu</p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {filtered.map((g) => {
              const GradeIcon = getExamTypeIcon(g.icon);
              return (
                <Link
                  key={g.id}
                  to={createPageUrl("Explore") + `?grade_level=${g.id}`}
                  className="group bg-white rounded-2xl border border-slate-100 p-6 hover:shadow-xl hover:border-indigo-200 transition-all"
                >
                  <div className="flex flex-col items-center text-center">
                    <div className="w-16 h-16 bg-gradient-to-br from-indigo-100 to-violet-100 rounded-2xl flex items-center justify-center mb-4 overflow-hidden group-hover:scale-110 transition-transform">
                      {g.iconUrl && !g.icon
                        ? <img src={g.iconUrl} alt="" className="w-full h-full object-cover" />
                        : <GradeIcon className="w-8 h-8 text-indigo-600" />}
                    </div>
                    <h3 className="font-semibold text-lg text-slate-900 group-hover:text-indigo-600 transition-colors mb-2">
                      {g.name}
                    </h3>
                    {g.description && (
                      <p className="text-sm text-slate-500 mb-3 line-clamp-2">{g.description}</p>
                    )}
                    <Badge variant="outline" className="mt-auto">
                      <BookOpen className="w-3 h-3 mr-1" />
                      {g.testCount} Test
                    </Badge>
                  </div>
                </Link>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
