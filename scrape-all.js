const HikingEventScraper = require('./scraper');
const config = require('./config.json');
const path = require('path');

async function scrapeAllWebsites() {
  try {
    console.log(
      'Starting scraper with config:',
      JSON.stringify(config.websites.length) + ' websites configured'
    );

    // Create a scraper instance with the full config
    const scraper = new HikingEventScraper(config);

    console.log('Initializing scraper...');
    await scraper.init();
    console.log('Scraper initialized successfully');

    console.log('Starting to scrape all configured websites...');
    for (const website of config.websites) {
      try {
        console.log(`\nScraping ${website.url}...`);
        const events = await scraper.scrapeEvents(website);

        // Save events if any were found
        if (events.length > 0) {
          const sourceName = new URL(website.url).hostname.replace(/[^a-z0-9]/gi, '_');
          await scraper.saveEvents(events, sourceName);
        }

        console.log(`✓ Successfully scraped ${website.url}`);
      } catch (error) {
        console.error(`× Error scraping ${website.url}:`, error.message);
        // Continue with next website even if one fails
      }
    }

    console.log('\nAll websites processed. Closing browser...');
    await scraper.close();
    console.log('Done!');
  } catch (error) {
    console.error('Fatal error:', error);
    process.exit(1);
  }
}

// Run the scraper
scrapeAllWebsites();
