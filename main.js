/**
 * HomeoIntelligence Engine - Main Orchestrator
 * Coordinates between the Node.js Browser Agent and Python Intelligence Layer.
 * 
 * Usage:
 *   Single URL:      node main.js <url>
 *   Batch crawl:     node main.js --crawl <config> [max-pages]
 *   Process only:    node main.js --process-all
 *   Fast process:    node main.js --process-all --fast  (rule-based, no Ollama)
 */


const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const PYTHON_PATH = process.platform === 'win32' ? 'venv\\Scripts\\python' : 'venv/bin/python3';
const RAW_DIR = path.join(__dirname, 'data/raw');
const PROCESSED_DIR = path.join(__dirname, 'data/processed');

/**
 * Run the full pipeline on a single URL: scrape → extract → save.
 */
async function runPipeline(url) {
    console.log(`\n🚀 Starting AI Scraping Pipeline for: ${url}\n`);

    try {
        // Step 1: Browser Extraction (Node.js)
        console.log('━━━ STEP 1: Browser Extraction ━━━');
        execSync(`node scraper-node/browser_agent.js "${url}"`, { stdio: 'inherit', cwd: __dirname });

        // Identify the latest raw file
        const files = fs.readdirSync(RAW_DIR)
            .filter(f => f.startsWith('raw_') && f.endsWith('.json'))
            .sort()
            .reverse();

        if (files.length === 0) throw new Error('No raw data files found after scraping.');
        const latestRawFile = path.join(RAW_DIR, files[0]);

        // Step 2: AI Intelligence Structuring (Python)
        console.log('\n━━━ STEP 2: AI Intelligence Structuring ━━━');
        execSync(`${PYTHON_PATH} engine-python/intelligence_layer.py "${latestRawFile}"`, {
            stdio: 'inherit',
            cwd: __dirname,
        });

        console.log('\n✅ Pipeline Complete! Check data/processed/ for results.');

    } catch (error) {
        console.error('\n❌ Pipeline Failed:', error.message);
        process.exit(1);
    }
}

async function processAllRawFiles(fastMode = false) {
    const modeLabel = fastMode ? '⚡ FAST (rule-based)' : '🧠 AI (Ollama)';
    console.log(`\n🔄 Processing all unprocessed raw files [${modeLabel}]...\n`);

    const rawFiles = fs.readdirSync(RAW_DIR).filter(f => f.startsWith('raw_') && f.endsWith('.json'));
    const processedFiles = new Set(
        fs.existsSync(PROCESSED_DIR) 
        ? fs.readdirSync(PROCESSED_DIR).filter(f => f.endsWith('.json')).map(f => f.replace('processed_', 'raw_'))
        : []
    );

    const unprocessed = rawFiles.filter(f => !processedFiles.has(f));
    console.log(`Found ${rawFiles.length} raw files, ${unprocessed.length} unprocessed.\n`);

    if (unprocessed.length === 0) {
        console.log('✅ All files already processed.');
        return;
    }

    const { exec } = require('child_process');
    const util = require('util');
    const execAsync = util.promisify(exec);

    const env = { ...process.env };
    if (fastMode) {
        delete env.OLLAMA_BASE_URL;
        delete env.OPENAI_API_KEY;
        console.log('  [Fast mode] Ollama disabled — using rule-based extraction only\n');
    }

    // Set concurrency (e.g. 10 parallel Python processes for fast mode, 2 for Ollama)
    const CONCURRENCY = fastMode ? 12 : 2;
    let completed = 0;
    let errors = 0;

    console.log(`🚀 Starting extraction with ${CONCURRENCY} concurrent workers...`);

    const chunks = [];
    for (let i = 0; i < unprocessed.length; i += CONCURRENCY) {
        chunks.push(unprocessed.slice(i, i + CONCURRENCY));
    }

    for (const chunk of chunks) {
        const promises = chunk.map(async (file) => {
            const filePath = path.join(RAW_DIR, file);
            try {
                const fastArg = fastMode ? ' --fast' : '';
                await execAsync(`${PYTHON_PATH} engine-python/intelligence_layer.py "${filePath}"${fastArg}`, { cwd: __dirname, env });
                completed++;
            } catch (err) {
                if (!fastMode) console.error(`\n❌ Failed to process ${file}: ${err.message.split('\\n')[0]}`);
                errors++;
            }
        });
        
        await Promise.all(promises);
        process.stdout.write(`\r  Processed: ${completed}/${unprocessed.length} files (Errors: ${errors})`);
    }

    console.log(`\n\n✅ Batch processing complete! ${completed} files processed successfully.`);
}

/**
 * Run the site crawler and then process all results.
 */
function runCrawl(configName, maxPages) {
    console.log(`\n🕷️  Starting crawl + process pipeline for: ${configName}\n`);

    try {
        const limitArg = maxPages ? ` ${maxPages}` : '';
        execSync(`node scraper-node/crawler.js ${configName}${limitArg}`, {
            stdio: 'inherit',
            cwd: __dirname,
        });

        console.log('\n--- Now processing all scraped data ---\n');
        processAllRawFiles();

    } catch (error) {
        console.error('\n❌ Crawl Failed:', error.message);
        process.exit(1);
    }
}


// ─── CLI Entry Point ────────────────────────────────────────────────────────

const args = process.argv.slice(2);

if (args.length === 0) {
    console.log('HomeoIntelligence Engine 🧠');
    console.log('');
    console.log('Usage:');
    console.log('  node main.js <url>                        Scrape & process a single URL');
    console.log('  node main.js --crawl <config> [max]       Crawl a site & process all pages');
    console.log('  node main.js --process-all                Process with Ollama AI');
    console.log('  node main.js --process-all --fast         Process with rule-based (instant)');
    console.log('  node main.js --full-crawl [max] [delay]   Full Boericke crawl + fast process');
    console.log('');
    console.log('Crawl configs: vithoulkas, boericke, clarke');
    process.exit(0);
}

if (args[0] === '--crawl') {
    runCrawl(args[1], args[2] ? parseInt(args[2]) : null);
} else if (args[0] === '--process-all') {
    const fast = args.includes('--fast');
    processAllRawFiles(fast);
} else if (args[0] === '--full-crawl') {
    const maxPerLetter = args[1] ? parseInt(args[1]) : 999;
    const delay = args[2] ? parseInt(args[2]) : 4000;
    try {
        const { execFileSync } = require('child_process');
        execSync(`node scraper-node/full_crawl.js ${maxPerLetter} ${delay}`, {
            stdio: 'inherit', cwd: __dirname
        });
    } catch(e) { process.exit(1); }
} else {
    runPipeline(args[0]);
}
