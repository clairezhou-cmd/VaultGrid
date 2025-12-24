import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();
  const { deploy } = hre.deployments;

  const deployedVaultGrid = await deploy("VaultGrid", {
    from: deployer,
    log: true,
  });

  console.log(`VaultGrid contract: `, deployedVaultGrid.address);
};
export default func;
func.id = "deploy_vaultGrid"; // id required to prevent reexecution
func.tags = ["VaultGrid"];
