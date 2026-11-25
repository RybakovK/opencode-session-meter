import { gui } from "@opencode/plugin/gui/vite"
import { defineConfig } from "vite"

export default defineConfig({
  plugins: [gui({ entry: "src/plugin/gui.tsx", outFile: "dist/gui-experimental.cjs" })],
})
