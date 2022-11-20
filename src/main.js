import ora from 'ora';
import boxen from 'boxen';
import inquirer from 'inquirer';
import axios from 'axios';
import accounting from 'accounting';
import columnify from 'columnify';
import chalk from 'chalk';
import open from 'open';

const currencyMap = {
    GBP: '£',
    USD: '$',
    EUR: '€'
};

const statusMap = {
    UPCOMING: chalk.yellow,
    PENDING: chalk.yellow,
    REVERSED: chalk.blue,
    SETTLED: chalk.green,
    DECLINED: chalk.red,
    REFUNDED: chalk.blue,
    RETRYING: chalk.yellow,
    ACCOUNT_CHECK: chalk.grey
};

const directionMap = {
    IN: chalk.green,
    OUT: chalk.red
};

const mandateStatusMap = {
    LIVE: chalk.green,
    PENDING_CAS: chalk.yellow,
    CANCELLED: chalk.red
};

function isValidDate(dateString) {
    const regEx = /^\d{4}-\d{2}-\d{2}$/;
    return dateString.match(regEx) != null;
}

function getFirstDayOfMonth() {
    const date = new Date();
    return new Date(date.getFullYear(), date.getMonth(), 1);
}

function formatDate(date, time = false) {
    const d = date.getDate();
    const m = date.getMonth() + 1; // Month from 0 to 11
    const y = date.getFullYear();
    let dateStr = `${y}-${m <= 9 ? '0' + m : m}-${d <= 9 ? '0' + d : d}`;
    if (time) {
        const h = date.getHours();
        const mm = date.getMinutes();
        dateStr = dateStr.concat(` ${h <= 9 ? '0' + h : h}:${mm <= 9 ? '0' + mm : mm}`);
    }
    return dateStr;
}

export async function init(config) {
    console.log(`We'll walk you through connecting to your Starling bank account. First off...`);
    const { openBrowser } = await inquirer.prompt([
        {
            type: 'confirm',
            name: 'openBrowser',
            message: 'Open the Starling Developer portal in your browser?',
            default: true
        }
    ]);
    if (openBrowser) { await open('https://developer.starlingbank.com/signup'); }
    console.log(`Now, create an account or sign in.`);
    console.log(`Then, under Settings, choose Account and then connect your Starling account. You'll need the mobile app to complete this step.`);
    console.log(`Then, under Personal Access, click Create Token. Generate a new token with the following scopes: account:read, account-list:read, balance:read, mandate:read, transaction:read.`);
    console.log(`Copy the token and enter it below.`);
    const { token } = await inquirer.prompt([
        {
            type: 'password',
            name: 'token',
            message: 'Personal Access Token'
        }
    ]);
    const spinner = ora({ text: 'Fetching accounts...', color: 'yellow' }).start();
    try {
        const { data } = await axios.get('https://api.starlingbank.com/api/v2/accounts', {
            headers: {
                Authorization: `Bearer ${token}`
            }
        });
        config.set({ token, accounts: data.accounts });
        spinner.succeed('Account connected!');
    } catch ({ error }) {
        spinner.fail(error.error_description);
    }
}

export async function checkBalance(config) {
    const spinner = ora({ text: 'Fetching balances...', color: 'yellow' }).start();
    try {
        const accounts = config.get('accounts');
        const balances = [];
        for (const acc of accounts) {
            const token = config.get('token');
            const { data } = await axios.get(`https://api.starlingbank.com/api/v2/accounts/${acc.accountUid}/balance`, {
                headers: {
                    Authorization: `Bearer ${token}`
                }
            });
            const balance = accounting.formatMoney(data.effectiveBalance.minorUnits / 100, { symbol: currencyMap[acc.currency] });
            balances.push(balance);
        }
        spinner.stop();
        console.log(boxen(balances.join('\n'), { padding: 1, margin: 1, borderStyle: 'double', borderColor: 'green' }));
    } catch ({ error }) {
        spinner.fail(error.error_description);
    }
}

export async function checkBalancePlaintext(config) {
    try {
        const accounts = config.get('accounts');
        const balances = [];
        for (const acc of accounts) {
            const token = config.get('token');
            const { data } = await axios.get(`https://api.starlingbank.com/api/v2/accounts/${acc.accountUid}/balance`, {
                headers: {
                    Authorization: `Bearer ${token}`
                }
            });
            const balance = accounting.formatMoney(data.effectiveBalance.minorUnits / 100, { symbol: currencyMap[acc.currency] });
            balances.push(balance);
        }
        console.log(balances.join('\n'));
    } catch ({ error }) {
        console.log(error.error_description);
    }
}

