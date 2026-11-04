#!/usr/bin/env bash
# Fast-forwards the deploy branch to TARGET if CI is green; see the deploy button spec.
set -euo pipefail

BRANCH=${DEPLOY_BRANCH:-production}

label() { git log -1 --format='%h (%s)' "$1"; }
say() { printf '%s\n' "$1" >> "$GITHUB_STEP_SUMMARY"; }
fence() { printf '%s\n```\n%s\n```' "$1" "$2"; }
fail() {
  local m=$1
  say "$m"
  m=${m//'%'/%25}
  m=${m//$'\r'/%0D}
  m=${m//$'\n'/%0A}
  printf '::error::%s\n' "$m"
  exit 1
}

[ "$SOURCE_REF" = refs/heads/main ] || fail "Start the deploy from main."

if ! err=$(git fetch origin "+refs/heads/$BRANCH:refs/remotes/origin/$BRANCH" 2>&1); then
  fail "$(fence "Could not read $BRANCH:" "$err")"
fi
PROD=$(git rev-parse "refs/remotes/origin/$BRANCH^{commit}")

if ! err=$(git cat-file -e "$TARGET^{commit}" 2>&1); then
  fail "$(fence "Could not read the target:" "${err:-no commit $TARGET}")"
fi

if git merge-base --is-ancestor "$TARGET" "$PROD"; then
  say "Nothing to deploy: $BRANCH is already at $(label "$PROD")."
  exit 0
fi

if ! git merge-base --is-ancestor "$PROD" "$TARGET"; then
  fail "$BRANCH ($(label "$PROD")) is not on main; an admin must reset it (README, Deployment)."
fi

errf=$(mktemp)
if ! checks=$(gh api "repos/$REPO/commits/$TARGET/check-runs?app_id=15368&per_page=100" 2>"$errf"); then
  err=$(cat "$errf")
  fail "$(fence "Could not read its checks:" "${err:-$checks}")"
fi
if ! states=$(jq -r '
  def state($n):
    ([.check_runs[] | select(.name == $n)][0]) as $c
    | if $c == null then "not started"
      elif $c.status == "completed" then ($c.conclusion // "unknown")
      elif $c.status == "in_progress" then "in progress"
      else "not started" end;
  state("test"), state("style-check")' <<<"$checks" 2>&1); then
  fail "$(fence "Could not read its checks:" "$states")"
fi
mapfile -t S <<<"$states"
if [ "${S[0]}" != success ] || [ "${S[1]}" != success ]; then
  fail "CI on $(label "$TARGET") is not green: test ${S[0]}, style-check ${S[1]}. Deploy once both pass."
fi

if ! out=$(git push origin "$TARGET:refs/heads/$BRANCH" 2>&1); then
  if grep -e 'refusing to allow' <<<"$out" | grep -q workflow; then
    full=$(git rev-parse "$TARGET^{commit}")
    fail "$(fence "GitHub does not let this button push changes to workflow files, and $(label "$TARGET") includes some. Deploy it from a terminal instead:" "git push origin $full:$BRANCH")"
  fi
  fail "$(fence "Push of $(label "$TARGET") to $BRANCH refused:" "$out")"
fi

say "Deployed $(label "$TARGET") by $ACTOR."
git log --format='- %h (%s)' "$PROD..$TARGET" >> "$GITHUB_STEP_SUMMARY"
