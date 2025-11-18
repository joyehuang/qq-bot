-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_checkins" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "user_id" INTEGER NOT NULL,
    "group_id" TEXT NOT NULL,
    "duration" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "is_loan" BOOLEAN NOT NULL DEFAULT false,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "checkins_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_checkins" ("content", "created_at", "duration", "group_id", "id", "user_id") SELECT "content", "created_at", "duration", "group_id", "id", "user_id" FROM "checkins";
DROP TABLE "checkins";
ALTER TABLE "new_checkins" RENAME TO "checkins";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
