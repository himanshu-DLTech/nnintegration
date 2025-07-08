function extractAttemptCompletion(text) {
    const match = text.match(/<attempt_completion>\s*<result>([\s\S]*?)<\/result>\s*<\/attempt_completion>/);

    if (match) {
        const resultText = match[1].trim();
        return {
            result: true,
            information: resultText
        };
    }

    return { result: false };
}

module.exports = { extractAttemptCompletion };
