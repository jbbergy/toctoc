import { defineConfig, minimal2023Preset } from '@vite-pwa/assets-generator/config'

export default defineConfig({
  preset: {
    ...minimal2023Preset,
    maskable: { ...minimal2023Preset.maskable, resizeOptions: { background: '#3A4BC0' } },
    apple: { ...minimal2023Preset.apple, resizeOptions: { background: '#3A4BC0' } },
  },
  images: ['public/icon-source.svg'],
})
