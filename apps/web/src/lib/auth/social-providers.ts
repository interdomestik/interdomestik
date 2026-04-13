type EnvLike = {
  GITHUB_CLIENT_ID?: string;
  GITHUB_CLIENT_SECRET?: string;
};

function resolveGitHubOAuthEnv(env?: EnvLike): EnvLike {
  return {
    GITHUB_CLIENT_ID: env?.GITHUB_CLIENT_ID ?? process.env.GITHUB_CLIENT_ID,
    GITHUB_CLIENT_SECRET: env?.GITHUB_CLIENT_SECRET ?? process.env.GITHUB_CLIENT_SECRET,
  };
}

export function hasGitHubOAuthCredentials(env?: EnvLike): boolean {
  const resolvedEnv = resolveGitHubOAuthEnv(env);

  return Boolean(resolvedEnv.GITHUB_CLIENT_ID?.trim() && resolvedEnv.GITHUB_CLIENT_SECRET?.trim());
}

export function getGitHubSocialProvider(env?: EnvLike) {
  const resolvedEnv = resolveGitHubOAuthEnv(env);

  if (!hasGitHubOAuthCredentials(resolvedEnv)) {
    return null;
  }

  return {
    clientId: resolvedEnv.GITHUB_CLIENT_ID!.trim(),
    clientSecret: resolvedEnv.GITHUB_CLIENT_SECRET!.trim(),
  };
}
