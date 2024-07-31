const puppeteer = require('puppeteer');

const credentials = [
  { username: 'user1', password: 'password1' },
  { username: 'user2', password: 'password2' },
  { username: 'user3', password: 'password3' },
  { username: 'user4', password: 'password4' },
  { username: 'user5', password: 'password5' },
  { username: 'user6', password: 'password6' },
  { username: 'user7', password: 'password7' },
  { username: 'user8', password: 'password8' },
  { username: 'user9', password: 'password9' },
  { username: 'user10', password: 'password10' },
  // Add more credentials as needed
];

(async () => {
  const browser = await puppeteer.launch({ headless: false });
  const page = await browser.newPage();
  
  for (const credential of credentials) {
    await page.goto('https://semantic-ui.com/examples/login.html#');
    await page.waitForSelector('#login-form');
    
    await page.type('input[name=username]', credential.username);
    await page.type('input[name=password]', credential.password);
    
    await page.evaluate(() => {
      document.querySelector('button[type=submit]').click();
    });
    
    await page.waitForNavigation();
    
    // Perform actions after login
    // Optionally log out before the next iteration
    // await page.click('#logout-button');
    // await page.waitForNavigation();
  }
  
  await browser.close();
})();
