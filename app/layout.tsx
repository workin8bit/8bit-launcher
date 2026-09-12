import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "8bitAI — Personal Agent",
  description: "Level 4 Autonomous AI Agent",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
        <link
          href="https://fonts.googleapis.com/css2?family=Doto:wght@400;500;600;700;800;900&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-screen bg-8bit-bg text-8bit-text font-mono">
        {children}
      </body>
    </html>
  );
}