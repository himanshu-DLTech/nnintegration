const fs = require('fs');
require('dotenv').config();
const path = require('path');
const { encoding_for_model } = require('@dqbd/tiktoken');
const AGENT_CONSTANTS = require('./lib/constants');

// Load environment variables
const MODEL = process.env.AI_MODEL || "<your-ai-model>"; // e.g., "gpt-3.5-turbo"
const INPUT_COST_PER_TOKEN = parseFloat(process.env.INPUT_COST_PER_TOKEN || "0"); // Default to 0 if not set
const OUTPUT_COST_PER_TOKEN = parseFloat(process.env.OUTPUT_COST_PER_TOKEN || "0"); // Default to 0 if not set
const USD_TO_INR = parseFloat(process.env.USD_TO_INR || "86"); // Default to 86 if not set
const MODEL_COST_LOG_FILE = `${AGENT_CONSTANTS.LOG_DIR}/${process.env.MODEL_COST_LOG_FILE || MODEL+"_cost_log.txt"}`; // Default log file name

function countTokens(messages) {
	const encoding = encoding_for_model(MODEL);
	let totalTokens = 0;

	for (const message of messages) {
		totalTokens += 4; // role + separators
		totalTokens += encoding.encode(message.content || '').length;

		if (message.name) {
			totalTokens += encoding.encode(message.name).length;
			totalTokens -= 1; // per OpenAI guidance
		}
	}

	totalTokens += 2; // priming tokens

	encoding.free();
	return totalTokens;
}

function _calculateCost(inputTokens, outputTokens) {
	const usd = (inputTokens * INPUT_COST_PER_TOKEN) + (outputTokens * OUTPUT_COST_PER_TOKEN);
	const inr = usd * USD_TO_INR;
	return { usd, inr };
}

function logCost(inputTokens, outputTokens) {
	const { usd, inr } = _calculateCost(inputTokens, outputTokens);
 	const now = new Date().toISOString().replace('T', ' ').substring(0, 19);
	const logLine = `${now} ${MODEL} $${usd.toFixed(6)} ₹${inr.toFixed(2)}\n`;

	fs.appendFileSync(path.resolve(MODEL_COST_LOG_FILE), logLine, 'utf8');
}

module.exports = { countTokens, logCost };