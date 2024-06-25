import React, { useState } from 'react';
import axios from 'axios';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import './App.css';

function App() {
  const [url, setUrl] = useState('');
  const [action, setAction] = useState('simple');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleScrape = async () => {
    setLoading(true);
    try {
      const response = await axios.post('http://localhost:5000/scrape', { url, action });
      setData(response.data.data);
      toast.success('Scraping successful!');
    } catch (error) {
      console.error('Error:', error);
      toast.error('Error scraping the website.');
    }
    setLoading(false);
  };

  const handleDownload = async () => {
    try {
      const response = await axios.get('http://localhost:5000/download', {
        responseType: 'blob', // Important: responseType as 'blob' for binary data
      });

      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'scraped_data.csv');
      document.body.appendChild(link);
      link.click();
      link.parentNode.removeChild(link);

      toast.success('CSV downloaded successfully!');
    } catch (error) {
      console.error('Error:', error);
      toast.error('Error downloading CSV.');
    }
  };

  return (
    <div className="container">
      <ToastContainer />
      <h1 className='title'>Web Scraper</h1>
      
      <div className="input-container">
        <input
          className="url-input"
          type="text"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="Enter URL"
        />
        <select
          className="action-select"
          value={action}
          onChange={(e) => setAction(e.target.value)}
        >
          <option value="simple">Simple</option>
          <option value="scroll">Scroll</option>
          <option value="pagination">Pagination</option>
        </select>
        <button
          className='button'
          onClick={handleScrape}
          disabled={loading}
        >
          <div className="svg-wrapper">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              width="24"
              height="24"
            >
              <path fill="none" d="M0 0h24v24H0z"></path>
              <path
                fill="currentColor"
                d="M1.946 9.315c-.522-.174-.527-.455.01-.634l19.087-6.362c.529-.176.832.12.684.638l-5.454 19.086c-.15.529-.455.547-.679.045L12 14l6-8-8 6-8.054-2.685z"
              ></path>
            </svg>
          </div>
          <span>{loading ? 'Scraping' : 'Scrape'}</span>
        </button>
          <button
            className='download-button'
            onClick={handleDownload}
            disabled={!data}
          >
            Download
          </button>
      </div>
      {data &&!loading && (
        <div className="result-container">
          <h2 className="result-title">Scraped Data</h2>
          <pre className="result-json">{JSON.stringify(data, null, 2)}</pre>
        </div>
      )}
    </div>
  );
}

export default App;
