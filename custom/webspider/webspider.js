/**
 * Can spider a website and pump all its documents
 * into the bus.
 * 
 * (C) 2023 TekMonks. All rights reserved.
 * License: See the enclosed LICENSE file.
 */

const path = require("path");
const fspromises = require("fs").promises;
const crawler = require(`${__dirname}/crawl.js`);
const utils = require(`${CONSTANTS.LIBDIR}/utils.js`);
const spiderconf = require(`${__dirname}/conf/spider.json`);

DEFAULT_MINIMUM_SUCCESS_PERCENT = 0.5;
const DEFAULT_MIMES = {"text/html":{ending:".html"}, "application/pdf":{ending:".pdf"}};

exports.start = async function(routeName, webspider, messageContainer, message) {  // message is GC'ed right away which is ok
    let crawlingInstructions = message.content; // don't block the message or ESB, this will get GC'ed immediately which is OK
    if (!Array.isArray(crawlingInstructions)) crawlingInstructions = [crawlingInstructions];

    let allCrawlsResult = true;
    for (const crawlingInstructionsThis of crawlingInstructions) {
        const crawl_output_root = utils.expandProperty(crawlingInstructionsThis.crawl_output_root, webspider.flow, message);
        const crawl_subfolder = crawlingInstructionsThis.dont_crawl ? crawlingInstructionsThis.ingestion_folder : crawler.coredomain(crawlingInstructionsThis.url)+"."+Date.now();
        const requestedCrawlFolder = crawl_output_root + "/" + crawl_subfolder;
        const crawl_output_folder = path.resolve(requestedCrawlFolder);
        // first crawl to download all the files, this doesn't add anything to the CMS or AI DBs
        const crawlResult = crawlingInstructionsThis.dont_crawl ? true : await _crawlWebsite(crawlingInstructionsThis, crawl_output_folder);
        if (crawlingInstructionsThis.dont_ingest) continue;    // only testing crawling

        if (crawlResult) LOG.info(`[WEB_CRAWLER] Site crawl completed for ${crawlingInstructionsThis.url}, starting ingestion into the AI databases and stores.`);
        else {LOG.info(`[WEB_CRAWLER] Site crawl failed for ${crawlingInstructionsThis.url}, not ingesting into the AI databases and stores.`); allCrawlsResult = false; continue;}
        
        // now that the download succeeded, ingest into Neuranet databases
        const ingestResult = await _pumpCrawledFilesIntoESB(crawlingInstructionsThis, messageContainer, webspider, 
            routeName, crawl_output_folder);
        if (ingestResult) LOG.info(`[WEB_CRAWLER] Site AI database ingestion completed for ${crawlingInstructionsThis.url}.`);
        else {LOG.info(`[WEB_CRAWLER] Site AI database ingestion failed for ${crawlingInstructionsThis.url}`); allCrawlsResult = false;}
    }

    if (allCrawlsResult) LOG.info(`[WEB_CRAWLER] All crawls completed successfully.`);
    else LOG.error(`[WEB_CRAWLER] All crawls did not complete successfully, some failed.`)
}


async function _crawlWebsite(crawlingInstructionsThis, output_folder) {
    LOG.info(`[WEB_CRAWLER] Starting crawling the URL ${crawlingInstructionsThis.url} to path ${output_folder}.`);
    const crawlResult = await crawler.crawl(crawlingInstructionsThis.url, output_folder, 
        crawlingInstructionsThis.accepted_mimes||spiderconf.accepted_mimes||DEFAULT_MIMES, 
        crawlingInstructionsThis.timegap_between_requests||spiderconf.timegap_between_requests||50, 
        crawlingInstructionsThis.host_dispersal_depth||spiderconf.default_host_dispersal_depth||0,
        crawlingInstructionsThis.page_dispersal_depth||spiderconf.default_page_dispersal_depth||-1, 
        crawlingInstructionsThis.restrict_host, spiderconf.max_path||150);
    if (!crawlResult) LOG.error(`[WEB_CRAWLER] Site crawl of ${crawlingInstructionsThis.url} failed. Nothing was ingested from this site.`);
    else LOG.info(`[WEB_CRAWLER] Crawl of ${crawlingInstructionsThis.url} completed successfully.`);

    return crawlResult;
}

