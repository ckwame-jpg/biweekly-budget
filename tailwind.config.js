/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#143226",
        inksoft: "#2C4A3B",
        paper: "#EEF4EF",
        primary: "#18895A",
        primarybright: "#2FB37A",
        coral: "#E2563B",
        gold: "#E8A33D",
        muted: "#6B7C72",
        hair: "#DCE5DE"
      }
    }
  },
  plugins: []
};
