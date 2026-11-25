#!/usr/bin/env bash
# git push 的稳健重试：TLS 握手偶发中断时的兜底
# 用法：bash scripts/push-retry.sh [远端分支]
set -uo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BRANCH="${1:-main}"
cd "$REPO_DIR"

git config http.version HTTP/1.1
git config http.postBuffer 524288000
git config http.lowSpeedLimit 1000
git config http.lowSpeedTime 30

basic="$(printf 'x-access-token:%s' "${GITHUB_TOKEN}" | base64 | tr -d '\n')"

max=8
for i in $(seq 1 $max); do
  printf '  推送尝试 %d/%d … ' "$i" "$max"
  if git -c "http.extraheader=AUTHORIZATION: basic ${basic}" \
         -c http.version=HTTP/1.1 \
         -c http.lowSpeedLimit=1000 -c http.lowSpeedTime=30 \
         push -u origin "HEAD:refs/heads/${BRANCH}" >/tmp/_push.log 2>&1; then
    echo "成功"
    exit 0
  fi
  tail -n 1 /tmp/_push.log | sed 's/^/    → /'
  sleep $((i * 6))
done

echo '✗ 推送失败（已重试全部次数）' >&2
tail -n 5 /tmp/_push.log >&2
exit 1
