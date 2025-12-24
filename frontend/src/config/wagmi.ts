import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import { sepolia } from 'wagmi/chains';

export const config = getDefaultConfig({
  appName: 'VaultGrid',
  projectId: 'vaultgrid-demo',
  chains: [sepolia],
  ssr: false,
});
