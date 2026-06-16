type RuntimeEnv = Record<string, string | undefined>;

export type DeploymentMetadata = {
  service: string;
  appVersion: string;
  gitSha: string;
  environment: string;
  buildTimestamp: string;
};

function normalizeMetadataValue(value: string | undefined, fallback: string) {
  const trimmed = value?.trim();
  return trimmed && trimmed.length <= 120 ? trimmed : fallback;
}

export function loadDeploymentMetadata(
  service: string,
  env: RuntimeEnv = process.env,
): DeploymentMetadata {
  return {
    service,
    appVersion: normalizeMetadataValue(env.APP_VERSION, 'dev'),
    gitSha: normalizeMetadataValue(env.GIT_SHA, 'local'),
    environment: normalizeMetadataValue(env.APP_ENV ?? env.NODE_ENV, 'development'),
    buildTimestamp: normalizeMetadataValue(env.BUILD_TIMESTAMP, 'unknown'),
  };
}
