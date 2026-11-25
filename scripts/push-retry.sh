#!/usr/bin/env bash
# git push 的稳健重试：沙箱出口 TLS 握手偶发中断时的兜底。
#
# 用法：bash scripts/push-retry.sh [远端分支]
# 退出码：0 = 推送成功；1 = 失败
#
# 说明：凭证统一走仓库级配置 `http.https://github.com/.extraheader`，
# 这样 fetch 与 push 行为一致，不会出现重复 Authorization 头。

set -uo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BRANCH="${1:-main}"
cd "$REPO_DIR"

git config http.version HTTP/1.1
git config http.postBuffer 524288000
git config http.lowSpeedLimit 1
git config http.lowSpeedTime 120

# 没有配置凭证时，用环境变量补上
if [ -z "$(git config --get http.https://github.com/.extraheader || true)" ]; then
  if [ -n "${GITHUB_TOKEN:-}" ]; then
    basic="$(printf 'x-access-token:%s' "$GITHUB_TOKEN" | base64 | tr -d '\n')"
    git config "http.https://github.com/.extraheader" "AUTHORIZATION: basic ${basic}"
  else
    echo '✗ 未找到 GitHub 凭证（http.extraheader 未配置且 GITHUB_TOKEN 为空）' >&2
    exit 1
  fi
fi

max=8
for i in $(seq 1 $max); do
  printf '  推送尝试 %d/%d … ' "$i" "$max"
  if git push -u origin "HEAD:refs/heads/${BRANCH}" >/tmp/_push.log 2>&1; then
    echo '成功'
    exit 0
  fi
  tail -n 1 /tmp/_push.log | sed 's/^/    → /'
  sleep $((i * 6))
done

echo '✗ 推送失败（已重试全部次数）' >&2
tail -n 5 /tmp/_push.log >&2
exit 1
