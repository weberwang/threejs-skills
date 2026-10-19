---
name: threejs-game-plugins
description: 为 three.js 游戏选择与接入物理、碰撞查询、导航、模型压缩和后处理插件；用于实际玩法超出 three.js 渲染能力或需要降低资源与运行成本时。
---

# 游戏插件方案

在当前 Work Item 内提议、审查并修改依赖，完成后回到 [threejs-game-workflow-control](../threejs-game-workflow-control/SKILL.md) 审计。用户允许必备插件时，可安装经需求证明必要的依赖；不默认开启付费、外部服务或发布。

先读 [能力与接入表](references/plugin-plan.md)，按玩法选择最小集合。three/addons 与 three 必须来自同一锁定版本；开发工具不进入运行包。每项采用的能力记录用途、精确版本/锁文件、适用 renderer、自身资源创建条件、销毁责任、包体/内存预算和验证命令。

项目采用的 SDK 按[SDK 单文件独立初始化](../threejs-game-architecture/references/sdk-initialization.md)统一在 `src/platform/initialize-sdks.ts` 实现初始化、回调与初始化恢复，各 SDK 之间不建立串行前置。物理世界、解码器等对象自身所需的真实就绪条件仍由对应能力管理，不把它们扩张成所有 SDK 或游戏首帧的启动门。

涉及 Android/iOS 原生宿主或平台能力时，遵循架构 Skill 的[原生平台插件选型](../threejs-game-architecture/SKILL.md#原生平台插件选型)：复用现有插件 → 官方插件 → 社区插件 → 有明确能力缺口的最小自建。版本、权限、许可、生命周期、平台适配层与必要宿主配置以该规则为准。

物理插件接入的验收是固定步、碰撞过滤、运动体类型、坐标单位与暂停恢复；导航是可达性、动态障碍和 NavMesh 更新；模型解码器是实际压缩样本加载和部署路径；后处理是最坏场景 GPU 成本与画质档位。安装成功只证明依赖可解析。

已有 React 项目可选 React Three Fiber 与匹配的 drei；新项目默认直接 three.js。不要同时安装多个承担相同职责的物理引擎、音频库或渲染后处理系统。
