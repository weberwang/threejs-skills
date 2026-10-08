# AppLovin MAX 广告接入合同

本文件是 `threejs-game-ad-integration` 的唯一详细运行合同。它约束 three.js + Capacitor 移动项目通过 AppLovin 官方 MAX Cordova 原生插件接入 Banner、插页与激励视频广告：平台边界、插件职责、网络集合、状态、公开接口、静默预加载、广告位独立加载重试、Banner 布局与刷新、视频不可用提示、奖励、隐私、遥测和验收。实施时必须核对[官方 Cordova 集成文档](https://support.applovin.com/en/max/cordova/overview/integration)和[官方插件仓库](https://github.com/AppLovin/AppLovin-MAX-Cordova)；官方页面更新时，以当前页面、官方插件发布物和项目已批准的实现包为准，不把本文件当作 SDK 版本或法律意见。

## 不变量与平台边界

- ThreeJS Web、浏览器预览、小游戏和其他没有原生 MAX 容器的目标不直接调用 MAX、不导入原生 SDK，也不发起网络广告请求。共享 TypeScript 门面在这些目标上返回结构化 `unsupported-platform` no-op，并立即让游戏继续。
- iOS 与 Android 仅通过 AppLovin 官方 `cordova-plugin-applovin-max` 调用 MAX；Capacitor 使用其 Cordova 兼容层加载插件。ThreeJS 场景只能调用共享 TypeScript 门面，不能直接触碰官方插件全局对象、Activity、ViewController、MAX 原生对象或任何网络 SDK。
- 项目不得改用社区广告插件、自建 Capacitor 原生广告插件或直接集成 Android/iOS MAX SDK。实施前核对官方插件版本与当前 Capacitor、Android Gradle、iOS CocoaPods/Swift Package Manager 路径的兼容性；任一目标平台不兼容时标记阻断并回到 Work Item 决策，不静默切换实现路线。
- 所有已启用广告位都在初始化成功后后台静默预加载；加载、重试和展示回调均走后台/事件驱动路径。游戏主循环、输入、场景切换和结算不得等待广告加载、网络响应、CMP、展示或隐藏；展示触发只读取当前状态并快速返回，不能在触发路径临时 load。
- 任何平台只允许一个广告服务实例和一个官方插件接入实例。每个广告位持有独立业务状态和至多一个加载重试 timer，格式匹配的 MAX 原生对象由官方插件内部管理；所有广告位只共用全屏展示仲裁器和激励视频结束后的插页保护截止时间等服务级状态，不共用加载重试 timer。重复初始化、预加载、展示请求或插件回调不能造成同广告位并发 load、递归回调或多套退避机制。
- 加载失败、无填充和后台重试始终静默，不弹 Toast。视频广告触发时已不可用，或展示请求发出后收到 `displayFailed`，必须由共享 UI 层显示一次本地化“视频广告暂不可用，请稍后再试”Toast；重复和迟到事件不得重复提示。
- Banner 使用原生 MAX ad view，创建后默认隐藏并静默加载。只有收到 `loaded` 且布局已确认安全时才能显示；未 ready、加载失败或布局不可用时保持隐藏并立即返回，不弹 Toast，也不让空白广告位阻塞或覆盖游戏。

## 固定聚合网络与别名

以下七项是本合同的固定集合。`canonical` 用于代码和遥测的稳定分类；控制台显示名、adapter 名称和区域要求必须按 AppLovin 当前页面核对。

| canonical | MAX/控制台常见名称 | 别名与注意事项 |
| --- | --- | --- |
| `applovin` | AppLovin / AppLovin Exchange 或 AppLovin Bidding | MAX 自有需求；不另接一个“AppLovin adapter”来代替 SDK 初始化。 |
| `admob` | Google Bidding and Google AdMob | Google AdMob 是同一项固定渠道；不要把 Google Ad Manager 误加入本次集合。 |
| `mintegral` | Mintegral | 以官方 MAX Mintegral adapter 与当前隐私说明为准。 |
| `pangle` | Pangle | ByteDance 相关名称可能出现在 SDK/adapter 资料中；国家、地区、商店和流量限制必须按官方当前要求逐项配置，不预设地区规则。 |
| `unity` | Unity Ads | 使用 MAX 的 Unity Ads adapter，不把 Unity 游戏插件或 Unity 引擎依赖带入 ThreeJS 项目。 |
| `dt-exchange` | DT Exchange | Fyber 是历史/常用别名；本合同只计为一个渠道，不重复接入。 |
| `verve` | Verve | PubNative、HyBid 是历史/产品别名；本合同只计为一个渠道。 |

固定集合不代表每个平台、国家或广告格式都一定有填充。适配器在 Android 与 iOS 的可用性、支持的竞价方式、SDK 要求和区域限制必须分别从官方当前文档核对并记录；缺少支持证据时，将该平台/网络标为 `not-supported`，不能用自定义网络假装已接入。

## 三方职责分离

### MAX 控制台

MAX 控制台负责以下外部配置，由账号/变现责任人执行并留存脱敏证据：

1. 按平台登记 Android package name、iOS bundle ID 和商店信息，并为每个 Banner、插页和激励视频广告位创建格式正确的 ad unit。每个平台、格式和业务广告位使用清晰稳定的标识，避免共享状态或混用测试与生产。
2. 在 `Mediation > Manage > Networks` 连接并启用固定七项渠道，填写各渠道要求的账号、API key、placement 或应用信息；把渠道加入对应 waterfall，并按需启用 bidding/auto-CPM。
3. 创建测试设备、选择 Test Mode、导出或查看 Mediation Debugger 结果，并在发布前确认 `app-ads.txt`。
4. 记录控制台环境、平台、ad unit 所属 Work Item 和责任人。SDK key 与 ad unit ID 由分环境构建配置注入官方插件适配器，不手写进业务源码、示例、公开文档、遥测或本仓库；广告网络账号凭证不得进入客户端。

本 Skill 不自动登录、写入或修改 MAX 控制台，也不自动创建网络账号、placement、waterfall、`app-ads.txt` 或商店资料；这类外部动作按 [`$threejs-game-workflow-control`](../../threejs-game-workflow-control/SKILL.md) 的对象级边界处理。

### 官方原生插件与依赖

项目安装 AppLovin 官方发布的 `cordova-plugin-applovin-max`，通过 Capacitor Cordova 兼容层同步到 Android/iOS。MAX Android/iOS SDK 的基础版本由官方插件声明，项目不得再手工添加另一份 MAX SDK；各 mediated network adapter 按 AppLovin Cordova 渠道文档接入，并与插件锁定的 MAX SDK 版本匹配。

本合同不写死插件、SDK、adapter 或第三方网络 SDK 版本，也不允许无约束的版本通配。实施时在项目依赖锁与变更记录中固定已核实的官方插件版本，记录其传递引入的 MAX SDK 版本、官方页面、发布日期和 Capacitor 双平台兼容性证据；不得改名、重打包或替换官方插件及 MAX 识别所需的 adapter 包名。Pangle 的区域配置、Android/iOS 差异和必要参数以 AppLovin 当前 Pangle 章节为准。

### Capacitor 官方插件适配层

TypeScript 适配层只封装 AppLovin 官方插件公开 API 并归一化事件，不实现新的原生桥：

- 接收共享门面的初始化、按广告位预加载、状态查询和展示请求；验证运行平台、生命周期、隐私状态、业务 `slotId` 和环境配置后，将 `slotId` 映射为 MAX ad unit ID，再调用官方插件对应 API。
- 把官方插件的初始化、load、display、hidden、reward、Banner expand/collapse、click 和 failure callback/event 映射成稳定事件与结构化结果；插件错误对象只提取稳定分类与数值码，原始消息不得直接进入业务 UI 或遥测。
- 保存服务实例、每广告位状态和独立加载重试 timer；不把平台对象、原始 SDK 类、网络凭证、MAX waterfall 或设备标识返回 Web 层。
- 在 Android 绑定当前有效 Activity，在 iOS 绑定当前有效 ViewController；后台、恢复、销毁和重复回调都必须有明确处理。不存在有效宿主时立即返回 `no-host`，不阻塞等待。

SDK key 与 MAX ad unit ID 是官方插件 API 所需的客户端配置，由生成式、分环境构建配置注入插件适配器并按 debug/test/release 隔离；业务场景只使用 `slotId`，不得直接持有这些值。它们不得写入手工维护的业务源码、示例、日志、遥测或版本库。广告网络账号凭证、Ad Review key 和服务器 API key 属于秘密，只能留在对应控制台、CI 秘密或原生构建配置，绝不传给 Web/ThreeJS 层。

## 平台行为矩阵

| 运行目标 | 初始化/预加载 | 状态/触发 |
| --- | --- | --- |
| ThreeJS Web / 浏览器 | 立即返回 `unsupported-platform`，不调用 MAX | `isReady=false`；全屏展示和 Banner 显隐均立即 no-op |
| 小游戏或其他 Web 容器 | 同上；若平台有独立广告 SDK，另建经批准的 Skill/模块 | 不在本合同内实现或兜底为 no-op |
| Capacitor Android | Capacitor Cordova 兼容层加载官方插件；适配器包装插件异步初始化，完成后静默预加载全部启用广告位 | 全屏只读业务状态后调用官方插件 show；Banner 通过官方插件 API 显隐 |
| Capacitor iOS | 同上；构建前验证官方插件与项目当前 iOS 包管理器路径兼容 | 全屏只读业务状态后调用官方插件 show；Banner 通过官方插件 API 显隐 |

## 公开桥接接口与结构化结果

参数命名可按目标项目约定调整，但不得改变“快速返回、事件最终确认”的语义。适配器可以把官方插件 callback API 包装为 `Promise`；该 `Promise` 只表示本地插件调用已接受或拒绝，不表示广告网络加载、展示或隐藏已经完成，调用方不得等待它来推进游戏流程。业务层只传环境、能力开关、自然中断上下文和 `slotId`；SDK key 与 MAX ad unit ID 由插件适配器从受控构建配置解析，广告网络 placement/账号凭证绝不从 Web 传入。

```ts
initialize(config: InitConfig): Promise<InitResult> // 初始化请求，仅等待本地受理/拒绝
retryInitialize(): Promise<InitResult>        // failed 后的显式初始化重试
preload(slotId: AdSlotId): Promise<PreloadResult> // 发起或复用指定广告位后台加载
isReady(slotId: AdSlotId): ReadyResult        // 读取指定广告位缓存快照，不触发加载
tryShow(context: ShowContext): Promise<ShowResult> // 发起展示请求或立即拒绝
setBannerVisibility(slotId: AdSlotId, visible: boolean): Promise<BannerVisibilityResult>
```

最小类型合同如下；实现可以增加字段，但不能改变字段含义、关联规则和快速返回时序：

```ts
type Platform = "android" | "ios" | "web" | "unsupported";
type AdFormat = "banner" | "interstitial" | "rewarded";
type AdSlotId = string;
type BannerVisibility = "not-applicable" | "hidden" | "visible";
type AdPhase =
  | "unsupported" | "new" | "initializing" | "failed" | "idle"
  | "loading" | "ready" | "showing";
type GateStatus = "open" | "closed" | "unknown";

interface InitConfig {
  environment: "test" | "staging" | "production";
  enabled: boolean;
}

interface ShowContext {
  slotId: AdSlotId;          // 业务广告位标识，不是 MAX ad unit ID
  naturalBreak: boolean;     // false 时立即返回 not-natural-break
}

interface GateSnapshot {
  host: GateStatus;          // Activity/ViewController provider
  foreground: GateStatus;
  connectivity: GateStatus;
  privacy: "ready" | "pending" | "blocked";
  fullscreen: GateStatus;    // 原生 fullscreen arbiter
}

interface AdResult {
  ok: boolean;
  code: string;
  platform: Platform;
  phase: AdPhase;            // 资源/展示 phase，不是 ThreeJS 场景状态
  gates: GateSnapshot;
  instanceGeneration: number;
  slotId?: AdSlotId;
  format?: AdFormat;
  bannerVisibility?: BannerVisibility;
  retryScheduled?: boolean;
}

interface InitResult extends AdResult {
  operation: "initialize" | "retryInitialize";
  accepted: boolean;          // 仅表示本地受理，不表示 MAX 已完成
}
interface PreloadResult extends AdResult {
  operation: "preload";
  accepted: boolean;
}
interface ReadyResult extends AdResult {
  operation: "isReady";
  ready: boolean;
}
interface ShowResult extends AdResult {
  operation: "tryShow";
  accepted: boolean;
  showRequestId?: string;
  interstitialDelayRemainingMs?: number; // 激励视频结束后的插页保护期剩余时间
  noticeCode?: "video-ad-unavailable"; // UI 层本地化并显示一次 Toast
  noticeDedupeKey?: string;             // 立即拒绝时每次触发唯一
}
interface BannerVisibilityResult extends AdResult {
  operation: "setBannerVisibility";
  accepted: boolean;
  visible: boolean;
  widthPx?: number;
  heightPx?: number;
}
```

原生事件必须携带可关联的最小 payload；`displayed`、`displayFailed` 和 `hidden` 必须匹配当前 `instanceGeneration`、`slotId` 与当前展示 `showRequestId`。`rewarded` 必须匹配奖励待决账本中的 generation/slot/request，即使 `hidden` 已到达或后续展示已经开始也仍可结算；没有对应记录的事件才丢弃并记为 `stale-event`：

```ts
interface NativeAdEvent {
  type: "initialized" | "loadStarted" | "loaded" | "loadFailed"
    | "displayed" | "displayFailed" | "hidden" | "rewarded"
    | "bannerExpanded" | "bannerCollapsed" | "bannerSizeChanged"
    | "appBackground" | "appForeground"
    | "networkAvailable" | "networkUnavailable";
  instanceGeneration: number;
  eventId: string;           // 原生回调首次归一化时生成，跨桥重投保持不变
  slotId: AdSlotId | null;  // 初始化和生命周期事件为 null
  format: AdFormat | null;
  showRequestId: string | null; // 初始化、load 和生命周期事件为 null；展示/奖励事件携带关联请求
  loadOperationId?: string;  // 应用主动 load 时由对应广告位的 RetryState 生成
  refreshEpoch?: number;     // Banner auto-refresh 启动代次
  phase: AdPhase;
  monotonicAtMs: number;
  code?: string;
  errorCategory?: string;     // 稳定分类，不是永久 SDK 枚举
  widthPx?: number;           // Banner 自适应尺寸，其他格式不传
  heightPx?: number;
}

interface AdUiNoticeEvent {
  type: "showUiNotice";
  code: "video-ad-unavailable";
  slotId: AdSlotId;
  showRequestId: string | null;
  dedupeKey: string;         // 同一次触发或展示失败只允许消费一次
}
```

服务首次创建时从 `instanceGeneration=0` 开始；实例重建（原生 SDK 重启、宿主切换或配置变更）必须先使旧实例失效，再将 `instanceGeneration` 加一；每次实际展示尝试生成进程内唯一 `showRequestId`。全屏事件按 generation/slot/request 关联：第一次 `rewarded` 才发放奖励，第一次 `displayFailed` 或 `hidden` 才释放展示锁；迟到、重复或跨实例事件不得改变新实例 phase、奖励或计数。激励请求另存于幂等的奖励待决账本，`hidden` 只释放全屏锁，不能删除尚未结算的奖励资格。`interstitialBlockedUntilMonotonicMs` 放在不随 `instanceGeneration` 重建的进程内服务策略状态中；完整销毁广告服务或进程重启时可重新初始化为 `0`，无需跨进程持久化。

所有原生回调另带稳定 `eventId`，同一回调跨桥重投时不得重新生成，以此去重传输层重复。应用主动 load 的回调必须匹配当前 `loadOperationId`；Banner auto-refresh 的回调必须匹配当前活动 `refreshEpoch`。同一 refresh epoch 可以产生多轮合法 `loaded`，不能仅因 generation/slot 相同而丢弃；停止 auto-refresh 时立即使该 epoch 失效，之后到达的旧回调不得进入重试或改变可见性。上述类型中的 `phase` 只描述对应广告位自身，所有 gates 由原生服务依赖计算，不能镜像到 ThreeJS 场景状态。

至少定义下列结果码，并让所有不可展示情况在一次桥接往返内返回：

- `unsupported-platform`：Web/小游戏/no-op。
- `unknown-slot`、`format-mismatch`：广告位不存在或其格式与调用不一致。
- `layout-not-ready`、`banner-visible-conflict`：Banner 尚无安全布局，或当前 viewport 已有另一个可见 Banner。
- `not-initialized`、`initializing`、`privacy-pending`、`privacy-blocked`：初始化或合规前置未完成。
- `not-ready`、`loading`、`already-showing`：当前没有可立即展示的缓存广告，或已有展示请求。
- `background`、`offline`、`no-host`：当前生命周期或网络不适合展示。
- `not-natural-break`：调用点不是明确的自然中断点，不发起展示。
- `rewarded-interstitial-delay`：匹配的激励视频结束后 30 秒内跳过插页展示；返回剩余毫秒数，不产生 UI 提示。
- `request-dispatched`：已向原生 MAX 发起展示请求；这不是展示成功确认。
- `load-started`、`load-in-flight`、`retry-scheduled`：预加载已发起、已有加载或已登记退避。
- `banner-shown`、`banner-hidden`：Banner 已按当前状态立即显示或隐藏；这两个结果不会触发加载。
- `config-error`、`adapter-error`、`load-failed`、`display-failed`：可诊断失败。
- `video-ad-unavailable`：供 UI 层选择本地化 Toast 的稳定提示码；不得把 SDK 原始消息直接展示给用户。

原生事件至少要归一化为 `initialized`、`loaded`、`loadFailed`、`displayed`、`displayFailed`、`hidden`、`rewarded`、`bannerExpanded`、`bannerCollapsed`、`bannerSizeChanged`、`appBackground`、`appForeground`、`networkAvailable` 和 `networkUnavailable`。Banner 不依赖仅为全屏格式保留的 displayed/hidden 回调；事件可以晚于方法返回到达，不能用 `request-dispatched` 推断 `displayed` 或 `rewarded`。

## 多广告位状态与单一服务

每个广告位使用独立业务 `phase`、加载失败计数、retry deadline 和加载重试 timer；官方插件内部持有格式匹配的 MAX 原生对象，Banner 另有独立 `bannerVisibility`。不能把“已加载”和“当前可见”混成一个 phase。服务级统一持有实例代次、全屏展示仲裁、Banner 可见性仲裁和 `interstitialBlockedUntilMonotonicMs`。该截止时间只表达激励视频结束后的 30 秒跨格式保护，不是广告位加载重试 deadline，也不创建 timer。广告服务仍是业务状态的单一所有者；每个广告位的加载重试独立定时，不得复制另一套退避算法。

### phase 与原生 gates 分离

`phase` 只描述一个广告位的资源/展示阶段（`new`、`initializing`、`failed`、`idle`、`loading`、`ready`、`showing` 或 `unsupported`）；它不是 ThreeJS 场景状态。以下 gates 是原生服务依赖，不能复制到场景状态机或由场景自行维护：

- `host`：Activity/ViewController provider 能否提供当前有效宿主；
- `foreground`：App 是否在前台并允许呈现全屏界面；
- `connectivity`：网络连通性监视器是否允许请求；
- `privacy`：CMP/TCF、MAX consent flags、ATT 等是否达到 `ready`；
- `fullscreen`：原生 fullscreen arbiter 是否已有其他全屏广告或系统界面占用。

ThreeJS 场景只提供 `slotId` 与自然中断点上下文并消费结构化结果；`tryShow` 前由官方插件适配层读取该广告位 phase 和共享 gates，任一 gate closed/unknown 都立即拒绝。前后台、断网、隐私变化和宿主切换由 Capacitor 生命周期与官方插件事件归一化后发布，恢复时重新计算 gates，而不是让场景写入广告 phase。

1. `new → initializing` 只由首次有效 `initialize` 触发；相同配置的重复初始化复用原请求或返回当前 phase，不再次创建 SDK/广告对象。
2. MAX 初始化和隐私前置完成后，通过官方插件为每个启用广告位创建或加载正确格式的广告并进入 `idle`，随后分别通过各广告位的服务入口静默投递一次预加载，不等待调用方再触发；官方插件初始化失败转为 `failed`。隐私未决或被阻断时由 privacy gate 和结果码表达，不能假装已初始化。
3. 每个广告位的 `idle → loading → ready` 是一次独立加载生命周期；加载中或 ready 时的重复 `preload(slotId)` 只返回当前 phase。`loaded`/`ready` 表示 MAX 已确认该广告位可展示，不表示刚刚请求成功。
4. 全屏广告的 `ready → showing` 只由所有 gates open、自然中断点且满足格式策略的 `tryShow` 触发。插页还必须满足当前单调时间不早于 `interstitialBlockedUntilMonotonicMs`；保护期内返回 `rewarded-interstitial-delay`，不能调用 MAX 的 show，也不能在触发路径补做 load。
5. `showing → idle` 的 `displayFailed` 立即发起一次去重后的后台预加载；只有这次加载失败后才进入指数退避。`showing → idle` 的 `hidden` 也必须后台预加载。若该事件属于当前匹配的激励视频展示，请先以事件的 `monotonicAtMs + 30_000` 更新插页保护截止时间，再释放全屏锁；重复、迟到、旧实例或不匹配的 `hidden` 不得延长保护期。激励视频 `displayFailed` 不启动保护期。
6. 后台、离线、隐私未决或无有效宿主时保留当前 phase 快照，但不发起新的 load/show；恢复到前台且网络可用后重新计算 gates，并按保留的退避 deadline 最多恢复一次调度。
7. 任何销毁、平台切换或配置变更都使旧回调携带的实例代次失效；旧事件不得把新实例推进到 `ready` 或重置新实例的计数。
8. Banner 创建时 `bannerVisibility=hidden`；`loaded` 只把 phase 置为 `ready`，不会自动显示。`setBannerVisibility(true)` 只有在 ready、前台、宿主有效且布局安全时才立即显示；否则保持 hidden 并返回原因，不触发 load。`setBannerVisibility(false)` 总是尽快隐藏并立即返回。

每广告位的 deadline、失败计数、加载重试 timer 和正在加载标记，以及共享的正在展示标记、奖励待决账本、插页保护截止时间和实例代次，都属于广告服务这个单一状态所有者。独立表示加载重试 timer 按 `slotId` 隔离，不表示由 ThreeJS 场景或组件自行创建；不得让场景、多个组件或多个原生回调各自维护另一份重试、保护时间或奖励状态。

### 初始化失败与显式重试

- 官方插件初始化失败必须显式进入 `failed`，结果包含稳定错误类别；在 `failed` 状态重复调用相同的 `initialize` 只返回当前失败快照，不自动递归或热重试。
- 缺失 SDK/adapter、无效配置或 ad unit、平台不支持、策略阻断和隐私未 ready 属于确定性失败：不创建初始化重试 timer，修正配置或隐私状态后由调用方显式调用 `retryInitialize()`。
- 网络超时、暂时无网络、原生服务瞬时错误等也进入 `failed`，不自动创建初始化重试 timer。只有 `host`、`foreground`、`connectivity` 和 `privacy=ready` 全部 open 后，调用方才能通过 `retryInitialize()` 显式恢复；后台、离线、宿主不可用或隐私未决时立即拒绝该请求。
- 初始化重试与广告 load 重试是不同任务类型。初始化未成功前不得创建 load 任务；初始化成功后，每个广告位的预加载与退避都由该广告位自己的 `RetryState` 和 timer 管理，初始化重试不得创建或重置任何广告位的加载重试 timer 与计数。
- `retryInitialize()` 只允许一次显式 `failed → initializing`，并复用同一 `instanceGeneration`；原生 SDK/宿主实例重建时先递增 generation，再接受新初始化，旧回调全部失效。

## 初始化与隐私时序

1. 启动时读取受控平台配置，先检查平台、当前 Activity/ViewController、环境开关和已知隐私状态；Web/小游戏直接 no-op。
2. 若使用自己的 CMP，先完成适用地区的同意收集，再设置 MAX 所需的 consent、do-not-sell、年龄/限制标志，之后才初始化 MAX 和请求广告。若使用 MAX/Google UMP 集成流程，按官方当前流程等待其完成回调；不要在 CMP 结束前初始化第三方网络。
3. iOS 在产品允许的时机请求 ATT，并按当前授权状态与 AppLovin 隐私文档配置 MAX；不要为了等待 ATT 阻塞游戏，也不要在未满足平台规则时请求个性化广告。
4. iOS `Info.plist` 按当前 AppLovin SKAdNetwork 页面和已实际启用的每个 mediated network 生成/维护 `SKAdNetworkItems`，不能复制过期的固定清单。Android/iOS 的隐私 manifest、数据安全声明、商店隐私资料和目标地区限制同样由发布责任人核对。
5. 初始化成功后立即通过每个广告位自己的服务入口静默预加载。初始化失败只返回结构化错误并保留可重试状态，不在初始化回调里递归重试或阻塞 ThreeJS。

Google AdMob 通过 MAX 提供需求时，EEA/英国等适用区域需使用 Google 认可且支持 IAB TCF 的 CMP，并确认 CMP 覆盖本合同中的实际网络集合。隐私状态必须在 MAX 使用前按官方 API 正确传递；儿童数据、年龄限制和地区义务不能由广告模块自行假设或绕过。

## 全广告位静默预加载与独立失败重试

### 常规路径

- `initialize` 完成后，广告服务立即为全部启用广告位各发起一次后台静默预加载；新增或重新启用广告位也通过该广告位的服务入口发起，禁止各业务组件自行 load。
- `loaded` 事件把对应广告位置为 `ready`，将该广告位的 `consecutiveLoadFailures` 清零，并取消、清空该广告位自己的 retry deadline 与 timer。不要在 ready 状态重复 load。
- 全屏广告的 `hidden` 事件后尽快静默预加载该广告位的下一条广告；`displayFailed` 事件立即发起一次去重后的静默预加载，但遥测原因与 load failure 分开。Banner 不使用这些全屏回调。只有新的加载请求失败时才进入加载退避。
- 所有 preload/loadFailed/retry 路径禁止 Toast、弹窗、loading 遮罩和声音；只有展示触发不可用或 `displayFailed` 才产生 UI 提示事件。

### 退避公式

对任何广告位的瞬时 no-fill、网络错误、超时和 adapter load failure，都由该广告位自己的 `RetryState` 使用以下公式。每个广告位的 `consecutiveLoadFailures` 独立初始化为 `0`；该广告位每次新的 load failure 先递增，再计算 deadline：

```text
n = consecutiveLoadFailures（本次失败递增后的值，n >= 1）
基础延迟（秒）= min(2^n, 64)
抖动后延迟（秒）= 基础延迟 × random(0.8, 1.2)
最终延迟（秒）= min(抖动后延迟, 64)
```

第一次加载失败使用 2 秒，随后为 4、8、16、32、64 秒；继续失败时保持 64 秒封顶。64 秒档在启用抖动时的有效范围为 51.2–64 秒（先抖动、再封顶），不能出现超过 64 秒的最终 deadline。成功加载立即把 `consecutiveLoadFailures` 清零。测试应支持关闭抖动并精确断言这六个基线值；生产可启用 `0.8–1.2` 抖动以减少多实例同时重试。

广告位独立定时规则：

1. 每个广告位的 `RetryState` 独立保存失败计数、`retryDeadlineMonotonicMs` 和 timer 引用；每次主动 load 生成唯一 `loadOperationId`。同一广告位最多一个待执行 timer 和一个 in-flight load，重排或取消只作用于该广告位。
2. timer 回调开始时先清空本广告位的 timer 引用，再检查实例代次、前台、在线、隐私及该广告位 phase；条件满足时只为该广告位投递一次 load，不扫描或触发其他广告位。
3. 后台或离线暂停时分别取消每个广告位的 timer，但保留各自基于单调时钟的 deadline，不把剩余时间改写成墙上时间。恢复前台、在线且 privacy ready 后，每个已到期广告位独立恢复至多一次请求；未到期广告位按自己的 deadline 重建 timer。
4. 瞬时失败只登记到发生失败广告位的 `RetryState`，不在 failure callback 内同步递归 `load`；不要使用零延迟轮询、组件级定时器、同一广告位的重复 timer 或重复事件订阅。
5. `config-error`、无效 ad unit、缺失 adapter/SDK、被策略阻断或隐私状态未满足等确定性问题不应热重试。修正配置、同意状态或依赖后由状态变化通过该广告位的服务入口显式触发一次新加载，并把阻断原因报告给控制面。
6. `displayFailed` 使用对应广告位的服务入口清理展示状态并立即请求一次静默预加载，不等待退避；若该加载随后失败，再从 2 秒开始计算并调度该广告位自己的加载重试 timer。不得把展示失败当作展示成功。

### 快速返回语义

`preload(slotId)` 只返回 `load-started`、`load-in-flight`、`retry-scheduled`、`background`、`offline`、`privacy-pending`、`no-host`、`unknown-slot` 或相应错误；它不等待 MAX `loaded`/`loadFailed`，也不产生 UI 提示。`isReady(slotId)` 只读取桥内快照，不为了变成 ready 而隐式发起加载。`tryShow(context)` 同样只读取状态：ready 时投递 show，否则立即返回，不得顺带调用 `preload` 或等待下一次加载。

## Banner 布局、显隐与刷新

### 原生视图和安全布局

- 每个 Banner 广告位复用一个原生 MAX ad view；初始化后创建为隐藏状态并静默调用一次 load。场景切换只通过 `setBannerVisibility` 显隐，不反复创建/销毁视图；服务销毁、配置移除或平台实例重建时才释放。
- 默认只允许在 viewport 顶部或底部显示一个 Banner。另一个 Banner 已可见时返回 `banner-visible-conflict`；除非产品布局明确证明互不遮挡，否则不得叠放多个 Banner。
- Banner 位于原生视图层并遵守系统 safe area。使用 MAX 当前平台 API 返回的实际/自适应尺寸，结合 Android density、iOS points 和 WebView/CSS 像素换算输出稳定内容 inset；不得把固定 50px/50dp 当作所有设备的真实高度，也不得把 Banner 尺寸乘入 ThreeJS 渲染 DPR。
- Banner 不得覆盖主要按钮、摇杆、手势热区、系统导航区域或付费/确认操作。若产品选择占位布局，只有拿到有效尺寸后才提交 inset，并在安全的场景边界一次性更新；未 ready 时保持隐藏且 `visible=false`，不能显示空白广告框或用错误尺寸挤压画面。
- 旋转、窗口尺寸变化、折叠屏状态或 safe-area 改变时，先隐藏并使旧布局代次失效，重新测量/加载（仅在官方当前 API 要求时），再在布局稳定且业务仍请求可见时显示。旧尺寸回调不能覆盖新布局。

### 显隐快速返回

- `setBannerVisibility(slotId, true)` 只读取广告位 phase、前台/宿主/隐私 gate、布局代次和可见性仲裁。ready 且布局安全时立即显示并返回 `banner-shown`；否则保持隐藏并返回 `not-ready`、`layout-not-ready`、`background`、`no-host` 或 `banner-visible-conflict`，不得在显隐调用中 load 或等待。
- `setBannerVisibility(slotId, false)` 无论当前 phase 如何都应幂等隐藏并返回 `banner-hidden`。Banner 未 ready、显隐失败或 loadFailed 都不显示视频不可用 Toast，也不阻塞 ThreeJS 场景。
- Banner 不使用全屏 `showRequestId`、`displayed`/`hidden`、全屏仲裁或激励账本。点击、展开和收起使用 Banner 专属回调；不得依赖官方标记为全屏保留的 displayed/hidden 回调判断 Banner 可见性。

### 刷新单一所有者

- Banner 正常刷新只允许 MAX 原生 auto-refresh 作为所有者；禁止 ThreeJS、JavaScript、场景组件或通用 timer 另建固定刷新循环。刷新间隔和策略以 MAX 控制台与当前官方 API 为准，不在 Skill 中硬编码。
- 按当前 Android/iOS 官方 Banner 文档，在需要可靠暂停刷新时先对 ad view 设置 `allow_pause_auto_refresh_immediately=true`，再调用 `stopAutoRefresh()`；实现阶段必须按项目锁定 SDK 的当前文档复核该参数是否仍必需，并用平台测试证明停止后不再发起刷新，不能只根据方法已调用就判定成功。
- Banner 隐藏、App 进入后台、宿主失效或 privacy gate 关闭时停止/暂停 auto-refresh；重新显示时仅在 ready 且 gates open 后恢复。显隐重复调用不得重复 start/stop 或注册 listener。
- 每次启动 Banner auto-refresh 都递增 `refreshEpoch`；正常刷新可在同一 epoch 内产生多轮 `loaded`。MAX 暴露给应用层的 load failure 必须先使 epoch 失效、可靠停止 auto-refresh、隐藏视图并清除可见请求，再由该 Banner 广告位自己的 `RetryState` 按退避公式登记一个 timer，避免 SDK 与手动恢复双重请求。重新 `loaded` 后仍保持隐藏，必须由业务再次调用 `setBannerVisibility(true)` 才显示并开启新 epoch，不能迟到自动弹出。
- Banner 展开期间保持视图归属但禁止布局抖动；收起后恢复已确认尺寸。页面离开或长期隐藏时停止刷新但保留可复用视图，只有服务销毁或配置移除才销毁对象。

## 展示触发与视频失败提示

插页只放在用户自然停顿处，例如关卡完成、结算页进入前或明确的主视图切换后；激励视频只由明确的用户操作触发。不得在启动、首屏加载、输入手势中间、战斗关键帧、失败即时反馈、连续点击处理或网络请求等待期间强行打断。

- `tryShow` 先检查平台、`slotId`/格式和 `naturalBreak`；这些基础条件无效时返回各自结果。对基础条件有效的插页请求，随后优先用单调时钟检查 `interstitialBlockedUntilMonotonicMs`，再检查前台状态、privacy、宿主、该广告位 `phase=ready` 和全屏仲裁。当前时间早于截止时间时固定返回 `rewarded-interstitial-delay` 和向上取整且不小于 1 的 `interstitialDelayRemainingMs`，即使资源同时未 ready 或某个运行 gate 关闭也不改报其他错误；不得调用 MAX show、等待或补做 load。
- 只在当前匹配的激励视频 `hidden` 事件到达时，将截止时间更新为 `max(现有截止时间, event.monotonicAtMs + 30_000)`。这 30 秒从视频关闭/结束回调起算，只阻断插页，不阻断 Banner、下一次激励视频、奖励结算或任何后台预加载；保护期自然过期，不创建 timer，也不因进程内 SDK 实例重建而提前清空。

最小调用方式应类似“发起展示尝试后立即结束当前同步处理”；禁止 `await ad.load()`、`await ad.showUntilHidden()` 或为了广告结果暂停 ThreeJS 更新。激励 show 受理时以 generation/slot/request 建立奖励待决记录；`rewarded` 事件可以在 `hidden` 前后到达，只要匹配一条仍有效且未失败的待决记录就异步发奖并原子标记已结算。`hidden` 不发奖也不删除待决记录，下一次展示不能覆盖上一条记录；`displayFailed` 将对应记录标为不可发奖。待决记录只能在发奖、明确展示失败或经过项目基于平台测试确定的有界结算窗口后清理，超时必须记录 `reward-settlement-timeout`。高价值或跨进程奖励应采用 MAX S2S rewarded callback 与服务端幂等账本。

### 视频广告不可用 Toast

- `tryShow` 因 `unknown-slot`、`not-initialized`、`privacy-pending`、`not-ready`、`loading`、`already-showing`、`background`、`offline`、`no-host` 或其他不可展示状态立即拒绝时，`ShowResult.noticeCode` 返回 `video-ad-unavailable`，并携带本次触发唯一的 `noticeDedupeKey`。共享 UI 层必须立即显示一次本地化 Toast，默认中文语义为“视频广告暂不可用，请稍后再试”。`rewarded-interstitial-delay` 是预期的插页静默跳过策略，不返回 `noticeCode` 或 `noticeDedupeKey`。
- 原生 show 已受理后若收到匹配当前 generation/slot/request 的 `displayFailed`，桥接层发布一个 `AdUiNoticeEvent`；UI 层按 `dedupeKey` 只显示一次相同 Toast。迟到、重复或旧实例回调不提示。
- 后台预加载失败、no-fill、退避重试、恢复调度和被动状态变化不产生 Toast；只有实际展示触发失败才提示，避免后台错误打扰用户。
- Toast 是 UI 反馈，不改变加载计数、奖励和游戏流程。官方插件适配层只发送稳定 `noticeCode`，不直接操作 ThreeJS UI，也不把插件原始错误文本展示给用户。

## 展示失败、生命周期与断网

- MAX `displayFailed` 要记录脱敏原因码、结束当前展示锁、清除对应广告位失效 ready 标记、发布一次去重的 `video-ad-unavailable` UI 提示事件，并通过对应广告位的服务入口静默预加载；不得立即递归 show。
- MAX `hidden` 要释放展示锁并静默预加载同一广告位的下一条；匹配当前激励视频展示的事件还要先更新 30 秒插页保护截止时间。如果用户快速离开场景，预加载请求仍不得持有已销毁的 ThreeJS/Activity/ViewController。
- App 进入后台时禁止新的 show，并暂停 retry timer；回到前台后检查宿主、隐私和网络，再恢复一次预加载。不要因为前后台切换重置成功加载计数或重复注册 MAX listener。
- 网络不可用时不发起新 load/show，保留退避 attempt；网络恢复后按当前 attempt 恢复一次。离线期间调用 `tryShow` 必须快速返回 `offline`。
- 原生宿主暂不可用、旋转/导航期间 ViewController 不合法、Android Activity 被销毁或已有其他全屏广告时，立即返回 `no-host`/`already-showing`；不阻塞等待宿主出现。

## 错误分类与处理原则

公开结果和遥测以稳定的类别为主，不能把某一版 MAX 或 adapter 的数字错误码写成永久公共枚举。原生层可在受控诊断中附带当前官方错误码，映射表按平台文档更新：

| 类别 | 常见含义/官方码示例 | 处理 |
| --- | --- | --- |
| `unsupported` | Web/小游戏或未实现的平台 | 立即 no-op，不初始化、不重试。 |
| `configuration` | 无效 ad unit、缺失 SDK/adapter、包名不匹配；例如 `-5603` | 停止热重试；修正受控配置后显式初始化重试。 |
| `privacy` | `privacy-pending`、同意被拒、ATT/CMP/SKAN 前置未完成 | 不请求广告；监听隐私状态变化后重新评估 gates。 |
| `lifecycle` | 无有效 Activity/ViewController、后台、宿主已销毁 | 快速返回并暂停调度；前台/宿主恢复后最多恢复一次。 |
| `connectivity` | 无网络、超时、网络错误；例如 `-1009`、`-1001`、`-1000` | 初始化失败仅允许 gates open 后显式重试；load 失败在 gates open 时进入退避，离线暂停。 |
| `no-fill` | 当前设备/地区无可用填充；例如 `204` | 视为瞬时 load failure，使用统一指数退避。 |
| `adapter` | adapter/第三方 SDK 载入失败、内部错误；例如 `-5001`、`-5209` | 记录渠道别名和类别，按 load 退避；依赖缺失则升级为 configuration。 |
| `concurrency` | 已有全屏广告、广告未 ready，或 Banner 可见性冲突；例如 `-23`、`-24` | 全屏不重试 show；Banner 保持隐藏；按对应格式生命周期恢复。 |
| `display` | 展示过程失败；iOS 例如 `-4205` | 独立记录，释放展示锁并重新预加载。 |
| `unknown` | 无法归类的 SDK/桥接异常；例如 `-1` | 只在明确是瞬时故障且 gates open 时有限退避，否则转人工审查。 |

这些数字只是官方页面当前可能出现的示例，不是跨平台、跨版本的稳定接口；对外只保证类别、`code` 字符串和结构化状态。未知错误不得通过解析自由文本来决定是否展示，也不得因为错误回调重复而开启多个初始化或 load 任务。

## 遥测与安全

允许记录聚合且脱敏的事件：`initialize_started`、`initialize_completed`、`preload_requested`、`load_succeeded`、`load_failed`、`retry_scheduled`、`show_requested`、`show_skipped_rewarded_delay`、`ad_displayed`、`display_failed`、`ad_hidden`、`banner_shown`、`banner_hidden`、`banner_expanded`、`banner_collapsed`、`banner_size_changed`、`reward_granted`、`ui_notice_requested`、`paused`、`resumed`。每条事件只保留事件名、平台、业务广告位、广告格式、稳定原因码、`consecutiveLoadFailures`、保护期剩余毫秒数、延迟/耗时、phase 和可选的 canonical 网络别名。

禁止记录或上传 SDK key、MAX ad unit ID、网络 placement/账号凭证、IDFA/AAID、设备标识、用户标识、IP、完整插件错误消息、完整 waterfall、竞价凭证、CMP 原文或可反推出个人的自由文本。官方插件错误对象只取稳定分类/数值码；原始日志仅限受控本地 debug，发布构建关闭敏感日志。

测试、debug、staging 和生产的 SDK key、ad unit、MAX Test Mode 与遥测端点必须隔离。SDK key 与 ad unit 通过不入库的生成式构建配置提供给官方插件适配器；广告网络账号凭证、Ad Review key 和服务器 API key 保持在 CI 秘密或原生构建配置中。广告模块不建立新的用户画像、个性化标识或绕过 CMP/ATT 的通道。

## 验收与测试矩阵

### 状态机和非阻塞单测

使用假的单调时钟、timer、官方插件适配器和网络/生命周期事件，至少覆盖：

- Web/小游戏所有入口均为 no-op，`isReady=false`，且不导入或触发原生 API。
- 重复 `initialize`、同广告位重复 `preload`、重复 `tryShow` 和重复 listener 回调保持幂等；每广告位最多一个 in-flight load 和一个待执行加载重试 timer，服务不存在共享加载重试 timer。
- 初始化成功立即静默预加载全部启用广告位；任一广告位 load success 只清零自身计数；所有广告位 load failure 都使用相同的 2/4/8/16/32/64 秒公式并封顶，抖动在 0.8–1.2 范围内且最终不超过 64 秒。
- 多广告位同时失败时，各广告位的任务、deadline 和 timer 完全独立；取消或触发一个广告位的 timer 不改变其他广告位。后台、离线、无宿主和隐私阻断时分别暂停，恢复后每个到期广告位只恢复一次，不产生递归风暴、零延迟循环或同广告位重复 timer。
- Banner 创建后 hidden 并静默加载；loaded 后仍不自动显示；`setBannerVisibility(true)` 只在 ready、布局安全和无可见冲突时显示，其他状态立即返回且不触发 load；重复隐藏幂等。
- Banner 使用实际自适应尺寸与 safe area，方向/窗口变化后旧布局回调失效，内容 inset 不修改 ThreeJS DPR；主要按钮、手势区和系统安全区不会被遮挡。
- Banner 只有 MAX auto-refresh 一个正常刷新所有者；隐藏/后台时停止，重新显示时恢复；load failure 先停止 auto-refresh，再向该 Banner 广告位自己的 `RetryState` 只登记一次，避免 SDK 与手动恢复双重 load。
- 连续 Banner auto-refresh 成功回调在同一 `refreshEpoch` 内均被处理；重复桥接事件按 `eventId` 去重。refresh failure 使旧 epoch 失效，随后旧回调不改变状态；该广告位的 retry timer 恢复 load 时使用新的 `loadOperationId`。
- 未 ready、已经展示、非自然时机、其他全屏广告占用和 display failure 都立即返回并继续业务流程。
- 匹配的激励视频 `hidden` 后第 0–29,999 毫秒内，基础条件有效的插页 `tryShow` 均优先返回 `rewarded-interstitial-delay`、准确剩余毫秒数且不调用 MAX show、不产生 Toast，即使广告未 ready 或运行 gate 关闭也保持该结果；第 30,000 毫秒恢复正常判定。重复/迟到/旧实例 `hidden`、激励 `displayFailed` 和插页 `hidden` 不得启动或延长保护期；保护期不影响 Banner、激励视频和后台预加载，不创建 timer，不随进程内 `instanceGeneration` 重建而清空。
- 所有 preload/load failure/retry 路径不产生 Toast；除 `rewarded-interstitial-delay` 按节奏静默跳过外，`tryShow` 立即拒绝时返回 `video-ad-unavailable`，异步 display failure 发布一次同码 UI 事件，重复/迟到回调按 dedupeKey 不重复提示。
- Banner 未 ready、布局失败、加载失败和显隐冲突均保持隐藏且不产生视频 Toast，不使用激励账本。
- hidden 和 display failure 都静默重新预加载对应广告位；销毁后的旧回调不会污染新实例。
- 激励视频只在匹配奖励待决账本的 `rewarded` 事件到达时发奖，同一 `showRequestId` 最多发放一次；覆盖 hidden→rewarded、开始新展示后旧 rewarded、display failure 后 rewarded、重复 rewarded 和结算超时，确保不漏发、不串单、不重复发奖。
- 使用永不返回广告事件的 fake 官方插件适配器：结算调用 `void ad.tryShow(context)` 后仍立即推进下一场景；断言适配器 Promise 只等待本地受理/拒绝，不等待 `loaded`、`displayed`、`hidden` 或任何广告回调。

### 原生与渠道验收

在已批准的环境中分别执行 Android 与 iOS 编译/集成检查，并在 MAX Test Mode、Mediation Debugger 或同等官方测试工具中按平台、渠道和格式逐项验证。某渠道在当前平台不支持 Banner、插页或激励视频时，必须记录官方证据并标记 `not-supported`，不能伪造通过：

| 渠道 | 必验别名 | 最低证据 |
| --- | --- | --- |
| AppLovin | `applovin` | MAX 初始化；Banner load/显隐/刷新；插页与激励视频 load/display/hidden/reward；测试模式和 waterfall 可见。 |
| Google AdMob | `admob` / Google Bidding and Google AdMob | adapter/SDK 状态、当前支持格式的测试广告、自适应 Banner、Google CMP/TCF 配置。 |
| Mintegral | `mintegral` | Android/iOS adapter 状态、当前支持格式的测试广告、隐私传递。 |
| Pangle | `pangle` | adapter 状态、当前支持格式的测试广告、目标国家/地区配置和 SKAdNetwork/隐私要求。 |
| Unity Ads | `unity` | MAX Unity Ads adapter 状态、当前支持格式的测试广告和展示/奖励回调。 |
| DT Exchange | `dt-exchange` / Fyber | MAX DT Exchange adapter 状态、当前支持格式的测试广告和失败回调。 |
| Verve | `verve` / PubNative / HyBid | MAX Verve adapter 状态、当前支持格式的测试广告和失败回调。 |

发布前还要绑定 `app-ads.txt`、iOS SKAdNetwork IDs、ATT、隐私 manifest、商店数据安全/隐私声明和 Google CMP 证据。不要以“MAX SDK 初始化成功”或“AppLovin 单渠道有填充”代替七项渠道验证。真实广告流量、生产 waterfall、商店上传、真机验收和外部渠道修改属于受保护动作，须由 `$threejs-game-workflow-control` 逐对象处理。

## 官方 AppLovin 资料

页面会随 SDK 和控制台更新；每次实施先打开当前页面，核对平台要求、支持网络、adapter、隐私、地区和错误码。以下均为 AppLovin 官方来源：

- [Android MAX SDK Integration](https://developers.applovin.com/en/max/android/overview/integration/)
- [iOS MAX SDK Integration](https://developers.applovin.com/en/max/ios/overview/integration/)
- [Android Banner & MREC Ads](https://developers.applovin.com/en/max/android/ad-formats/banner-and-mrec-ads/)
- [iOS Banner & MREC Ads](https://developers.applovin.com/en/max/ios/ad-formats/banner-and-mrec-ads/)
- [Android Interstitial Ads](https://developers.applovin.com/en/max/android/ad-formats/interstitial-ads/)
- [iOS Interstitial Ads](https://developers.applovin.com/en/max/ios/ad-formats/interstitial-ads/)
- [Android Rewarded Ads](https://developers.applovin.com/en/max/android/ad-formats/rewarded-ads/)
- [iOS Rewarded Ads](https://developers.applovin.com/en/max/ios/ad-formats/rewarded-ads/)
- [Android Preparing Mediated Networks](https://developers.applovin.com/en/max/android/preparing-mediated-networks/)
- [iOS Preparing Mediated Networks](https://developers.applovin.com/en/max/ios/preparing-mediated-networks/)
- [Android Error Handling](https://developers.applovin.com/en/max/android/overview/error-handling/)
- [iOS Error Handling](https://developers.applovin.com/en/max/ios/overview/error-handling/)
- [Android Privacy](https://developers.applovin.com/en/max/android/overview/privacy/)
- [iOS Privacy](https://developers.applovin.com/en/max/ios/overview/privacy/)
- [Android Terms and Privacy Policy Flow](https://developers.applovin.com/en/max/android/overview/terms-and-privacy-policy-flow/)
- [iOS Terms and Privacy Policy Flow](https://developers.applovin.com/en/max/ios/overview/terms-and-privacy-policy-flow/)
- [iOS SKAdNetwork](https://developers.applovin.com/en/max/ios/overview/skadnetwork/)
- [SDK Bidder Network Guides](https://developers.applovin.com/en/max/mediated-network-guides/sdk-bidder-network-guides/)
- [Traditionally Mediated Network Guides](https://developers.applovin.com/en/max/mediated-network-guides/traditionally-mediated-network-guides/)
- [MAX Dashboard: Connect Networks](https://developers.applovin.com/en/max/max-dashboard/networks/connect-networks/)
- [Android Mediation Debugger](https://developers.applovin.com/en/max/android/testing-networks/mediation-debugger/)
- [iOS Mediation Debugger](https://developers.applovin.com/en/max/ios/testing-networks/mediation-debugger/)
- [Android Test Mode](https://developers.applovin.com/en/max/android/testing-networks/test-mode/)
- [iOS Test Mode](https://developers.applovin.com/en/max/ios/testing-networks/test-mode/)
- [MAX Getting Started](https://developers.applovin.com/en/max/getting-started/)

如果官方页面改名、重定向或把网络拆成新的平台章节，保留本合同的行为不变量，并把新页面、版本和审查结论写入当前 Work Item，而不是在代码中猜测旧 API。
