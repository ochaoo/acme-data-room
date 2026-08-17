-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "ShareResourceType" AS ENUM ('DATA_ROOM', 'FOLDER', 'FILE');

-- CreateEnum
CREATE TYPE "ShareType" AS ENUM ('PUBLIC', 'USER');

-- CreateEnum
CREATE TYPE "ShareRole" AS ENUM ('VIEWER', 'EDITOR');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "displayName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "data_rooms" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "ownerId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "data_rooms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "folders" (
    "id" UUID NOT NULL,
    "dataRoomId" UUID NOT NULL,
    "parentId" UUID,
    "parentScope" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "folders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "files" (
    "id" UUID NOT NULL,
    "dataRoomId" UUID NOT NULL,
    "folderId" UUID,
    "folderScope" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" BIGINT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shares" (
    "id" UUID NOT NULL,
    "dataRoomId" UUID NOT NULL,
    "resourceType" "ShareResourceType" NOT NULL,
    "resourceId" UUID NOT NULL,
    "shareType" "ShareType" NOT NULL,
    "granteeUserId" UUID,
    "tokenHash" TEXT,
    "role" "ShareRole" NOT NULL DEFAULT 'VIEWER',
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shares_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");
CREATE INDEX "data_rooms_ownerId_updatedAt_idx" ON "data_rooms"("ownerId", "updatedAt");
CREATE INDEX "folders_dataRoomId_parentId_name_idx" ON "folders"("dataRoomId", "parentId", "name");
CREATE UNIQUE INDEX "folders_dataRoomId_parentScope_normalizedName_key" ON "folders"("dataRoomId", "parentScope", "normalizedName");
CREATE UNIQUE INDEX "files_storageKey_key" ON "files"("storageKey");
CREATE INDEX "files_dataRoomId_folderId_createdAt_id_idx" ON "files"("dataRoomId", "folderId", "createdAt", "id");
CREATE INDEX "files_folderId_normalizedName_idx" ON "files"("folderId", "normalizedName");
CREATE UNIQUE INDEX "files_dataRoomId_folderScope_normalizedName_key" ON "files"("dataRoomId", "folderScope", "normalizedName");
CREATE UNIQUE INDEX "shares_tokenHash_key" ON "shares"("tokenHash");
CREATE INDEX "shares_granteeUserId_revokedAt_idx" ON "shares"("granteeUserId", "revokedAt");
CREATE INDEX "shares_dataRoomId_resourceType_resourceId_revokedAt_idx" ON "shares"("dataRoomId", "resourceType", "resourceId", "revokedAt");

-- AddForeignKey
ALTER TABLE "data_rooms" ADD CONSTRAINT "data_rooms_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "folders" ADD CONSTRAINT "folders_dataRoomId_fkey" FOREIGN KEY ("dataRoomId") REFERENCES "data_rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "folders" ADD CONSTRAINT "folders_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "folders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "files" ADD CONSTRAINT "files_dataRoomId_fkey" FOREIGN KEY ("dataRoomId") REFERENCES "data_rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "files" ADD CONSTRAINT "files_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "folders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "shares" ADD CONSTRAINT "shares_dataRoomId_fkey" FOREIGN KEY ("dataRoomId") REFERENCES "data_rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "shares" ADD CONSTRAINT "shares_granteeUserId_fkey" FOREIGN KEY ("granteeUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- The application accesses these tables only through the NestJS backend.
-- Keep Supabase Data API clients from reading metadata directly.
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "data_rooms" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "folders" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "files" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "shares" ENABLE ROW LEVEL SECURITY;
