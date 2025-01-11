# Web Scraper

A Node.js web scraper that extracts data from specified websites. Simply provide a URL as a command line argument, and the scraper will fetch and process the data according to the configured selectors.

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

### Basic Usage

Run the scraper by providing a website URL as an argument:

```bash
node index.js "https://example.com"
```

The scraper will use the selectors defined in `config.json` for the specified URL. If no specific selectors are defined for the URL, it will use the default selectors from the first website configuration.

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

The scraped data will be saved in the `data` directory.

## Dependencies

Main dependencies include:
- `axios` - HTTP client for making requests
- `cheerio` - Fast and flexible HTML parsing

For a complete list of dependencies, see `package.json`.

## Error Handling

- The scraper will exit with an error if no URL is provided
- Failed requests will be logged with appropriate error messages

## Best Practices

1. Always check the website's robots.txt before scraping
2. Use appropriate delays between requests if scraping multiple pages
3. Respect the website's terms of service and rate limits

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Last Updated

2025-01-11
