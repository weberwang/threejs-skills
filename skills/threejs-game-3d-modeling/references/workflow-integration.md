# 建模工作流与 three.js 接入

3D 几何建模沿用现有 Work Item、Implementation Package、资源清单、控制面和 V0–V4 阶段。本技能不新增 Work Item、状态、Schema 或确认流程；结论、文件变化和证据写回当前工作项。

## V0–V4 范围

| 阶段 | 静态几何工作的范围 |
| --- | --- |
| V0 | 分类当前 3D 输入是运行时模型，还是仅用于烘焙装饰背景的可编辑源。运行时模型沿用 `authored-model` / `gltf-model` 与 `gameplay-environment`；只有当前 Work Item 明确要求烘焙装饰背景时，运行输出才沿用 `decorative-full-bleed`，`.blend` 只作为可编辑源，不冒充运行 GLB。已冻结 `image_generation_required=true` 的区域不得由 3D 替代。 |
| V1 | 绑定资源身份、视觉/玩法用途、结构与观看要求、米制/Y-up 与前向轴、Pivot、预算、槽位、按需的 LOD/碰撞、来源/许可和正式输出位置。 |
| V2 | 确定建模路线；仅在核对比例、轮廓或玩法空间有帮助时制作隔离 blockout。它仍是中间候选，不计为正式模型。 |
| V3 | Blender MCP 制作正式静态几何，检查拓扑/法线/实际 UV/槽位及适用的 LOD/碰撞。运行模型导出并回读自包含 GLB、更新模型清单及运行 `validate-model.mjs`；仅烘焙背景源不要求 GLB，以 `decorative-full-bleed` 路线产出和回读最终图片。两种路线均提交适用的几何技术报告和用户人工检查。静态脚本只证明其容器、结构和预算元数据检查范围，不证明真实几何质量。 |
| V4 | 运行模型由现有模型管线在正式 three.js 场景证明 GLB 被 `GLTFLoader` 实际加载和消费，并完成相应视觉、碰撞、LOD 或玩法检查。仅烘焙背景沿最终图片的既有消费路线验收，不要求 GLTFLoader；模型或源资源回读不能替代各自路线的消费证据。 |

人工检查包含在现有 V3 交付与工作项验收中，不为模型再增加独立审批阶段。需要视觉展示时提供实际候选和检查要点供用户人工核对；不自动分析截图或自行判定视觉通过，真机验收按用户明确授权执行。

## 资源登记与路径

- 运行时模型复用现有模型管线的 `production_method=authored-model`、`delivery_kind=gltf-model` 和模型清单，并使用 `gameplay-environment` route；GLB 不属于二维 `sceneVisualRouteAnalysis`，不得塞入 effect-image 的图片资产或原生绘制路线。仅烘焙装饰背景沿用既有 `decorative-full-bleed` 输出，不能把源 `.blend` 登记成运行 GLB；冻结要求图像生成的区域也不能改用 3D。
- 清单中的 `texture_key` 是通用唯一登记键；模型可用 `model.<asset-id>`，它不表示必须附带纹理。模型伴随的真实贴图按现有图像资源合同单独登记。
- `docs/visual-assets.json` 的资源条目 `status=accepted` 时，按该清单现有结构提供真实来源文件 (`source_file`/`source_files`)、许可 (`license_record`)、非空 `runtime_outputs`、`threejs_evidence`、`gameplay_visual_evidence` 和非空 `consistency_evidence` 路径列表。`threejs_evidence` 指向包含适用模型清单和专项技术报告的实际证据；玩法视觉证据绑定对应消费上下文。所有记录须对应当前模型候选，不能用占位内容补齐。它与 `validate-model.mjs` 使用的模型清单是两份用途不同的清单；沿用既有字段与验收范围，不增加 Schema 或自动全局模型门。
- 运行 GLB 的模型清单 `asset.sceneId` 必须匹配 GLB 内部唯一的 `scene.name`；它不是游戏场景归属。`docs/visual-assets.json` 资源条目中的 `scene_id` 独立标识所属游戏场景，不要将 glTF 内部 scene 名抄作游戏 `scene_id`。仅烘焙背景源没有 GLB 模型条目时，不要求 `asset.sceneId`。
- 正式资源与源文件遵循[产物目录与归档规范](../../threejs-game-architecture/references/artifact-storage.md)：源 `.blend` 存于 `assets-source/<owner>/<asset-id>/<version>/`，正式 GLB 存于稳定的 `public/assets/<owner>/models/`，例如 `public/assets/scenes/<scene-id>/models/<asset-id>.glb`。候选、审阅图和验证报告存入当前规范指定的保留目录，不把临时输出当成正式消费路径。
- 仅当资源清单或当前任务需要显式文件到运行地址的绑定时，才复用[运行资源路径绑定](../../threejs-game-asset-integration/references/runtime-resource-binding.md)中的 `runtime_bindings` 约定。不得新增模型专用字段或把磁盘路径伪装成浏览器 URL。正式运行消费者按模型清单/显式绑定解析 GLB，并由现有 three.js 加载路径消费。

将 `validate-model.mjs` 等实际核验命令写入 `ImplementationPackage.executionUnits[].acceptanceCommands` 对应的实施单元。执行命令时把机器输出报告放入当前 Work Item 的 `evidenceRoot`，并通过现有 Evidence Manifest 的 `commands[].outputFile` 与 `files[]` 登记；领域模型专项报告按其原有领域路径保存，在机器证据中引用，不能填入超出 `evidenceRoot` 的路径。沿用既有证据结构，不创建模型专用命令或全局验收门。

模型身份、输出和质量以项目现有清单、Blender/GLTFLoader 实际回读和模型级报告为准。
