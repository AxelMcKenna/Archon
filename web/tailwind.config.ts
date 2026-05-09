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
          600: "#334155",
          500: "#4a5568",
          400: "#94a3b8",
          300: "#cbd5e1",
          200: "#e2e8f0",
          150: "#eaeef3",
          100: "#f1f5f9",
          50: "#f7f9fb",
        },
        surface: {
          canvas: "#f6f5f1",
          raised: "#ffffff",
          sunken: "#eeece6",
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
      boxShadow: {
        card: "0 1px 2px rgba(11, 14, 20, 0.04), 0 1px 1px rgba(11, 14, 20, 0.03)",
        raised:
          "0 1px 2px rgba(11, 14, 20, 0.05), 0 4px 12px -4px rgba(11, 14, 20, 0.06)",
        elevated:
          "0 4px 12px -2px rgba(11, 14, 20, 0.08), 0 12px 32px -8px rgba(11, 14, 20, 0.10)",
        header: "0 1px 0 rgba(11, 14, 20, 0.06)",
      },
      borderRadius: {
        sm: "4px",
      },
    },
  },
  plugins: [],
};
export default config;
