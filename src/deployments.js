const fs = require("fs");
const {getProjectPrefix, removeProjectPrefix, normalizeByProjectPrefix, traverseDirectory, checkNotInteractive} = require("./common");
const path = require("path");
const enquirer = require("enquirer");

/**
 * Loads the deploy-everything settings from the ignition/deploy-everything.json
 * file (this file must be maintained and committed).
 * @param hre The hardhat runtime environment.
 * @returns {{contents: Array}} The deploy-everything settings.
 */
function loadDeployEverythingSettings(hre) {
    // Determine the path to the deploy-everything file.
    const root = getProjectPrefix(hre) + "/";
    const file = path.resolve(root, "ignition", "deploy-everything.json");

    // Load it.
    try {
        const content = fs.readFileSync(file, {encoding: 'utf8'});
        return JSON.parse(content);
    } catch(e) {
        return {contents: []};
    }
}

/**
 * Saves the deploy-everything settings into the ignition/deploy-everything.json
 * file (this file must be maintained and committed).
 * @param settings The deploy-everything settings.
 * @param hre The hardhat runtime environment.
 */
function saveDeployEverythingSettings(settings, hre) {
    // Determine the path to the deploy-everything file.
    const root = getProjectPrefix(hre);
    const file = path.resolve(root, "ignition", "deploy-everything.json");

    // Save it.
    fs.writeFileSync(file, JSON.stringify(settings), {encoding: 'utf8'});
}

/**
 * Adds a module to the deploy-everything settings (loads it before and saves
 * it after).
 * @param file The module file being added.
 * @param external Whether it is externally imported or not.
 * @param hre The hardhat runtime environment.
 */
function addDeployEverythingModule(file, external, hre) {
    external = !!external;
    let module = "";
    if (external) {
        // External files are taken as-is. They must not start with / and
        // must succeed importing.
        if (file.startsWith("/")) {
            throw new Error(`The module starts with / (this is forbidden): ${file}.`);
        }
        // External files must succeed importing.
        try {
            require(file);
        } catch(e) {
            throw new Error(`Could not require() the external file: ${file}.`)
        }
        // Assign the module directly.
        module = file;
    }
    else
    {
        // Internal files must belong to the project after normalization.
        const normalized = normalizeByProjectPrefix(file, hre);
        if (!normalized.stripped) {
            throw new Error(`The module does not belong to the project: ${file}`);
        }
        // Internal files must succeed importing.
        try {
            require(getProjectPrefix(hre) + "/" + normalized.file);
        } catch(e) {
            throw new Error(`Could not require() the project file: ${file}.`)
        }
        // Assign the module from the normalized path.
        module = normalized.file;
    }

    // Load, check absence, append, and save.
    let settings = loadDeployEverythingSettings(hre);
    settings.contents ||= [];
    if (!!settings.contents.find((e) => {
        return e.filename === module && e.external === external;
    })) throw new Error(`The module is already added to the full deployment: ${file}.`);
    settings.contents = [...settings.contents, {filename: module, external: external}];
    saveDeployEverythingSettings(settings, hre);
}

/**
 * Removes a module to the deploy-everything settings.
 * @param file The module file being removed.
 * @param external Whether the entry to remove is externally imported or not.
 * @param hre The hardhat runtime environment.
 */
function removeDeployEverythingModule(file, external, hre) {
    external = !!external;
    let module = external ? file : normalizeByProjectPrefix(file, hre).file;

    // Load, check presence, remove, and save.
    let settings = loadDeployEverythingSettings(hre);
    settings.contents ||= [];
    let element = settings.contents.find((e) => {
        return e.filename === module && e.external === !!external;
    });
    if (!element) throw new Error(`The module is not added to the full deployment: ${file}.`);
    settings.contents = settings.contents.filter((e) => e !== element);
    saveDeployEverythingSettings(settings, hre);
}

/**
 * Lists all the added modules and their results.
 * @param hre The hardhat runtime environment.
 * @return {Promise<Array>} The added modules into the deployment (including the keys returned in the module) (async function).
 */
async function listDeployEverythingModules(hre) {
    const chainId = await hre.common.getChainId();
    return loadDeployEverythingSettings(hre).contents.map(({filename, external}) => {
        let moduleResults = [];
        try {
            const module = importModule(filename, external, chainId, hre);
            moduleResults = Object.values(module.results || {}).map((f) => f.id);
        } catch {}

        return {filename, external, moduleResults};
    });
}

/**
 * Adds a chainId to the name of a JS or TS file.
 * @param filename The file.
 * @param chainId The chain id.
 * @returns {string} The new file.
 */
function addChainId(filename, chainId) {
    const parts = filename.split('.');
    const extension = parts.pop();
    return `${parts.join('.')}-${chainId}.${extension}`;
}

/**
 * Imports a module (either externally or locally).
 * @param filename The name of the file to load.
 * @param external Whether it is external or not.
 * @param chainId The chain id.
 * @param hre The hardhat runtime environment.
 * @returns {*} The loaded ignition module.
 */
function importModule(filename, external, chainId, hre) {
    try {
        return external
            ? require(addChainId(filename, chainId))
            : require(addChainId(path.resolve(hre.config.paths.root, filename), chainId));
    } catch {
        // Nothing here. Continue with the general load.
    }

    try {
        return external
            ? require(filename)
            : require(path.resolve(hre.config.paths.root, filename));
    } catch(e) {
        throw new Error(`Could not import the ${external ? "external" : "in-project"} module: ${filename}.`);
    }
}

