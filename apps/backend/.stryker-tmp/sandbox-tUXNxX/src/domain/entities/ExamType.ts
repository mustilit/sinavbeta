/**
 * Sınav türü domain entity.
 * Örnek: YKS, KPSS, DGS gibi sınav kategorilerini tanımlar.
 * Her ExamType birden fazla Topic (konu) barındırabilir.
 */
// @ts-nocheck

export type ExamType = {
  id: string;
  /** Görüntülenecek ad, örn. "YKS - TYT" */
  name: string;
  /** URL dostu benzersiz tanımlayıcı, örn. "yks-tyt" */
  slug: string;
  /** Sınav türüne ait açıklama metni (isteğe bağlı) */
  description?: string | null;
  /** Ek yapılandırma verileri (esnek alan) */
  metadata?: Record<string, unknown> | null;
  /** false ise listelemelerde gizlenir */
  active?: boolean;
  createdAt?: string;
  updatedAt?: string;
};

