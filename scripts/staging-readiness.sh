#!/usr/bin/env bash
set -euo pipefail

errors=()

required=(
  DATABASE_URL
  API_BASE_URL
  JWT_ACCESS_SECRET
  JWT_REFRESH_SECRET
  CORS_ALLOWED_ORIGINS
  APP_VERSION
  GIT_SHA
)

is_placeholder() {
  local value="${1:-}"
  [[ -z "$value" || "$value" =~ replace-with|change-me|placeholder|example|dev-only ]]
}

for name in "${required[@]}"; do
  if [[ -z "${!name:-}" ]]; then
    errors+=("$name is required")
  fi
done

if [[ -z "${REDIS_URL:-}" && -z "${REDIS_HOST:-}" ]]; then
  errors+=("REDIS_URL or REDIS_HOST is required")
fi

if is_placeholder "${JWT_ACCESS_SECRET:-}"; then
  errors+=("JWT_ACCESS_SECRET must not be a placeholder")
fi

if is_placeholder "${JWT_REFRESH_SECRET:-}"; then
  errors+=("JWT_REFRESH_SECRET must not be a placeholder")
fi

if [[ "${CORS_ALLOWED_ORIGINS:-}" == "*" ]]; then
  errors+=("CORS_ALLOWED_ORIGINS must not be wildcard")
fi

backup_dir="${BACKUP_DIR:-backups}"
mkdir -p "$backup_dir" 2>/dev/null || errors+=("BACKUP_DIR is not writable: $backup_dir")

if (( ${#errors[@]} > 0 )); then
  printf '%s\n' "${errors[@]}"
  exit 1
fi

cat <<EOF
{
  "event": "staging.readiness.passed",
  "backupDir": "$backup_dir",
  "apiBaseUrl": "${API_BASE_URL}"
}
EOF
