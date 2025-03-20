/**
 * Can KTL a DB into knowledge.
 * 
 * (C) 2023 TekMonks. All rights reserved.
 * License: See the enclosed LICENSE file.
 */

const path = require("path");

const DEFAULT_UPLOAD_PATH = "uploads";

exports.start = async function(routeName, messagektl, messageContainer, message) {  // message is GC'ed right away which is ok
    const knowledge = messagektl.template?mustache.render(messagektl.template, message.content):message.content;
    const messageOut = MESSAGE_FACTORY.newMessage(), filepathSplits = message.env.filepath.split("."),
        filename = path.basename(filepathSplits.slice(0, filepathSplits.length-1).join("."));
    const metadata = {}; let override_island; for (const fileSplit of filepathSplits) {
        if (fileSplit.startsWith("tag_")) metadata.tag = fileSplit.substring("tag_".length);
        if (fileSplit.startsWith("island_")) override_island = fileSplit.substring("island_".length);
    }
    const base64Data = Buffer.from(knowledge, messagektl.encoding).toString("base64");
    messageOut.content = {filename, data: base64Data, id: messagektl.id, 
        org: messagektl.org, encoding: "base64", aiappid: override_island||messagektl.kwl_island, 
        cmspath: messagektl.uploadPath||DEFAULT_UPLOAD_PATH, comment: `File KTL from ${filename}`, metadata};
    messageOut.addRouteDone(routeName); messageContainer.add(messageOut); 
    LOG.info(`Pushed new message for knowledge from ${message.env.filepath}`);
}
