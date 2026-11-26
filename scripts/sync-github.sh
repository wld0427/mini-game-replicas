#!/usr/bin/env bash
# 把 mini-game-replicas 推送到 GitHub（单仓库多目录）。
#
# 依赖：GITHUB_TOKEN（secret 管理，需 repo 权限）+ git + curl。
# 沙箱里没有 gh CLI，所以建仓库走 REST API，推送走 git http.extraheader。
#
# 用法：bash scripts/sync-github.sh
# 退出码：0 = 推送成功；非 0 = 失败（凭证无效、网络问题等）

set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OWNER="${GITHUB_OWNER:-wld0427}"
REPO="${GITHUB_REPO:-mini-game-replicas}"
BRANCH="${GITHUB_BRANCH:-main}"
API="https://api.github.com"

log() { printf '%s\n' "$*"; }
fail() { printf '✗ %s\n' "$*" >&2; exit 1; }

# ── 0. 前置检查 ──────────────────────────────────────
[ -n "${GITHUB_TOKEN:-}" ] || fail "GITHUB_TOKEN 未设置，无法访问 GitHub。"

command -v git >/dev/null || fail "缺少 git"
command -v curl >/dev/null || fail "缺少 curl"

# ── 1. 校验凭证 ──────────────────────────────────────
log "→ 校验 GitHub 凭证…"
auth_out="$(curl -sS -m 25 -H "Authorization: Bearer ${GITHUB_TOKEN}" \
  -H "Accept: application/vnd.github+json" "${API}/user")"
if printf '%s' "$auth_out" | grep -q '"Bad credentials"'; then
  fail "GITHUB_TOKEN 无效（401 Bad credentials）。请更新 secret 后重试。"
fi
if ! printf '%s' "$auth_out" | grep -q '"login"'; then
  fail "无法解析 GitHub 用户信息，响应：${auth_out:0:200}"
fi
login="$(printf '%s' "$auth_out" | sed -n 's/.*"login"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -1)"
log "  已认证为 ${login}"

# ── 2. 确保仓库存在 ──────────────────────────────────
log "→ 检查仓库 ${OWNER}/${REPO}…"
repo_code="$(curl -sS -m 25 -o /tmp/_gh_repo.json -w '%{http_code}' \
  -H "Authorization: Bearer ${GITHUB_TOKEN}" -H "Accept: application/vnd.github+json" \
  "${API}/repos/${OWNER}/${REPO}")"

if [ "$repo_code" = "404" ]; then
  log "  仓库不存在，创建一个…"
  create_code="$(curl -sS -m 30 -o /tmp/_gh_create.json -w '%{http_code}' -X POST \
    -H "Authorization: Bearer ${GITHUB_TOKEN}" -H "Accept: application/vnd.github+json" \
    "${API}/user/repos" \
    -d "$(printf '{"name":"%s","description":"有意思的网页小游戏复刻合集：原创实现 + 单测 + 冒烟测试","private":true,"auto_init":false}' "$REPO")")"
  if [ "$create_code" != "201" ]; then
    fail "创建仓库失败（HTTP ${create_code}）：$(head -c 300 /tmp/_gh_create.json)"
  fi
  log "  创建成功"
elif [ "$repo_code" = "200" ]; then
  log "  仓库已存在"
else
  fail "查询仓库失败（HTTP ${repo_code}）：$(head -c 300 /tmp/_gh_repo.json)"
fi

# ── 3. 本地提交 ──────────────────────────────────────
cd "$REPO_DIR"
git config http.version HTTP/1.1
git config http.postBuffer 524288000
git config user.name "${login:-wld}"
git config user.email "991589365@qq.com"

if [ ! -d .git ]; then
  git init -q -b "$BRANCH"
fi

git add -A
if git diff --cached --quiet; then
  log "→ 工作区无变化，跳过提交"
else
  git commit -q -m "chore: 更新复刻项目与追踪表"
  log "→ 已提交：$(git rev-parse --short HEAD)"
fi

# ── 4. 同步远端 ──────────────────────────────────────
# 定时任务在独立工作区执行，多个会话可能并发推同一个分支。
# 直接 push 会被 remote rejected（非快进），所以先 fetch + rebase。
# fetch 和 push 一样会因共享出口的 TLS 中断而失败，必须重试。
# 只试 1 次会导致拿不到远端最新状态，进而在推送时撞上 non-fast-forward 分叉。
log "→ 同步远端历史…"
git remote remove origin 2>/dev/null || true
git remote add origin "https://github.com/${OWNER}/${REPO}.git"

basic="$(printf 'x-access-token:%s' "$GITHUB_TOKEN" | base64 | tr -d '\n')"
# 让 fetch 也能带凭证（否则 git 会卡在交互式输入用户名）
git config "http.https://github.com/.extraheader" "AUTHORIZATION: basic ${basic}"

fetch_ok=0
for attempt in 1 2 3 4 5; do
  if git fetch --quiet origin "$BRANCH" 2>/tmp/_gh_fetch.err; then
    fetch_ok=1
    log "  远端已获取（第 ${attempt} 次尝试）"
    break
  fi
  log "  fetch 第 ${attempt} 次失败：$(tail -n 1 /tmp/_gh_fetch.err | cut -c1-70)"
  sleep $((attempt * 4))
done
[ "$fetch_ok" = "1" ] || log "  ⚠️ fetch 全部尝试失败（继续尝试推送，推送可能因分叉被拒）"

if git rev-parse --verify "origin/${BRANCH}" >/dev/null 2>&1; then
  if ! git merge-base --is-ancestor "origin/${BRANCH}" HEAD 2>/dev/null; then
    log "  远端有本地没有的提交，执行 rebase…"
    if git rebase "origin/${BRANCH}" >/tmp/_gh_rebase.log 2>&1; then
      log "  rebase 完成"
    else
      git rebase --abort >/dev/null 2>&1 || true
      fail "rebase 冲突已中止，请人工处理。日志：$(tail -n 3 /tmp/_gh_rebase.log)"
    fi
  fi
fi
# ── 5. 推送 ──────────────────────────────────────────
log "→ 推送到 origin…"
if bash "$(dirname "${BASH_SOURCE[0]}")/push-retry.sh" "$BRANCH"; then
  log "✓ 推送完成：https://github.com/${OWNER}/${REPO}"
else
  fail "推送失败（详见上方重试日志）"
fi
