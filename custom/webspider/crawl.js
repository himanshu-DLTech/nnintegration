/**
 * HTTP crawler. Uses Nodejs Fetch API. Needs
 * NodeJS v18 or higher. Needs NPM htmlparser2.
 * 
 * (C) 2023 TekMonks. All rights reserved.
 * License: See the enclosed LICENSE file.
 */

if (!global.LOG) {  // run independently
    global.LOG = console; 
    global.CONSTANTS = require(`${process.cwd()}/../../../../../server/lib/constants.js`);
}

const path = require("path");
const stream = require("stream");
const crypto = require("crypto");
const fspromises = require("fs").promises;
const htmlparser2 = require("htmlparser2");
const queueExecutor = require(`${__dirname}/queueexecutor.js`);
const httpClient = require(`${CONSTANTS.LIBDIR}/httpclient.js`);

const DEFAULT_MIMES = {"text/html":{ending:".html"}, "application/pdf":{ending:".pdf"}};
const foldersCreated = [], RANDOMNESS_FACTOR_FOR_REQUESTS = 0.25;

// TLD download URL is curl https://github.com/publicsuffix/list/blob/master/public_suffix_list.dat > public_suffix_list.github.json
let tlds = require(`${__dirname}/conf/public_suffix_list.github.json`).payload.blob.rawLines, initialized = false;
let crawledSites = [];

function _coreDomain(url) {
    let urlObject; try {urlObject = new URL(url)} catch (err) {LOG.error(`Can't parse URL ${url}. Error is ${err}.`); throw err;}
    const host = urlObject.hostname, hostSplits = host.split(".");
    let splitPoint = 0; for (let i = 1; i < hostSplits.length; i++) {   // finds the longest matching TLD and removes it
        const tldCheck = hostSplits.slice(i).join(".");
        if (tlds.includes(tldCheck)) {splitPoint = i; break;}
    }

    // core domain is the first host after the TLD removal
    const coreDomain = hostSplits[splitPoint-1]; LOG.debug(`Returning core domain for ${url} as ${coreDomain}.`);
    return coreDomain;
}

function _getDispersalDept(currentDepth, requestedURL, initialURL) {
    const dispersalDepth = _coreDomain(requestedURL) != _coreDomain(initialURL) ? currentDepth+1 : currentDepth;
    return dispersalDepth;
}

const _getPromiseToResolve = _ => {let resolveFunction; const promiseRet = new Promise(resolve => resolveFunction = resolve); promiseRet.__resolveFunction = resolveFunction; return promiseRet;}

const _createFolderIfNeeded = async folder => {
    const folderRequested = path.resolve(folder);
    if (!foldersCreated.includes(folderRequested)) {
        try {await fspromises.mkdir(folderRequested, {recursive: true});} catch (err) {
            if (err.code != 'EEXIST') throw err;    // ignore exists errors
        }
        foldersCreated.push(folderRequested);
    }
}

const _convertURLToFSSafePath = (url, mime, mimes, maxPathLength) => {      
    const urlParsed = new URL(url), hostAndPath = urlParsed.hostname + urlParsed.pathname,
        tentativeFilepath = encodeURIComponent(hostAndPath), mimeNormalized = mime.split(",")[0].split(";")[0],
        expectedEnding = mimes[mimeNormalized].ending;
    if (!expectedEnding) return crypto.createHash("md5").update(url).digest("hex"); // unknown mime - we can't do much
    let finalPath = tentativeFilepath; 
    if (finalPath.endsWith(".")) finalPath = finalPath.substring(0,finalPath.length-1)+"%2E";
    if (!finalPath.toLowerCase().endsWith(expectedEnding)) finalPath = finalPath+"%2Findex"+expectedEnding;
    
    if (finalPath.length > maxPathLength) {
        finalPath = finalPath + "."+ Date.now() + expectedEnding;
        finalPath = finalPath.substring(finalPath.length-maxPathLength);
    }
    
    return finalPath;
}

const _isTextMime = headers => headers["content-type"] ? 
    headers["content-type"].trim().split("/")[0].toLowerCase() == "text" : false;

function init() {
    tlds = tlds.filter(value => (value.trim() != "") && (!value.trim().startsWith("//")));   // remove comments and empty tlds
    initialized = true;
}

