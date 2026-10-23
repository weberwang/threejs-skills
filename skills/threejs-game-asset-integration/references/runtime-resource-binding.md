# 运行资源路径绑定

磁盘路径、浏览器 URL 和模块导入表达式分开记录。`runtime_outputs` 保存项目相对文件；正式加载不得指向 `output/`、`docs/` 或 `assets-source/`。资源按场景、显示层或共享所有权组织，不能为了加载方便把全部资源移入共享目录。

公共资源按 `public` 根和明确的部署前缀推导 URL，保留完整子目录。例如：

```json
{
  "runtime_outputs": ["public/assets/scenes/main/decor.png"],
  "runtime_bindings": [{
    "runtime_binding": {
      "kind": "public",
      "file": "public/assets/scenes/main/decor.png",
      "deployment_base": "/game/"
    },
    "runtime_url": "/game/assets/scenes/main/decor.png"
  }]
}
```

模块资源由构建器处理，不手写 `src/...` 浏览器 URL：

```json
{
  "runtime_outputs": ["src/scenes/main/decor.png"],
  "runtime_bindings": [{
    "runtime_binding": {
      "kind": "module-import",
      "file": "src/scenes/main/decor.png",
      "importer": "src/scenes/main/view.ts",
      "specifier": "./decor.png?url"
    },
    "runtime_url": null,
    "url_expression": "atlasUrl"
  }]
}
```

对应消费代码为 `import atlasUrl from "./decor.png?url";`，再将变量传给资源加载器。相对导入必须从声明的 importer 唯一解析到同一个文件；文件门检查运行产物和 importer 实际存在。默认共享解析器支持安全的文件路径，帧动画另要求 PNG。

普通资源在需要显式加载地址绑定时声明 `runtime_bindings`；声明后逐项校验 URL、部署前缀、模块表达式和 `runtime_outputs` 归属，拒绝重复文件。未声明时沿用项目资源系统的实际消费证据，不能把“存在文件”当成“已加载”。帧动画的正式 accepted 合同强制提供 `spritesheet.runtime_binding`，其生成器与验收门共用同一解析器；未绑定图集仅用于制作与人工预览，不生成正式加载示例。详见[帧动画接入](../../threejs-frame-animation/references/workflow-integration.md)。

这些检查证明静态路径映射及本地文件绑定，不证明部署服务器可访问、构建产物已发布或游戏实际完成加载；运行消费仍通过既有 ThreeJS 证据验收。
