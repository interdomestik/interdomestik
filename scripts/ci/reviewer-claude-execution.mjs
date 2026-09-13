import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const CLAUDE_SHA256 = '19ed536dd0e94dade3f8c49c3c6ddeff22b06f5d5c86b30f1c88eeb9a04f45e5';
const digest = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');

export function checkClaudeBilling(home) {
  let account;
  try {
    account = JSON.parse(fs.readFileSync(path.join(home, '.claude.json'), 'utf8')).oauthAccount;
  } catch {
    throw new Error('claude_billing_state_unknown');
  }
  if (account?.hasExtraUsageEnabled !== false || account?.billingType !== 'stripe_subscription')
    throw new Error('claude_subscription_only_required');
  return { hasExtraUsageEnabled: false, evidenceBasis: 'local-account-state' };
}

export function claudeRestrictedArgs(prompt, model) {
  return [
    '-p',
    prompt,
    '--model',
    model,
    '--effort',
    'medium',
    '--tools',
    '',
    '--disable-slash-commands',
    '--output-format',
    'stream-json',
    '--verbose',
    '--no-session-persistence',
    '--setting-sources',
    '',
    '--settings',
    '{"disableAllHooks":true}',
    '--strict-mcp-config',
    '--mcp-config',
    '{"mcpServers":{}}',
    '--no-chrome',
  ];
}

export async function runRestrictedClaude(options, capture) {
  let evidenceDirectory;
  let result;
  try {
    if (
      options.provider !== 'anthropic' ||
      !['claude-sonnet-5', 'claude-opus-5', 'claude-opus-4-8'].includes(options.model)
    )
      throw new Error('claude_unsupported_model');
    if (options.args?.length || options.env || options.fallbackWinner)
      throw new Error('claude_caller_controls_forbidden');
    if (
      typeof options.prompt !== 'string' ||
      !options.prompt.length ||
      Buffer.byteLength(options.prompt) > 768_000
    )
      throw new Error('claude_invalid_prompt');
    if (process.platform !== 'darwin' || !path.isAbsolute(options.command))
      throw new Error('claude_executable_untrusted');
    const env = {
      HOME: os.homedir(),
      USER: os.userInfo().username,
      LOGNAME: os.userInfo().username,
      PATH: '/usr/bin:/bin:/usr/sbin:/sbin',
      TMPDIR: os.tmpdir(),
      LANG: 'en_US.UTF-8',
    };
    const verify = executable =>
      execFileSync(
        '/usr/bin/codesign',
        [
          '--verify',
          '--strict',
          '-R',
          '=anchor apple generic and certificate leaf[subject.OU] = "Q6L2SF6YDW" and identifier "com.anthropic.claude-code"',
          executable,
        ],
        { env, timeout: 30_000, maxBuffer: 20_000, stdio: ['ignore', 'pipe', 'pipe'] }
      );
    if (digest(options.command) !== CLAUDE_SHA256) throw new Error('claude_executable_untrusted');
    verify(options.command);
    evidenceDirectory = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'claude-reviewer-')));
    const executable = path.join(evidenceDirectory, 'claude');
    fs.copyFileSync(options.command, executable, fs.constants.COPYFILE_EXCL);
    fs.chmodSync(executable, 0o500);
    verify(executable);
    const sha256 = digest(executable);
    if (sha256 !== CLAUDE_SHA256) throw new Error('claude_executable_untrusted');
    const cwd = path.join(evidenceDirectory, 'workspace');
    fs.mkdirSync(cwd, { mode: 0o700 });
    const args = claudeRestrictedArgs(options.prompt, options.model);
    const billingControl = checkClaudeBilling(env.HOME);
    result = await capture({
      ...options,
      nativeProtocol: undefined,
      outputProtocol: 'claude-stream-v1',
      maxCaptureBytes: 2_000_000,
      command: executable,
      args,
      env,
      cwd,
      commandInvoked: [executable, ...claudeRestrictedArgs('<prompt>', options.model)],
    });
    checkClaudeBilling(env.HOME);
    result.restrictedExecution = {
      protocol: 'claude-stream-v1',
      evidenceDirectory,
      cwd,
      billingControl,
      executable: { path: executable, sha256, publisherTeam: 'Q6L2SF6YDW' },
      limitation: 'Signed CLI primary-response metadata; host and same-UID processes are trusted.',
    };
    fs.writeFileSync(
      path.join(evidenceDirectory, 'receipt.json'),
      JSON.stringify(result, null, 2),
      { flag: 'wx', mode: 0o600 }
    );
    return result;
  } catch (error) {
    return {
      ...result,
      status: 'blocked',
      exitCode: result?.exitCode ?? 125,
      providerReportedModel: result?.providerReportedModel ?? null,
      reviewVerdict: null,
      evidenceDirectory,
      blockerReason: 'claude_restricted_execution_failed',
      error: error.message,
    };
  }
}
