import { ConnectButton } from '@rainbow-me/rainbowkit';
import '../styles/Header.css';

export function Header() {
  return (
    <header className="header">
      <div className="header-container">
        <div className="brand">
          <div className="brand-mark">VG</div>
          <div>
            <h1>VaultGrid</h1>
            <p>Confidential documents on Sepolia FHEVM</p>
          </div>
        </div>
        <div className="header-actions">
          <span className="network-pill">Sepolia</span>
          <ConnectButton />
        </div>
      </div>
    </header>
  );
}
