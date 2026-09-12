#!/usr/bin/env bash
# Ratatosk installer (spec §39–§40). Wraps infra/compose/install-images.sh for
# the published-image stack; --dev uses the source Compose file in this repo.
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
KUBLE_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
IMAGES_INSTALL="$KUBLE_ROOT/infra/compose/install-images.sh"
IMAGES_COMPOSE="$KUBLE_ROOT/infra/compose/docker-compose.images.yml"
DEV_COMPOSE="$KUBLE_ROOT/infra/compose/docker-compose.yml"
IMAGES_ENV_EXAMPLE="$KUBLE_ROOT/infra/compose/.env.images.example"

do_update=false
do_uninstall=false
delete_data=false
dev_mode=false
prepare_only=false

usage() {
  echo "Usage: bash install.sh [--update] [--uninstall] [--delete-data] [--dev] [--prepare-only]" >&2
}

fail() {
  echo "Ratatosk setup failed: $*" >&2
  exit 1
}

for arg in "$@"; do
  case "$arg" in
    --update) do_update=true ;;
    --uninstall) do_uninstall=true ;;
    --delete-data) delete_data=true ;;
    --dev) dev_mode=true ;;
    --prepare-only) prepare_only=true ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      usage
      exit 2
      ;;
  esac
done

if [[ "$delete_data" == true && "$do_uninstall" != true ]]; then
  fail "--delete-data can only be used with --uninstall."
fi
if [[ "$do_uninstall" == true && "$do_update" == true ]]; then
  fail "--update and --uninstall cannot be combined."
fi
if [[ "$do_uninstall" == true && "$prepare_only" == true ]]; then
  fail "--prepare-only cannot be used with --uninstall."
fi

preflight() {
  for command_name in git docker curl openssl; do
    command -v "$command_name" >/dev/null 2>&1 || fail "'$command_name' is required."
  done
  docker compose version >/dev/null 2>&1 || fail "the Docker Compose plugin is required."
}

compose_workdir() {
  if [[ "$dev_mode" == true ]]; then
    printf '%s\n' "$KUBLE_ROOT"
    return
  fi
  printf '%s\n' "${LOTS_HOME:-$KUBLE_ROOT/infra/compose}"
}

compose_file() {
  if [[ "$dev_mode" == true ]]; then
    printf '%s\n' "$DEV_COMPOSE"
    return
  fi
  local workdir
  workdir="$(compose_workdir)"
  if [[ -f "$workdir/docker-compose.images.yml" ]]; then
    printf '%s\n' "$workdir/docker-compose.images.yml"
  else
    printf '%s\n' "$IMAGES_COMPOSE"
  fi
}

env_file() {
  local workdir
  workdir="$(compose_workdir)"
  if [[ -f "$workdir/.env" ]]; then
    printf '%s\n' "$workdir/.env"
    return
  fi
  if [[ -f "$KUBLE_ROOT/.env" ]]; then
    printf '%s\n' "$KUBLE_ROOT/.env"
    return
  fi
  printf '%s\n' "$workdir/.env"
}

compose_cmd() {
  local workdir file envf
  workdir="$(compose_workdir)"
  file="$(compose_file)"
  envf="$(env_file)"
  mkdir -p "$workdir"
  docker compose --env-file "$envf" -f "$file" "$@"
}

