import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { auth } from "@clerk/nextjs/server";
import { CreditHeader } from "@/components/credit-header";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "SpecForge",
  description: "Keep your AI coding tool on track past prompt 20.",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const { userId } = await auth();

  return (
    <ClerkProvider signInFallbackRedirectUrl="/projects" signUpFallbackRedirectUrl="/projects" afterSignOutUrl="/">
      <html
        lang="en"
        className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      >
        <body className="min-h-full flex flex-col">
          {userId && <CreditHeader />}
          {children}
        </body>
      </html>
    </ClerkProvider>
  );
}
