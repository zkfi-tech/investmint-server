const createError = require('http-errors');
const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const logger = require('morgan');
const schedule = require('node-schedule');
const debug = require('debug')('investmint-offchain-server:app');
const { Web3Eth } = require('web3-eth');

require('dotenv').config();

// Routes
const indexRouter = require('./routes/index');

// Utils
const { vinterIndexRebalanceDateTracker, vinterIndexAssetPriceTracker } = require('./utils/vinter-index');
const { getPrecision, updateAUM } = require('./utils/onChainInteractions.js');
const { connectDB } = require('./utils/dbConfig');

const app = express();

app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/', indexRouter);

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
  res.render('error');
});

(async () => {
  await connectDB();
  
    vinterIndexAssetPriceTracker(); // run asset price tracker on startup
    const aum = await updateAUM(); // update AUM value on startup
    debug(`Got back AUM: ${aum}`);
    
    const reccuranceJobsRule = new schedule.RecurrenceRule();
    reccuranceJobsRule.minute = 0; // 0th min of every hour
  
    const assetPriceIndexJob = schedule.scheduleJob(reccuranceJobsRule, vinterIndexAssetPriceTracker); // scheduling asset price job for each hour
    const aumUpdateOnChainJob = schedule.scheduleJob(reccuranceJobsRule, updateAUM);
    debug(`Asset Price Index Job next run: ${assetPriceIndexJob.nextInvocation()}`);
    debug(`AUM Onchain update Job next run: ${aumUpdateOnChainJob.nextInvocation()}`);

    vinterIndexRebalanceDateTracker(); // schedules `vinter-index::vinterIndexRebalancer()` and `vinterIndex::vinterIndexRebalanceDateTracker()`
})();

module.exports = app;