export async function returnDailySpendForCurrentMonth(config) {
    const account = config.get('accounts')[0]; // Assume only one account
    var currentDate = new Date();
    var dateToCheck = new Date(currentDate.getFullYear() + '-' + (currentDate.getMonth()+1) + '-1');

    try {
        const token = config.get('token');
 
        // iterate through each day of the month to date
        for (var i = 1; i <= currentDate.getDate(); i++){
            
            dateToCheck.setDate(dateToCheck.getDate() + i);
            var startDay = dateToCheck.setUTCHours(0,0,0,0);
            var endDay = dateToCheck.setUTCHours(23,59,59,999);
            var startDayString = new Date(startDay).toISOString();
            var endDayString = new Date(endDay).toISOString();

            process.stdout.write(String(dateToCheck.getFullYear()) + '-' +
            String(dateToCheck.getMonth()+1) + '-' +
            i + ',');

            const { data } = await axios.get(`https://api.starlingbank.com/api/v2/feed/account/${account.accountUid}/category/${account.defaultCategory}/transactions-between`, {
                headers: {
                    Authorization: `Bearer ${token}`
                },
                params: {
                    minTransactionTimestamp: startDayString,
                    maxTransactionTimestamp: endDayString
                }
            });

            // Filter for only outbound transactions
            data.feedItems = data.feedItems.filter(transaction => transaction.direction == 'OUT')
            var dateAmount = data.feedItems.reduce((partial_sum, a) => partial_sum + a.amount.minorUnits, 0) / 100;
            
            process.stdout.write(String(dateAmount) + '\n');
            dateToCheck.setDate(0);
        }
    } catch ({ error }) {
        console.log(error);
    }
}

export async function listTransactions(config) {
    const accounts = config.get('accounts');
    const questions = [
        {
            type: 'list',
            name: 'account',
            message: 'Select account',
            choices: accounts.map(a => ({ name: a.currency, value: a }))
        },
        {
            name: 'startDate',
            message: 'Transactions start date (YYYY-MM-DD)',
            default: formatDate(getFirstDayOfMonth()),
            validate: (input) => {
                return isValidDate(input) ? true : 'Date is invalid. Re-enter'
            }
        }
    ];
    const { account, startDate } = await inquirer.prompt(questions);
    const spinner = ora({ text: 'Fetching transactions...', color: 'yellow' }).start();
    try {
        const token = config.get('token');
        const { data } = await axios.get(`https://api.starlingbank.com/api/v2/feed/account/${account.accountUid}/category/${account.defaultCategory}`, {
            headers: {
                Authorization: `Bearer ${token}`
            },
            params: {
                changesSince: new Date(startDate)
            }
        });
        spinner.stop();
        displayTransactions(data.feedItems);
    } catch ({ error }) {
        spinner.fail(error.error_description);
    }
}

export async function listTransactionsForDate(config, options) {
    const accounts = config.get('accounts');
    const questions = [
        {
            type: 'list',
            name: 'account',
            message: 'Select account',
            choices: accounts.map(a => ({ name: a.currency, value: a }))
        },
        {
            name: 'specificDate',
            message: 'Transactions date (YYYY-MM-DD)',
            default: formatDate(new Date()),
            validate: (input) => {
                return isValidDate(input) ? true : 'Date is invalid. Re-enter'
            }
        }
    ];
    const { account, specificDate } = await inquirer.prompt(questions);
    const spinner = ora({ text: 'Fetching transactions...', color: 'yellow' }).start();
    try {
        const token = config.get('token');
        var currentDate = new Date(specificDate);
        var startDay = currentDate.setUTCHours(0,0,0,0);
        var endDay = currentDate.setUTCHours(23,59,59,999);
        var startDayString = new Date(startDay).toISOString();
        var endDayString = new Date(endDay).toISOString();
        const { data } = await axios.get(`https://api.starlingbank.com/api/v2/feed/account/${account.accountUid}/category/${account.defaultCategory}/transactions-between`, {
            headers: {
                Authorization: `Bearer ${token}`
            },
            params: {
                minTransactionTimestamp: startDayString,
                maxTransactionTimestamp: endDayString
            }
        });
        spinner.stop();
        displayTransactions(data.feedItems);
        var dateAmount = data.feedItems.reduce((partial_sum, a) => partial_sum + a.amount.minorUnits, 0) / 100;
        console.log("Total for date is: " + dateAmount);
    } catch ({ error }) {
        console.log(error);
        spinner.fail(error.error_description);
    }
}

export async function listMandates(config) {
    const spinner = ora({ text: 'Fetching mandates...', color: 'yellow' }).start();
    try {
        const token = config.get('token');
        const { data } = await axios.get('https://api.starlingbank.com/api/v2/direct-debit/mandates', {
            headers: {
                Authorization: `Bearer ${token}`
            }
        });
        spinner.stop();
        displayMandates(data.mandates);
    } catch ({ error }) {
        spinner.fail(error.error_description);
    }
}

function displayTransactions(feedItems) {
    const columns = columnify(feedItems.map(fi => {
        return {
            time: formatDate(new Date(fi.transactionTime), true),
            status: statusMap[fi.status](fi.status),
            amount: directionMap[fi.direction](accounting.formatMoney(fi.amount.minorUnits / 100, { symbol: currencyMap[fi.amount.currency] })),
            name: fi.counterPartyName,
            type: fi.source
        };
    }));
    console.log(columns);
}

function displayMandates(mandateItems) {
    const columns = columnify(mandateItems.map(mi => {
        return {
            originator: mi.originatorName,
            reference: mi.reference,
            created: formatDate(new Date(mi.created), true),
            status: mandateStatusMap[mi.status](mi.status)
        };
    }));
    console.log(columns);
}
