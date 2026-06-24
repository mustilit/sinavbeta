-- E-Sınıf (Okul) modülü — Sprint 1 Foundation: okul hiyerarşisi + kullanıcı.
-- Marketplace'ten izole, additive (yeni tablolar + enum'lar). Mevcut tablolara dokunmaz.

-- ── Enums ────────────────────────────────────────────────────────────────
CREATE TYPE "SchoolType" AS ENUM ('PRIMARY', 'MIDDLE', 'HIGH', 'MIXED');
CREATE TYPE "SchoolRole" AS ENUM ('SCHOOL_ADMIN', 'BRANCH_ADMIN', 'DEPT_HEAD', 'TEACHER', 'STUDENT');

-- ── academic_periods ──────────────────────────────────────────────────────
CREATE TABLE "academic_periods" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "tenantId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "academic_periods_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "academic_periods_tenantId_idx" ON "academic_periods"("tenantId");

-- ── schools ───────────────────────────────────────────────────────────────
CREATE TABLE "schools" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "city" TEXT,
    "schoolType" "SchoolType" NOT NULL DEFAULT 'MIDDLE',
    "periodId" TEXT NOT NULL,
    "adminUserId" TEXT,
    "maxUsers" INTEGER NOT NULL DEFAULT 0,
    "annualLiveLimit" INTEGER NOT NULL DEFAULT 0,
    "usedLiveCount" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "tenantId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    CONSTRAINT "schools_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "schools_code_key" ON "schools"("code");
CREATE UNIQUE INDEX "schools_adminUserId_key" ON "schools"("adminUserId");
CREATE INDEX "schools_tenantId_idx" ON "schools"("tenantId");
CREATE INDEX "schools_periodId_idx" ON "schools"("periodId");

-- ── branches ──────────────────────────────────────────────────────────────
CREATE TABLE "branches" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "adminUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "branches_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "branches_adminUserId_key" ON "branches"("adminUserId");
CREATE INDEX "branches_schoolId_idx" ON "branches"("schoolId");

-- ── classrooms ────────────────────────────────────────────────────────────
CREATE TABLE "classrooms" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "gradeLevel" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "classrooms_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "classrooms_branchId_idx" ON "classrooms"("branchId");
CREATE INDEX "classrooms_schoolId_gradeLevel_idx" ON "classrooms"("schoolId", "gradeLevel");

-- ── departments ───────────────────────────────────────────────────────────
CREATE TABLE "departments" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "headUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "departments_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "departments_schoolId_idx" ON "departments"("schoolId");

-- ── school_users ──────────────────────────────────────────────────────────
CREATE TABLE "school_users" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "branchId" TEXT,
    "classroomId" TEXT,
    "departmentId" TEXT,
    "schoolRole" "SchoolRole" NOT NULL,
    "username" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "school_users_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "school_users_username_key" ON "school_users"("username");
CREATE UNIQUE INDEX "school_users_userId_schoolId_key" ON "school_users"("userId", "schoolId");
CREATE INDEX "school_users_schoolId_schoolRole_idx" ON "school_users"("schoolId", "schoolRole");
CREATE INDEX "school_users_classroomId_idx" ON "school_users"("classroomId");
CREATE INDEX "school_users_departmentId_idx" ON "school_users"("departmentId");
CREATE INDEX "school_users_branchId_idx" ON "school_users"("branchId");

-- ── Foreign keys ──────────────────────────────────────────────────────────
ALTER TABLE "schools" ADD CONSTRAINT "schools_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "academic_periods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "schools" ADD CONSTRAINT "schools_adminUserId_fkey" FOREIGN KEY ("adminUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "branches" ADD CONSTRAINT "branches_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "branches" ADD CONSTRAINT "branches_adminUserId_fkey" FOREIGN KEY ("adminUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "classrooms" ADD CONSTRAINT "classrooms_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "classrooms" ADD CONSTRAINT "classrooms_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "departments" ADD CONSTRAINT "departments_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "departments" ADD CONSTRAINT "departments_headUserId_fkey" FOREIGN KEY ("headUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "school_users" ADD CONSTRAINT "school_users_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "school_users" ADD CONSTRAINT "school_users_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "school_users" ADD CONSTRAINT "school_users_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "school_users" ADD CONSTRAINT "school_users_classroomId_fkey" FOREIGN KEY ("classroomId") REFERENCES "classrooms"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "school_users" ADD CONSTRAINT "school_users_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
