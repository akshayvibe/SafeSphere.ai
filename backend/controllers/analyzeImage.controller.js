import axios from 'axios';
import dotenv from 'dotenv';
import FormData from 'form-data';

dotenv.config({
  path: './.env'
});

const analyzeImage = async (req, res) => {
  const { imageUrl } = req.body;

  if (!imageUrl) {
    return res.status(400).json({ error: 'Image URL is required' });
  }

  try {
    // Sightengine API call for image moderation
    const response = await axios.get('https://api.sightengine.com/1.0/check.json', {
      params: {
        'url': imageUrl,
        'models': 'nudity-2.0,wad,offensive,scam,gore',
        'api_user': process.env.SIGHTENGINE_API_USER,
        'api_secret': process.env.SIGHTENGINE_API_SECRET
      }
    });

    const data = response.data;
    
    if (data.status !== 'success') {
      console.error('Sightengine returned error:', data.error);
      return res.status(500).json({ error: 'Image moderation failed (API error)' });
    }

    // Map Sightengine output to our 1-10 rating scale
    let maxProbability = 0;
    const contentTypes = [];

    // Nudity
    if (data.nudity) {
      const nudityProb = Object.values(data.nudity).reduce((a, b) => Math.max(a, b), 0);
      if (nudityProb > maxProbability) maxProbability = nudityProb;
      if (nudityProb > 0.3) contentTypes.push('Nudity');
    }
    // Weapons/Alcohol/Drugs (WAD)
    if (data.weapon && data.weapon > maxProbability) maxProbability = data.weapon;
    if (data.weapon > 0.3) contentTypes.push('Weapon');
    if (data.alcohol && data.alcohol > maxProbability) maxProbability = data.alcohol;
    if (data.alcohol > 0.3) contentTypes.push('Alcohol');
    if (data.drugs && data.drugs > maxProbability) maxProbability = data.drugs;
    if (data.drugs > 0.3) contentTypes.push('Drugs');
    // Gore
    if (data.gore) {
      const goreProb = data.gore.prob;
      if (goreProb > maxProbability) maxProbability = goreProb;
      if (goreProb > 0.3) contentTypes.push('Gore');
    }
    // Offensive
    if (data.offensive && data.offensive.prob > maxProbability) maxProbability = data.offensive.prob;
    if (data.offensive?.prob > 0.3) contentTypes.push('Offensive');
    // Scam
    if (data.scam && data.scam.prob > maxProbability) maxProbability = data.scam.prob;
    if (data.scam?.prob > 0.3) contentTypes.push('Scam');

    let rating = Math.round(maxProbability * 10);
    if (rating === 0) rating = 1;

    res.json({
      rating: rating,
      contentTypes: contentTypes,
      message: rating > 7 ? 'Potential unsafe content detected by Sightengine' : 'Image seems normal',
      data: data,
    });
  } catch (error) {
    console.error('Sightengine API error:', error.response?.data || error.message);
    res.status(500).json({ error: 'Image moderation failed' });
  }
};

export { analyzeImage };
