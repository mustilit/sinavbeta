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

export default function ExamTypes() {
  const { t } = useTranslation(["pages"]);
  const [searchQuery, setSearchQuery] = useState("");

  const { data: examTypes = [], isLoading } = useQuery({
    queryKey: ["examTypes"],
    queryFn: () => entities.ExamType.filter({ is_active: true }),
  });

  const { data: allTests = [] } = useQuery({
    queryKey: ["allPublishedTests"],
    queryFn: () => entities.TestPackage.filter({ is_published: true }),
  });

  // Count tests for each exam type
  const examTypesWithCount = examTypes.map((examType) => ({
    ...examType,
    testCount: allTests.filter((test) => test.exam_type_id === examType.id).length,
  }));

  const filteredExamTypes = examTypesWithCount.filter((examType) =>
    !searchQuery || examType.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900">{t("pages:titles.examTypes")}</h1>
        <p className="text-slate-500 mt-2">{t("pages:titles.examTypesDesc", { defaultValue: "" })}</p>
      </div>

      {/* Search */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 mb-8">
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
          <Input
            placeholder="Sınav türü ara..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-12 h-12 border-slate-200"
          />
        </div>
      </div>

      {/* Results */}
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
      ) : filteredExamTypes.length === 0 ? (
        <div className="text-center py-20">
          <div className="w-20 h-20 mx-auto bg-slate-100 rounded-full flex items-center justify-center mb-4">
            <Search className="w-10 h-10 text-slate-400" />
          </div>
          <h3 className="text-xl font-semibold text-slate-900">Sınav türü bulunamadı</h3>
          <p className="text-slate-500 mt-2">Farklı bir arama terimi deneyin</p>
        </div>
      ) : (
        <>
          <p className="text-sm text-slate-500 mb-6">{filteredExamTypes.length} sınav türü bulundu</p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {filteredExamTypes.map((examType) => {
              const ExamIcon = getExamTypeIcon(examType.icon);
              return (
              <Link
                key={examType.id}
                to={createPageUrl("Explore") + `?exam_type=${examType.id}`}
                className="group bg-white rounded-2xl border border-slate-100 p-6 hover:shadow-xl hover:border-indigo-200 transition-all"
              >
                <div className="flex flex-col items-center text-center">
                  <div className="w-16 h-16 bg-gradient-to-br from-indigo-100 to-violet-100 rounded-2xl flex items-center justify-center mb-4 overflow-hidden group-hover:scale-110 transition-transform">
                    {examType.iconUrl && !examType.icon
                      ? <img src={examType.iconUrl} alt="" className="w-full h-full object-cover" />
                      : <ExamIcon className="w-8 h-8 text-indigo-600" />}
                  </div>
                  <h3 className="font-semibold text-lg text-slate-900 group-hover:text-indigo-600 transition-colors mb-2">
                    {examType.name}
                  </h3>
                  {examType.description && (
                    <p className="text-sm text-slate-500 mb-3 line-clamp-2">
                      {examType.description}
                    </p>
                  )}
                  <Badge variant="outline" className="mt-auto">
                    <BookOpen className="w-3 h-3 mr-1" />
                    {examType.testCount} Test
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