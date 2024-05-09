const express = require('express');
const router = express.Router();
const crypto = require('node:crypto');
const { getDB } = require('../utils/dbConfig');
const debug = require('debug')('investmint-offchain-server:custodianEvents');
const { confirmDepositOnChain } = require('../utils/onChainInteractions');
const publicKey = process.env.FIREBLOCKS_WEBHOOK_SANDBOX_PUBLIC_KEY.replace(/\\n/g, "\n");

router.post("/", async (req, res) => {
    debug(`Received event from Fireblocks webhook`);
    const message = JSON.stringify(req.body);
    const signature = req.headers["fireblocks-signature"];

    const verifier = crypto.createVerify('RSA-SHA512');
    verifier.write(message);
    verifier.end();

    const isVerified = verifier.verify(publicKey, signature, "base64");

    if (isVerified) {
        if (message.operation == "TRANSFER") {
            /// @dev Maintaining temporary record of each deposit by a MM, till they deposit all index assets. Once all index assets deposited, DFT minting permission will be given to MM onchain and this temp. deposit record will be restored.
            // We are not relying on asset wallet bal. from the custodian system as sweeping process might not happen immediately due to gas fee to be paid while sweeping. This delay in restoring wallet bal can allow for frontrunning attack vector, even after the MM mints the DFTs. Therefore, to avoid this, we record and restore wallet bal. explicitely.
            const db = getDB();
            const collection = await db.collection('vaults');
            const vaultAssetQuery = {
                "vaultAssets": {
                    $elemMatch: {
                        "vaultAssetDepositAddress": message.destinationAddress,
                        "assetIdOnFireblocks": message.assetId
                    }
                }
            };

            const vaultAssetUpdateBal = {
                $inc: { "vaultAssets.$.balance": message.netAmount }
            };

            // update vault asset balance for MM (deposit)
            await collection.updateOne(vaultAssetQuery, vaultAssetUpdateBal);

            // checking if all index assets have been deposited by this market maker
            let allAssetsDeposited = await checkIfAllIndexAssetsDeposited(message.sourceAddress);
            if (allAssetsDeposited) {
                debug("Finally all assets deposited by MM. Time to MINTTTT!");
                
                confirmDepositOnChain(message.sourceAddress);

                // restore asset balances in our DB
                let mmVaultFilter = { marketMaker: message.sourceAddress };
                let updateDoc = {
                    $set: {
                        "vaultAssets.$[].balance": 0
                    }
                }

                const restored = await collection.updateOne(mmVaultFilter, updateDoc);
                console.log(JSON.stringify(restored));
                //TODO: initiate sweeping process
            }
        }
        debug(`Custodian webhook call received for operation: ${message.operation}`);
    }
    res.send("ok");
});

async function checkIfAllIndexAssetsDeposited(mmAddress) {
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
        return true;
    } else {
        debug(`Next asset needs to be deposited`);
        return false;
    }
}

module.exports = router;