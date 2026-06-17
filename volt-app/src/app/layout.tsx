import type { Metadata } from "next";
import { Inter, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/context/AuthContext";
import CursorEffect from "@/components/ui/CursorEffect";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Volt Transportation | Columbus GA to Atlanta Airport Shuttle",
    template: "%s | Volt Transportation",
  },
  description:
    "Premium airport shuttle service between Columbus, GA and Atlanta Airport (ATL). Comfortable Mercedes Sprinters, professional drivers, and reliable schedules.",
  keywords: [
    "Columbus GA to Atlanta Airport Shuttle",
    "Columbus GA airport transportation",
    "ATL airport shuttle Columbus Georgia",
    "airport shuttle service Columbus GA",
  ],
  metadataBase: new URL("https://volttransportation.com"),
  openGraph: {
    type: "website",
    siteName: "Volt Transportation",
    title: "Volt Transportation | Columbus GA to Atlanta Airport Shuttle",
    description:
      "Premium airport shuttle service between Columbus, GA and Atlanta Airport (ATL).",
  },
  twitter: {
    card: "summary_large_image",
    title: "Volt Transportation | Columbus GA to Atlanta Airport Shuttle",
    description:
      "Premium airport shuttle service between Columbus, GA and Atlanta Airport (ATL).",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${geistMono.variable} h-full`}
    >
      <body className="min-h-full flex flex-col bg-[#0A0A0A] text-white antialiased">
        {/* Failsafe: reveal any scroll-reveal sections that haven't been shown
            (e.g. if hydration is delayed or an observer never fires) so the
            page can never be left permanently blank. Runs outside React. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `setTimeout(function(){document.querySelectorAll('.sr-init:not(.sr-visible)').forEach(function(el){el.classList.add('sr-visible')})},2500);`,
          }}
        />
        <CursorEffect />
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
