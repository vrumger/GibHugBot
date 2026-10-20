import { Composer } from 'grammy';

import connect from './connect';
import integrations from './integrations';
import manage from './manage';
import topics from './topics';
import transfer from './transfer';

const composer = new Composer();

composer.use(topics);
composer.use(connect);
composer.use(integrations);
composer.use(manage);
composer.use(transfer);

export default composer;
