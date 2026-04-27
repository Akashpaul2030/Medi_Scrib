import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#0A0A0A",
        paper: "#FAFAF9",
        teal: {
          DEFAULT: "#0F766E",
          600: "#13897F",
          700: "#0F766E",
          800: "#0B5F58",
        },
        coral: {
          DEFAULT: "#F97066",
          600: "#F97066",
        },
        line: "#E7E5E0",
        mute: "#6B6B66",
      },
      fontFamily: {
        sans: ["var(--font-inter)", "ui-sans-serif", "system-ui", "sans-serif"],
        serif: ["var(--font-lora)", "ui-serif", "Georgia", "serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      boxShadow: {
        card: "0 1px 0 rgba(15,23,42,.04), 0 1px 2px rgba(15,23,42,.04), 0 8px 24px -12px rgba(15,23,42,.08)",
        softer: "0 1px 0 rgba(15,23,42,.04), 0 1px 2px rgba(15,23,42,.04)",
      },
    },
  },
  plugins: [],
};

export default config;
