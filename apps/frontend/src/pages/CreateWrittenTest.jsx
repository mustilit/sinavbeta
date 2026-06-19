import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation } from "@tanstack/react-query";
import { writtenTests } from "@/api/dalClient";
import { entities, topics as topicsApi } from "@/api/dalClient";
import { useAuth } from "@/lib/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { TopicCombobox } from "@/components/ui/TopicCombobox";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  ArrowLeft, Plus, Package, BookOpen, Eye, CheckCircle2,
  Trash2, AlertTriangle, X, Loader2, ImagePlus, ChevronDown, ChevronUp, Pencil,
} from "lucide-react";
import { Link } from "react-router-dom";
import { buildPageUrl, useAppNavigate } from "@/lib/navigation";
import PackageCoverUpload from "@/components/test/PackageCoverUpload";
import api from "@/lib/api/apiClient";

// ─── Sabitler ───────────────────────────────────────────────────────────────
const STEP_DEFS = [
  { id: 1, key: "package", icon: Package },
  { id: 2, key: "tests", icon: BookOpen },
  { id: 3, key: "preview", icon: Eye },
];

// ─── Yardimcilar ────────────────────────────────────────────────────────────
const uid = () => Math.random().toString(36).slice(2);

function emptyQuestion() {
  return {
    _k: uid(),
    content: "",
    mediaUrl: "",
    topicId: null,
    solutionText: "",
    solutionMediaUrl: "",
  };
}

function emptyTest() {
  return { _k: uid(), title: "", questions: [emptyQuestion()] };
}

/** Yazili soru tamamlanmis mi: metin+gorsel var VE cozum metni var */
function isQComplete(q) {
  const hasContent = !!(q.content?.trim() || q.mediaUrl);
  const hasSolution = !!q.solutionText?.trim();
  return hasContent && hasSolution;
}

async function doUpload(file) {
  const fd = new FormData();
  fd.append("file", file);
  const { data } = await api.post("/upload/image", fd);
  return data.url || data.fileUrl || data.file_url || "";
}

