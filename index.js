const HikingEventScraper = require('./scraper');
const config = require('./config.json');

const url = process.argv[2];
if (!url) {
  console.error('Please provide a URL to scrape');
  process.exit(1);
}

// Create a new config with only the provided URL
const singleUrlConfig = {
  websites: [
    {
      url: url,
      selectors:
        config.websites.find((w) => w.url === url)?.selectors || config.websites[0].selectors,
    },
  ],
};

const scraper = new HikingEventScraper(singleUrlConfig);
scraper.run().catch((error) => console.error('Failed to run scraper:', error));
