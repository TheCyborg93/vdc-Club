import { defineConfig } from "@pandacss/dev";
import { vdcSemanticTokens, vdcTokens } from "./theme/vdc-tokens";
import { badge, button, card, input } from "./theme/vdc-recipes";
import { vdcGlobalCss } from "./theme/vdc-global";
import { vdcMeetingGlobalCss } from "./theme/vdc-meeting-global";
import { vdcMinutesGlobalCss } from "./theme/vdc-minutes-global";

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
  strictTokens: false,
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
  globalCss: { ...vdcGlobalCss, ...vdcMeetingGlobalCss, ...vdcMinutesGlobalCss },
  theme: {
    extend: {
      tokens: vdcTokens,
      semanticTokens: vdcSemanticTokens,
      recipes: { badge, button, card, input },
    },
  },
});
