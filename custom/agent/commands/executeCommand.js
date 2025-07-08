const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function executeCommand(output) {
    const commands = extractExecuteCommands(output);

    if (commands.length === 0) return '';
    
    let result = ''; for (const command of commands) {
        const match = command.match(/^cat\s+>\s+(.+?)\s+<<EOF\s*\n([\s\S]*?)\nEOF$/);

        if (match) {
            // Detected `cat > file <<EOF ... EOF`
            const filePath = match[1].trim();
            const fileContent = match[2];

            try {
                // Ensure folder exists
                fs.mkdirSync(path.dirname(filePath), { recursive: true });

                // Write the content to the file
                fs.writeFileSync(filePath, fileContent, 'utf8');

                result += `Wrote to file: ${filePath}\nContent length: ${fileContent.length}\n\n`;
            } catch (err) {
                result += `Failed to write file: ${filePath}\nError: ${err.message}\n\n`;
            }
        } else {
            // Normal command (no heredoc)
            try {
                const execOutput = execSync(command, { encoding: 'utf8' });
                result += `Executed command: ${command}\nOutput:\n${execOutput}\n\n`;
            } catch (err) {
                // Special case: grep returns 1 when no matches are found
                if (command.startsWith('grep') && err.status === 1) {
                    result += `Executed command: ${command}\nGrep had zero results.\n\n`;
                } else {
                    result += `Failed command: ${command}\nError:\n${err.message}\n\n`;
                }
            }
        }
    }

    return result.trim();
}

function extractExecuteCommands(output) {
    const commandRegex = /<execute_command>[\s\S]*?<command>([\s\S]*?)<\/command>[\s\S]*?<\/execute_command>/g;
    return [...output.matchAll(commandRegex)].map(match => match[1].trim());
}

module.exports = { executeCommand };
