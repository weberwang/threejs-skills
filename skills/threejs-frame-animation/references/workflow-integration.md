# 视频抽帧工作流接入合同

帧动画以视频抽帧得到初始帧，不采用首末帧递归插帧路线。视频只作为动作流程草图；抽帧后允许直接修正图片中的动作和外观，最终帧动画以游戏要求为准。全局视觉阶段仍是 V0→V5，动画任务内部按下表推进，不改写全局 `visualStage`。

| 步骤 | 产物 | 停止条件 |
| --- | --- | --- |
| 收集要求 | 动作、镜头、时长、循环、画幅、背景、FPS、输出尺寸 | 缺少决定性要求时明确标出假设 |
| 写视频提示词 | 可直接用于视频生成器的文本文件 | 交付提示词后等待真实视频文件 |
| 接收视频 | 原视频文件及内容检查 | 文件不存在或无法解码时不抽帧 |
| 抽帧与图集 | 固定 cell 的 PNG 图集、JSON 报告、HTML 预览 | 按 FPS、尺寸、是否去背景生成，参数变化要重做 |
| 审阅与接入 | 浏览器播放审阅、ThreeJS 合同 | 动作和外观问题均修对应图片并更新图集与证据；最终动画按游戏要求验收；运行态在全局 V5 验证 |

## 视频提示词

提示词必须以当前游戏项目的视觉基线和玩法为依据，写出资源用途、游戏视角、角色或物件的既有造型、游戏内显示尺寸、动作状态、玩法生效时刻、循环或终态、固定镜头与语义根锚点。独立精灵不混入 UI、文字、额外角色或场景背景；场景动画则遵循场景图层合同。动作轮廓与关键事件须在目标显示尺寸和抽帧 FPS 下可读。提示词中要求呈现的主体、部件、道具、特效和完整运动范围都必须位于安全边距内，默认禁止任何裁剪；只有用户明确允许时，才能逐项指定可裁剪内容和范围。收到视频后记录动作、姿态、时机与裁剪缺陷，作为抽帧后修正对应图片的依据，不因视频动作有问题退回生成。还须写出时长、画幅、背景处理，以及不允许的闪烁、跳切、变形、漂移和遮挡。若计划移除背景，要求高对比纯色背景，避免主体、道具、半透明特效与背景色混同。提示词是生产输入，不能替代视频内容检查。

## accepted 资源文件门

`asset.frame_animation` 绑定本次提示词、真实视频、抽帧报告、网页预览和 spritesheet 的项目内路径与 SHA。文件门复算 SHA，并核对报告中视频 SHA、抽帧 FPS、帧数、cell 尺寸、去背景配置、图集尺寸与 three.js 帧范围。图集必须位于 `asset.runtime_outputs`，`spritesheet.runtime_url` 必须与报告的 `threejs.texture_loader.url` 相同。

合同使用 `threejs-video-atlas-workflow/1`，必需字段示例：

```json
{
  "schema": "threejs-video-atlas-workflow/1",
  "status": "accepted",
  "work_item_id": "work-item-hero-attack",
  "candidate_version": "candidate-hero-attack-v1",
  "settings": { "fps": 12, "width": 128, "height": 128, "remove_background": true },
  "video_prompt": { "file": "evidence/hero-attack.prompt.txt", "sha256": "sha256:<64位十六进制>" },
  "source_video": { "file": "art/hero/attack.mp4", "sha256": "sha256:<64位十六进制>" },
  "quality_report": { "file": "evidence/hero-attack.video-atlas.json", "sha256": "sha256:<64位十六进制>" },
  "preview": { "file": "evidence/hero-attack.preview.html", "sha256": "sha256:<64位十六进制>" },
  "spritesheet": { "file": "public/assets/hero-attack.png", "runtime_url": "assets/hero-attack.png", "sha256": "sha256:<64位十六进制>" }
}
```

`settings` 与报告中的抽帧参数和最终 cell 尺寸逐项匹配。以上 SHA 占位符须替换为真实文件摘要，不能原样写入资源清单。

帧数由视频时长和目标 FPS 决定，不再要求 `3、5、9、17…`。替换视频或调整抽样 FPS、输出尺寸时重新抽帧并审阅；视频只作为动作流程草图，修改提示词或发现动作错误都不默认重新生成视频。背景与外观修正优先直接处理抽帧图片。

抽帧报告使用 `threejs-video-atlas/2`。`threejs.texture_loader` 声明 `THREE.TextureLoader.loadAsync` 和实际运行 URL；`threejs.atlas_uv` 以 `repeat.x = 1 / frame_count`、`offset.x = frameIndex / frame_count` 描述水平帧；`threejs.sprite.center` 把源图像左上坐标锚点转换为 Sprite 的左下归一化坐标。报告中的 `threejs.snippets.factory` 是可直接放入 ES module 的 three.js 示例，调用时传入项目选择的 `worldUnitsPerPixel`，返回可逐帧 `update(deltaSeconds)` 的 Sprite 动画对象，并保持 cell 宽高比；非循环动画完整播放后停留在最后一帧。

## 抽帧后的动作与图片修正

- 视频只提供动作流程草图的期望，不作为最终正确动作的硬约束。抽帧后不论动作还是外观有问题，都直接修正对应图片或图集 cell；只有用户要求更换草图来源时才替换视频。
- 动作修正包括姿态、动作轨迹、朝向、起手/命中/收势与循环衔接；外观修正包括造型、颜色、背景残留、透明边缘、局部缺陷和锚点对齐。按修改范围检查相邻帧，保留可用帧，以最终游戏动作要求而非视频中的错误验收。
- 保留真实原视频及初始抽帧来源记录，来源身份不代表最终动作必须与视频相同。图片修正保持当前帧索引、帧数、FPS、cell 尺寸与锚点合同；若这些配置也需调整，实际更新产物与合同，不能只修改声明。抽样参数错误可使用同一视频重抽，但不能覆盖已完成的修图而不保留修正成果。
- 修改实际图片后重组最终图集，复算 `quality_report.artifacts.sheet.sha256`，更新预览内的 `threejs-atlas-sha256` 和资源合同中的图集、报告、预览文件 SHA；重新审阅逐帧显示、动作连续性、关键时刻和首尾衔接。原 `source_video.sha256`、报告的 `input.video_sha256` 与每帧 `source_sha256` 仍记录初始来源，不能伪装成修改后的图片 SHA。
- 在修正记录中列出实际修改帧索引、动作或外观问题、处理方法和修正前后文件身份。图片改动使旧图集验收失效，完成更新与复核后再提交 accepted；不能只改报告而不处理实际图片。

提示词交付或网页审阅只覆盖本次资源候选；外部系统写入、真机运行、发布和付费仍遵循全局控制面的独立授权。
