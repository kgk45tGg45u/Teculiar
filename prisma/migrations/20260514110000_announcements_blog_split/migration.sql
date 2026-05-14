-- CreateTable
CREATE TABLE "Announcement" (
    "id" TEXT NOT NULL,
    "locale" "Locale" NOT NULL DEFAULT 'de',
    "title" TEXT NOT NULL,
    "excerpt" TEXT,
    "body" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Announcement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnnouncementRead" (
    "id" TEXT NOT NULL,
    "announcementId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "readAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "hiddenAt" TIMESTAMP(3),

    CONSTRAINT "AnnouncementRead_pkey" PRIMARY KEY ("id")
);

-- Migrate old CMS announcements into the new announcement table.
INSERT INTO "Announcement" ("id", "locale", "title", "excerpt", "body", "authorId", "publishedAt", "createdAt", "updatedAt")
SELECT
    "id",
    "locale",
    "title",
    "excerpt",
    COALESCE("content"->>'body', "excerpt", ''),
    "authorId",
    COALESCE("publishedAt", "createdAt"),
    "createdAt",
    "updatedAt"
FROM "Content"
WHERE "type" = 'POST' AND "slug" LIKE 'announcement-%'
ON CONFLICT ("id") DO NOTHING;

-- CreateIndex
CREATE INDEX "Announcement_locale_publishedAt_idx" ON "Announcement"("locale", "publishedAt");

-- CreateIndex
CREATE UNIQUE INDEX "AnnouncementRead_announcementId_userId_key" ON "AnnouncementRead"("announcementId", "userId");

-- CreateIndex
CREATE INDEX "AnnouncementRead_userId_hiddenAt_idx" ON "AnnouncementRead"("userId", "hiddenAt");

-- AddForeignKey
ALTER TABLE "Announcement" ADD CONSTRAINT "Announcement_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnnouncementRead" ADD CONSTRAINT "AnnouncementRead_announcementId_fkey" FOREIGN KEY ("announcementId") REFERENCES "Announcement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnnouncementRead" ADD CONSTRAINT "AnnouncementRead_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
