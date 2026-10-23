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
      width: 4,
      height: 4,
      display_width: 4,
      display_height: 4,
      source_fps: 30,
      duration_seconds: 1,
    },
    cell: {
      width: 4, height: 4, source_anchor: { x: 2, y: 3 },
      content_rect: { x: 0, y: 0, width: 4, height: 4 },
      target_anchor: { x: 2, y: 3 }, layout: "horizontal",
    },
    frames,
    animation: { key: "hero-run", texture_key: "hero-texture", frame_rate: fps, loop: true },
    threejs: {
      texture_loader: {
        class: "THREE.TextureLoader",
        method: "loadAsync",
        url: "/assets/hero/hero.png",
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
        center: { x: 0.5, y: 0.25, target_anchor: { x: 2, y: 3 }, unit: "normalized-cell", source_origin: "top-left" },
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
        factory: "async function createFrameAnimation(THREE, scene) { const texture = await new THREE.TextureLoader().loadAsync(\"/assets/hero/hero.png\"); const material = new THREE.SpriteMaterial({ map: texture, transparent: true }); const sprite = new THREE.Sprite(material); sprite.scale.set(4, 4, 1); sprite.center.set(0.5, 0.25); texture.repeat.set(1 / 4, 1); texture.offset.x = frameIndex / frameCount; return { sprite, update(deltaSeconds) {} }; }",
        usage: "animation.update(deltaSeconds);",
      },
    },
    runtime_binding: { kind: "public", file: "public/assets/hero/hero.png", deployment_base: "/" },
    runtime_url: "/assets/hero/hero.png",
    artifacts: {
      sheet: { file: "public/assets/hero/hero.png", width: 16, height: 4, sha256: sha256Bytes(sheet) },
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
    ["public/assets/hero/hero.png", sheet],
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
    spritesheet: artifact("public/assets/hero/hero.png", sheet, {
      runtime_binding: { kind: "public", file: "public/assets/hero/hero.png", deployment_base: "/" },
      runtime_url: "/assets/hero/hero.png",
    }),
  };
  const asset = {
    texture_key: "hero-texture",
    runtime_outputs: ["public/assets/hero/hero.png"],
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

/** 绑定共享视频中的固定动画区域，输出 cell 尺寸独立于源区域尺寸。 */
function bindFixtureRegion(fixture) {
  const region = { x: 80, y: 24, width: 160, height: 96 };
  fixture.asset.frame_animation.settings.region = { ...region };
  fixture.report.input.region = { ...region };
  fixture.report.input.display_width = 1366;
  fixture.report.input.display_height = 768;
  fixture.report.settings = { ...fixture.asset.frame_animation.settings, region: { ...region } };
  fixture.report.cell.source_anchor = { x: region.width / 2, y: region.height - 1 };
  fixture.report.cell.content_rect = { x: 0, y: 1, width: 4, height: 2 };
  const targetAnchor = { x: 2, y: 1 + (region.height - 1) * 2 / region.height };
  fixture.report.cell.target_anchor = targetAnchor;
  fixture.report.threejs.sprite.center = {
    x: targetAnchor.x / 4,
    y: 1 - targetAnchor.y / 4,
    target_anchor: { ...targetAnchor },
    unit: "normalized-cell",
    source_origin: "top-left",
  };
}

/** 模拟源区域等比缩放后上下留白，根锚点须跟随实际内容矩形变换。 */
function bindFixtureAnchor(fixture) {
  bindFixtureRegion(fixture);
  const anchor = { x: 80, y: 48 };
  fixture.asset.frame_animation.settings.anchor = { ...anchor };
  fixture.report.input.anchor = { ...anchor };
  fixture.report.settings.anchor = { ...anchor };
  fixture.report.cell.source_anchor = { ...anchor };
  fixture.report.cell.content_rect = { x: 0, y: 1, width: 4, height: 2 };
  fixture.report.cell.target_anchor = { x: 2, y: 2 };
  fixture.report.threejs.sprite.center = {
    x: 0.5, y: 0.5, target_anchor: { x: 2, y: 2 }, unit: "normalized-cell", source_origin: "top-left",
  };
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

test("摘要缺失、格式错误或陈旧不阻断实际工件验收", async () => {
  await withFixture(async (root, fixture) => {
    const contract = fixture.asset.frame_animation;
    const variants = [
      ["缺失", undefined],
      ["格式错误", "not-a-sha"],
      ["陈旧", "sha256:" + "0".repeat(64)],
    ];

    for (const [label, digest] of variants) {
      // 将各处追踪值一起改为同一场景，验证它们不会遮蔽真实结构与文件检查。
      const setOptionalDigest = (target, field) => {
        if (digest === undefined) delete target[field];
        else target[field] = digest;
      };
      for (const key of ["video_prompt", "source_video", "quality_report", "preview", "spritesheet"]) {
        setOptionalDigest(contract[key], "sha256");
      }
      setOptionalDigest(fixture.report.input, "video_sha256");
      for (const frame of fixture.report.frames) setOptionalDigest(frame, "source_sha256");
      setOptionalDigest(fixture.report.artifacts.sheet, "sha256");

      const meta = digest === undefined ? "" : `<meta name="threejs-atlas-sha256" content="${digest}">`;
      const preview = Buffer.from(`<!doctype html><html><head>${meta}</head><body>hero</body></html>\n`);
      await writeFile(join(root, contract.preview.file), preview);
      setOptionalDigest(contract.preview, "sha256");
      await writeReport(root, fixture);
      // 报告重写器会更新报告文件追踪值，再统一覆盖为本轮测试的摘要状态。
      setOptionalDigest(contract.quality_report, "sha256");
      const errors = await runGate(root, fixture.asset);
      assert.deepEqual(errors, [], `${label} 摘要不能阻断文件门`);
    }
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
    fixture.report.threejs.atlas_uv.repeat.x = 1 / 4;
    await writeReport(root, fixture);
    const settingErrors = await runGate(root, fixture.asset);
    assert(settingErrors.some((message) => message.includes("cell.width 必须等于 settings.width")));

    const wrongSizeSheet = minimalPng(20, 4);
    await writeFile(join(root, fixture.asset.frame_animation.spritesheet.file), wrongSizeSheet);
    fixture.asset.frame_animation.spritesheet.sha256 = sha256Bytes(wrongSizeSheet);
    fixture.report.artifacts.sheet.width = 20;
    fixture.report.artifacts.sheet.sha256 = sha256Bytes(wrongSizeSheet);
    fixture.report.cell.width = 4;
    fixture.report.threejs.atlas_uv.repeat.x = 1 / 4;
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

test("质量报告中的陈旧图集 SHA 仅作为追踪信息", async () => {
  await withFixture(async (root, fixture) => {
    fixture.report.artifacts.sheet.sha256 = "stale";
    await writeReport(root, fixture);
    assert.deepEqual(await runGate(root, fixture.asset), []);
  });
});

test("Three.js UV 与动画帧范围必须覆盖完整图集", async () => {
  await withFixture(async (root, fixture) => {
    fixture.report.threejs.animation.frames.end = 2;
    await writeReport(root, fixture);
    const errors = await runGate(root, fixture.asset);
    assert(errors.some((message) => message.includes("animation.frames 与实际帧范围不一致")));
  });
});

test("水平 UV repeat 必须由完整图集帧数推导", async () => {
  await withFixture(async (root, fixture) => {
    fixture.report.threejs.atlas_uv.repeat.x = 1 / 3;
    await writeReport(root, fixture);
    const errors = await runGate(root, fixture.asset);
    assert(errors.some((message) => message.includes("atlas_uv 的 UV repeat/offset/wrapping")));
  });
});

test("Sprite.center 必须把左上像素锚点转换为左下归一化坐标", async () => {
  await withFixture(async (root, fixture) => {
    fixture.report.threejs.sprite.center.y = 0.75;
    await writeReport(root, fixture);
    const errors = await runGate(root, fixture.asset);
    assert(errors.some((message) => message.includes("sprite.center 必须按左上角像素锚点转换")));
  });
});

test("spritesheet runtime_binding 必填且 runtime_url 必须由绑定推导", () => {
  for (const runtimeUrl of [undefined, "", "../hero.png", "assets\\hero.png", "https://cdn.example/hero.png", "%252e%252e/hero.png"]) {
    const { asset } = buildFixtureFiles();
    if (runtimeUrl === undefined) delete asset.frame_animation.spritesheet.runtime_url;
    else asset.frame_animation.spritesheet.runtime_url = runtimeUrl;
    const errors = validateFrameAnimationWorkflowContract(asset.frame_animation);
    assert(errors.some((message) => message.includes("spritesheet.runtime_url 必须等于 runtime_binding 推导的地址")));
  }
  const { asset } = buildFixtureFiles();
  delete asset.frame_animation.spritesheet.runtime_binding;
  assert(validateFrameAnimationWorkflowContract(asset.frame_animation).some((message) => message.includes("runtime_binding 无效")));
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

test("Three.js TextureLoader URL 必须严格等于绑定推导的 spritesheet runtime_url", async () => {
  await withFixture(async (root, fixture) => {
    fixture.report.threejs.texture_loader.url = "assets/other.png";
    await writeReport(root, fixture);
    const errors = await runGate(root, fixture.asset);
    assert(errors.some((message) => message.includes("texture_loader.url 必须严格等于绑定推导的 spritesheet.runtime_url")));
  });
});

test("报告工件路径绑定 spritesheet；其它绝对路径仅作为诊断信息放行", async () => {
  await withFixture(async (root, fixture) => {
    fixture.report.artifacts.preview.file = "reports/other-preview.html";
    await writeReport(root, fixture);
    const relativePathErrors = await runGate(root, fixture.asset);
    assert(relativePathErrors.some((message) => message.includes("artifacts.preview.file 必须与 manifest 工件路径一致")));

    fixture.report.artifacts.sheet.file = "C:\\generated\\hero.png";
    fixture.report.artifacts.preview.file = "C:\\generated\\hero-preview.html";
    fixture.report.artifacts.report.file = "C:\\generated\\hero-report.json";
    await writeReport(root, fixture);
    assert((await runGate(root, fixture.asset)).some((message) => message.includes("artifacts.sheet.file 必须严格等于 manifest spritesheet.file")));
    fixture.report.artifacts.sheet.file = fixture.asset.frame_animation.spritesheet.file;
    await writeReport(root, fixture);
    assert.deepEqual(await runGate(root, fixture.asset), []);
  });
});

/** 确保实际 loadAsync 参数和报告中的绑定身份都不能被示例片段篡改。 */
test("Three.js snippet 和报告必须保留 spritesheet 绑定", async () => {
  await withFixture(async (root, fixture) => {
    fixture.report.threejs.snippets.factory = fixture.report.threejs.snippets.factory.replace("/assets/hero/hero.png", "/assets/other.png");
    await writeReport(root, fixture);
    assert((await runGate(root, fixture.asset)).some((message) => message.includes("factory 的 loadAsync 参数必须严格绑定运行时资源")));
  });
  await withFixture(async (root, fixture) => {
    fixture.report.runtime_binding = {
      deployment_base: fixture.report.runtime_binding.deployment_base,
      file: fixture.report.runtime_binding.file,
      kind: fixture.report.runtime_binding.kind,
    };
    await writeReport(root, fixture);
    assert.deepEqual(await runGate(root, fixture.asset), [], "JSON 属性顺序不应改变绑定身份");
    fixture.report.runtime_binding.deployment_base = "/other/";
    await writeReport(root, fixture);
    assert((await runGate(root, fixture.asset)).some((message) => message.includes("runtime_binding 必须与 manifest spritesheet.runtime_binding 一致")));
  });
});

/** module-import accepted 路线要求实际 importer 文件存在且示例使用 atlasUrl。 */
test("module-import 文件门检查 importer、specifier 与 atlasUrl 参数", async () => {
  await withFixture(async (root, fixture) => {
    const contract = fixture.asset.frame_animation;
    const binding = {
      kind: "module-import",
      file: "src/assets/hero.png",
      importer: "src/animations/hero.ts",
      specifier: "../assets/hero.png?url",
    };
    const sheetBytes = fixture.files.get("public/assets/hero/hero.png");
    await mkdir(join(root, "src/assets"), { recursive: true });
    await writeFile(join(root, "src/assets/hero.png"), sheetBytes);
    await mkdir(join(root, "src/animations"), { recursive: true });
    await writeFile(join(root, "src/animations/hero.ts"), "export const hero = true;\n");
    contract.spritesheet.file = binding.file;
    contract.spritesheet.runtime_binding = binding;
    contract.spritesheet.runtime_url = null;
    fixture.asset.runtime_outputs = [binding.file];
    fixture.report.runtime_binding = binding;
    fixture.report.runtime_url = null;
    fixture.report.artifacts.sheet.file = binding.file;
    fixture.report.threejs.texture_loader.url = null;
    fixture.report.threejs.texture_loader.url_expression = "atlasUrl";
    fixture.report.threejs.snippets.factory = fixture.report.threejs.snippets.factory
      .replace("async function createFrameAnimation", 'import atlasUrl from "../assets/hero.png?url";\nasync function createFrameAnimation')
      .replace('loadAsync("/assets/hero/hero.png")', "loadAsync(atlasUrl)");
    await writeReport(root, fixture);
    assert.deepEqual(await runGate(root, fixture.asset), []);

    fixture.report.threejs.snippets.factory = fixture.report.threejs.snippets.factory.replace("loadAsync(atlasUrl)", 'loadAsync("../assets/other.png?url")');
    await writeReport(root, fixture);
    assert((await runGate(root, fixture.asset)).some((message) => message.includes("factory 的 loadAsync 参数必须严格绑定运行时资源")));
    fixture.report.threejs.snippets.factory = fixture.report.threejs.snippets.factory.replace('loadAsync("../assets/other.png?url")', "loadAsync(atlasUrl)");
    await writeReport(root, fixture);
    assert.deepEqual(await runGate(root, fixture.asset), []);

    await rm(join(root, "src/animations/hero.ts"));
    assert((await runGate(root, fixture.asset)).some((message) => message.includes("runtime_binding.importer 文件不存在")));
  });
});

test("网页预览中的陈旧 SHA meta 不阻断有效 HTML", async () => {
  await withFixture(async (root, fixture) => {
    const badPreview = Buffer.from("<html><head><meta name=\"threejs-atlas-sha256\" content=\"sha256:" + "0".repeat(64) + "\"></head></html>");
    await writeFile(join(root, fixture.asset.frame_animation.preview.file), badPreview);
    fixture.asset.frame_animation.preview.sha256 = sha256Bytes(badPreview);
    assert.deepEqual(await runGate(root, fixture.asset), []);
  });
});

/** 区域必须使用完整的安全整数像素，避免越界和隐式坐标修正。 */
test("静态合同拒绝缺项、负数、零尺寸和非整数区域", () => {
  const invalidRegions = [
    null,
    {},
    { x: 0, y: 0, width: 4 },
    { x: -1, y: 0, width: 4, height: 4 },
    { x: 0, y: 0.5, width: 4, height: 4 },
    { x: 0, y: 0, width: 0, height: 4 },
    { x: 0, y: 0, width: "4", height: 4 },
    { x: Number.MAX_SAFE_INTEGER + 1, y: 0, width: 4, height: 4 },
  ];
  for (const region of invalidRegions) {
    const { asset } = buildFixtureFiles();
    asset.frame_animation.settings.region = region;
    assert(validateFrameAnimationWorkflowContract(asset.frame_animation).some((message) => message.includes("settings.region")));
  }
});

/** 同一视频的裁剪区域可以远大于输出 cell，文件门核对各自职责。 */
test("区域坐标、源尺寸与独立输出尺寸一致时通过文件门", async () => {
  await withFixture(async (root, fixture) => {
    bindFixtureRegion(fixture);
    await writeReport(root, fixture);
    assert.deepEqual(await runGate(root, fixture.asset), []);
  });
});

/** 共享视频的 SHA 相同不足以区分动画，区域也必须与清单绑定一致。 */
test("文件门拒绝清单、输入报告与抽帧设置的区域不一致", async () => {
  for (const target of ["input", "settings"]) {
    await withFixture(async (root, fixture) => {
      bindFixtureRegion(fixture);
      fixture.report[target].region.x += 1;
      await writeReport(root, fixture);
      const errors = await runGate(root, fixture.asset);
      assert(errors.some((message) => message.includes(target + ".region") && message.includes("settings.region")));
    });
  }
});

/** 任一侧有裁剪时都要完整记录，防止遗漏区域后冒用另一动画的产物。 */
test("区域模式不能遗漏清单或报告的区域绑定", async () => {
  for (const target of ["manifest", "input", "settings"]) {
    await withFixture(async (root, fixture) => {
      bindFixtureRegion(fixture);
      if (target === "manifest") delete fixture.asset.frame_animation.settings.region;
      else delete fixture.report[target].region;
      await writeReport(root, fixture);
      const errors = await runGate(root, fixture.asset);
      assert(errors.some((message) => message.includes("region")));
    });
  }
});

/** 裁剪框以自动旋转后的显示画布为准，不能套用编码前宽高。 */
test("区域必须位于报告的真实显示画布内", async () => {
  for (const mutation of [
    (fixture) => { fixture.report.input.display_width = 200; },
    (fixture) => { fixture.report.input.display_height = 100; },
    (fixture) => { delete fixture.report.input.display_width; },
    (fixture) => { fixture.report.input.region.height = 0; },
  ]) {
    await withFixture(async (root, fixture) => {
      bindFixtureRegion(fixture);
      mutation(fixture);
      await writeReport(root, fixture);
      const errors = await runGate(root, fixture.asset);
      assert(errors.some((message) => message.includes("input.region") || message.includes("display_")));
    });
  }
});

/** 动画根可位于区域中心或半像素位置，但必须是有限且完整的局部坐标。 */
test("静态合同拒绝无效局部锚点", () => {
  for (const anchor of [null, {}, { x: -1, y: 0 }, { x: 1, y: Infinity }, { x: "1", y: 2 }]) {
    const { asset } = buildFixtureFiles();
    asset.frame_animation.settings.anchor = anchor;
    assert(validateFrameAnimationWorkflowContract(asset.frame_animation).some((message) => message.includes("settings.anchor")));
  }
});

/** 用坐标变换验收锚点，避免文件格式通过而 ThreeJS 绑定留白边缘。 */
test("文件门检查局部锚点与缩放留白的实际变换", async () => {
  await withFixture(async (root, fixture) => {
    bindFixtureAnchor(fixture);
    await writeReport(root, fixture);
    assert.deepEqual(await runGate(root, fixture.asset), []);
    fixture.report.cell.target_anchor.y = 4;
    fixture.report.threejs.sprite.center.y = 0;
    fixture.report.threejs.sprite.center.target_anchor.y = 4;
    await writeReport(root, fixture);
    assert((await runGate(root, fixture.asset)).some((message) => message.includes("target_anchor") && message.includes("变换")));
  });
});

/** 清单、报告和实际内容矩形均参与绑定，不能单独改声明隐藏锚点漂移。 */
test("局部锚点绑定不能缺失、越界或与缩放内容不一致", async () => {
  for (const mutation of [
    (fixture) => { fixture.report.input.anchor.x += 1; },
    (fixture) => { delete fixture.report.settings.anchor; },
    (fixture) => { delete fixture.asset.frame_animation.settings.anchor; },
    (fixture) => { fixture.report.cell.source_anchor.y = 100; },
    (fixture) => { fixture.report.cell.content_rect.height = 5; },
    (fixture) => { delete fixture.report.cell.source_anchor; },
  ]) {
    await withFixture(async (root, fixture) => {
      bindFixtureAnchor(fixture);
      mutation(fixture);
      await writeReport(root, fixture);
      assert((await runGate(root, fixture.asset)).some((message) => message.includes("anchor") || message.includes("content_rect")));
    });
  }
});

/** 每份报告都须记录缩放布局，不能删掉字段绕过默认根点的变换校验。 */
test("整画布和区域报告均不能省略源锚点及内容矩形", async () => {
  for (const useRegion of [false, true]) {
    await withFixture(async (root, fixture) => {
      if (useRegion) bindFixtureRegion(fixture);
      delete fixture.report.cell.source_anchor;
      delete fixture.report.cell.content_rect;
      await writeReport(root, fixture);
      const errors = await runGate(root, fixture.asset);
      assert(errors.some((message) => message.includes("source_anchor")));
      assert(errors.some((message) => message.includes("content_rect")));
    });
  }
});

/** 未声明自定义根点时，即使目标点和 ThreeJS origin 自洽也不能替换默认根点。 */
test("默认源锚点必须绑定区域或整画布的底部中心", async () => {
  for (const useRegion of [false, true]) {
    await withFixture(async (root, fixture) => {
      if (useRegion) bindFixtureRegion(fixture);
      fixture.report.cell.source_anchor.y = 0;
      const target = fixture.report.cell.target_anchor;
      target.y = fixture.report.cell.content_rect.y;
      fixture.report.threejs.sprite.center.y = 1 - target.y / fixture.report.cell.height;
      fixture.report.threejs.sprite.center.target_anchor.y = target.y;
      await writeReport(root, fixture);
      assert((await runGate(root, fixture.asset)).some((message) => message.includes("source_anchor") && message.includes("默认")));
    });
  }
});
