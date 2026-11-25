#!/usr/bin/env bash
# 尝试激活 GitHub Actions 质量闸门。
#
# 为什么需要这个脚本：classic PAT 只有 `repo` scope 时，GitHub 会拒绝写入
# `.github/workflows/` 下的任何文件（remote rejected: refusing to allow a
# Personal Access Token to create or update workflow ... without `workflow` scope）。
# 所以 CI 配置存放在 `ci/github-actions.yml`，等 token 拿到 `workflow` scope 后
# 由本脚本搬进 `.github/workflows/ci.yml` 并推送。
#
# 用法：bash scripts/enable-ci.sh
# 退出码：0 = CI 已启用；3 = token 缺 workflow scope（待命，非错误）

set -uo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_DIR"

[ -n "${GITHUB_TOKEN:-}" ] || { echo '✗ GITHUB_TOKEN 未设置'; exit 1; }

scopes="$(curl -sI -m 25 -H "Authorization: Bearer ${GITHUB_TOKEN}" \
  https://api.github.com/user | tr -d '\r' | sed -n 's/^x-oauth-scopes: //Ip')"

echo "  当前 token scopes: ${scopes:-未知}"

if ! printf '%s' "$scopes" | grep -qw 'workflow'; then
  cat <<'EOF'
  ℹ️  token 缺 `workflow` scope，CI 保持待命（仓库推送不受影响）。
     需要启用 CI 时：
       1) GitHub → Settings → Developer settings → Personal access tokens
          → 重新生成一个同时勾选 `repo` + `workflow` 的 classic PAT
       2) 更新 GITHUB_TOKEN secret
       3) 重跑 bash scripts/enable-ci.sh
EOF
  exit 3
fi

mkdir -p .github/workflows
cp ci/github-actions.yml .github/workflows/ci.yml

git add -A .github ci
if git diff --cached --quiet; then
  echo '  CI 文件已在位，无需变更'
  exit 0
fi

git commit -q -m "ci: 启用 GitHub Actions 质量闸门（静态审查 + 全量测试）"
echo '  已提交，尝试推送…'
if bash scripts/push-retry.sh main; then
  echo '✓ CI 已启用：.github/workflows/ci.yml'
  exit 0
fi

echo '✗ 推送失败，CI 文件已保留在本地，git status 可查看' >&2
exit 1
