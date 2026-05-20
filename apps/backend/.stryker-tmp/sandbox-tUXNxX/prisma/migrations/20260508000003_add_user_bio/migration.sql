-- Migration: add_user_bio
-- bio alanı kullanıcı profillerinde opsiyonel biyografi metni için eklendi.

ALTER TABLE "users" ADD COLUMN "bio" TEXT;
