/*
  Warnings:

  - You are about to drop the `study_checkpoints` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `study_plans` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `study_projects` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the column `study_style` on the `users` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "study_checkpoints_completed_at_idx";

-- DropIndex
DROP INDEX "study_checkpoints_plan_id_idx";

-- DropIndex
DROP INDEX "study_plans_user_id_project_id_key";

-- DropIndex
DROP INDEX "study_plans_project_id_idx";

-- DropIndex
DROP INDEX "study_plans_user_id_idx";

-- DropIndex
DROP INDEX "study_projects_project_key_key";

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "study_checkpoints";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "study_plans";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "study_projects";
PRAGMA foreign_keys=on;

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
    "daily_goal" INTEGER,
    "ai_style" TEXT NOT NULL DEFAULT 'encourage',
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);
INSERT INTO "new_users" ("ai_style", "created_at", "daily_goal", "id", "last_checkin_date", "max_streak", "nickname", "qq_number", "streak_days", "updated_at") SELECT "ai_style", "created_at", "daily_goal", "id", "last_checkin_date", "max_streak", "nickname", "qq_number", "streak_days", "updated_at" FROM "users";
DROP TABLE "users";
ALTER TABLE "new_users" RENAME TO "users";
CREATE UNIQUE INDEX "users_qq_number_key" ON "users"("qq_number");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
