module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        "8bit": {
          bg: "#0d0d0d",
          panel: "#1a1a1a",
          border: "#333333",
          accent: "#2a5a4a",
          accentLight: "#3a7a6a",
          text: "#e8e8e8",
          muted: "#888888",
        },
      },
      fontFamily: {
        pixel: ["Doto", "monospace"],
        mono: ["Doto", "monospace"],
      },
      boxShadow: {
        "8bit": "4px 4px 0px 0px #2a5a4a",
        "8bitLg": "6px 6px 0px 0px #2a5a4a",
      },
    },
  },
  plugins: [],
};