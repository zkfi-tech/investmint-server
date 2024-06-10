const { getDB } = require('./dbConfig.js');
const { getFireblocksInstance, getInvestMintVaultId } = require('./omnibusVault');
const { createFireblocksInstance } = require("./omnibusVault.js");
const { getTotalDFTSupply } = require('./onChainInteractions.js');
const BigNumber = require('bignumber.js');
const debug = require('debug')('investmint-offchain-server:withdrawVault');
const inspect = require('util').inspect;

const fireblocks = getFireblocksInstance();
let withdrawalVaultId;

async function createWithdrawVault() {
    const withdrawalVault = await fireblocks.createVaultAccount(`INVESTMINT_WITHDRAWAL_VAULT`);
    withdrawalVaultId = withdrawalVault.id;
}

/// @dev Ensures enough value is present in the withdraw vault by calc by how much value short is the asset in the withdraw vault and pulls that value with a slight buffer.
/// @dev Is triggered one hour after the sweeping process.
async function ensureEnoughWithdrawFundsAvailable() {
    const investMintTreasuryVaultId = getInvestMintVaultId();

    const noOfDFTs = getTotalDFTSupply * 0.25; // 25% of total supply
    if (noOfDFTs == 0) {
        return;
    }
    const assetThresholdToMaintainBasedOnWt = calculateAssetWts(noOfDFTs);
    const withdrawalVault = await fireblocks.getVaultAccount(withdrawalVaultId);
    const assets = withdrawalVault.assets;

    // checking each asset quantity in withdrawal vault against it's threshold value
    for (let a = 0; a < assets.length; a++) {
        let assetId = assets[a].id;
        let assetBal = assets[a].total;

        let assetThresholdObj = assetThresholdToMaintainBasedOnWt.find(assetThresholdObj => assetThresholdObj.assetIdOnFireblock === assetId);

        // if assetBal is less than threshold value, a transfer of that asset should be made from the treasury to the withdrawal vault
        if (assetThresholdObj.assetQuantity > assetBal) {
            debug(`Asset ${assetId} is lesser than it's safe threshold of the withdrawal vault. Initiating transfer from treasury.`);

            let amountShort = (assetThresholdObj.assetQuantity - assetBal);
            let amountWithBufferToPullFromTreasury = amountShort + 0.25 * amountShort; // pulling 25% more than threshold
            let amountToPull;

            // checking if the treasury has the `amountWithBufferToPullFromTreasury` for `assetId`
            let treasuryBalOfAsset = await fireblocks.getVaultAccountAsset(investMintTreasuryVaultId, assetId);

            if (treasuryBalOfAsset > amountShort && treasuryBalOfAsset <= amountWithBufferToPullFromTreasury)
                amountToPull = amountShort; // just pulling what's required
            else
                amountToPull = amountWithBufferToPullFromTreasury; // pulling along with buffer amount

            try {
                await fireblocks.createTransaction({
                    assetId: String(assetId),
                    source: {
                        type: "VAULT_ACCOUNT",
                        id: String(investMintTreasuryVaultId)
                    },
                    destination: {
                        type: "VAULT_ACCOUNT",
                        id: String(withdrawalVaultId)
                    },
                    amount: String(amountToPull)
                })
                debug(`Pulled asset ${assetId} from treasury to withdrawal vault`);
            } catch (e) {
                debug(`Error while sweeping from treasury to withdrawal vault: ${JSON.stringify(e.response.data)}`);
            }
        }
    }
}

