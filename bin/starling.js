#!/usr/bin/env node

import program from "commander";
import Configstore from "configstore";
import updateNotifier from "update-notifier";
import { readFile } from "fs/promises";
import {
  init,
  checkBalance,
  listTransactions,
  listTransactionsForDate,
  listMandates,
  checkBalancePlaintext,
  returnDailySpendForCurrentMonth,
} from "../src/main.js";

const pkg = JSON.parse(
  await readFile(new URL("../package.json", import.meta.url))
);

updateNotifier({ pkg }).notify();

const config = new Configstore(pkg.name);

program.version(pkg.version);

program
  .command("init")
  .alias("i")
  .description("Initialise connection to Starling")
  .action(() => {
    init(config);
  });

program
  .command("balance")
  .alias("b")
  .description("Fetch your Starling account balance")
  .action(() => {
    checkBalance(config);
  });

program
  .command("balanceplaintext")
  .alias("bp")
  .description("Fetch your Starling account balance as plaintext")
  .action(() => {
    checkBalancePlaintext(config);
  });

program
  .command("transactions")
  .alias("tx")
  .description("Fetch your Starling account transactions")
  .action(() => {
    listTransactions(config);
  });

  program
  .command("transactionsfordate")
  .alias("txd")
  .description("Fetch your Starling account transactions for a specific date")
  .action(() => {
    listTransactionsForDate(config);
  });

  program
  .command("returnDailySpendForCurrentMonth")
  .alias("mspend")
  .description("Fetch your daily Starling account spend for the current month to date")
  .action(() => {
    returnDailySpendForCurrentMonth(config);
  });

program
  .command("mandates")
  .alias("dd")
  .description("Fetch the Direct Debit mandates on your Starling account")
  .action(() => {
    listMandates(config);
  });

program.parse(process.argv);
