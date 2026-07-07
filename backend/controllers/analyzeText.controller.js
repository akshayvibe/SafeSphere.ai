import axios from 'axios';
import redisClient from '../redisClient.js';
import crypto from 'crypto';
import dotenv from 'dotenv';

dotenv.config({
  path: './.env'
});

const PERSPECTIVE_URL = 'https://commentanalyzer.googleapis.com/v1alpha1/comments:analyze';

const analyzeComment = async (req, res) => {
  let { text } = req.body;

  if (typeof text !== 'string' || !text.trim()) {
    return res.status(400).json({ error: 'Valid text is required' });
  }

  // Normalize text to avoid encoding issues
  text = text.normalize('NFC').trim();

  console.log('Received moderation request:', text);

  try {
    const cacheKey = 'moderation:' + crypto.createHash('sha256').update(text).digest('hex');

    console.log('Checking Redis cache ...');
    const cachedResult = await redisClient.get(cacheKey);
    if (cachedResult) {
      console.log('Cache hit, sending response.');
      return res.json(JSON.parse(cachedResult));
    }

    console.log('Cache miss. Calling Perspective API...');
    
    // Perspective API request body
    const requestData = {
      comment: { text },
      languages: ['en'],
      requestedAttributes: {
        TOXICITY: {},
        SEVERE_TOXICITY: {},
        IDENTITY_ATTACK: {},
        INSULT: {},
        PROFANITY: {},
        THREAT: {}
      }
    };

    const response = await axios.post(`${PERSPECTIVE_URL}?key=${process.env.PERSPECTIVE_API_KEY}`, requestData);
    
    // Perspective returns scores from 0.0 to 1.0. We'll map the highest score to our 1-10 scale.
    const attributeScores = response.data.attributeScores;
    let maxScore = 0;
    
    for (const key in attributeScores) {
      const score = attributeScores[key].summaryScore.value;
      if (score > maxScore) maxScore = score;
    }

    // Convert 0.0 - 1.0 to 1 - 10 rating
    let rating = Math.round(maxScore * 10);
    if (rating === 0) rating = 1; // Minimum rating of 1

    const isToxic = rating > 7;
    const finalResult = {
      rating: rating,
      message: isToxic ? 'Potential toxicity detected by Perspective API' : 'Content seems normal',
      toxic: isToxic,
      output: response.data, // Attach raw perspective output for debugging
    };

    console.log('Caching result in Redis...');
    await redisClient.set(cacheKey, JSON.stringify(finalResult), { EX: 300 });

    console.log('Sending response.');
    return res.json(finalResult);

  } catch (err) {
    console.error('Error in analyzeComment (Perspective):', err.response?.data || err.message);
    return res.status(500).json({ error: (err && err.message) || 'Internal error' });
  }
};

const testBytez = async (req, res) => {
  // Legacy test endpoint, can just return success or use perspective
  return res.json({ output: "Test endpoint deprecated. Please use analyzeComment instead." });
};

export { analyzeComment, testBytez };
