import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: { extend: { colors: { brand: "#0e7490" } } },
  plugins: [],
} satisfies Config;
