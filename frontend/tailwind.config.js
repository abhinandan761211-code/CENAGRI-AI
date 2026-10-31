/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        display: ["Poppins", "Inter", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      colors: {
        brand: {
          50: "#f0fdf4",
          100: "#dcfce7",
          200: "#bbf7d0",
          300: "#86efac",
          400: "#4ade80",
          500: "#22c55e",
          600: "#16a34a",
          700: "#15803d",
          800: "#166534",
          900: "#14532d",
          950: "#052e16",
        },
        forest: {
          DEFAULT: "#1d4b3a",
          dark: "#12352a",
          light: "#2b6350",
        },
        cream: "#f7faf5",
        sand: "#f0f4ea",
      },
      boxShadow: {
        card: "0 1px 2px rgba(16, 42, 32, 0.04), 0 8px 24px -12px rgba(16, 42, 32, 0.18)",
        "card-hover": "0 2px 4px rgba(16, 42, 32, 0.06), 0 18px 40px -16px rgba(16, 42, 32, 0.28)",
      },
      borderRadius: {
        xl2: "1rem",
      },
      backgroundImage: {
        "hero-grass": "linear-gradient(180deg, rgba(247,250,245,0) 60%, #f7faf5 100%)",
      },
      keyframes: {
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(16px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "fade-up": "fade-up 0.6s ease-out both",
      },
    },
  },
  plugins: [],
};
