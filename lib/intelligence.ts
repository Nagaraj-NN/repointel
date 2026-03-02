interface RepoFileLike {
  path: string;
}

const MANIFEST_FILES = [
  'package.json',
  'requirements.txt',
  'pom.xml',
  'go.mod',
  'Cargo.toml',
  'Dockerfile',
  'docker-compose.yml',
  '.csproj',
  'build.gradle',
  'pyproject.toml'
];

const ENTRY_POINTS = [
  'main.py',
  'index.js',
  'index.ts',
  'app.ts',
  'app.js',
  'server.go',
  'main.go',
  'Program.cs',
  'src/main.java',
  'src/index.ts'
];

export function detectTechStack(files: RepoFileLike[]): string[] {
  const stack: string[] = [];
  const paths = files.map((f) => f.path.toLowerCase());

  if (paths.some((p) => p.includes('package.json'))) stack.push('Node.js');
  if (paths.some((p) => p.includes('requirements.txt') || p.includes('pyproject.toml')))
    stack.push('Python');
  if (paths.some((p) => p.includes('pom.xml') || p.includes('build.gradle'))) stack.push('Java');
  if (paths.some((p) => p.includes('go.mod'))) stack.push('Go');
  if (paths.some((p) => p.includes('Cargo.toml'))) stack.push('Rust');
  if (paths.some((p) => p.includes('.csproj'))) stack.push('C#');
  if (paths.some((p) => p.includes('Dockerfile'))) stack.push('Docker');
  if (paths.some((p) => p.includes('docker-compose'))) stack.push('Docker Compose');

  return [...new Set(stack)];
}

export function detectEntryPoints(files: RepoFileLike[]): string[] {
  return files
    .filter((f) => ENTRY_POINTS.some((ep) => f.path.endsWith(ep) || f.path.includes(ep)))
    .map((f) => f.path)
    .slice(0, 5);
}

export function detectArchitectureStyle(files: RepoFileLike[]): string {
  const paths = files.map((f) => f.path);
  if (paths.some((p) => p.includes('/lambda/') || p.includes('serverless'))) return 'Serverless';
  if (paths.some((p) => p.includes('/api/') && p.includes('/controllers/'))) return 'MVC';
  if (paths.some((p) => p.includes('/services/') && p.includes('/repositories/')))
    return 'Layered';
  if (paths.some((p) => p.includes('Dockerfile') && p.includes('docker-compose')))
    return 'Containerized';
  return 'Monolith';
}

export function calculateHealthScore(
  hasReadme: boolean,
  hasCodeowners: boolean,
  hasArchDoc: boolean,
  lastActiveDays: number | null
): number {
  let score = 0;
  if (hasReadme) score += 25;
  if (hasCodeowners) score += 25;
  if (hasArchDoc) score += 25;
  if (lastActiveDays !== null) {
    if (lastActiveDays <= 30) score += 25;
    else if (lastActiveDays <= 90) score += 15;
    else if (lastActiveDays <= 180) score += 5;
  } else score += 10;
  return Math.min(100, score);
}

export interface SecurityCounts {
  critical: number;
  high: number;
  medium: number;
  low: number;
  secrets: number;
}

export function calculateSecurityScore(counts: SecurityCounts): number {
  let score = 100;
  // Deductions capped per category to prevent a single category from zeroing the score
  score -= Math.min(counts.critical * 25, 50);
  score -= Math.min(counts.high * 10, 30);
  score -= Math.min(counts.medium * 5, 10);
  score -= Math.min(counts.secrets * 15, 30);
  return Math.max(0, score);
}