// ─── Adim gostergesi ────────────────────────────────────────────────────────
function StepIndicator({ current }) {
  const { t } = useTranslation(["pages"]);
  const STEPS = STEP_DEFS.map((d) => ({
    ...d,
    label: t(`pages:writtenTestForm.steps.${d.key}`),
  }));
  return (
    <div className="flex items-center justify-center mb-8">
      {STEPS.map((step, i) => {
        const Icon = step.icon;
        const done = current > step.id;
        const active = current === step.id;
        return (
          <div key={step.id} className="flex items-center">
            <div className="flex flex-col items-center gap-1">
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center border-2 transition-colors ${
                  done
                    ? "bg-indigo-600 border-indigo-600 text-white"
                    : active
                      ? "bg-white border-indigo-600 text-indigo-600 dark:bg-gray-900"
                      : "bg-white border-slate-200 text-slate-400 dark:bg-gray-900 dark:border-gray-700"
                }`}
              >
                {done ? <CheckCircle2 className="w-5 h-5" /> : <Icon className="w-4 h-4" />}
              </div>
              <span
                className={`text-xs font-medium ${
                  active ? "text-indigo-600" : done ? "text-slate-600 dark:text-slate-300" : "text-slate-400"
                }`}
              >
                {step.label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div
                className={`w-16 h-0.5 mx-1 mb-5 transition-colors ${
                  current > step.id ? "bg-indigo-600" : "bg-slate-200 dark:bg-gray-700"
                }`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Soru duzenleme dialogu (SECENEKSIZ — sadece metin + cozum) ─────────────
function QuestionEditDialog({ question, questionIndex, topicList, onSave, onSaveAndNew, onClose }) {
  const { t } = useTranslation(["pages"]);

  const [local, setLocal] = useState(() => ({
    ...question,
    _imgFile: null,
    _imgPreview: null,
    _solutionImgFile: null,
    _solutionImgPreview: null,
  }));
  const [submitting, setSubmitting] = useState(false);
  const [dialogErrors, setDialogErrors] = useState({});

  const prepareAndUpload = async () => {
    let mediaUrl = local.mediaUrl || "";
    if (local._imgFile) mediaUrl = await doUpload(local._imgFile);

    let solutionMediaUrl = local.solutionMediaUrl || "";
    if (local._solutionImgFile) solutionMediaUrl = await doUpload(local._solutionImgFile);

    if (local._imgPreview) URL.revokeObjectURL(local._imgPreview);
    if (local._solutionImgPreview) URL.revokeObjectURL(local._solutionImgPreview);

    const { _imgFile, _imgPreview, _solutionImgFile, _solutionImgPreview, ...rest } = local;
    return { ...rest, mediaUrl, solutionMediaUrl };
  };

  const validate = () => {
    const errs = {};
    if (!local.content.trim() && !local.mediaUrl && !local._imgFile)
      errs.content = t("pages:writtenTestForm.question.errorMissingContent");
    if (!local.solutionText?.trim())
      errs.solution = t("pages:writtenTestForm.question.errorMissingSolution");
    setDialogErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;
    setSubmitting(true);
    try {
      const saved = await prepareAndUpload();
      onSave(saved);
      onClose();
    } catch (e) {
      toast.error(e?.message || t("pages:writtenTestForm.dialog.genericError"));
      setSubmitting(false);
    }
  };

  const handleSaveAndNew = async () => {
    if (!validate()) return;
    setSubmitting(true);
    try {
      const saved = await prepareAndUpload();
      onSaveAndNew(saved);
      onClose();
    } catch (e) {
      toast.error(e?.message || t("pages:writtenTestForm.dialog.genericError"));
    } finally {
      setSubmitting(false);
    }
  };

  const qImgDisplay = local._imgPreview || local.mediaUrl || null;
  const solImgDisplay = local._solutionImgPreview || local.solutionMediaUrl || null;

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-screen overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {t("pages:writtenTestForm.question.editDialogTitle", { n: questionIndex + 1 })}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Soru metni */}
          <div className="space-y-2">
            <Label>{t("pages:writtenTestForm.question.contentLabel")}</Label>
            <Textarea
              placeholder={t("pages:writtenTestForm.question.contentPlaceholder")}
              value={local.content}
              onChange={(e) => {
                setLocal((prev) => ({ ...prev, content: e.target.value }));
                setDialogErrors((p) => ({ ...p, content: "" }));
              }}
              rows={4}
              className={dialogErrors.content ? "border-rose-500 focus-visible:ring-rose-500" : ""}
            />
            {dialogErrors.content && (
              <p className="text-xs text-rose-500 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" />
                {dialogErrors.content}
              </p>
            )}
          </div>

          {/* Soru gorseli */}
          <div className="space-y-2">
            <Label>{t("pages:writtenTestForm.question.imageLabel")}</Label>
            <div className="flex items-center gap-3 flex-wrap">
              <label className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 dark:bg-gray-800 dark:border-gray-700 dark:text-slate-300 dark:hover:bg-gray-700 min-h-10">
                <ImagePlus className="w-4 h-4" />
                {t("pages:writtenTestForm.question.selectImage")}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.target.value = "";
                    if (!f) return;
                    if (local._imgPreview) URL.revokeObjectURL(local._imgPreview);
                    setLocal((prev) => ({ ...prev, _imgFile: f, _imgPreview: URL.createObjectURL(f), mediaUrl: "" }));
                  }}
                />
              </label>
              {qImgDisplay && (
                <>
                  <div className="w-16 h-12 rounded-lg overflow-hidden bg-slate-100 border border-slate-200 flex-shrink-0">
                    <img src={qImgDisplay} alt="" className="w-full h-full object-cover" />
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      if (local._imgPreview) URL.revokeObjectURL(local._imgPreview);
                      setLocal((prev) => ({ ...prev, _imgFile: null, _imgPreview: null, mediaUrl: "" }));
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border border-rose-200 bg-white hover:bg-rose-50 text-rose-600 min-h-10"
                  >
                    <X className="w-4 h-4" />
                    {t("pages:writtenTestForm.question.clearImage")}
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Konu */}
          <div className="space-y-2">
            <Label>{t("pages:writtenTestForm.question.topicLabel")}</Label>
            <TopicCombobox
              value={local.topicId ?? null}
              onChange={(id) => setLocal((prev) => ({ ...prev, topicId: id }))}
              topics={topicList}
              placeholder={t("pages:writtenTestForm.question.topicPlaceholder")}
              emptyLabel={t("pages:writtenTestForm.question.topicNone")}
              searchPlaceholder={t("pages:writtenTestForm.question.topicSearchPlaceholder")}
              emptyText={t("pages:writtenTestForm.question.topicEmpty")}
            />
          </div>

          {/* Cozum (ZORUNLU) */}
          <div className="space-y-2">
            <Label className="text-indigo-700 dark:text-indigo-400">
              {t("pages:writtenTestForm.question.solutionLabel")} *
            </Label>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {t("pages:writtenTestForm.question.solutionHelp")}
            </p>
            <Textarea
              rows={5}
              placeholder={t("pages:writtenTestForm.question.solutionPlaceholder")}
              value={local.solutionText ?? ""}
              onChange={(e) => {
                setLocal((prev) => ({ ...prev, solutionText: e.target.value }));
                setDialogErrors((p) => ({ ...p, solution: "" }));
              }}
              className={dialogErrors.solution ? "border-rose-500 focus-visible:ring-rose-500" : ""}
            />
            {dialogErrors.solution && (
              <p className="text-xs text-rose-500 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" />
                {dialogErrors.solution}
              </p>
            )}

            {/* Cozum gorseli */}
            <div className="flex items-center gap-3 flex-wrap">
              <label className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 dark:bg-gray-800 dark:border-gray-700 dark:text-slate-300 dark:hover:bg-gray-700 min-h-10">
                <ImagePlus className="w-4 h-4" />
                {t("pages:writtenTestForm.question.solutionImageSelect")}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.target.value = "";
                    if (!f) return;
                    if (local._solutionImgPreview) URL.revokeObjectURL(local._solutionImgPreview);
                    setLocal((prev) => ({
                      ...prev,
                      _solutionImgFile: f,
                      _solutionImgPreview: URL.createObjectURL(f),
                      solutionMediaUrl: "",
                    }));
                  }}
                />
              </label>
              {solImgDisplay && (
                <>
                  <div className="w-16 h-12 rounded-lg overflow-hidden bg-slate-100 border border-slate-200 flex-shrink-0">
                    <img src={solImgDisplay} alt="" className="w-full h-full object-cover" />
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      if (local._solutionImgPreview) URL.revokeObjectURL(local._solutionImgPreview);
                      setLocal((prev) => ({ ...prev, _solutionImgFile: null, _solutionImgPreview: null, solutionMediaUrl: "" }));
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border border-rose-200 bg-white hover:bg-rose-50 text-rose-600 min-h-10"
                  >
                    <X className="w-4 h-4" />
                    {t("pages:writtenTestForm.question.clearImage")}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Dialog footer */}
        <div className="flex items-center justify-end gap-3 pt-4 border-t dark:border-gray-700">
          <Button variant="ghost" onClick={onClose} disabled={submitting}>
            {t("pages:writtenTestForm.dialog.cancel")}
          </Button>
          {onSaveAndNew && (
            <Button
              variant="outline"
              onClick={handleSaveAndNew}
              disabled={submitting}
              className="bg-indigo-600 text-white hover:bg-indigo-700"
            >
              {submitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
              {t("pages:writtenTestForm.dialog.saveAndNew")}
            </Button>
          )}
          <Button
            onClick={handleSave}
            disabled={submitting}
            className="bg-indigo-600 text-white hover:bg-indigo-700"
          >
            {submitting
              ? t("pages:writtenTestForm.dialog.saving")
              : t("pages:writtenTestForm.dialog.complete")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Soru satiri ────────────────────────────────────────────────────────────
function QuestionItem({ q, index, onEdit, onDelete }) {
  const { t } = useTranslation(["pages"]);
  const complete = isQComplete(q);
  return (
    <div
      className={`flex items-center gap-3 px-3 py-2 rounded-lg border transition-colors ${
        complete
          ? "border-slate-200 dark:border-gray-700 bg-white dark:bg-gray-800"
          : "border-rose-300 bg-rose-50 dark:border-rose-800 dark:bg-rose-900/20"
      }`}
    >
      <span className="text-xs font-medium text-slate-500 w-6 text-center shrink-0">
        {index + 1}
      </span>
      <span className="text-sm truncate flex-1 text-slate-700 dark:text-slate-300">
        {q.content?.trim()?.slice(0, 60) || t("pages:writtenTestForm.question.untitled")}
      </span>
      <div className="flex items-center gap-1 shrink-0">
        {complete ? (
          <Badge variant="secondary" className="text-xs bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
            {t("pages:writtenTestForm.question.hasSolution")}
          </Badge>
        ) : (
          <Badge variant="secondary" className="text-xs bg-rose-50 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400">
            {t("pages:writtenTestForm.question.noSolution")}
          </Badge>
        )}
        <Button size="icon" variant="ghost" onClick={onEdit} className="h-10 w-10">
          <Pencil className="w-4 h-4" />
        </Button>
        <Button size="icon" variant="ghost" onClick={onDelete} className="h-10 w-10 text-rose-500 hover:text-rose-700">
          <Trash2 className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}

// ─── Test karti (akordiyon) ─────────────────────────────────────────────────
function TestCard({ test, testIndex, topicList, onUpdate, onDelete, maxQuestions }) {
  const { t } = useTranslation(["pages"]);
  const [expanded, setExpanded] = useState(true);
  const [editingIdx, setEditingIdx] = useState(null);
  const [autoOpenKey, setAutoOpenKey] = useState(null);

  const completedCount = test.questions.filter(isQComplete).length;

  const addQuestion = () => {
    if (maxQuestions && test.questions.length >= maxQuestions) {
      toast.warning(t("pages:writtenTestForm.testCard.maxQuestionsReached", { max: maxQuestions }));
      return;
    }
    const nq = emptyQuestion();
    onUpdate({ ...test, questions: [...test.questions, nq] });
    setAutoOpenKey(nq._k);
  };

  const saveQuestion = (idx, saved) => {
    const qs = [...test.questions];
    qs[idx] = { ...saved, _k: qs[idx]._k };
    onUpdate({ ...test, questions: qs });
  };

  const saveAndNewQuestion = (idx, saved) => {
    const qs = [...test.questions];
    qs[idx] = { ...saved, _k: qs[idx]._k };
    const nq = emptyQuestion();
    qs.push(nq);
    onUpdate({ ...test, questions: qs });
    setAutoOpenKey(nq._k);
  };

  const deleteQuestion = (idx) => {
    if (test.questions.length <= 1) return;
    const qs = test.questions.filter((_, i) => i !== idx);
    onUpdate({ ...test, questions: qs });
  };

  // AutoOpen: yeni eklenen soruyu otomatik ac
  const autoIdx = autoOpenKey ? test.questions.findIndex((q) => q._k === autoOpenKey) : -1;
  if (autoIdx >= 0 && editingIdx === null) {
    setEditingIdx(autoIdx);
    setAutoOpenKey(null);
  }

  return (
    <Card className="dark:bg-gray-900 dark:border-gray-700">
      <div
        className="flex items-center justify-between px-4 py-3 cursor-pointer select-none"
        onClick={() => setExpanded((p) => !p)}
      >
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-xs font-semibold text-slate-400">
            {t("pages:writtenTestForm.testCard.indexLabel", { index: testIndex + 1 })}
          </span>
          <Input
            value={test.title}
            onChange={(e) => onUpdate({ ...test, title: e.target.value })}
            onClick={(e) => e.stopPropagation()}
            placeholder={t("pages:writtenTestForm.testCard.titlePlaceholder")}
            className="max-w-xs text-sm font-medium"
          />
          <Badge variant="outline" className="shrink-0 text-xs">
            {test.questions.length} {t("pages:writtenTestForm.testCard.questionsSuffix")} ({completedCount} {t("pages:writtenTestForm.testCard.completedSuffix")})
          </Badge>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button
            size="icon"
            variant="ghost"
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            className="h-10 w-10 text-rose-500 hover:text-rose-700"
          >
            <Trash2 className="w-4 h-4" />
          </Button>
          {expanded ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
        </div>
      </div>

      {expanded && (
        <CardContent className="space-y-2 pt-0">
          {test.questions.map((q, qi) => (
            <QuestionItem
              key={q._k}
              q={q}
              index={qi}
              onEdit={() => setEditingIdx(qi)}
              onDelete={() => deleteQuestion(qi)}
            />
          ))}
          <Button
            type="button"
            variant="outline"
            onClick={addQuestion}
            className="w-full mt-2"
          >
            <Plus className="w-4 h-4 mr-2" />
            {t("pages:writtenTestForm.testCard.addQuestion")}
          </Button>

          {editingIdx !== null && test.questions[editingIdx] && (
            <QuestionEditDialog
              question={test.questions[editingIdx]}
              questionIndex={editingIdx}
              topicList={topicList}
              onSave={(saved) => saveQuestion(editingIdx, saved)}
              onSaveAndNew={(saved) => saveAndNewQuestion(editingIdx, saved)}
              onClose={() => setEditingIdx(null)}
            />
          )}
        </CardContent>
      )}
    </Card>
  );
}

// ─── Ana sayfa bileseni ─────────────────────────────────────────────────────
function CreateWrittenTest() {
  const { t } = useTranslation(["pages", "common"]);
  const navigate = useAppNavigate();
  const { user } = useAuth();

  const [step, setStep] = useState(1);
  const [pkgData, setPkgData] = useState({
    title: "",
    description: "",
    examTypeId: "",
    priceCents: "",
    coverImageUrl: "",
  });
  const [tests, setTests] = useState([emptyTest()]);

  // Sinav turleri
  const { data: examTypes = [] } = useQuery({
    queryKey: ["examTypes"],
    queryFn: async () => {
      const res = await entities.ExamType.filter();
      return res ?? [];
    },
    staleTime: 300_000,
  });

  // Konu listesi
  const { data: topicList = [] } = useQuery({
    queryKey: ["topics"],
    queryFn: () => topicsApi.list(),
    staleTime: 300_000,
  });

  // Admin ayarlari (limitler)
  const { data: settings } = useQuery({
    queryKey: ["adminSettings"],
    queryFn: async () => {
      try {
        const { data } = await api.get("/admin/settings");
        return data;
      } catch { return null; }
    },
    staleTime: 600_000,
  });

  const maxTests = settings?.maxTestsPerPackage || 10;
  const maxQuestions = settings?.maxQuestionsPerTest || 100;
  const minPrice = settings?.minPackagePriceTL ?? 0;

  // ─── Paket dogrulama ──────────────────────────────────────────────────────
  const validatePackage = () => {
    if (!pkgData.title.trim()) {
      toast.error(t("pages:writtenTestForm.validations.titleRequired"));
      return false;
    }
    const price = parseFloat(pkgData.priceCents);
    if (minPrice > 0 && (isNaN(price) || price < minPrice)) {
      toast.error(t("pages:writtenTestForm.validations.priceMin", { min: minPrice }));
      return false;
    }
    return true;
  };

  // ─── Test dogrulama ───────────────────────────────────────────────────────
  const validateTests = () => {
    const hasValidTest = tests.some(
      (te) => te.title.trim() && te.questions.some(isQComplete)
    );
    if (!hasValidTest) {
      toast.error(t("pages:writtenTestForm.testsStep.validateAtLeastOne"));
      return false;
    }
    return true;
  };

  // ─── Yayinla mutasyonu ─────────────────────────────────────────────────────
  const publishMutation = useMutation({
    mutationFn: async ({ asDraft }) => {
      // 1) Paket olustur
      const priceVal = parseFloat(pkgData.priceCents) || 0;
      const pkg = await writtenTests.createPackage({
        title: pkgData.title.trim(),
        description: pkgData.description.trim(),
        examTypeId: pkgData.examTypeId || undefined,
        priceCents: Math.round(priceVal * 100),
        coverImageUrl: pkgData.coverImageUrl || undefined,
      });

      // 2) Her test + sorulari olustur
      for (const te of tests) {
        if (!te.title.trim()) continue;
        const validQs = te.questions.filter(isQComplete);
        if (validQs.length === 0) continue;

        const createdTest = await writtenTests.createTest(pkg.id, {
          title: te.title.trim(),
        });

        for (const q of validQs) {
          await writtenTests.createQuestion(createdTest.id, {
            content: q.content.trim(),
            mediaUrl: q.mediaUrl || undefined,
            topicId: q.topicId || undefined,
            solutionText: q.solutionText.trim(),
            solutionMediaUrl: q.solutionMediaUrl || undefined,
          });
        }
      }

      // 3) Yayinla (draft degilse)
      if (!asDraft) {
        await writtenTests.publishPackage(pkg.id);
      }
      return pkg;
    },
    onSuccess: (_, { asDraft }) => {
      toast.success(
        asDraft
          ? t("pages:writtenTestForm.createPage.draftedToast")
          : t("pages:writtenTestForm.createPage.publishedToast")
      );
      navigate("ManageWrittenTests");
    },
    onError: (err) => {
      toast.error(err?.message || t("pages:writtenTestForm.createPage.saveFailed"));
    },
  });

  const handlePublish = (asDraft = false) => {
    if (!validatePackage()) return;
    if (!validateTests()) return;
    publishMutation.mutate({ asDraft });
  };

  // ─── Adim navigasyonu ──────────────────────────────────────────────────────
  const goNext = () => {
    if (step === 1 && !validatePackage()) return;
    if (step === 2 && !validateTests()) return;
    setStep((s) => Math.min(3, s + 1));
  };
  const goBack = () => setStep((s) => Math.max(1, s - 1));

  const addTest = () => {
    if (tests.length >= maxTests) {
      toast.warning(t("pages:writtenTestForm.testsStep.maxTestsReached", { max: maxTests }));
      return;
    }
    setTests((prev) => [...prev, emptyTest()]);
  };

  const updateTest = (idx, updated) => {
    setTests((prev) => prev.map((te, i) => (i === idx ? updated : te)));
  };

  const deleteTest = (idx) => {
    if (tests.length <= 1) return;
    setTests((prev) => prev.filter((_, i) => i !== idx));
  };

  // Onizleme icin ozet hesaplari
  const totalQuestions = tests.reduce((s, te) => s + te.questions.filter(isQComplete).length, 0);
  const totalTests = tests.filter((te) => te.title.trim() && te.questions.some(isQComplete)).length;

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      {/* Ust bar */}
      <div className="flex items-center gap-3 mb-6">
        <Link to={buildPageUrl("ManageWrittenTests")}>
          <Button variant="ghost" size="icon" className="h-10 w-10">
            <ArrowLeft className="w-5 h-5" />
          </Button>
        </Link>
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">
            {t("pages:writtenTestForm.createPage.title")}
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {t("pages:writtenTestForm.createPage.headerSubtitle")}
          </p>
        </div>
      </div>

      <StepIndicator current={step} />

      {/* ─── ADIM 1: Paket bilgileri ─────────────────────────────────────────── */}
      {step === 1 && (
        <Card className="dark:bg-gray-900 dark:border-gray-700">
          <CardContent className="p-6 space-y-5">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
              {t("pages:writtenTestForm.package.sectionTitle")}
            </h2>

            <div className="space-y-2">
              <Label>{t("pages:writtenTestForm.package.titleLabel")}</Label>
              <Input
                value={pkgData.title}
                onChange={(e) => setPkgData((p) => ({ ...p, title: e.target.value }))}
                placeholder={t("pages:writtenTestForm.package.titlePlaceholder")}
              />
            </div>

            <div className="space-y-2">
              <Label>{t("pages:writtenTestForm.package.descLabel")}</Label>
              <Textarea
                value={pkgData.description}
                onChange={(e) => setPkgData((p) => ({ ...p, description: e.target.value }))}
                placeholder={t("pages:writtenTestForm.package.descPlaceholder")}
                rows={3}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t("pages:writtenTestForm.package.examTypeLabel")}</Label>
                <Select
                  value={pkgData.examTypeId || "__none"}
                  onValueChange={(v) => setPkgData((p) => ({ ...p, examTypeId: v === "__none" ? "" : v }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t("pages:writtenTestForm.package.examTypePlaceholder")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">{t("pages:writtenTestForm.package.examTypeNone")}</SelectItem>
                    {examTypes.map((et) => (
                      <SelectItem key={et.id} value={et.id}>{et.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>{t("pages:writtenTestForm.package.priceLabel")}</Label>
                <Input
                  type="number"
                  min={0}
                  step="1"
                  value={pkgData.priceCents}
                  onChange={(e) => setPkgData((p) => ({ ...p, priceCents: e.target.value }))}
                  placeholder={t("pages:writtenTestForm.package.pricePlaceholder")}
                />
                {minPrice > 0 && (
                  <p className="text-xs text-slate-400">{t("pages:writtenTestForm.package.priceMin", { min: minPrice })}</p>
                )}
              </div>
            </div>

            <PackageCoverUpload
              value={pkgData.coverImageUrl}
              onChange={(url) => setPkgData((p) => ({ ...p, coverImageUrl: url }))}
              titlePreview={pkgData.title}
            />

            <div className="flex justify-end pt-4">
              <Button onClick={goNext} className="bg-indigo-600 text-white hover:bg-indigo-700">
                {t("pages:writtenTestForm.nav.next")}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ─── ADIM 2: Testler & Sorular ───────────────────────────────────────── */}
      {step === 2 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between mb-2">
            <div>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
                {t("pages:writtenTestForm.testsStep.title")}
              </h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                {t("pages:writtenTestForm.testsStep.subtitle")}
              </p>
            </div>
            <Button variant="outline" onClick={addTest}>
              <Plus className="w-4 h-4 mr-2" />
              {t("pages:writtenTestForm.testsStep.addTest")}
            </Button>
          </div>

          {tests.map((te, ti) => (
            <TestCard
              key={te._k}
              test={te}
              testIndex={ti}
              topicList={topicList}
              maxQuestions={maxQuestions}
              onUpdate={(updated) => updateTest(ti, updated)}
              onDelete={() => deleteTest(ti)}
            />
          ))}

          <div className="flex justify-between pt-4">
            <Button variant="ghost" onClick={goBack}>
              {t("pages:writtenTestForm.nav.back")}
            </Button>
            <Button onClick={goNext} className="bg-indigo-600 text-white hover:bg-indigo-700">
              {t("pages:writtenTestForm.nav.previewNext")}
            </Button>
          </div>
        </div>
      )}

      {/* ─── ADIM 3: Onizleme ────────────────────────────────────────────────── */}
      {step === 3 && (
        <Card className="dark:bg-gray-900 dark:border-gray-700">
          <CardContent className="p-6 space-y-5">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
              {t("pages:writtenTestForm.preview.sectionTitle")}
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-slate-500 mb-1">{t("pages:writtenTestForm.preview.packageTitleLabel")}</p>
                <p className="font-medium text-slate-900 dark:text-white">{pkgData.title || "—"}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500 mb-1">{t("pages:writtenTestForm.preview.priceLabel")}</p>
                <p className="font-medium text-slate-900 dark:text-white">
                  {parseFloat(pkgData.priceCents) > 0 ? `${pkgData.priceCents} TL` : t("pages:writtenTestForm.preview.free")}
                </p>
              </div>
            </div>

            {pkgData.description && (
              <div>
                <p className="text-xs text-slate-500 mb-1">{t("pages:writtenTestForm.preview.descriptionLabel")}</p>
                <p className="text-sm text-slate-700 dark:text-slate-300">{pkgData.description}</p>
              </div>
            )}

            <div>
              <p className="text-xs text-slate-500 mb-1">{t("pages:writtenTestForm.preview.summary")}</p>
              <p className="text-sm text-slate-700 dark:text-slate-300">
                {t("pages:writtenTestForm.preview.testsCount", { count: totalTests })} / {t("pages:writtenTestForm.preview.validQuestions", { count: totalQuestions })}
              </p>
            </div>

            <div className="space-y-2">
              <p className="text-xs text-slate-500">{t("pages:writtenTestForm.preview.testsListTitle")}</p>
              {tests.filter((te) => te.title.trim()).map((te, i) => (
                <div key={te._k} className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                  <BookOpen className="w-4 h-4 text-slate-400" />
                  <span>{te.title || t("pages:writtenTestForm.preview.untitled")}</span>
                  <Badge variant="outline" className="text-xs">
                    {te.questions.filter(isQComplete).length} {t("pages:writtenTestForm.testCard.questionsSuffix")}
                  </Badge>
                </div>
              ))}
            </div>

            <div className="flex justify-between pt-4 border-t dark:border-gray-700">
              <Button variant="ghost" onClick={goBack}>
                {t("pages:writtenTestForm.nav.back")}
              </Button>
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  onClick={() => handlePublish(true)}
                  disabled={publishMutation.isPending}
                >
                  {publishMutation.isPending
                    ? t("pages:writtenTestForm.createPage.saving")
                    : t("pages:writtenTestForm.createPage.draftSave")}
                </Button>
                <Button
                  onClick={() => handlePublish(false)}
                  disabled={publishMutation.isPending}
                  className="bg-indigo-600 text-white hover:bg-indigo-700"
                >
                  {publishMutation.isPending
                    ? t("pages:writtenTestForm.createPage.publishing")
                    : t("pages:writtenTestForm.createPage.publish")}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default CreateWrittenTest;
export { CreateWrittenTest };
