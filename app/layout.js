import { Inter, Playfair_Display } from "next/font/google";
import "@cloudflare/kumo/styles/standalone";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const playfair = Playfair_Display({
  variable: "--font-playfair",
  subsets: ["latin"],
});

export const metadata = {
  title: "Clipify - AI Video Clipper",
  description: "Turn YouTube videos into viral clips instantly.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${inter.variable} ${playfair.variable}`} data-mode="dark">
      <body className="bg-kumo-canvas text-kumo-default antialiased min-h-screen">
        {children}
      </body>
    </html>
  );
}
