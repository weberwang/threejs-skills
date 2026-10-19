---
name: threejs-game-ad-integration
description: "three.js + Capacitor 移动项目通过 AppLovin 官方 MAX Cordova 原生插件接入聚合广告时使用；指导 iOS/Android 插件集成、Banner、插页与激励视频、全屏广告位静默预加载与 Banner 按需创建、广告位独立加载重试、视频不可用提示与隐私验收，不用于 ThreeJS Web 或小游戏广告实现。"
---

# three.js AppLovin MAX 广告接入

## 适用范围与硬边界

本 Skill 只处理 three.js + TypeScript/Vite + Capacitor 移动项目的 Banner、插页与激励视频广告能力，聚合层固定使用 AppLovin MAX，接入实现固定使用 AppLovin 官方维护的 `cordova-plugin-applovin-max`，由 Capacitor 的 Cordova 兼容层加载。项目只在 TypeScript 侧建立业务门面和官方插件 API 适配，不自建 Android/iOS 广告插件，也不直接集成 MAX 原生 SDK。所有已配置广告位独立维护状态；插页与激励视频只在后台静默预加载，不在初始化阶段主动创建广告对象或视图，插件内部按需管理加载资源。插页与激励视频预加载成功以当前广告实例对象的就绪属性为准，loaded 回调和业务 phase 不能单独证明成功。全屏展示读取实例就绪属性与现有业务状态并立即返回；Banner 不预加载，只在业务请求展示时创建并加载；支持 Banner 且广告位启用、页面允许展示时，在页面首帧前先预留广告区域并完成 UI 布局，不等广告加载或展示。每个广告位独立维护加载失败计数、retry deadline 和至多一个重试 timer，但使用相同分类、退避、暂停和恢复规则。开始任何设计、实施或审查前，必须先读取唯一细则合同 [AppLovin MAX 接入合同](references/applovin-max-contract.md)，并以其中的状态、时序、失败和合规规则为准。

