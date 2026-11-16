import { Elysia } from 'elysia';
import prisma from '../config/db.js';
import { authenticateUser, authorizeOrgMember } from '../middleware/auth.js';

export const roomRoutes = new Elysia({ prefix: '/api/rooms' })
  // List rooms for a floor
  .get('/', async ({ headers, query, jwt, set }) => {
    const { user, error } = await authenticateUser(headers, jwt);
    if (error) {
      set.status = 401;
      return { success: false, error };
    }

    const floorId = query.floorId;
    if (!floorId) {
      set.status = 400;
      return { success: false, error: 'floorId query parameter is required' };
    }

    const floor = await prisma.floor.findUnique({
      where: { id: floorId },
      include: { site: true },
    });

    if (!floor) {
      set.status = 404;
      return { success: false, error: 'Floor not found' };
    }

    const { error: authError } = await authorizeOrgMember(user.id, floor.site.organizationId);
    if (authError) {
      set.status = 403;
      return { success: false, error: authError };
    }

    const rooms = await prisma.room.findMany({
      where: { floorId },
      include: {
        _count: {
          select: { recordings: true },
        },
      },
      orderBy: { name: 'asc' },
    });

    return { success: true, data: rooms };
  })

  // Create a room (Admin only)
  .post('/', async ({ headers, body, jwt, set }) => {
    const { user, error } = await authenticateUser(headers, jwt);
    if (error) {
      set.status = 401;
      return { success: false, error };
    }

    const { floorId, name, code, description } = body || {};
    if (!floorId || !name || !name.trim()) {
      set.status = 400;
      return { success: false, error: 'floorId and name are required' };
    }

    const floor = await prisma.floor.findUnique({
      where: { id: floorId },
      include: { site: true },
    });

    if (!floor) {
      set.status = 404;
      return { success: false, error: 'Floor not found' };
    }

    const { error: authError } = await authorizeOrgMember(user.id, floor.site.organizationId, 'ADMIN');
    if (authError) {
      set.status = 403;
      return { success: false, error: authError };
    }

    const room = await prisma.room.create({
      data: {
        floorId,
        name: name.trim(),
        code: code ? code.trim() : null,
        description: description ? description.trim() : null,
      },
    });

    return { success: true, data: room };
  })

  // Update a room (Admin or Contributor)
  .patch('/:id', async ({ headers, params, body, jwt, set }) => {
    const { user, error } = await authenticateUser(headers, jwt);
    if (error) {
      set.status = 401;
      return { success: false, error };
    }

    const room = await prisma.room.findUnique({
      where: { id: params.id },
      include: {
        floor: {
          include: { site: true },
        },
      },
    });

    if (!room) {
      set.status = 404;
      return { success: false, error: 'Room not found' };
    }

    const { error: authError } = await authorizeOrgMember(user.id, room.floor.site.organizationId, 'CONTRIBUTOR');
    if (authError) {
      set.status = 403;
      return { success: false, error: authError };
    }

    const { name, code, description } = body || {};
    const updateData = {};
    if (name && name.trim()) updateData.name = name.trim();
    if (code !== undefined) updateData.code = code ? code.trim() : null;
    if (description !== undefined) updateData.description = description ? description.trim() : null;

    const updated = await prisma.room.update({
      where: { id: params.id },
      data: updateData,
    });

    return { success: true, data: updated };
  })

  // Delete a room (Admin or Contributor)
  .delete('/:id', async ({ headers, params, jwt, set }) => {
    const { user, error } = await authenticateUser(headers, jwt);
    if (error) {
      set.status = 401;
      return { success: false, error };
    }

    const room = await prisma.room.findUnique({
      where: { id: params.id },
      include: {
        floor: {
          include: { site: true },
        },
      },
    });

    if (!room) {
      set.status = 404;
      return { success: false, error: 'Room not found' };
    }

    const { error: authError } = await authorizeOrgMember(user.id, room.floor.site.organizationId, 'CONTRIBUTOR');
    if (authError) {
      set.status = 403;
      return { success: false, error: authError };
    }

    await prisma.$transaction(async (tx) => {
      await tx.fingerprintRecording.deleteMany({ where: { roomId: params.id } });
      await tx.room.delete({ where: { id: params.id } });
    });

    return { success: true, message: 'Room deleted successfully' };
  });
