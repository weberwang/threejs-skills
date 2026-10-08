import assert from "node:assert/strict";
import { deflateSync } from "node:zlib";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import {
  FRAME_ANIMATION_REPORT_SCHEMA,
  FRAME_ANIMATION_WORKFLOW_SCHEMA,
  checkFrameAnimationWorkflowFiles,
  sha256Bytes,
  validateFrameAnimationWorkflowContract,
} from "./frame-animation-workflow-contract.mjs";

/** 计算最小 PNG chunk CRC，测试工件只需有可读取的合法图集头。 */
function pngCrc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc & 1) ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/** 构造指定 RGBA 尺寸的 PNG，避免测试依赖外部图像库。 */
function minimalPng(width, height) {
  const chunk = (type, data) => {
    const typeBytes = Buffer.from(type, "ascii");
    const body = Buffer.concat([typeBytes, data]);
    const length = Buffer.alloc(4); length.writeUInt32BE(data.length);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(pngCrc32(body));
    return Buffer.concat([length, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const scanlines = Buffer.alloc(height * (width * 4 + 1));
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(scanlines)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/** 构造完整视频抽帧合同；四帧用于确认帧数不再受旧三帧网格限制。 */
function buildFixtureFiles() {
  const fps = 12;
  const frameCount = 4;
  const sheet = minimalPng(16, 4);
  const video = Buffer.from("test video bytes");
  const prompt = Buffer.from("A small hero runs in place, side view, transparent background.\n");
  const preview = Buffer.from("<!doctype html><html><head><meta name=\"threejs-atlas-sha256\" content=\"" + sha256Bytes(sheet) + "\"><title>Preview</title></head><body>hero</body></html>\n");
  const frames = Array.from({ length: frameCount }, (_, index) => ({
    index,
    source_timestamp: index / fps,
    source_sha256: sha256Bytes(Buffer.from("source-frame-" + index)),
  }));
  const report = {
    schema: FRAME_ANIMATION_REPORT_SCHEMA,
    status: "PASS",
    input: {
      video_path: "input/hero.mp4",
      video_sha256: sha256Bytes(video),
      fps,
      remove_background: true,
      source_width: 1920,
      source_height: 1080,
      source_fps: 30,
      duration_seconds: 1,
    },
    cell: { width: 4, height: 4, target_anchor: { x: 2, y: 4 }, layout: "horizontal" },
    frames,
    animation: { key: "hero-run", texture_key: "hero-texture", frame_rate: fps, loop: true },
    threejs: {
      texture_loader: {
        class: "THREE.TextureLoader",
        method: "loadAsync",
        url: "assets/hero.png",
        color_space: "THREE.SRGBColorSpace",
      },
      atlas_uv: {
        layout: "horizontal",
        frame_count: frameCount,
        frame_index: { start: 0, end: frameCount - 1 },
        repeat: { x: 1 / frameCount, y: 1 },
        offset: { x_start: 0, x_step: 1 / frameCount, y: 0 },
        wrapping: { s: "THREE.ClampToEdgeWrapping", t: "THREE.ClampToEdgeWrapping" },
        offset_formula: "frameIndex / frameCount",
      },
      sprite: {
        material_class: "THREE.SpriteMaterial",
        object_class: "THREE.Sprite",
        center: { x: 0.5, y: 0, target_anchor: { x: 2, y: 4 }, unit: "normalized-cell", source_origin: "top-left" },
      },
      animation: {
        key: "hero-run",
        texture_key: "hero-texture",
        frame_rate: fps,
        loop: true,
        frames: { start: 0, end: frameCount - 1, count: frameCount },
        end_behavior: "wrap-to-first-frame",
      },
      snippets: {
        factory: "async function createFrameAnimation(THREE, scene) { const texture = await new THREE.TextureLoader().loadAsync('assets/hero.png'); const material = new THREE.SpriteMaterial({ map: texture }); const sprite = new THREE.Sprite(material); sprite.scale.set(4, 4, 1); sprite.center.set(0.5, 0); texture.offset.x = frameIndex / frameCount; return { sprite }; }",
        usage: "animation.update(deltaSeconds);",
      },
    },
    artifacts: {
      sheet: { file: "public/assets/hero.png", width: 16, height: 4, sha256: sha256Bytes(sheet) },
      preview: { file: "reports/hero-preview.html" },
      report: { file: "reports/hero-atlas.json" },
    },
  };
  const reportBytes = Buffer.from(JSON.stringify(report, null, 2) + "\n");
  const files = new Map([
    ["evidence/hero-prompt.txt", prompt],
    ["input/hero.mp4", video],
    ["reports/hero-atlas.json", reportBytes],
    ["reports/hero-preview.html", preview],
    ["public/assets/hero.png", sheet],
  ]);
  const artifact = (file, bytes, extra = {}) => ({ file, sha256: sha256Bytes(bytes), ...extra });
  const contract = {
    schema: FRAME_ANIMATION_WORKFLOW_SCHEMA,
    status: "accepted",
    work_item_id: "work-item-video-atlas",
    candidate_version: "candidate-video-atlas",
    external_operation_authorized: false,
    settings: { fps, width: 4, height: 4, remove_background: true },
    video_prompt: artifact("evidence/hero-prompt.txt", prompt),
    source_video: artifact("input/hero.mp4", video),
    quality_report: artifact("reports/hero-atlas.json", reportBytes),
    preview: artifact("reports/hero-preview.html", preview),
    spritesheet: artifact("public/assets/hero.png", sheet, { runtime_url: "assets/hero.png" }),
  };
  const asset = {
    texture_key: "hero-texture",
    runtime_outputs: ["public/assets/hero.png"],
    frame_animation: contract,
  };
  return { files, asset, report, sheet, video };
}

/** 将夹具文件写入独立临时项目目录。 */
async function writeFixture() {
  const root = await mkdtemp(join(tmpdir(), "video-atlas-workflow-contract-"));
  const fixture = buildFixtureFiles();
  for (const [file, bytes] of fixture.files) {
    const target = join(root, file);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, bytes);
  }
  return { root, fixture };
}

/** 运行静态与文件门并返回错误文本。 */
async function runGate(root, asset) {
  return checkFrameAnimationWorkflowFiles(asset, {
    projectRoot: root,
    workItemId: "work-item-video-atlas",
    candidateVersion: "candidate-video-atlas",
  });
}

/** 在临时目录上执行单个用例，并确保测试工件被清理。 */
async function withFixture(callback) {
  const { root, fixture } = await writeFixture();
  try { await callback(root, fixture); }
  finally { await rm(root, { recursive: true, force: true }); }
}

/** 重写报告文件并更新 manifest 对应的 SHA。 */
async function writeReport(root, fixture) {
  const bytes = Buffer.from(JSON.stringify(fixture.report, null, 2) + "\n");
  await writeFile(join(root, fixture.asset.frame_animation.quality_report.file), bytes);
  fixture.asset.frame_animation.quality_report.sha256 = sha256Bytes(bytes);
}

test("缺少视频抽帧合同或设置时静态合同失败", () => {
  assert(validateFrameAnimationWorkflowContract(undefined).some((message) => message.includes("必须是对象")));
  const { asset } = buildFixtureFiles();
  delete asset.frame_animation.settings;
  assert(validateFrameAnimationWorkflowContract(asset.frame_animation).some((message) => message.includes("settings")));
});

test("四帧视频抽帧报告通过静态合同和文件门", async () => {
  await withFixture(async (root, fixture) => {
    assert.deepEqual(validateFrameAnimationWorkflowContract(fixture.asset.frame_animation, {
      workItemId: "work-item-video-atlas",
      candidateVersion: "candidate-video-atlas",
    }), []);
    assert.deepEqual(await runGate(root, fixture.asset), []);
  });
});

test("质量报告必须声明 PASS", async () => {
  await withFixture(async (root, fixture) => {
    fixture.report.status = "FAIL";
    await writeReport(root, fixture);
    const errors = await runGate(root, fixture.asset);
    assert(errors.some((message) => message.includes("quality_report.status 必须为 PASS")));
  });
});

test("所有绑定文件的实际 SHA 都必须匹配", async () => {
  await withFixture(async (root, fixture) => {
    await writeFile(join(root, fixture.asset.frame_animation.preview.file), "<html>changed</html>");
    const errors = await runGate(root, fixture.asset);
    assert(errors.some((message) => message.includes("preview.sha256 与文件不一致")));
  });
});

test("更新 manifest 视频 SHA 也不能掩盖源视频被替换", async () => {
  await withFixture(async (root, fixture) => {
    const replacement = Buffer.from("replacement video bytes");
    await writeFile(join(root, fixture.asset.frame_animation.source_video.file), replacement);
    fixture.asset.frame_animation.source_video.sha256 = sha256Bytes(replacement);
    const errors = await runGate(root, fixture.asset);
    assert(errors.some((message) => message.includes("input.video_sha256 与 source_video 文件 SHA 不一致")));
  });
});

test("只篡改源视频 manifest SHA 会被文件门拒绝", async () => {
  await withFixture(async (root, fixture) => {
    fixture.asset.frame_animation.source_video.sha256 = "sha256:" + "0".repeat(64);
    const errors = await runGate(root, fixture.asset);
    assert(errors.some((message) => message.includes("source_video.sha256 与文件不一致")));
  });
});

test("实际抽帧 FPS 必须绑定 manifest 设置与 ThreeJS 播放帧率", async () => {
  await withFixture(async (root, fixture) => {
    fixture.report.input.fps = 15;
    fixture.report.animation.frame_rate = 15;
    fixture.report.threejs.animation.frame_rate = 15;
    await writeReport(root, fixture);
    const errors = await runGate(root, fixture.asset);
    assert(errors.some((message) => message.includes("input.fps 必须等于 settings.fps")));

    fixture.report.input.fps = 12;
    fixture.report.animation.frame_rate = 10;
    fixture.report.threejs.animation.frame_rate = 10;
    await writeReport(root, fixture);
    const mismatchedAnimationErrors = await runGate(root, fixture.asset);
    assert(mismatchedAnimationErrors.some((message) => message.includes("animation.frame_rate 必须等于 input.fps")));
  });
});

test("抽帧 cell 尺寸必须匹配设置且 PNG 尺寸必须匹配帧数", async () => {
  await withFixture(async (root, fixture) => {
    fixture.report.cell.width = 8;
    await writeReport(root, fixture);
    const settingErrors = await runGate(root, fixture.asset);
    assert(settingErrors.some((message) => message.includes("cell.width 必须等于 settings.width")));

    const wrongSizeSheet = minimalPng(20, 4);
    await writeFile(join(root, fixture.asset.frame_animation.spritesheet.file), wrongSizeSheet);
    fixture.asset.frame_animation.spritesheet.sha256 = sha256Bytes(wrongSizeSheet);
    fixture.report.artifacts.sheet.width = 20;
    fixture.report.artifacts.sheet.sha256 = sha256Bytes(wrongSizeSheet);
    fixture.report.cell.width = 4;
    await writeReport(root, fixture);
    const pngErrors = await runGate(root, fixture.asset);
    assert(pngErrors.some((message) => message.includes("spritesheet 宽度必须等于 cell.width 乘帧数")));
  });
});

test("是否移除背景必须是布尔值并与合同设置一致", async () => {
  await withFixture(async (root, fixture) => {
    fixture.report.input.remove_background = false;
    await writeReport(root, fixture);
    const mismatchErrors = await runGate(root, fixture.asset);
    assert(mismatchErrors.some((message) => message.includes("input.remove_background 必须等于 settings.remove_background")));

    fixture.report.input.remove_background = "true";
    await writeReport(root, fixture);
    const typeErrors = await runGate(root, fixture.asset);
    assert(typeErrors.some((message) => message.includes("input.remove_background 必须是布尔值")));
  });
});

test("质量报告中的图集 SHA 必须匹配实际 PNG", async () => {
  await withFixture(async (root, fixture) => {
    fixture.report.artifacts.sheet.sha256 = "sha256:" + "1".repeat(64);
    await writeReport(root, fixture);
    const errors = await runGate(root, fixture.asset);
    assert(errors.some((message) => message.includes("artifacts.sheet.sha256 与真实 spritesheet 不一致")));
  });
});

test("Three.js UV 与动画帧范围必须覆盖完整图集", async () => {
  await withFixture(async (root, fixture) => {
    fixture.report.threejs.animation.frames.end = 2;
    await writeReport(root, fixture);
    const errors = await runGate(root, fixture.asset);
    assert(errors.some((message) => message.includes("threejs.animation.frames 与实际帧范围不一致")));
  });
});

test("spritesheet runtime_url 必填且拒绝外部地址和路径逃逸", () => {
  for (const runtimeUrl of [undefined, "", "../hero.png", "assets\\hero.png", "https://cdn.example/hero.png", "%252e%252e/hero.png"]) {
    const { asset } = buildFixtureFiles();
    if (runtimeUrl === undefined) delete asset.frame_animation.spritesheet.runtime_url;
    else asset.frame_animation.spritesheet.runtime_url = runtimeUrl;
    const errors = validateFrameAnimationWorkflowContract(asset.frame_animation);
    assert(errors.some((message) => message.includes("spritesheet.runtime_url 必须是非空且安全的 ThreeJS URL")));
  }
});

test("提示词 JSON 必须可解析且网页预览必须是 HTML", async () => {
  await withFixture(async (root, fixture) => {
    const promptFile = "evidence/hero-prompt.json";
    const promptBytes = Buffer.from("{invalid");
    await writeFile(join(root, fixture.asset.frame_animation.video_prompt.file), promptBytes);
    fixture.asset.frame_animation.video_prompt.file = promptFile;
    fixture.asset.frame_animation.video_prompt.sha256 = sha256Bytes(promptBytes);
    await mkdir(dirname(join(root, promptFile)), { recursive: true });
    await writeFile(join(root, promptFile), promptBytes);
    await writeFile(join(root, fixture.asset.frame_animation.preview.file), "not html");
    fixture.asset.frame_animation.preview.sha256 = sha256Bytes(Buffer.from("not html"));
    const errors = await runGate(root, fixture.asset);
    assert(errors.some((message) => message.includes("video_prompt JSON 格式无效")));
    assert(errors.some((message) => message.includes("preview 必须包含 HTML 根元素")));
  });
});

test("解析成功但根节点不是对象的报告不能通过", async () => {
  await withFixture(async (root, fixture) => {
    const bytes = Buffer.from("null\n");
    await writeFile(join(root, fixture.asset.frame_animation.quality_report.file), bytes);
    fixture.asset.frame_animation.quality_report.sha256 = sha256Bytes(bytes);
    const errors = await runGate(root, fixture.asset);
    assert(errors.some((message) => message.includes("解析结果必须是普通 JSON 对象")));
  });
});

test("Three.js TextureLoader URL 必须严格等于 spritesheet runtime_url", async () => {
  await withFixture(async (root, fixture) => {
    fixture.report.threejs.texture_loader.url = "assets/other.png";
    await writeReport(root, fixture);
    const errors = await runGate(root, fixture.asset);
    assert(errors.some((message) => message.includes("texture_loader.url 必须严格等于 spritesheet.runtime_url")));
  });
});

test("Sprite.center 必须把左上角锚点转换为 Three.js 左下归一化坐标", async () => {
  await withFixture(async (root, fixture) => {
    fixture.report.threejs.sprite.center.y = 1;
    await writeReport(root, fixture);
    const errors = await runGate(root, fixture.asset);
    assert(errors.some((message) => message.includes("sprite.center 必须按左上角像素锚点转换")));
  });
});

test("报告相对工件路径必须匹配 manifest，绝对路径作为诊断信息放行", async () => {
  await withFixture(async (root, fixture) => {
    fixture.report.artifacts.preview.file = "reports/other-preview.html";
    await writeReport(root, fixture);
    const relativePathErrors = await runGate(root, fixture.asset);
    assert(relativePathErrors.some((message) => message.includes("artifacts.preview.file 必须与 manifest 工件路径一致")));

    fixture.report.artifacts.sheet.file = "C:\\generated\\hero.png";
    fixture.report.artifacts.preview.file = "C:\\generated\\hero-preview.html";
    fixture.report.artifacts.report.file = "C:\\generated\\hero-report.json";
    await writeReport(root, fixture);
    assert.deepEqual(await runGate(root, fixture.asset), []);
  });
});

test("网页预览必须通过 meta 绑定实际图集 SHA", async () => {
  await withFixture(async (root, fixture) => {
    const badPreview = Buffer.from("<html><head><meta name=\"threejs-atlas-sha256\" content=\"sha256:" + "0".repeat(64) + "\"></head></html>");
    await writeFile(join(root, fixture.asset.frame_animation.preview.file), badPreview);
    fixture.asset.frame_animation.preview.sha256 = sha256Bytes(badPreview);
    const errors = await runGate(root, fixture.asset);
    assert(errors.some((message) => message.includes("preview 内嵌图集 SHA 与 spritesheet 文件不一致")));
  });
});
