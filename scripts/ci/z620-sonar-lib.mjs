export function sonarConfiguration(env = process.env) {
  const required = ['SONAR_TOKEN', 'SONAR_HOST_URL', 'SONAR_PROJECT_KEY'];
  const missing = required.filter(name => !String(env[name] || '').trim());
  return {
    status: missing.length === 0 ? 'configured' : 'not_configured',
    missing,
    host: env.SONAR_HOST_URL || '',
    project: env.SONAR_PROJECT_KEY || '',
  };
}

export function qualityGateDecision(payload, enforcement = 'enforce') {
  const status = payload?.projectStatus?.status || 'UNKNOWN';
  if (status === 'OK') return { status: 'pass', qualityGate: status, exitCode: 0 };
  if (enforcement === 'warn') return { status: 'warn', qualityGate: status, exitCode: 0 };
  return { status: 'fail', qualityGate: status, exitCode: 4 };
}
