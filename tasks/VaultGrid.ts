import { FhevmType } from "@fhevm/hardhat-plugin";
import { task } from "hardhat/config";
import type { TaskArguments } from "hardhat/types";
import { ethers } from "ethers";

/**
 * Examples:
 *   - npx hardhat --network localhost task:address
 *   - npx hardhat --network sepolia task:address
 */
task("task:address", "Prints the VaultGrid address").setAction(async function (_taskArguments: TaskArguments, hre) {
  const { deployments } = hre;

  const vaultGrid = await deployments.get("VaultGrid");

  console.log("VaultGrid address is " + vaultGrid.address);
});

/**
 * Example:
 *   - npx hardhat --network localhost task:create-document --name "Ops"
 */
task("task:create-document", "Creates a new document")
  .addParam("name", "Document name")
  .addOptionalParam("key", "Optional plaintext key address")
  .addOptionalParam("address", "Optionally specify the VaultGrid contract address")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const { ethers: hreEthers, deployments, fhevm } = hre;

    await fhevm.initializeCLIApi();

    const vaultGridDeployment = taskArguments.address
      ? { address: taskArguments.address }
      : await deployments.get("VaultGrid");
    console.log(`VaultGrid: ${vaultGridDeployment.address}`);

    const signers = await hreEthers.getSigners();
    const signer = signers[0];

    const vaultGrid = await hreEthers.getContractAt("VaultGrid", vaultGridDeployment.address);

    const keyAddress = taskArguments.key ?? ethers.Wallet.createRandom().address;
    const encryptedKey = await fhevm
      .createEncryptedInput(vaultGridDeployment.address, signer.address)
      .addAddress(keyAddress)
      .encrypt();

    const tx = await vaultGrid
      .connect(signer)
      .createDocument(taskArguments.name, encryptedKey.handles[0], encryptedKey.inputProof);
    console.log(`Wait for tx:${tx.hash}...`);

    const receipt = await tx.wait();
    console.log(`tx:${tx.hash} status=${receipt?.status}`);

    const count = await vaultGrid.documentCount();
    console.log(`Document created. Total documents: ${count}`);
    console.log(`Plaintext key address: ${keyAddress}`);
  });

/**
 * Example:
 *   - npx hardhat --network localhost task:decrypt-key --id 1
 */
task("task:decrypt-key", "Decrypts the key for a document")
  .addParam("id", "Document id")
  .addOptionalParam("address", "Optionally specify the VaultGrid contract address")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const { ethers: hreEthers, deployments, fhevm } = hre;

    await fhevm.initializeCLIApi();

    const vaultGridDeployment = taskArguments.address
      ? { address: taskArguments.address }
      : await deployments.get("VaultGrid");
    console.log(`VaultGrid: ${vaultGridDeployment.address}`);

    const signers = await hreEthers.getSigners();
    const signer = signers[0];

    const vaultGrid = await hreEthers.getContractAt("VaultGrid", vaultGridDeployment.address);

    const doc = await vaultGrid.getDocument(taskArguments.id);
    const encryptedKey = doc[2];

    const clearKey = await fhevm.userDecryptEuint(
      FhevmType.eaddress,
      encryptedKey,
      vaultGridDeployment.address,
      signer,
    );

    console.log(`Encrypted key handle: ${encryptedKey}`);
    console.log(`Decrypted key: ${clearKey}`);
  });
