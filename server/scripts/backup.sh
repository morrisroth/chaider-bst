#!/usr/bin/env bash
# Nightly off-site backup (run from cron on the production server).
#
#   1. data/ + documents/ + .env  -> one tar.gz, encrypted with gpg (AES256)
#      -> <remote>/daily/          kept 30 days
#      -> <remote>/monthly/        on the 1st, kept 1 year
#      -> ~/chaider-backups/       on the server too, last 7 kept (quick restores;
#                                    also the only copy until Google Drive is linked)
#   2. uploads/ (public photos/videos) -> <remote>/uploads, synced; files that
#      were deleted or replaced on the site are moved to uploads-deleted/<date>
#      and kept 30 days, so a mistaken delete can still be recovered.
#
# Setup (one-time, outside the repo):
#   ~/.config/chaider-backup/passphrase   random passphrase, chmod 600 — keep a copy off the server!
#   ~/.config/chaider-backup/config       optional: REMOTE=..., ALERT_TO=...
#   rclone remote "gdrive" (rclone config, Google Drive, scope drive.file) —
#     until it exists the off-site steps are skipped and only the local copy is kept
#
# Restore: rclone copy gdrive:chaider-backups/daily/<file> . &&
#          gpg --decrypt <file> | tar xz   (asks for the passphrase)

set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/chaider-bst}"
CONF_DIR="$HOME/.config/chaider-backup"
PASSFILE="$CONF_DIR/passphrase"
REMOTE="gdrive:chaider-backups"
LOCAL_DIR="$HOME/chaider-backups"
LOCAL_KEEP=7
ALERT_TO=""
[ -f "$CONF_DIR/config" ] && . "$CONF_DIR/config"

DATE="$(date +%F)"
WORK="$(mktemp -d)"
ARCHIVE="$WORK/chaider-$DATE.tar.gz.gpg"
trap 'rm -rf "$WORK"' EXIT

fail() {
  local msg="Backup failed on $(hostname) at $(date '+%F %T'): $1"
  echo "$msg" >&2
  # Email the alert through the site's own SMTP settings
  if [ -n "$ALERT_TO" ]; then
    ALERT_TO="$ALERT_TO" MSG="$msg" node -e '
      require("dotenv").config({ path: process.env.APP_DIR + "/server/.env" });
      const t = require("nodemailer").createTransport({
        host: process.env.SMTP_HOST, port: Number(process.env.SMTP_PORT) || 587,
        secure: process.env.SMTP_SECURE === "true",
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } });
      t.sendMail({ from: process.env.SMTP_FROM || process.env.SMTP_USER, to: process.env.ALERT_TO,
        subject: "⚠ גיבוי האתר נכשל — חיידר בעל שם טוב", text: process.env.MSG })
       .catch(e => { console.error("alert email failed:", e.message); process.exit(1); });
    ' 2>&1 || true
  fi
  exit 1
}
trap 'fail "line $LINENO: $BASH_COMMAND"' ERR
export APP_DIR
cd "$APP_DIR"   # node resolves dotenv/nodemailer from the app's node_modules

[ -s "$PASSFILE" ] || fail "missing passphrase file $PASSFILE"

echo "[$(date '+%F %T')] backup start"

# 1. Private data — encrypted before it leaves the server
tar -C "$APP_DIR/server" -czf - data documents .env \
  | gpg --batch --yes --pinentry-mode loopback --passphrase-file "$PASSFILE" \
        --symmetric --cipher-algo AES256 -o "$ARCHIVE"
echo "  data archive: $(du -h "$ARCHIVE" | cut -f1)"

# Local copy on the server, newest $LOCAL_KEEP kept
mkdir -p "$LOCAL_DIR" && chmod 700 "$LOCAL_DIR"
cp "$ARCHIVE" "$LOCAL_DIR/"
ls -1t "$LOCAL_DIR"/chaider-*.tar.gz.gpg | tail -n +$((LOCAL_KEEP + 1)) | xargs -r rm -f

# Off-site — skipped (not an error) until the Google Drive remote is linked
case "$REMOTE" in
  *:*) if ! rclone listremotes 2>/dev/null | grep -qx "${REMOTE%%:*}:"; then
         echo "  off-site skipped: rclone remote '${REMOTE%%:*}' not set up yet (local copy only)"
         echo "[$(date '+%F %T')] backup done (local only)"
         exit 0
       fi ;;
esac

# Retention below lists these folders — make sure they exist on the first run
for d in daily monthly uploads uploads-deleted; do rclone mkdir "$REMOTE/$d"; done
rclone copy "$ARCHIVE" "$REMOTE/daily/"
if [ "$(date +%d)" = "01" ]; then
  rclone copy "$ARCHIVE" "$REMOTE/monthly/"
fi

# 2. Public photos/videos — sync only what changed (thumbnails are regenerated on demand)
rclone sync "$APP_DIR/server/uploads" "$REMOTE/uploads" \
  --exclude "thumbs/**" --backup-dir "$REMOTE/uploads-deleted/$DATE"

# 3. Retention
rclone delete "$REMOTE/daily" --min-age 30d
rclone delete "$REMOTE/monthly" --min-age 365d
rclone delete "$REMOTE/uploads-deleted" --min-age 30d
rclone rmdirs "$REMOTE/uploads-deleted" --leave-root 2>/dev/null || true

echo "[$(date '+%F %T')] backup done"