preserve_env_or_create() {
  local envf workdir
  envf="$(env_file)"
  workdir="$(compose_workdir)"
  mkdir -p "$workdir"
  if [[ -e "$envf" ]]; then
    echo "Keeping existing .env."
    return 0
  fi
  if [[ ! -f "$IMAGES_ENV_EXAMPLE" ]]; then
    fail "missing $IMAGES_ENV_EXAMPLE and no .env to keep."
  fi
  umask 077
  local temporary_file
  temporary_file="$(mktemp "${envf}.tmp.XXXXXX")"
  while IFS= read -r line || [[ -n "$line" ]]; do
    case "$line" in
      "POSTGRES_PASSWORD=")
        printf 'POSTGRES_PASSWORD=%s\n' "$(openssl rand -hex 16)"
        ;;
      "BETTER_AUTH_SECRET=")
        printf 'BETTER_AUTH_SECRET=%s\n' "$(openssl rand -hex 32)"
        ;;
      "ENCRYPTION_KEY=")
        printf 'ENCRYPTION_KEY=%s\n' "$(openssl rand -hex 32)"
        ;;
      "SCREEN_PROXY_SECRET=")
        printf 'SCREEN_PROXY_SECRET=%s\n' "$(openssl rand -hex 32)"
        ;;
      "SANDBOX_SUPERVISOR_TOKEN=")
        printf 'SANDBOX_SUPERVISOR_TOKEN=%s\n' "$(openssl rand -hex 32)"
        ;;
      *)
        printf '%s\n' "$line"
        ;;
    esac
  done < "$IMAGES_ENV_EXAMPLE" > "$temporary_file"
  chmod 600 "$temporary_file"
  mv -- "$temporary_file" "$envf"
  echo "Created .env with random secrets."
}

wait_for_health() {
  local api_url path attempt
  api_url="${RATATOSK_API_URL:-http://127.0.0.1:${RAKAZO_API_PORT:-3100}}"
  for path in /health /health/db /health/worker /health/computer; do
    attempt=1
    while [[ "$attempt" -le 60 ]]; do
      if curl -fsS "${api_url}${path}" >/dev/null; then
        echo "Healthy ${path}"
        break
      fi
      if [[ "$attempt" -eq 60 ]]; then
        fail "health check failed for ${path} at ${api_url}"
      fi
      sleep 2
      attempt=$((attempt + 1))
    done
  done
}

uninstall_stack() {
  preflight
  if [[ "$delete_data" == true ]]; then
    echo "Stopping Ratatosk and deleting volumes."
    compose_cmd down --volumes
  else
    echo "Stopping Ratatosk. Volumes and .env are kept."
    compose_cmd down
  fi
}

install_stack() {
  preflight
  preserve_env_or_create
  if [[ "$prepare_only" == true ]]; then
    echo "Ratatosk files are ready. Edit .env, then run: bash infra/install/install.sh"
    exit 0
  fi

  if [[ "$dev_mode" == true ]]; then
    echo "Starting the development Compose stack."
    compose_cmd up -d --build --wait --wait-timeout 300
  else
    local workdir extra=()
    workdir="$(compose_workdir)"
    mkdir -p "$workdir"
    if [[ ! -f "$IMAGES_INSTALL" ]]; then
      fail "missing $IMAGES_INSTALL"
    fi
    if [[ -f "$IMAGES_COMPOSE" ]]; then
      extra+=(--local)
    fi
    if [[ "$do_update" == true ]]; then
      echo "Updating Ratatosk images and restarting."
    fi
    (
      cd "$workdir"
      if [[ -f "$IMAGES_COMPOSE" && ! -e docker-compose.images.yml ]]; then
        cp "$IMAGES_COMPOSE" docker-compose.images.yml
      fi
      if [[ -f "$IMAGES_ENV_EXAMPLE" && ! -e .env.images.example ]]; then
        cp "$IMAGES_ENV_EXAMPLE" .env.images.example
      fi
      if [[ ! -e .env ]]; then
        envf="$(env_file)"
        if [[ "$envf" != "$workdir/.env" && -e "$envf" ]]; then
          cp "$envf" .env
        fi
      fi
      bash "$IMAGES_INSTALL" "${extra[@]}"
    )
  fi

  wait_for_health
  echo "Ratatosk is starting at ${RATATOSK_WEB_URL:-http://127.0.0.1:${RAKAZO_WEB_PORT:-5173}}"
}

if [[ "$do_uninstall" == true ]]; then
  uninstall_stack
  exit 0
fi

install_stack