/**
 * Runs all the deployments (also considering the current chainId).
 * @param reset Resets the current deployment status (journal) for the current network.
 * @param deploymentArgs The deployment arguments (same semantics of `hre.ignition.deploy` args).
 * @param hre The hardhat runtime environment.
 * @returns {Promise<void>} Nothing (async function).
 */
async function runDeployEverythingModules(reset, deploymentArgs, hre) {
    const modules = await listDeployEverythingModules(hre);
    const length = modules.length;
    if (!!reset) await hre.ignition.resetDeployment(deploymentArgs.deploymentId, hre);
    const chainId = await hre.common.getChainId();
    for(let idx = 0; idx < length; idx++) {
        await hre.ignition.deploy(importModule(modules[idx].filename, modules[idx].external, chainId, hre), deploymentArgs);
    }
}

/**
 * Tells whether a file is already added as a module in the deploy-everything
 * (current) settings.
 * @param file The module file being tested.
 * @param external Whether we're talking about an imported file or a local one.
 * @param hre The hardhat runtime environment.
 * @returns {boolean} Whether it is already added or not.
 */
function isModuleInDeployEverything(file, external, hre) {
    external = !!external;
    let module = external ? file : normalizeByProjectPrefix(file, hre).file;
    let settings = loadDeployEverythingSettings(hre);
    return !!(settings.contents || []).find((element) => {
        return !!element.external === external && module === element.filename;
    });
}

/**
 * Lists all the deployed contract ids in a deployment id.
 * @param deploymentId The deployment id to get the contracts from.
 * @param hre The hardhat runtime environment.
 * @returns {Promise<string[]>} The list of contract ids.
 */
async function listDeployedContracts(deploymentId, hre) {
    // 1. Determine the actual deployment id.
    const chainId = await hre.common.getChainId();
    deploymentId ||= `chain-${chainId}`;

    // 2. Load the file and get the list of ids.
    const fullPath = path.resolve(
        hre.config.paths.root, "ignition", "deployments", deploymentId, "deployed_addresses.json"
    );
    return Object.keys(JSON.parse(fs.readFileSync(fullPath, {encoding: 'utf8'})));
}

/**
 * Asks to select one of the deployed contracts, if the initial one is not
 * valid or not (yet) deployed.
 * @param deployedContractId The initial deployed contract id.
 * @param deploymentId The id of the deployment to focus on.
 * @param forceNonInteractive Whether to raise an error if this call becomes
 * interactive due to the contract id not being valid.
 * @param hre The hardhat runtime environment.
 * @returns {Promise<string>} The id of the selected deployed contract.
 */
async function selectDeployedContract(deployedContractId, deploymentId, forceNonInteractive, hre) {
    // 1. Get the current options and also test whether the initially
    //    set deployed contract id is among them or not.
    deployedContractId = (deployedContractId || "").trim();
    const choices = await listDeployedContracts(deploymentId, hre);
    if (choices.indexOf(deployedContractId) >= 0) return deployedContractId;

    // 2. Go interactive and ask for a new one.
    checkNotInteractive(forceNonInteractive);

    // 3. Prompt.
    if (deployedContractId) {
        console.log(
            "The id you selected does not belong to a deployed contract (either " +
            "it is not valid, or you did not run the corresponding ignition deployment " +
            "task or the deploy-everything task"
        );
    }
    let prompt = new enquirer.Select({
        name: "deployedContractId",
        message: "Select a deployed contract:",
        choices
    });
    return await prompt.run();
}

/**
 * Inspects the ignition addresses for a deployment id and retrieves
   a contract instance from a given deployed contract (future) id.
 * @param deploymentId The deployment id.
 * @Param contractId The deployed contract (future) id.
 * @param hre The hardhat runtime environment.
 * @return {Promise<*>} A contract instance (async function).
 */
async function getDeployedContract(deploymentId, contractId, hre) {
    // 1. Determine the actual deployment id.
    const chainId = await hre.common.getChainId();
    deploymentId ||= `chain-${chainId}`;

    // 2. Determine the path and load the deployed addresses, if able.
    let addresses = {};
    try {
        const fullPath = path.resolve(
            hre.config.paths.root, "ignition", "deployments", deploymentId, "deployed_addresses.json"
        );
        addresses = JSON.parse(fs.readFileSync(fullPath, {encoding: 'utf8'}));
    } catch(e) {}

    // 3. From the deployed addresses, get the address we want.
    const address = addresses[contractId];
    if (!address) {
        throw new Error(
            `It seems that the contract ${contractId} is not deployed in the ` +
            `deployment id ${deploymentId}. Ensure the deployment is actually ` +
            "done for that contract."
        )
    }

    // 4. Now, load the artifact and get its ABI:
    let artifact = {};
    try {
        const artifactPath = path.resolve(
            hre.config.paths.root, "ignition", "deployments", deploymentId, "artifacts", contractId + ".json"
        );
        artifact = JSON.parse(fs.readFileSync(artifactPath, {encoding: 'utf8'}));
    } catch(e) {}
    const abi = artifact.abi;
    if (!abi || !abi.length) {
        throw new Error(
            `The contract data for the contract id ${contractId} in the deployment `
            `id ${deploymentId} seems to be corrupted. Either you're in serious `
            `troubles or this is your local network and you just need to redeploy `
            `everything to make this work. Keep in touch with your team if this is `
            `related to corrupted contract deployment data in a mainnet.`
        );
    }

    // 5. Instantiate the contract by using the proper provider.
    return await hre.ethers.getContractAt(abi, address);
}

module.exports = {
    addDeployEverythingModule, removeDeployEverythingModule, isModuleInDeployEverything,
    listDeployEverythingModules, runDeployEverythingModules, getDeployedContract,
    listDeployedContracts, selectDeployedContract
}