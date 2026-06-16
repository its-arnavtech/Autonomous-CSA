$ErrorActionPreference = "Stop"

$required = @(
  "DATABASE_URL",
  "API_BASE_URL",
  "JWT_ACCESS_SECRET",
  "JWT_REFRESH_SECRET",
  "CORS_ALLOWED_ORIGINS",
  "APP_VERSION",
  "GIT_SHA"
)

$errors = [System.Collections.Generic.List[string]]::new()

function Test-PlaceholderSecret([string]$value) {
  if ([string]::IsNullOrWhiteSpace($value)) {
    return $true
  }

  return $value -match 'replace-with|change-me|placeholder|example|dev-only'
}

foreach ($name in $required) {
  $value = [System.Environment]::GetEnvironmentVariable($name)
  if ([string]::IsNullOrWhiteSpace($value)) {
    $errors.Add("$name is required")
  }
}

if ([string]::IsNullOrWhiteSpace($env:REDIS_URL) -and [string]::IsNullOrWhiteSpace($env:REDIS_HOST)) {
  $errors.Add("REDIS_URL or REDIS_HOST is required")
}

if (Test-PlaceholderSecret $env:JWT_ACCESS_SECRET) {
  $errors.Add("JWT_ACCESS_SECRET must not be a placeholder")
}

if (Test-PlaceholderSecret $env:JWT_REFRESH_SECRET) {
  $errors.Add("JWT_REFRESH_SECRET must not be a placeholder")
}

if ($env:CORS_ALLOWED_ORIGINS -eq "*") {
  $errors.Add("CORS_ALLOWED_ORIGINS must not be wildcard")
}

$backupDir = if ([string]::IsNullOrWhiteSpace($env:BACKUP_DIR)) { "backups" } else { $env:BACKUP_DIR }
try {
  New-Item -ItemType Directory -Force -Path $backupDir | Out-Null
} catch {
  $errors.Add("BACKUP_DIR is not writable: $backupDir")
}

if ($errors.Count -gt 0) {
  $errors | ForEach-Object { Write-Host $_ }
  exit 1
}

$summary = @{
  event = "staging.readiness.passed"
  backupDir = $backupDir
  apiBaseUrl = $env:API_BASE_URL
}

$summary | ConvertTo-Json -Depth 3
