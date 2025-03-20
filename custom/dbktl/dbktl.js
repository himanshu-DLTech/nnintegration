/**
 * Can KTL a DB into knowledge.
 * 
 * (C) 2023 TekMonks. All rights reserved.
 * License: See the enclosed LICENSE file.
 */
const mustache = require("mustache"); 
const db = require(`${__dirname}/db.js`);
const utils = require(`${CONSTANTS.LIBDIR}/utils.js`);

exports.start = async function(routeName, dbktl, messageContainer, _message) {  // message is GC'ed right away which is ok
    const dbDriver = db.getDBDriver("sqlite", dbktl.db_connection_info); dbDriver.init();
    if (!dbktl.flow.env[routeName]) dbktl.flow.env[routeName] = {};
    if (!dbktl.flow.env[routeName].timestamp) dbktl.flow.env[routeName].timestamp = dbktl.initial_timestamp;
    const dbQueryParamsStr = JSON.stringify(dbktl.query.params), 
        dbQueryParamsExpanded = utils.expandProperty(dbQueryParamsStr, dbktl.flow, {timestamp: dbktl.flow.env[routeName].timestamp}),
        dbQueryParams = JSON.parse(dbQueryParamsExpanded);
    const dataRows = await dbDriver.getQuery(dbktl.query.cmd, dbQueryParams);
    if (dataRows) for (const dataRow of dataRows) {
        _pumpESBMessage(dataRow, routeName, dbktl, messageContainer);
        if (dataRow[dbktl.timestamp_column] > dbktl.flow.env[routeName].timestamp) 
            dbktl.flow.env[routeName].timestamp = dataRow[dbktl.timestamp_column];
    } else LOG.info(`[DBKTL] No data was fetched for query ${dbktl.query} in this run`);
}

function _pumpESBMessage(data, routeName, dbktl, messageContainer) {
    const filename = `${dbktl.table}.${data[dbktl.timestamp_column]}.txt`, 
        uploadPath = dbktl.database_id, templates = dbktl.ktl_templates;

    for (const template of templates) {
        const jsTimestamp = parseInt(data[dbktl.timestamp_column]), dateObj = new Date(jsTimestamp * 1000),
            date = dateObj.getDate(), month = dateObj.getMonth()+1, year = dateObj.getFullYear(), hour = dateObj.getHours(), 
            minute = dateObj.getMinutes(), seconds = dateObj.getSeconds();
        const knowledge = mustache.render(template, {...data, date, month, year, hour, minute, seconds});
        const message = MESSAGE_FACTORY.newMessage(); 
        const base64Data = Buffer.from(knowledge, "utf8").toString("base64");
        message.content = {filename, data: base64Data, id: dbktl.id, 
            org: dbktl.org, encoding: "base64", aiappid: dbktl.kwl_island, 
            cmspath: uploadPath, comment: `DB KTL from ${dbktl.database_id}.${dbktl.table}`, 
            metadata: {...dbktl.metadata}};
        message.addRouteDone(routeName); messageContainer.add(message); 
        LOG.info(`Pushed new message for knowledge from ${dbktl.database_id}.${dbktl.table} for timeststamp ${data[dbktl.timestamp_column]}`);
    }
}