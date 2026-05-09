import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          900: "#0b0e14",
          800: "#13182233",
          700: "#1f2530",
          500: "#4a5568",
          400: "#94a3b8",
          300: "#cbd5e1",
          100: "#f1f5f9",
        },
        accent: { DEFAULT: "#2563eb", soft: "#dbeafe" },
        tan: {
          50: "#faf6ef",
          100: "#f3ebd9",
          200: "#e6d4ac",
          300: "#d6b87f",
          400: "#c19a5b",
          500: "#a98148",
          600: "#8a6738",
          700: "#6b4f2c",
          800: "#4d3920",
          900: "#332615",
        },
      },
      fontFamily: {
        sans: ["ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "monospace"],
      },
    },
  },
  plugins: [],
};
export default config;
