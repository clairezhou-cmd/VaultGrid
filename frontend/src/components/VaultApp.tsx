import { useEffect, useMemo, useState } from 'react';
import { useAccount, usePublicClient } from 'wagmi';
import { Contract, Wallet, isAddress } from 'ethers';
import { CONTRACT_ADDRESS, CONTRACT_ABI } from '../config/contracts';
import { useEthersSigner } from '../hooks/useEthersSigner';
import { useZamaInstance } from '../hooks/useZamaInstance';
import '../styles/VaultApp.css';

type DocumentItem = {
  id: bigint;
  name: string;
  encryptedBody: string;
  encryptedKey: `0x${string}`;
  owner: `0x${string}`;
  createdAt: bigint;
  updatedAt: bigint;
};

type DocumentStateMap = Record<string, string>;

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

function shortAddress(address?: string) {
  if (!address) return '--';
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

function base64ToBytes(base64: string) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function hexToBytes(hex: string) {
  const normalized = hex.startsWith('0x') ? hex.slice(2) : hex;
  const bytes = new Uint8Array(normalized.length / 2);
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = parseInt(normalized.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

async function deriveAesKey(address: string) {
  const hash = await crypto.subtle.digest('SHA-256', hexToBytes(address));
  return crypto.subtle.importKey('raw', hash, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

async function encryptWithAddressKey(plainText: string, address: string) {
  const key = await deriveAesKey(address);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = textEncoder.encode(plainText);
  const cipherBuffer = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded);
  const cipherBytes = new Uint8Array(cipherBuffer);
  return `${bytesToBase64(iv)}:${bytesToBase64(cipherBytes)}`;
}

async function decryptWithAddressKey(payload: string, address: string) {
  if (!payload) return '';
  const [ivPart, dataPart] = payload.split(':');
  if (!ivPart || !dataPart) return '';
  const key = await deriveAesKey(address);
  const iv = base64ToBytes(ivPart);
  const data = base64ToBytes(dataPart);
  const clearBuffer = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data);
  return textDecoder.decode(clearBuffer);
}

function normalizeDecryptedAddress(value: string) {
  if (value.startsWith('0x')) {
    return value as `0x${string}`;
  }

  const hexValue = BigInt(value).toString(16).padStart(40, '0');
  return `0x${hexValue}` as `0x${string}`;
}

export function VaultApp() {
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const signerPromise = useEthersSigner();
  const { instance, isLoading: isZamaLoading, error: zamaError } = useZamaInstance();

  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [isLoadingDocs, setIsLoadingDocs] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createKey, setCreateKey] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [decryptedKeys, setDecryptedKeys] = useState<DocumentStateMap>({});
  const [decryptedBodies, setDecryptedBodies] = useState<DocumentStateMap>({});
  const [draftBodies, setDraftBodies] = useState<DocumentStateMap>({});
  const [grantTargets, setGrantTargets] = useState<DocumentStateMap>({});
  const [activeDocId, setActiveDocId] = useState<bigint | null>(null);
  const [isWorking, setIsWorking] = useState(false);

  const isContractConfigured =
    true;
  const documentCount = documents.length;

  const loadDocuments = useMemo(() => {
    return async () => {
      if (!publicClient) return;
      if (!isContractConfigured) {
        setDocuments([]);
        setActionMessage('Set the VaultGrid contract address in config/contracts.ts.');
        return;
      }
      setIsLoadingDocs(true);
      try {
        const count = (await publicClient.readContract({
          address: CONTRACT_ADDRESS,
          abi: CONTRACT_ABI,
          functionName: 'documentCount',
        })) as bigint;

        if (count === 0n) {
          setDocuments([]);
          return;
        }

        const ids = Array.from({ length: Number(count) }, (_, index) => BigInt(index + 1));
        const fetchedDocs = await Promise.all(
          ids.map(async (id) => {
            const doc = (await publicClient.readContract({
              address: CONTRACT_ADDRESS,
              abi: CONTRACT_ABI,
              functionName: 'getDocument',
              args: [id],
            })) as readonly [string, string, `0x${string}`, `0x${string}`, bigint, bigint];

            return {
              id,
              name: doc[0],
              encryptedBody: doc[1],
              encryptedKey: doc[2],
              owner: doc[3],
              createdAt: doc[4],
              updatedAt: doc[5],
            } satisfies DocumentItem;
          }),
        );

        setDocuments(fetchedDocs);
      } catch (error) {
        console.error('Failed to load documents:', error);
        setActionMessage('Failed to load documents. Check your network and contract address.');
      } finally {
        setIsLoadingDocs(false);
      }
    };
  }, [publicClient]);

  useEffect(() => {
    loadDocuments();
  }, [loadDocuments]);

  const refreshDocuments = async () => {
    await loadDocuments();
  };

  const handleCreateDocument = async () => {
    if (!createName.trim()) {
      setActionMessage('Document name is required.');
      return;
    }
    if (!address) {
      setActionMessage('Connect your wallet to create a document.');
      return;
    }
    if (!isContractConfigured) {
      setActionMessage('Set the VaultGrid contract address in config/contracts.ts.');
      return;
    }
    if (!instance || !signerPromise) {
      setActionMessage('Encryption service is not ready yet.');
      return;
    }

    setIsWorking(true);
    setActionMessage(null);

    try {
      const signer = await signerPromise;
      if (!signer) {
        throw new Error('Signer not available');
      }

      const generatedKey = Wallet.createRandom().address;
      const encryptedInput = await instance
        .createEncryptedInput(CONTRACT_ADDRESS, address)
        .addAddress(generatedKey)
        .encrypt();

      const contract = new Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
      const tx = await contract.createDocument(
        createName.trim(),
        encryptedInput.handles[0],
        encryptedInput.inputProof,
      );
      await tx.wait();

      setCreateKey(generatedKey);
      setCreateName('');
      await refreshDocuments();
      setActionMessage('Document created. Use the decrypted key to encrypt your content.');
    } catch (error) {
      console.error('Failed to create document:', error);
      setActionMessage(`Failed to create document: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsWorking(false);
    }
  };

  const handleDecryptKey = async (doc: DocumentItem) => {
    if (!instance || !signerPromise || !address) {
      setActionMessage('Wallet and encryption service are required to decrypt.');
      return;
    }
    if (!isContractConfigured) {
      setActionMessage('Set the VaultGrid contract address in config/contracts.ts.');
      return;
    }

    setIsWorking(true);
    setActionMessage(null);

    try {
      const signer = await signerPromise;
      if (!signer) {
        throw new Error('Signer not available');
      }

      const keypair = instance.generateKeypair();
      const handleContractPairs = [
        {
          handle: doc.encryptedKey,
          contractAddress: CONTRACT_ADDRESS,
        },
      ];
      const startTimeStamp = Math.floor(Date.now() / 1000).toString();
      const durationDays = '10';
      const contractAddresses = [CONTRACT_ADDRESS];

      const eip712 = instance.createEIP712(
        keypair.publicKey,
        contractAddresses,
        startTimeStamp,
        durationDays,
      );

      const signature = await signer.signTypedData(
        eip712.domain,
        {
          UserDecryptRequestVerification: eip712.types.UserDecryptRequestVerification,
        },
        eip712.message,
      );

      const result = await instance.userDecrypt(
        handleContractPairs,
        keypair.privateKey,
        keypair.publicKey,
        signature.replace('0x', ''),
        contractAddresses,
        address,
        startTimeStamp,
        durationDays,
      );

      const decryptedValue = result[doc.encryptedKey as string] as string;
      const normalizedKey = normalizeDecryptedAddress(decryptedValue);

      setDecryptedKeys((prev) => ({
        ...prev,
        [doc.id.toString()]: normalizedKey,
      }));

      if (doc.encryptedBody) {
        const clearBody = await decryptWithAddressKey(doc.encryptedBody, normalizedKey);
        setDecryptedBodies((prev) => ({
          ...prev,
          [doc.id.toString()]: clearBody,
        }));
        setDraftBodies((prev) => ({
          ...prev,
          [doc.id.toString()]: clearBody,
        }));
      }

      setActionMessage('Key decrypted. You can now edit and encrypt the document body.');
    } catch (error) {
      console.error('Failed to decrypt key:', error);
      setActionMessage(`Failed to decrypt key: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsWorking(false);
    }
  };

  const handleSaveBody = async (doc: DocumentItem) => {
    const key = decryptedKeys[doc.id.toString()];
    if (!key) {
      setActionMessage('Decrypt the key before saving content.');
      return;
    }
    if (!isContractConfigured) {
      setActionMessage('Set the VaultGrid contract address in config/contracts.ts.');
      return;
    }
    if (!signerPromise) {
      setActionMessage('Signer not available.');
      return;
    }

    setIsWorking(true);
    setActionMessage(null);

    try {
      const signer = await signerPromise;
      if (!signer) {
        throw new Error('Signer not available');
      }

      const plainText = draftBodies[doc.id.toString()] ?? '';
      const encryptedBody = await encryptWithAddressKey(plainText, key);

      const contract = new Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
      const tx = await contract.updateDocument(doc.id, encryptedBody);
      await tx.wait();

      setDecryptedBodies((prev) => ({
        ...prev,
        [doc.id.toString()]: plainText,
      }));

      await refreshDocuments();
      setActionMessage('Document body encrypted and saved.');
    } catch (error) {
      console.error('Failed to save document:', error);
      setActionMessage(`Failed to save document: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsWorking(false);
    }
  };

  const handleGrantAccess = async (doc: DocumentItem) => {
    const target = grantTargets[doc.id.toString()];
    if (!target || !isAddress(target)) {
      setActionMessage('Enter a valid wallet address to grant access.');
      return;
    }
    if (!isContractConfigured) {
      setActionMessage('Set the VaultGrid contract address in config/contracts.ts.');
      return;
    }
    if (!signerPromise) {
      setActionMessage('Signer not available.');
      return;
    }

    setIsWorking(true);
    setActionMessage(null);

    try {
      const signer = await signerPromise;
      if (!signer) {
        throw new Error('Signer not available');
      }

      const contract = new Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
      const tx = await contract.grantAccess(doc.id, target);
      await tx.wait();

      setGrantTargets((prev) => ({
        ...prev,
        [doc.id.toString()]: '',
      }));

      setActionMessage(`Access granted to ${shortAddress(target)}.`);
    } catch (error) {
      console.error('Failed to grant access:', error);
      setActionMessage(`Failed to grant access: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsWorking(false);
    }
  };

  return (
    <div className="vault-app">
      <section className="vault-hero">
        <div className="vault-hero-content">
          <p className="vault-overline">Encrypted collaboration on FHEVM</p>
          <h2>Secure documents, shared only by keys you approve.</h2>
          <p className="vault-subtitle">
            VaultGrid stores encrypted document keys on-chain. Decrypt your key with Zama, then encrypt the body locally
            before saving it back to Sepolia.
          </p>
        </div>
        <div className="vault-hero-card">
          <div>
            <span className="vault-stat-label">Documents live</span>
            <div className="vault-stat-value">{documentCount}</div>
          </div>
          <div>
            <span className="vault-stat-label">Wallet</span>
            <div className="vault-stat-value">{shortAddress(address)}</div>
          </div>
          <div>
            <span className="vault-stat-label">Relayer status</span>
            <div className="vault-stat-value">
              {isZamaLoading ? 'Booting' : zamaError ? 'Offline' : 'Ready'}
            </div>
          </div>
        </div>
      </section>

      <section className="vault-grid">
        <div className="vault-panel">
          <div className="panel-header">
            <h3>Create a document</h3>
            <p>Generate a fresh key locally and store it encrypted on-chain.</p>
          </div>
          <div className="panel-body">
            <label className="field-label" htmlFor="doc-name">Document name</label>
            <input
              id="doc-name"
              className="field-input"
              value={createName}
              onChange={(event) => setCreateName(event.target.value)}
              placeholder="Quarterly playbook"
            />
            <button className="primary-button" onClick={handleCreateDocument} disabled={isWorking}>
              {isWorking ? 'Creating...' : 'Create document'}
            </button>
            {createKey ? (
              <div className="key-panel">
                <p className="key-title">Your document key</p>
                <code className="key-value">{createKey}</code>
                <p className="key-note">Save this address. You will need it to encrypt document content.</p>
              </div>
            ) : null}
          </div>
        </div>

        <div className="vault-panel">
          <div className="panel-header">
            <div>
              <h3>Document library</h3>
              <p>Decrypt keys, edit content, and grant access from one panel.</p>
            </div>
            <button className="ghost-button" onClick={refreshDocuments} disabled={isLoadingDocs}>
              {isLoadingDocs ? 'Refreshing...' : 'Refresh'}
            </button>
          </div>
          <div className="panel-body">
            {documents.length === 0 ? (
              <div className="empty-state">
                <h4>No documents yet</h4>
                <p>Create the first one to start sharing encrypted notes.</p>
              </div>
            ) : (
              <div className="document-list">
                {documents.map((doc) => {
                  const docId = doc.id.toString();
                  const decryptedKey = decryptedKeys[docId];
                  const decryptedBody = decryptedBodies[docId];
                  const isActive = activeDocId === doc.id;
                  return (
                    <div
                      key={docId}
                      className={`document-card ${isActive ? 'active' : ''}`}
                      onClick={() => setActiveDocId(doc.id)}
                    >
                      <div className="document-header">
                        <div>
                          <h4>{doc.name}</h4>
                          <p>Owner: {shortAddress(doc.owner)}</p>
                        </div>
                        <span className="document-id">#{docId}</span>
                      </div>
                      <div className="document-meta">
                        <span>Updated {new Date(Number(doc.updatedAt) * 1000).toLocaleString()}</span>
                        <span>Key: {decryptedKey ? shortAddress(decryptedKey) : 'Encrypted'}</span>
                      </div>
                      <div className="document-actions">
                        <button
                          className="secondary-button"
                          onClick={(event) => {
                            event.stopPropagation();
                            handleDecryptKey(doc);
                          }}
                          disabled={isWorking}
                        >
                          {decryptedKey ? 'Key ready' : 'Decrypt key'}
                        </button>
                        <button
                          className="ghost-button"
                          onClick={(event) => {
                            event.stopPropagation();
                            setActiveDocId(isActive ? null : doc.id);
                          }}
                        >
                          {isActive ? 'Hide details' : 'View details'}
                        </button>
                      </div>
                      {isActive ? (
                        <div className="document-details">
                          <div className="detail-block">
                            <label className="field-label">Encrypted body preview</label>
                            <div className="encrypted-preview">
                              {doc.encryptedBody
                                ? `${doc.encryptedBody.slice(0, 64)}...`
                                : 'No encrypted body saved yet.'}
                            </div>
                          </div>

                          <div className="detail-block">
                            <label className="field-label">Decrypted body</label>
                            <textarea
                              className="field-textarea"
                              rows={6}
                              value={draftBodies[docId] ?? decryptedBody ?? ''}
                              onChange={(event) =>
                                setDraftBodies((prev) => ({
                                  ...prev,
                                  [docId]: event.target.value,
                                }))
                              }
                              placeholder="Decrypt the key to edit the document body."
                            />
                            <button
                              className="primary-button"
                              onClick={(event) => {
                                event.stopPropagation();
                                handleSaveBody(doc);
                              }}
                              disabled={isWorking || !decryptedKey}
                            >
                              {isWorking ? 'Saving...' : 'Encrypt & save'}
                            </button>
                          </div>

                          <div className="detail-block">
                            <label className="field-label">Grant access</label>
                            <div className="grant-row">
                              <input
                                className="field-input"
                                value={grantTargets[docId] ?? ''}
                                onChange={(event) =>
                                  setGrantTargets((prev) => ({
                                    ...prev,
                                    [docId]: event.target.value,
                                  }))
                                }
                                placeholder="0x..."
                              />
                              <button
                                className="secondary-button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  handleGrantAccess(doc);
                                }}
                                disabled={isWorking}
                              >
                                Grant
                              </button>
                            </div>
                            <p className="detail-note">
                              Only the owner can grant access. The new editor can decrypt the key and update the body.
                            </p>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </section>

      {actionMessage ? <div className="action-message">{actionMessage}</div> : null}
    </div>
  );
}
