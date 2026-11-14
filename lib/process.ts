import { spawn } from 'node:child_process';

export type ExecResult = { code: number; stdout: string; stderr: string };

/** Runs a binary with an argument array (no shell), capturing bounded output. */
export function execCommand(
  command: string,
  args: string[],
  options: { timeoutMs?: number; cwd?: string; maxBuffer?: number } = {},
): Promise<ExecResult> {
  const { timeoutMs = 600_000, cwd, maxBuffer = 40_000 } = options;
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try {
        child.kill('SIGKILL');
      } catch {
        /* ignore */
      }
      reject(new Error(`${command} timed out after ${Math.round(timeoutMs / 1000)}s`));
    }, timeoutMs);

    child.stdout?.on('data', (chunk: Buffer) => {
      stdout = (stdout + chunk.toString()).slice(-maxBuffer);
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr = (stderr + chunk.toString()).slice(-maxBuffer);
    });
    child.on('error', (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ code: code ?? 0, stdout, stderr });
    });
  });
}

export async function ffmpeg(args: string[], timeoutMs = 900_000): Promise<ExecResult> {
  const result = await execCommand('ffmpeg', ['-hide_banner', '-y', ...args], { timeoutMs });
  if (result.code !== 0) {
    const tail = result.stderr.split('\n').filter(Boolean).slice(-6).join(' | ');
    throw new Error(`ffmpeg failed (${result.code}): ${tail || 'unknown error'}`);
  }
  return result;
}

export async function ffprobeDuration(file: string): Promise<number> {
  const result = await execCommand(
    'ffprobe',
    ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', file],
    { timeoutMs: 60_000 },
  );
  const value = parseFloat(result.stdout.trim());
  return Number.isFinite(value) ? value : 0;
}

export async function ffprobeDimensions(file: string): Promise<{ width: number; height: number }> {
  const result = await execCommand(
    'ffprobe',
    ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0:s=x', file],
    { timeoutMs: 60_000 },
  );
  const [width, height] = result.stdout.trim().split('x').map((n) => parseInt(n, 10));
  return { width: width || 0, height: height || 0 };
}

export async function hasBinary(name: string): Promise<boolean> {
  try {
    const result = await execCommand('which', [name], { timeoutMs: 5_000 });
    return result.code === 0 && !!result.stdout.trim();
  } catch {
    return false;
  }
}
