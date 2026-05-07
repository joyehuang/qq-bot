-- CreateTable
CREATE TABLE "ai_call_logs" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "scenario" TEXT NOT NULL,
    "caller_qq" TEXT,
    "group_qq" TEXT,
    "model" TEXT,
    "system_prompt" TEXT NOT NULL,
    "user_prompt" TEXT NOT NULL,
    "response_text" TEXT,
    "duration_ms" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "error_msg" TEXT,
    "prompt_tokens" INTEGER,
    "completion_tokens" INTEGER,
    "session_id" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "ai_call_logs_created_at_idx" ON "ai_call_logs"("created_at");

-- CreateIndex
CREATE INDEX "ai_call_logs_scenario_created_at_idx" ON "ai_call_logs"("scenario", "created_at");

-- CreateIndex
CREATE INDEX "ai_call_logs_caller_qq_idx" ON "ai_call_logs"("caller_qq");

-- CreateIndex
CREATE INDEX "ai_call_logs_status_idx" ON "ai_call_logs"("status");
