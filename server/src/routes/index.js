/**
 * SplitStack REST API Routes Aggregator (Review 3, Step P11).
 * Mounts all domain routers under their respective REST resource paths.
 */

import { Router } from 'express';
import { authRouter } from './auth.js';
import { expensesRouter } from './expenses.js';
import { incomeRouter } from './income.js';
import { categoriesRouter } from './categories.js';
import { budgetsRouter } from './budgets.js';
import { recurringRouter } from './recurring.js';
import { groupsRouter } from './groups.js';
import { shoppingRouter } from './shopping.js';
import { analyticsRouter } from './analytics.js';
import { notificationsRouter } from './notifications.js';
import { searchRouter } from './search.js';
import { receiptsRouter } from './receipts.js';

export const apiRouter = Router();

apiRouter.use('/auth', authRouter);
apiRouter.use('/expenses', expensesRouter);
apiRouter.use('/income', incomeRouter);
apiRouter.use('/categories', categoriesRouter);
apiRouter.use('/budgets', budgetsRouter);
apiRouter.use('/recurring', recurringRouter);
apiRouter.use('/groups', groupsRouter);
apiRouter.use('/shopping', shoppingRouter);
apiRouter.use('/analytics', analyticsRouter);
apiRouter.use('/notifications', notificationsRouter);
apiRouter.use('/search', searchRouter);
apiRouter.use('/receipts', receiptsRouter);

export default apiRouter;
