import { GoogleGenAI } from '@google/genai';
import redisClient from '../redisClient.js';
import crypto from 'crypto';
import dotenv from 'dotenv';

dotenv.config();

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

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
    
    const prompt = `Analyze the following comment for toxicity, harassment, and unsafe content. 
Return a JSON object with:
- "rating": a number from 1 to 10 (1 = completely safe, 10 = highly toxic)
- "message": a brief explanation
- "toxic": boolean (true if toxic, false otherwise)
Text to analyze: "${commentText}"`;

    const interaction = await ai.interactions.create({
      model: 'gemini-3.5-flash',
      input: prompt
    });
    
    const responseText = interaction.output_text;
    const jsonMatch = responseText.match(/```(?:json)?\n?([\s\S]*?)```/) || [null, responseText];
    let parsedData;
    try {
      parsedData = JSON.parse(jsonMatch[1].trim());
    } catch (e) {
      parsedData = { rating: 1, message: 'Content seems normal', toxic: false };
    }

    const finalResult = {
      rating: parsedData.rating || 1,
      message: parsedData.message || (parsedData.rating > 7 ? 'Potential toxicity detected' : 'Comment seems normal'),
      output: parsedData,
    };

    await redisClient.set(cacheKey, JSON.stringify(finalResult), { EX: 300 });

    return res.json(finalResult);
  } catch (err) {
    console.error('Error in analyzeComment:', err);
    return res.status(500).json({ error: err.message || 'Internal error' });
  }
};
