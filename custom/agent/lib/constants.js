const path = require("path");
exports.AGENT_DIR = path.resolve(`${__dirname}/../`);

exports.OPENAI_API_URL ='https://localhost:9090/apps/neuranet/llmflow';

exports.LIB_DIR = `${this.AGENT_DIR}/lib`;
exports.LOG_DIR = `${this.AGENT_DIR}/log`;
exports.CMD_DIR = `${this.AGENT_DIR}/commands`;
exports.UTILS_DIR = `${this.AGENT_DIR}/utils`;
exports.OUTPUT_DIR = `${this.AGENT_DIR}/documentationOutputDirectory`;
exports.JAVA_HELP_DIR = `${this.AGENT_DIR}/javaHelper`;
exports.CLONED_REPOS_DIR = `${this.AGENT_DIR}/clonedRepos`;

exports.JAVA_UTILS_DIR = `${this.JAVA_HELP_DIR}/javaUtils`;
