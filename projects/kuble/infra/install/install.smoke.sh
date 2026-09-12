#!/usr/bin/env bash
set -euo pipefail
root="$(cd "$(dirname "$0")" && pwd)"
src="$root/install.sh"
fail() { echo "FAIL: $*" >&2; exit 1; }
g() { grep -F -e "$1" "$src" >/dev/null || fail "missing $1"; }

g '--update)'
g '--uninstall)'
g '--delete-data)'
g '--dev)'
g 'Keeping existing .env.'
g 'Volumes and .env are kept.'
g 'down --volumes'
g 'install-images.sh'
g '/health/db'
g '/health/worker'
g '/health/computer'
g '[--update] [--uninstall] [--delete-data] [--dev] [--prepare-only]'

bash -n "$src" || fail "bash -n failed"

set +e
out="$(bash "$src" --not-a-flag 2>&1)"
code=$?
set -e
[[ "$code" -eq 2 ]] || fail "expected exit 2 for unknown flag, got $code"
[[ "$out" == *"Usage: bash install.sh"* ]] || fail "usage missing from stderr"

set +e
out="$(bash "$src" --delete-data 2>&1)"
code=$?
set -e
[[ "$code" -eq 1 ]] || fail "expected exit 1 for --delete-data alone, got $code"
[[ "$out" == *"--delete-data can only be used with --uninstall"* ]] || fail "delete-data guard missing"

set +e
out="$(bash "$src" --update --uninstall 2>&1)"
code=$?
set -e
[[ "$code" -eq 1 ]] || fail "expected exit 1 for --update --uninstall, got $code"

tmp="$(mktemp -d "${TMPDIR:-/tmp}/ratatosk-install-smoke.XXXXXX")"
cleanup_tmp() { rm -rf "$tmp"; }
trap cleanup_tmp EXIT

write_stubs() {
  local bin="$1"
  mkdir -p "$bin"
  cat > "$bin/docker" <<'STUB'
#!/usr/bin/env bash
set -euo pipefail
log="${STUB_DOCKER_LOG:?}"
{
  printf 'docker'
  for a in "$@"; do
    printf ' %s' "$a"
  done
  printf '\n'
} >> "$log"
if [[ "${1:-}" != compose ]]; then
  echo "STUB: unexpected docker $*" >&2
  exit 1
fi
if [[ "${2:-}" == version ]]; then
  echo "Docker Compose version v2.29.0"
  exit 0
fi
exit 0
STUB
  cat > "$bin/curl" <<'STUB'
#!/usr/bin/env bash
set -euo pipefail
log="${STUB_CURL_LOG:?}"
printf '%s\n' "$*" >> "$log"
exit 0
STUB
  cat > "$bin/openssl" <<'STUB'
#!/usr/bin/env bash
echo 00ff00ff00ff00ff00ff00ff00ff00ff00ff00ff00ff00ff00ff00ff00ff00ff
STUB
  cat > "$bin/git" <<'STUB'
#!/usr/bin/env bash
exit 0
STUB
  chmod +x "$bin/docker" "$bin/curl" "$bin/openssl" "$bin/git"
}

bin="$tmp/bin"
write_stubs "$bin"
export PATH="$bin:$PATH"
export STUB_DOCKER_LOG="$tmp/docker.log"
export STUB_CURL_LOG="$tmp/curl.log"
: > "$STUB_DOCKER_LOG"
: > "$STUB_CURL_LOG"

# --uninstall must never pass --volumes unless --delete-data is also set.
bash "$src" --uninstall >/dev/null
grep -F -- 'down --volumes' "$STUB_DOCKER_LOG" >/dev/null && fail "uninstall deleted volumes without --delete-data"
grep -E -- 'compose .* down$' "$STUB_DOCKER_LOG" >/dev/null || grep -F -- 'compose --env-file' "$STUB_DOCKER_LOG" >/dev/null || fail "uninstall did not call compose down"

: > "$STUB_DOCKER_LOG"
bash "$src" --uninstall --delete-data >/dev/null
grep -F -- 'down --volumes' "$STUB_DOCKER_LOG" >/dev/null || fail "uninstall --delete-data did not pass --volumes"

# Existing .env must be kept on --prepare-only.
home="$tmp/home"
mkdir -p "$home"
printf 'POSTGRES_PASSWORD=keep-me\n' > "$home/.env"
export LOTS_HOME="$home"
bash "$src" --prepare-only >/dev/null
grep -F -- 'POSTGRES_PASSWORD=keep-me' "$home/.env" >/dev/null || fail "prepare-only overwrote .env"

echo "OK: install.sh smoke"
