import { execSync } from "child_process";

execSync("bun run build");

const script = await Bun.file("dist/index.js").text();
const css = await Bun.file("dist/index.css").text();

let html = await Bun.file("index.html").text();

html = html.replace(`<script src="dist/index.js" type="module"></script>`, `<script type="module">${script}</script>`);

html = html.replace(`<link href="dist/index.css" rel="stylesheet">`, `<style>${css}</style>`);

await Bun.write("dist/index.html", html);
