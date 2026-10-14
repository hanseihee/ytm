import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));

// iOS 앱의 데이터 묶음: src/lib의 YouTube Music·Spotify·가사 코드를 JavaScriptCore용 한 파일(ios/build/ytm-core.js)로.
// Tauri API는 앱(Swift) 통로로 바꿔 끼운다(src/platform/jsc).
export default defineConfig({
  resolve: {
    alias: [
      { find: /^@tauri-apps\/api\/core$/, replacement: here('./src/platform/jsc/tauri-core.ts') },
      { find: /^@tauri-apps\/api\/event$/, replacement: here('./src/platform/jsc/tauri-event.ts') },
    ],
  },
  build: {
    target: 'es2022',
    outDir: 'ios/build',
    emptyOutDir: false,
    lib: { entry: here('./src/platform/jsc/index.ts'), formats: ['iife'], name: 'YTMCore', fileName: () => 'ytm-core.js' },
  },
});
