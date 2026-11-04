#!/usr/bin/env bash
# Scenario tests for deploy-production.sh; needs only bash, git, jq and coreutils.
set -uo pipefail

here=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
script=$here/deploy-production.sh
root=$(mktemp -d)
trap 'rm -rf "$root"' EXIT

export GIT_AUTHOR_NAME=tester GIT_AUTHOR_EMAIL=tester@example.com
export GIT_COMMITTER_NAME=tester GIT_COMMITTER_EMAIL=tester@example.com
export GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_NOSYSTEM=1

GREEN='{"check_runs":[{"name":"test","status":"completed","conclusion":"success"},{"name":"style-check","status":"completed","conclusion":"success"}]}'
status=0

# Fresh origin (main A<-B<-C, production at A, branch x = A<-X) and a clone of it.
begin() {
  name=$1 csub=${2:-C} xsub=${3:-X} fails=
  T=$(mktemp -d "$root/case.XXXXXX")
  git init -q --bare -b main "$T/origin.git"
  git init -q -b main "$T/seed"
  (
    cd "$T/seed" || exit 1
    git remote add origin "$T/origin.git"
    git commit -q --allow-empty -m A
    git push -q origin HEAD:refs/heads/production
    git commit -q --allow-empty -m B
    git commit -q --allow-empty -m "$csub"
    git push -q origin main
    git checkout -q -b x main~2
    git commit -q --allow-empty -m "$xsub"
    git push -q origin x
  ) || { echo "setup failed" >&2; exit 2; }
  git clone -q "$T/origin.git" "$T/work"
  A=$(git -C "$T/work" rev-parse origin/main~2)
  B=$(git -C "$T/work" rev-parse origin/main~1)
  C=$(git -C "$T/work" rev-parse origin/main)
  X=$(git -C "$T/work" rev-parse origin/x)
  mkdir "$T/bin"
  cat > "$T/bin/gh" <<'STUB'
#!/usr/bin/env bash
if [ "${FAKE_GH_FAIL:-}" = 1 ]; then echo "gh: HTTP 502 boom" >&2; exit 1; fi
printf '%s\n' "$FAKE_CHECKS"
STUB
  chmod +x "$T/bin/gh"
  : > "$T/summary"
  src=refs/heads/main target=$C checks=$GREEN ghfail=0
}

label() { git -C "$T/work" log -1 --format='%h (%s)' "$1"; }
set_prod() { git -C "$T/origin.git" update-ref refs/heads/production "$1"; }
hook() { printf '#!/bin/sh\n%s\nexit 1\n' "$1" > "$T/origin.git/hooks/pre-receive"; chmod +x "$T/origin.git/hooks/pre-receive"; }

run() {
  rc=0
  (cd "$T/work" && env -u DEPLOY_BRANCH PATH="$T/bin:$PATH" SOURCE_REF="$src" TARGET="$target" \
    ACTOR=tester REPO=o/r GH_TOKEN=x GITHUB_STEP_SUMMARY="$T/summary" \
    FAKE_CHECKS="$checks" FAKE_GH_FAIL="$ghfail" bash "$script") > "$T/out" 2> "$T/err" || rc=$?
}

want() { grep -qF -- "$1" "$T/summary" || fails+=" summary lacks [$1];"; }
wantnot() { ! grep -qF -- "$1" "$T/summary" || fails+=" summary has [$1];"; }
want_out() { grep -qF -- "$1" "$T/out" || fails+=" stdout lacks [$1];"; }
want_one_error() {
  [ "$(grep -c '^::error::' "$T/out")" = 1 ] || fails+=" stdout has not exactly one ::error:: line;"
}

# finish <exit code> <production sha on origin, empty if absent>
finish() {
  local got
  [ "$rc" = "$1" ] || fails+=" exit $rc, want $1;"
  got=$(git -C "$T/origin.git" rev-parse --verify -q refs/heads/production || true)
  [ "$got" = "$2" ] || fails+=" production at [$got], want [$2];"
  if [ -z "$fails" ]; then echo "ok - $name"; else echo "not ok - $name:$fails"; status=1; fi
}

begin refuses_other_ref
src=refs/heads/feature
run
want 'Start the deploy from main.'
finish 1 "$A"

begin nothing_when_equal
set_prod "$C"
run
want "Nothing to deploy: production is already at $(label "$C")"
finish 0 "$C"

begin nothing_when_ahead
set_prod "$C"; target=$B
run
want "$(label "$C")"
wantnot "$(label "$B")"
finish 0 "$C"

begin first_row_wins_over_red_checks
set_prod "$C"
checks='{"check_runs":[{"name":"test","status":"completed","conclusion":"failure"},{"name":"style-check","status":"completed","conclusion":"success"}]}'
run
want 'Nothing to deploy'
finish 0 "$C"

begin refuses_diverged
set_prod "$X"
run
want "production ($(label "$X")) is not on main"
finish 1 "$X"

begin not_green_lists_states
checks='{"check_runs":[{"name":"test","status":"in_progress"},{"name":"style-check","status":"completed","conclusion":"failure"}]}'
run
want 'test in progress, style-check failure'
want "CI on $(label "$C") is not green:"
want 'Deploy once both pass.'
finish 1 "$A"

begin not_green_missing_check
checks='{"check_runs":[{"name":"style-check","status":"completed","conclusion":"success"}]}'
run
want 'test not started'
finish 1 "$A"

begin deploys_and_lists
run
want "Deployed $(label "$C") by tester."
want "- $(label "$C")"
want "- $(label "$B")"
wantnot "$(label "$A")"
finish 0 "$C"

begin push_refused
hook 'echo "hook line one" >&2; echo "hook line two" >&2'
run
want "Push of $(label "$C") to production refused:"
want 'hook line one'
want 'hook line two'
want_one_error
want_out '%0A'
finish 1 "$A"

begin push_refused_workflow
hook "echo 'refusing to allow a GitHub App to create or update workflow \`.github/workflows/ci.yml\` without \`workflows\` permission' >&2"
run
want 'does not let this button push changes to workflow files'
want "git push origin $C:production"
wantnot 'refused:'
finish 1 "$A"

begin branch_unreadable
git -C "$T/origin.git" update-ref -d refs/heads/production
run
want 'Could not read production:'
finish 1 ""

begin checks_unreadable
ghfail=1
run
want 'Could not read its checks:'
finish 1 "$A"

begin unknown_target
target=deadbeefdeadbeefdeadbeefdeadbeefdeadbeef
run
want 'Could not read the target:'
finish 1 "$A"

begin literal_subject 'fix: 100% `tick` "q" $(touch pwned)'
run
want 'fix: 100% `tick` "q" $(touch pwned)'
[ ! -e "$T/work/pwned" ] && [ ! -e "$T/pwned" ] && [ ! -e "$root/pwned" ] || fails+=" a pwned file exists;"
finish 0 "$C"

begin literal_subject_in_error C 'fix: 100% `tick`'
set_prod "$X"
run
want_one_error
want_out '100%25 `tick`'
want '100%'
finish 1 "$X"

exit "$status"
