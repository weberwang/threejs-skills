import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';

const TEMPLATE = readFileSync(new URL('../assets/minimal-project.gitignore', import.meta.url), 'utf8');

/** 创建独立 Git 夹具，避免用户全局忽略规则或换行设置干扰提交集断言。 */
function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'threejs-minimal-git-'));
  t.after(() => {
    // 只回收本用例生成的绝对临时路径，不操作共享仓库或用户目录。
    assert.equal(dirname(root), resolve(tmpdir()));
    rmSync(root, { recursive: true, force: true });
  });
  execFileSync('git', ['init', '-q'], { cwd: root });
  execFileSync('git', ['config', 'core.autocrlf', 'false'], { cwd: root });
  const excludes = join(root, '.git', 'test-excludes');
  writeFileSync(excludes, '');
  execFileSync('git', ['config', 'core.excludesFile', excludes], { cwd: root });
  writeFileSync(join(root, '.gitignore'), TEMPLATE);
  return root;
}

/** 写入夹具文件，同时保留真实目录层级。 */
function write(root, path, contents = 'fixture\n') {
  const target = join(root, path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, contents);
}

/** 读取 Git 对未跟踪文件的最终忽略判定，拒绝将命令错误当作未忽略。 */
function ignored(root, path) {
  const result = spawnSync('git', ['check-ignore', '--no-index', '-q', '--', path], { cwd: root });
  assert.ifError(result.error);
  assert([0, 1].includes(result.status), String(result.stderr));
  return result.status === 0;
}

/** 用精确路径例外模拟当前工作项的引用选择，不放行整批产物。 */
function allow(root, paths) {
  const entries = paths.map((path) => `!/${path.replace(/[\\*?\[\]]/g, '\\$&')}`).join('\n');
  writeFileSync(join(root, '.gitignore'), TEMPLATE.replace('# 工作流必要文件结束', `${entries}\n# 工作流必要文件结束`));
}

test('默认排除产物文件并保留运行、构建和验证入口', (t) => {
  const root = fixture(t);
  for (const path of ['src/game/main.ts', 'public/assets/scenes/battle/hero.png', 'package.json', 'package-lock.json', 'tests/game.test.ts', '.gitignore']) {
    // .gitignore 已由夹具写入真实模板，不能用测试占位内容覆盖它。
    if (path !== '.gitignore') write(root, path);
    assert.equal(ignored(root, path), false, path);
  }
  for (const path of ['node_modules/pkg/index.js', 'dist/index.html', 'output/intermediate/WI-1/V3/try-1/frame.png', 'output/candidates/WI-1/V3/candidate-1/hero.png', 'docs/TDD.md', 'docs/confirmed/scenes/battle/layout-target/v1/layout.png', 'evidence/WI-1/reviews/V2/candidate-1/review.html', 'evidence/WI-1/validation/V4/run-1/screenshot.png', 'assets-source/scenes/battle/hero/r1/source.png', '.workflow-control/work-items/WI-1.json', '.threejs-workflow/user-resolutions/ledger.json']) {
    write(root, path);
    assert.equal(ignored(root, path), true, path);
  }
});

test('嵌套必要文件可精确放行，同任务邻居和其他任务继续忽略', (t) => {
  const root = fixture(t);
  const selected = [
    'docs/TDD.md',
    'docs/confirmed/scenes/battle/layout-target/v1/layout.png',
    'evidence/WI-1/reviews/V2/candidate-1/review.html',
    'evidence/WI-1/reviews/V2/candidate-1/layout.png',
    'evidence/WI-1/validation/V4/run-1/screenshot.png',
    'evidence/WI-1/validation/V4/run-1/test.log',
    '.workflow-control/work-items/WI-1.json',
    '.workflow-control/evidence/WI-1/attachments/V4/run-1/test.log',
    '.threejs-workflow/user-resolutions/WI-1/receipt.json',
    'assets-source/scenes/battle/hero/r1/hero [1].png',
  ];
  allow(root, selected);
  for (const path of selected) {
    write(root, path);
    assert.equal(ignored(root, path), false, path);
  }
  for (const path of ['docs/unused.md', 'docs/confirmed/scenes/battle/layout-target/v0/old.png', 'evidence/WI-1/reviews/V2/candidate-1/unused.png', 'evidence/WI-2/validation/V4/run-1/screenshot.png', '.workflow-control/work-items/WI-2.json', '.workflow-control/evidence/WI-1/attachments/V4/run-1/debug.log', '.threejs-workflow/user-resolutions/WI-1/unrelated.json', 'assets-source/scenes/battle/hero/r1/hero 1.png', 'output/intermediate/WI-1/V3/try-1/unused.png']) {
    write(root, path);
    assert.equal(ignored(root, path), true, path);
  }
});

test('按必要引用暂存的快照包含机器附件与根级审阅媒体，未选择产物仍留在本地', (t) => {
  const root = fixture(t);
  const workPath = '.workflow-control/work-items/WI-1.json';
  const manifestPath = '.workflow-control/evidence/WI-1/manifest.json';
  const attachmentPath = '.workflow-control/evidence/WI-1/attachments/V4/run-1/test.log';
  const layoutPath = 'docs/confirmed/scenes/battle/layout-target/v1/layout.png';
  const reviewPath = 'evidence/WI-1/reviews/V2/candidate-1/review.html';
  const reviewMediaPath = 'evidence/WI-1/reviews/V2/candidate-1/layout.png';
  const screenshotPath = 'evidence/WI-1/validation/V4/run-1/screenshot.png';
  const humanLogPath = 'evidence/WI-1/validation/V4/run-1/test.log';
  const runtimePath = 'public/assets/scenes/battle/hero.png';
  const oldPath = 'docs/confirmed/scenes/battle/layout-target/v0/layout.png';
  const required = [workPath, manifestPath, attachmentPath, layoutPath, reviewPath, reviewMediaPath, screenshotPath, humanLogPath];
  allow(root, required);
  write(root, workPath, JSON.stringify({ evidenceManifest: manifestPath, layout: layoutPath, review: reviewPath, reviewMedia: reviewMediaPath, screenshot: screenshotPath, validationLog: humanLogPath }));
  write(root, manifestPath, JSON.stringify({ files: [attachmentPath] }));
  for (const path of [attachmentPath, layoutPath, reviewPath, reviewMediaPath, screenshotPath, humanLogPath, runtimePath, oldPath]) write(root, path);
  // literal pathspec 确保实际文件名不会作为通配符扩大暂存集合。
  execFileSync('git', ['add', '--', ...['.gitignore', runtimePath, ...required].map((path) => `:(literal)${path}`)], { cwd: root });
  const snapshot = join(root, 'snapshot');
  mkdirSync(snapshot);
  execFileSync('git', ['checkout-index', '--all', `--prefix=${snapshot.replaceAll('\\', '/')}/`], { cwd: root });
  const work = JSON.parse(readFileSync(join(snapshot, workPath), 'utf8'));
  const manifest = JSON.parse(readFileSync(join(snapshot, work.evidenceManifest), 'utf8'));
  for (const path of [runtimePath, work.layout, work.review, work.reviewMedia, work.screenshot, work.validationLog, ...manifest.files]) assert(existsSync(join(snapshot, path)), path);
  assert(existsSync(join(root, oldPath)), '未入库产物仍留在本地');
  assert.equal(existsSync(join(snapshot, oldPath)), false, '未引用版本不进入提交快照');
});
