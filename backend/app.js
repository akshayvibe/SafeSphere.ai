import express from 'express';
import moderationRoutes from './routes/moderation.routes.js';
import cors from 'cors';
import morgan from 'morgan';
import logger from './logger.js';
import './redisClient.js'; // import to initialize Redis client connection

const app = express();

// Use morgan for HTTP request logging, piping output to winston
app.use(morgan('combined', { stream: { write: message => logger.info(message.trim()) } }));

app.use(express.json());
app.use(cors());

app.use('/moderation', moderationRoutes);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  logger.info(`Moderation API running on port ${PORT}`);
});
