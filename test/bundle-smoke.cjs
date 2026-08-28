const Module = require("node:module");

const originalLoad = Module._load;
Module._load = function loadWithVscodeStub(request, parent, isMain) {
  if (request === "vscode") return {};
  return originalLoad.call(this, request, parent, isMain);
};

try {
  const extension = require("../dist/extension.js");
  if (typeof extension.activate !== "function" || typeof extension.deactivate !== "function") {
    throw new Error("The bundle does not export VS Code activation functions.");
  }
  console.log("Bundle loaded and exported activate/deactivate successfully.");
} finally {
  Module._load = originalLoad;
}
