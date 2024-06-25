const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const puppeteer = require('puppeteer');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;

const app = express();
const port = 5000;

app.use(cors());
app.use(bodyParser.json());

let scrapedData = [];
let isScrapingInProgress = false;

app.post('/scrape', async (req, res) => {
  const { url, action } = req.body;

  if (!url) {
    return res.status(400).send('URL is required.');
  }

  if (isScrapingInProgress) {
    return res.status(409).send('Scraping is already in progress.');
  }

  isScrapingInProgress = true;

  try {
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();

    let navigationAttempts = 3; // Number of retry attempts for navigation

    while (navigationAttempts > 0) {
      try {
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 }); // Increased timeout to 60 seconds
        break;
      } catch (error) {
        navigationAttempts--;
        console.error(`Attempt ${3 - navigationAttempts} failed:`, error);
        if (navigationAttempts === 0) {
          throw error;
        }
      }
    }

    let tempScrapedData = [];

    switch (action) {
      case 'scroll':
        tempScrapedData = await autoScrollAndCollect(page);
        break;
      case 'pagination':
        tempScrapedData = await handlePagination(page);
        break;
      default:
        tempScrapedData = await scrapeSimple(page);
        break;
    }

    await browser.close();

    scrapedData = tempScrapedData;

    isScrapingInProgress = false;
    res.json({ message: 'Scraping completed.', data: scrapedData });

  } catch (error) {
    console.error('Error:', error);
    isScrapingInProgress = false;
    res.status(500).send('Error scraping the website.');
  }
});

app.get('/download', async (req, res) => {
  try {
    if (scrapedData.length === 0) {
      return res.status(404).send('No data available to download.');
    }

    const csvWriter = createCsvWriter({
      path: 'scraped_data.csv',
      header: Object.keys(scrapedData[0]).map(key => ({ id: key, title: key }))
    });

    await csvWriter.writeRecords(scrapedData);

    res.download('scraped_data.csv', 'scraped_data.csv', (err) => {
      if (err) {
        res.status(500).send('Error downloading the file.');
      }
    });

  } catch (error) {
    console.error('Error:', error);
    res.status(500).send('Error generating CSV file.');
  }
});

async function scrapeSimple(page) {
  return await page.evaluate(() => {
    function getElementData(el) {
      return {
        tag: el.tagName.toLowerCase(),
        text: el.textContent.trim(),
        href: el.href || ''
      };
    }

    function getAllElements() {
      const elements = [];
      const nodes = document.querySelectorAll('a, h1, h2, h3, h4, p, div');

      nodes.forEach(node => {
        elements.push(getElementData(node));
      });

      return elements;
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
      await new Promise(resolve => setTimeout(resolve, 100));
      totalHeight += distance;
    }
  });
}

async function autoScrollAndCollect(page) {
  return await page.evaluate(async () => {
    const distance = 100;
    let totalHeight = 0;
    const data = [];

    while (totalHeight < document.body.scrollHeight) {
      window.scrollBy(0, distance);
      await new Promise(resolve => setTimeout(resolve, 100));
      totalHeight += distance;

      document.querySelectorAll('a, h1, h2, h3, h4, p, div').forEach(link => {
        data.push({
          tag: link.tagName.toLowerCase(),
          text: link.textContent.trim(),
          href: link.href || ''
        });
      });
    }

    return data;
  });
}

async function handlePagination(page) {
  let results = [];
  let currentPage = 1;

  while (true) {
    const pageData = await page.evaluate(() => {
      function getElementData(el) {
        return {
          tag: el.tagName.toLowerCase(),
          text: el.textContent.trim(),
          href: el.href || ''
        };
      }

      function getAllElements() {
        const elements = [];
        const nodes = document.querySelectorAll('a, h1, h2, h3, h4, p, div');

        nodes.forEach(node => {
          elements.push(getElementData(node));
        });

        return elements;
      }

      return getAllElements();
    });

    results = results.concat(pageData);

    const nextButtonClicked = await page.evaluate(() => {
      const nextButton = Array.from(document.querySelectorAll('a, button')).find(el => {
        return el.getAttribute('aria-label') && el.getAttribute('aria-label').toLowerCase().includes('go to');
      });
      if (nextButton) {
        nextButton.scrollIntoView();
        nextButton.click();
        return true;
      }
      return false;
    });

    if (nextButtonClicked) {
      try {
        await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 60000 }); // Increase timeout to 60 seconds
      } catch (e) {
        console.error('Navigation timeout:', e);
        break;
      }
    } else {
      const paginationLinksClicked = await page.evaluate((currentPage) => {
        const paginationLinks = Array.from(document.querySelectorAll('a')).filter(link => link.textContent.trim() == currentPage.toString());
        if (paginationLinks.length > 0) {
          paginationLinks[0].scrollIntoView();
          paginationLinks[0].click();
          return true;
        }
        return false;
      }, currentPage + 1);

      if (paginationLinksClicked) {
        try {
          await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 60000 }); // Increase timeout to 60 seconds
          currentPage += 1;
        } catch (e) {
          console.error('Navigation timeout:', e);
          break;
        }
      } else {
        break;
      }
    }
  }

  return results;
}

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
