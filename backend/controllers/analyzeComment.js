import axios from 'axios';
import redisClient from '../redisClient.js';
import crypto from 'crypto';
import dotenv from 'dotenv';

dotenv.config();

const PERSPECTIVE_URL = 'https://commentanalyzer.googleapis.com/v1alpha1/comments:analyze';

export const analyzeComments = async (req, res) => {
  let { commentText } = req.body;
  if (typeof commentText !== 'string' || !commentText.trim()) {
    return res.status(400).json({ error: 'Valid commentText is required' });
  }
  commentText = commentText.normalize('NFC').trim();

  try {
    const cacheKey = 'comment-moderation:' + crypto.createHash('sha256').update(commentText).digest('hex');
    const cachedResult = await redisClient.get(cacheKey);
    if (cachedResult) {
      return res.json(JSON.parse(cachedResult));
    }
    
    // Perspective API request body
    const requestData = {
      comment: { text: commentText },
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
    if (rating === 0) rating = 1;

    const isToxic = rating > 7;
    const finalResult = {
      rating: rating,
      message: isToxic ? 'Potential toxicity detected by Perspective API' : 'Comment seems normal',
      toxic: isToxic,
      output: response.data,
    };

    await redisClient.set(cacheKey, JSON.stringify(finalResult), { EX: 300 });

    return res.json(finalResult);
  } catch (err) {
    console.error('Error in analyzeComment (Perspective):', err.response?.data || err.message);
    return res.status(500).json({ error: err.message || 'Internal error' });
  }
};
