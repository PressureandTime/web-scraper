const puppeteer = require('puppeteer');
const fs = require('fs').promises;
const path = require('path');
const Logger = require('./logger');

class HikingEventScraper {
  constructor(config) {
    this.config = config;
    this.dataDir = path.join(__dirname, 'data');
    this.logger = new Logger();
  }

  async init() {
    try {
      await this.logger.init();
      await fs.mkdir(this.dataDir, { recursive: true });
      await this.logger.info('Initializing browser...');
      this.browser = await puppeteer.launch({
        headless: false,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
        defaultViewport: {
          width: 1920,
          height: 1080,
        },
      });
    } catch (error) {
      await this.logger.error('Failed to initialize scraper:', error);
      throw error;
    }
  }

  async close() {
    if (this.browser) {
      await this.logger.info('Closing browser...');
      await this.browser.close();
      await this.logger.info('Browser closed successfully');
    }
  }

  async parseDate(dateStr) {
    try {
      const cleanDate = dateStr.trim().replace(/\.$/, '');
      const parts = cleanDate.split('.');
      const day = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10);
      const year = parseInt(parts[2], 10);

      if (isNaN(day) || isNaN(month) || isNaN(year)) {
        await this.logger.error(`Invalid date parts: ${dateStr}`, { parts });
        return null;
      }

      return new Date(year, month - 1, day);
    } catch (error) {
      await this.logger.error(`Error parsing date: ${dateStr}`, error);
      return null;
    }
  }

  async isUpcomingEvent(dateStr) {
    const eventDate = await this.parseDate(dateStr);
    if (!eventDate) return false;

    const currentDate = new Date();

    const eventDateOnly = new Date(
      eventDate.getFullYear(),
      eventDate.getMonth(),
      eventDate.getDate()
    );
    const currentDateOnly = new Date(
      currentDate.getFullYear(),
      currentDate.getMonth(),
      currentDate.getDate()
    );

    return eventDateOnly >= currentDateOnly;
  }

  async scrapeEvents(website) {
    const page = await this.browser.newPage();
    try {
      await page.setViewport({ width: 1920, height: 1080 });
      await page.setUserAgent(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      );

      await this.logger.info(`Navigating to ${website.url}`);
      await page.goto(website.url, {
        waitUntil: ['networkidle0', 'domcontentloaded'],
        timeout: 30000,
      });

      // Wait for content to load
      await page.waitForSelector('body', { timeout: 30000 });

      // Get all text content for debugging
      const pageText = await page.evaluate(() => document.body.textContent);
      await this.logger.info(
        `Initial page content (first 500 chars): ${pageText.substring(0, 500)}`
      );
      await this.logger.info(`Total page content length: ${pageText.length} characters`);

      const events = await page.evaluate(() => {
        const events = [];
        const dateRegex = /\d{1,2}\.\d{1,2}\.\d{4}/;
        const seenContent = new Set();

        // Function to clean text
        const cleanText = (text) => {
          return text
            .replace(/\s+/g, ' ')
            .replace(/^\s+|\s+$/g, '')
            .replace(/\s*\n\s*/g, '\n')
            .replace(/\s+\./g, '.')
            .replace(/\s+,/g, ',');
        };

        // Find all text nodes containing dates
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null, false);

        let node;
        while ((node = walker.nextNode())) {
          const text = cleanText(node.textContent);
          if (dateRegex.test(text)) {
            // Find the parent element that contains the full event information
            let container = node.parentElement;
            while (container && container.textContent.length < 100) {
              container = container.parentElement;
            }

            if (container) {
              const fullText = cleanText(container.textContent);

              // Skip if we've seen this content before
              if (seenContent.has(fullText)) {
                continue;
              }
              seenContent.add(fullText);

              // Extract date
              const dateMatch = fullText.match(dateRegex);
              if (!dateMatch) continue;
              const date = dateMatch[0];

              // Extract title - look for text before the date or strong elements
              let title = '';
              const strongElements = container.querySelectorAll('strong');
              if (strongElements.length > 0) {
                title = cleanText(strongElements[0].textContent);
              } else {
                const parts = fullText.split(date);
                if (parts[0]) {
                  title = cleanText(parts[0]);
                }
              }

              // Extract description - everything after the date
              let description = fullText;
              if (title) {
                description = description.replace(title, '');
              }
              description = description.replace(date, '').trim();

              // Extract link if available
              const link = container.querySelector('a')?.href || '';

              if ((title || description) && date) {
                events.push({
                  title: title || 'No title',
                  date,
                  link,
                  description: description || '',
                });
              }
            }
          }
        }

        return events;
      });

      // Log events found
      await this.logger.info(`Found ${events.length} events on the page`);

      await this.logger.info(`Found ${events.length} total events`);
      if (events.length > 0) {
        const dates = events.map((e) => e.date);
        await this.logger.info(`Event date range: ${Math.min(...dates)} to ${Math.max(...dates)}`);
      }

      const upcomingEvents = [];
      for (const event of events) {
        const isUpcoming = await this.isUpcomingEvent(event.date);
        if (!isUpcoming) {
          await this.logger.info(`Filtering out past event: ${event.title} (${event.date})`);
        } else {
          await this.logger.info(`Found upcoming event: ${event.title} (${event.date})`);
          upcomingEvents.push(event);
        }
      }

      await this.logger.info(`${upcomingEvents.length} upcoming events found`);
      if (upcomingEvents.length > 0) {
        await this.logger.info(
          `Upcoming events: ${JSON.stringify(
            upcomingEvents.map((e) => ({
              title: e.title,
              date: e.date,
              link: e.link,
            })),
            null,
            2
          )}`
        );
      }
      return upcomingEvents;
    } catch (error) {
      console.error(`Error scraping ${website.url}:`, error);
      return [];
    } finally {
      await page.close();
    }
  }

  async saveEvents(events, sourceName) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const fileName = `${sourceName}_${timestamp}.json`;
    const filePath = path.join(this.dataDir, fileName);

    await fs.writeFile(filePath, JSON.stringify(events, null, 2));
    console.log(`Saved ${events.length} events to ${fileName}`);
    console.log(`Events saved to: ${filePath}`);
  }

  async run() {
    try {
      await this.init();
      await this.logger.info('Starting scraper with test log message');
      await this.logger.warn('This is a test warning message');
      await this.logger.error('This is a test error message');

      if (!this.config.websites || this.config.websites.length === 0) {
        await this.logger.error('No websites configured for scraping');
        throw new Error('No websites configured for scraping');
      }

      for (const website of this.config.websites) {
        try {
          new URL(website.url);
        } catch (e) {
          await this.logger.error(`Invalid URL provided: ${website.url}`);
          throw new Error(`Invalid URL provided: ${website.url}`);
        }

        await this.logger.info(`Scraping events from ${website.url}`);
        const events = await this.scrapeEvents(website);

        if (events.length > 0) {
          const sourceName = new URL(website.url).hostname.replace(/[^a-z0-9]/gi, '_');
          await this.saveEvents(events, sourceName);
        } else {
          await this.logger.info('No events found');
        }
      }
    } catch (error) {
      await this.logger.error(`Scraper error: ${error.message}`, error);
      throw error;
    } finally {
      await this.close();
    }
  }
}

module.exports = HikingEventScraper;
