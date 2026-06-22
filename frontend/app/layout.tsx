import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Toaster } from "react-hot-toast";
import { AuthProvider } from "@/components/AuthProvider";
import { Providers } from "./providers";
import { NavigationProvider } from "@/components/navigation/NavigationProvider";
import { DeepLinkHandler } from "@/components/navigation/DeepLinkHandler";

/**
 * Self-hosted Inter via next/font/google
 *
 * WHY: The @import url(fonts.googleapis.com) in globals.css triggers an
 * extra DNS+TLS+download round-trip (~300-500ms on mobile cold start).
 * next/font/google downloads the font at BUILD TIME, hashes the filename,
 * serves it from the same origin, and injects a <link rel="preload"> in
 * <head> — eliminating the third-party font latency entirely.
 *
 * Sprint 6 target: FCP < 2.0s. Google Fonts was costing us ~400ms alone.
 *
 * subsets: ['latin'] keeps the font file small (skip Cyrillic/Greek/etc.)
 * display: 'swap' ensures text is readable during font load (no FOIT)
 * variable: '--font-inter' referenced in globals.css font-family
 * preload: true (default) — adds <link rel="preload as="font"> in <head>
 */
const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
  // Only the weights actually used in the design system
  weight: ["400", "500", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: "OrthoClinic",
  description: "Sistema de gestão de consultório ortopédico",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "OrthoClinic",
  },
};

export const viewport: Viewport = {
  /*
   * themeColor per prefers-color-scheme so the browser chrome matches the app.
   * Light = brand-600 (#0F2D5E), Dark = slate-950 (#020617).
   */
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#0F2D5E" },
    { media: "(prefers-color-scheme: dark)",  color: "#020617" },
  ],
  width: "device-width",
  initialScale: 1,
  /*
   * WCAG 1.4.4 (Resize Text) and 1.4.10 (Reflow):
   * maximumScale and userScalable must NOT prevent zoom.
   * We removed maximumScale: 1 and userScalable: false.
   * Mobile layout uses responsive units (rem, %, vw) that reflow correctly.
   */
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    /*
     * lang="pt-BR" — required by WCAG 3.1.1 (Language of Page).
     * dir="ltr"    — explicit for RTL future-proofing; CSS vars --oc-start/--oc-end
     *                flip automatically when dir="rtl" is set at runtime.
     * suppressHydrationWarning — next-themes injects .dark class server→client;
     *                           without this React warns about className mismatch.
     */
    <html lang="pt-BR" dir="ltr" className={inter.variable} suppressHydrationWarning>
      <body suppressHydrationWarning>
        {/*
         * Skip-to-content link (WCAG 2.4.1 — Bypass Blocks).
         * Visually hidden until focused; keyboard users can jump past the NavBar.
         * The anchor target <main id="main-content"> is in the layout below.
         */}
        <a href="#main-content" className="skip-to-content">
          Pular para o conteúdo principal
        </a>

        <Providers>
          <AuthProvider>
            <NavigationProvider>
              {/* DeepLinkHandler manages its own internal Suspense for useSearchParams */}
              <DeepLinkHandler />

              {/*
               * pb-16 reserva espaço para o BottomTabBar em mobile (64px).
               * lg:pb-0 remove o padding em desktop onde a Sidebar ocupa o espaço lateral.
               */}
              <div className="min-h-screen flex flex-col">
                {/*
                 * id="main-content" is the skip-link target (WCAG 2.4.1).
                 * tabIndex={-1} allows the link to programmatically focus this
                 * element without making it appear in the natural tab order.
                 */}
                <main id="main-content" tabIndex={-1} className="flex-1 pb-16 lg:pb-0 outline-none">
                  {children}
                </main>
              </div>

              <Toaster
                position="top-center"
                toastOptions={{
                  duration: 3500,
                  style: { maxWidth: 360 },
                }}
              />
            </NavigationProvider>
          </AuthProvider>
        </Providers>
      </body>
    </html>
  );
}
