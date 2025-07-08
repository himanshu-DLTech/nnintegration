require('dotenv').config(`/home/deep/asb/custom/agent/.env`);
const axios = require('axios');

const MODEL = process.env.AI_MODEL || "<your-ai-model>"; // your actual AI model, e.g., "gpt-3.5-turbo"
const X_API_KEY = process.env.X_API_Key || "<your-api-key>"; // your actual API key

async function callOpenAI(messages) {
    try {
        const response = await axios.post(
            'https://apiboss.org:9090/tekmonks.com/v1/chat/completions/rakuten',
            {
                model: MODEL,
                messages: messages,

                temperature: 0.7,
            },
            {
                headers: {
                    'Content-Type': 'application/json',
                    'X-API-KEY': X_API_KEY
                }
            }
        );
        return response.data.choices[0].message.content;
    }
    catch (e) { console.log(e) }
}

async function callApi(messages) {
    const result = await callOpenAI(messages);
    return result;
}

module.exports = { callApi }