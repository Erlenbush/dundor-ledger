#!/usr/bin/env bash
#
# Deploy the Dundor Ledger Discord bot to bespin.
#
# Run this from the repo root on a machine that has the bespin SSH key
# (devbuntu does; ~/.ssh/config defines the `bespin` host):
#
#     ./deploy/deploy-bot.sh
#
# What it does, all idempotent and safe to re-run for updates:
#   1. Builds @dundor/parser and @dundor/bot locally.
#   2. Rsyncs the tree to /home/dundor/dundor-ledger on bespin, shipping the
#      prebuilt dist/ so the 1 GB droplet never has to run tsc.
#   3. Installs production dependencies there with `npm ci --omit=dev`.
#   4. Restarts the service if (and only if) it is already installed.
#
# It deliberately does NOT install the systemd unit or write the token. The
# droplet has a guard on /etc/systemd/system, and the token is a secret this
# script should never see. Both are one-time manual steps, documented in
# docs/manual/bot-deploy-manual.md.
#
# The bot is built as an ESM Node 22 app; bespin runs Node 22 from NodeSource
# because Ubuntu 24.04's apt only offers Node 18 and the bot needs 20+.

set -euo pipefail

HOST="${DUNDOR_DEPLOY_HOST:-bespin}"
REMOTE_DIR="/home/dundor/dundor-ledger"
SERVICE="dundor-bot"

cd "$(dirname "$0")/.."

echo "==> Building parser and bot locally"
npm run build -w @dundor/parser
npm run build -w @dundor/bot

echo "==> Shipping tree to ${HOST}:${REMOTE_DIR}"
# --delete keeps the remote clean, but .env is excluded so the deployed secret
# survives every redeploy. node_modules is excluded because the remote runs its
# own production-only install against the shipped lockfile.
rsync -az --delete \
  --exclude 'node_modules' \
  --exclude '.git' \
  --exclude '.env' \
  --exclude 'apps/web/dist' \
  --exclude '.DS_Store' \
  ./ "${HOST}:${REMOTE_DIR}/"

echo "==> Installing production dependencies on ${HOST}"
ssh "${HOST}" "set -e
  cd ${REMOTE_DIR}
  npm ci --omit=dev --ignore-scripts
  chown -R dundor:dundor ${REMOTE_DIR}"

echo "==> Verifying the deployed build runs"
ssh "${HOST}" "cd ${REMOTE_DIR} && sudo -u dundor /usr/bin/node apps/bot/dist/dry.js \
  ${REMOTE_DIR}/fixtures/fungus-creature-loss-xl63.txt >/dev/null && echo 'dry run OK'"

echo "==> Restarting ${SERVICE} if installed"
if ssh "${HOST}" "systemctl list-unit-files | grep -q '^${SERVICE}.service'"; then
  ssh "${HOST}" "systemctl restart ${SERVICE} && sleep 2 && systemctl is-active ${SERVICE}"
  echo "==> ${SERVICE} restarted"
else
  cat <<EOF

==> ${SERVICE} is not installed yet, so nothing was restarted.
    The code is deployed and verified. To finish the first-time setup, see
    docs/manual/bot-deploy-manual.md — it covers filling in the token and
    installing the systemd unit, both of which must be done by hand.
EOF
fi

echo "==> Done"