- ThreeJS Web、浏览器预览和小游戏不直接调用 MAX，也不加载原生广告 SDK；广告能力在这些运行目标上必须是明确的 `unsupported`/no-op，调用后立即返回并继续游戏。
- iOS 与 Android 只使用 AppLovin 官方 `cordova-plugin-applovin-max`。实施前必须按[官方 Cordova 集成文档](https://support.applovin.com/en/max/cordova/overview/integration)和[官方仓库](https://github.com/AppLovin/AppLovin-MAX-Cordova)核对插件版本、Capacitor Cordova 兼容层、Android Gradle 与 iOS 包管理器；不兼容时阻断并报告，不回退到社区插件、自建 Capacitor 原生插件或业务代码直连 MAX SDK。
- 本 Skill 不替项目自动配置 MAX 控制台、广告网络账号、商店元数据或发布渠道。SDK key 与 ad unit ID 按环境从受控构建配置注入官方插件适配层，不手写进业务源码、示例、日志或提交记录；广告网络账号凭证与 Ad Review key 不得进入 Web 代码或公开产物。
- 广告只在自然中断点尝试展示；调用方永不等待广告加载、网络请求或展示完成。不可展示时必须按广告位当前状态立即返回结果，不得阻塞场景切换、输入、主循环或结算流程。后台加载、加载失败和重试保持静默，不弹 Toast。
- 视频广告位在用户触发展示但当前不可用，或官方插件接受展示后回调 `displayFailed` 时，通过统一 UI 层弹出一次“视频广告暂不可用，请稍后再试”Toast；不得由插件适配层直接操作 ThreeJS UI，也不得因重复回调重复提示。
- 必须在 MAX 初始化前明确关闭内建 Terms and Privacy Policy Flow，并核对最终 Android/iOS 构建配置不会重新启用；不能仅删除弹窗调用或未经核对就假定默认关闭。官方 Cordova 接口未暴露该流程开关时，通过官方支持的宿主配置取消其 opt-in 启用项，不编造 JS 方法。关闭后仍正常调用 MAX initialize，以真实初始化完成回调确认成功，不以隐私弹窗、CMP、ATT 或 AppsFlyer 的完成作为初始化/重试前置；SDK/所选 CMP 的实际能力限制按合同核对，不能绕过官方必需条件。隐私状态仅控制广告加载与展示，其未完成、失败或用户拒绝不得覆盖已经确认的 MAX 初始化成功；独立隐私方案和真实授权状态仍单独配置。关闭方式与最终配置核对见[接入合同](references/applovin-max-contract.md#初始化与隐私独立编排)。
- MAX 与项目其他已采用 SDK 的初始化、完成回调、幂等和初始化重试统一写在 `src/platform/initialize-sdks.ts`，遵循[SDK 单文件独立初始化](../threejs-game-architecture/references/sdk-initialization.md)。MAX 不等待其他 SDK，也不在成功回调里启动其他 SDK；广告服务只消费其初始化结果并管理广告位，不再持有第二套初始化请求或重试状态。
- 每次创建新的 MAX SDK 实例时，在该实例首次实际 initialize 前手动调用官方 `AppLovinMAX.setHasUserConsent(false)`，不能只写本地变量或依赖默认值。该值是 SDK 隐私配置，不是广告开关；不得因 `false` 把 privacy gate 置为 pending/blocked、跳过插页/激励预加载、阻止 Banner 按需加载、暂停加载重试或拒绝展示。SDK 已就绪且其他实际条件满足时照常请求广告，由 SDK/adapter 按该配置处理；不承诺填充，也不把值改成 true 来绕过真实失败。设置 false 与关闭内建流程分别执行，不能互相代替。
- 本 Skill 中有效初始化配置必须包含已核实的独立时序资格：“隐私未决仍初始化”和相关重试规则仅适用于官方支持的 SDK/CMP 组合。官方要求自有 CMP 前置而当前组合不满足独立时序时，MAX 返回配置阻断，不调用 initialize、不安排自动重试，也不等待 CMP 或 AppsFlyer；记录具体限制后按当前任务解决，其他 SDK 与游戏继续。该配置阻断不能从用户拒绝同意或 ATT 状态本身推断。
- 项目启用 AppsFlyer 时，其初始化与实际启动使用统一文件中的独立任务；不能挂在 MAX 初始化、内建隐私流程或广告加载回调下，MAX 失败或不回调不影响 AppsFlyer 启动，AppsFlyer 失败或不回调也不阻止 MAX。该规则不要求未采用 AppsFlyer 的项目额外安装 SDK。
- Banner 不参与初始化预加载；首次请求展示时才创建原生视图并加载，调用立即返回。收到 loaded 且布局安全、业务仍请求可见时显示；创建或加载失败均保持隐藏并按同一独立退避持续重试；离开展示场景清除可见请求并取消重试，旧回调不得恢复创建或显示。不弹 Toast、不占用错误高度、不等待加载。

## 全局控制接入

[`$threejs-game-workflow-control`](../threejs-game-workflow-control/SKILL.md) 是唯一的全局状态、风险门、任务范围和证据控制面。本领域可以在当前 Work Item、冻结的 Implementation Package、A 等级与路径范围内提出方案、审查现状并实施；所有计划、变更、测试证据和阻断项必须回到控制面登记和复核。任务内调整接口、路径或验证范围时同步更新 Work Item，不另建平行状态机。

涉及外部写入、付费、真实设备、商店提交、发布或不可逆操作的 A4-A6 动作，必须按对象取得控制面明确批准；本 Skill 不代为批准、执行或推送这些动作，也不自动发起真机运行验收。普通本地文档、桥接代码和单元测试按当前任务授权执行。

## 交付流程

1. 读取当前 Work Item、项目 TDD/依赖能力档、Capacitor 平台状态及官方插件安装状态；按 [AppLovin MAX 接入合同](references/applovin-max-contract.md)登记范围、非目标、公开接口、状态所有权、生命周期和失败边界。广告属于可选商业能力，不能把它作为 ThreeJS Web 核心循环的运行前置。
2. 提交最小模块提议：Web/小游戏 no-op、AppLovin 官方 Cordova 插件、共享 TypeScript 业务门面与插件 API 适配器、测试替身。核对官方插件发布版本、许可证、Android/iOS 支持、Capacitor 兼容方式、回调语义和隐私能力；不得提出社区插件或自建原生桥作为备用实现。
3. 冻结插件适配契约：`initialize`、`preload(slotId)`、`tryShow(context)`、`setBannerVisibility(slotId, visible)`、`isReady(slotId)` 均为非阻塞调用并返回结构化结果；适配器把官方插件的 callback/event API 归一化为该契约。MAX 初始化与初始化重试实际实现归入 `src/platform/initialize-sdks.ts`，广告门面只转发到该文件中的 MAX 私有任务。初始化失败进入 `failed`：明确的瞬时故障由该任务按 2/4/8/16/32/64 秒持续退避；后台、离线或宿主条件未满足时暂停，恢复后继续；配置或依赖错误修正后显式重试，不重启其他 SDK。初始化重试与广告服务的广告位加载重试隔离，不混用 timer 或计数。MAX 初始化幂等；支持平台且服务启用、插件配置有效时，必须发起 MAX 初始化，不以其他 SDK、隐私同意、CMP 完成或 ATT 授权作为调用前置。每个广告位只有一个业务状态所有者，原生格式对象由官方插件内部管理。广告服务收到初始化成功结果后立即投递全部启用的插页与激励视频预加载意图，实际加载经过广告请求隐私门；所有已发起的加载失败都由各广告位自己的重试 timer 持续调度，不按错误类别终止、不设次数上限，直到成功；禁用、移除或服务销毁终止重试，运行 gates 关闭仅暂停。各广告位独立保存计数与 deadline，并应用同一套 `2/4/8/16/32/64 秒`退避、抖动、去重、后台/离线暂停和恢复规则。一个广告位取消、重排或触发重试不得改变其他广告位的 timer。
4. 将 MAX 控制台、官方插件及其原生依赖、Capacitor Cordova 兼容配置、独立隐私流程/Google UMP/ATT、广告位配置和遥测分别登记责任人。固定聚合渠道为 AppLovin、Google AdMob、Mintegral、Pangle、Unity Ads、DT Exchange（Fyber）和 Verve（PubNative/HyBid）；插件、MAX SDK 与 adapter 的版本组合以官方插件和官方渠道文档当前声明的兼容范围为准，不在 Skill 或业务代码中写死版本号，也不绕过插件重复引入 MAX SDK。
5. 在自然中断点调用 `tryShow`；调用读取指定广告位当前有效实例的就绪属性和业务快照，绝不触发前台加载。匹配的激励视频 `hidden` 回调到达后，广告服务使用单调时钟记录 30 秒插页保护截止时间；保护期内的插页 `tryShow` 必须立即返回 `rewarded-interstitial-delay`，不得调用 MAX show、创建冷却 timer 或弹不可用 Toast。保护期结束后，只要目标广告位 ready、所有 gates open、自然中断条件成立，就可以发起展示。未 ready、同广告位正在展示、隐私未决、网络不可用或平台不支持都立即返回并继续游戏；视频广告不可用或展示失败时，由统一 UI 层消费结构化结果/事件并显示一次不可用 Toast。激励只由匹配的 `rewarded` 回调异步发放且保持幂等；关闭或展示失败后立即静默预加载对应全屏广告位。
6. 进入可展示 Banner 的页面时，先按当前平台格式、可用宽度和安全区确定预留尺寸与内容 inset，在页面首帧前完成 UI 布局；布局规划不创建广告视图、不请求广告。Banner 展示时只放入预留区域，不调整游戏 UI；实际尺寸无法安全容纳时保持隐藏，在下一次页面或 viewport 布局周期处理。Banner 使用原生广告视图；业务只控制显隐，不自行创建刷新 timer。隐藏、切后台或页面不允许广告时暂停刷新，恢复显示时按合同恢复；不得覆盖游戏按钮、手势区、系统安全区或把空白占位当成已加载广告。
7. 先完成静态审查、TypeScript/原生编译和状态机单测，再在已授权的目标环境运行平台集成测试。使用 MAX Test Mode 与 Mediation Debugger 按渠道和格式分别核验，检查 `app-ads.txt`、iOS SKAdNetwork、Google CMP/TCF 及 ATT；不以单一网络或单一格式成功冒充全部通过。
8. 将候选 diff、接口契约、平台日志（脱敏）、失败重试轨迹和验证结果提交给 `$threejs-game-workflow-control`；把未执行的外部配置、真机、实时广告和发布步骤列为明确未覆盖项。

## 最低公开契约

共享门面至少提供以下语义，具体参数命名可按目标项目惯例落地，但不能改变返回时序：

```ts
initialize(config): Promise<InitResult> // 只确认桥接请求受理/初始化状态，不等待隐私流程或广告加载
retryInitialize(): Promise<InitResult>  // 手动入口复用初始化恢复任务，不绕过退避或配置阻断
preload(slotId): Promise<PreloadResult> // 仅插页/激励后台加载；Banner 返回 format-mismatch
isReady(slotId): ReadyResult            // 全屏读取实例就绪属性；Banner 读取加载状态，不创建或加载
tryShow(context): Promise<ShowResult>   // 复核实例就绪属性和业务门，通过后才展示
setBannerVisibility(slotId, visible): Promise<BannerVisibilityResult> // 展示时按需创建/加载，立即返回
```

结果至少包含稳定的 `ok`、`code`、`platform`、`phase`、`gates` 和必要的 `retryScheduled` 字段；插页因激励视频后的 30 秒保护期被跳过时返回 `rewarded-interstitial-delay` 和 `interstitialDelayRemainingMs`。业务调用方只传环境、能力开关和业务 `slotId`；官方插件适配器按环境解析 SDK key 与 MAX ad unit ID，并仅在插件 API 边界使用。不得把插件原始异常、设备 ID、广告网络账号凭证或完整 waterfall 凭证透传到业务层。`tryShow` 返回“已请求展示”不等于已展示成功。

`InitResult`、`PreloadResult`、`ReadyResult`、`ShowResult` 及 `NativeAdEvent` 的最小字段、隐私 gate/结果码、`instanceGeneration`/`showRequestId` 关联和重复事件幂等规则统一以[接入合同](references/applovin-max-contract.md)为准。

## 交付审查清单

- 平台边界：Web/小游戏调用为 no-op；Android/iOS 仅通过 AppLovin 官方 Cordova 插件调用 MAX，未引入社区插件、自建原生广告插件或直接 SDK 接入；宿主页面生命周期、Activity/ViewController 和前后台切换已明确。
- 生命周期：初始化幂等；每个已配置广告位持有业务 phase、加载计数、retry deadline 和至多一个加载重试 timer，格式匹配的原生对象由官方插件管理；广告服务额外持有激励视频结束后的 30 秒插页保护截止时间，但不为此创建 timer。所有广告位共享该跨格式保护状态等服务级门，不共享加载重试 timer，不设置跨广告位全屏互斥；实例重建递增 `instanceGeneration`，展示请求生成唯一 `showRequestId`；成功初始化立刻投递全部启用的插页与激励视频预加载意图，实际加载经过广告请求隐私门，重复调用不会并发请求。
- 原生门：Activity/ViewController provider、前台状态、网络连通性属于初始化与广告请求依赖；privacy readiness 表示实际请求配置及 SDK/平台条件是否满足，不等于 `hasUserConsent=true`。`false` 已正确配置且没有其他独立阻断时应允许请求，不能把 false 或其读取结果当作隐私拒绝码。确有独立的 SDK/平台限制时按实际原因处理；门不控制初始化完成。`phase` 只表示广告资源/展示阶段，门状态独立计算，不混入 ThreeJS 场景状态。
- 节奏：插页只在自然中断点展示；匹配的激励视频 `hidden` 事件从其单调时间戳起阻断插页 30 秒，保护期只阻断插页，不阻断 Banner、激励视频、后台预加载或奖励结算。保护期内立即静默返回剩余毫秒数，过期后无需 timer 唤醒即可恢复判定；`hidden` 与 `displayFailed` 都会触发对应广告位的后台预加载。
- 就绪判断：全屏广告实例的就绪属性是预加载成功的唯一依据；适配器通过官方 isInterstitialReady/isRewardedAdReady 读取插件内部实例状态，不另存独立 ready 布尔值。loaded 仅触发复核；展示与重试前重新读取，实例不存在、失效或读取失败均视为未就绪；Banner 仍按创建后的加载事件管理，不参与预加载。
- 初始化恢复：统一初始化文件中的 MAX 私有任务最多持有一个初始化请求和一个待执行重试 timer，广告服务不另建；瞬时失败持续退避，宿主/前台/网络门关闭保留 deadline，隐私状态不暂停初始化重试，恢复时去重调度；配置错误不自动重试。成功、禁用或销毁清理该初始化恢复任务，成功结果交给广告服务只投递一次全屏预加载意图，广告请求仍检查隐私门，阻断时保留意图待恢复。单独重试 MAX 不重新初始化其他 SDK。
- 失败恢复：每个广告位使用独立加载重试 timer，并遵循同一套退避公式持续重试直到成功，不设次数上限；计数、deadline、timer 引用和 in-flight 标记均按广告位隔离，同一广告位只允许一个待执行 timer。后台或离线时分别暂停，恢复后每个到期广告位最多恢复一次；展示失败独立记录并重新预加载，不进入另一套重试逻辑。
- 用户反馈：后台加载、重试和状态变化保持静默；视频广告展示触发在立即判定不可用或异步 `displayFailed` 时只显示一次本地化不可用 Toast，重复/迟到回调不会重复提示；`rewarded-interstitial-delay` 是预期节奏控制，不显示不可用 Toast。
- Banner：不预加载、不默认创建；首次展示请求创建并加载，创建失败和加载失败共用一个持续退避重试任务；离开展示场景立即取消任务并使旧请求失效，再次进入须重新请求展示；ready 且布局安全后按当前可见请求显示，失败保持隐藏且无 Toast；页面首帧前按平台 Banner 尺寸规则和安全区预留区域，加载、失败、重试与显隐回调不改变内容 inset；实际尺寸只用于验证能否安全放入预留区域，布局不遮挡游戏交互；刷新只有一个所有者，禁止 JS/ThreeJS 自建刷新 timer。
- 合规与安全：独立隐私流程及其 Google UMP/TCF 配置、MAX 隐私标志、iOS ATT、SKAdNetwork、Google 要求和目标地区规则均有责任人和证据；核验 MAX 内建隐私流程在实际初始化配置与最终 Android/iOS 产物中均已关闭，真实初始化回调仍能完成；AppsFlyer 按独立任务启动，不把关闭 MAX 流程等同于同意授权。SDK key 与广告位来自受控的分环境构建配置并仅供官方插件适配器使用，账号凭证与 Ad Review key 不进入 Web 层，遥测脱敏。
- 验证：每个固定网络均在测试模式或 Mediation Debugger 中单独确认 adapter、加载、展示和官方插件失败回调；检查 MAX waterfall、`app-ads.txt` 和发布前平台清单。单测还要覆盖官方插件广告事件永不返回时，结算通过 fire-and-forget 仍继续，以及适配器 Promise 只等待本地受理/拒绝、不等待广告事件。
- 授权值与加载分离：检查真实调用顺序为 `setHasUserConsent(false)` 后才 initialize；收到真实初始化完成信号且其他条件满足时，值保持 false 仍投递全部启用全屏广告位的预加载，并允许 Banner 按需加载、失败后的原有重试及就绪后的展示。只有独立的真实请求限制才阻断，不等待该值变成 true，不恢复 MAX 内建隐私流程，AppsFlyer 继续独立启动。

本仓库本次只交付 Skill 指导文件，不新增运行时代码、脚本、SDK 依赖或外部配置。
