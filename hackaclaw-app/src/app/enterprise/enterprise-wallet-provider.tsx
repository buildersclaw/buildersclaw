"use client";

import { createContext, useContext, useState, useEffect, type ReactNode } from "react";

type SponsorWallet = {
  address: string;
  getEthereumProvider: () => Promise<unknown>;
};

type WalletContextValue = {
  login: () => void;
  authenticated: boolean;
  ready: boolean;
  walletFeatureAvailable: boolean;
  connectedWallet: SponsorWallet | null;
  openWalletModal: () => void;
};

const defaultValue: WalletContextValue = {
  login: () => {},
  authenticated: false,
  ready: false,
  walletFeatureAvailable: false,
  connectedWallet: null,
  openWalletModal: () => {},
};

const WalletContext = createContext<WalletContextValue>(defaultValue);

export function useEnterpriseWallet() {
  return useContext(WalletContext);
}

const PRIVY_APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID;

/* 
 * Opaque module name — prevents bundler from statically resolving the import.
 * At runtime the string is just "@privy-io/react-auth".
 */
const PRIVY_MODULE = ["@privy-io", "react-auth"].join("/");

function PrivyBridgeLoader({ children }: { children: ReactNode }) {
  const [Bridge, setBridge] = useState<React.ComponentType<{ children: ReactNode }> | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!PRIVY_APP_ID) { setReady(true); return; }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (new Function("m", "return import(m)"))(PRIVY_MODULE)
      .then((mod: Record<string, unknown>) => {
        if (!mod || !mod.PrivyProvider) { setReady(true); return; }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { PrivyProvider, usePrivy, useWallets } = mod as any;

        function WalletBridge({ children: c }: { children: ReactNode }) {
          const privy = usePrivy();
          const { wallets } = useWallets();
          const [wallet, setWallet] = useState<SponsorWallet | null>(null);

          useEffect(() => {
            if (privy.authenticated && wallets.length > 0) {
              const w = wallets[0];
              setWallet({ address: w.address, getEthereumProvider: () => w.getEthereumProvider() });
            } else {
              setWallet(null);
            }
          }, [privy.authenticated, wallets]);

          return (
            <WalletContext.Provider value={{
              login: privy.login, authenticated: privy.authenticated, ready: privy.ready,
              walletFeatureAvailable: true, connectedWallet: wallet, openWalletModal: privy.login,
            }}>{c}</WalletContext.Provider>
          );
        }

        function Wrapper({ children: c }: { children: ReactNode }) {
          return (
            <PrivyProvider appId={PRIVY_APP_ID!} config={{
              appearance: { theme: "dark" },
              embeddedWallets: { ethereum: { createOnLogin: "users-without-wallets" } },
              loginMethods: ["wallet", "email"],
            }}>
              <WalletBridge>{c}</WalletBridge>
            </PrivyProvider>
          );
        }

        setBridge(() => Wrapper);
        setReady(true);
      })
      .catch(() => setReady(true));
  }, []);

  if (!ready) return null;
  if (Bridge) return <Bridge>{children}</Bridge>;
  return <WalletContext.Provider value={defaultValue}>{children}</WalletContext.Provider>;
}

export function EnterpriseWalletProvider({ children }: { children: ReactNode }) {
  if (!PRIVY_APP_ID) {
    return <WalletContext.Provider value={defaultValue}>{children}</WalletContext.Provider>;
  }
  return <PrivyBridgeLoader>{children}</PrivyBridgeLoader>;
}
