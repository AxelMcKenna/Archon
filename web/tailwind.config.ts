import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          900: "#0b0e14",
          800: "#131822",
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
          canvas: "#FFFFFF",
          raised: "#FFFFFF",
          sunken: "#EEF2F8",
          elevated: "#FFFFFF",
        },
        accent: { DEFAULT: "#0f766e", soft: "#ccfbf1" },
        brand: {
          50: "#EEF2FF",
          100: "#E0E7FF",
          200: "#C7D2FE",
          300: "#A5B4FC",
          400: "#818CF8",
          500: "#6366F1",
          600: "#4F46E5",
          700: "#4338CA",
          800: "#3730A3",
          900: "#312E81",
        },
        steel: {
          50: "#F4F5F8",
          100: "#E5E7EE",
          200: "#CBD0DC",
          300: "#9AA3B5",
          400: "#6B7588",
          500: "#475569",
          600: "#334155",
          700: "#1E293B",
          800: "#111827",
          900: "#0B1120",
        },
        cyan: {
          500: "#06b6d4",
        },
      },
      fontFamily: {
        sans: ["var(--font-inter)", "ui-sans-serif", "system-ui", "sans-serif"],
        display: ["var(--font-dm-sans)", "var(--font-inter)", "ui-sans-serif", "sans-serif"],
        mono: ["var(--font-jetbrains)", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      boxShadow: {
        card: "0 1px 2px rgba(11, 14, 20, 0.04), 0 1px 1px rgba(11, 14, 20, 0.03)",
        raised:
          "0 1px 2px rgba(11, 14, 20, 0.05), 0 4px 12px -4px rgba(11, 14, 20, 0.06)",
        elevated:
          "0 4px 12px -2px rgba(11, 14, 20, 0.08), 0 12px 32px -8px rgba(11, 14, 20, 0.10)",
        header: "0 1px 0 rgba(11, 14, 20, 0.06)",
        // Layered depth tuned for same-color (off-white) card on off-white canvas.
        // Stronger hairline + brighter inset highlight + tighter contact shadow + soft cast.
        depth:
          "0 0 0 1px rgba(15,17,21,0.07), inset 0 1px 0 rgba(255,255,255,0.85), 0 1px 1px rgba(15,17,21,0.03), 0 3px 8px -2px rgba(15,17,21,0.08), 0 8px 20px -8px rgba(15,17,21,0.06)",
        "depth-hover":
          "0 0 0 1px rgba(15,17,21,0.12), inset 0 1px 0 rgba(255,255,255,0.9), 0 2px 3px rgba(15,17,21,0.04), 0 8px 16px -4px rgba(15,17,21,0.10), 0 18px 32px -10px rgba(15,17,21,0.10)",
        inset:
          "inset 0 1px 2px rgba(15,17,21,0.07), inset 0 0 0 1px rgba(15,17,21,0.04)",
        "elevated":
          "0 0 0 1px rgba(15,17,21,0.08), inset 0 1px 0 rgba(255,255,255,0.9), 0 12px 28px -8px rgba(15,17,21,0.18), 0 24px 48px -16px rgba(15,17,21,0.14)",
      },
      borderRadius: {
        sm: "4px",
      },
    },
  },
  plugins: [],
};
export default config;
