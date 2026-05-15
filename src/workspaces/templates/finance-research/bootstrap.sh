#!/usr/bin/env bash
# Bootstrap a finance-research workspace: same skeleton as `chat`
# (OpenAlice MCP wiring + Alice persona) plus a fresh clone of
# himself65/finance-skills with three plugins installed at project scope.
#
# Contract:
#   argv:  $1 = tag, $2 = outDir
#   env:   AQ_TEMPLATE_FILES_DIR  — abs path to this template's files/
#          AQ_LAUNCHER_REPO_ROOT  — abs path to the OpenAlice repo root
# exit:  0 ok, non-zero on any failure
#
# Design notes (do not "optimize" without re-reading):
#   - We git clone himself65/finance-skills FRESH on every workspace
#     creation, intentionally NOT mirror-cached like Auto-Quant. The
#     upstream clone-traffic is co-promotion of an open-source author
#     who's part of the ecosystem we want to grow — saving our own
#     bandwidth here would erase that signal. Don't refactor to a mirror.
#   - Plugin install uses --scope project so workspace state lives in
#     ./.claude/settings.json (extraKnownMarketplaces + enabledPlugins),
#     not user-global ~/.claude/. Multiple finance-research workspaces
#     coexist without colliding on per-project enabled state. The plugin
#     binary cache at ~/.claude/plugins/cache/ IS shared across workspaces
#     (content-addressed) — that's a feature, not a leak.
#   - Plugin install is best-effort: a network blip or upstream renaming
#     a plugin shouldn't fail the whole bootstrap. CLAUDE.md tells the
#     user how to retry manually. The workspace itself stays usable
#     against OpenAlice's own MCP tools even if the finance-skills layer
#     never installs.

set -euo pipefail

TAG="${1:?tag required}"
OUT_DIR="${2:?outDir required}"
: "${AQ_TEMPLATE_FILES_DIR:?AQ_TEMPLATE_FILES_DIR must be set by the launcher}"

source "$(dirname "${BASH_SOURCE[0]}")/../_common.sh"

FINANCE_SKILLS_REPO="https://github.com/himself65/finance-skills.git"
FINANCE_SKILLS_DIR=".finance-skills"
PLUGINS_TO_INSTALL=(
  finance-market-analysis
  finance-social-readers
  finance-data-providers
)

init_workspace_dir "$OUT_DIR"
WS_ID="$(extract_ws_id "$OUT_DIR")"

write_mcp_config "$WS_ID" "$AQ_TEMPLATE_FILES_DIR"
compose_persona_claude_md "$AQ_TEMPLATE_FILES_DIR"

git init -q
# Exclude the cloned upstream repo from this workspace's commits — users
# shouldn't accidentally `git add .` and bake the entire finance-skills
# repo into their own workspace history.
setup_git_excludes "$FINANCE_SKILLS_DIR/"

# ── Clone finance-skills (best effort) ──────────────────────────────────
FINANCE_OK=false
FINANCE_COMMIT=""
echo "[finance-research] cloning $FINANCE_SKILLS_REPO (shallow) ..." >&2
if git clone --depth=1 --quiet "$FINANCE_SKILLS_REPO" "$FINANCE_SKILLS_DIR" >&2; then
  FINANCE_OK=true
  FINANCE_COMMIT="$(git -C "$FINANCE_SKILLS_DIR" rev-parse HEAD 2>/dev/null || echo unknown)"
  echo "[finance-research] cloned at $FINANCE_COMMIT" >&2
else
  echo "[finance-research] WARN: git clone failed; workspace usable without finance-skills" >&2
fi

# ── Register marketplace + install plugins (best effort) ────────────────
INSTALLED_PLUGINS=()
FAILED_PLUGINS=()
if [[ "$FINANCE_OK" == "true" ]] && command -v claude >/dev/null 2>&1; then
  echo "[finance-research] registering local marketplace ..." >&2
  if claude plugin marketplace add "./$FINANCE_SKILLS_DIR" --scope project < /dev/null >&2; then
    for plugin in "${PLUGINS_TO_INSTALL[@]}"; do
      echo "[finance-research] installing $plugin ..." >&2
      if claude plugin install "${plugin}@finance-skills" --scope project < /dev/null >&2; then
        INSTALLED_PLUGINS+=("$plugin")
      else
        FAILED_PLUGINS+=("$plugin")
        echo "[finance-research] WARN: install failed for $plugin" >&2
      fi
    done
  else
    echo "[finance-research] WARN: marketplace add failed; plugins not installed" >&2
    FAILED_PLUGINS=("${PLUGINS_TO_INSTALL[@]}")
  fi
elif [[ "$FINANCE_OK" == "true" ]]; then
  echo "[finance-research] WARN: 'claude' CLI not in PATH; plugins not installed" >&2
  FAILED_PLUGINS=("${PLUGINS_TO_INSTALL[@]}")
fi

# ── Debug breadcrumb ────────────────────────────────────────────────────
{
  echo "# OpenAlice finance-research workspace"
  echo "createdAt: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "tag: $TAG"
  echo "wsId: $WS_ID"
  echo "financeSkillsRepo: $FINANCE_SKILLS_REPO"
  echo "financeSkillsCloned: $FINANCE_OK"
  echo "financeSkillsCommit: ${FINANCE_COMMIT:-n/a}"
  echo "installedPlugins: ${INSTALLED_PLUGINS[*]:-none}"
  echo "failedPlugins: ${FAILED_PLUGINS[*]:-none}"
} > .openalice-finance-info

# .openalice-finance-info is internal — keep it out of user commits.
echo '.openalice-finance-info' >> .git/info/exclude

commit_initial "$TAG" finance-research

if [[ ${#FAILED_PLUGINS[@]} -gt 0 ]]; then
  echo "[finance-research] bootstrapped with WARN — see CLAUDE.md → Recovery to retry: ${FAILED_PLUGINS[*]}" >&2
fi

echo "bootstrapped finance-research workspace '$TAG' at $OUT_DIR"
