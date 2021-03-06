#!/usr/bin/env node

"use strict";

require('./core/polyfill');

const throttle = require('lodash.throttle');

const term = require('./core/terminal');
const api = require('./quoinex/api');
const model = require('./core/model');
const products = require('./core/product');

const render_wait = 200;

let product = null;
let buffer = new model.ExecutionBuffer();


const _render = () => {
  let out = process.stdout;

  out.write(term.clear);
  out.write(term.nl);

  out.write("  Product:".padEnd(20));
  out.write(product.name.padStart(26));
  out.write(term.nl);

  let stats = buffer.getStats();
  out.write("  Buy:".padEnd(20));
  out.write(term.colorful(
    term.bid_color, product.format_volume(stats.buy_volume).padStart(26)));
  out.write(term.nl);

  out.write("  Sell:".padEnd(20));
  out.write(term.colorful(
    term.ask_color, product.format_volume(stats.sell_volume).padStart(26)));
  out.write(term.nl);

  out.write("  Buy/Sell Ratio:".padEnd(20));
  out.write(term.colorful(
    term.updown_color(stats.change, 1.0), stats.change.toFixed(2).padStart(26)));
  out.write(term.nl);

  out.write(term.separator + term.nl);

  for (let i=buffer.data.length-1; i>=0; i--) {
    const row = buffer.data[i];
    out.write("  ");
    out.write(row.time.toLocaleTimeString().padEnd(14));
    out.write(term.colorful(
      row.side == 'BUY' ? term.bid_color : term.ask_color,
      row.side.padEnd(4) + product.format_price(row.price).padStart(10)));
    out.write(product.format_volume(row.size).padStart(16));
    out.write(term.nl);
  }

  out.write(term.separator + term.nl);
  out.write(term.nl);
};
let render = throttle(_render, render_wait);


const main = (program) => {

  product = products.get_product(program.product);
  buffer.lock().setCapacity(program.row);

  new api.PublicAPI()
    .call('GET', '/executions', {product_id: product.id, limit: program.row})
    .then(data => {
      buffer.set(data.models.reverse());
      buffer.unlock();
      render();
    });

  buffer.unlock();

  new api.RealtimeAPI()
    .subscribe(product.get_executions_channel())
    .bind("created", data => {
      buffer.add(data);
      render();
    });
};

process.on("uncaughtException", (err) => {
  console.error("Error:", err.message || err);
  process.exit(1);
});

const program = require('commander');
program
  .version(require('./package.json').version)
  .description("Display QUOINE's execution history")
  .option("-p, --product <code>", "Currency pair code (default: BTCJPY)",
    s => s.toUpperCase(), "BTCJPY")
  .option("-r, --row <n>", "Number of display rows (default: 40)", v => parseInt(v), 40)
  .on("--help", () => {
    console.log("");
    console.log("  Examples:");
    console.log("");
    console.log("    $ node executions.js -p ETHBTC -r 20");
    console.log("");
  })
  .parse(process.argv || process.argv);

main(program);
