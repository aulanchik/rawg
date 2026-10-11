import app from '@/app';
import { config } from '@/config/env';
import { Logger } from '@/utils/logger';

app.listen(config.port, () => {
  Logger.success(`Server is up at port ${config.port}`);
});
