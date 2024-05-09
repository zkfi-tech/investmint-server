const { FireblocksSDK } = require('fireblocks-sdk');
const { getDB } = require('./dbConfig.js');
const fs = require('fs');
const path = require('path');
const { inspect } = require('util');

// States
let fireblocks;
let investMintOmnibusVault;

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

    const vaultAccountId = `INVESTMINT_OMNIBUS_VAULT`;

    // Create omnibus vault account
    investMintOmnibusVault = await fireblocks.createVaultAccount(vaultAccountId);
    return investMintOmnibusVault.id;
}

function getFireblocksInstance() {
    return fireblocks;
}

function getInvestMintVaultId() {
    return investMintOmnibusVault.id;
}


module.exports = { createFireblocksInstance, createInvestMintOmnibusVault, getFireblocksInstance, getInvestMintVaultId };