import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { ethers, fhevm } from "hardhat";
import { VaultGrid, VaultGrid__factory } from "../types";
import { expect } from "chai";
import { FhevmType } from "@fhevm/hardhat-plugin";

type Signers = {
  deployer: HardhatEthersSigner;
  alice: HardhatEthersSigner;
  bob: HardhatEthersSigner;
};

async function deployFixture() {
  const factory = (await ethers.getContractFactory("VaultGrid")) as VaultGrid__factory;
  const vaultGrid = (await factory.deploy()) as VaultGrid;
  const vaultGridAddress = await vaultGrid.getAddress();

  return { vaultGrid, vaultGridAddress };
}

function expectDecryptedAddressMatch(clearValue: unknown, expectedAddress: string) {
  if (typeof clearValue === "string") {
    expect(clearValue.toLowerCase()).to.eq(expectedAddress.toLowerCase());
    return;
  }

  expect(clearValue).to.eq(BigInt(expectedAddress));
}

describe("VaultGrid", function () {
  let signers: Signers;
  let vaultGrid: VaultGrid;
  let vaultGridAddress: string;

  before(async function () {
    const ethSigners: HardhatEthersSigner[] = await ethers.getSigners();
    signers = { deployer: ethSigners[0], alice: ethSigners[1], bob: ethSigners[2] };
  });

  beforeEach(async function () {
    if (!fhevm.isMock) {
      console.warn(`This hardhat test suite cannot run on Sepolia Testnet`);
      this.skip();
    }

    ({ vaultGrid, vaultGridAddress } = await deployFixture());
  });

  it("creates a document with an encrypted key", async function () {
    const keyAddress = ethers.Wallet.createRandom().address;
    const encryptedKey = await fhevm
      .createEncryptedInput(vaultGridAddress, signers.alice.address)
      .addAddress(keyAddress)
      .encrypt();

    const tx = await vaultGrid
      .connect(signers.alice)
      .createDocument("Launch Plan", encryptedKey.handles[0], encryptedKey.inputProof);
    await tx.wait();

    const count = await vaultGrid.documentCount();
    expect(count).to.eq(1);

    const doc = await vaultGrid.getDocument(1);
    expect(doc[0]).to.eq("Launch Plan");
    expect(doc[1]).to.eq("");
    expect(doc[3]).to.eq(signers.alice.address);

    const decryptedKey = await fhevm.userDecryptEuint(
      FhevmType.eaddress,
      doc[2],
      vaultGridAddress,
      signers.alice,
    );

    expectDecryptedAddressMatch(decryptedKey, keyAddress);
  });

  it("blocks non-editors and allows granted editors", async function () {
    const keyAddress = ethers.Wallet.createRandom().address;
    const encryptedKey = await fhevm
      .createEncryptedInput(vaultGridAddress, signers.alice.address)
      .addAddress(keyAddress)
      .encrypt();

    const tx = await vaultGrid
      .connect(signers.alice)
      .createDocument("Ops Manual", encryptedKey.handles[0], encryptedKey.inputProof);
    await tx.wait();

    await expect(vaultGrid.connect(signers.bob).updateDocument(1, "ciphertext"))
      .to.be.revertedWithCustomError(vaultGrid, "NotAuthorized")
      .withArgs(signers.bob.address);

    await expect(vaultGrid.connect(signers.bob).grantAccess(1, signers.bob.address))
      .to.be.revertedWithCustomError(vaultGrid, "NotAuthorized")
      .withArgs(signers.bob.address);

    await vaultGrid.connect(signers.alice).grantAccess(1, signers.bob.address);

    await vaultGrid.connect(signers.bob).updateDocument(1, "ciphertext");
    const doc = await vaultGrid.getDocument(1);
    expect(doc[1]).to.eq("ciphertext");
  });
});
