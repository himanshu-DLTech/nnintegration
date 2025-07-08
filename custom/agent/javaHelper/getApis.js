const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const { JAVA_UTILS_DIR } = require('../lib/constants')

function runJavaParser(sourceFolder, outputFolder) {
    const classpath = `${JAVA_UTILS_DIR}:${JAVA_UTILS_DIR}/*`; // Use `;` instead of `:` on Windows

    const javaClass = "ApiAstExtractor";
    const javacCmd = `javac -cp "${classpath}" ${JAVA_UTILS_DIR}/ApiAstExtractor.java`;
    const javaCmd = `java -cp "${classpath}" ${javaClass} "${sourceFolder}" "${outputFolder}"`;

    try {
        console.log("Compiling ApiAstExtractor...");
        execSync(javacCmd, { stdio: "inherit" });

        console.log("Running ApiAstExtractor...");
        execSync(javaCmd, { stdio: "inherit" });

        const outputPath = path.join(outputFolder, "apis.json");
        if (fs.existsSync(outputPath)) {
            const json = JSON.parse(fs.readFileSync(outputPath, "utf-8"));
            console.log("Extracted APIs:");
            console.log(JSON.stringify(json, null, 2));
            return json;
        } else {
            console.error("apis.json not found in output folder.");
        }
    } catch (err) {
        console.error("Error running ApiAstExtractor:", err.message);
    }
}

module.exports = { runJavaParser }

