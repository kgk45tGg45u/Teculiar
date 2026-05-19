-- AlterEnum
ALTER TYPE "TicketStatus" ADD VALUE IF NOT EXISTS 'ANSWERED';
ALTER TYPE "TicketStatus" ADD VALUE IF NOT EXISTS 'CUSTOMER_REPLY';

-- AlterTable
ALTER TABLE "Ticket" ADD COLUMN "publicId" TEXT;
UPDATE "Ticket" SET "publicId" = upper(substr(md5("id"), 1, 8)) WHERE "publicId" IS NULL;
ALTER TABLE "Ticket" ALTER COLUMN "publicId" SET NOT NULL;

-- AlterTable
ALTER TABLE "TicketAttachment" ADD COLUMN "replyId" TEXT;

-- CreateTable
CREATE TABLE "KnowledgebaseArticle" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "excerpt" TEXT,
    "body" TEXT NOT NULL,
    "keywords" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "images" JSONB NOT NULL DEFAULT '[]',
    "published" BOOLEAN NOT NULL DEFAULT true,
    "seoTitle" TEXT,
    "seoDescription" TEXT,
    "authorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KnowledgebaseArticle_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Ticket_publicId_key" ON "Ticket"("publicId");
CREATE INDEX "TicketAttachment_ticketId_idx" ON "TicketAttachment"("ticketId");
CREATE INDEX "TicketAttachment_replyId_idx" ON "TicketAttachment"("replyId");
CREATE UNIQUE INDEX "KnowledgebaseArticle_slug_key" ON "KnowledgebaseArticle"("slug");
CREATE INDEX "KnowledgebaseArticle_published_updatedAt_idx" ON "KnowledgebaseArticle"("published", "updatedAt");

-- AddForeignKey
ALTER TABLE "TicketAttachment" ADD CONSTRAINT "TicketAttachment_replyId_fkey" FOREIGN KEY ("replyId") REFERENCES "TicketReply"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "KnowledgebaseArticle" ADD CONSTRAINT "KnowledgebaseArticle_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
