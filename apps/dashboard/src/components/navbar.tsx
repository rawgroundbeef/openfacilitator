'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu, X, Trophy } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/components/auth/auth-provider';
import { WalletDropdown } from '@/components/wallet-dropdown';
import { ThemeToggle } from '@/components/theme-toggle';
import { api } from '@/lib/api';

function formatTokenAmount(amount: string): string {
  const value = Number(amount) / 1_000_000;
  if (value >= 1000) {
    return `${Math.round(value / 1000)}K`;
  }
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

export function Navbar() {
  const pathname = usePathname();
  const { isAuthenticated, isLoading, isAdmin } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [bannerDismissed, setBannerDismissed] = useState(true); // Start true to avoid flash

  const { data: activeCampaign } = useQuery({
    queryKey: ['activeCampaign'],
    queryFn: () => api.getActiveCampaign(),
  });

  const daysRemaining = activeCampaign?.campaign
    ? Math.max(0, Math.ceil(
        (new Date(activeCampaign.campaign.ends_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
      ))
    : 0;

  useEffect(() => {
    const dismissed = localStorage.getItem('rewards-banner-dismissed');
    if (!dismissed) {
      setBannerDismissed(false);
    }
  }, []);

  const dismissBanner = () => {
    localStorage.setItem('rewards-banner-dismissed', 'true');
    setBannerDismissed(true);
  };

  const isDocsPage = pathname?.startsWith('/docs');
  const showBanner = !bannerDismissed && activeCampaign?.campaign;

  const closeMobileMenu = () => setMobileMenuOpen(false);

  return (
    <>
      {/* Rewards Banner */}
      {showBanner && (
        <div className="fixed top-0 w-full z-[60] bg-blue-600 text-white">
          <div className="px-4 py-2.5 flex items-center justify-center gap-3 text-sm">
            <Trophy className="w-4 h-4 text-yellow-400 flex-shrink-0" />
            <span>
              Earn $OPEN on your volume — rewards are live
            </span>
            <Link
              href="/rewards"
              className="font-medium text-blue-200 hover:text-white transition-colors whitespace-nowrap"
            >
              Learn more →
            </Link>
          </div>
          <button
            onClick={dismissBanner}
            className="absolute right-4 top-1/2 -translate-y-1/2 p-1 hover:bg-white/10 rounded transition-colors"
            aria-label="Dismiss banner"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <nav className={`fixed w-full z-50 border-b border-border/50 backdrop-blur-xl bg-background/80 ${showBanner ? 'top-10' : 'top-0'}`}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
        {/* Logo - always visible */}
        <Link href="/" className="flex items-center gap-2.5" onClick={closeMobileMenu}>
          <img src="/icon.svg" alt="" className="w-9 h-9" />
          <span className="font-bold text-xl tracking-tight">OpenFacilitator</span>
        </Link>

        {/* Desktop nav - hidden on mobile */}
        <div className="hidden md:flex items-center space-x-8">
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
            <div className="flex items-center gap-2">
              {isAdmin && (
                <span className="text-xs px-2 py-0.5 rounded bg-muted text-muted-foreground font-medium">
                  Admin
                </span>
              )}
              <WalletDropdown />
            </div>
          ) : (
            <Link
              href="/auth/signin"
              className="text-sm text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100 transition-colors"
            >
              Sign In
            </Link>
          )}
        </div>

        {/* Mobile hamburger - visible on mobile only */}
        <button
          type="button"
          className="md:hidden p-2 -mr-2 text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100 transition-colors"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          aria-label="Toggle menu"
        >
          {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </div>

      {/* Mobile menu - slides down when open */}
      {mobileMenuOpen && (
        <div className="md:hidden border-t border-border/50 bg-background backdrop-blur-xl">
          <div className="max-w-7xl mx-auto px-4 py-4 space-y-1">
            <Link
              href="/docs"
              className={`block px-3 py-3 rounded-lg text-sm transition-colors ${
                isDocsPage
                  ? 'bg-primary/10 text-primary font-medium'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-muted dark:text-gray-400 dark:hover:text-gray-100'
              }`}
              onClick={closeMobileMenu}
            >
              Docs
            </Link>
            <a
              href="https://github.com/rawgroundbeef/openfacilitator"
              target="_blank"
              rel="noopener noreferrer"
              className="block px-3 py-3 rounded-lg text-sm text-gray-600 hover:text-gray-900 hover:bg-muted dark:text-gray-400 dark:hover:text-gray-100 transition-colors"
              onClick={closeMobileMenu}
            >
              GitHub
            </a>
            
            <div className="flex items-center justify-between px-3 py-3">
              <span className="text-sm text-gray-600 dark:text-gray-400">Theme</span>
              <ThemeToggle />
            </div>

            <div className="pt-2 border-t border-border/50">
              {isLoading ? (
                <div className="px-3 py-3">
                  <div className="w-full h-10 bg-muted rounded animate-pulse" />
                </div>
              ) : isAuthenticated ? (
                <div className="px-3 py-3">
                  <div className="flex items-center gap-2">
                    {isAdmin && (
                      <span className="text-xs px-2 py-0.5 rounded bg-muted text-muted-foreground font-medium">
                        Admin
                      </span>
                    )}
                    <WalletDropdown />
                  </div>
                </div>
              ) : (
                <Link
                  href="/auth/signin"
                  className="block px-3 py-3 rounded-lg text-sm text-center bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                  onClick={closeMobileMenu}
                >
                  Sign In
                </Link>
              )}
            </div>
          </div>
        </div>
      )}
    </nav>

    {/* Extra spacer when banner is shown */}
    {showBanner && <div className="h-10" />}
    </>
  );
}
