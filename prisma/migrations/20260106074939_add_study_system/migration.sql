-- CreateTable
CREATE TABLE "study_projects" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "project_key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "config" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "study_plans" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "user_id" INTEGER NOT NULL,
    "project_id" TEXT NOT NULL,
    "current_module" TEXT NOT NULL DEFAULT '',
    "current_step" TEXT NOT NULL DEFAULT '',
    "module_progress" INTEGER NOT NULL DEFAULT 0,
    "total_progress" INTEGER NOT NULL DEFAULT 0,
    "reminder_enabled" BOOLEAN NOT NULL DEFAULT true,
    "joined_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_active_at" DATETIME,
    CONSTRAINT "study_plans_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "study_plans_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "study_projects" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "study_checkpoints" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "plan_id" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "step" TEXT NOT NULL,
    "content" TEXT,
    "duration" INTEGER NOT NULL,
    "checkin_id" INTEGER,
    "completed_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "study_checkpoints_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "study_plans" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

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
    "study_style" TEXT NOT NULL DEFAULT 'teacher',
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);
INSERT INTO "new_users" ("ai_style", "created_at", "daily_goal", "id", "last_checkin_date", "max_streak", "nickname", "qq_number", "streak_days", "updated_at") SELECT "ai_style", "created_at", "daily_goal", "id", "last_checkin_date", "max_streak", "nickname", "qq_number", "streak_days", "updated_at" FROM "users";
DROP TABLE "users";
ALTER TABLE "new_users" RENAME TO "users";
CREATE UNIQUE INDEX "users_qq_number_key" ON "users"("qq_number");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "study_projects_project_key_key" ON "study_projects"("project_key");

-- CreateIndex
CREATE INDEX "study_plans_user_id_idx" ON "study_plans"("user_id");

-- CreateIndex
CREATE INDEX "study_plans_project_id_idx" ON "study_plans"("project_id");

-- CreateIndex
CREATE UNIQUE INDEX "study_plans_user_id_project_id_key" ON "study_plans"("user_id", "project_id");

-- CreateIndex
CREATE INDEX "study_checkpoints_plan_id_idx" ON "study_checkpoints"("plan_id");

-- CreateIndex
CREATE INDEX "study_checkpoints_completed_at_idx" ON "study_checkpoints"("completed_at");
