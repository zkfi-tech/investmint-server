const { FireblocksSDK } = require('fireblocks-sdk');
const fs = require('fs');
const path = require('path');
const debug = require('debug')('investmint-offchain-server:omnibusVault');

// States
let fireblocks;
let treasuryVaultId;

function createFireblocksInstance() {
    const apiSecret = fs.readFileSync(path.resolve("/Users/shiven/Downloads/0xshiven_fireblocks_secret.key"), "utf8");
    const apiKey = process.env.FIREBLOCKS_API_KEY;
    // Choose the right api url for your workspace type 
    const baseUrl = process.env.FIREBLOCKS_BASE_URL;

    fireblocks = new FireblocksSDK(apiSecret, apiKey, baseUrl);
    return fireblocks;
}

async function createInvestMintOmnibusVault() {
    if (!fireblocks)
        fireblocks = createFireblocksInstance();

    // Create omnibus vault account
    const investMintOmnibusVault = await fireblocks.createVaultAccount(`INVESTMINT_OMNIBUS_VAULT`);
    treasuryVaultId = investMintOmnibusVault.id;
    debug(`Created treasury vault with id: ${treasuryVaultId}`);
    return treasuryVaultId;
}

function getFireblocksInstance() {
    if (!fireblocks)
        fireblocks = createFireblocksInstance();
    return fireblocks;
}

function getInvestMintVaultId() {
    return treasuryVaultId;
}

async function sweepToInvestMintTreasury() {
    debug(`Retreiving vaults from Fireblocks`);
    if (!fireblocks)
        fireblocks = createFireblocksInstance();

    let pagedFilter = {};

    let vaultList = await fireblocks.getVaultAccountsWithPageInfo({
        namePrefix: `IMVault_`,
        pagedFilter
    });

    let vaultAccountCounter = 0;
    // let nextPage = true;

    // while (nextPage) {
    // TODO: vaultList.paging obj should not be returned empty. Ask support!
    // if (vaultList.paging.after !== undefined) {
    pagedFilter = vaultList.paging;

    vaultList = await fireblocks.getVaultAccountsWithPageInfo({
        namePrefix: `IMVault_`,
        pagedFilter
    });

    let vaultAccounts = vaultList.accounts;
    vaultAccountCounter += vaultAccounts.length;
    debug(`Vault account counter: ${vaultAccountCounter}`);

    for (let v = 0; v < vaultAccounts.length; v++) { // vault level
        debug(`VAULT ACCOUNT: ${vaultAccounts[v].id}`);

        let assetWallets = vaultAccounts[v].assets;

        for (let a = 0; a < assetWallets.length; a++) { // asset level
            try {
                if (assetWallets[a].total > 0) {
                    let sweepingTrnxResult = await fireblocks.createTransaction({
                        "assetId": String(assetWallets[a].id),
                        "source": {
                            "type": "VAULT_ACCOUNT",
                            "id": String(vaultAccounts[v].id) || 0
                        },
                        "destination": {
                            "type": "VAULT_ACCOUNT",
                            "id": treasuryVaultId
                        },
                        "amount": String(assetWallets[a].total),
                    });
                    debug(`Swept ${assetWallets[a].id} wallet of ${vaultAccounts[v].id} vault with response: ${JSON.stringify(sweepingTrnxResult, null, 2)}`);
                }
            } catch (e) {
                debug(`Error while sweeping ${assetWallets[a].id} wallet of ${vaultAccounts[v].id} vault: ${JSON.stringify(e.response.data)}`);
            }
        }
    }
    // } else {
    //     nextPage = false;
    // }
    // }
}


module.exports = { createFireblocksInstance, createInvestMintOmnibusVault, getFireblocksInstance, getInvestMintVaultId, sweepToInvestMintTreasury };
