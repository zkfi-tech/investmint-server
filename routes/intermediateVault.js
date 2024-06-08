const express = require('express');
const router = express.Router();
const { getDB } = require('../utils/dbConfig.js');
const { getFireblocksInstance } = require('../utils/omnibusVault.js');
const {withdrawAssetsForMarketMaker} = require('../utils/withdrawalVault.js');
const { getVault } = require('../utils/custodian.js');
const { inspect } = require('util');
const debug = require('debug')('investmint-offchain-server:vault');
const InvestMintDFTABI = require('../abi/InvestMintDFT.json'); // Import the InvestMintDFT contract
const Web3 = require('web3'); // Import the Web3 library

router.get('/isVaultCreated/:mmAddress', async (req, res) => {
    const vault = await getVault();
    if (vault != null) {
        res.status(200).send(true);
    } else {
        res.status(200).send(false);
    }
});

router.get('/getVault/:mmAddress', async (req, res) => {
    try {
        const mmAddress = req.params.mmAddress;
        const vault = await getVault(mmAddress);

        if (vault != null) {
            res.status(200).json(vault);
        } else {
            res.status(400).send('Vault not found for this market maker');
        }
    } catch (e) {
        res.status(400).send(`Failed to get vault: ${e}`);
    }
});

router.post('/create/:mmAddress', async (req, res) => {
    try {
        const MMAddress = req.params.mmAddress;
        const withdrawalAddressesForAssets = req.body.withdrawalAddressesForAssets; // Array of JSON obj

        /** 
         * [
         *  { asset: 'ada-usd-p-h',
         *    withdrawalAddress: "83840380340238" },
         *  { asset: btc-usd-p-h,
         *      withdrawalAddress: "34083058034322" },
         *  .
         *  .
         * ]
         * 
        */


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
            // getting the withdraw addr of this asset from req.body (withdrawalAddressesForAssets)
            let assetObjWithWithdrawDetails = withdrawalAddressesForAssets.find(assetObjWithWithdrawDetails =>
                assetObjWithWithdrawDetails.asset === vinterIndexAssets[a]
            );
            let assetWithdrawAddress = assetObjWithWithdrawDetails.withdrawalAddress;

            // preparing Fireblock ID of this asset
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

            let assetObj = {
                asset: assetName,
                vaultAssetDepositAddress: mmVaultAsset.address,
                withdrawalAddress: assetWithdrawAddress,
                vaultAssetTag: mmVaultAsset.tag,
                assetIdOnFireblocks: assetIdFireblocks,
                assetIdOnVinter: vinterIndexAssets[a],
                balance: 0
            }

            mmVaultAssetWalletsOnFireblocks[a] = assetObj;
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

router.get('/redeem/:mmAddress/:quantity', async (req, res) => {
    try{
        const MMAddress = req.params.mmAddress;
        const quantity = req.params.quantity;

        // check if the MM has the required quantity of DFTs
        const web3 = new Web3(process.env.ANVIL_RPC_URL);
        const contract = new web3.eth.Contract(InvestMintDFTABI, process.env.DFT_CONTRACT_ADDRESS);

        const balance = await contract.methods.balanceOf(MMAddress).call();
        if (balance < quantity) {
            throw (`Market maker ${MMAddress} does not have enough DFTs to redeem`);
        }

        // initiate withdrawal of underlying assets to MM's withdrawal addresses
        withdrawAssetsForMarketMaker(MMAddress, quantity);

        res.status(200).json({ balance }); // Send the balance as a response
    } catch(e) {
        console.error(`Failed: ${e}`);
        res.status(400).send(`Failed to redeem: ${e}`);
    }
});


module.exports = router;
