const { systemPrompt } = require('./lib/prompt');

// messageStore.js
const messageStore = {
    messages: [
        { role: 'system', content: systemPrompt }
    ],

    addUser(content) {
        this.messages.push({ role: 'user', content });
    },

    addAssistant(content) {
        this.messages.push({ role: 'assistant', content });
    },

    getMessages() {
        return this.messages;
    },
    resetMessages() {
        this.messages = [
            { role: 'system', content: systemPrompt }
        ];
    }

};

module.exports = messageStore;
