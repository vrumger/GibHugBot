import { Composer } from 'grammy';

import connect from './connect';
import integrations from './integrations';
import manage from './manage';

const composer = new Composer();

composer.use(connect);
composer.use(integrations);
composer.use(manage);

export default composer;
