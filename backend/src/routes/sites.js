import { Elysia } from 'elysia';
import prisma from '../config/db.js';
import { authenticateUser, authorizeOrgMember } from '../middleware/auth.js';

export const siteRoutes = new Elysia({ prefix: '/api/sites' })
  // List all sites for an organization
  .get('/', async ({ headers, query, jwt, set }) => {
    const { user, error } = await authenticateUser(headers, jwt);
    if (error) {
      set.status = 401;
      return { success: false, error };
    }

    const orgId = query.orgId;
    if (!orgId) {
      set.status = 400;
      return { success: false, error: 'orgId query parameter is required' };
    }

    const { error: authError } = await authorizeOrgMember(user.id, orgId);
    if (authError) {
      set.status = 403;
      return { success: false, error: authError };
    }

    const sites = await prisma.site.findMany({
      where: { organizationId: orgId },
      include: {
        floors: {
          include: {
            rooms: true,
          },
        },
        modelVersions: {
          where: { isActive: true },
          take: 1,
        },
        _count: {
          select: {
            floors: true,
            recordings: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const data = sites.map((s) => {
      const totalRooms = s.floors.reduce((acc, f) => acc + f.rooms.length, 0);
      return {
        id: s.id,
        name: s.name,
        description: s.description,
        address: s.address,
        organizationId: s.organizationId,
        createdAt: s.createdAt,
        floorCount: s._count.floors,
        roomCount: totalRooms,
        recordingCount: s._count.recordings,
        activeModel: s.modelVersions[0] || null,
        floors: s.floors || [],
      };
    });

    return { success: true, data };
  })

  // Get single site details with nested floors and rooms
  .get('/:id', async ({ headers, params, jwt, set }) => {
    const { user, error } = await authenticateUser(headers, jwt);
    if (error) {
      set.status = 401;
      return { success: false, error };
    }

    const site = await prisma.site.findUnique({
      where: { id: params.id },
      include: {
        floors: {
          orderBy: { floorNumber: 'asc' },
          include: {
            rooms: {
              orderBy: { name: 'asc' },
              include: {
                _count: {
                  select: { recordings: true },
                },
              },
            },
          },
        },
        modelVersions: {
          orderBy: { createdAt: 'desc' },
        },
        _count: {
          select: { recordings: true },
        },
      },
    });

    if (!site) {
      set.status = 404;
      return { success: false, error: 'Site not found' };
    }

    const { error: authError } = await authorizeOrgMember(user.id, site.organizationId);
    if (authError) {
      set.status = 403;
      return { success: false, error: authError };
    }

    return { success: true, data: site };
  })

  // Create a new Site (Admin or Contributor)
  .post('/', async ({ headers, body, jwt, set }) => {
    const { user, error } = await authenticateUser(headers, jwt);
    if (error) {
      set.status = 401;
      return { success: false, error };
    }

    const { organizationId, name, description, address } = body || {};
    if (!organizationId || !name || !name.trim()) {
      set.status = 400;
      return { success: false, error: 'organizationId and name are required' };
    }

    const { error: authError } = await authorizeOrgMember(user.id, organizationId, 'CONTRIBUTOR');
    if (authError) {
      set.status = 403;
      return { success: false, error: authError };
    }

    const site = await prisma.site.create({
      data: {
        organizationId,
        name: name.trim(),
        description: description ? description.trim() : null,
        address: address ? address.trim() : null,
      },
    });

    return { success: true, data: site };
  })

  // Update Site (Admin or Contributor)
  .patch('/:id', async ({ headers, params, body, jwt, set }) => {
    const { user, error } = await authenticateUser(headers, jwt);
    if (error) {
      set.status = 401;
      return { success: false, error };
    }

    const site = await prisma.site.findUnique({ where: { id: params.id } });
    if (!site) {
      set.status = 404;
      return { success: false, error: 'Site not found' };
    }

    const { error: authError } = await authorizeOrgMember(user.id, site.organizationId, 'CONTRIBUTOR');
    if (authError) {
      set.status = 403;
      return { success: false, error: authError };
    }

    const { name, description, address } = body || {};
    const updateData = {};
    if (name && name.trim()) updateData.name = name.trim();
    if (description !== undefined) updateData.description = description ? description.trim() : null;
    if (address !== undefined) updateData.address = address ? address.trim() : null;

    const updated = await prisma.site.update({
      where: { id: params.id },
      data: updateData,
    });

    return { success: true, data: updated };
  })

  // Delete Site (Admin or Contributor)
  .delete('/:id', async ({ headers, params, jwt, set }) => {
    const { user, error } = await authenticateUser(headers, jwt);
    if (error) {
      set.status = 401;
      return { success: false, error };
    }

    const site = await prisma.site.findUnique({ where: { id: params.id } });
    if (!site) {
      set.status = 404;
      return { success: false, error: 'Site not found' };
    }

    const { error: authError } = await authorizeOrgMember(user.id, site.organizationId, 'CONTRIBUTOR');
    if (authError) {
      set.status = 403;
      return { success: false, error: authError };
    }

    await prisma.$transaction(async (tx) => {
      await tx.fingerprintRecording.deleteMany({ where: { siteId: params.id } });
      await tx.modelVersion.deleteMany({ where: { siteId: params.id } });
      await tx.trainingJob.deleteMany({ where: { siteId: params.id } });
      await tx.room.deleteMany({ where: { floor: { siteId: params.id } } });
      await tx.floor.deleteMany({ where: { siteId: params.id } });
      await tx.site.delete({ where: { id: params.id } });
    });

    return { success: true, message: 'Site deleted successfully' };
  });
