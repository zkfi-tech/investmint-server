const { getDB } = require('./dbConfig');
const debug = require('debug')('investmint-offchain-server:custodian');

async function getVault(MMAddress) {
    try {
        const db = getDB();
        const filter = { marketMaker: MMAddress };
        const vault = await db.collection('vaults').findOne(filter);
        if (vault.vaultId) {
            return vault;
        } else {
            return null;
        }
    } catch (e) {
        debug(`Failed: ${e}`);
    }
}

module.exports = { getVault };