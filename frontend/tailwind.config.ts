import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Primary — deep navy (ModMed-inspired authority/trust)
        brand: {
          50:  "#EEF3FB",
          100: "#D5E2F5",
          200: "#AABFEA",
          300: "#7096D8",
          400: "#3D6BBF",
          500: "#1A4A9A",
          600: "#0F2D5E",  // main primary
          700: "#0B2248",
          800: "#071530",
          900: "#030B1C",
        },
        // Accent — medical teal/cyan (DrChrono-inspired clarity)
        accent: {
          50:  "#ECFEFF",
          100: "#CFFAFE",
          200: "#A5F3FC",
          300: "#67E8F9",
          400: "#22D3EE",
          500: "#06B6D4",  // main accent
          600: "#0891B2",
          700: "#0E7490",
          800: "#155E75",
          900: "#164E63",
        },
        // Neutral — cool slate (clinical, not warm)
        slate: {
          50:  "#F8FAFC",
          100: "#F1F5F9",
          200: "#E2E8F0",
          300: "#CBD5E1",
          400: "#94A3B8",
          500: "#64748B",
          600: "#475569",
          700: "#334155",
          800: "#1E293B",
          900: "#0F172A",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
      },
      boxShadow: {
        card:  "0 1px 3px 0 rgba(15,45,94,0.08), 0 1px 2px -1px rgba(15,45,94,0.06)",
        "card-hover": "0 4px 12px 0 rgba(15,45,94,0.12), 0 2px 4px -1px rgba(15,45,94,0.08)",
        nav:   "0 2px 8px 0 rgba(15,45,94,0.25)",
      },
      backgroundImage: {
        "nav-gradient": "linear-gradient(135deg, #0F2D5E 0%, #1A4A9A 100%)",
        "card-gradient": "linear-gradient(135deg, var(--tw-gradient-from) 0%, var(--tw-gradient-to) 100%)",
      },
    },
  },
  plugins: [],
};

export default config;
