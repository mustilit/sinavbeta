import { useState, useMemo } from "react";
import { topics as topicsApi } from "@/api/dalClient";
import { entities } from "@/api/dalClient";
import { useAuth } from "@/lib/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useDebouncedValue } from "@/lib/useDebouncedValue";
import { Plus, Edit2, Trash2, ChevronRight, ChevronDown, BookOpen, Search, X, CheckSquare, Square, Filter, Check } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";

// ── Çoklu sınav türü seçici ──────────────────────────────────────────────────
function ExamTypeMultiSelect({ examTypes = [], selected = [], onChange }) {
  const toggle = (id) =>
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);

  return (
    <div className="flex flex-wrap gap-2 mt-1">
      {examTypes.map((et) => {
        const active = selected.includes(et.id);
        return (
          <button
            key={et.id}
            type="button"
            onClick={() => toggle(et.id)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
              active
                ? "bg-indigo-600 text-white border-indigo-600"
                : "bg-white text-slate-600 border-slate-300 hover:border-indigo-400"
            }`}
          >
            {et.name}
          </button>
        );
      })}
      {examTypes.length === 0 && (
        <p className="text-xs text-slate-400">Sınav türleri yükleniyor...</p>
      )}
    </div>
  );
}

// ── Konu ekleme / düzenleme diyaloğu ────────────────────────────────────────
function TopicDialog({ open, onOpenChange, topic, parentTopic, examTypes, onSave, isPending }) {
  const [name, setName] = useState(topic?.name ?? "");
  const [selectedExamTypes, setSelectedExamTypes] = useState(
    topic?.examTypes?.map((et) => et.id) ??
    parentTopic?.examTypes?.map((et) => et.id) ??
    []
  );

  const handleSave = () => {
    if (!name.trim()) { toast.error("Konu adı zorunludur"); return; }
    onSave({ name: name.trim(), examTypeIds: selectedExamTypes });
  };

  const title = topic
    ? "Konuyu Düzenle"
    : parentTopic
    ? `"${parentTopic.name}" için Alt Konu Ekle`
    : "Yeni Konu Ekle";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-5 mt-2">
          {parentTopic && !topic && (
            <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 rounded-lg border border-slate-200 text-sm text-slate-600">
              <BookOpen className="w-4 h-4 text-indigo-500" />
              <span>Üst konu: <strong>{parentTopic.name}</strong></span>
            </div>
          )}

          <div className="space-y-2">
            <Label>Konu Adı *</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Örn: Matematik, Paragraf, Türev..."
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <Label>
              Sınav Türleri{" "}
              <span className="text-slate-400 font-normal">(birden fazla seçilebilir)</span>
            </Label>
            <ExamTypeMultiSelect
              examTypes={examTypes}
              selected={selectedExamTypes}
              onChange={setSelectedExamTypes}
            />
          </div>

          <div className="flex gap-3 justify-end pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              İptal
            </Button>
            <Button
              type="button"
              onClick={handleSave}
              disabled={isPending}
              className="bg-indigo-600 hover:bg-indigo-700"
            >
              {isPending ? "Kaydediliyor..." : "Kaydet"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Ağaç düğümü (özyinelemeli) ───────────────────────────────────────────────
function TopicNode({ topic, depth = 0, examTypes, onEdit, onDelete, onAddChild, onToggleActive, togglingId }) {
  const [expanded, setExpanded] = useState(true);
  const hasChildren = topic.children?.length > 0;

  return (
    <div>
      <div
        className={`flex items-center gap-2 py-2.5 px-3 rounded-lg hover:bg-slate-50 group ${
          depth > 0 ? "ml-6 border-l-2 border-slate-100 pl-4" : ""
        }`}
      >
        {/* Açma/kapama */}
        <button
          type="button"
          className="w-5 h-5 flex items-center justify-center text-slate-400 shrink-0"
          onClick={() => hasChildren && setExpanded((v) => !v)}
        >
          {hasChildren ? (
            expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />
          ) : (
            <span className="w-4" />
          )}
        </button>

        {/* Konu adı */}
        <span
          className={`font-medium flex-1 ${
            !topic.active ? "line-through text-slate-400" : "text-slate-800"
          }`}
        >
          {topic.name}
        </span>

        {/* Sınav türü badge'leri */}
        <div className="flex flex-wrap gap-1 max-w-xs">
          {topic.examTypes?.map((et) => (
            <Badge
              key={et.id}
              variant="outline"
              className="text-xs py-0 px-2 border-indigo-200 text-indigo-700 bg-indigo-50"
            >
              {et.name}
            </Badge>
          ))}
        </div>

        {/* Durum badge'i */}
        <Badge
          variant="outline"
          className={`text-xs py-0 px-2 ${
            topic.active
              ? "border-emerald-200 text-emerald-700 bg-emerald-50"
              : "border-slate-200 text-slate-500 bg-slate-100"
          }`}
        >
          {topic.active ? "Aktif" : "Pasif"}
        </Badge>

        {/* Aktif/Pasif switch — her zaman görünür */}
        <Switch
          checked={!!topic.active}
          disabled={togglingId === topic.id}
          onCheckedChange={(checked) => onToggleActive(topic, checked)}
          aria-label={topic.active ? "Pasife çek" : "Aktife al"}
          title={topic.active ? "Pasife çek" : "Aktife al"}
        />

        {/* Eylemler — hover'da görünür */}
        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-slate-500 hover:text-indigo-600"
            title="Alt Konu Ekle"
            onClick={() => onAddChild(topic)}
          >
            <Plus className="w-3.5 h-3.5" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-slate-500 hover:text-indigo-600"
            onClick={() => onEdit(topic)}
          >
            <Edit2 className="w-3.5 h-3.5" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-slate-500 hover:text-rose-600"
            onClick={() => onDelete(topic)}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      {/* Alt konular */}
      {hasChildren && expanded && (
        <div className="mt-0.5">
          {topic.children.map((child) => (
            <TopicNode
              key={child.id}
              topic={child}
              depth={depth + 1}
              examTypes={examTypes}
              onEdit={onEdit}
              onDelete={onDelete}
              onAddChild={onAddChild}
              onToggleActive={onToggleActive}
              togglingId={togglingId}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Ana sayfa ─────────────────────────────────────────────────────────────────
export default function ManageTopics() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // dialog: { mode: 'create'|'edit'|'addChild', topic?, parentTopic? }
  const [dialog, setDialog] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [selectedExamTypeIds, setSelectedExamTypeIds] = useState([]); // [] = Tümü
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearch = useDebouncedValue(searchQuery, 300);
  const [examTypeFilterOpen, setExamTypeFilterOpen] = useState(false);
  const [examTypeFilterSearch, setExamTypeFilterSearch] = useState("");

  const toggleExamTypeFilter = (id) => {
    setSelectedExamTypeIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };
  const clearExamTypeFilter = () => setSelectedExamTypeIds([]);

  const isAdmin = (user?.role || "").toString().toUpperCase() === "ADMIN";

  const { data: tree = [], isLoading } = useQuery({
    queryKey: ["topicsTree"],
    queryFn: () => topicsApi.tree(),
    enabled: isAdmin,
  });

  const { data: examTypes = [] } = useQuery({
    queryKey: ["examTypes"],
    queryFn: () => entities.ExamType.filter({ is_active: true }),
    enabled: isAdmin,
  });

  const createMutation = useMutation({
    mutationFn: (data) => topicsApi.create(data),
    onSuccess: () => {
      toast.success("Konu oluşturuldu");
      queryClient.invalidateQueries({ queryKey: ["topicsTree"] });
      setDialog(null);
    },
    onError: (e) => toast.error(e?.response?.data?.message || e?.message || "Hata"),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => topicsApi.update(id, data),
    onSuccess: () => {
      toast.success("Konu güncellendi");
      queryClient.invalidateQueries({ queryKey: ["topicsTree"] });
      setDialog(null);
    },
    onError: (e) => toast.error(e?.response?.data?.message || e?.message || "Hata"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => topicsApi.remove(id),
    onSuccess: () => {
      toast.success("Konu silindi");
      queryClient.invalidateQueries({ queryKey: ["topicsTree"] });
      setDeleteTarget(null);
    },
    onError: (e) => toast.error(e?.response?.data?.message || e?.message || "Silinemedi"),
  });

  const toggleActiveMutation = useMutation({
    mutationFn: ({ id, active }) => topicsApi.update(id, { active }),
    onSuccess: (_, { active }) => {
      toast.success(active ? "Konu aktife alındı" : "Konu pasife çekildi");
      queryClient.invalidateQueries({ queryKey: ["topicsTree"] });
    },
    onError: (e) => toast.error(e?.response?.data?.message || e?.message || "Durum değiştirilemedi"),
  });
  const handleToggleActive = (topic, nextActive) =>
    toggleActiveMutation.mutate({ id: topic.id, active: nextActive });

  if (!isAdmin) {
    return (
      <div className="text-center py-20">
        <h2 className="text-xl font-semibold text-slate-900">Erişim Engellendi</h2>
        <p className="text-slate-500 mt-2">Bu sayfaya erişim yetkiniz yok</p>
      </div>
    );
  }

  const handleSave = (formData) => {
    if (dialog.mode === "edit") {
      updateMutation.mutate({ id: dialog.topic.id, data: formData });
    } else {
      const payload = { ...formData };
      if (dialog.parentTopic) payload.parentId = dialog.parentTopic.id;
      createMutation.mutate(payload);
    }
  };

  // Sınav türü + metin filtresi — eşleşen düğüm veya altındaki herhangi
  // bir alt-düğüm eşleşirse o üst konuyu da göster.
  const filterSet = new Set(selectedExamTypeIds);
  const search = debouncedSearch.trim().toLocaleLowerCase("tr");

  const matchesNode = (node) => {
    const examOk =
      filterSet.size === 0 ||
      node.examTypes?.some((et) => filterSet.has(et.id));
    const textOk =
      !search || node.name?.toLocaleLowerCase("tr").includes(search);
    return examOk && textOk;
  };

  const filterNode = (node) => {
    if (matchesNode(node)) return true;
    if (node.children?.some((c) => filterNode(c))) return true;
    return false;
  };
  const filteredTree = useMemo(
    () => tree.filter(filterNode),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tree, selectedExamTypeIds, debouncedSearch],
  );

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Soru Konuları</h1>
          <p className="text-slate-500 mt-2">
            Sınav türlerine bağlı konuları hiyerarşik olarak yönet
          </p>
        </div>
        <Button
          onClick={() => setDialog({ mode: "create" })}
          className="bg-indigo-600 hover:bg-indigo-700"
        >
          <Plus className="w-4 h-4 mr-2" />
          Yeni Konu
        </Button>
      </div>

      {/* Filtreler */}
      <div className="mb-6 flex flex-wrap items-center gap-3">
        {/* Metin araması */}
        <div className="relative flex-1 min-w-[240px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          <Input
            type="search"
            placeholder="Konu adı ara (tüm hiyerarşide)…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 pr-9"
            aria-label="Konu adı ara"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600"
              aria-label="Aramayı temizle"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Sınav türü çoklu seçim — Popover */}
        <Popover open={examTypeFilterOpen} onOpenChange={setExamTypeFilterOpen}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9 gap-2"
              aria-haspopup="listbox"
              aria-expanded={examTypeFilterOpen}
            >
              <Filter className="w-4 h-4 text-slate-500" aria-hidden="true" />
              Sınav türü
              {selectedExamTypeIds.length > 0 && (
                <Badge
                  variant="outline"
                  className="ml-1 px-1.5 py-0 text-xs border-indigo-200 text-indigo-700 bg-indigo-50"
                >
                  {selectedExamTypeIds.length}
                </Badge>
              )}
              <ChevronDown className="w-4 h-4 text-slate-400" aria-hidden="true" />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-72 p-0">
            <div className="p-3 border-b border-slate-100">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                <Input
                  type="search"
                  placeholder="Sınav türü ara…"
                  value={examTypeFilterSearch}
                  onChange={(e) => setExamTypeFilterSearch(e.target.value)}
                  className="h-8 pl-8 pr-2 text-sm"
                  autoFocus
                />
              </div>
            </div>
            <ul role="listbox" aria-label="Sınav türleri" className="max-h-64 overflow-y-auto py-1">
              {examTypes
                .filter((et) =>
                  !examTypeFilterSearch.trim() ||
                  et.name?.toLocaleLowerCase("tr").includes(examTypeFilterSearch.trim().toLocaleLowerCase("tr")),
                )
                .map((et) => {
                  const checked = selectedExamTypeIds.includes(et.id);
                  return (
                    <li key={et.id} role="option" aria-selected={checked}>
                      <button
                        type="button"
                        onClick={() => toggleExamTypeFilter(et.id)}
                        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 focus:bg-slate-50 focus:outline-none"
                      >
                        <span
                          className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                            checked
                              ? "bg-indigo-600 border-indigo-600 text-white"
                              : "bg-white border-slate-300"
                          }`}
                          aria-hidden="true"
                        >
                          {checked && <Check className="w-3 h-3" />}
                        </span>
                        <span className="flex-1 text-left">{et.name}</span>
                      </button>
                    </li>
                  );
                })}
              {examTypes.filter((et) =>
                !examTypeFilterSearch.trim() ||
                et.name?.toLocaleLowerCase("tr").includes(examTypeFilterSearch.trim().toLocaleLowerCase("tr")),
              ).length === 0 && (
                <li className="px-3 py-4 text-center text-xs text-slate-400">Eşleşen sınav türü yok</li>
              )}
            </ul>
            {selectedExamTypeIds.length > 0 && (
              <div className="p-2 border-t border-slate-100 flex items-center justify-between">
                <span className="text-xs text-slate-500 px-1">{selectedExamTypeIds.length} seçili</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs text-slate-600 hover:text-rose-600"
                  onClick={clearExamTypeFilter}
                >
                  Temizle
                </Button>
              </div>
            )}
          </PopoverContent>
        </Popover>

        {/* Seçili filtrelerin küçük chip listesi (×'lı) */}
        {selectedExamTypeIds.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {selectedExamTypeIds.map((id) => {
              const et = examTypes.find((e) => e.id === id);
              if (!et) return null;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => toggleExamTypeFilter(id)}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-rose-50 hover:text-rose-700 hover:border-rose-200"
                  aria-label={`${et.name} filtresini kaldır`}
                >
                  {et.name}
                  <X className="w-3 h-3" aria-hidden="true" />
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Konu ağacı */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="p-6 space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-10 bg-slate-100 rounded-lg animate-pulse" />
            ))}
          </div>
        ) : filteredTree.length === 0 ? (
          <div className="text-center py-14">
            <BookOpen className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500 font-medium">
              {selectedExamTypeIds.length === 0 && !debouncedSearch.trim()
                ? "Henüz konu eklenmedi"
                : "Filtreye uyan konu bulunamadı"}
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-4"
              onClick={() => setDialog({ mode: "create" })}
            >
              <Plus className="w-4 h-4 mr-1" />
              İlk konuyu ekle
            </Button>
          </div>
        ) : (
          <div className="p-4 space-y-1">
            {filteredTree.map((topic) => (
              <TopicNode
                key={topic.id}
                topic={topic}
                examTypes={examTypes}
                onEdit={(t) => setDialog({ mode: "edit", topic: t })}
                onDelete={(t) => setDeleteTarget(t)}
                onAddChild={(t) => setDialog({ mode: "addChild", parentTopic: t })}
                onToggleActive={handleToggleActive}
                togglingId={toggleActiveMutation.isPending ? toggleActiveMutation.variables?.id : null}
              />
            ))}
          </div>
        )}
      </div>

      {/* Oluşturma / düzenleme diyaloğu */}
      {dialog && (
        <TopicDialog
          open={!!dialog}
          onOpenChange={(open) => !open && setDialog(null)}
          topic={dialog.topic}
          parentTopic={dialog.parentTopic}
          examTypes={examTypes}
          onSave={handleSave}
          isPending={isPending}
          key={dialog.topic?.id ?? dialog.mode}
        />
      )}

      {/* Silme onayı */}
      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              "{deleteTarget?.name}" konusunu silmek istiyor musunuz?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget?.children?.length > 0
                ? `Bu konunun ${deleteTarget.children.length} alt konusu var. Silindiğinde alt konular üst konusuz kalır.`
                : "Bu işlem geri alınamaz."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>İptal</AlertDialogCancel>
            <AlertDialogAction
              className="bg-rose-600 hover:bg-rose-700"
              onClick={() => deleteMutation.mutate(deleteTarget.id)}
            >
              {deleteMutation.isPending ? "Siliniyor..." : "Sil"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
