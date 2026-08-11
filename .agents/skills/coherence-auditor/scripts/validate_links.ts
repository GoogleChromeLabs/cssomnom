import fs from 'node:fs';
import path from 'node:path';

const REPO_ROOT = path.resolve(import.meta.dirname, '../../../..');

export interface LinkIssue {
  file: string;
  line: number;
  rawTarget: string;
  resolvedPath: string;
  reason: string;
}

const CANONICAL_DOCS = [
  'README.md',
  'PLAN.md',
  'AGENTS.md',
  'LOOP.md',
  'MAINTENANCE.md',
  'CONTRIBUTING.md',
];

function getLineNumber(content: string, index: number): number {
  return content.substring(0, index).split('\n').length;
}

function findMarkdownFiles(dir: string): string[] {
  const results: string[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (
        entry.name === 'node_modules' ||
        entry.name === '.git' ||
        entry.name === '.worktrees' ||
        entry.name === '.gemini' ||
        entry.name === 'submodules'
      ) {
        continue;
      }
      results.push(...findMarkdownFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      results.push(fullPath);
    }
  }
  return results;
}

function findActiveSkillDocs(dir: string): string[] {
  const results: string[] = [];
  if (!fs.existsSync(dir)) return results;
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findActiveSkillDocs(fullPath));
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      results.push(fullPath);
    }
  }
  return results;
}

function isGlobPattern(pathStr: string): boolean {
  return pathStr.includes('*') || pathStr.includes('?');
}

function isTemplatePlaceholder(pathStr: string): boolean {
  return (
    pathStr.includes('/path/to/') ||
    pathStr.includes('filename.ext') ||
    pathStr.includes('example.com')
  );
}

export function validateLinks(allFiles = false): LinkIssue[] {
  const issues: LinkIssue[] = [];

  let mdFiles: string[];
  if (allFiles) {
    // Scan all markdown files in the repository
    mdFiles = findMarkdownFiles(REPO_ROOT);
  } else {
    // Scan only primary canonical docs + active skill MD docs
    const rootDocs = CANONICAL_DOCS.map((f) => path.join(REPO_ROOT, f)).filter((f) => fs.existsSync(f));
    const skillDocs = findActiveSkillDocs(path.join(REPO_ROOT, '.agents/skills'));
    mdFiles = [...rootDocs, ...skillDocs];
  }

  for (const filePath of mdFiles) {
    const relFile = path.relative(REPO_ROOT, filePath);
    const content = fs.readFileSync(filePath, 'utf-8');
    const fileDir = path.dirname(filePath);

    // 1. Explicit Markdown links: [text](target)
    const mdLinkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
    let match: RegExpExecArray | null;
    while ((match = mdLinkRegex.exec(content)) !== null) {
      let rawTarget = match[2].trim();
      const line = getLineNumber(content, match.index);

      // Ignore web URLs, mailto, globs, template placeholders
      if (
        rawTarget.startsWith('http://') ||
        rawTarget.startsWith('https://') ||
        rawTarget.startsWith('mailto:') ||
        isGlobPattern(rawTarget) ||
        isTemplatePlaceholder(rawTarget)
      ) {
        continue;
      }

      // Handle file:// URI scheme
      if (rawTarget.startsWith('file://')) {
        rawTarget = rawTarget.replace(/^file:\/\//, '');
      }

      // Strip anchor / line references
      const pathOnly = rawTarget.split('#')[0].split('?')[0];
      if (!pathOnly) continue; // Same-page anchor

      let resolvedPath: string;
      if (path.isAbsolute(pathOnly)) {
        resolvedPath = pathOnly;
      } else {
        resolvedPath = path.resolve(fileDir, pathOnly);
      }

      if (!fs.existsSync(resolvedPath)) {
        issues.push({
          file: relFile,
          line,
          rawTarget,
          resolvedPath: path.relative(REPO_ROOT, resolvedPath),
          reason: 'File does not exist',
        });
      }
    }

    // 2. Inline backtick paths starting with submodules/, src/, scripts/, tests/, docs/
    const backtickRegex = /`((?:submodules|src|scripts|tests|docs)\/[^`]+)`/g;
    while ((match = backtickRegex.exec(content)) !== null) {
      const rawTarget = match[1].trim();
      const line = getLineNumber(content, match.index);

      // Ignore if contains multiline / newlines or globs / placeholders
      if (
        rawTarget.includes('\n') ||
        isGlobPattern(rawTarget) ||
        isTemplatePlaceholder(rawTarget)
      ) {
        continue;
      }

      // Clean line numbers or trailing punctuation (e.g. file.ts:123 or file.ts#L123)
      let cleanTarget = rawTarget.split('#')[0].split(':')[0].trim();
      cleanTarget = cleanTarget.replace(/[.,;)]+$/, '');

      // Special alias mapping: tests/web-platform-tests -> submodules/web-platform-tests
      let resolvedPath = path.resolve(REPO_ROOT, cleanTarget);
      if (
        !fs.existsSync(resolvedPath) &&
        cleanTarget.startsWith('tests/web-platform-tests')
      ) {
        const mappedPath = path.resolve(
          REPO_ROOT,
          cleanTarget.replace('tests/web-platform-tests', 'submodules/web-platform-tests')
        );
        if (fs.existsSync(mappedPath)) {
          resolvedPath = mappedPath;
        }
      }

      if (!fs.existsSync(resolvedPath)) {
        issues.push({
          file: relFile,
          line,
          rawTarget,
          resolvedPath: path.relative(REPO_ROOT, resolvedPath),
          reason: 'Referenced spec or code path does not exist',
        });
      }
    }
  }

  return issues;
}

if (process.argv[1] === import.meta.filename) {
  const allFiles = process.argv.includes('--all');
  const issues = validateLinks(allFiles);

  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(issues, null, 2));
    process.exit(issues.length > 0 ? 1 : 0);
  }

  if (issues.length === 0) {
    console.log('✅ All internal markdown links and spec path references are valid!');
    process.exit(0);
  } else {
    console.error(`❌ Found ${issues.length} broken link/path reference(s):\n`);
    for (const issue of issues) {
      console.error(
        `  • [${issue.file}:${issue.line}] Target: "${issue.rawTarget}"`
      );
      console.error(`    Resolved: ${issue.resolvedPath} (${issue.reason})\n`);
    }
    process.exit(1);
  }
}
