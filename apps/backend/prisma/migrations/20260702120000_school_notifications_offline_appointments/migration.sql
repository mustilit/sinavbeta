-- E-Sınıf — Bildirimler + Sistem dışı ödev + Randevu (schema.prisma ile birebir; kolonlar camelCase)
-- CreateEnum
CREATE TYPE "SchoolNotificationType" AS ENUM ('NEW_ASSIGNMENT', 'ASSIGNMENT_GRADED', 'MESSAGE', 'OFFLINE_DONE', 'APPOINTMENT');

-- CreateEnum
CREATE TYPE "SchoolAppointmentType" AS ENUM ('ACADEMIC', 'COUNSELING', 'PARENT', 'OTHER');

-- CreateEnum
CREATE TYPE "SchoolAppointmentStatus" AS ENUM ('PENDING', 'CONFIRMED', 'CANCELLED', 'COMPLETED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditAction" ADD VALUE 'SCHOOL_NOTIFICATION_SENT';
ALTER TYPE "AuditAction" ADD VALUE 'SCHOOL_ASSIGNMENT_CREATED';
ALTER TYPE "AuditAction" ADD VALUE 'SCHOOL_ASSIGNMENT_OFFLINE_DONE';
ALTER TYPE "AuditAction" ADD VALUE 'SCHOOL_AVAILABILITY_CHANGED';
ALTER TYPE "AuditAction" ADD VALUE 'SCHOOL_APPOINTMENT_BOOKED';
ALTER TYPE "AuditAction" ADD VALUE 'SCHOOL_APPOINTMENT_CONFIRMED';
ALTER TYPE "AuditAction" ADD VALUE 'SCHOOL_APPOINTMENT_CANCELLED';

-- AlterTable
ALTER TABLE "school_assignments" ADD COLUMN     "isOffline" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "offlineDescription" TEXT,
ADD COLUMN     "offlineDoneAt" TIMESTAMP(3),
ADD COLUMN     "offlineSubjectId" TEXT,
ALTER COLUMN "examId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "school_notifications" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "senderId" TEXT,
    "type" "SchoolNotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "entityType" TEXT,
    "entityId" TEXT,
    "assignmentId" TEXT,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "school_notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "school_teacher_availabilities" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "teacherUserId" TEXT NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "school_teacher_availabilities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "school_appointments" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "availabilityId" TEXT NOT NULL,
    "teacherUserId" TEXT NOT NULL,
    "studentUserId" TEXT NOT NULL,
    "appointmentType" "SchoolAppointmentType" NOT NULL DEFAULT 'ACADEMIC',
    "date" TIMESTAMP(3) NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "status" "SchoolAppointmentStatus" NOT NULL DEFAULT 'PENDING',
    "notes" TEXT,
    "teacherNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "school_appointments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "school_notifications_schoolId_recipientId_isRead_createdAt_idx" ON "school_notifications"("schoolId", "recipientId", "isRead", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "school_notifications_recipientId_createdAt_idx" ON "school_notifications"("recipientId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "school_teacher_availabilities_schoolId_teacherUserId_isActi_idx" ON "school_teacher_availabilities"("schoolId", "teacherUserId", "isActive");

-- CreateIndex
CREATE INDEX "school_teacher_availabilities_schoolId_dayOfWeek_idx" ON "school_teacher_availabilities"("schoolId", "dayOfWeek");

-- CreateIndex
CREATE INDEX "school_appointments_schoolId_teacherUserId_date_idx" ON "school_appointments"("schoolId", "teacherUserId", "date");

-- CreateIndex
CREATE INDEX "school_appointments_schoolId_studentUserId_date_idx" ON "school_appointments"("schoolId", "studentUserId", "date");

-- CreateIndex
CREATE INDEX "school_appointments_availabilityId_date_idx" ON "school_appointments"("availabilityId", "date");

-- CreateIndex
CREATE INDEX "school_assignments_schoolId_isOffline_createdAt_idx" ON "school_assignments"("schoolId", "isOffline", "createdAt" DESC);

-- AddForeignKey
ALTER TABLE "school_notifications" ADD CONSTRAINT "school_notifications_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "school_notifications" ADD CONSTRAINT "school_notifications_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "school_notifications" ADD CONSTRAINT "school_notifications_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "school_assignments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "school_teacher_availabilities" ADD CONSTRAINT "school_teacher_availabilities_teacherUserId_fkey" FOREIGN KEY ("teacherUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "school_appointments" ADD CONSTRAINT "school_appointments_availabilityId_fkey" FOREIGN KEY ("availabilityId") REFERENCES "school_teacher_availabilities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "school_appointments" ADD CONSTRAINT "school_appointments_teacherUserId_fkey" FOREIGN KEY ("teacherUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "school_appointments" ADD CONSTRAINT "school_appointments_studentUserId_fkey" FOREIGN KEY ("studentUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Çifte rezervasyon koruması: aynı uygunluk slotu + aynı gün için tek AKTİF randevu
CREATE UNIQUE INDEX "school_appointments_slot_active_key" ON "school_appointments"("availabilityId", "date") WHERE "status" IN ('PENDING', 'CONFIRMED');
