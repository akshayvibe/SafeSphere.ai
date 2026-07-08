import axios from 'axios';
import dotenv from 'dotenv';
import Bottleneck from 'bottleneck';
import logger from '../logger.js';

dotenv.config({
  path: './.env'
});

const limiter = new Bottleneck({
  maxConcurrent: 2,
  minTime: 333
});

const analyzeImage = async (req, res) => {
  const { imageUrl } = req.body;

  if (!imageUrl) {
    return res.status(400).json({ error: 'Image URL is required' });
  }

  try {
    const response = await limiter.schedule(() => axios.get('https://api.sightengine.com/1.0/check.json', {
      params: {
        'url': imageUrl,
        'models': 'nudity-2.0,wad,offensive,text-content,gore,tobacco,violence,self-harm',
        'api_user': process.env.SIGHTENGINE_API_USER,
        'api_secret': process.env.SIGHTENGINE_API_SECRET
      }
    }));

    const result = response.data;
    let flagged = false;
    let maxScore = 0;
    const contentTypes = [];

    // Analyze nudity
    if (result.nudity) {
      const nudityScore = Math.max(result.nudity.suggestive || 0, result.nudity.erotica || 0, result.nudity.sexual_activity || 0);
      if (nudityScore > 0.5) {
        flagged = true;
        contentTypes.push('Nudity');
        maxScore = Math.max(maxScore, nudityScore);
      }
    }
    
    // Analyze weapons, alcohol, drugs
    if (result.weapon > 0.5) { flagged = true; contentTypes.push('Weapon'); maxScore = Math.max(maxScore, result.weapon); }
    if (result.alcohol > 0.5) { flagged = true; contentTypes.push('Alcohol'); maxScore = Math.max(maxScore, result.alcohol); }
    if (result.drugs > 0.5) { flagged = true; contentTypes.push('Drugs'); maxScore = Math.max(maxScore, result.drugs); }
    
    // Analyze violence/gore
    if (result.violence && result.violence.prob > 0.5) { flagged = true; contentTypes.push('Violence'); maxScore = Math.max(maxScore, result.violence.prob); }
    if (result.gore && result.gore.prob > 0.5) { flagged = true; contentTypes.push('Gore'); maxScore = Math.max(maxScore, result.gore.prob); }
    
    // Analyze offensive
    if (result.offensive && result.offensive.prob > 0.5) { flagged = true; contentTypes.push('Offensive'); maxScore = Math.max(maxScore, result.offensive.prob); }

    let rating = flagged ? Math.round(maxScore * 10) : 1;
    if (rating === 0) rating = 1;

    res.json({
      rating: rating,
      contentTypes: contentTypes,
      message: flagged ? 'Potential unsafe content detected by Sightengine' : 'Image seems normal',
      data: result,
    });
  } catch (error) {
    logger.error(`Sightengine API error: ${error.message}`);
    res.status(500).json({ error: 'Image moderation failed' });
  }
};

export { analyzeImage };