async function _pumpCrawledFilesIntoESB(crawlingInstructions, messageContainer, webspider, routeName, output_folder) {
    let finalResult = true; 
    const ingestionResult = await _processFolder(output_folder, 
        crawlingInstructions.cms_upload_folder||`${crawler.coredomain(crawlingInstructions.url)}_${Date.now()}`,
        messageContainer, routeName, webspider, crawlingInstructions);

    const percentSuccess = ingestionResult.result?ingestionResult.successfully_ingested.length/
        (ingestionResult.successfully_ingested.length+ingestionResult.failed_ingestion.length):0;
    const thisCrawlResult = ingestionResult.result && ingestionResult.successfully_ingested != 0 && percentSuccess > 
        (crawlingInstructions.minimum_success_percent||DEFAULT_MINIMUM_SUCCESS_PERCENT);
    if (!thisCrawlResult) {
        LOG.error(`[WEB_CRAWLER] Ingestion of ${crawlingInstructions.url} failed. Folder ingestion into AI databases failed, partial ingestion may have occured requiring database cleanup.`);
        finalResult = false;
    } else LOG.info(`[WEB_CRAWLER] Ingestion of ${crawlingInstructions.url} succeeded. Folder ingestion into AI databases completed.`);
    if (ingestionResult.result) LOG.debug(`[WEB_CRAWLER] List of successfully ingested files: ${ingestionResult.successfully_ingested.toString()}`);
    if (ingestionResult.result) LOG.debug(`[WEB_CRAWLER] List of failed to ingest files: ${ingestionResult.failed_ingestion.toString()}`);
    return finalResult;
}

async function _processFolder(pathIn, cmsPath, messageContainer, routeName, webspider, crawlingInstructions, memory) {
    try {
        if (!memory) memory = {roootpath: pathIn, successfully_ingested: [], failed_ingestion: []};
        const direntries = await fspromises.readdir(pathIn, {withFileTypes: true});
        for (const direntry of direntries) {
            const pathThisEntry = path.resolve(pathIn + "/" + direntry.name);
            const cmsPathThisEntry = cmsPath+"/"+path.relative(pathIn, pathThisEntry);

            if (direntry.isDirectory()) return await _processFolder(pathThisEntry, cmsPathThisEntry, 
                messageContainer, routeName, webspider, crawlingInstructions, memory); 
            else if (direntry.isFile()) {   // ignore anything which is neither a file nor a directory
                LOG.info(`[WEB_CRAWLER] Creating message for file ${pathThisEntry}`)
                let fileJSON; try {fileJSON = JSON.parse((await fspromises.readFile(pathThisEntry, "utf8")));}
                catch (err) {
                    memory.failed_ingestion.push(pathThisEntry); 
                    LOG.error(`[WEB_CRAWLER] Error processing file ${pathThisEntry} for CMS path ${cmsPathThisEntry} due to error: ${err}.`);
                    continue;
                }
                const message = MESSAGE_FACTORY.newMessage(); message.env.filepath = pathThisEntry;
                const base64Data = Buffer.from(fileJSON.text, fileJSON.is_binary?"base64":"utf8").toString("base64");
                message.content = {filename: path.basename(pathThisEntry), data: base64Data, id: webspider.id, 
                    org: webspider.org, encoding: "base64", aiappid: webspider.kwl_island, 
                    cmspath: path.dirname(cmsPathThisEntry), comment: `Crawl from ${crawlingInstructions.url}`,
                    metadata: {tag: crawlingInstructions.tag}};
                message.addRouteDone(routeName); messageContainer.add(message); 
                memory.successfully_ingested.push(pathThisEntry);
            }
        }
        return {result: true, successfully_ingested: memory?memory.successfully_ingested:undefined, 
            failed_ingestion: memory?memory.failed_ingestion:undefined};    // all done
    } catch (err) {
        LOG.error(`[WEB_CRAWLER] Error ingesting folder ${pathIn} for CMS path ${cmsPath} due to error: ${err}.`);
        return {result: false, successfully_ingested: memory?memory.successfully_ingested:undefined, 
            failed_ingestion: memory?memory.failed_ingestion:undefined}; 
    }
}
