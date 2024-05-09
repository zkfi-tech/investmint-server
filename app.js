const createError = require('http-errors');
const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const logger = require('morgan');
const schedule = require('node-schedule');
const debug = require('debug')('investmint-offchain-server:app');

require('dotenv').config();

// Routes import
const cryptoIndexRouter = require('./routes/cryptoIndex');
const vaultRouter = require('./routes/vault');
const fireblocksWebhookRouter = require('./routes/custodianEvents');

// Utils
const { vinterIndexRebalanceDateTracker, vinterIndexAssetPriceTracker } = require('./utils/vinter-index');
const { getPrecision, updateAUM, confirmDepositOnChain } = require('./utils/onChainInteractions.js');
const { connectDB } = require('./utils/dbConfig');
const { createInvestMintOmnibusVault, sweepToInvestMintTreasury } = require('./utils/omnibusVault.js');

const app = express();

app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// Routes
app.use('/', cryptoIndexRouter);
app.use('/intermediateVault', vaultRouter);
app.use('/fireblocksWebhook', fireblocksWebhookRouter);

// catch 404 and forward to error handler
app.use(function (req, res, next) {
  next(createError(404));
});

// error handler
app.use(function (err, req, res, next) {
  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};

  // render the error page
  res.status(err.status || 500);
  res.send('error');
});


(async () => {
  try {
    await connectDB();
    await createInvestMintOmnibusVault();
    vinterIndexAssetPriceTracker(); // run asset price tracker on startup
    const aum = await updateAUM(); // update AUM value on startup
    debug(`Got back AUM: ${aum}`);

    vinterIndexRebalanceDateTracker(); // schedules `vinter-index::vinterIndexRebalancer()` and `vinterIndex::vinterIndexRebalanceDateTracker()`

    // Scheduling Price Tracker & updateAUM
    const reccuranceJobsRule = new schedule.RecurrenceRule();
    reccuranceJobsRule.minute = 0; // 0th min of every hour
    const assetPriceIndexJob = schedule.scheduleJob(reccuranceJobsRule, vinterIndexAssetPriceTracker); // scheduling asset price job for each hour
    const aumUpdateOnChainJob = schedule.scheduleJob(reccuranceJobsRule, updateAUM);
    debug(`Asset Price Index Job next run: ${assetPriceIndexJob.nextInvocation()}`);
    debug(`AUM Onchain update Job next run: ${aumUpdateOnChainJob.nextInvocation()}`);

    // scheduling sweep to treasury
    const sweepingJobRule = new schedule.RecurrenceRule();
    // scheduling at 0th hour of every day in IST timezone
    sweepingJobRule.hour = 0;
    sweepingJobRule.minute = 0;
    sweepingJobRule.tx = 'Asia/Kolkata';
    const sweepingJob = schedule.scheduleJob(sweepingJobRule, sweepToInvestMintTreasury);
    debug(`Sweep to treasury scheduled for: ${sweepingJob.nextInvocation()}`);
  } catch (e) {
    console.error(`Error while starting crucial services during server startup: ${e}`);
  }
})();

module.exports = app;