async function crawl(url, output_folder_streamer_function, accepted_mimes=DEFAULT_MIMES, 
        timegap_between_requests=0, max_host_dispersal_depth=0, max_page_dispersal_depth=-1, 
        restrict_to_hostname, max_path_for_files=150, cookies = [], memory={urls: {}, initial_url: url, crawls_waiting: 1, 
        promiseToResolve: _getPromiseToResolve()}, current_host_dispersal_depth=0, 
        current_page_dispersal_depth=0) {

    try {
        if(!crawledSites.includes(url)) {
            if (!initialized) init(); const urlObject = new URL(url);

            if (restrict_to_hostname && (!urlObject.hostname.endsWith(restrict_to_hostname))) {
                LOG.info(`Requested crawl URL ${url} hostname doesn't match restricted hostname. Not crawling.`)
                return false; 
            }
            if (max_page_dispersal_depth != -1 && current_page_dispersal_depth > max_page_dispersal_depth) {
                LOG.info(`Requested crawl URL ${url} exceeds maximum page dispersal depth of ${max_page_dispersal_depth} as its dispersal depth is ${current_page_dispersal_depth}. Not crawling.`)
                return false; 
            }
            const requestedDispersalDepth = _getDispersalDept(current_host_dispersal_depth, url, memory.initial_url);
            if (max_host_dispersal_depth != -1 && requestedDispersalDepth > max_host_dispersal_depth) {
                LOG.info(`Requested crawl URL ${url} exceeds maximum dispersal depth of ${max_host_dispersal_depth} as its dispersal depth is ${requestedDispersalDepth}. Not crawling.`)
                return false; 
            } else LOG.info(`Requested crawl URL ${url} dispersal depth is ${requestedDispersalDepth}, maximum is ${max_host_dispersal_depth}. Crawling.`)

            const cookieHeader = cookies.map(c => `${c.name}=${c.value}`).join("; ");

            const response = await httpClient.fetch(url, {undici: false, headers: {"accept": Object.keys(accepted_mimes).join(","), "cookie": cookieHeader}, enforce_mime: true, ssl_options: { _org_monkshu_httpclient_forceHTTP1: true, rejectUnauthorized: false }});    
            crawledSites.push(url); 
            if (!response.ok) { 
                LOG.error(`Crawler error URL: ${url}. Error is fetch error. Response code is: ${response.status}.`); 
                return false;
            }
            const outputText = _isTextMime(response.headers) ? await response.text() : (await response.buffer()).toString("base64"), 
                dom = _isTextMime(response.headers)?htmlparser2.parseDocument(outputText):"", 
                mime = response.headers["content-type"], aElements = 
                htmlparser2.DomUtils.getElementsByTagName("a", dom), outputObject = {url, mime, is_binary: !_isTextMime(response.headers)};

            if (output_folder_streamer_function && typeof output_folder_streamer_function == "string") await saveCrawl(output_folder_streamer_function, outputObject, url, mime, accepted_mimes, max_path_for_files, outputText);  // async block with no wait - run the steps to save in the right order but overall don't wait for writing to finish
            if (output_folder_streamer_function && typeof output_folder_streamer_function == "function") 
                output_folder_streamer_function({...outputObject, stream: stream.Readable.from([Buffer.from(outputText, "utf-8")])});

            const links = []; memory.urls[urlObject.href] = true;
            for (const aElement of aElements) {
                const link = aElement.attribs.href, absoluteUrl = link?new URL(link, url).href:undefined;

                if ((!absoluteUrl) || (!absoluteUrl.trim().toLowerCase().startsWith("http")) || 
                    absoluteUrl.trim().startsWith('#') || memory.urls[absoluteUrl]) continue;

                links.push(absoluteUrl); memory.urls[absoluteUrl] = true;
            }
            
            LOG.info(`Crawled URL: ${url}, new links found: ${links.length?links.join("\n"):"none"}.\n\n`);
            
            // Now crawl each link recursively and clear function stack to preserve memory (setImmediate does that)
            for (const link of links) if (current_page_dispersal_depth+1 <= max_page_dispersal_depth) {
                memory.crawls_waiting++; 
                queueExecutor.add(_=>crawl(link, output_folder_streamer_function, accepted_mimes, timegap_between_requests, 
                    max_host_dispersal_depth, max_page_dispersal_depth, restrict_to_hostname, 
                    max_path_for_files, cookies, memory, requestedDispersalDepth, 
                    current_page_dispersal_depth+1), [], false, timegap_between_requests*(1+(RANDOMNESS_FACTOR_FOR_REQUESTS*Math.random())));
            }
            return memory.promiseToResolve; 
        }
    } catch (error) { LOG.error(`Crawler error URL: ${url}. Error is: ${error.message||error}. Cause is ${error.cause||"unknown"}. Stack is ${error.stack}.`); return false; }
    finally {
        memory.crawls_waiting--; LOG.info(`Crawler initial URL: ${memory.initial_url}, crawls waiting: ${memory.crawls_waiting}`);
        if (memory.crawls_waiting == 0) memory.promiseToResolve.__resolveFunction(true);
    }
}

async function saveCrawl (output_folder_streamer_function, outputObject, url, mime, accepted_mimes, max_path_for_files, outputText){
    const outfolder = path.resolve(`${output_folder_streamer_function}/${_coreDomain(url)}`), 
        outpath = path.resolve(`${outfolder}/${_convertURLToFSSafePath(url, mime, accepted_mimes, max_path_for_files)}`);
    LOG.debug(`Serializing the URL ${url} to a file at path ${outpath}.`);
    try{ 
        await _createFolderIfNeeded(outfolder, {recursive: true}); const outObject = {...outputObject}; outObject.text = outputText;
        await fspromises.writeFile(outpath, JSON.stringify(outObject), "utf8");
    } catch (err) { LOG.error(`Unable to save the crawled file for URL ${url}. Error is ${err}.`); }
}

module.exports = {crawl, init, coredomain: _coreDomain};

if (require.main === module) {
    const args = process.argv.slice(2);

    if (args.length < 1) {
        console.log("Usage: crawl.js <crawl file>");
        process.exit(1);
    } else {
        let done = false;
        (async _=>{
            const crawlFile = JSON.parse(await fspromises.readFile(args[0], "utf8"));
            const result = await crawl(crawlFile.url, crawlFile.outfolder, crawlFile.accepted_mimes, 
                crawlFile.timegap||100, crawlFile.host_dispersal_depth, crawlFile.page_dispersal_depth, 
                crawlFile.restrict_host);
            if (result) console.log(`Crawl ended.`); else console.error(`Crawl ended with errors.`);
            done = true;
        })();
        const exitWhenDone = _ => {if (done) process.exit(0);}
        setInterval(exitWhenDone, 1000);
    }
}