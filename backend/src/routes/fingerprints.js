import { Elysia } from 'elysia';
import prisma from '../config/db.js';
import { authenticateUser, authorizeOrgMember } from '../middleware/auth.js';

export const fingerprintRoutes = new Elysia({ prefix: '/api/fingerprints' })
  // Batch or single save of fingerprint recordings from mobile collector
  .post('/record', async ({ headers, body, jwt, set }) => {
    const { user, error } = await authenticateUser(headers, jwt);
    if (error) {
      set.status = 401;
      return { success: false, error };
    }

    const { organizationId, siteId, floorId, roomId, samples } = body || {};

    if (!organizationId || !siteId || !floorId || !roomId) {
      set.status = 400;
      return {
        success: false,
        error: 'Missing required fields: organizationId, siteId, floorId, and roomId are all required',
      };
    }

    const { error: authError } = await authorizeOrgMember(user.id, organizationId, 'CONTRIBUTOR');
    if (authError) {
      set.status = 403;
      return { success: false, error: authError };
    }

    // Verify that roomId belongs to the correct floor/site/org
    const room = await prisma.room.findUnique({
      where: { id: roomId },
      include: {
        floor: {
          include: { site: true },
        },
      },
    });

    if (!room || room.floorId !== floorId || room.floor.siteId !== siteId) {
      set.status = 400;
      return { success: false, error: 'Room does not belong to the specified floor or site' };
    }

    const sampleList = Array.isArray(samples) ? samples : body.sample ? [body.sample] : [];
    if (sampleList.length === 0) {
      set.status = 400;
      return { success: false, error: 'No fingerprint samples provided' };
    }

    try {
      const recordsToInsert = sampleList.map((s) => {
        const wifi = s.wifiData || {};
        const mag = s.magData || {};
        const apsCount = Object.keys(wifi).length;

        return {
          organizationId,
          siteId,
          floorId,
          roomId,
          userId: user.id,
          timestamp: s.timestamp ? new Date(s.timestamp) : new Date(),
          magX: Number(mag.x) || 0,
          magY: Number(mag.y) || 0,
          magZ: Number(mag.z) || 0,
          magTotal: Number(mag.total) || 0,
          wifiData: wifi,
          apsCount,
        };
      });

      const created = await prisma.fingerprintRecording.createMany({
        data: recordsToInsert,
      });

      // Return updated room count
      const roomTotal = await prisma.fingerprintRecording.count({ where: { roomId } });

      return {
        success: true,
        data: {
          count: created.count,
          roomTotal,
          message: `Successfully saved ${created.count} sample(s)`,
        },
      };
    } catch (err) {
      console.error('Save fingerprint error:', err);
      set.status = 500;
      return { success: false, error: err.message || 'Failed to save fingerprints' };
    }
  })

  // Batch upload of fingerprints for a room
  .post('/batch', async ({ headers, body, jwt, set }) => {
    const { user, error } = await authenticateUser(headers, jwt);
    if (error) {
      set.status = 401;
      return { success: false, error };
    }

    const { roomId, samples } = body || {};
    if (!roomId || !Array.isArray(samples) || samples.length === 0) {
      set.status = 400;
      return { success: false, error: 'roomId and samples array required' };
    }

    const room = await prisma.room.findUnique({
      where: { id: roomId },
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

    const orgId = room.floor.site.organizationId;
    const { error: authError } = await authorizeOrgMember(user.id, orgId, 'CONTRIBUTOR');
    if (authError) {
      set.status = 403;
      return { success: false, error: authError };
    }

    try {
      const recordsToInsert = samples.map((s) => {
        const wifi = s.wifiData ? s.wifiData : s;
        const mag = s.magData || {};
        const apsCount = Object.keys(wifi).length;

        return {
          organizationId: orgId,
          siteId: room.floor.siteId,
          floorId: room.floorId,
          roomId,
          userId: user.id,
          timestamp: s.timestamp ? new Date(s.timestamp) : new Date(),
          magX: Number(mag.x) || 0,
          magY: Number(mag.y) || 0,
          magZ: Number(mag.z) || 0,
          magTotal: Number(mag.total) || 0,
          wifiData: wifi,
          apsCount,
        };
      });

      const created = await prisma.fingerprintRecording.createMany({
        data: recordsToInsert,
      });

      const roomTotal = await prisma.fingerprintRecording.count({ where: { roomId } });

      return {
        success: true,
        data: {
          count: created.count,
          roomTotal,
          message: `Successfully saved ${created.count} sample(s)`,
        },
      };
    } catch (err) {
      console.error('Batch save fingerprint error:', err);
      set.status = 500;
      return { success: false, error: err.message || 'Failed to batch save fingerprints' };
    }
  })

  // Bulk import and merge dataset into site/building
  .post('/import', async ({ headers, body, jwt, set }) => {
    const { user, error } = await authenticateUser(headers, jwt);
    if (error) {
      set.status = 401;
      return { success: false, error };
    }

    const { siteId, organizationId, records } = body || {};
    if (!siteId || !organizationId || !Array.isArray(records) || records.length === 0) {
      set.status = 400;
      return { success: false, error: 'siteId, organizationId, and non-empty records array are required' };
    }

    const { error: authError } = await authorizeOrgMember(user.id, organizationId, 'CONTRIBUTOR');
    if (authError) {
      set.status = 403;
      return { success: false, error: authError };
    }

    const site = await prisma.site.findFirst({
      where: { id: siteId, organizationId },
      include: {
        floors: {
          include: { rooms: true },
        },
      },
    });

    if (!site) {
      set.status = 404;
      return { success: false, error: 'Building not found' };
    }

    try {
      const floorMap = new Map();
      site.floors.forEach((f) => {
        floorMap.set(f.name.toLowerCase().trim(), f);
        floorMap.set(String(f.floorNumber), f);
      });

      const roomMap = new Map();
      site.floors.forEach((f) => {
        f.rooms.forEach((r) => {
          roomMap.set(`${f.id}:${r.name.toLowerCase().trim()}`, r);
        });
      });

      let maxFloorNum = site.floors.reduce((max, f) => Math.max(max, f.floorNumber || 1), 0);

      const resolvedRecords = [];

      for (const rec of records) {
        let rawFloorName = (rec.floorName || '').trim() || 'Floor 1';
        let rawRoomName = (rec.roomName || rec.location || '').trim() || 'Room 1';
        const wifi = rec.wifiData || {};
        const apsCount = Object.keys(wifi).length;

        let floor = floorMap.get(rawFloorName.toLowerCase());
        if (!floor) {
          const matchNum = rawFloorName.match(/\d+/);
          maxFloorNum++;
          const floorNumber = matchNum ? parseInt(matchNum[0], 10) : maxFloorNum;
          floor = await prisma.floor.create({
            data: {
              siteId,
              name: rawFloorName,
              floorNumber,
            },
          });
          floorMap.set(rawFloorName.toLowerCase(), floor);
          floorMap.set(String(floor.floorNumber), floor);
        }

        const roomKey = `${floor.id}:${rawRoomName.toLowerCase()}`;
        let room = roomMap.get(roomKey);
        if (!room) {
          room = await prisma.room.create({
            data: {
              floorId: floor.id,
              name: rawRoomName,
            },
          });
          roomMap.set(roomKey, room);
        }

        resolvedRecords.push({
          organizationId,
          siteId,
          floorId: floor.id,
          roomId: room.id,
          userId: user.id,
          timestamp: rec.timestamp ? new Date(rec.timestamp) : new Date(),
          magX: 0,
          magY: 0,
          magZ: 0,
          magTotal: 0,
          wifiData: wifi,
          apsCount,
        });
      }

      const created = await prisma.fingerprintRecording.createMany({
        data: resolvedRecords,
      });

      return {
        success: true,
        data: {
          importedCount: created.count,
          floorsCount: floorMap.size,
          roomsCount: roomMap.size,
        },
        message: `Successfully merged ${created.count} sample(s) into building dataset.`,
      };
    } catch (err) {
      console.error('Import dataset error:', err);
      set.status = 500;
      return { success: false, error: err.message || 'Failed to import dataset' };
    }
  })

  // Query fingerprint recordings for dataset review
  .get('/', async ({ headers, query, jwt, set }) => {
    const { user, error } = await authenticateUser(headers, jwt);
    if (error) {
      set.status = 401;
      return { success: false, error };
    }

    const { orgId, siteId, floorId, roomId, limit = '100', offset = '0' } = query;
    if (!orgId) {
      set.status = 400;
      return { success: false, error: 'orgId query parameter is required' };
    }

    const { error: authError } = await authorizeOrgMember(user.id, orgId, 'CONTRIBUTOR');
    if (authError) {
      set.status = 403;
      return { success: false, error: authError };
    }

    const where = { organizationId: orgId };
    if (siteId) where.siteId = siteId;
    if (floorId) where.floorId = floorId;
    if (roomId) where.roomId = roomId;

    const [total, recordings] = await Promise.all([
      prisma.fingerprintRecording.count({ where }),
      prisma.fingerprintRecording.findMany({
        where,
        include: {
          room: { select: { id: true, name: true } },
          floor: { select: { id: true, name: true, floorNumber: true } },
          site: { select: { id: true, name: true } },
          user: { select: { id: true, name: true, email: true } },
        },
        orderBy: { timestamp: 'desc' },
        take: Math.min(parseInt(limit, 10) || 100, 500),
        skip: parseInt(offset, 10) || 0,
      }),
    ]);

    return {
      success: true,
      data: {
        total,
        limit: parseInt(limit, 10),
        offset: parseInt(offset, 10),
        recordings,
      },
    };
  })

  // Dataset statistics for site / organization
  .get('/stats', async ({ headers, query, jwt, set }) => {
    const { user, error } = await authenticateUser(headers, jwt);
    if (error) {
      set.status = 401;
      return { success: false, error };
    }

    const { orgId, siteId } = query;
    if (!orgId) {
      set.status = 400;
      return { success: false, error: 'orgId query parameter is required' };
    }

    const { error: authError } = await authorizeOrgMember(user.id, orgId, 'CONTRIBUTOR');
    if (authError) {
      set.status = 403;
      return { success: false, error: authError };
    }

    const where = { organizationId: orgId };
    if (siteId) where.siteId = siteId;

    const recordings = await prisma.fingerprintRecording.findMany({
      where,
      select: {
        id: true,
        roomId: true,
        floorId: true,
        siteId: true,
        apsCount: true,
        wifiData: true,
        magTotal: true,
        room: { select: { id: true, name: true } },
        floor: { select: { id: true, name: true } },
      },
    });

    const totalSamples = recordings.length;
    const apSet = new Set();
    const roomCounts = {};
    const roomIds = {};
    const floorCounts = {};
    let totalApCount = 0;
    let totalMagFlux = 0;

    recordings.forEach((r) => {
      const roomName = r.room ? r.room.name : 'Unknown Room';
      roomCounts[roomName] = (roomCounts[roomName] || 0) + 1;
      roomIds[roomName] = r.roomId;

      const floorName = r.floor ? r.floor.name : 'Unknown Floor';
      floorCounts[floorName] = (floorCounts[floorName] || 0) + 1;

      totalApCount += r.apsCount;
      totalMagFlux += r.magTotal;

      if (r.wifiData && typeof r.wifiData === 'object') {
        Object.keys(r.wifiData).forEach((apKey) => {
          if (apKey && apKey.trim()) apSet.add(apKey.trim());
        });
      }
    });

    const avgApsPerSample = totalSamples > 0 ? (totalApCount / totalSamples).toFixed(1) : 0;
    const avgMagFlux = totalSamples > 0 ? (totalMagFlux / totalSamples).toFixed(1) : 0;

    return {
      success: true,
      data: {
        totalSamples,
        uniqueApsCount: apSet.size,
        avgApsPerSample: Number(avgApsPerSample),
        avgMagFlux: Number(avgMagFlux),
        roomDistribution: Object.entries(roomCounts).map(([name, count]) => ({
          name,
          roomId: roomIds[name],
          count,
          percentage: totalSamples > 0 ? ((count / totalSamples) * 100).toFixed(1) : 0,
        })),
        floorDistribution: Object.entries(floorCounts).map(([name, count]) => ({
          name,
          count,
        })),
      },
    };
  })

  // Get sample count for a specific room
  .get('/room-count/:roomId', async ({ headers, params, jwt, set }) => {
    const { user, error } = await authenticateUser(headers, jwt);
    if (error) {
      set.status = 401;
      return { success: false, error };
    }

    const room = await prisma.room.findUnique({
      where: { id: params.roomId },
      include: { floor: { include: { site: true } } },
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

    const count = await prisma.fingerprintRecording.count({
      where: { roomId: params.roomId },
    });

    return { success: true, data: { roomId: params.roomId, count } };
  })

  // Delete all recordings for a specific room
  .delete('/room/:roomId', async ({ headers, params, jwt, set }) => {
    const { user, error } = await authenticateUser(headers, jwt);
    if (error) {
      set.status = 401;
      return { success: false, error };
    }

    const room = await prisma.room.findUnique({
      where: { id: params.roomId },
      include: { floor: { include: { site: true } } },
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

    const result = await prisma.fingerprintRecording.deleteMany({
      where: { roomId: params.roomId },
    });

    return {
      success: true,
      data: { count: result.count },
      message: `Deleted ${result.count} sample(s) for room ${room.name}`,
    };
  })

  // Delete a single fingerprint recording
  .delete('/:id', async ({ headers, params, jwt, set }) => {
    const { user, error } = await authenticateUser(headers, jwt);
    if (error) {
      set.status = 401;
      return { success: false, error };
    }

    const rec = await prisma.fingerprintRecording.findUnique({
      where: { id: params.id },
    });
    if (!rec) {
      set.status = 404;
      return { success: false, error: 'Recording not found' };
    }

    const { error: authError } = await authorizeOrgMember(user.id, rec.organizationId, 'CONTRIBUTOR');
    if (authError) {
      set.status = 403;
      return { success: false, error: authError };
    }

    await prisma.fingerprintRecording.delete({ where: { id: params.id } });
    return { success: true, message: 'Sample deleted successfully' };
  })

  // Delete all recordings for a room, floor, or entire site/dataset
  .delete('/dataset/clear', async ({ headers, query, jwt, set }) => {
    const { user, error } = await authenticateUser(headers, jwt);
    if (error) {
      set.status = 401;
      return { success: false, error };
    }

    const { orgId, siteId, roomId, floorId } = query;
    if (!orgId) {
      set.status = 400;
      return { success: false, error: 'orgId is required' };
    }

    const { error: authError } = await authorizeOrgMember(user.id, orgId, 'CONTRIBUTOR');
    if (authError) {
      set.status = 403;
      return { success: false, error: authError };
    }

    const where = { organizationId: orgId };
    if (siteId) where.siteId = siteId;
    if (floorId) where.floorId = floorId;
    if (roomId) where.roomId = roomId;

    const result = await prisma.fingerprintRecording.deleteMany({ where });
    return {
      success: true,
      data: { count: result.count },
      message: `Deleted ${result.count} sample(s)`,
    };
  })

  // Edit/Update a single fingerprint recording (e.g. reassign room or fix values)
  .patch('/:id', async ({ headers, params, body, jwt, set }) => {
    const { user, error } = await authenticateUser(headers, jwt);
    if (error) {
      set.status = 401;
      return { success: false, error };
    }

    const rec = await prisma.fingerprintRecording.findUnique({
      where: { id: params.id },
    });
    if (!rec) {
      set.status = 404;
      return { success: false, error: 'Recording not found' };
    }

    const { error: authError } = await authorizeOrgMember(user.id, rec.organizationId, 'CONTRIBUTOR');
    if (authError) {
      set.status = 403;
      return { success: false, error: authError };
    }

    const { roomId, floorId, siteId, wifiData } = body || {};
    const updateData = {};
    if (roomId) updateData.roomId = roomId;
    if (floorId) updateData.floorId = floorId;
    if (siteId) updateData.siteId = siteId;
    if (wifiData) {
      updateData.wifiData = wifiData;
      updateData.apsCount = Object.keys(wifiData).length;
    }

    const updated = await prisma.fingerprintRecording.update({
      where: { id: params.id },
      data: updateData,
    });

    return { success: true, data: updated, message: 'Record updated successfully' };
  });
