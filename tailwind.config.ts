import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        bg: "#0a0e14",
        panel: "#121722",
        panel2: "#161c29",
        border: "#232c3d",
        accent: "#3ddc97",
        warn: "#e8b339",
        danger: "#e85d5d",
        muted: "#7c8aa5",
      },
      fontFamily: {
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
    },
  },
  plugins: [],
};
export default config;