/// @dev Calculates the quantity of each asset corresponding to the no. of dfts.
/// @notice In context of withdraw vault, the asset quantity is calculated based on 25% of the total DFT supply. Meaning 25% of the AUM will stay in the withdraw vault to facilitate redeemption requests by MM.
async function calculateAssetWts(noOfDFTs) {
    noOfDFTs = new BigNumber(noOfDFTs.toString());
    const filter = {
        symbol: process.env.VINTER_INDEX_SYMBOL
    };

    const db = getDB();
    const indexInfo = await db.collection('cryptoIndexes').findOne(filter);
    const currentAssets = indexInfo.currentAssets;
    const currentWeights = indexInfo.currentWeights;
    const numberOfAssets = currentAssets.length;

    let assetSplitsBasedOnNoOfDFTs = new Array(numberOfAssets);

    for (let a = 0; a < numberOfAssets; a++) {
        let assetWt = new BigNumber(currentWeights[a].toString());

        let assetSplitBasedOnDFTs = assetWt.multipliedBy(noOfDFTs); // wt per DFT * no. of DFTs 

        // creating the Fireblocks ID for this vinter index
        let assetIdFireblocks;
        let assetNamePortions = currentAssets[a].split('-');
        let assetName = assetNamePortions[0].toUpperCase();
        if (assetNamePortions[0] == "eth")
            assetIdFireblocks = "BASECHAIN_" + assetName + "_TEST5"; // eg: BASECHAIN_ETH_TEST5
        else
            assetIdFireblocks = assetName + "_TEST";

        // q should the asset quantities be returned in wei (1e18)? 
        // assetToBeDepositedBasedOnWeights[a] = assetQuantityToDeposit.multipliedBy(precision);
        assetSplitsBasedOnNoOfDFTs[a] = {
            assetIdOnFireblock: assetIdFireblocks,
            assetQuantity: assetSplitBasedOnDFTs
        }
    }
    return assetSplitsBasedOnNoOfDFTs;
}

function subscribeToBurnEvents() {
    // listen to burn events

    // call the withdrawAssetsForMM(address) to initiate transfers from withdraw vault to MM respective withdrawal addresses
}

async function withdrawAssetsForMM(mmAddress, dftBurnt) {
    // get the withdrawal address of each asset for this MM
    let withdrawTrxns = [];
    const db = getDB();
    const filter = { "marketMaker": mmAddress };
    const mmVaultDetails = await db.collection('vaults').findOne(filter);
    const vaultId = mmVaultDetails.vaultId;
    console.log(`Vault ID: ${vaultId}`);
    const vaultAssets = mmVaultDetails.vaultAssets;
    const assetValuesToWithdraw = await calculateAssetWts(dftBurnt);

    // checking if the MM has enough assets in their Fireblock vault to withdraw
    for (let a = 0; a < vaultAssets.length; a++) {
        let assetIdOnFireblocks = vaultAssets[a].assetIdOnFireblocks;
        console.log(`Asset ID on Fireblocks: ${assetIdOnFireblocks}`);

        // withdraw details
        let assetWithdrawAddrOfMM = vaultAssets[a].withdrawalAddress;
        let assetQuantityObj = assetValuesToWithdraw.find(
            assetQuantityObj => assetQuantityObj.assetIdOnFireblock === assetIdOnFireblocks);
        let assetQuantity = assetQuantityObj.assetQuantity;

        // vault asset
        let fireblockAssetObj = await fireblocks.getVaultAccountAsset(vaultId, assetIdOnFireblocks);
        let fireblockAssetBal = Number(fireblockAssetObj.total);
        console.log(`Asset balance in vault: ${fireblockAssetBal}`);


        if (fireblockAssetBal == 0) { // skip this asset withdrawal
            debug(`Asset was never deposited by MM: ${vaultAssets[a].asset}`);
            console.log(`Asset was never deposited by MM: ${vaultAssets[a].asset}`);
        } else {
            console.log(`Found ${fireblockAssetBal} amount of ${vaultAssets[a].asset} asset in InvestMint Custody`);

            // initiate transfer from Investmint withdraw vault -> MM withdraw address for the asset
            // TODO: add await here
            const fireblockWithdrawTrxnRes = await fireblocks.createTransaction({
                "assetId": String(assetIdOnFireblocks),
                "source": {
                    "type": "VAULT_ACCOUNT",
                    "id": String(vaultId) || 0
                },
                "destination": {
                    "type": "ONE_TIME_ADDRESS",
                    "oneTimeAddress": {
                        "address": String(assetWithdrawAddrOfMM)
                    }
                },
                "amount": String(assetQuantity),
            });
            debug(`Withdrew ${assetQuantity} amount of ${vaultAssets[a].asset} asset from InvestMint Custody`);
            console.log(`Withdrew ${assetQuantity} amount of ${vaultAssets[a].asset} asset from InvestMint Custody`);
            console.log(inspect(fireblockWithdrawTrxnRes));
            withdrawTrxns.push(fireblockWithdrawTrxnRes);
        }
    }
    return withdrawTrxns;
}

module.exports = { createWithdrawVault, withdrawAssetsForMM, ensureEnoughWithdrawFundsAvailable, calculateAssetWts };