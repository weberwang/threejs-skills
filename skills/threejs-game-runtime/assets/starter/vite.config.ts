import { defineConfig } from 'vite';

/** 生产压缩与源码映射策略由真实构建入口统一控制，开发调试配置独立。 */
export default defineConfig({
  build: {
    sourcemap: false,
    // 压缩时移除注释，依赖许可证仍作为独立公开文件随构建交付。
    license: { fileName: 'licenses.md' },
    minify: 'terser',
    terserOptions: {
      // 禁止属性名混淆，避免破坏 three.js、插件和动态属性访问契约。
      compress: { passes: 2 },
      mangle: true,
      format: { comments: false },
    },
  },
});
