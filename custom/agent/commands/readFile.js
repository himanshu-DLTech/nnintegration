const fs = require('fs');

/**
 * Extracts <path> values from <read_file> blocks and returns concatenated file data.
 * Format: <filepath>\n<file contents>\n\n
 * @param {string} input - Input string containing <read_file> blocks with <path> elements.
 * @returns {string} - Concatenated file paths and contents.
 */
function getFileContentsFormatted(input) {
    const readFileRegex = /<read_file>([\s\S]*?)<\/read_file>/g;
    const pathRegex = /<path>(.*?)<\/path>/g;

    let output = '';
    let blockMatch;

    while ((blockMatch = readFileRegex.exec(input)) !== null) {
        const blockContent = blockMatch[1];

        let pathMatch;
        while ((pathMatch = pathRegex.exec(blockContent)) !== null) {
            const filePath = pathMatch[1].trim();
            try {
                const fileContent = fs.readFileSync(filePath, 'utf8');
                output += `${filePath}\n${fileContent}\n\n`;
            } catch (err) {
                output += `${filePath}\nError reading file: ${err.message}\n\n`;
            }
        }
    }

    return output;
}

function extractReadFileBlocks(output) {
    const readFileRegex = /<read_file>([\s\S]*?)<\/read_file>/g;
    return [...output.matchAll(readFileRegex)].map(match => match[0]).join('\n');
}

module.exports = { getFileContentsFormatted, extractReadFileBlocks }