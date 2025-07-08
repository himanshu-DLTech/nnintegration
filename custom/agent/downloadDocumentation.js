const fs = require('fs');
const path = require('path');
const AGENT_CONSTANTS = require('./lib/constants');

const { getDocumentationDir } = require(`${AGENT_CONSTANTS.AGENT_DIR}/startDocumentation.js`);

exports.start = async (routeName, _, __, message) => {
    let requestedRepoID = message.env.http_listener.req.url.split('=')[1];
    let documentationZipFilePath = `${getDocumentationDir(requestedRepoID)}.zip`;

    const res = message.env.http_listener.res;
    if (fs.existsSync(documentationZipFilePath)) {
        res.setHeader('Content-Disposition', `attachment; filename=${path.basename(documentationZipFilePath)}`);
        res.setHeader('Content-Type', 'application/octet-stream');

        const documentStream = fs.createReadStream(documentationZipFilePath);
        documentStream.pipe(res);
    }
    else {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Invailid Repo Id or Documentation not found.');
    }

    message.addRouteDone(routeName);
    message.setGCEligible(true);
}