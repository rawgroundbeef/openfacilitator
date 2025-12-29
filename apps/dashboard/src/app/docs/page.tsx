'use client';

import Link from 'next/link';
import { ShieldCheck, Github } from 'lucide-react';
import { Navbar } from '@/components/navbar';

function CodeBlock({ children, filename }: { children: string; filename?: string }) {
  return (
    <div className="rounded-xl bg-[#0d1117] border border-border/50 overflow-hidden">
      {filename && (
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border/50 bg-[#161b22]">
          <div className="flex gap-1.5">
            <div className="w-3 h-3 rounded-full bg-[#ff5f56]"></div>
            <div className="w-3 h-3 rounded-full bg-[#ffbd2e]"></div>
            <div className="w-3 h-3 rounded-full bg-[#27ca40]"></div>
          </div>
          <span className="text-xs text-gray-500 ml-2">{filename}</span>
        </div>
      )}
      <pre className="p-4 text-sm overflow-x-auto">
        <code className="text-[#c9d1d9]">{children}</code>
      </pre>
    </div>
  );
}

export default function DocsPage() {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      {/* Content */}
      <main className="pt-24 pb-20 px-6">
        <div className="max-w-3xl mx-auto">
          {/* Anchor Nav */}
          <nav className="mb-16 flex flex-wrap gap-x-8 gap-y-2 text-sm">
            <a href="#quick-start" className="text-gray-600 hover:text-gray-900 transition-colors">Quick Start</a>
            <a href="#how-it-works" className="text-gray-600 hover:text-gray-900 transition-colors">How It Works</a>
            <a href="#api-reference" className="text-gray-600 hover:text-gray-900 transition-colors">API Reference</a>
            <a href="#supported-networks" className="text-gray-600 hover:text-gray-900 transition-colors">Supported Networks</a>
            <a href="#faq" className="text-gray-600 hover:text-gray-900 transition-colors">FAQ</a>
          </nav>

          {/* Quick Start */}
          <section id="quick-start" className="mb-20">
            <h1 className="text-3xl font-bold mb-6">Quick Start</h1>
            <CodeBlock filename="app.ts">{`import { createPaymentHandler } from '@x402/facilitator';

const handler = createPaymentHandler({
  facilitatorUrl: 'https://x402.openfacilitator.io'
});

// That's it. Start accepting payments.`}</CodeBlock>
          </section>

          {/* How It Works */}
          <section id="how-it-works" className="mb-20">
            <h2 className="text-3xl font-bold mb-8">How It Works</h2>

            <div className="space-y-8">
              <div>
                <h3 className="text-lg font-semibold mb-2">1. Your app requests payment</h3>
                <p className="text-gray-600">
                  When a user hits a paid endpoint, your server returns a 402 response with payment details.
                </p>
              </div>

              <div>
                <h3 className="text-lg font-semibold mb-2">2. User signs with their wallet</h3>
                <p className="text-gray-600">
                  The x402 client prompts the user to sign a payment authorization. No gas fees—they&apos;re just signing, not submitting a transaction.
                </p>
              </div>

              <div>
                <h3 className="text-lg font-semibold mb-2">3. Facilitator settles</h3>
                <p className="text-gray-600">
                  OpenFacilitator verifies the signature and submits the transaction on-chain. Funds go directly to your wallet.
                </p>
              </div>
            </div>

            <p className="mt-8 text-gray-600 border-l-2 border-gray-200 pl-4">
              You never touch private keys. We never hold funds. It&apos;s non-custodial end to end.
            </p>
          </section>

          {/* API Reference */}
          <section id="api-reference" className="mb-20">
            <h2 className="text-3xl font-bold mb-4">API Reference</h2>
            <p className="text-gray-600 mb-8">
              <span className="font-medium text-foreground">Base URL:</span>{' '}
              <code className="text-sm bg-gray-100 px-2 py-1 rounded">https://x402.openfacilitator.io</code>
            </p>

            <div className="space-y-10">
              {/* GET /supported */}
              <div>
                <div className="flex items-center gap-3 mb-4">
                  <span className="px-2 py-1 rounded text-xs font-bold bg-gray-500/20 text-gray-500">GET</span>
                  <code className="text-lg font-mono">/supported</code>
                </div>
                <p className="text-gray-600 mb-4">Returns supported networks and tokens.</p>
                <CodeBlock>{`{
  "networks": ["base", "solana"],
  "tokens": ["USDC"]
}`}</CodeBlock>
              </div>

              {/* POST /verify */}
              <div>
                <div className="flex items-center gap-3 mb-4">
                  <span className="px-2 py-1 rounded text-xs font-bold bg-blue-500/20 text-blue-400">POST</span>
                  <code className="text-lg font-mono">/verify</code>
                </div>
                <p className="text-gray-600 mb-4">Verify a payment signature is valid before settling.</p>
                <CodeBlock>{`// Request
{
  "payment": "...",
  "signature": "..."
}

// Response
{
  "valid": true
}`}</CodeBlock>
              </div>

              {/* POST /settle */}
              <div>
                <div className="flex items-center gap-3 mb-4">
                  <span className="px-2 py-1 rounded text-xs font-bold bg-blue-500/20 text-blue-400">POST</span>
                  <code className="text-lg font-mono">/settle</code>
                </div>
                <p className="text-gray-600 mb-4">Submit the transaction to the blockchain.</p>
                <CodeBlock>{`// Request
{
  "payment": "...",
  "signature": "..."
}

// Response
{
  "txHash": "0x...",
  "network": "base"
}`}</CodeBlock>
              </div>
            </div>
          </section>

          {/* Supported Networks */}
          <section id="supported-networks" className="mb-20">
            <h2 className="text-3xl font-bold mb-6">Supported Networks</h2>
            <div className="border border-border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Network</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Environment</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Token</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  <tr>
                    <td className="px-4 py-3 font-medium">Base</td>
                    <td className="px-4 py-3 text-gray-600">Mainnet</td>
                    <td className="px-4 py-3 text-gray-600">USDC</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3 font-medium">Solana</td>
                    <td className="px-4 py-3 text-gray-600">Mainnet</td>
                    <td className="px-4 py-3 text-gray-600">USDC</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          {/* FAQ */}
          <section id="faq" className="mb-20">
            <h2 className="text-3xl font-bold mb-8">FAQ</h2>
            <div className="space-y-8">
              <div>
                <h3 className="font-semibold mb-2">Is this really free?</h3>
                <p className="text-gray-600">Yes. No fees, no API keys, no account required.</p>
              </div>

              <div>
                <h3 className="font-semibold mb-2">What&apos;s the catch?</h3>
                <p className="text-gray-600">We&apos;re building the x402 ecosystem. More facilitator usage = more adoption = good for everyone.</p>
              </div>

              <div>
                <h3 className="font-semibold mb-2">Is it non-custodial?</h3>
                <p className="text-gray-600">Yes. We verify and submit transactions, but funds go directly from payer to your wallet. We never hold funds.</p>
              </div>

              <div>
                <h3 className="font-semibold mb-2">Any rate limits?</h3>
                <p className="text-gray-600">Not currently. If you&apos;re doing serious volume, consider the paid tiers for dedicated infrastructure.</p>
              </div>

              <div>
                <h3 className="font-semibold mb-2">What if OpenFacilitator goes down?</h3>
                <p className="text-gray-600">Payments would fail to settle until it&apos;s back up, but no funds are at risk. You can also self-host—it&apos;s open source.</p>
              </div>

              <div>
                <h3 className="font-semibold mb-2">Can I use this on testnet?</h3>
                <p className="text-gray-600">Not yet. Mainnet only for now.</p>
              </div>
            </div>
          </section>
        </div>
      </main>

      {/* Footer */}
      <footer className="py-10 px-6 border-t border-border">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center">
              <ShieldCheck className="w-4 h-4 text-primary-foreground" />
            </div>
            <span className="font-semibold">OpenFacilitator</span>
          </div>
          <p className="text-sm text-muted-foreground">
            Open source under Apache 2.0 license
          </p>
          <div className="flex items-center gap-4">
            <Link href="/docs" className="text-muted-foreground hover:text-foreground transition-colors text-sm">
              Docs
            </Link>
            <Link href="https://github.com/rawgroundbeef/openfacilitator" className="text-muted-foreground hover:text-foreground transition-colors">
              <Github className="w-5 h-5" />
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
