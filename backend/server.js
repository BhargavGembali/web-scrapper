const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const { parse } = require('json2csv');

const app = express();
const port = 5000;

app.use(cors());
app.use(bodyParser.json());

let scrapedData = [];
let isScrapingInProgress = false;
let nextButtonSelector = null;

const selectorsFilePath = path.join(__dirname, 'nextButtonSelectors.json');

function readSelectors() {
  if (fs.existsSync(selectorsFilePath)) {
    const data = fs.readFileSync(selectorsFilePath);
    return JSON.parse(data).selectors;
  }
  return [];
}

function writeSelectors(selectors) {
  fs.writeFileSync(selectorsFilePath, JSON.stringify({ selectors }, null, 2));
}

app.post('/scrape', async (req, res) => {
  const { url, action, nextButton } = req.body;

  if (!url) {
    return res.status(400).send('URL is required.');
  }

  if (isScrapingInProgress) {
    return res.status(409).send('Scraping is already in progress.');
  }

  isScrapingInProgress = true;
  nextButtonSelector = nextButton || null;

  try {
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    const page = await browser.newPage();

    await navigateToPage(page, url);

    let tempScrapedData = [];
    let nextButtonFound = true;

    switch (action) {
      case 'scroll':
        tempScrapedData = await autoScrollAndCollect(page);
        break;
      case 'pagination':
        const paginationResult = await handlePagination(page);
        tempScrapedData = paginationResult.results;
        nextButtonFound = paginationResult.nextButtonFound;
        if (!nextButtonFound && nextButton) {
          const selectors = readSelectors();
          selectors.push(nextButton);
          writeSelectors(selectors);
        }
        break;
      default:
        tempScrapedData = await scrapeSimple(page);
        break;
    }

    await browser.close();

    scrapedData = tempScrapedData;
    isScrapingInProgress = false;

    res.json({ message: 'Scraping completed.', data: scrapedData, nextButtonFound });
  } catch (error) {
    console.error('Error:', error);
    isScrapingInProgress = false;
    res.status(500).send('Error scraping the website.');
  }
});

app.get('/download/json', async (req, res) => {
  if (scrapedData.length === 0) {
    return res.status(404).send('No data available to download.');
  }

  const jsonFilePath = 'scraped_data.json';
  fs.writeFileSync(jsonFilePath, JSON.stringify(scrapedData, null, 2));
  res.download(jsonFilePath, 'scraped_data.json');
});

app.get('/download/csv', async (req, res) => {
  if (scrapedData.length === 0) {
    return res.status(404).send('No data available to download.');
  }

  const csvFilePath = 'scraped_data.csv';
  const csv = parse(scrapedData);
  fs.writeFileSync(csvFilePath, csv);
  res.download(csvFilePath, 'scraped_data.csv');
});

async function navigateToPage(page, url) {
  let navigationAttempts = 3;

  while (navigationAttempts > 0) {
    try {
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
      break;
    } catch (error) {
      navigationAttempts--;
      console.error(`Attempt ${3 - navigationAttempts} failed:`, error);
      if (navigationAttempts === 0) {
        throw error;
      }
    }
  }
}

async function scrapeSimple(page) {
  return page.evaluate(() => {
    function getElementData(el) {
      return {
        tag: el.tagName.toLowerCase(),
        text: el.textContent.trim(),
        href: el.href || '',
      };
    }

    function getAllElements() {
      return Array.from(document.querySelectorAll('a, h1, h2, h3, h4, p, div, ul, li, span')).map(getElementData);
    }

    return getAllElements();
  });
}

async function autoScroll(page) {
  await page.evaluate(async () => {
    const distance = 100;
    let totalHeight = 0;
    while (totalHeight < document.body.scrollHeight) {
      window.scrollBy(0, distance);
      await new Promise((resolve) => setTimeout(resolve, 100));
      totalHeight += distance;
    }
  });
}

async function autoScrollAndCollect(page) {
  return page.evaluate(async () => {
    const distance = 100;
    let totalHeight = 0;
    const data = [];

    while (totalHeight < document.body.scrollHeight) {
      window.scrollBy(0, distance);
      await new Promise((resolve) => setTimeout(resolve, 100));
      totalHeight += distance;

      document.querySelectorAll('a, h1, h2, h3, h4, p, div, ul, li, span').forEach((link) => {
        data.push({
          tag: link.tagName.toLowerCase(),
          text: link.textContent.trim(),
          href: link.href || '',
        });
      });
    }

    return data;
  });
}

async function handlePagination(page) {
  let results = [];
  let nextButtonFound = true;

  while (true) {
    const pageData = await scrapeSimple(page);
    results = results.concat(pageData);

    const nextButtonClicked = await clickNextButton(page);
    if (!nextButtonClicked) {
      nextButtonFound = false;
      break;
    }

    try {
      await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 60000 });
    } catch (e) {
      console.error('Navigation timeout:', e);
      break;
    }
  }

  return { results, nextButtonFound };
}

async function clickNextButton(page) {
  const selectors = readSelectors();

  return page.evaluate((userSelector, selectors) => {
    let nextButton;

    // Function to check if an element's aria-label, text content, or label contains the user-provided text
    function containsUserText(el, userText) {
      const ariaLabel = el.getAttribute('aria-label') || '';
      const textContent = el.textContent || '';
      const label = el.getAttribute('label') || '';
      const userTextLower = userText.trim().toLowerCase();
      return (
        ariaLabel.trim().toLowerCase().includes(userTextLower) ||
        textContent.trim().toLowerCase().includes(userTextLower) ||
        label.trim().toLowerCase().includes(userTextLower)
      );
    }

    // Check user-provided selector first
    if (userSelector) {
      nextButton = document.querySelector(userSelector);
    }

    // Check selectors from the file if user selector did not match
    if (!nextButton) {
      for (let selector of selectors) {
        nextButton = document.querySelector(selector);
        if (nextButton) break;
      }
    }

    // Generic search for elements that might be the next button
    if (!nextButton) {
      const userText = userSelector || 'next'; // Use 'next' as a default if userSelector is not provided
      nextButton = Array.from(document.querySelectorAll('a, button')).find((el) => containsUserText(el, userText));
    }

    if (nextButton) {
      nextButton.scrollIntoView();
      nextButton.click();
      return true;
    }

    return false;
  }, nextButtonSelector, selectors);
}

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
