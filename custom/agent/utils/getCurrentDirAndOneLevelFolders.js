const fs = require("fs");
const path = require("path");

function getFoldersUpToOneDepth(baseDir = process.cwd()) {
    const result = [];

    const shouldIgnore = (name) => name.startsWith(".") || name === "node_modules";

    // Level 0
    result.push(baseDir);

    // Level 1
    const level1 = fs.readdirSync(baseDir, { withFileTypes: true })
        .filter(entry => entry.isDirectory() && !shouldIgnore(entry.name))
        .map(entry => path.join(baseDir, entry.name));

    result.push(...level1);

    // Level 2
    for (const folder of level1) {
        try {
            const level2 = fs.readdirSync(folder, { withFileTypes: true })
                .filter(entry => entry.isDirectory() && !shouldIgnore(entry.name))
                .map(entry => path.join(folder, entry.name));
            result.push(...level2);
        } catch (e) {
            console.warn(`Cannot access ${folder}: ${e.message}`);
        }
    }

    return JSON.stringify(result);
}

module.exports = { getFoldersUpToOneDepth };
