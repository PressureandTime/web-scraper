const HikingEventScraper = require('./scraper');
const config = require('./config.json');

const scraper = new HikingEventScraper(config);
scraper.run()
    .catch(error => console.error('Failed to run scraper:', error));
