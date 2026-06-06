import type { Metadata } from "next";
import "./globals.css";
import { Toaster } from "react-hot-toast";
import { AuthProvider } from "@/components/AuthProvider";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "OrthoClinic",
  description: "Sistema de gestão de consultório ortopédico",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>
        <Providers>
          <AuthProvider>
            {children}
            <Toaster position="top-right" />
          </AuthProvider>
        </Providers>
      </body>
    </html>
  );
}
