// writeFile.js
const fs = require('fs');
const path = require('path');

// Extracts all <write_to_file>...</write_to_file> blocks
function extractWriteFileBlocks(output) {
    const writeFileRegex = /<write_to_file>([\s\S]*?)<\/write_to_file>/g;
    const matches = [...output.matchAll(writeFileRegex)];
    return matches.length > 0 ? matches.map(m => m[0]).join('\n') : null;
}

// Handles writing the file(s)
function handleWriteToFile(blocksString, baseDir = process.cwd()) {
    const writeBlocks = [...blocksString.matchAll(/<write_to_file>([\s\S]*?)<\/write_to_file>/g)];
    const results = [];

    for (const match of writeBlocks) {
        const block = match[1];

        // Use flexible regex to extract path and content even with multiline data
        const pathMatch = block.match(/<path>([^]*?)<\/path>/);
        const contentMatch = block.match(/<content>([^]*?)<\/content>/);

        if (!pathMatch || !contentMatch) {
            results.push(`❌ Invalid write block: missing <path> or <content>.`);
            continue;
        }

        const filePath = pathMatch[1].trim();
        let content = contentMatch[1];
        // --- Strip mermaid code fences if present ---
        if (filePath.endsWith('.mmd') || content.includes('sequenceDiagram') || content.includes('graph')) {
            content = stripMermaidCodeFence(content);
        }
        const fullPath = path.resolve(baseDir, filePath);

        try {
            fs.mkdirSync(path.dirname(fullPath), { recursive: true });
            fs.writeFileSync(fullPath, content, 'utf8');
            results.push(`Wrote to ${filePath}`);
        } catch (err) {
            results.push(`Failed to write to ${filePath}: ${err.message}`);
        }
    }

    return results.join('\n');
}

function stripMermaidCodeFence(text) {
    // Match ```mermaid at the start, possibly followed by \r or \n
    if (text.trim().startsWith('```mermaid')) {
        text = text.trim().replace(/^```mermaid\s*/i, '');
    }

    // Remove ending ``` if it exists
    if (text.trim().endsWith('```')) {
        text = text.trim().replace(/```$/, '');
    }

    return text.trim();
}

module.exports = { extractWriteFileBlocks, handleWriteToFile };
