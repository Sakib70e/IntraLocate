import { Elysia } from 'elysia';
import prisma from '../config/db.js';
import { authenticateUser, authorizeOrgMember } from '../middleware/auth.js';

export const floorRoutes = new Elysia({ prefix: '/api/floors' })
  // List floors for a site
  .get('/', async ({ headers, query, jwt, set }) => {
    const { user, error } = await authenticateUser(headers, jwt);
    if (error) {
      set.status = 401;
      return { success: false, error };
    }

    const siteId = query.siteId;
    if (!siteId) {
      set.status = 400;
      return { success: false, error: 'siteId query parameter is required' };
    }

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

    const floors = await prisma.floor.findMany({
      where: { siteId },
      include: {
        rooms: true,
        _count: {
          select: { recordings: true, rooms: true },
        },
      },
      orderBy: { floorNumber: 'asc' },
    });

    return { success: true, data: floors };
  })

  // Create a floor (Admin only)
  .post('/', async ({ headers, body, jwt, set }) => {
    const { user, error } = await authenticateUser(headers, jwt);
    if (error) {
      set.status = 401;
      return { success: false, error };
    }

    const { siteId, name, floorNumber } = body || {};
    if (!siteId || !name || !name.trim()) {
      set.status = 400;
      return { success: false, error: 'siteId and name are required' };
    }

    const site = await prisma.site.findUnique({ where: { id: siteId } });
    if (!site) {
      set.status = 404;
      return { success: false, error: 'Site not found' };
    }

    const { error: authError } = await authorizeOrgMember(user.id, site.organizationId, 'CONTRIBUTOR');
    if (authError) {
      set.status = 403;
      return { success: false, error: authError };
    }

    const floor = await prisma.floor.create({
      data: {
        siteId,
        name: name.trim(),
        floorNumber: typeof floorNumber === 'number' ? floorNumber : parseInt(floorNumber, 10) || 1,
      },
    });

    return { success: true, data: floor };
  })

  // Update a floor (Admin or Contributor)
  .patch('/:id', async ({ headers, params, body, jwt, set }) => {
    const { user, error } = await authenticateUser(headers, jwt);
    if (error) {
      set.status = 401;
      return { success: false, error };
    }

    const floor = await prisma.floor.findUnique({
      where: { id: params.id },
      include: { site: true },
    });

    if (!floor) {
      set.status = 404;
      return { success: false, error: 'Floor not found' };
    }

    const { error: authError } = await authorizeOrgMember(user.id, floor.site.organizationId, 'CONTRIBUTOR');
    if (authError) {
      set.status = 403;
      return { success: false, error: authError };
    }

    const { name, floorNumber } = body || {};
    const updateData = {};
    if (name && name.trim()) updateData.name = name.trim();
    if (floorNumber !== undefined) {
      updateData.floorNumber = typeof floorNumber === 'number' ? floorNumber : parseInt(floorNumber, 10) || floor.floorNumber;
    }

    const updated = await prisma.floor.update({
      where: { id: params.id },
      data: updateData,
    });

    return { success: true, data: updated };
  })

  // Delete a floor (Admin or Contributor)
  .delete('/:id', async ({ headers, params, jwt, set }) => {
    const { user, error } = await authenticateUser(headers, jwt);
    if (error) {
      set.status = 401;
      return { success: false, error };
    }

    const floor = await prisma.floor.findUnique({
      where: { id: params.id },
      include: { site: true },
    });

    if (!floor) {
      set.status = 404;
      return { success: false, error: 'Floor not found' };
    }

    const { error: authError } = await authorizeOrgMember(user.id, floor.site.organizationId, 'CONTRIBUTOR');
    if (authError) {
      set.status = 403;
      return { success: false, error: authError };
    }

    await prisma.$transaction(async (tx) => {
      await tx.fingerprintRecording.deleteMany({ where: { floorId: params.id } });
      await tx.room.deleteMany({ where: { floorId: params.id } });
      await tx.floor.delete({ where: { id: params.id } });
    });

    return { success: true, message: 'Floor deleted successfully' };
  });
