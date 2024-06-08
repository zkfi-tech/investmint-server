const express = require('express');
const router = express.Router();
const crypto = require('node:crypto');
const { getDB } = require('../utils/dbConfig');
const debug = require('debug')('investmint-offchain-server:custodianEvents');
const { confirmDepositOnChain } = require('../utils/onChainInteractions');
const { inspect } = require('util');
const publicKey = process.env.FIREBLOCKS_WEBHOOK_SANDBOX_PUBLIC_KEY.replace(/\\n/g, "\n");

router.post("/", async (req, res) => {
    const message = req.body;
    const destinationAddress = message.data.destinationAddress;
    const assetId = message.data.assetId;
    const depositAmount = message.data.netAmount;
    const operation = message.data.operation;
    const marketMaker = message.data.sourceAddress;
    console.log(`Fireblock webhook call for ${assetId}`);

    // TODO: Uncomment this for production. 
    // @dev Not able to mock fireblock signature verification, hence commented for now.
    // const signature = req.headers["fireblocks-signature"];
    // const verifier = crypto.createVerify('RSA-SHA512');
    // verifier.write(JSON.stringify(message));
    // verifier.end();

    // const isVerified = verifier.verify(publicKey, signature, "base64");
    // console.log(`Fireblock Signature verification: ${isVerified}`);
    // if (isVerified) {
    //     console.log("Fireblock Signature verified");

    if (operation == "TRANSFER") {
        console.log(`Transfer operation for ${assetId}`);
        /// @dev Maintaining temporary record of each deposit by a MM, till they deposit all index assets. Once all index assets deposited, DFT minting permission will be given to MM onchain and this temp. deposit record will be restored.
        // We are not relying on asset wallet bal. from the custodian system as sweeping process might not happen immediately due to gas fee to be paid while sweeping. This delay in restoring wallet bal can allow for frontrunning attack vector, even after the MM mints the DFTs. Therefore, to avoid this, we record and reset wallet bal. explicitely.
        const db = getDB();
        const collection = await db.collection('vaults');
        const vaultAssetQuery = {
            "vaultAssets": {
                $elemMatch: {
                    "vaultAssetDepositAddress": destinationAddress,
                    "assetIdOnFireblocks": assetId
                }
            }
        };

        const vaultAssetUpdateBal = {
            $inc: { "vaultAssets.$.balance": depositAmount }
        };

        // update vault asset balance for MM (deposit)
        try {
            await collection.updateOne(vaultAssetQuery, vaultAssetUpdateBal);
            console.log(`${assetId} deposited by MM ${marketMaker} and update in DB.`);
        } catch (error) {
            console.error(`Error updating vault asset balance: ${error}`);
        }

        // checking if all index assets have been deposited by this market maker

        let allAssetsDeposited = await checkIfAllIndexAssetsDepositedBy(marketMaker);

        if (allAssetsDeposited) {
            debug(`Finally all assets deposited by MM ${marketMaker}. Time to MINTTTT!`);

            await confirmDepositOnChain(marketMaker); // confirm deposit on chain for MM

            console.log("Resetting asset balances in DB.");
            // reset asset balances in our DB
            let mmVaultFilter = { marketMaker: marketMaker };
            let updateDoc = {
                $set: {
                    "vaultAssets.$[].balance": 0
                }
            }
            try {
                const resetted = await collection.updateOne(mmVaultFilter, updateDoc);
                console.log(JSON.stringify(resetted));
            } catch (error) {
                console.error(`Error resetting asset balances: ${error}`);
            }
            //TODO: initiate sweeping process
        }

        // 
        debug(`Custodian webhook call received for operation: ${message.operation}`);
    }
    res.send("ok");
    // }
});

async function checkIfAllIndexAssetsDepositedBy(mmAddress) {
    const db = getDB();
    const collection = await db.collection('vaults');
    const zeroAssetBalFilter = {
        $and: [
            { marketMaker: mmAddress },
            { "vaultAssets.balance": 0 } // TODO: Can check for the specific asset amt based on no. of DFTs * asset weight
        ]
    }

    const zeroAssetDoc = await collection.findOne(zeroAssetBalFilter);

    if (zeroAssetDoc == undefined) {
        debug(`All assets deposited`);
        console.log(`All assets deposited`);
        return true;
    } else {
        debug(`Next asset needs to be deposited`);
        console.log(`Next asset needs to be deposited`);
        return false;
    }
}

module.exports = router;