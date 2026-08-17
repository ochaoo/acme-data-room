CREATE TABLE "file_versions" (
    "id" UUID NOT NULL,
    "fileId" UUID NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" BIGINT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "file_versions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "file_versions_storageKey_key" ON "file_versions"("storageKey");
CREATE UNIQUE INDEX "file_versions_fileId_versionNumber_key" ON "file_versions"("fileId", "versionNumber");
CREATE INDEX "file_versions_fileId_createdAt_idx" ON "file_versions"("fileId", "createdAt");

ALTER TABLE "file_versions"
  ADD CONSTRAINT "file_versions_fileId_fkey"
  FOREIGN KEY ("fileId") REFERENCES "files"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "file_versions" ("id", "fileId", "versionNumber", "storageKey", "mimeType", "sizeBytes", "createdAt")
SELECT gen_random_uuid(), "id", 1, "storageKey", "mimeType", "sizeBytes", "createdAt"
FROM "files";
