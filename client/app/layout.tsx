import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Boops!",
  description: "Spatial audio chat — boop when you're close, oops when you're not.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-gray-950 text-white antialiased">{children}</body>
    </html>
  );
}
