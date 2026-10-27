#!/usr/bin/env bash
# Move the upstream submodule to upstream's latest release and propose it as a
# pull request from the update branch, then start the checks of that branch.
#
# While the branch has an open pull request with commits from anyone but the
# bot, such as fixed patches, the new release is added on top of it and it is
# left for review. Otherwise the branch is replaced with a fresh one from the
# current checkout.
set -euo pipefail

: "${BRANCH:=update/upstream}"
: "${UPSTREAM_REPOSITORY:=bulwarkmail/webmail}"
submodule=upstream/webmail
output=${GITHUB_OUTPUT:-/dev/null}
body=$(mktemp)
bot_email='41898282+github-actions[bot]@users.noreply.github.com'
git config user.name 'github-actions[bot]'
git config user.email "$bot_email"

# Upstream's release tags have no v prefix.
tag=$(gh release view --repo "$UPSTREAM_REPOSITORY" --json tagName --jq .tagName)
git -C "$submodule" fetch --quiet --depth=1 origin "+refs/tags/$tag:refs/tags/$tag"
target=$(git -C "$submodule" rev-parse "refs/tags/$tag^{commit}")

# ls-remote exits with 2 when the branch doesn't exist; anything else is an
# error, which must not lead to replacing a branch that may hold fixes.
pending=true
pr=
git ls-remote --exit-code --heads origin "$BRANCH" > /dev/null || {
  status=$?
  (( status == 2 )) || exit "$status"
  pending=false
}
manual=false
# The branch may only be replaced if it is still where it was when fetched
# (or still missing), so pushes made meanwhile are never lost.
lease=
if [[ "$pending" == true ]]; then
  git fetch --quiet origin "+refs/heads/$BRANCH:refs/remotes/origin/$BRANCH"
  lease=$(git rev-parse "origin/$BRANCH")
  pr=$(gh pr list --head "$BRANCH" --state open --json number --jq '.[].number')
  authors=$(git log --format=%ae "HEAD..origin/$BRANCH")
  if [[ -n "$pr" && -n "$authors" ]] && grep -qvxF "$bot_email" <<< "$authors"; then
    manual=true
    git switch --quiet -C "$BRANCH" "origin/$BRANCH"
    echo "$BRANCH has changes from people; adding to it."
  fi
fi

if [[ "$(git rev-parse "HEAD:$submodule")" == "$target" ]]; then
  echo "$submodule is at upstream's latest release, $tag."
  exit 0
fi
git -C "$submodule" checkout --quiet --detach "$target"
git add "$submodule"
# Leave an identical pending update alone instead of checking it again,
# unless an earlier run pushed it but failed to open its pull request.
pushed=false
if [[ "$manual" == false && "$pending" == true ]] && git diff --cached --quiet "origin/$BRANCH"; then
  if [[ -n "$pr" ]]; then
    echo "$BRANCH already contains this update."
    exit 0
  fi
  pushed=true
fi

title="Update upstream to $tag"
{
  echo "Moves \`$submodule\` to [$tag](https://github.com/$UPSTREAM_REPOSITORY/releases/tag/$tag)."
  echo
  if log=$(node scripts/prepare.mjs 2>&1); then
    echo 'The patches, source files and locale keys still apply.'
  else
    echo 'Preparing the build failed, so the patches or overlays need updating:'
    echo
    echo '```'
    tail -n 40 <<< "$log"
    echo '```'
  fi
  echo
  echo "Check this branch's checks before merging, and tag a release afterwards."
} > "$body"
cat "$body"

if [[ "$pushed" == true ]]; then
  git switch --quiet -C "$BRANCH" "origin/$BRANCH"
  gh pr create --head "$BRANCH" --title "$title" --body-file "$body"
elif [[ "$manual" == true ]]; then
  git commit --quiet -m "$title"
  git push --quiet origin "$BRANCH"
  # Keep the description, which may have notes; report in a comment.
  gh pr edit "$BRANCH" --title "$title"
  gh pr comment "$BRANCH" --body-file "$body"
else
  git switch --quiet -C "$BRANCH"
  git commit --quiet -m "$title"
  git push --quiet --force-with-lease="refs/heads/$BRANCH:$lease" origin "$BRANCH" || {
    echo "$BRANCH changed while checking for updates; leaving it alone." >&2
    exit 1
  }
  if [[ -z "$(gh pr list --head "$BRANCH" --state open --json number --jq '.[].number')" ]]; then
    gh pr create --head "$BRANCH" --title "$title" --body-file "$body"
  else
    gh pr edit "$BRANCH" --title "$title" --body-file "$body"
  fi
fi

# Pushes made with GITHUB_TOKEN don't start other workflows; a dispatch
# does, and its result shows on the pull request's commit.
gh workflow run checks.yml --ref "$BRANCH"
echo "commit=$(git rev-parse HEAD)" >> "$output"
