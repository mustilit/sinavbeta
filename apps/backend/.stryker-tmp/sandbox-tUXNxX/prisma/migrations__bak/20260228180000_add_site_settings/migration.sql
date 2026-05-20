-- Site / şirket bilgileri — ana sayfa ve footer
CREATE TABLE IF NOT EXISTS "site_settings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "siteName" TEXT,
    "heroTitle" TEXT,
    "heroSubtitle" TEXT,
    "searchPlaceholder" TEXT,
    "statTests" TEXT,
    "statEducators" TEXT,
    "statCandidates" TEXT,
    "statSuccessRate" TEXT,
    "footerDescription" TEXT,
    "companyName" TEXT,
    "contactEmail" TEXT,
    "contactPhone" TEXT,
    "address" TEXT,
    "linkAbout" TEXT,
    "linkPrivacy" TEXT,
    "linkContact" TEXT,
    "linkPartnership" TEXT,
    "linkSupport" TEXT,
    "copyrightText" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "site_settings_pkey" PRIMARY KEY ("id")
);
