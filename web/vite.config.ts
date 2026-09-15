import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// GitHub Pages project site: https://sosgit-app.github.io/SOS-FLEX-APP/
export default defineConfig({
  plugins: [react()],
  base: '/SOS-FLEX-APP/',
})
