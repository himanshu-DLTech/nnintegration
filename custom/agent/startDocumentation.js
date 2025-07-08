const path = require('path');
const AGENT_CONSTANTS = require('./lib/constants');
const { execSync } = require('child_process');

const { run } = require(`${AGENT_CONSTANTS.AGENT_DIR}/agent.js`);
const { runJavaParser } = require(`${AGENT_CONSTANTS.JAVA_HELP_DIR}/getApis`);

async function processApis(apiList, documentationDir, apiEndpoint) {
    if (!Array.isArray(apiList)) {
        throw new Error("Input must be an array of API entries.");
    }

    for (const api of apiList) {
        const { endpoint, filePath } = api;
        if (apiEndpoint && endpoint !== apiEndpoint) continue;
        if (!endpoint || !filePath) {
            console.warn(`Skipping invalid entry for enpoint: ${api.endpoint} and filePath: ${api.filePath}`);
            continue;
        }
        
        try {
            await run(endpoint, path.resolve(repoPath, filePath), repoPath, documentationDir);
        } catch (err) {
            console.error(`Error running for ${endpoint} in ${filePath}:`, err);
        }
    }

    try {
        const documentationParentDir = path.dirname(documentationDir);
        const documentationFolderName = path.basename(documentationDir);
        execSync(`cd ${documentationParentDir} && zip -r ${documentationFolderName}.zip ${documentationFolderName}`, { stdio: 'inherit' });
    } catch (error) {
        LOG.error("Error creating zip file:", error.message);
        throw new Error(`Failed to create zip file of ${documentationDir} to ${documentationDir}.zip`);
    }
}

exports.start = async (_routeName, _, _messageContainer, message) => {
    const repoPath = message.content.repo_path;
    const apiEndpoint = message.content.api_endpoint;
    if (message.content.status) {
        const repoID = Date.now();
        let documentationDir = exports.getDocumentationDir(repoID);
        const extractedApis = await runJavaParser(repoPath, documentationDir);
        try { 
            await processApis(extractedApis, documentationDir, apiEndpoint);
            message.content = {};
            message.content.status = true;
            message.content.error = null;
            message.content.repoID = repoID; // Set the documentation ID
        } catch (error) {
            LOG.error("Error processing APIs:", error.message);
            message.content = {};
            message.content.status = false;
            message.content.error = `Failed to process APIs. Error ${error.message}`;
        }
    }

    message.addRouteDone(_routeName); _messageContainer.add(message);
    message.setGCEligible(true);
}

exports.getDocumentationDir = (repoID) => `${AGENT_CONSTANTS.OUTPUT_DIR}/documentation_${repoID}`;

