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
      headless: false, // Use headed mode for debugging
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
      // Handle Croatian date format (e.g., "11.01.2025." or "11.1.2025")
      const cleanDate = dateStr.trim().replace(/\.$/, ''); // Remove trailing dot
      const parts = cleanDate.split('.');
      const day = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10);
      const year = parseInt(parts[2], 10);

      console.log(`Parsing date: ${dateStr} -> day: ${day}, month: ${month}, year: ${year}`);

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

    const currentDate = new Date('2025-01-11T11:53:22+01:00'); // Use current time

    // Get dates without time for comparison
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

    console.log(
      `Comparing dates: Event(${eventDateOnly.toISOString()}) >= Current(${currentDateOnly.toISOString()})`
    );

    // Include events from today
    return eventDateOnly >= currentDateOnly;
  }

  async scrapeEvents(website) {
    const page = await this.browser.newPage();
    try {
      // Set viewport and user agent
      await page.setViewport({ width: 1920, height: 1080 });
      await page.setUserAgent(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      );

      console.log(`Navigating to ${website.url}`);
      await page.goto(website.url, {
        waitUntil: ['networkidle0', 'domcontentloaded'],
        timeout: 30000,
      });

      try {
        // Wait for any content to load first
        await page.waitForSelector('body', { timeout: 30000 });

        // Add custom JavaScript to handle dynamic content
        await page.evaluate(() => {
          // Force any lazy-loaded content to load
          window.scrollTo(0, document.body.scrollHeight);
        });

        // Wait a bit for dynamic content
        await new Promise((resolve) => setTimeout(resolve, 5000));

        // Debug: Log the page structure
        const pageStructure = await page.evaluate(() => {
          const structure = {
            body: !!document.querySelector('body'),
            articles: document.querySelectorAll('article').length,
            newsItems: document.querySelectorAll('.news-item').length,
            contentItems: document.querySelectorAll('.content-item').length,
            contentListItems: document.querySelectorAll('.content-list-item').length,
            allLinks: document.querySelectorAll('a').length,
            allDates: document.body.textContent.match(/\d{1,2}\.\d{1,2}\.\d{4}/g)?.length || 0,
          };
          return structure;
        });
        console.log('Page structure:', pageStructure);

        // Try multiple approaches to find the content
        const events = await page.evaluate(() => {
          const events = [];
          const dateRegex = /\d{1,2}\.\d{1,2}\.\d{4}/;

          // First, find all text nodes that contain dates
          const dateNodes = [];
          const walker = document.createTreeWalker(
            document.body,
            NodeFilter.SHOW_TEXT,
            null,
            false
          );

          let node;
          while ((node = walker.nextNode())) {
            if (dateRegex.test(node.textContent)) {
              dateNodes.push(node);
            }
          }

          console.log(`Found ${dateNodes.length} nodes containing dates`);

          // For each date node, try to find the associated event details
          dateNodes.forEach((node) => {
            const date = node.textContent.match(dateRegex)[0];
            let container = node.parentElement;

            // Walk up a few levels to find a good container
            for (let i = 0; i < 3 && container; i++) {
              const text = container.textContent;
              if (text.length > 100) break; // Found a good container
              container = container.parentElement;
            }

            if (container) {
              // Look for a title in the container or nearby
              let titleElement = null;
              const possibleTitleElements = container.querySelectorAll(
                'h1, h2, h3, h4, strong, b, .title'
              );

              for (const el of possibleTitleElements) {
                const text = el.textContent.trim();
                if (text.length > 10 && text.length < 200 && !dateRegex.test(text)) {
                  titleElement = el;
                  break;
                }
              }

              // If no title found in container, look in siblings
              if (!titleElement) {
                const siblings = [
                  container.previousElementSibling,
                  container.nextElementSibling,
                ].filter(Boolean);

                for (const sibling of siblings) {
                  const titleEl = sibling.querySelector('h1, h2, h3, h4, strong, b, .title');
                  if (titleEl) {
                    const text = titleEl.textContent.trim();
                    if (text.length > 10 && text.length < 200 && !dateRegex.test(text)) {
                      titleElement = titleEl;
                      break;
                    }
                  }
                }
              }

              // Get the event details
              const title = titleElement ? titleElement.textContent.trim() : null;
              const link = container.querySelector('a')?.href || '';
              let description = container.textContent.trim();

              // Clean up the description
              if (title) description = description.replace(title, '');

              // Remove all date patterns
              description = description
                .replace(/\d{1,2}\.\s*\d{1,2}\.\s*\d{4}/g, '') // Remove dates like 12.01.2025
                .replace(/\d{1,2}-\d{1,2}\.\d{1,2}\.\d{4}/g, '') // Remove date ranges
                .replace(/\s+/g, ' ') // Replace multiple whitespace with single space
                .replace(/\n+/g, '\n') // Replace multiple newlines with single newline
                .replace(/\s*\n\s*/g, '\n') // Remove whitespace around newlines
                .replace(/\s+\./g, '.') // Remove whitespace before periods
                .replace(/\s+,/g, ',') // Remove whitespace before commas
                .replace(/Preuzmite plakat\s*/g, '') // Remove "Preuzmite plakat" text
                .split('\n') // Split into lines
                .map((line) => line.trim()) // Trim each line
                .filter((line) => line.length > 0) // Remove empty lines
                .filter((line, index, arr) => {
                  // More aggressive duplicate removal - check if line is contained within another line
                  return !arr.some((otherLine, otherIndex) => {
                    return (
                      index !== otherIndex &&
                      otherLine.includes(line) &&
                      line.length < otherLine.length
                    );
                  });
                })
                .join('\n')
                .trim();

              // Only add if we have at least a title or meaningful description
              if (title || (description && description.length > 20)) {
                events.push({
                  title: title || 'No title',
                  date,
                  link,
                  description: description || '',
                });
                console.log(`Found event: ${title} (${date})`);
              }
            }
          });

          return events;
        });

        console.log(`Found ${events.length} total events`);

        // Filter for upcoming events only
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
        // Log the HTML content for debugging
        const html = await page.content();
        console.log('Page HTML:', html.substring(0, 1000));
        throw error;
      }
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

    // Also save the file path for reference
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
          new URL(website.url); // Will throw if URL is invalid
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
      throw error; // Re-throw to handle in index.js
    } finally {
      await this.close();
    }
  }
}

module.exports = HikingEventScraper;
