import { Composer } from 'grammy';

import connect from './connect';
import integrations from './integrations';
import manage from './manage';
import migration from './migration';
import topics from './topics';
import transfer from './transfer';

const composer = new Composer();

composer.use(migration);
composer.use(topics);
composer.use(connect);
composer.use(integrations);
composer.use(manage);
composer.use(transfer);

export default composer;
