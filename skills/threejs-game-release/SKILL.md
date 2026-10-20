---
name: threejs-game-release
description: three.js Web 3D 游戏的发布与合规角色。需要为浏览器、小游戏、实际采用的原生宿主或新增渠道准备构建、商店资料、隐私、资源授权、提审清单和发布候选包时使用。
---

# three.js 发布与合规

## 全局控制接入

控制面边界：可提议、可审查、可在当前用户任务的发布 Work Item 范围内准备，且必须回到 `$threejs-game-workflow-control` 审计和状态迁移；A5/A6 外部、真机与发布操作逐对象请求批准。

发布必须创建独立 Work Item。`threejs-build-upload`、`threejs-backend-config`、`threejs-channel-config` 为 A5；`threejs-device-test`、`threejs-store-submit`、`threejs-release`、`threejs-game-rollback` 为 A6，先由 [`threejs-game-workflow-control`](../threejs-game-workflow-control/SKILL.md) 校验精确游戏目标和 F4 审批。Git、GitHub Release、消息和通用第三方 API 不属于此生命周期控制面。

准备可提审交付物不等于已经提交或上架。账号、签名密钥、令牌和个人数据只可放在受控外部密钥系统。

读取独立发布 Work Item、平台矩阵、资源登记、测试计划和发布清单。F0 校验任务范围与流程，F1 校验候选与发布规格，F2 完成 QA/技术/合规领域质量，F3 绑定工程证据，F4 只决定记录中明确的外部对象和发布动作。

1. 按项目实际采用的浏览器、小游戏或原生渠道核对打包、版本、图标截图、描述、隐私、分级、广告或内购披露、数据收集与账号删除要求，不为未采用的宿主创建占位工程。
2. 新渠道先新增独立平台矩阵行，完成适配、资料、合规和测试评审后再纳入候选。
3. 从可复现的实际候选和实际执行的构建命令生成候选包，使版本、候选文件与测试证据对应。候选 SHA、包哈希仅作可选追踪，不要求填写或匹配，不阻断发布工作项验收；摘要核对留到最终人工验收后处理。共享基础和关键玩法流证据只能证明各自范围；G3/release 必须执行完整渠道/平台矩阵，不得自动发起真机验收。
   按[生产构建压缩与发布检查](../threejs-game-architecture/references/production-build.md)核对实际 Terser 配置与最终候选，使用产物检查器检查公开目录和已解包渠道 Web 资源；Source Map 文件、内联映射或映射引用未清除时不得交付发布候选。部署响应头与真实运行证据分别核对，不以压缩检查替代。
4. 涉及 API 或生产服务时核对契约版本、认证授权、幂等/重试/超时、客户端兼容、迁移/回滚、测试、部署监控和备份恢复；服务端不在范围时只核对外部依赖、所有者和客户端边界。
5. 在平台矩阵和发布清单登记候选包、完成项、阻断项、风险与建议，向总控提交只读 F2 结论；只有总控可写任务 `review.md`。F3 不自动合并或发布，未获 G3 明确放行不得声称可以提交或已经上架。
