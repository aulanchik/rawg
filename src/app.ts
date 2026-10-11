import express, { Express } from 'express';
import morgan from 'morgan';
import cors from 'cors';
import helmet from 'helmet';

import rawg from '@/routes/rawg';
import system from '@/routes/system';
import { config } from '@/config/env';
import { errorHandler, notFound } from '@/middleware/errors';

const app: Express = express();

app.disable('x-powered-by');
app.use(helmet());
app.use(cors());

if (config.enableMorgan) {
  app.use(morgan('dev'));
}

app.use('/', system);
app.use('/', rawg);

app.use(notFound);
app.use(errorHandler);

export default app;
