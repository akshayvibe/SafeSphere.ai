import axios from 'axios';
import FormData from 'form-data';
import redisClient from '../redisClient.js';
import crypto from 'crypto';
import dotenv from 'dotenv';
import Bottleneck from 'bottleneck';
import logger from '../logger.js';

dotenv.config({
  path: './.env'
});

const limiter = new Bottleneck({
  maxConcurrent: 2, // Maximum 2 concurrent requests
  minTime: 333      // Minimum 333ms between requests
});

const processModerationResult = (result) => {
  let flagged = false;
  let maxScore = 0;
  
  if (result.profanity && result.profanity.matches && result.profanity.matches.length > 0) {
    flagged = true;
    maxScore = 0.9;
  }
  if (result.personal && result.personal.matches && result.personal.matches.length > 0) {
    flagged = true;
    maxScore = 0.8;
  }
  if (result.link && result.link.matches && result.link.matches.length > 0) {
    flagged = true;
    maxScore = 0.7;
  }
  if (result.offensive && result.offensive.prob > 0.8) {
    flagged = true;
    maxScore = Math.max(maxScore, result.offensive.prob);
  }

  let rating = flagged ? Math.round(maxScore * 10) : 1;
  if (rating === 0) rating = 1;

  return {
    rating: rating,
    message: flagged ? 'Potential toxicity detected by Sightengine' : 'Content seems normal',
    toxic: flagged,
    output: result,
  };
};

const analyzeComment = async (req, res) => {
  let { text, texts } = req.body;

  let inputTexts = [];
  let isBatch = false;

  if (texts && Array.isArray(texts)) {
    inputTexts = texts.map(t => t.normalize('NFC').trim()).filter(t => t);
    isBatch = true;
  } else if (typeof text === 'string' && text.trim()) {
    inputTexts = [text.normalize('NFC').trim()];
  } else {
    return res.status(400).json({ error: 'Valid text or texts array is required' });
  }

  if (inputTexts.length === 0) {
    return res.json(isBatch ? { results: [] } : null);
  }

  logger.info(`Received moderation request for ${inputTexts.length} items`);

  try {
    const finalResults = new Array(inputTexts.length);
    const uncachedTexts = [];
    const uncachedIndices = [];

    for (let i = 0; i < inputTexts.length; i++) {
      const cacheKey = 'moderation-sightengine-text:' + crypto.createHash('sha256').update(inputTexts[i]).digest('hex');
      const cachedResult = await redisClient.get(cacheKey);
      if (cachedResult) {
        finalResults[i] = JSON.parse(cachedResult);
      } else {
        uncachedTexts.push(inputTexts[i]);
        uncachedIndices.push(i);
      }
    }

    if (uncachedTexts.length > 0) {
      logger.info(`Cache miss for ${uncachedTexts.length} items. Calling Sightengine...`);
      
      const promises = uncachedTexts.map(async (t, idx) => {
        const originalIndex = uncachedIndices[idx];
        let response;
        let retries = 3;
        let delayMs = 1000;
        
        const data = new FormData();
        data.append('text', t);
        data.append('lang', 'en');
        data.append('mode', 'rules');
        data.append('api_user', process.env.SIGHTENGINE_API_USER);
        data.append('api_secret', process.env.SIGHTENGINE_API_SECRET);

        while (retries > 0) {
          try {
            logger.info(`Sending text to Sightengine: "${t.substring(0, 50)}${t.length > 50 ? '...' : ''}"`);
            response = await limiter.schedule(() => axios({
              method: 'post',
              url: 'https://api.sightengine.com/1.0/text/check.json',
              data: data,
              headers: data.getHeaders()
            }));
            logger.info(`Received response from Sightengine for text: "${t.substring(0, 50)}${t.length > 50 ? '...' : ''}" - Status: ${response.data.status}`);
            break;
          } catch (e) {
            if (e.response && e.response.status === 429 && retries > 1) {
              logger.warn(`Rate limited (429). Retrying in ${delayMs}ms...`);
              await new Promise(res => setTimeout(res, delayMs));
              delayMs *= 2;
              retries--;
            } else {
              throw e;
            }
          }
        }
        
        const processedResult = processModerationResult(response.data);
        finalResults[originalIndex] = processedResult;

        const cacheKey = 'moderation-sightengine-text:' + crypto.createHash('sha256').update(t).digest('hex');
        await redisClient.set(cacheKey, JSON.stringify(processedResult), { EX: 300 });
      });

      await Promise.all(promises);
    }

    logger.debug('Sending response.');
    return res.json(isBatch ? { results: finalResults } : finalResults[0]);

  } catch (err) {
    logger.error(`Error in analyzeComment (Sightengine): ${err.message}`);
    return res.status(500).json({ error: err.message || 'Internal error' });
  }
};

const testBytez = async (req, res) => {
  return res.json({ output: "Test endpoint deprecated." });
};

export { analyzeComment, testBytez };
