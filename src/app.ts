import express, { Express } from 'express';
import morgan from 'morgan';
import cors from 'cors';

import sampleRoutes from '@/routes/sampleRoutes';

const app: Express = express();

app.use(cors());
app.use(morgan('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use('/', sampleRoutes);

export default app;
