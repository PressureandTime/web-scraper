const puppeteer = require('puppeteer');
const fs = require('fs').promises;
const path = require('path');

class HikingEventScraper {
  constructor(config) {
    this.config = config;
    this.dataDir = path.join(__dirname, 'data');
  }

  async init() {
    await fs.mkdir(this.dataDir, { recursive: true });
    this.browser = await puppeteer.launch({
      headless: false,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
      defaultViewport: {
        width: 1920,
        height: 1080,
      },
    });
  }

  async close() {
    if (this.browser) {
      await this.browser.close();
    }
  }

  parseDate(dateStr) {
    try {
      const cleanDate = dateStr.trim().replace(/\.$/, '');
      const parts = cleanDate.split('.');
      const day = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10);
      const year = parseInt(parts[2], 10);

      if (isNaN(day) || isNaN(month) || isNaN(year)) {
        console.error('Invalid date parts:', dateStr, parts);
        return null;
      }

      return new Date(year, month - 1, day);
    } catch (error) {
      console.error('Error parsing date:', dateStr, error);
      return null;
    }
  }

  isUpcomingEvent(dateStr) {
    const eventDate = this.parseDate(dateStr);
    if (!eventDate) return false;

    const currentDate = new Date('2025-01-11T11:53:22+01:00');

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

      console.log(`Navigating to ${website.url}`);
      await page.goto(website.url, {
        waitUntil: ['networkidle0', 'domcontentloaded'],
        timeout: 30000,
      });

      // Wait for content to load
      await page.waitForSelector('body', { timeout: 30000 });

      // Get all text content for debugging
      const pageText = await page.evaluate(() => document.body.textContent);
      console.log('Initial page content:', pageText.substring(0, 500));

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
                console.log(`Found event: ${title} (${date})`);
              }
            }
          }
        }

        return events;
      });

      console.log(`Found ${events.length} total events`);

      const upcomingEvents = events.filter((event) => {
        const isUpcoming = this.isUpcomingEvent(event.date);
        if (!isUpcoming) {
          console.log(`Filtering out past event: ${event.title} (${event.date})`);
        } else {
          console.log(`Found upcoming event: ${event.title} (${event.date})`);
        }
        return isUpcoming;
      });

      console.log(`${upcomingEvents.length} upcoming events found`);
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

      if (!this.config.websites || this.config.websites.length === 0) {
        throw new Error('No websites configured for scraping');
      }

      for (const website of this.config.websites) {
        try {
          new URL(website.url);
        } catch (e) {
          throw new Error(`Invalid URL provided: ${website.url}`);
        }

        console.log(`Scraping events from ${website.url}`);
        const events = await this.scrapeEvents(website);

        if (events.length > 0) {
          const sourceName = new URL(website.url).hostname.replace(/[^a-z0-9]/gi, '_');
          await this.saveEvents(events, sourceName);
        } else {
          console.log('No events found');
        }
      }
    } catch (error) {
      console.error('Scraper error:', error);
      throw error;
    } finally {
      await this.close();
    }
  }
}

module.exports = HikingEventScraper;
