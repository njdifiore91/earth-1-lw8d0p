import { defineConfig } from 'vite'; // v4.0.0
import react from '@vitejs/plugin-react'; // v4.0.0
import checker from 'vite-plugin-checker'; // v0.6.0
import tsconfigPaths from 'vite-tsconfig-paths'; // v4.2.0
import { type ConfigEnv, type UserConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig(({ mode }: ConfigEnv): UserConfig => {
  const isDevelopment = mode === 'development';

  return {
    plugins: [
      react({
        fastRefresh: true,
        // Enable fast refresh for development
        babel: {
          plugins: [
            ['@babel/plugin-transform-runtime'],
          ]
        }
      }),
      checker({
        typescript: {
          tsconfigPath: './tsconfig.json',
          buildMode: true,
        },
        overlay: true,
        terminal: true,
        enableBuild: true
      }),
      tsconfigPaths({
        projects: ['./tsconfig.json']
      })
    ],

    server: {
      port: 5173,
      host: true,
      proxy: {
        '/api': {
          target: 'http://localhost:3000',
          changeOrigin: true,
          secure: false,
          rewrite: (path) => path.replace(/^\/api/, '')
        },
        '/ws': {
          target: 'ws://localhost:3000',
          ws: true,
          secure: false
        }
      },
      hmr: {
        overlay: true,
        clientPort: 5173
      },
      watch: {
        usePolling: true
      }
    },

    build: {
      outDir: 'dist',
      sourcemap: true,
      minify: 'terser',
      target: ['chrome90', 'firefox88', 'safari14', 'edge90'],
      terserOptions: {
        compress: {
          drop_console: !isDevelopment,
          drop_debugger: !isDevelopment
        },
        format: {
          comments: false
        }
      },
      rollupOptions: {
        output: {
          manualChunks: {
            vendor: ['react', 'react-dom', '@reduxjs/toolkit'],
            mapbox: ['mapbox-gl'],
            material: ['@mui/material'],
            charts: ['d3', 'chart.js'],
            utils: ['lodash', 'date-fns']
          }
        }
      },
      reportCompressedSize: true,
      chunkSizeWarningLimit: 1000,
      cssCodeSplit: true
    },

    resolve: {
      alias: {
        '@': resolve(__dirname, './src'),
        '@components': resolve(__dirname, './src/components'),
        '@pages': resolve(__dirname, './src/pages'),
        '@services': resolve(__dirname, './src/services'),
        '@utils': resolve(__dirname, './src/utils'),
        '@hooks': resolve(__dirname, './src/hooks'),
        '@store': resolve(__dirname, './src/store'),
        '@types': resolve(__dirname, './src/types'),
        '@assets': resolve(__dirname, './src/assets')
      }
    },

    css: {
      modules: {
        localsConvention: 'camelCase',
        scopeBehaviour: 'local',
        generateScopedName: isDevelopment
          ? '[name]__[local]__[hash:base64:5]'
          : '[hash:base64:8]'
      },
      preprocessorOptions: {
        scss: {
          additionalData: '@import "@/assets/styles/variables.scss";',
          sourceMap: true
        }
      },
      devSourcemap: true
    },

    optimizeDeps: {
      include: [
        'react',
        'react-dom',
        '@reduxjs/toolkit',
        'mapbox-gl'
      ],
      exclude: ['@mapbox/mapbox-gl-draw']
    },

    preview: {
      port: 5173,
      host: true
    },

    esbuild: {
      logOverride: { 'this-is-undefined-in-esm': 'silent' }
    }
  };
});