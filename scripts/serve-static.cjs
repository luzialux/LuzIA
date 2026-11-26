// Sobe um servidor estático para a pasta out/ (build de produção).
// Vive destacado do terminal para não ser desligado entre comandos.
const { spawn } = require("node:child_process");
const path = require("node:path");

const porta = process.argv[2] || "4173";
const raiz = path.join(__dirname, "..", "out");

const servidor = `
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const raiz = ${JSON.stringify(raiz)};
const tipos = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
  ".pdf": "application/pdf",
};
http.createServer((req, res) => {
  let caminho = decodeURIComponent(req.url.split("?")[0]);
  if (caminho.endsWith("/")) caminho += "index.html";
  let f = path.join(raiz, caminho);
  if (!f.startsWith(raiz)) { res.writeHead(403); res.end(); return; }
  fs.readFile(f, (err, dados) => {
    if (err) {
      // fallback SPA: devolve o index.html
      fs.readFile(path.join(raiz, "index.html"), (err2, idx) => {
        if (err2) { res.writeHead(404); res.end("404"); return; }
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(idx);
      });
      return;
    }
    res.writeHead(200, { "Content-Type": tipos[path.extname(f)] || "application/octet-stream" });
    res.end(dados);
  });
}).listen(${porta}, () => console.log("estático na porta ${porta}"));
`;

const filho = spawn("node", ["-e", servidor], {
  detached: true,
  stdio: "ignore",
});
filho.unref();
console.log(`servidor estático a arrancar na porta ${porta}`);
