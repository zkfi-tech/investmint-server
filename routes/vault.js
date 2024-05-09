const express = require('express');
const router = express.Router();
const { getDB } = require('../utils/dbConfig.js');
const { getFireblocksInstance } = require('../utils/omnibusVault.js');
const { inspect } = require('util');

router.get('/create/:mmAddress', async (req, res) => {
    try {
        const MMAddress = req.params.mmAddress;
        if (!MMAddress) {
            throw ("Please provide MM EOA address");
        }
        const db = getDB();
        const fireblocks = getFireblocksInstance();
        const mmFilter = { marketMaker: MMAddress };
        const mmExistingVault = await db.collection('vaults').findOne(mmFilter);
        if (mmExistingVault) {
            throw (`Vault for market maker already exists with id: ${mmExistingVault.vaultId}`);
        }

        // Create intermediate vault account
        const vaultAccountId = `IMVault_${MMAddress}`;
        const customerRefIdForAMLProvider = `MM_${MMAddress}`; // For eg: AML provider like zkFi will access this market makers details using this id.
        const vaultCreation = await fireblocks.createVaultAccount(
            vaultAccountId,
            true, // hiddenOnUI: true for all intermediate vault accounts
            customerRefIdForAMLProvider,
            false
        );
        console.log(inspect(vaultCreation, false, null, true));
        const mmNewVaultID = vaultCreation.id;

        // Get assets this vault has to support based on the assets supported by the index
        const filter = { "symbol": process.env.VINTER_INDEX_SYMBOL };
        const vinterIndex = await db.collection("cryptoIndexes").findOne(filter);
        const vinterIndexAssets = vinterIndex.currentAssets;
        const totalAssets = vinterIndexAssets.length;
        let mmVaultAssetWalletsOnFireblocks = new Array(totalAssets);

        console.log(`Assets to include in vault: ${vinterIndexAssets}`);

        for (let a = 0; a < totalAssets; a++) {
            let assetNamePortions = vinterIndexAssets[a].split('-');
            let assetName = assetNamePortions[0].toUpperCase();
            if (assetNamePortions[0] == "eth")
                assetIdFireblocks = "BASECHAIN_" + assetName + "_TEST5"; // eg: BASECHAIN_ETH_TEST5
            else
                assetIdFireblocks = assetName + "_TEST";

            // create asset wallets for this asset `assetIdFireblocks` under the market makers intermediate vault 
            let description = `Asset wallet for ${assetIdFireblocks} asset owned by market maker ${MMAddress}`;
            // let mmVaultAsset = await fireblocks.generateNewAddress(mmNewVaultID, assetIdFireblocks, description, customerRefIdForAMLProvider);
            let mmVaultAsset = await fireblocks.createVaultAsset(mmNewVaultID, assetIdFireblocks);

            let assetFireblocksObj = {
                asset: assetName,
                vaultAssetDepositAddress: mmVaultAsset.address,
                vaultAssetTag: mmVaultAsset.tag,
                assetIdOnFireblocks: assetIdFireblocks,
                assetIdOnVinter: vinterIndexAssets[a],
                balance: 0
            }

            mmVaultAssetWalletsOnFireblocks[a] = (assetFireblocksObj);
        }

        // TODO: Index vaultID with MM address in DB
        const vaultObj = {
            marketMaker: MMAddress,
            vaultId: mmNewVaultID,
            vaultAssets: mmVaultAssetWalletsOnFireblocks
        };

        await db.collection('vaults').insertOne(vaultObj);

        res.status(200).json(vaultObj);
    } catch (e) {
        console.error(`Failed: ${e}`);
        res.status(400).send(`Failed to create vault: ${e}`);
    }
});

router.get('/updateAssetBal/:assetId/:depositAddr', async (req, res) => {

    const db = getDB();
    const collection = db.collection('vaults');
    const vaultAssetQuery = {
        $and: [
            { "vaultAssets.vaultAssetDepositAddress": req.params.depositAddr },
            { "vaultAssets.assetIdOnFireblocks": req.params.assetId }
        ]
    };

    const vaultAssetUpdateBal = {
        $inc: { "vaultAssets.$.balance": 10 }
    };

    // update vault
    const balUpdateResult = await collection.updateOne(vaultAssetQuery, vaultAssetUpdateBal);
    console.log(`Balance updated for asset: ${JSON.stringify(balUpdateResult)}`);
})

module.exports = router;
