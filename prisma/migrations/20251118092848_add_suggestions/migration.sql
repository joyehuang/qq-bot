-- CreateTable
CREATE TABLE "suggestions" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "qq_number" TEXT NOT NULL,
    "nickname" TEXT NOT NULL,
    "group_id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
