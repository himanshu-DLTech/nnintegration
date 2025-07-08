const { countTokens, logCost} = require('./tokenCounter');
const AGENT_CONSTANTS = require('./lib/constants');

const readFile = require(`${AGENT_CONSTANTS.CMD_DIR}/readFile.js`);
const writeFile = require(`${AGENT_CONSTANTS.CMD_DIR}/writeFile.js`);
const { callApi } = require(`${AGENT_CONSTANTS.LIB_DIR}/apiCaller.js`);
const messageStore = require(`${AGENT_CONSTANTS.AGENT_DIR}/messageStore.js`);
const { executeCommand } = require(`${AGENT_CONSTANTS.CMD_DIR}/executeCommand.js`);
const { getFoldersUpToOneDepth } = require(`${AGENT_CONSTANTS.UTILS_DIR}/getCurrentDirAndOneLevelFolders.js`);
const { extractAttemptCompletion } = require(`${AGENT_CONSTANTS.CMD_DIR}/extractAttemptCompletion.js`);


async function run(api, filePath, repoPath) {
 const initialUserPrompt = `<task>
This is my api name ${api}. This is the path of api: ${filePath}.This is repo path of the api ${repoPath}.This is current directory structure: ${getFoldersUpToOneDepth()}.I need documentation for this api in depth and also provide the documentation of all involved classes/methods in depth.Trace all direct and indirect method calls and object interactions that occur as part of the execution flow for the api. For each method or service invoked, recursively follow the call chain—including any asynchronous, event-driven, or message-passing mechanisms (such as requests, events, or queues)—until you reach all external system boundaries or significant side effects. Document any classes, methods, or components that are involved in the flow, even if they are not directly referenced in the entry point, but are triggered as a result of the process (e.g., via service layers, event dispatchers, or background workers). Highlight any third-party or internal framework components that are part of the chain.Also visit other modules which are outside of the current module if flow is going to other external systems. Note external systems code is also present inside the main repo directory.Add logic to identify and document all event listeners or consumers triggered by the API, including their full processing flow and any downstream service or database interactions. Where you find database operations, please add database details in the documentation. Also, identify and document all messaging components used in the API flow, including message producers, consumers, queues, exchanges, and bindings (e.g., RabbitMQ or other Spring Boot messaging systems). For each message publisher, document the message structure, target exchange/queue, and routing configuration. For each consumer or listener, provide detailed documentation of the message handling logic, including deserialization, processing, and any service or database interactions triggered as part of the message consumption. Ensure to trace asynchronous flows initiated through messaging fully, and include them in both the documentation and the sequence diagram. Document both internal and external messaging flows, and indicate any dependencies on other services or modules that process the same messages. Please ensure that the documentation is comprehensive and covers all aspects of the API functionality. The documentation should be clear, concise, and easy to understand for developers who will use this API in the future.You should also ensure that the documentation is well-structured and follows best practices for API documentation.I also need a sequence flow diagram too for the api flow. Make two files flow.md for documentation flow ,digram.mmd for sequence diagram saved in a folder named '${api.replaceAll("/", "_")}_documentation'.Folder should be created in this directory ${AGENT_CONSTANTS.OUTPUT_DIR} .Documentation should be saved in md format and diagram should be in mermaid format.Note if you are not able to find a file at proper location you can use linux commands to find it in the repo directory."\\n\\n> **Note for improved diagram generation:**\\n> When generating the Mermaid sequence diagram, ensure that:\\n>\\n> * All key components (controllers, services, validators, message brokers, consumers, external systems) are included as 'participants'\\n> * Interactions (sync and async) are accurately represented using '->>', '-->>'\\n> * Asynchronous or conditional flows (e.g., messaging, event-based handling) are modeled using 'alt', 'else', or 'opt' blocks\\n> * Class names are simplified using 'as' (e.g., 'RegisterManagerImpl as RegisterManager') for readability\\n> * External systems (e.g., databases, third-party APIs) are included as separate participants\\n> * Avoid repetition and maintain clean, linear flow wherever possible.Do not use aliases use original names .Ensure the internal logic triggered by the initial API request (e.g., Client → Controller) is shown as part of the same continuous flow. Use rect blocks or proper call indentation to group internal steps, avoiding the appearance of disconnected flows. This improves readability and shows full end-to-end trace from entry point to final response or async messaging.\\n\\n"
</task>`

    // reset conversation in starting
    messageStore.resetMessages();
    messageStore.addUser(initialUserPrompt);

    while (true) {
        const tokensUsedBefore = countTokens(messageStore.getMessages());
        console.log(`Total tokens used before call: ${tokensUsedBefore}`);

        const maxTokensAllowed = 1048576;
        const tokensRemaining = maxTokensAllowed - tokensUsedBefore;
        console.log(`Tokens left for output: ${tokensRemaining}`);

        const llmReply = await callApi(messageStore.getMessages()); // plain string
        messageStore.addAssistant(llmReply);

        const tokensUsedAfter = countTokens(messageStore.getMessages());
        const outputTokens = tokensUsedAfter - tokensUsedBefore;
        console.log(`Tokens used by output: ${outputTokens}`);

        logCost(tokensUsedBefore, outputTokens);

        console.log('LLM Response:\n', llmReply);

        // --- Handle <read_file> blocks ---
        const readBlock = readFile.extractReadFileBlocks(llmReply);
        if (readBlock) {
            const readFileText = readFile.getFileContentsFormatted(readBlock);
            const readReply = `Response to <read_file>:\n${readFileText}`;
            messageStore.addUser(readReply);
        }

        const writeBlock = writeFile.extractWriteFileBlocks(llmReply);
        if (writeBlock) {
            const writeOutput = writeFile.handleWriteToFile(writeBlock);
            const writeReply = `Response to <write_to_file>:\n${writeOutput}`;
            messageStore.addUser(writeReply);
        }

        // --- Handle <execute_command> blocks ---
        const execReply = executeCommand(llmReply);
        if (execReply) messageStore.addUser(execReply);

        const result = extractAttemptCompletion(llmReply);
        if (result.result) break;
    }

    return { result: true };
}

module.exports = { run };
