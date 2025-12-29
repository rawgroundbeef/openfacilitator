'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ShieldCheck } from 'lucide-react';
import { useAuth } from '@/components/auth/auth-provider';
import { WalletDropdown } from '@/components/wallet-dropdown';
import { ThemeToggle } from '@/components/theme-toggle';

export function Navbar() {
  const pathname = usePathname();
  const { isAuthenticated, isLoading } = useAuth();

  const isDocsPage = pathname === '/docs';

  return (
    <nav className="fixed top-0 w-full z-50 border-b border-border/50 backdrop-blur-xl bg-background/80">
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center">
            <ShieldCheck className="w-5 h-5 text-primary-foreground" />
          </div>
          <span className="font-bold text-xl tracking-tight">OpenFacilitator</span>
        </Link>
        <div className="flex items-center space-x-8">
          <Link
            href="/docs"
            className={`text-sm transition-colors ${
              isDocsPage
                ? 'text-gray-900 dark:text-gray-100 font-medium'
                : 'text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100'
            }`}
          >
            Docs
          </Link>
          <a
            href="https://github.com/rawgroundbeef/openfacilitator"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100 transition-colors"
          >
            GitHub
          </a>

          <ThemeToggle />

          {/* Auth-aware section */}
          {isLoading ? (
            <div className="w-20 h-8 bg-muted rounded animate-pulse" />
          ) : isAuthenticated ? (
            <WalletDropdown />
          ) : (
            <Link
              href="/auth/signin"
              className="text-sm text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100 transition-colors"
            >
              Sign In
            </Link>
          )}
        </div>
      </div>
    </nav>
  );
}
