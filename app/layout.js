import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";

export const metadata = {
  title: "Arlo Clipper — AI Video Clipping Tool",
  description: "Turn long videos into high-quality viral clips with AI-powered analysis. Extract the best moments automatically.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body style={{ fontFamily: 'var(--font-geist-sans), system-ui, sans-serif' }}>
        {children}
      </body>
    </html>
  );
}
