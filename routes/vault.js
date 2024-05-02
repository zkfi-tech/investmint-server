const express = require('express');
const router = express.Router();
const { getDB } = require('../utils/dbConfig.js');
const fs = require('fs');
const path = require('path');
const { FireblocksSDK } = require('fireblocks-sdk');
const { exit } = require('process');
const { inspect } = require('util');

const apiSecret = fs.readFileSync(path.resolve("/Users/shiven/Downloads/0xshiven_fireblocks_secret.key"), "utf8");

const apiKey = process.env.FIREBLOCKS_API_KEY;

// Choose the right api url for your workspace type 
const baseUrl = "https://sandbox-api.fireblocks.io";
const fireblocks = new FireblocksSDK(apiSecret, apiKey, baseUrl);

router.get('/create/:mmAddress', async (req, res) => {
    try {
        const MMAddress = req.params.mmAddress;
        if (!MMAddress) {
            throw ("Please provide MM EOA address");
        }
        const db = getDB();
        const mmFilter = { marketMaker: MMAddress };
        const mmExistingVault = await db.collection('vaults').findOne(mmFilter);
        if (mmExistingVault) {
            throw (`Vault for market maker already exists with id: ${mmExistingVault.vaultId}`);
        }

        // Create vault account
        const vaultCreation = await fireblocks.createVaultAccount(`INM_${MMAddress}`);
        console.log(inspect(vaultCreation, false, null, true));
        const newVaultID = vaultCreation.id;

        // Get assets this vault has to support based on the assets supported by the index
        const filter = { "symbol": process.env.VINTER_INDEX_SYMBOL };
        const vinterIndex = await db.collection("cryptoIndexes").findOne(filter);
        const vinterIndexAssets = vinterIndex.currentAssets;
        const totalAssets = vinterIndexAssets.length;
        let vaultAssetsOnFireblocks = new Array(totalAssets);

        console.log(`Assets to include in vault: ${vinterIndexAssets}`);

        for (let a = 0; a < totalAssets; a++) {
            let assetNamePortions = vinterIndexAssets[a].split('-');
            let assetName = assetNamePortions[0].toUpperCase();
            if (assetNamePortions[0] == "eth")
                assetIdFireblocks = assetName + "_TEST5"; // eg: ETH_TEST5
            else
                assetIdFireblocks = assetName + "_TEST";

            // create asset wallets for this asset `assetIdFireblocks`
            let vaultAsset = await fireblocks.createVaultAsset(newVaultID, assetIdFireblocks);

            let assetFireblocksObj = {
                asset: assetName,
                assetIdOnFireblocks: assetIdFireblocks,
                assetIdOnVinter: vinterIndexAssets[a],
                vaultAssetDepositAddress: vaultAsset.address
            }

            vaultAssetsOnFireblocks[a] = (assetFireblocksObj);
        }

        // TODO: Index vaultID with MM address in DB
        const vaultObj = {
            marketMaker: MMAddress,
            vaultId: newVaultID,
            vaultAssetsOnFireblocks
        };

        await db.collection('vaults').insertOne(vaultObj);

        res.status(200).json(vaultObj);
    } catch (e) {
        console.error(`Failed: ${e}`);
        res.status(400).send(`Failed to create vault: ${e}`);
    }
});

module.exports = router;
