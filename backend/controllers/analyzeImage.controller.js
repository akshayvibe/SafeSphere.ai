// controllers/imageModerationController.js
import axios from 'axios';
import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv'

dotenv.config({
  path:'./.env'
})

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

const THRESHOLD = 0.3;  // kept for compatibility if needed, though gemini returns distinct rating

const analyzeImage = async (req, res) => {
  const { imageUrl } = req.body;

  if (!imageUrl) {
    return res.status(400).json({ error: 'Image URL is required' });
  }

  try {
    const imageResponse = await axios.get(imageUrl, { responseType: 'arraybuffer' });
    const mimeType = imageResponse.headers['content-type'] || 'image/jpeg';
    const inlineData = {
      data: Buffer.from(imageResponse.data).toString('base64'),
      mimeType: mimeType
    };

    const prompt = `Analyze this image for nudity, violence, scam, gore, weapons, self-harm, and offensive content. 
Return a JSON object with:
- "rating": a number from 1 to 10 based on the severity of unsafe content (1 = completely safe, 10 = highly unsafe)
- "contentTypes": an array of strings listing detected unsafe content (e.g., ["Nudity", "Violence"]). Empty array if none.
- "message": a brief summary of what was detected, or "Image seems normal" if safe.`;

    const result = await model.generateContent([prompt, { inlineData }]);
    const responseText = result.response.text();
    const jsonMatch = responseText.match(/```(?:json)?\n?([\s\S]*?)```/) || [null, responseText];
    let parsedData;
    try {
      parsedData = JSON.parse(jsonMatch[1].trim());
    } catch (e) {
      parsedData = { rating: 1, contentTypes: [], message: 'Image seems normal' };
    }

    res.json({
      rating: parsedData.rating || 1,
      contentTypes: parsedData.contentTypes || [],
      message: parsedData.message || (parsedData.rating > 7 ? 'Potential unsafe content detected' : 'Image seems normal'),
      data: parsedData,
    });
  } catch (error) {
    console.error('Gemini API error:', error.response?.data || error.message);
    res.status(500).json({ error: 'Image moderation failed' });
  }
};

export { analyzeImage };
