const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const puppeteer = require('puppeteer');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;

const app = express();
const port = 5000;

app.use(cors());
app.use(bodyParser.json());

let scrapedData = []; // Variable to store scraped data temporarily

app.post('/scrape', async (req, res) => {
  const { url, action } = req.body;

  if (!url) {
    return res.status(400).send('URL is required.');
  }

  try {
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: 'networkidle2' });

    // Perform actions based on the provided action type
    switch (action) {
      case 'scroll':
        scrapedData = await autoScrollAndCollect(page);
        break;
      case 'pagination':
        scrapedData = await handlePagination(page);
        break;
      default:
        scrapedData = await scrapeSimple(page);
        break;
    }

    await browser.close();

    res.json({ message: 'Scraping completed.', data: scrapedData });

  } catch (error) {
    console.error('Error:', error);
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
      // Delete the file after download
      fs.unlinkSync('scraped_data.csv');
    });

  } catch (error) {
    console.error('Error:', error);
    res.status(500).send('Error generating CSV file.');
  }
});

async function scrapeSimple(page) {
  return await page.evaluate(() => {
    // Example: scraping all links from the page
    return Array.from(document.querySelectorAll('a')).map(link => ({
      href: link.href,
      text: link.textContent
    }));
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
      // Example: collect items while scrolling
      document.querySelectorAll('a').forEach(link => {
        data.push({
          href: link.href,
          text: link.textContent
        });
      });
    }

    return data;
  });
}

async function handlePagination(page) {
  let results = [];
  let hasNextPage = true;
  let clickedNextButton = false;

  while (hasNextPage) {
    results = results.concat(await page.evaluate(() => {
      // Example: scraping all links from the current page
      return Array.from(document.querySelectorAll('a')).map(link => ({
        href: link.href,
        text: link.textContent
      }));
    }));

    // Try to find and click the next button dynamically
    hasNextPage = await page.evaluate(() => {
      const nextButton = document.querySelector('a[class*="next"]') || document.querySelector('a[rel="next"]');
      if (nextButton) {
        nextButton.click();
        return true;
      }
      return false;
    });

    if (hasNextPage) {
      await page.waitForNavigation({ waitUntil: 'networkidle2' });
      clickedNextButton = true;
    } else if (!clickedNextButton) {
      // If we never clicked a next button, try scrolling down to trigger lazy loading
      await autoScroll(page);
      await page.waitForTimeout(2000); // Adjust the timeout based on the website's behavior
      hasNextPage = true; // Set to true to continue the loop
    }
  }

  return results;
}

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
