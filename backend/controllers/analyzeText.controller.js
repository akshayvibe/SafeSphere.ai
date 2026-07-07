import { GoogleGenerativeAI } from '@google/generative-ai';
import redisClient from '../redisClient.js';
import crypto from 'crypto';
import dotenv from 'dotenv'

dotenv.config({
  path:'./.env'
})

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

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

    console.log('Cache miss. Calling Gemini...');
    
    const prompt = `Analyze the following text for toxicity, harassment, and unsafe content. 
Return a JSON object with:
- "rating": a number from 1 to 10 (1 = completely safe, 10 = highly toxic)
- "message": a brief explanation
- "toxic": boolean (true if toxic, false otherwise)
Text to analyze: "${text}"`;

    const result = await model.generateContent(prompt);
    const responseText = result.response.text();
    const jsonMatch = responseText.match(/```(?:json)?\n?([\s\S]*?)```/) || [null, responseText];
    let parsedData;
    try {
      parsedData = JSON.parse(jsonMatch[1].trim());
    } catch (e) {
      parsedData = { rating: 1, message: 'Content seems normal', toxic: false };
    }

    const finalResult = {
      rating: parsedData.rating || 1,
      message: parsedData.message || (parsedData.rating > 7 ? 'Something fishy detected' : 'Content seems normal'),
      output: parsedData,
    };

    console.log('Caching result in Redis...');
    await redisClient.set(cacheKey, JSON.stringify(finalResult), { EX: 300 });

    console.log('Sending response.');
    return res.json(finalResult);

  } catch (err) {
    console.error('Error in analyzeComment:', err, err.stack || '');
    return res.status(500).json({ error: (err && err.message) || 'Internal error' });
  }
};

const testBytez = async (req, res) => {
  let { text } = req.body;

  if (typeof text !== 'string' || !text.trim()) {
    return res.status(400).json({ error: 'Valid text is required' });
  }

  text = text.normalize('NFC').trim();

  try {
    const prompt = `Analyze for toxicity: "${text}"`;
    const result = await model.generateContent(prompt);
    return res.json({ output: result.response.text() });
  } catch (err) {
    console.error('Error in testBytez:', err);
    return res.status(500).json({ error: err.message || 'Internal error' });
  }
};

export { analyzeComment, testBytez };
