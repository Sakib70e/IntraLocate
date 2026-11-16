import { Elysia } from 'elysia';
import prisma from '../config/db.js';
import { authenticateUser, authorizeOrgMember } from '../middleware/auth.js';
import mlService from '../services/mlService.js';

export const mlRoutes = new Elysia({ prefix: '/api/ml' })
  // Train model for a site (Admin only)
  .post('/train/:siteId', async ({ headers, params, body, jwt, set }) => {
    const { user, error } = await authenticateUser(headers, jwt);
    if (error) {
      set.status = 401;
      return { success: false, error };
    }

    const siteId = params.siteId;
    const site = await prisma.site.findUnique({ where: { id: siteId } });
    if (!site) {
      set.status = 404;
      return { success: false, error: 'Site not found' };
    }

    // Allow any organization member (both Admin and Contributors) to train models
    const { error: authError } = await authorizeOrgMember(user.id, site.organizationId);
    if (authError) {
      set.status = 403;
      return { success: false, error: authError };
    }

    try {
      const result = await mlService.trainSiteModel(siteId, site.organizationId, body || {});
      return {
        success: true,
        data: result,
        message: `Model trained successfully with ${result.metrics.accuracy}% cross-validation accuracy across ${result.metrics.classesCount} rooms!`,
      };
    } catch (err) {
      console.error('Training error:', err);
      set.status = 400;
      return { success: false, error: err.message || 'Model training failed' };
    }
  })

  // Get active model and model history for a site
  .get('/models/:siteId', async ({ headers, params, jwt, set }) => {
    const { user, error } = await authenticateUser(headers, jwt);
    if (error) {
      set.status = 401;
      return { success: false, error };
    }

    const siteId = params.siteId;
    const site = await prisma.site.findUnique({ where: { id: siteId } });
    if (!site) {
      set.status = 404;
      return { success: false, error: 'Site not found' };
    }

    const { error: authError } = await authorizeOrgMember(user.id, site.organizationId);
    if (authError) {
      set.status = 403;
      return { success: false, error: authError };
    }

    const models = await prisma.modelVersion.findMany({
      where: { siteId, organizationId: site.organizationId },
      orderBy: { version: 'desc' },
      select: {
        id: true,
        version: true,
        algorithm: true,
        accuracy: true,
        sampleCount: true,
        isActive: true,
        createdAt: true,
        featureColumns: true,
        modelArtifact: true,
      },
    });

    const activeModel = models.find((m) => m.isActive) || null;

    return {
      success: true,
      data: {
        activeModel,
        history: models,
      },
    };
  })

  // Live localization prediction endpoint
  .post('/predict/:siteId', async ({ headers, params, body, jwt, set }) => {
    const { user, error } = await authenticateUser(headers, jwt);
    if (error) {
      set.status = 401;
      return { success: false, error };
    }

    const siteId = params.siteId;
    const site = await prisma.site.findUnique({ where: { id: siteId } });
    if (!site) {
      set.status = 404;
      return { success: false, error: 'Site not found' };
    }

    const { error: authError } = await authorizeOrgMember(user.id, site.organizationId);
    if (authError) {
      set.status = 403;
      return { success: false, error: authError };
    }

    const wifiData = body?.wifiData || {};
    if (Object.keys(wifiData).length === 0) {
      set.status = 400;
      return { success: false, error: 'No Wi-Fi signals detected in scan' };
    }

    try {
      const result = await mlService.predictLocation(siteId, site.organizationId, wifiData);
      return {
        success: true,
        data: result,
      };
    } catch (err) {
      console.error('Prediction error:', err);
      set.status = 400;
      return { success: false, error: err.message || 'Prediction failed' };
    }
  })

  // Get training jobs for a site
  .get('/jobs/:siteId', async ({ headers, params, jwt, set }) => {
    const { user, error } = await authenticateUser(headers, jwt);
    if (error) {
      set.status = 401;
      return { success: false, error };
    }

    const siteId = params.siteId;
    const site = await prisma.site.findUnique({ where: { id: siteId } });
    if (!site) {
      set.status = 404;
      return { success: false, error: 'Site not found' };
    }

    const { error: authError } = await authorizeOrgMember(user.id, site.organizationId);
    if (authError) {
      set.status = 403;
      return { success: false, error: authError };
    }

    const jobs = await prisma.trainingJob.findMany({
      where: { siteId },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    return { success: true, data: jobs };
  });
