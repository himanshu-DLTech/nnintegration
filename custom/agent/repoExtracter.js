const fsPromises = require('fs').promises;
const { execSync } = require('child_process');
const AGENT_CONSTANTS = require('./lib/constants');

exports.start = async (_routeName, _, _messageContainer, message) => {
    const repo_url =  message.content.repo_url;
    const repo_path = message.content.repo_path;
    const api_endpoint = message.content.api_endpoint;
    const repo_username =  message.content.repo_username;
    const repo_access_token = message.content.access_token;
    const repo_subDirectory = message.content.repo_subDirectory || '';
    
    if (!repo_path && !repo_url) {
        console.error("Repository path or URL is required as the first argument.");
        console.error("Usage: node startDocumentation.js <repoPath> [apiEndpoint]");
        message.content = {};
        message.content.status = false;
        message.content.error = "Repository path or URL is required.";
    }

    if(!repo_path && repo_url) {
        try {
            const repoName = repo_url.split('/').pop().replace('.git', '');
            const clonedRepoPath = `${AGENT_CONSTANTS.CLONED_REPOS_DIR}/${repoName}`;
            try { await fsPromises.access(clonedRepoPath, fsPromises.constants.F_OK); }
            catch (err) {
                if (repo_username && repo_access_token) {
                    execSync(`git clone https://${repo_username}:${repo_access_token}@${repo_url} ${clonedRepoPath}`, { stdio: 'inherit' });
                } else {
                    execSync(`git clone ${repo_url} ${clonedRepoPath}`, { stdio: 'inherit' });
                }
            }
            
            message.content = {};
            message.content.status = true;
            message.content.error = null;
            message.content.repo_path = `${clonedRepoPath}/${repo_subDirectory}`; // Set the cloned repository path4
            message.api_endpoint = api_endpoint;
        }
        catch (error) {
            console.error("Error cloning repository:", error.message);
            message.content = {};
            message.content.status = false;
            message.content.error = "Failed to clone repository.";
        }
    } else { message.status = true; }
    
    message.addRouteDone(_routeName); _messageContainer.add(message);
    message.setGCEligible(true);
}