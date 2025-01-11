# Web Scraper

A Node.js web scraper that extracts data from specified websites. You can either scrape a single website by providing its URL or scrape all websites configured in your config.json.

## Installation

1. Clone this repository:
```bash
git clone <repository-url>
cd web-scraper
```

2. Install required dependencies:
```bash
npm install
```

## Usage

### Single Website Scraping

To scrape a single website, provide its URL as an argument:

```bash
node index.js "https://example.com"
```

### Bulk Website Scraping

To scrape all websites defined in your config.json:

```bash
node scrape-all.js
```

### Configuration

The `config.json` file contains selectors for different websites. Example structure:

```json
{
  "websites": [
    {
      "url": "https://example.com",
      "selectors": {
        "title": "h1",
        "content": ".main-content"
      }
    }
  ]
}
```

## Output

The scraped data will be saved in the `data` directory, with each website's data in a separate JSON file.

## Dependencies

Main dependencies include:
- `puppeteer` - For browser automation and JavaScript rendering
- `cheerio` - Fast and flexible HTML parsing

For a complete list of dependencies, see `package.json`.

## Error Handling

- Single website scraping will exit if no URL is provided
- Bulk scraping will continue to the next website if one fails
- All errors are logged to the console with descriptive messages

## Best Practices

1. Always check the website's robots.txt before scraping
2. Use appropriate delays between requests if scraping multiple pages
3. Respect the website's terms of service and rate limits

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Last Updated

2025-01-11
