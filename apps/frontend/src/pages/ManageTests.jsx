import { useState } from "react";
import { entities } from "@/api/dalClient";
import { useAuth } from "@/lib/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Pagination } from "@/components/ui/Pagination";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Search, BookOpen, Eye, EyeOff, Filter, Check, ChevronsUpDown } from "lucide-react";
import { format } from "date-fns";
import { tr } from "date-fns/locale";
import { toast } from "sonner";


export default function ManageTests() {
  const { user } = useAuth();
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterExamType, setFilterExamType] = useState("all");
  const [filterEducator, setFilterEducator] = useState("all");
  const [filterPriceRange, setFilterPriceRange] = useState("all");
  const [filterSalesRange, setFilterSalesRange] = useState("all");
  const [filterPublishStatus, setFilterPublishStatus] = useState("all");
  const [filterEducatorPublishStatus, setFilterEducatorPublishStatus] = useState("all");
  const [educatorOpen, setEducatorOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const queryClient = useQueryClient();

  const { data: tests = [], isLoading } = useQuery({
    queryKey: ["allTests"],
    queryFn: () => entities.TestPackage.list("-created_date"),
    enabled: (user?.role || '').toString().toUpperCase() === "ADMIN",
  });

  const { data: examTypes = [] } = useQuery({
    queryKey: ["examTypes"],
    queryFn: () => entities.ExamType.list(),
    enabled: (user?.role || '').toString().toUpperCase() === "ADMIN",
  });

  const toggleActiveMutation = useMutation({
    mutationFn: (/** @type {any} */ { id, is_active }) => entities.TestPackage.update(id, { is_active }),
    onSuccess: () => {
      toast.success("Test durumu güncellendi");
      queryClient.invalidateQueries({ queryKey: ["allTests"] });
    },
  });

  // Get unique educators for filter
  const uniqueEducators = [...new Map(tests.map(t => [t.educator_email, { email: t.educator_email, name: t.educator_name }])).values()];

  const filteredTests = tests.filter((t) => {
    const matchesSearch = !searchQuery || 
      t.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.educator_name?.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesStatus = filterStatus === "all" || 
      (filterStatus === "published" && t.is_published) ||
      (filterStatus === "draft" && !t.is_published);

    const matchesExamType = filterExamType === "all" || t.exam_type_id === filterExamType;
    
    const matchesEducator = filterEducator === "all" || t.educator_email === filterEducator;

    const matchesPublishStatus = filterPublishStatus === "all" || 
      (filterPublishStatus === "published" && t.is_active) ||
      (filterPublishStatus === "draft" && !t.is_active);
    
    const matchesEducatorPublishStatus = filterEducatorPublishStatus === "all" ||
      (filterEducatorPublishStatus === "published" && t.is_published) ||
      (filterEducatorPublishStatus === "draft" && !t.is_published);

    const price = t.price || 0;
    const matchesPrice = filterPriceRange === "all" ||
      (filterPriceRange === "0-50" && price < 50) ||
      (filterPriceRange === "50-100" && price >= 50 && price < 100) ||
      (filterPriceRange === "100-200" && price >= 100 && price < 200) ||
      (filterPriceRange === "200+" && price >= 200);

    const sales = t.total_sales || 0;
    const matchesSales = filterSalesRange === "all" ||
      (filterSalesRange === "0-10" && sales < 10) ||
      (filterSalesRange === "10-50" && sales >= 10 && sales < 50) ||
      (filterSalesRange === "50-100" && sales >= 50 && sales < 100) ||
      (filterSalesRange === "100+" && sales >= 100);
    
    return matchesSearch && matchesStatus && matchesExamType && matchesEducator && matchesPrice && matchesSales && matchesPublishStatus && matchesEducatorPublishStatus;
  });

  if ((user?.role || '').toString().toUpperCase() !== "ADMIN") {
    return (
      <div className="text-center py-20">
        <h2 className="text-xl font-semibold text-slate-900">Erişim Engellendi</h2>
        <p className="text-slate-500 mt-2">Bu sayfaya erişim yetkiniz yok</p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900">Tüm Testler</h1>
        <p className="text-slate-500 mt-2">Platformdaki tüm testleri görüntüle ve yönet</p>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 mb-6 space-y-4">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <Input
              placeholder="Test veya eğitici ara..."
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }}
              className="pl-10"
            />
          </div>
          <Select value={filterStatus} onValueChange={(v) => { setFilterStatus(v); setPage(1); }}>
            <SelectTrigger className="w-full sm:w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tümü</SelectItem>
              <SelectItem value="published">Yayında</SelectItem>
              <SelectItem value="draft">Taslak</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2 text-slate-600 border-t pt-4">
          <Filter className="w-4 h-4" />
          <span className="text-sm font-medium">Gelişmiş Filtreler:</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4">
          <Select value={filterExamType} onValueChange={(v) => { setFilterExamType(v); setPage(1); }}>
            <SelectTrigger>
              <SelectValue placeholder="Sınav Türü" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tüm Sınav Türleri</SelectItem>
              {examTypes.map((type) => (
                <SelectItem key={type.id} value={type.id}>{type.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Popover open={educatorOpen} onOpenChange={setEducatorOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                role="combobox"
                aria-expanded={educatorOpen}
                className="justify-between"
              >
                {filterEducator === "all" 
                  ? "Eğitici Ara..." 
                  : uniqueEducators.find(e => e.email === filterEducator)?.name || "Eğitici"}
                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[250px] p-0">
              <Command>
                <CommandInput placeholder="Eğitici ara..." />
                <CommandList>
                  <CommandEmpty>Eğitici bulunamadı</CommandEmpty>
                  <CommandGroup>
                    <CommandItem
                      value="all"
                      onSelect={() => {
                        setFilterEducator("all");
                        setEducatorOpen(false);
                        setPage(1);
                      }}
                    >
                      <Check className={filterEducator === "all" ? "mr-2 h-4 w-4 opacity-100" : "mr-2 h-4 w-4 opacity-0"} />
                      Tüm Eğiticiler
                    </CommandItem>
                    {uniqueEducators.map((educator) => (
                      <CommandItem
                        key={educator.email}
                        value={educator.name || educator.email}
                        onSelect={() => {
                          setFilterEducator(educator.email);
                          setEducatorOpen(false);
                          setPage(1);
                        }}
                      >
                        <Check className={filterEducator === educator.email ? "mr-2 h-4 w-4 opacity-100" : "mr-2 h-4 w-4 opacity-0"} />
                        {educator.name || educator.email}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>

          <Select value={filterPriceRange} onValueChange={(v) => { setFilterPriceRange(v); setPage(1); }}>
            <SelectTrigger>
              <SelectValue placeholder="Fiyat Aralığı" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tüm Fiyatlar</SelectItem>
              <SelectItem value="0-50">₺0 - ₺50</SelectItem>
              <SelectItem value="50-100">₺50 - ₺100</SelectItem>
              <SelectItem value="100-200">₺100 - ₺200</SelectItem>
              <SelectItem value="200+">₺200+</SelectItem>
            </SelectContent>
          </Select>

          <Select value={filterSalesRange} onValueChange={(v) => { setFilterSalesRange(v); setPage(1); }}>
            <SelectTrigger>
              <SelectValue placeholder="Satış Sayısı" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tüm Satışlar</SelectItem>
              <SelectItem value="0-10">0 - 10</SelectItem>
              <SelectItem value="10-50">10 - 50</SelectItem>
              <SelectItem value="50-100">50 - 100</SelectItem>
              <SelectItem value="100+">100+</SelectItem>
            </SelectContent>
          </Select>

          <Select value={filterPublishStatus} onValueChange={(v) => { setFilterPublishStatus(v); setPage(1); }}>
            <SelectTrigger>
              <SelectValue placeholder="Admin Durumu" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tüm Durumlar</SelectItem>
              <SelectItem value="published">Aktif</SelectItem>
              <SelectItem value="draft">Pasif</SelectItem>
            </SelectContent>
          </Select>

          <Select value={filterEducatorPublishStatus} onValueChange={(v) => { setFilterEducatorPublishStatus(v); setPage(1); }}>
            <SelectTrigger>
              <SelectValue placeholder="Yayın Durumu" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tüm Durumlar</SelectItem>
              <SelectItem value="published">Yayında</SelectItem>
              <SelectItem value="draft">Taslak</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-16 bg-slate-100 rounded-lg animate-pulse" />
              ))}
            </div>
          ) : filteredTests.length === 0 ? (
            <div className="text-center py-12">
              <BookOpen className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-500">Test bulunamadı</p>
            </div>
          ) : (
            <>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Test</TableHead>
                    <TableHead>Eğitici</TableHead>
                    <TableHead className="text-center">Soru</TableHead>
                    <TableHead className="text-center">Fiyat</TableHead>
                    <TableHead className="text-center">Satış</TableHead>
                    <TableHead>Durum</TableHead>
                    <TableHead>Tarih</TableHead>
                    <TableHead>İşlemler</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredTests.slice((page - 1) * pageSize, page * pageSize).map((test) => (
                    <TableRow key={test.id}>
                      <TableCell>
                        <div>
                          <p className="font-medium text-slate-900 line-clamp-1">{test.title}</p>
                          <p className="text-sm text-slate-500">{test.exam_type_name || "Genel"}</p>
                        </div>
                      </TableCell>
                      <TableCell className="text-slate-600">
                        {test.educator_name || "-"}
                      </TableCell>
                      <TableCell className="text-center">
                        {test.question_count || 0}
                      </TableCell>
                      <TableCell className="text-center font-medium">
                        {test.campaign_price && test.campaign_price < test.price ? (
                          <div>
                            <span className="line-through text-slate-400">₺{test.price}</span>
                            <span className="ml-2 text-rose-600">₺{test.campaign_price}</span>
                          </div>
                        ) : (
                          <span>₺{test.price}</span>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        {test.total_sales || 0}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Badge className={
                            test.is_active 
                              ? "bg-emerald-100 text-emerald-700"
                              : "bg-rose-100 text-rose-700"
                          }>
                            {test.is_active ? "Aktif" : "Pasif"}
                          </Badge>
                          <Badge className={
                            test.is_published 
                              ? "bg-blue-100 text-blue-700"
                              : "bg-slate-100 text-slate-600"
                          }>
                            {test.is_published ? "Yayında" : "Taslak"}
                          </Badge>
                        </div>
                      </TableCell>
                      <TableCell className="text-slate-500">
                        {test.created_date && format(new Date(test.created_date), "d MMM yyyy", { locale: tr })}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => toggleActiveMutation.mutate({ 
                              id: test.id, 
                              is_active: !test.is_active 
                            })}
                          >
                            {test.is_active ? (
                              <Eye className="w-4 h-4" />
                            ) : (
                              <EyeOff className="w-4 h-4" />
                            )}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <Pagination page={page} pageSize={pageSize} total={filteredTests.length} onPageChange={setPage} onPageSizeChange={setPageSize} />
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}