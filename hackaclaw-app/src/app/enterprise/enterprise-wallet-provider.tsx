"use client";

import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import dynamic from "next/dynamic";

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

/**
 * Dynamically loaded Privy bridge — only loads when PRIVY_APP_ID is set
 * and @privy-io/react-auth is installed. Falls back gracefully.
 */
const PrivyBridge = PRIVY_APP_ID
  ? dynamic(
      () =>
        import("@privy-io/react-auth").then((mod) => {
          const { PrivyProvider, usePrivy, useWallets } = mod;

          function WalletBridge({ children }: { children: ReactNode }) {
            const { login, authenticated, ready } = usePrivy();
            const { wallets } = useWallets();
            const [connectedWallet, setConnectedWallet] = useState<SponsorWallet | null>(null);

            useEffect(() => {
              if (authenticated && wallets.length > 0) {
                const w = wallets[0];
                setConnectedWallet({
                  address: w.address,
                  getEthereumProvider: () => w.getEthereumProvider(),
                });
              } else {
                setConnectedWallet(null);
              }
            }, [authenticated, wallets]);

            return (
              <WalletContext.Provider
                value={{
                  login,
                  authenticated,
                  ready,
                  walletFeatureAvailable: true,
                  connectedWallet,
                  openWalletModal: login,
                }}
              >
                {children}
              </WalletContext.Provider>
            );
          }

          function PrivyWrapper({ children }: { children: ReactNode }) {
            return (
              <PrivyProvider
                appId={PRIVY_APP_ID!}
                config={{
                  appearance: { theme: "dark" },
                  embeddedWallets: {
                    ethereum: { createOnLogin: "users-without-wallets" },
                  },
                  loginMethods: ["wallet", "email"],
                }}
              >
                <WalletBridge>{children}</WalletBridge>
              </PrivyProvider>
            );
          }

          return PrivyWrapper;
        }),
      {
        ssr: false,
        loading: () => null,
      },
    )
  : null;

export function EnterpriseWalletProvider({ children }: { children: ReactNode }) {
  if (!PrivyBridge) {
    return (
      <WalletContext.Provider value={defaultValue}>
        {children}
      </WalletContext.Provider>
    );
  }

  return <PrivyBridge>{children}</PrivyBridge>;
}
