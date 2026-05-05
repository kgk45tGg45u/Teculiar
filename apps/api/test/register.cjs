const fs = require("node:fs");
const ts = require("typescript");

require.extensions[".ts"] = (mod, filename) => {
  const source = fs.readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      emitDecoratorMetadata: true,
      esModuleInterop: true,
      experimentalDecorators: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022
    },
    fileName: filename
  }).outputText;

  mod._compile(output, filename);
};
