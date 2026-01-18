import * as path from 'path';
import { spawn } from 'node:child_process';
import * as readline from 'node:readline';

function toPosix(p: string): string {
  return p.split(path.sep).join('/');
}

export type GitHeatResult = {
  metric: 'touches' | 'lines';
  windowDays: number;
  head: string;
  scoresByAbsPath: Record<string, number>;
  maxScore: number;
};

export class GitHeatService {
  constructor(private workspaceRoot: string) {}

  async getRepoRoot(): Promise<string | null> {
    const out = await this.runGit(['rev-parse', '--show-toplevel']);
    return out.ok ? out.stdout.trim() : null;
  }

  async getHead(repoRoot: string): Promise<string | null> {
    const out = await this.runGit(['rev-parse', 'HEAD'], repoRoot);
    return out.ok ? out.stdout.trim() : null;
  }

  async computeTouches(repoRoot: string, windowDays: number): Promise<Record<string, number>> {
    const args = [
      '-c', 'core.quotepath=false',
      'log',
      '--name-only',
      `--since=${windowDays}.days`,
      '--pretty=format:COMMIT:%H'
    ];

    const child = spawn('git', args, { cwd: repoRoot });

    const rl = readline.createInterface({ input: child.stdout });
    const scoresRel: Map<string, number> = new Map();

    rl.on('line', (line) => {
      const s = line.trim();
      if (!s) return;
      if (s.startsWith('COMMIT:')) return;         // commit separator
      if (s === '.gitattributes') return;          // optional tiny ignore examples

      // s is a repo-relative path (posix)
      scoresRel.set(s, (scoresRel.get(s) ?? 0) + 1);
    });

    const exitCode: number = await new Promise((resolve) => {
      child.on('close', resolve);
    });

    rl.close();

    if (exitCode !== 0) {
      throw new Error(`git log failed with exit code ${exitCode}`);
    }

    // Convert rel -> abs (so it matches node.id)
    const scoresAbs: Record<string, number> = {};
    for (const [relPosix, v] of scoresRel.entries()) {
      const abs = path.join(repoRoot, ...relPosix.split('/'));
      scoresAbs[abs] = v;
    }
    return scoresAbs;
  }

  // Small helper that captures stdout for tiny git commands
  private runGit(args: string[], cwd?: string): Promise<{ ok: boolean; stdout: string; stderr: string }> {
    return new Promise((resolve) => {
      const child = spawn('git', args, { cwd: cwd ?? this.workspaceRoot });
      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (d) => (stdout += d.toString()));
      child.stderr.on('data', (d) => (stderr += d.toString()));

      child.on('close', (code) => resolve({ ok: code === 0, stdout, stderr }));
    });
  }
}

