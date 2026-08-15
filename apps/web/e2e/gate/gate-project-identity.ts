export function isKsGateProject(projectName: string): boolean {
  return projectName === 'gate-ks-sq';
}

export function isMkGateProject(projectName: string): boolean {
  return projectName === 'gate-mk-mk' || projectName === 'gate-mk-contract';
}
