import esbuild from "esbuild";
import process from "process";

const prod = process.argv[2] === "production";

const context = await esbuild.context({
  entryPoints: ["main.ts"],
  bundle: true,
  external: ["obsidian", "electron"],
  format: "cjs",
  target: "es2020",
  platform: "node",
  outfile: "main.js",
  sourcemap: prod ? false : "inline",
  minify: prod,
  treeShaking: true,
  logLevel: "info",
});

if (prod) {
  await context.rebuild();
  await context.dispose();
  process.exit(0);
} else {
  await context.watch();
  console.log("👀 Watching for changes...");
}
