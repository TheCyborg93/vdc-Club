import { defineConfig } from "@pandacss/dev";
import { vdcSemanticTokens, vdcTokens } from "./theme/vdc-tokens";
import { badge, button, card, input } from "./theme/vdc-recipes";

export default defineConfig({
  preflight: true,
  include: [
    "./app/**/*.{ts,tsx,js,jsx}",
    "./components/**/*.{ts,tsx,js,jsx}",
    "./lib/**/*.{ts,tsx,js,jsx}",
    "./theme/**/*.{ts,tsx,js,jsx}",
  ],
  exclude: [],
  outdir: "styled-system",
  jsxFramework: "react",
  strictTokens: true,
  minify: true,
  plugins: [
    {
      name: "Remove Panda Preset Colors",
      hooks: {
        "preset:resolved": ({ utils, preset, name }) =>
          name === "@pandacss/preset-panda"
            ? utils.omit(preset, ["theme.tokens.colors", "theme.semanticTokens.colors"])
            : preset,
      },
    },
  ],
  globalCss: {
    "html, body": {
      background: "bg",
      color: "fg",
    },
    body: {
      margin: "0",
      minHeight: "100dvh",
      fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      textRendering: "optimizeLegibility",
      WebkitFontSmoothing: "antialiased",
    },
    "*": { boxSizing: "border-box" },
    "a": { color: "inherit", textDecoration: "none" },
    "button, input, textarea, select": { font: "inherit" },
  },
  theme: {
    extend: {
      tokens: vdcTokens,
      semanticTokens: vdcSemanticTokens,
      recipes: { badge, button, card, input },
    },
  },
});
