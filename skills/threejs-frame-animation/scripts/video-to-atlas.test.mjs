import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { runInNewContext } from "node:vm";
import sharp from "sharp";
import { checkFrameAnimationWorkflowFiles, FRAME_ANIMATION_WORKFLOW_SCHEMA, sha256Bytes as contractSha256Bytes } from "../../threejs-game-asset-integration/scripts/frame-animation-workflow-contract.mjs";
import { parseVideoAtlasArgs, videoToAtlas, VideoAtlasError, VIDEO_ATLAS_SCHEMA } from "./video-to-atlas.mjs";

/** 建立指定颜色的 RGBA PNG，测试不依赖系统安装 ffmpeg。 */
async function solidPng(width, height, color, patches = []) {
  const pixels = Buffer.alloc(width * height * 4);
  for (let pixel = 0; pixel < width * height; pixel += 1) {
    pixels.set([...color, 255], pixel * 4);
  }
  for (const patch of patches) {
    pixels.set([...patch.color, 255], (patch.y * width + patch.x) * 4);
  }
  return await sharp(pixels, { raw: { width, height, channels: 4 } }).png().toBuffer();
}

/** 生成可注入的 ffprobe/ffmpeg runner，并把假视频帧写入脚本请求的临时目录。 */
function fakeRunner(frameBytes, observed = {}) {
  return async (command, args) => {
    observed.calls ??= [];
    observed.calls.push({ command, args });
    if (command === "ffprobe-test") {
      return {
        exitCode: 0,
        stdout: JSON.stringify(observed.probePayload ?? {
          streams: [{ width: 4, height: 2, avg_frame_rate: "24/1", r_frame_rate: "24/1", duration: "1.5" }],
          format: { duration: "1.5" },
        }),
      };
    }
    if (command === "ffmpeg-test") {
      const filterIndex = args.indexOf("-vf");
      observed.filter = args[filterIndex + 1];
      observed.input = args[args.indexOf("-i") + 1];
      const pattern = args.at(-1);
      for (let index = 0; index < frameBytes.length; index += 1) {
        const target = pattern.replace("%08d", String(index).padStart(8, "0"));
        await writeFile(target, frameBytes[index]);
      }
      return { exitCode: 0, stdout: "" };
    }
    throw new Error("unexpected command: " + command);
  };
}

/** 为每项测试创建隔离临时目录，并在测试结束后清理。 */
async function testDirectory(t) {
  const directory = await mkdtemp(join(tmpdir(), "video-to-atlas-test-"));
  t.after(async () => await rm(directory, { recursive: true, force: true }));
  return directory;
}

/** 在最小 DOM 与手动 requestAnimationFrame 队列中运行预览脚本，以模拟延迟图片加载。 */
function createPreviewHarness(html) {
  const script = html.match(/<script>([\s\S]*?)<\/script>/u)?.[1];
  assert.ok(script, "预览页面应包含可执行脚本");
  const rafQueue = [];
  const drawCalls = [];
  const atlas = { complete: false, naturalWidth: 0, listeners: new Map() };
  atlas.addEventListener = (name, callback) => atlas.listeners.set(name, callback);
  const playerContext = {
    clearRect() {},
    drawImage(source, sourceX) { if (source === atlas) drawCalls.push(sourceX); },
  };
  const player = { width: 0, height: 0, getContext: () => playerContext };
  const speed = { value: "1", listeners: new Map(), addEventListener(name, callback) { this.listeners.set(name, callback); } };
  const position = { textContent: "" };
  const toggle = { textContent: "", listeners: new Map(), addEventListener(name, callback) { this.listeners.set(name, callback); } };
  const thumbnails = { children: [], append(button) { this.children.push(button); } };
  const elements = { atlas, player, speed, position, toggle, thumbnails };
  const document = {
    getElementById(id) { return elements[id]; },
    createElement(tag) {
      if (tag === "canvas") return { width: 0, height: 0, getContext: () => ({ drawImage() {} }) };
      return {
        dataset: {},
        listeners: new Map(),
        setAttribute() {},
        addEventListener(name, callback) { this.listeners.set(name, callback); },
        append() {},
      };
    },
  };
  runInNewContext(script, { document, requestAnimationFrame: (callback) => rafQueue.push(callback) });
  return {
    atlas,
    drawCalls,
    step(time) {
      const callback = rafQueue.shift();
      assert.ok(callback, "预览应继续安排 requestAnimationFrame");
      callback(time);
    },
    toggle,
  };
}

