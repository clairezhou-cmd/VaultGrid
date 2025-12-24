import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { ethers, fhevm, deployments } from "hardhat";
import { VaultGrid } from "../types";
import { expect } from "chai";
import { FhevmType } from "@fhevm/hardhat-plugin";

type Signers = {
  alice: HardhatEthersSigner;
};

function expectDecryptedAddressMatch(clearValue: unknown, expectedAddress: string) {
  if (typeof clearValue === "string") {
    expect(clearValue.toLowerCase()).to.eq(expectedAddress.toLowerCase());
    return;
  }

  expect(clearValue).to.eq(BigInt(expectedAddress));
}

describe("VaultGridSepolia", function () {
  let signers: Signers;
  let vaultGrid: VaultGrid;
  let vaultGridAddress: string;
  let step: number;
  let steps: number;

  function progress(message: string) {
    console.log(`${++step}/${steps} ${message}`);
  }

  before(async function () {
    if (fhevm.isMock) {
      console.warn(`This hardhat test suite can only run on Sepolia Testnet`);
      this.skip();
    }

    try {
      const vaultGridDeployment = await deployments.get("VaultGrid");
      vaultGridAddress = vaultGridDeployment.address;
      vaultGrid = await ethers.getContractAt("VaultGrid", vaultGridDeployment.address);
    } catch (e) {
      (e as Error).message += ". Call 'npx hardhat deploy --network sepolia'";
      throw e;
    }

    const ethSigners: HardhatEthersSigner[] = await ethers.getSigners();
    signers = { alice: ethSigners[0] };
  });

  beforeEach(async () => {
    step = 0;
    steps = 0;
  });

  it("creates a document and decrypts the key", async function () {
    steps = 6;
    this.timeout(4 * 40000);

    const keyAddress = ethers.Wallet.createRandom().address;

    progress("Encrypting document key...");
    const encryptedKey = await fhevm
      .createEncryptedInput(vaultGridAddress, signers.alice.address)
      .addAddress(keyAddress)
      .encrypt();

    progress("Creating document on-chain...");
    const tx = await vaultGrid
      .connect(signers.alice)
      .createDocument("Sepolia Runbook", encryptedKey.handles[0], encryptedKey.inputProof);
    await tx.wait();

    progress("Fetching document count...");
    const count = await vaultGrid.documentCount();
    expect(count).to.be.greaterThan(0);

    progress("Reading encrypted key...");
    const doc = await vaultGrid.getDocument(count);

    progress("User decrypting key...");
    const clearKey = await fhevm.userDecryptEuint(
      FhevmType.eaddress,
      doc[2],
      vaultGridAddress,
      signers.alice,
    );

    expectDecryptedAddressMatch(clearKey, keyAddress);
    progress("Decryption verified.");
  });
});
