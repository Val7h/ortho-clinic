import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: 'class',
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Primary — refined deep navy (premium, medical authority)
        brand: {
          25:  "#F9FBFD",
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
        // Accent — dourado (filete do tema A, Valth 03/11/2026)
        accent: {
          50:  "#FBF6EA",
          100: "#F5E9CC",
          200: "#ECD6A3",
          300: "#E0C07A",
          400: "#CFA95F",
          500: "#B8914A",  // main accent
          600: "#9A773A",
          700: "#7B5E2D",
          800: "#5C4622",
          900: "#3F3017",
        },
        // Success — medical green (positive outcomes)
        success: {
          50:  "#F0FDF4",
          100: "#DCFCE7",
          200: "#BBF7D0",
          300: "#86EFAC",
          400: "#4ADE80",
          500: "#22C55E",
          600: "#16A34A",
          700: "#15803D",
        },
        // Warning — medical amber
        warning: {
          50:  "#FFFBEB",
          100: "#FEF3C7",
          200: "#FCD34D",
          300: "#FCA5A5",
          400: "#F97316",
          500: "#EAB308",
          600: "#D97706",
          700: "#B45309",
        },
        // Error — clinical red
        error: {
          50:  "#FEF2F2",
          100: "#FEE2E2",
          200: "#FECACA",
          300: "#FCA5A5",
          400: "#F87171",
          500: "#EF4444",
          600: "#DC2626",
          700: "#B91C1C",
        },
        // Neutral — marfim/pedra quente (tema A "Clássico clínico", Valth 03/11/2026)
        slate: {
          25:  "#FDFCF8",
          50:  "#FAF7F0",
          100: "#F4EFE4",
          150: "#EEE7D8",
          200: "#E6DFCF",
          300: "#D3C9B4",
          400: "#A69B85",
          500: "#7A705E",
          600: "#5C5345",
          700: "#433C32",
          800: "#2A2620",
          900: "#1C1A16",
        },
      },
      fontFamily: {
        serif: ["var(--font-serif)", "Georgia", "serif"],
        sans: [
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "BlinkMacSystemFont",
          "\"Segoe UI\"",
          "Roboto",
          "\"Helvetica Neue\"",
          "Arial",
          "\"Noto Sans\"",
          "sans-serif",
          "\"Apple Color Emoji\"",
          "\"Segoe UI Emoji\"",
          "\"Segoe UI Symbol\"",
          "\"Noto Color Emoji\"",
        ],
      },
      fontSize: {
        // Refined typography scale
        xs: ["12px", { lineHeight: "16px", letterSpacing: "0.3px" }],
        sm: ["13px", { lineHeight: "18px", letterSpacing: "0.2px" }],
        base: ["14px", { lineHeight: "21px", letterSpacing: "0.15px" }],
        lg: ["16px", { lineHeight: "24px", letterSpacing: "0.1px" }],
        xl: ["18px", { lineHeight: "28px", letterSpacing: "0px" }],
        "2xl": ["20px", { lineHeight: "32px", letterSpacing: "-0.3px" }],
        "3xl": ["24px", { lineHeight: "36px", letterSpacing: "-0.5px" }],
        "4xl": ["32px", { lineHeight: "40px", letterSpacing: "-0.8px" }],
      },
      fontWeight: {
        thin: "100",
        extralight: "200",
        light: "300",
        normal: "400",
        medium: "500",
        semibold: "600",
        bold: "700",
        extrabold: "800",
        black: "900",
      },
      boxShadow: {
        // Premium shadows with refined opacity
        xs: "0 1px 2px 0 rgba(15, 45, 94, 0.04)",
        sm: "0 1px 3px 0 rgba(15, 45, 94, 0.08), 0 1px 2px -1px rgba(15, 45, 94, 0.06)",
        card: "0 2px 8px 0 rgba(15, 45, 94, 0.08), 0 1px 3px -1px rgba(15, 45, 94, 0.04)",
        "card-hover": "0 8px 24px 0 rgba(15, 45, 94, 0.12), 0 4px 8px -1px rgba(15, 45, 94, 0.08)",
        nav: "0 4px 12px 0 rgba(15, 45, 94, 0.1)",
        lg: "0 10px 28px -5px rgba(15, 45, 94, 0.12), 0 10px 10px -5px rgba(15, 45, 94, 0.04)",
        xl: "0 20px 40px -10px rgba(15, 45, 94, 0.12), 0 10px 16px -8px rgba(15, 45, 94, 0.08)",
      },
      borderRadius: {
        xs: "4px",
        sm: "6px",
        md: "8px",
        lg: "12px",
        xl: "16px",
        "2xl": "20px",
      },
      transition: {
        fast: "all 150ms cubic-bezier(0.4, 0, 0.2, 1)",
        base: "all 200ms cubic-bezier(0.4, 0, 0.2, 1)",
        slow: "all 300ms cubic-bezier(0.4, 0, 0.2, 1)",
      },
      backgroundImage: {
        "nav-gradient": "linear-gradient(135deg, #0F2D5E 0%, #1A4A9A 100%)",
        "card-gradient": "linear-gradient(135deg, var(--tw-gradient-from) 0%, var(--tw-gradient-to) 100%)",
        "subtle-gradient": "linear-gradient(135deg, #F8FAFC 0%, #EEF3FB 100%)",
      },
      animation: {
        "fade-in": "fadeIn 200ms ease-in-out",
        "slide-in-up": "slideInUp 300ms ease-out",
        "pulse-subtle": "pulseSubtle 2s cubic-bezier(0.4, 0, 0.6, 1) infinite",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        slideInUp: {
          "0%": { transform: "translateY(8px)", opacity: "0" },
          "100%": { transform: "translateY(0)", opacity: "1" },
        },
        pulseSubtle: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.5" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
