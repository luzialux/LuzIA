// Lança o servidor dev de forma desanexada (sobra quando o comando termina)
const { spawn } = require("node:child_process");
const fs = require("node:fs");

const out = fs.openSync("/home/z/my-project/dev.log", "a");
const err = fs.openSync("/home/z/my-project/dev.log", "a");

const child = spawn("bun", ["run", "dev"], {
  cwd: "/home/z/my-project",
  detached: true,
  stdio: ["ignore", out, err],
  env: process.env,
});
child.unref();
console.log("dev server pid:", child.pid);