/** 证明 fps 参数传入 ffmpeg，单边尺寸等比缩放且图集像素顺序正确。 */
test("视频抽帧生成单行 ThreeJS 图集、尺寸与网页预览", async (t) => {
  const directory = await testDirectory(t);
  const inputVideo = join(directory, "walk.mp4");
  const outputSheet = join(directory, "walk.png");
  const outputReport = join(directory, "walk.json");
  const outputPreview = join(directory, "walk.html");
  await writeFile(inputVideo, "fake video bytes");
  const frameBytes = await Promise.all([
    solidPng(4, 2, [255, 0, 0]),
    solidPng(4, 2, [0, 0, 255]),
    solidPng(4, 2, [255, 255, 0]),
  ]);
  const observed = {};
  const report = await videoToAtlas({
    inputVideo,
    outputSheet,
    outputReport,
    outputPreview,
    fps: 6,
    width: 2,
    runtimeUrl: "assets/walk.png",
    ffmpegPath: "ffmpeg-test",
    ffprobePath: "ffprobe-test",
    commandRunner: fakeRunner(frameBytes, observed),
  });

  assert.equal(observed.filter, "fps=6");
  assert.equal(observed.input, inputVideo);
  assert.equal(report.schema, VIDEO_ATLAS_SCHEMA);
  assert.equal(report.status, "PASS");
  assert.equal(report.input.fps, 6);
  assert.equal(report.input.remove_background, false);
  assert.equal(report.settings.width, 2);
  assert.equal(report.settings.height, 1);
  assert.equal(report.cell.width, 2);
  assert.equal(report.cell.height, 1);
  assert.equal(report.frames.length, 3);
  assert.equal(report.animation.frame_rate, report.input.fps);
  assert.match(report.artifacts.sheet.sha256, /^sha256:[a-f0-9]{64}$/u);
  assert.equal(report.threejs.texture_loader.class, "THREE.TextureLoader");
  assert.equal(report.threejs.texture_loader.method, "loadAsync");
  assert.equal(report.threejs.texture_loader.url, "assets/walk.png");
  assert.deepEqual(report.threejs.atlas_uv.frame_index, { start: 0, end: 2 });
  assert.deepEqual(report.threejs.atlas_uv.repeat, { x: 1 / 3, y: 1 });
  assert.deepEqual(report.threejs.atlas_uv.offset, { x_start: 0, x_step: 1 / 3, y: 0 });
  assert.deepEqual(report.threejs.sprite.center, {
    x: 0.5, y: 0, target_anchor: { x: 1, y: 1 }, unit: "normalized-cell", source_origin: "top-left",
  });
  assert.match(report.threejs.snippets.factory, /new THREE\.TextureLoader\(\)\.loadAsync/u);
  assert.match(report.threejs.snippets.factory, /new THREE\.SpriteMaterial/u);
  assert.match(report.threejs.snippets.factory, /new THREE\.Sprite\(/u);
  assert.match(report.threejs.snippets.factory, /sprite\.scale\.set/u);
  assert.doesNotMatch(report.threejs.snippets.factory, /this\.load|this\.anims|setOrigin|generateFrameNumbers/u);

  const decoded = await sharp(await readFile(outputSheet)).raw().toBuffer({ resolveWithObject: true });
  assert.deepEqual({ width: decoded.info.width, height: decoded.info.height }, { width: 6, height: 1 });
  assert.deepEqual([...decoded.data.subarray(0, 4)], [255, 0, 0, 255]);
  assert.deepEqual([...decoded.data.subarray(8, 12)], [0, 0, 255, 255]);
  assert.deepEqual([...decoded.data.subarray(16, 20)], [255, 255, 0, 255]);
  const preview = await readFile(outputPreview, "utf8");
  assert.match(preview, /抽帧动画/u);
  assert.match(preview, /逐帧缩略图/u);
  assert.match(preview, /<video controls/u);
  assert.match(preview, /src="walk\.png"/u);
  assert.match(preview, new RegExp(`<meta name="threejs-atlas-sha256" content="${report.artifacts.sheet.sha256}">`, "u"));
  assert.match(await readFile(outputReport, "utf8"), /"schema": "threejs-video-atlas\/2"/u);
});

/** 验证带旋转元数据的视频尺寸以自动旋转后的首帧 PNG 为准。 */
test("按旋转视频抽出的首帧尺寸计算图集", async (t) => {
  const directory = await testDirectory(t);
  const inputVideo = join(directory, "rotated.mp4");
  const outputSheet = join(directory, "rotated.png");
  await writeFile(inputVideo, "fake rotated video bytes");
  const rotatedFrame = await solidPng(2, 4, [90, 80, 70]);
  const observed = {
    probePayload: {
      streams: [{ width: 4, height: 2, avg_frame_rate: "24/1", duration: "1.5", side_data_list: [{ rotation: 90 }] }],
      format: { duration: "1.5" },
    },
  };
  const report = await videoToAtlas({
    inputVideo,
    outputSheet,
    fps: 1,
    ffmpegPath: "ffmpeg-test",
    ffprobePath: "ffprobe-test",
    commandRunner: fakeRunner([rotatedFrame], observed),
  });
  assert.deepEqual([report.cell.width, report.cell.height], [2, 4]);
  assert.deepEqual([report.input.display_width, report.input.display_height], [2, 4]);
  const dimensions = await sharp(await readFile(outputSheet)).metadata();
  assert.deepEqual([dimensions.width, dimensions.height], [2, 4]);
});

/** 验证非循环预览停在末帧，且再次播放可以从首帧重启。 */
test("非循环网页预览在末帧停止并支持重播", async (t) => {
  const directory = await testDirectory(t);
  const inputVideo = join(directory, "attack.mp4");
  const outputSheet = join(directory, "attack.png");
  const outputPreview = join(directory, "attack.html");
  await writeFile(inputVideo, "fake video bytes");
  const frame = await solidPng(4, 2, [180, 40, 30]);
  const report = await videoToAtlas({
    inputVideo,
    outputSheet,
    outputPreview,
    fps: 1,
    loop: false,
    runtimeUrl: "assets/hero-attack.png",
    ffmpegPath: "ffmpeg-test",
    ffprobePath: "ffprobe-test",
    commandRunner: fakeRunner([frame, frame, frame]),
  });
  assert.equal(report.animation.loop, false);
  assert.equal(report.threejs.texture_loader.url, "assets/hero-attack.png");
  assert.match(parseVideoAtlasArgs(["--input-video", "x.mp4", "--output-sheet", "x.png", "--runtime-url", "assets/hero-attack.png"]).runtimeUrl, /^assets\//u);
  const preview = await readFile(outputPreview, "utf8");
  assert.match(preview, /"loop":false/u);
  const harness = createPreviewHarness(preview);
  harness.step(0);
  harness.step(1000);
  harness.step(2000);
  assert.deepEqual(harness.drawCalls, [], "图集加载前不应尝试绘制或推进帧");
  harness.atlas.complete = true;
  harness.atlas.naturalWidth = 12;
  harness.atlas.listeners.get("load")();
  assert.deepEqual(harness.drawCalls, [0], "图集加载后应从首帧开始");
  harness.step(10000);
  assert.deepEqual(harness.drawCalls, [0], "加载前流逝的时间不应耗尽非循环动画");
  harness.step(11000);
  assert.deepEqual(harness.drawCalls, [0, 4]);
  harness.step(12000);
  assert.deepEqual(harness.drawCalls, [0, 4, 8]);
  assert.equal(harness.toggle.textContent, "播放");
  harness.toggle.listeners.get("click")();
  assert.equal(harness.drawCalls.at(-1), 0, "末帧再次播放时应回到首帧");
  assert.equal(harness.toggle.textContent, "暂停");
});

/** 执行报告中的 three.js 工厂示例，确认实际 UV 推进、底边锚点和非循环终态。 */
test("three.js Sprite 示例按帧更新 UV 并在非循环动画末帧结束", async (t) => {
  const directory = await testDirectory(t);
  const inputVideo = join(directory, "attack.mp4");
  await writeFile(inputVideo, "fake video bytes");
  const frame = await solidPng(4, 2, [180, 40, 30]);
  const report = await videoToAtlas({
    inputVideo,
    outputSheet: join(directory, "attack.png"),
    fps: 1,
    loop: false,
    runtimeUrl: "assets/hero-attack.png",
    ffmpegPath: "ffmpeg-test",
    ffprobePath: "ffprobe-test",
    commandRunner: fakeRunner([frame, frame, frame]),
  });

  const texture = {
    offset: { x: 0, y: 0, set(x, y) { this.x = x; this.y = y; } },
    repeat: { set(x, y) { this.x = x; this.y = y; } },
    dispose() {},
  };
  let loadedUrl;
  class TextureLoader {
    async loadAsync(url) { loadedUrl = url; return texture; }
  }
  class SpriteMaterial {
    constructor(parameters) { this.parameters = parameters; }
    dispose() {}
  }
  class Sprite {
    constructor(material) {
      this.material = material;
      this.scale = { set(x, y, z) { this.x = x; this.y = y; this.z = z; } };
      this.center = { set(x, y) { this.x = x; this.y = y; } };
    }
  }
  const THREE = {
    TextureLoader,
    SpriteMaterial,
    Sprite,
    SRGBColorSpace: "srgb",
    ClampToEdgeWrapping: "clamp",
  };
  const scene = { children: [], add(sprite) { this.children.push(sprite); }, remove(sprite) { this.children = this.children.filter((item) => item !== sprite); } };
  const createFrameAnimation = runInNewContext(`(${report.threejs.snippets.factory})`);
  const animation = await createFrameAnimation(THREE, scene, 0.5);

  assert.equal(loadedUrl, "assets/hero-attack.png");
  assert.deepEqual([texture.repeat.x, texture.repeat.y], [1 / 3, 1]);
  assert.deepEqual([animation.sprite.center.x, animation.sprite.center.y], [0.5, 0]);
  assert.deepEqual([animation.sprite.scale.x, animation.sprite.scale.y, animation.sprite.scale.z], [2, 1, 1]);
  assert.equal(scene.children.length, 1);
  assert.equal(animation.update(1.4), false);
  assert.equal(texture.offset.x, 1 / 3);
  assert.equal(animation.update(1), false);
  assert.equal(texture.offset.x, 2 / 3);
  assert.equal(animation.update(0.6), true);
  assert.equal(texture.offset.x, 2 / 3, "完成后必须停留在末帧");
  assert.equal(animation.update(2), true);
  assert.equal(texture.offset.x, 2 / 3, "重复更新不能让非循环动画越过末帧");
  animation.dispose();
  assert.equal(scene.children.length, 0);
});

/** 验证工具报告、显式 runtime URL、网页 SHA 与项目文件门可直接对接。 */
test("工具输出可直接通过视频图集工作流文件门", async (t) => {
  const directory = await testDirectory(t);
  const inputVideo = join(directory, "source.mp4");
  const outputSheet = join(directory, "public", "assets", "hero-attack.png");
  const outputReport = join(directory, "reports", "hero-attack.json");
  const outputPreview = join(directory, "public", "hero-attack.html");
  const promptFile = join(directory, "prompts", "hero-attack.txt");
  const sourceVideoBytes = Buffer.from("fake video bytes");
  await writeFile(inputVideo, sourceVideoBytes);
  await mkdir(join(directory, "prompts"), { recursive: true });
  await writeFile(promptFile, "角色向前挥剑，动作循环自然，绿色纯色背景。");
  const frame = await solidPng(4, 2, [190, 90, 25]);
  await videoToAtlas({
    inputVideo,
    outputSheet,
    outputReport,
    outputPreview,
    fps: 2,
    runtimeUrl: "assets/hero-attack.png",
    ffmpegPath: "ffmpeg-test",
    ffprobePath: "ffprobe-test",
    commandRunner: fakeRunner([frame, frame]),
  });
  const relativeFiles = {
    prompt: "prompts/hero-attack.txt",
    source: "source.mp4",
    report: "reports/hero-attack.json",
    preview: "public/hero-attack.html",
    sheet: "public/assets/hero-attack.png",
  };
  const shaFor = async (path) => contractSha256Bytes(await readFile(join(directory, path)));
  const frameAnimation = {
    schema: FRAME_ANIMATION_WORKFLOW_SCHEMA,
    status: "accepted",
    work_item_id: "work-item-video-atlas",
    candidate_version: "candidate-1",
    settings: { fps: 2, width: 4, height: 2, remove_background: false },
    video_prompt: { file: relativeFiles.prompt, sha256: await shaFor(relativeFiles.prompt) },
    source_video: { file: relativeFiles.source, sha256: await shaFor(relativeFiles.source) },
    quality_report: { file: relativeFiles.report, sha256: await shaFor(relativeFiles.report) },
    preview: { file: relativeFiles.preview, sha256: await shaFor(relativeFiles.preview) },
    spritesheet: {
      file: relativeFiles.sheet,
      sha256: await shaFor(relativeFiles.sheet),
      runtime_url: "assets/hero-attack.png",
    },
  };
  const asset = {
    texture_key: "hero-attack",
    runtime_outputs: [relativeFiles.sheet],
    frame_animation: frameAnimation,
  };
  assert.deepEqual(await checkFrameAnimationWorkflowFiles(asset, {
    projectRoot: directory,
    workItemId: "work-item-video-atlas",
    candidateVersion: "candidate-1",
  }), []);
  assert.equal(JSON.parse(await readFile(outputReport, "utf8")).threejs.texture_loader.url, "assets/hero-attack.png");
});

/** 证明启用去背景时复用本地算法，输出透明背景并保留前景像素。 */
test("可选纯色背景移除生成透明帧", async (t) => {
  const directory = await testDirectory(t);
  const inputVideo = join(directory, "greenscreen.mp4");
  const outputSheet = join(directory, "transparent.png");
  await writeFile(inputVideo, "fake video bytes");
  const greenFrame = await solidPng(4, 2, [0, 255, 0], [
    { x: 1, y: 0, color: [255, 0, 0] },
    { x: 1, y: 1, color: [255, 0, 0] },
  ]);
  const report = await videoToAtlas({
    inputVideo,
    outputSheet,
    fps: 1,
    removeBackground: true,
    backgroundColor: "#00ff00",
    backgroundTolerance: 0,
    ffmpegPath: "ffmpeg-test",
    ffprobePath: "ffprobe-test",
    commandRunner: fakeRunner([greenFrame]),
  });

  assert.equal(report.input.remove_background, true);
  assert.equal(report.settings.remove_background, true);
  const decoded = await sharp(await readFile(outputSheet)).raw().toBuffer({ resolveWithObject: true });
  assert.deepEqual([...decoded.data.subarray(0, 4)], [0, 0, 0, 0]);
  assert.deepEqual([...decoded.data.subarray(4, 8)], [255, 0, 0, 255]);
});

/** 证明零帧、最大图集尺寸和输入/输出冲突均会失败且不写图集。 */
test("拒绝空抽帧、超限图集和视频路径输出冲突", async (t) => {
  const directory = await testDirectory(t);
  const inputVideo = join(directory, "source.mp4");
  await writeFile(inputVideo, "fake video bytes");
  const dependencies = {
    ffmpegPath: "ffmpeg-test",
    ffprobePath: "ffprobe-test",
    commandRunner: fakeRunner([]),
  };
  await assert.rejects(videoToAtlas({ inputVideo, outputSheet: join(directory, "empty.png"), ...dependencies }), /没有生成任何帧/u);

  const sourcePng = await solidPng(4, 2, [200, 10, 20]);
  const limitedSheet = join(directory, "too-wide.png");
  await assert.rejects(videoToAtlas({
    inputVideo,
    outputSheet: limitedSheet,
    maxAtlasWidth: 8,
    ffmpegPath: "ffmpeg-test",
    ffprobePath: "ffprobe-test",
    commandRunner: fakeRunner([sourcePng, sourcePng, sourcePng]),
  }), /超过最大尺寸/u);

  const conflictPath = join(directory, "same.png");
  await writeFile(conflictPath, "video stored with png suffix");
  await assert.rejects(videoToAtlas({
    inputVideo: conflictPath,
    outputSheet: conflictPath,
    ffmpegPath: "ffmpeg-test",
    ffprobePath: "ffprobe-test",
    commandRunner: fakeRunner([sourcePng]),
  }), /视频输入路径不得与输出路径冲突/u);
  await assert.rejects(readFile(limitedSheet), { code: "ENOENT" });
});

/** 证明 ffmpeg 非零退出被作为抽帧错误报告，且不留下输出文件。 */
test("报告 ffmpeg 执行失败", async (t) => {
  const directory = await testDirectory(t);
  const inputVideo = join(directory, "broken.mp4");
  const outputSheet = join(directory, "broken.png");
  await writeFile(inputVideo, "fake video bytes");
  const commandRunner = async (command) => command === "ffprobe-test"
    ? { exitCode: 0, stdout: JSON.stringify({ streams: [{ width: 4, height: 2, avg_frame_rate: "24/1", duration: "1" }] }) }
    : { exitCode: 1, stderr: "decoder failed" };
  await assert.rejects(videoToAtlas({
    inputVideo,
    outputSheet,
    ffmpegPath: "ffmpeg-test",
    ffprobePath: "ffprobe-test",
    commandRunner,
  }), (error) => error instanceof VideoAtlasError && /ffmpeg 视频抽帧失败/u.test(error.message));
  await assert.rejects(readFile(outputSheet), { code: "ENOENT" });
});
