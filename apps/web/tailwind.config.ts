import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./features/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        ink: "#050807",
        "ink-2": "#08110D",
        "ink-3": "#0D1713",
        surface: "#F8FAFC",
        muted: "#94A3B8",
        green: "#22C55E",
        emerald: "#10B981",
        teal: "#14B8A6",
        blue: "#2563EB",
        navy: "#071426",
        warning: "#F59E0B",
        danger: "#EF4444",
        paused: "#8B5CF6",
      },
      boxShadow: {
        glow: "0 0 32px rgba(34, 197, 94, 0.24)",
        panel: "0 24px 60px rgba(0, 0, 0, 0.28)",
      },
    },
  },
  plugins: [],
};

export default config;
