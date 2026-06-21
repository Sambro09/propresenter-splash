import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export async function runCommand(
  command: string,
  args: string[],
  options: { timeout?: number; maxBuffer?: number } = {}
): Promise<{ stdout: string; stderr: string }> {
  const result = await execFileAsync(command, args, {
    timeout: options.timeout ?? 15_000,
    maxBuffer: options.maxBuffer ?? 10 * 1024 * 1024
  });

  return {
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString()
  };
}
