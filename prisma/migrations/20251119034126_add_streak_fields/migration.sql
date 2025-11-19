-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_users" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "qq_number" TEXT NOT NULL,
    "nickname" TEXT NOT NULL,
    "streak_days" INTEGER NOT NULL DEFAULT 0,
    "max_streak" INTEGER NOT NULL DEFAULT 0,
    "last_checkin_date" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);
INSERT INTO "new_users" ("created_at", "id", "nickname", "qq_number", "updated_at") SELECT "created_at", "id", "nickname", "qq_number", "updated_at" FROM "users";
DROP TABLE "users";
ALTER TABLE "new_users" RENAME TO "users";
CREATE UNIQUE INDEX "users_qq_number_key" ON "users"("qq_number");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
