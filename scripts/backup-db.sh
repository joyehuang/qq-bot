#!/usr/bin/env bash
# SQLite 分层备份：daily 7 份 + weekly 4 份 + monthly 12 份。
# 时间戳/天/月按北京时间计算，与 Bot 业务时区一致。
#
# 用法：
#   bash scripts/backup-db.sh           # 仅本地分层
#   bash scripts/backup-db.sh --remote  # 本地完成后用 restic 推送到 R2（需先 setup）
#
# 接入到 cron（推荐 ubuntu 用户 crontab，每天 03:00 北京时间）：
#   0 19 * * * /usr/bin/bash /mnt/hermes-data/community/projects/qq-bot/scripts/backup-db.sh --remote >> /mnt/hermes-data/community/backups/qq-bot/cron.log 2>&1
#   注：服务器 AEST(+10) 的 19:00 = 北京 17:00；如需北京 03:00 则写 0 5 * * *（AEST 5:00 = 北京 3:00）。
#   或者 crontab 设置 CRON_TZ=Asia/Shanghai 后用 `0 3 * * *`。

set -euo pipefail

PROJECT_DIR="/mnt/hermes-data/community/projects/qq-bot"
DB_PATH="$PROJECT_DIR/prisma/dev.db"
BACKUP_ROOT="/mnt/hermes-data/community/backups/qq-bot"
DAILY_DIR="$BACKUP_ROOT/daily"
WEEKLY_DIR="$BACKUP_ROOT/weekly"
MONTHLY_DIR="$BACKUP_ROOT/monthly"
MANIFEST="$BACKUP_ROOT/manifest.tsv"

REMOTE_FLAG="${1:-}"

mkdir -p "$DAILY_DIR" "$WEEKLY_DIR" "$MONTHLY_DIR"

if [ ! -f "$DB_PATH" ]; then
  echo "[backup] ERROR: 数据库文件不存在: $DB_PATH" >&2
  exit 1
fi

# 业务时区（北京时间）
export TZ='Asia/Shanghai'

TIMESTAMP=$(date '+%Y%m%d_%H%M%S')
DATESTAMP=$(date '+%Y-%m-%d')
DOW=$(date '+%u')   # 1=周一..7=周日
DOM=$(date '+%d')   # 月内日期 01..31

DAILY_FILE="$DAILY_DIR/db_${DATESTAMP}.sqlite"
echo "[backup] $(date '+%F %T %Z') 生成快照 → $DAILY_FILE"

# 用 sqlite3 .backup 在线热备份；不阻塞写入，输出文件页边界一致
sqlite3 "$DB_PATH" ".backup '$DAILY_FILE'"

HASH=$(sha256sum "$DAILY_FILE" | cut -d' ' -f1)
SIZE=$(stat -c%s "$DAILY_FILE")
printf '%s\tdaily\t%s\t%d\t%s\n' "$TIMESTAMP" "$DAILY_FILE" "$SIZE" "$HASH" >> "$MANIFEST"

# 周日（北京）额外归档到 weekly
if [ "$DOW" = "7" ]; then
  WEEKLY_FILE="$WEEKLY_DIR/db_week_${DATESTAMP}.sqlite"
  cp "$DAILY_FILE" "$WEEKLY_FILE"
  printf '%s\tweekly\t%s\t%d\t%s\n' "$TIMESTAMP" "$WEEKLY_FILE" "$SIZE" "$HASH" >> "$MANIFEST"
  echo "[backup] 周末快照 → $WEEKLY_FILE"
fi

# 每月 1 日额外归档到 monthly
if [ "$DOM" = "01" ]; then
  MONTHLY_FILE="$MONTHLY_DIR/db_month_${DATESTAMP}.sqlite"
  cp "$DAILY_FILE" "$MONTHLY_FILE"
  printf '%s\tmonthly\t%s\t%d\t%s\n' "$TIMESTAMP" "$MONTHLY_FILE" "$SIZE" "$HASH" >> "$MANIFEST"
  echo "[backup] 月度快照 → $MONTHLY_FILE"
fi

# 滚动保留：daily 7 / weekly 4 / monthly 12
cleanup_dir() {
  local dir="$1"
  local keep="$2"
  # 按文件名时间戳降序，保留前 keep 个，余下删除
  ls -1 "$dir" 2>/dev/null | sort -r | tail -n +"$((keep + 1))" | while read -r f; do
    [ -n "$f" ] && rm -f "$dir/$f" && echo "[backup] cleanup: $dir/$f"
  done
}

cleanup_dir "$DAILY_DIR" 7
cleanup_dir "$WEEKLY_DIR" 4
cleanup_dir "$MONTHLY_DIR" 12

echo "[backup] ✅ 本地备份完成（$SIZE 字节，sha256=${HASH:0:12}…）"

# 异地：restic 推送到 R2（默认关闭；显式 --remote 才走）
if [ "$REMOTE_FLAG" = "--remote" ]; then
  if ! command -v restic >/dev/null 2>&1; then
    echo "[backup] ⚠️ 未安装 restic，跳过异地推送"
    exit 0
  fi
  if [ ! -f "$HOME/.restic-env" ]; then
    echo "[backup] ⚠️ ~/.restic-env 不存在，跳过异地推送（参见 CICD.md 备份章节）"
    exit 0
  fi
  # shellcheck disable=SC1091
  set +u; source "$HOME/.restic-env"; set -u

  echo "[backup] restic 推送到 $RESTIC_REPOSITORY ..."
  restic backup "$BACKUP_ROOT/" --tag qq-bot-db --quiet
  restic forget --keep-daily 7 --keep-weekly 4 --keep-monthly 12 --prune --quiet
  echo "[backup] ✅ 异地推送完成"
fi
